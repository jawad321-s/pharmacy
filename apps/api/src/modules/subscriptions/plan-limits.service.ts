import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Enforces the per-plan quotas (branches, users, products).
 * A limit of -1 means unlimited.
 */
@Injectable()
export class PlanLimitsService {
  constructor(private readonly prisma: PrismaService) {}

  private async getPlan(tenantId: string) {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { plan: true },
    });
    if (!tenant.plan) {
      throw new ForbiddenException('Tenant has no subscription plan');
    }
    return tenant.plan;
  }

  async assertCanAddBranch(tenantId: string): Promise<void> {
    const plan = await this.getPlan(tenantId);
    if (plan.maxBranches < 0) return;
    const count = await this.prisma.branch.count({ where: { tenantId } });
    if (count >= plan.maxBranches) {
      throw new ForbiddenException(
        `PLAN_LIMIT_BRANCHES:${plan.maxBranches}`,
      );
    }
  }

  async assertCanAddUser(tenantId: string): Promise<void> {
    const plan = await this.getPlan(tenantId);
    if (plan.maxUsers < 0) return;
    const count = await this.prisma.user.count({ where: { tenantId } });
    if (count >= plan.maxUsers) {
      throw new ForbiddenException(`PLAN_LIMIT_USERS:${plan.maxUsers}`);
    }
  }

  async assertCanAddProducts(tenantId: string, adding = 1): Promise<void> {
    const plan = await this.getPlan(tenantId);
    if (plan.maxProducts < 0) return;
    const count = await this.prisma.medicine.count({ where: { tenantId } });
    if (count + adding > plan.maxProducts) {
      throw new ForbiddenException(`PLAN_LIMIT_PRODUCTS:${plan.maxProducts}`);
    }
  }
}
