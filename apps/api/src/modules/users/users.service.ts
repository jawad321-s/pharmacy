import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TenantRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { paginate } from '../../common/types';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { PlanLimitsService } from '../subscriptions/plan-limits.service';
import { CreateUserDto, ResetUserPasswordDto, UpdateUserDto } from './users.dto';

const USER_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  avatarUrl: true,
  tenantRole: true,
  branchId: true,
  branch: { select: { id: true, name: true } },
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly planLimits: PlanLimitsService,
  ) {}

  async list(tenantId: string, query: PaginationQueryDto) {
    const where: Prisma.UserWhereInput = {
      tenantId,
      ...(query.search
        ? {
            OR: [
              { email: { contains: query.search, mode: 'insensitive' } },
              { firstName: { contains: query.search, mode: 'insensitive' } },
              { lastName: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: USER_SELECT,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);
    return paginate(data, total, query.page, query.pageSize);
  }

  async create(tenantId: string, dto: CreateUserDto) {
    await this.planLimits.assertCanAddUser(tenantId);
    const email = dto.email.toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }
    if (dto.branchId) {
      await this.assertBranch(tenantId, dto.branchId);
    }
    const passwordHash = await bcrypt.hash(dto.password, 12);
    return this.prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone ?? null,
        tenantId,
        tenantRole: dto.tenantRole,
        branchId: dto.branchId ?? null,
      },
      select: USER_SELECT,
    });
  }

  async update(tenantId: string, id: string, dto: UpdateUserDto) {
    const user = await this.findTenantUser(tenantId, id);
    if (dto.branchId) {
      await this.assertBranch(tenantId, dto.branchId);
    }
    if (
      user.tenantRole === TenantRole.OWNER &&
      dto.tenantRole &&
      dto.tenantRole !== TenantRole.OWNER
    ) {
      const owners = await this.prisma.user.count({
        where: { tenantId, tenantRole: TenantRole.OWNER, isActive: true },
      });
      if (owners <= 1) {
        throw new BadRequestException('Cannot demote the last owner');
      }
    }
    return this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.email ? { email: dto.email.toLowerCase() } : {}),
        ...(dto.firstName !== undefined ? { firstName: dto.firstName } : {}),
        ...(dto.lastName !== undefined ? { lastName: dto.lastName } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.tenantRole !== undefined ? { tenantRole: dto.tenantRole } : {}),
        ...(dto.branchId !== undefined ? { branchId: dto.branchId } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      select: USER_SELECT,
    });
  }

  async resetPassword(tenantId: string, id: string, dto: ResetUserPasswordDto) {
    await this.findTenantUser(tenantId, id);
    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id }, data: { passwordHash } }),
      this.prisma.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    return { id };
  }

  async remove(tenantId: string, id: string, actorId: string) {
    const user = await this.findTenantUser(tenantId, id);
    if (id === actorId) {
      throw new ForbiddenException('You cannot delete your own account');
    }
    if (user.tenantRole === TenantRole.OWNER) {
      const owners = await this.prisma.user.count({
        where: { tenantId, tenantRole: TenantRole.OWNER },
      });
      if (owners <= 1) {
        throw new BadRequestException('Cannot delete the last owner');
      }
    }
    // Deactivate instead of hard delete to preserve sales/audit history.
    return this.prisma.user.update({
      where: { id },
      data: { isActive: false },
      select: USER_SELECT,
    });
  }

  loginHistory(tenantId: string, query: PaginationQueryDto) {
    return this.prisma.loginHistory.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      skip: query.skip,
      take: query.pageSize,
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
  }

  private async findTenantUser(tenantId: string, id: string) {
    const user = await this.prisma.user.findFirst({ where: { id, tenantId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  private async assertBranch(tenantId: string, branchId: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, tenantId },
    });
    if (!branch) {
      throw new BadRequestException('Branch does not belong to this pharmacy');
    }
  }
}
