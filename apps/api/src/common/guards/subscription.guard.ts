import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SubscriptionStatus, TenantStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { IS_PUBLIC_KEY, SKIP_SUBSCRIPTION_KEY } from '../decorators';
import { AuthenticatedUser } from '../types';

/**
 * Blocks tenant users whose tenant is suspended/cancelled or whose
 * subscription has expired. Billing endpoints opt out via
 * @SkipSubscriptionCheck so tenants can always renew.
 */
@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const skip =
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ||
      this.reflector.getAllAndOverride<boolean>(SKIP_SUBSCRIPTION_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
    if (skip) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;
    if (!user || user.platformRole || !user.tenantId) {
      return true;
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: {
        status: true,
        subscriptions: {
          where: {
            status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] },
            endsAt: { gte: new Date() },
          },
          take: 1,
        },
      },
    });

    if (!tenant) {
      throw new ForbiddenException('Tenant not found');
    }
    if (
      tenant.status === TenantStatus.SUSPENDED ||
      tenant.status === TenantStatus.CANCELLED
    ) {
      throw new ForbiddenException('SUBSCRIPTION_SUSPENDED');
    }
    if (tenant.subscriptions.length === 0) {
      throw new ForbiddenException('SUBSCRIPTION_EXPIRED');
    }
    return true;
  }
}
