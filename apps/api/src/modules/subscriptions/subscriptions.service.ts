import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BillingCycle,
  BillingInvoiceStatus,
  PaymentMethod,
  SubscriptionStatus,
  TenantStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { toNumber } from '../../common/utils/numbers';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
  ) {}

  listPlans() {
    return this.prisma.plan.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async startTrial(tenantId: string, planId: string, cycle: BillingCycle) {
    const trialDays = Number(this.config.get('TRIAL_DAYS', 14));
    const now = new Date();
    const endsAt = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);
    return this.prisma.subscription.create({
      data: {
        tenantId,
        planId,
        status: SubscriptionStatus.TRIALING,
        billingCycle: cycle,
        startsAt: now,
        endsAt,
        trialEndsAt: endsAt,
      },
    });
  }

  async currentForTenant(tenantId: string) {
    const subscription = await this.prisma.subscription.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      include: { plan: true },
    });
    if (!subscription) {
      throw new NotFoundException('No subscription found');
    }
    const usage = await this.usage(tenantId);
    return { subscription, usage };
  }

  async usage(tenantId: string) {
    const [branches, users, products] = await Promise.all([
      this.prisma.branch.count({ where: { tenantId } }),
      this.prisma.user.count({ where: { tenantId } }),
      this.prisma.medicine.count({ where: { tenantId } }),
    ]);
    return { branches, users, products };
  }

  /**
   * Subscribe / renew: creates a pending billing invoice for the selected
   * plan and cycle. The subscription activates when the invoice is paid.
   */
  async subscribe(tenantId: string, planSlug: string, cycle: BillingCycle) {
    const plan = await this.prisma.plan.findUnique({
      where: { slug: planSlug },
    });
    if (!plan || !plan.isActive) {
      throw new BadRequestException('Unknown plan');
    }
    const amount =
      cycle === BillingCycle.YEARLY
        ? toNumber(plan.priceYearly)
        : toNumber(plan.priceMonthly);

    const count = await this.prisma.billingInvoice.count();
    const number = `SUB-${new Date().getFullYear()}-${String(count + 1).padStart(6, '0')}`;

    const current = await this.prisma.subscription.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });

    const subscription = await this.prisma.subscription.create({
      data: {
        tenantId,
        planId: plan.id,
        status: SubscriptionStatus.PAST_DUE,
        billingCycle: cycle,
        startsAt:
          current && current.endsAt > new Date() ? current.endsAt : new Date(),
        endsAt:
          current && current.endsAt > new Date() ? current.endsAt : new Date(),
      },
    });

    const invoice = await this.prisma.billingInvoice.create({
      data: {
        tenantId,
        subscriptionId: subscription.id,
        number,
        description: `${plan.name} plan — ${cycle.toLowerCase()} billing`,
        amount,
        status: BillingInvoiceStatus.PENDING,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    await this.notifications.notifyTenant(tenantId, {
      type: 'NEW_INVOICE',
      title: 'New subscription invoice',
      titleAr: 'فاتورة اشتراك جديدة',
      body: `Invoice ${invoice.number} for ${plan.name} plan (${amount}) is awaiting payment.`,
      bodyAr: `فاتورة ${invoice.number} لخطة ${plan.nameAr} (${amount}) بانتظار الدفع.`,
      data: { invoiceId: invoice.id },
    });

    return { subscription, invoice };
  }

  /**
   * Records a payment against a billing invoice and activates the
   * subscription period. In production this is called from the payment
   * provider webhook or by a platform admin for offline payments.
   */
  async payInvoice(
    tenantId: string,
    invoiceId: string,
    method: PaymentMethod,
    reference?: string,
  ) {
    const invoice = await this.prisma.billingInvoice.findFirst({
      where: { id: invoiceId, tenantId },
      include: { subscription: { include: { plan: true } } },
    });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }
    if (invoice.status === BillingInvoiceStatus.PAID) {
      throw new BadRequestException('Invoice is already paid');
    }

    const cycleDays =
      invoice.subscription.billingCycle === BillingCycle.YEARLY ? 365 : 30;
    const baseStart =
      invoice.subscription.startsAt > new Date()
        ? invoice.subscription.startsAt
        : new Date();
    const endsAt = new Date(
      baseStart.getTime() + cycleDays * 24 * 60 * 60 * 1000,
    );

    const [payment] = await this.prisma.$transaction([
      this.prisma.billingPayment.create({
        data: {
          tenantId,
          invoiceId,
          amount: invoice.amount,
          method,
          reference: reference ?? null,
        },
      }),
      this.prisma.billingInvoice.update({
        where: { id: invoiceId },
        data: { status: BillingInvoiceStatus.PAID, paidAt: new Date() },
      }),
      this.prisma.subscription.update({
        where: { id: invoice.subscriptionId },
        data: {
          status: SubscriptionStatus.ACTIVE,
          startsAt: baseStart,
          endsAt,
        },
      }),
      this.prisma.tenant.update({
        where: { id: tenantId },
        data: {
          status: TenantStatus.ACTIVE,
          subscriptionPlanId: invoice.subscription.planId,
        },
      }),
    ]);

    return { payment, endsAt };
  }

  billingHistory(tenantId: string) {
    return this.prisma.billingInvoice.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      include: {
        payments: true,
        subscription: { include: { plan: { select: { name: true, slug: true } } } },
      },
    });
  }

  /**
   * Daily job: expires ended subscriptions, downgrades tenants and warns
   * tenants whose subscription ends within 7 days.
   */
  async processExpirations(): Promise<{ expired: number; warned: number }> {
    const now = new Date();
    const inSevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const ending = await this.prisma.subscription.findMany({
      where: {
        status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] },
        endsAt: { gte: now, lte: inSevenDays },
      },
      include: { tenant: { select: { id: true, name: true } } },
    });
    for (const sub of ending) {
      await this.notifications.notifyTenant(sub.tenantId, {
        type: 'SUBSCRIPTION_EXPIRING',
        title: 'Subscription expiring soon',
        titleAr: 'الاشتراك على وشك الانتهاء',
        body: `Your subscription ends on ${sub.endsAt.toISOString().slice(0, 10)}. Renew to avoid interruption.`,
        bodyAr: `ينتهي اشتراكك في ${sub.endsAt.toISOString().slice(0, 10)}. جدّد الاشتراك لتجنب توقف الخدمة.`,
        data: { subscriptionId: sub.id },
        dedupeKey: `sub-expiring-${sub.id}-${sub.endsAt.toISOString().slice(0, 10)}`,
      });
    }

    const expired = await this.prisma.subscription.findMany({
      where: {
        status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] },
        endsAt: { lt: now },
      },
    });
    for (const sub of expired) {
      await this.prisma.$transaction([
        this.prisma.subscription.update({
          where: { id: sub.id },
          data: { status: SubscriptionStatus.EXPIRED },
        }),
        this.prisma.tenant.update({
          where: { id: sub.tenantId },
          data: { status: TenantStatus.SUSPENDED },
        }),
      ]);
      this.logger.warn(`Subscription ${sub.id} expired; tenant ${sub.tenantId} suspended`);
    }

    return { expired: expired.length, warned: ending.length };
  }
}
