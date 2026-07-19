import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PlanLimitsService } from '../subscriptions/plan-limits.service';
import { CreateBranchDto, UpdateBranchDto } from './branches.dto';

@Injectable()
export class BranchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly planLimits: PlanLimitsService,
  ) {}

  list(tenantId: string) {
    return this.prisma.branch.findMany({
      where: { tenantId },
      orderBy: [{ isMain: 'desc' }, { createdAt: 'asc' }],
      include: {
        manager: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { users: true } },
      },
    });
  }

  async create(tenantId: string, dto: CreateBranchDto) {
    await this.planLimits.assertCanAddBranch(tenantId);
    if (dto.managerId) {
      await this.assertTenantUser(tenantId, dto.managerId);
    }
    return this.prisma.branch.create({
      data: {
        tenantId,
        name: dto.name,
        nameAr: dto.nameAr ?? null,
        address: dto.address ?? null,
        phone: dto.phone ?? null,
        managerId: dto.managerId ?? null,
      },
    });
  }

  async update(tenantId: string, id: string, dto: UpdateBranchDto) {
    await this.findBranch(tenantId, id);
    if (dto.managerId) {
      await this.assertTenantUser(tenantId, dto.managerId);
    }
    return this.prisma.branch.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.nameAr !== undefined ? { nameAr: dto.nameAr } : {}),
        ...(dto.address !== undefined ? { address: dto.address } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.managerId !== undefined ? { managerId: dto.managerId } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  async remove(tenantId: string, id: string) {
    const branch = await this.findBranch(tenantId, id);
    if (branch.isMain) {
      throw new BadRequestException('The main branch cannot be deleted');
    }
    const [sales, stock] = await Promise.all([
      this.prisma.sale.count({ where: { branchId: id } }),
      this.prisma.stockItem.count({
        where: { branchId: id, quantity: { gt: 0 } },
      }),
    ]);
    if (sales > 0) {
      // Preserve history; deactivate instead.
      return this.prisma.branch.update({
        where: { id },
        data: { isActive: false },
      });
    }
    if (stock > 0) {
      throw new BadRequestException(
        'Branch still holds stock. Transfer inventory before deleting.',
      );
    }
    return this.prisma.branch.delete({ where: { id } });
  }

  private async findBranch(tenantId: string, id: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { id, tenantId },
    });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }
    return branch;
  }

  private async assertTenantUser(tenantId: string, userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId },
    });
    if (!user) {
      throw new BadRequestException('Manager must be a user of this pharmacy');
    }
  }
}
