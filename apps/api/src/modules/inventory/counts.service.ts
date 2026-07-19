import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InventoryCountStatus, InventoryCountType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StockService } from './stock.service';
import { CreateCountDto, SubmitCountDto } from './inventory.dto';

@Injectable()
export class CountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
  ) {}

  list(tenantId: string) {
    return this.prisma.inventoryCount.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        branch: { select: { name: true } },
        user: { select: { firstName: true, lastName: true } },
        _count: { select: { items: true } },
      },
    });
  }

  async get(tenantId: string, id: string) {
    const count = await this.prisma.inventoryCount.findFirst({
      where: { id, tenantId },
      include: {
        branch: { select: { id: true, name: true } },
        user: { select: { firstName: true, lastName: true } },
        items: {
          include: {
            batch: {
              include: {
                medicine: {
                  select: { id: true, name: true, nameAr: true, barcode: true, unit: true },
                },
              },
            },
          },
        },
      },
    });
    if (!count) {
      throw new NotFoundException('Inventory count not found');
    }
    return count;
  }

  /**
   * Creates a count session with a snapshot of expected quantities.
   */
  async create(tenantId: string, dto: CreateCountDto, userId: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { id: dto.branchId, tenantId },
    });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    const stockItems = await this.prisma.stockItem.findMany({
      where: {
        tenantId,
        branchId: dto.branchId,
        ...(dto.type !== InventoryCountType.FULL && dto.batchIds?.length
          ? { batchId: { in: dto.batchIds } }
          : {}),
      },
    });
    if (stockItems.length === 0) {
      throw new BadRequestException('No stock found for this count scope');
    }

    const total = await this.prisma.inventoryCount.count({ where: { tenantId } });
    const number = `CNT-${new Date().getFullYear()}-${String(total + 1).padStart(5, '0')}`;

    return this.prisma.inventoryCount.create({
      data: {
        tenantId,
        branchId: dto.branchId,
        number,
        type: dto.type,
        status: InventoryCountStatus.IN_PROGRESS,
        userId,
        notes: dto.notes ?? null,
        items: {
          create: stockItems.map((item) => ({
            batchId: item.batchId,
            expectedQty: item.quantity,
          })),
        },
      },
      include: { _count: { select: { items: true } } },
    });
  }

  /**
   * Saves counted quantities and applies variances to stock.
   */
  async complete(tenantId: string, id: string, dto: SubmitCountDto, userId: string) {
    const count = await this.get(tenantId, id);
    if (count.status !== InventoryCountStatus.IN_PROGRESS) {
      throw new BadRequestException('Count is not in progress');
    }
    const countedByBatch = new Map(
      dto.items.map((item) => [item.batchId, item.countedQty]),
    );

    return this.prisma.$transaction(async (tx) => {
      for (const item of count.items) {
        const counted = countedByBatch.get(item.batchId);
        if (counted === undefined) continue;

        await tx.inventoryCountItem.update({
          where: { id: item.id },
          data: { countedQty: counted },
        });
        await this.stock.setStock(
          tx,
          tenantId,
          count.branch.id,
          item.batch.medicine.id,
          item.batchId,
          counted,
          {
            userId,
            refType: 'inventory-count',
            refId: count.id,
            reason: `Inventory count ${count.number}`,
          },
        );
      }
      return tx.inventoryCount.update({
        where: { id },
        data: { status: InventoryCountStatus.COMPLETED, completedAt: new Date() },
      });
    });
  }

  async cancel(tenantId: string, id: string) {
    const count = await this.get(tenantId, id);
    if (count.status === InventoryCountStatus.COMPLETED) {
      throw new BadRequestException('Completed counts cannot be cancelled');
    }
    return this.prisma.inventoryCount.update({
      where: { id },
      data: { status: InventoryCountStatus.CANCELLED },
    });
  }
}
