import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PlatformRole } from '@prisma/client';
import {
  IS_PUBLIC_KEY,
  PERMISSIONS_KEY,
  PLATFORM_ROLES_KEY,
} from '../decorators';
import { Permission } from '../permissions';
import { AuthenticatedUser } from '../types';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;
    if (!user) {
      return false;
    }

    const requiredPlatformRoles = this.reflector.getAllAndOverride<
      PlatformRole[] | undefined
    >(PLATFORM_ROLES_KEY, [context.getHandler(), context.getClass()]);
    if (requiredPlatformRoles && requiredPlatformRoles.length > 0) {
      if (!user.platformRole || !requiredPlatformRoles.includes(user.platformRole)) {
        throw new ForbiddenException('Platform role required');
      }
      return true;
    }

    const requiredPermissions = this.reflector.getAllAndOverride<
      Permission[] | undefined
    >(PERMISSIONS_KEY, [context.getHandler(), context.getClass()]);
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    // Platform staff can access tenant resources for support purposes.
    if (user.platformRole) {
      return true;
    }

    const missing = requiredPermissions.filter(
      (permission) => !user.permissions.includes(permission),
    );
    if (missing.length > 0) {
      throw new ForbiddenException(
        `Missing required permissions: ${missing.join(', ')}`,
      );
    }
    return true;
  }
}
