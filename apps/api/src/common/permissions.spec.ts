import { PlatformRole, TenantRole } from '@prisma/client';
import {
  PERMISSIONS,
  permissionsForUser,
  TENANT_ROLE_PERMISSIONS,
} from './permissions';

describe('RBAC permission matrix', () => {
  it('grants owners every permission', () => {
    const owner = TENANT_ROLE_PERMISSIONS[TenantRole.OWNER];
    for (const permission of Object.values(PERMISSIONS)) {
      expect(owner).toContain(permission);
    }
  });

  it('restricts cashiers to POS-related permissions', () => {
    const cashier = TENANT_ROLE_PERMISSIONS[TenantRole.CASHIER];
    expect(cashier).toContain(PERMISSIONS.POS_ACCESS);
    expect(cashier).toContain(PERMISSIONS.SALES_CREATE);
    expect(cashier).not.toContain(PERMISSIONS.USERS_MANAGE);
    expect(cashier).not.toContain(PERMISSIONS.SETTINGS_MANAGE);
    expect(cashier).not.toContain(PERMISSIONS.ACCOUNTING_MANAGE);
  });

  it('gives accountants accounting but not inventory mutation rights', () => {
    const accountant = TENANT_ROLE_PERMISSIONS[TenantRole.ACCOUNTANT];
    expect(accountant).toContain(PERMISSIONS.ACCOUNTING_MANAGE);
    expect(accountant).not.toContain(PERMISSIONS.INVENTORY_ADJUST);
  });

  it('resolves platform users to the full permission set', () => {
    const permissions = permissionsForUser({
      platformRole: PlatformRole.SUPER_ADMIN,
      tenantRole: null,
    });
    expect(permissions).toContain(PERMISSIONS.USERS_MANAGE);
  });

  it('returns no permissions for users without any role', () => {
    expect(
      permissionsForUser({ platformRole: null, tenantRole: null }),
    ).toEqual([]);
  });
});
