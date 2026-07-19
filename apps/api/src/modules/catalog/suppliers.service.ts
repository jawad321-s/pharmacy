import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { paginate } from '../../common/types';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { toNumber } from '../../common/utils/numbers';
import { CreateSupplierDto, UpdateSupplierDto } from './catalog.dto';

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, query: PaginationQueryDto) {
    const where: Prisma.SupplierWhereInput = {
      tenantId,
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { phone: { contains: query.search } },
              { email: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [suppliers, total] = await this.prisma.$transaction([
      this.prisma.supplier.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: query.skip,
        take: query.pageSize,
      }),
      this.prisma.supplier.count({ where }),
    ]);

    // Balance = opening balance + unpaid purchase totals - returns.
    const data = await Promise.all(
      suppliers.map(async (supplier) => {
        const [invoiceAgg, returnAgg] = await Promise.all([
          this.prisma.purchaseInvoice.aggregate({
            where: { tenantId, supplierId: supplier.id },
            _sum: { total: true, paidAmount: true },
          }),
          this.prisma.purchaseReturn.aggregate({
            where: { tenantId, invoice: { supplierId: supplier.id } },
            _sum: { total: true },
          }),
        ]);
        const balance =
          toNumber(supplier.openingBalance) +
          toNumber(invoiceAgg._sum.total) -
          toNumber(invoiceAgg._sum.paidAmount) -
          toNumber(returnAgg._sum.total);
        return { ...supplier, balance: Math.round(balance * 100) / 100 };
      }),
    );

    return paginate(data, total, query.page, query.pageSize);
  }

  create(tenantId: string, dto: CreateSupplierDto) {
    return this.prisma.supplier.create({
      data: {
        tenantId,
        name: dto.name,
        phone: dto.phone ?? null,
        email: dto.email ?? null,
        address: dto.address ?? null,
        openingBalance: dto.openingBalance ?? 0,
      },
    });
  }

  async update(tenantId: string, id: string, dto: UpdateSupplierDto) {
    await this.findOne(tenantId, id);
    return this.prisma.supplier.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.email !== undefined ? { email: dto.email } : {}),
        ...(dto.address !== undefined ? { address: dto.address } : {}),
        ...(dto.openingBalance !== undefined
          ? { openingBalance: dto.openingBalance }
          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    const used = await this.prisma.purchaseInvoice.count({
      where: { supplierId: id },
    });
    if (used > 0) {
      return this.prisma.supplier.update({
        where: { id },
        data: { isActive: false },
      });
    }
    return this.prisma.supplier.delete({ where: { id } });
  }

  async ledger(tenantId: string, id: string) {
    const supplier = await this.findOne(tenantId, id);
    const [invoices, returns] = await Promise.all([
      this.prisma.purchaseInvoice.findMany({
        where: { tenantId, supplierId: id },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          number: true,
          total: true,
          paidAmount: true,
          createdAt: true,
        },
      }),
      this.prisma.purchaseReturn.findMany({
        where: { tenantId, invoice: { supplierId: id } },
        orderBy: { createdAt: 'asc' },
        select: { id: true, number: true, total: true, createdAt: true },
      }),
    ]);

    const entries = [
      ...invoices.map((inv) => ({
        date: inv.createdAt,
        type: 'PURCHASE' as const,
        reference: inv.number,
        debit: toNumber(inv.total),
        credit: toNumber(inv.paidAmount),
      })),
      ...returns.map((ret) => ({
        date: ret.createdAt,
        type: 'RETURN' as const,
        reference: ret.number,
        debit: 0,
        credit: toNumber(ret.total),
      })),
    ].sort((a, b) => a.date.getTime() - b.date.getTime());

    let balance = toNumber(supplier.openingBalance);
    const ledger = entries.map((entry) => {
      balance += entry.debit - entry.credit;
      return { ...entry, balance: Math.round(balance * 100) / 100 };
    });

    return {
      supplier,
      openingBalance: toNumber(supplier.openingBalance),
      entries: ledger,
      balance: Math.round(balance * 100) / 100,
    };
  }

  private async findOne(tenantId: string, id: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, tenantId },
    });
    if (!supplier) {
      throw new NotFoundException('Supplier not found');
    }
    return supplier;
  }
}
