import { ForbiddenException } from '@nestjs/common';
import { PlanLimitsService } from './plan-limits.service';
import { PrismaService } from '../../prisma/prisma.service';

function buildPrisma(plan: {
  maxBranches: number;
  maxUsers: number;
  maxProducts: number;
}, counts: { branches: number; users: number; products: number }) {
  return {
    tenant: {
      findUniqueOrThrow: jest.fn(async () => ({ plan })),
    },
    branch: { count: jest.fn(async () => counts.branches) },
    user: { count: jest.fn(async () => counts.users) },
    medicine: { count: jest.fn(async () => counts.products) },
  } as unknown as PrismaService;
}

describe('PlanLimitsService', () => {
  const starter = { maxBranches: 1, maxUsers: 3, maxProducts: 1000 };
  const enterprise = { maxBranches: -1, maxUsers: -1, maxProducts: -1 };

  it('blocks adding a branch beyond the plan limit', async () => {
    const service = new PlanLimitsService(
      buildPrisma(starter, { branches: 1, users: 1, products: 0 }),
    );
    await expect(service.assertCanAddBranch('t1')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('allows adding users below the limit', async () => {
    const service = new PlanLimitsService(
      buildPrisma(starter, { branches: 1, users: 2, products: 0 }),
    );
    await expect(service.assertCanAddUser('t1')).resolves.toBeUndefined();
  });

  it('blocks product creation at the limit', async () => {
    const service = new PlanLimitsService(
      buildPrisma(starter, { branches: 1, users: 1, products: 1000 }),
    );
    await expect(service.assertCanAddProducts('t1')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('treats -1 as unlimited', async () => {
    const service = new PlanLimitsService(
      buildPrisma(enterprise, { branches: 999, users: 999, products: 999999 }),
    );
    await expect(service.assertCanAddBranch('t1')).resolves.toBeUndefined();
    await expect(service.assertCanAddUser('t1')).resolves.toBeUndefined();
    await expect(service.assertCanAddProducts('t1')).resolves.toBeUndefined();
  });
});
