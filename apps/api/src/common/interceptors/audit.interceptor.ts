import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AUDIT_KEY, AuditMeta } from '../decorators';
import { AuthenticatedUser } from '../types';

const REDACTED_FIELDS = ['password', 'passwordHash', 'currentPassword', 'newPassword', 'refreshToken'];

function sanitize(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  try {
    const clone = JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
    if (clone && typeof clone === 'object' && !Array.isArray(clone)) {
      for (const field of REDACTED_FIELDS) {
        if (field in clone) clone[field] = '[REDACTED]';
      }
    }
    return clone as Prisma.InputJsonValue;
  } catch {
    return undefined;
  }
}

/**
 * Writes an audit log entry for every handler decorated with @Audited().
 * The handler result (or its `audit` property when present) is stored as
 * the new value; request body is stored alongside for traceability.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.get<AuditMeta | undefined>(
      AUDIT_KEY,
      context.getHandler(),
    );
    if (!meta) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;
    const ip =
      (request.headers['x-forwarded-for'] as string | undefined)
        ?.split(',')[0]
        ?.trim() ?? request.ip;

    return next.handle().pipe(
      tap((result) => {
        const resourceId =
          (result && typeof result === 'object' && 'id' in result
            ? String((result as { id: unknown }).id)
            : undefined) ?? request.params?.id;

        const oldValue =
          result && typeof result === 'object' && '__auditOld' in result
            ? sanitize((result as Record<string, unknown>).__auditOld)
            : undefined;

        void this.prisma.auditLog
          .create({
            data: {
              tenantId: user?.tenantId ?? null,
              userId: user?.id ?? null,
              action: meta.action,
              resource: meta.resource,
              resourceId: resourceId ?? null,
              oldValue,
              newValue: sanitize(request.body),
              ip: ip ?? null,
            },
          })
          .catch(() => undefined);
      }),
    );
  }
}
