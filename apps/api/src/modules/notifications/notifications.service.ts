import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { NotificationType, Prisma, TenantRole } from '@prisma/client';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';

export interface NotifyPayload {
  type: NotificationType | keyof typeof NotificationType;
  title: string;
  titleAr?: string;
  body: string;
  bodyAr?: string;
  data?: Record<string, unknown>;
  /** When set, an identical unread notification is not created twice. */
  dedupeKey?: string;
  email?: boolean;
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('notifications') private readonly queue: Queue,
  ) {}

  /**
   * Notify all owner/manager-level users of a tenant.
   */
  async notifyTenant(tenantId: string, payload: NotifyPayload): Promise<void> {
    const recipients = await this.prisma.user.findMany({
      where: {
        tenantId,
        isActive: true,
        tenantRole: { in: [TenantRole.OWNER, TenantRole.BRANCH_MANAGER, TenantRole.ACCOUNTANT] },
      },
      select: { id: true, email: true },
    });
    for (const user of recipients) {
      await this.notifyUser(user.id, tenantId, payload, user.email);
    }
  }

  async notifyUser(
    userId: string,
    tenantId: string | null,
    payload: NotifyPayload,
    email?: string,
  ): Promise<void> {
    if (payload.dedupeKey) {
      const existing = await this.prisma.notification.findFirst({
        where: {
          userId,
          readAt: null,
          data: { path: ['dedupeKey'], equals: payload.dedupeKey },
        },
      });
      if (existing) return;
    }

    await this.prisma.notification.create({
      data: {
        tenantId,
        userId,
        type: payload.type as NotificationType,
        title: payload.title,
        titleAr: payload.titleAr ?? null,
        body: payload.body,
        bodyAr: payload.bodyAr ?? null,
        data: {
          ...(payload.data ?? {}),
          ...(payload.dedupeKey ? { dedupeKey: payload.dedupeKey } : {}),
        } as Prisma.InputJsonValue,
      },
    });

    if (payload.email !== false && email) {
      await this.queue.add(
        'send-email',
        {
          to: email,
          subject: payload.title,
          html: `<div style="font-family:sans-serif"><h2>${payload.title}</h2><p>${payload.body}</p></div>`,
        },
        { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: true },
      );
    }
  }

  list(userId: string, unreadOnly = false) {
    return this.prisma.notification.findMany({
      where: { userId, ...(unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async unreadCount(userId: string): Promise<{ count: number }> {
    const count = await this.prisma.notification.count({
      where: { userId, readAt: null },
    });
    return { count };
  }

  async markRead(userId: string, id: string) {
    return this.prisma.notification.updateMany({
      where: { id, userId },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }
}
