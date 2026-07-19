import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import { PlatformRole } from '@prisma/client';
import { Permission } from './permissions';
import { AuthenticatedUser } from './types';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const PERMISSIONS_KEY = 'requiredPermissions';
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

export const PLATFORM_ROLES_KEY = 'platformRoles';
export const RequirePlatformRoles = (...roles: PlatformRole[]) =>
  SetMetadata(PLATFORM_ROLES_KEY, roles);

export const SKIP_SUBSCRIPTION_KEY = 'skipSubscriptionCheck';
export const SkipSubscriptionCheck = () =>
  SetMetadata(SKIP_SUBSCRIPTION_KEY, true);

export const AUDIT_KEY = 'auditAction';
export interface AuditMeta {
  action: string;
  resource: string;
}
export const Audited = (action: string, resource: string) =>
  SetMetadata(AUDIT_KEY, { action, resource } satisfies AuditMeta);

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user as AuthenticatedUser;
  },
);

export const TenantId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;
    if (!user?.tenantId) {
      throw new Error('Tenant context is missing for the current request');
    }
    return user.tenantId;
  },
);
