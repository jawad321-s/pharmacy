import { PlatformRole, TenantRole } from '@prisma/client';
import { Permission } from './permissions';

export interface JwtPayload {
  sub: string;
  email: string;
  tenantId: string | null;
  tenantRole: TenantRole | null;
  platformRole: PlatformRole | null;
  type: 'access' | 'refresh';
  jti?: string;
  iat?: number;
  exp?: number;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  tenantId: string | null;
  tenantRole: TenantRole | null;
  platformRole: PlatformRole | null;
  branchId: string | null;
  permissions: Permission[];
}

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    pageSize: number;
    pageCount: number;
  };
}

export function paginate<T>(
  data: T[],
  total: number,
  page: number,
  pageSize: number,
): PaginatedResult<T> {
  return {
    data,
    meta: {
      total,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    },
  };
}
