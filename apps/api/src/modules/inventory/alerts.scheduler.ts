import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * Daily scan that notifies each tenant about low-stock and expiring
 * medicines. Deduplicated per medicine per day via dedupeKey.
 */
@Injectable()
export class AlertsScheduler {
  private readonly logger = new Logger(AlertsScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_6AM)
  async scan(): Promise<void> {
    const tenants = await this.prisma.tenant.findMany({
      where: { status: { in: ['ACTIVE', 'TRIAL'] } },
      select: { id: true, settings: { select: { nearExpiryDays: true } } },
    });
    const today = new Date().toISOString().slice(0, 10);

    for (const tenant of tenants) {
      try {
        const nearExpiryDays = tenant.settings?.nearExpiryDays ?? 90;
        const now = new Date();
        const nearDate = new Date(
          now.getTime() + nearExpiryDays * 24 * 60 * 60 * 1000,
        );

        const medicines = await this.prisma.medicine.findMany({
          where: { tenantId: tenant.id, status: 'ACTIVE' },
          select: {
            id: true,
            name: true,
            nameAr: true,
            minStock: true,
            batches: {
              select: {
                expiryDate: true,
                stockItems: { select: { quantity: true } },
              },
            },
          },
        });

        const lowStock: string[] = [];
        const expiring: string[] = [];
        for (const medicine of medicines) {
          let usable = 0;
          let hasExpiring = false;
          for (const batch of medicine.batches) {
            const qty = batch.stockItems.reduce((sum, s) => sum + s.quantity, 0);
            if (qty <= 0) continue;
            if (batch.expiryDate > now) {
              usable += qty;
              if (batch.expiryDate <= nearDate) hasExpiring = true;
            }
          }
          if (usable <= medicine.minStock) lowStock.push(medicine.name);
          if (hasExpiring) expiring.push(medicine.name);
        }

        if (lowStock.length > 0) {
          await this.notifications.notifyTenant(tenant.id, {
            type: 'LOW_STOCK',
            title: `${lowStock.length} medicines are low on stock`,
            titleAr: `${lowStock.length} أدوية منخفضة المخزون`,
            body: `Low stock: ${lowStock.slice(0, 10).join(', ')}${lowStock.length > 10 ? '…' : ''}`,
            bodyAr: `مخزون منخفض: ${lowStock.slice(0, 10).join('، ')}${lowStock.length > 10 ? '…' : ''}`,
            dedupeKey: `low-stock-${tenant.id}-${today}`,
          });
        }
        if (expiring.length > 0) {
          await this.notifications.notifyTenant(tenant.id, {
            type: 'EXPIRY',
            title: `${expiring.length} medicines are close to expiry`,
            titleAr: `${expiring.length} أدوية قاربت على انتهاء الصلاحية`,
            body: `Near expiry: ${expiring.slice(0, 10).join(', ')}${expiring.length > 10 ? '…' : ''}`,
            bodyAr: `قرب انتهاء الصلاحية: ${expiring.slice(0, 10).join('، ')}${expiring.length > 10 ? '…' : ''}`,
            dedupeKey: `expiry-${tenant.id}-${today}`,
          });
        }
      } catch (error) {
        this.logger.error(
          `Alert scan failed for tenant ${tenant.id}`,
          error as Error,
        );
      }
    }
  }
}
