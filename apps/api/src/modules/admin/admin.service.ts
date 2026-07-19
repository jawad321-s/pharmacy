import { Injectable, NotFoundException } from '@nestjs/common';
import {
  BillingInvoiceStatus,
  Prisma,
  SubscriptionStatus,
  TenantStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { paginate } from '../../common/types';
import { round2, toNumber } from '../../common/utils/numbers';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Super admin platform dashboard: tenants, revenue, churn, usage.
   */
  async platformDashboard() {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const [
      totalTenants,
      activeTenants,
      trialTenants,
      suspendedTenants,
      monthRevenueAgg,
      cancelledThisMonth,
      activeAtMonthStart,
      subscriptionsByStatus,
      recentTenants,
      usage,
    ] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.tenant.count({ where: { status: TenantStatus.ACTIVE } }),
      this.prisma.tenant.count({ where: { status: TenantStatus.TRIAL } }),
      this.prisma.tenant.count({ where: { status: TenantStatus.SUSPENDED } }),
      this.prisma.billingPayment.aggregate({
        where: { paidAt: { gte: monthStart } },
        _sum: { amount: true },
      }),
      this.prisma.subscription.count({
        where: {
          status: SubscriptionStatus.CANCELLED,
          cancelledAt: { gte: monthStart },
        },
      }),
      this.prisma.subscription.count({
        where: {
          startsAt: { lt: monthStart },
          endsAt: { gte: prevMonthStart },
          status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] },
        },
      }),
      this.prisma.subscription.groupBy({
        by: ['status'],
        _count: true,
      }),
      this.prisma.tenant.findMany({
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: {
          id: true,
          name: true,
          subdomain: true,
          status: true,
          createdAt: true,
          plan: { select: { name: true } },
        },
      }),
      Promise.all([
        this.prisma.user.count({ where: { tenantId: { not: null } } }),
        this.prisma.sale.count(),
        this.prisma.medicine.count(),
      ]),
    ]);

    const churnRate =
      activeAtMonthStart > 0
        ? round2((cancelledThisMonth / activeAtMonthStart) * 100)
        : 0;

    return {
      totalTenants,
      activeTenants,
      trialTenants,
      suspendedTenants,
      monthlyRevenue: toNumber(monthRevenueAgg._sum.amount),
      churnRate,
      subscriptionsByStatus: subscriptionsByStatus.map((row) => ({
        status: row.status,
        count: row._count,
      })),
      recentTenants,
      platformUsage: {
        totalUsers: usage[0],
        totalSales: usage[1],
        totalProducts: usage[2],
      },
    };
  }

  async listTenants(query: PaginationQueryDto & { status?: TenantStatus }) {
    const where: Prisma.TenantWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { subdomain: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.tenant.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.pageSize,
        include: {
          plan: { select: { name: true, slug: true } },
          _count: { select: { users: true, branches: true, sales: true } },
          subscriptions: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { status: true, endsAt: true },
          },
        },
      }),
      this.prisma.tenant.count({ where }),
    ]);
    return paginate(data, total, query.page, query.pageSize);
  }

  async getTenant(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        plan: true,
        settings: true,
        subscriptions: { orderBy: { createdAt: 'desc' }, include: { plan: true } },
        billingInvoices: { orderBy: { createdAt: 'desc' }, take: 20 },
        _count: {
          select: { users: true, branches: true, medicines: true, sales: true },
        },
      },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  async setTenantStatus(id: string, status: TenantStatus) {
    await this.getTenant(id);
    return this.prisma.tenant.update({ where: { id }, data: { status } });
  }

  listPendingInvoices() {
    return this.prisma.billingInvoice.findMany({
      where: { status: BillingInvoiceStatus.PENDING },
      orderBy: { dueDate: 'asc' },
      include: { tenant: { select: { name: true, subdomain: true } } },
    });
  }
}
