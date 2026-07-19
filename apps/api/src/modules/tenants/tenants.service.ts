import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateTenantDto, UpdateTenantSettingsDto } from './tenants.dto';

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  async getPublicBySubdomain(subdomain: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { subdomain: subdomain.toLowerCase() },
      select: {
        name: true,
        subdomain: true,
        logoUrl: true,
        currency: true,
        status: true,
      },
    });
    if (!tenant) {
      throw new NotFoundException('Pharmacy not found');
    }
    return tenant;
  }

  async getMine(tenantId: string) {
    return this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      include: {
        settings: true,
        plan: { select: { name: true, slug: true, maxBranches: true, maxUsers: true, maxProducts: true } },
      },
    });
  }

  async updateMine(tenantId: string, dto: UpdateTenantDto) {
    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.email !== undefined ? { email: dto.email } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.address !== undefined ? { address: dto.address } : {}),
        ...(dto.timezone !== undefined ? { timezone: dto.timezone } : {}),
        ...(dto.currency !== undefined ? { currency: dto.currency } : {}),
        ...(dto.logoUrl !== undefined ? { logoUrl: dto.logoUrl } : {}),
      },
      include: { settings: true },
    });
  }

  async updateSettings(tenantId: string, dto: UpdateTenantSettingsDto) {
    const data: Prisma.TenantSettingUpdateInput = {
      ...(dto.taxRate !== undefined ? { taxRate: dto.taxRate } : {}),
      ...(dto.receiptHeader !== undefined ? { receiptHeader: dto.receiptHeader } : {}),
      ...(dto.receiptFooter !== undefined ? { receiptFooter: dto.receiptFooter } : {}),
      ...(dto.nearExpiryDays !== undefined ? { nearExpiryDays: dto.nearExpiryDays } : {}),
      ...(dto.lowStockThreshold !== undefined ? { lowStockThreshold: dto.lowStockThreshold } : {}),
      ...(dto.loyaltyEarnRate !== undefined ? { loyaltyEarnRate: dto.loyaltyEarnRate } : {}),
      ...(dto.loyaltyRedeemValue !== undefined ? { loyaltyRedeemValue: dto.loyaltyRedeemValue } : {}),
      ...(dto.invoicePrefix !== undefined ? { invoicePrefix: dto.invoicePrefix } : {}),
    };
    const createData = {
      ...data,
      tenantId,
    } as Prisma.TenantSettingUncheckedCreateInput;
    return this.prisma.tenantSetting.upsert({
      where: { tenantId },
      update: data,
      create: createData,
    });
  }
}
