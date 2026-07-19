import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, StockMovementType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { paginate } from '../../common/types';
import { toNumber, round2 } from '../../common/utils/numbers';
import { DateRangeQueryDto } from '../../common/dto/pagination.dto';
import { StockService } from './stock.service';
import { AdjustStockDto, StockQueryDto } from './inventory.dto';

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
  ) {}

  /**
   * Stock levels grouped by medicine with batch detail.
   */
  async stockLevels(tenantId: string, query: StockQueryDto) {
    const settings = await this.prisma.tenantSetting.findUnique({
      where: { tenantId },
    });
    const nearExpiryDays = settings?.nearExpiryDays ?? 90;
    const now = new Date();
    const nearExpiryDate = new Date(
      now.getTime() + nearExpiryDays * 24 * 60 * 60 * 1000,
    );

    const where: Prisma.MedicineWhereInput = {
      tenantId,
      status: 'ACTIVE',
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { nameAr: { contains: query.search } },
              { barcode: { contains: query.search } },
            ],
          }
        : {}),
    };

    const [medicines, total] = await this.prisma.$transaction([
      this.prisma.medicine.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: query.skip,
        take: query.pageSize,
        include: {
          batches: {
            include: {
              stockItems: query.branchId
                ? { where: { branchId: query.branchId } }
                : true,
            },
            orderBy: { expiryDate: 'asc' },
          },
        },
      }),
      this.prisma.medicine.count({ where }),
    ]);

    let data = medicines.map((medicine) => {
      const batches = medicine.batches.map((batch) => {
        const quantity = batch.stockItems.reduce(
          (sum, item) => sum + item.quantity,
          0,
        );
        return {
          id: batch.id,
          batchNumber: batch.batchNumber,
          expiryDate: batch.expiryDate,
          manufacturingDate: batch.manufacturingDate,
          costPrice: toNumber(batch.costPrice),
          quantity,
          isExpired: batch.expiryDate <= now,
          isNearExpiry: batch.expiryDate > now && batch.expiryDate <= nearExpiryDate,
        };
      });
      const totalQuantity = batches.reduce((sum, b) => sum + b.quantity, 0);
      const usableQuantity = batches
        .filter((b) => !b.isExpired)
        .reduce((sum, b) => sum + b.quantity, 0);
      return {
        id: medicine.id,
        name: medicine.name,
        nameAr: medicine.nameAr,
        barcode: medicine.barcode,
        sku: medicine.sku,
        unit: medicine.unit,
        minStock: medicine.minStock,
        sellingPrice: toNumber(medicine.sellingPrice),
        costPrice: toNumber(medicine.costPrice),
        totalQuantity,
        usableQuantity,
        inventoryValue: round2(
          batches.reduce((sum, b) => sum + b.quantity * b.costPrice, 0),
        ),
        isOutOfStock: usableQuantity === 0,
        isLowStock: usableQuantity > 0 && usableQuantity <= medicine.minStock,
        hasNearExpiry: batches.some((b) => b.isNearExpiry && b.quantity > 0),
        hasExpired: batches.some((b) => b.isExpired && b.quantity > 0),
        batches: batches.filter((b) => b.quantity > 0),
      };
    });

    if (query.alert === 'low') data = data.filter((m) => m.isLowStock);
    if (query.alert === 'out') data = data.filter((m) => m.isOutOfStock);
    if (query.alert === 'nearExpiry') data = data.filter((m) => m.hasNearExpiry);
    if (query.alert === 'expired') data = data.filter((m) => m.hasExpired);

    return paginate(data, total, query.page, query.pageSize);
  }

  async alertsSummary(tenantId: string, branchId?: string) {
    const settings = await this.prisma.tenantSetting.findUnique({
      where: { tenantId },
    });
    const nearExpiryDays = settings?.nearExpiryDays ?? 90;
    const now = new Date();
    const nearExpiryDate = new Date(
      now.getTime() + nearExpiryDays * 24 * 60 * 60 * 1000,
    );

    const medicines = await this.prisma.medicine.findMany({
      where: { tenantId, status: 'ACTIVE' },
      select: {
        id: true,
        minStock: true,
        batches: {
          select: {
            expiryDate: true,
            stockItems: {
              select: { quantity: true, branchId: true },
              ...(branchId ? { where: { branchId } } : {}),
            },
          },
        },
      },
    });

    let outOfStock = 0;
    let lowStock = 0;
    let nearExpiry = 0;
    let expired = 0;

    for (const medicine of medicines) {
      let usable = 0;
      let hasNear = false;
      let hasExpired = false;
      for (const batch of medicine.batches) {
        const qty = batch.stockItems.reduce((sum, s) => sum + s.quantity, 0);
        if (qty <= 0) continue;
        if (batch.expiryDate <= now) {
          hasExpired = true;
        } else {
          usable += qty;
          if (batch.expiryDate <= nearExpiryDate) hasNear = true;
        }
      }
      if (usable === 0) outOfStock += 1;
      else if (usable <= medicine.minStock) lowStock += 1;
      if (hasNear) nearExpiry += 1;
      if (hasExpired) expired += 1;
    }

    return { outOfStock, lowStock, nearExpiry, expired };
  }

  async adjust(tenantId: string, dto: AdjustStockDto, userId: string) {
    const batch = await this.prisma.batch.findFirst({
      where: { id: dto.batchId, tenantId },
    });
    if (!batch) {
      throw new NotFoundException('Batch not found');
    }
    const branch = await this.prisma.branch.findFirst({
      where: { id: dto.branchId, tenantId },
    });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }
    if (dto.quantityChange === 0) {
      throw new BadRequestException('Quantity change cannot be zero');
    }

    await this.prisma.$transaction(async (tx) => {
      if (dto.quantityChange > 0) {
        await this.stock.addStock(
          tx,
          tenantId,
          dto.branchId,
          batch.medicineId,
          batch.id,
          dto.quantityChange,
          StockMovementType.ADJUSTMENT,
          { userId, reason: dto.reason, refType: 'adjustment' },
        );
      } else {
        await this.stock.removeStock(
          tx,
          tenantId,
          dto.branchId,
          batch.medicineId,
          batch.id,
          Math.abs(dto.quantityChange),
          StockMovementType.ADJUSTMENT,
          { userId, reason: dto.reason, refType: 'adjustment' },
        );
      }
    });
    return { ok: true };
  }

  async movements(tenantId: string, query: DateRangeQueryDto & { branchId?: string; medicineId?: string }) {
    const where: Prisma.StockMovementWhereInput = {
      tenantId,
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.medicineId ? { medicineId: query.medicineId } : {}),
      ...(query.fromDate || query.toDate
        ? {
            createdAt: {
              ...(query.fromDate ? { gte: query.fromDate } : {}),
              ...(query.toDate ? { lte: query.toDate } : {}),
            },
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.stockMovement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.pageSize,
        include: {
          medicine: { select: { name: true, nameAr: true, barcode: true } },
          batch: { select: { batchNumber: true, expiryDate: true } },
          branch: { select: { name: true } },
          user: { select: { firstName: true, lastName: true } },
        },
      }),
      this.prisma.stockMovement.count({ where }),
    ]);
    return paginate(data, total, query.page, query.pageSize);
  }
}
