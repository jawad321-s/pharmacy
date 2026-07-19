import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, StockMovementType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type Tx = Prisma.TransactionClient;

export interface BatchAllocation {
  batchId: string;
  batchNumber: string;
  quantity: number;
  expiryDate: Date;
  costPrice: number;
}

export interface MovementRef {
  userId?: string;
  refType?: string;
  refId?: string;
  reason?: string;
}

/**
 * Low-level stock engine. All mutations go through a Prisma transaction
 * client so callers can compose them with business writes atomically.
 * FEFO (First-Expire-First-Out) allocation is implemented here.
 */
@Injectable()
export class StockService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Allocates `quantity` units of a medicine at a branch using FEFO.
   * Expired batches are never allocated. Throws when stock is
   * insufficient — negative inventory is impossible by construction.
   */
  async allocateFefo(
    tx: Tx,
    tenantId: string,
    branchId: string,
    medicineId: string,
    quantity: number,
    ref: MovementRef,
    movementType: StockMovementType = StockMovementType.SALE,
  ): Promise<BatchAllocation[]> {
    if (quantity <= 0) {
      throw new BadRequestException('Quantity must be positive');
    }
    const now = new Date();
    const stockItems = await tx.stockItem.findMany({
      where: {
        tenantId,
        branchId,
        quantity: { gt: 0 },
        batch: { medicineId, expiryDate: { gt: now } },
      },
      include: { batch: true },
      orderBy: { batch: { expiryDate: 'asc' } },
    });

    const available = stockItems.reduce((sum, item) => sum + item.quantity, 0);
    if (available < quantity) {
      throw new BadRequestException(
        `INSUFFICIENT_STOCK:${medicineId}:${available}`,
      );
    }

    const allocations: BatchAllocation[] = [];
    let remaining = quantity;

    for (const item of stockItems) {
      if (remaining <= 0) break;
      const take = Math.min(item.quantity, remaining);
      remaining -= take;

      // Guarded decrement: updateMany with quantity >= take protects
      // against concurrent oversell even outside SERIALIZABLE isolation.
      const updated = await tx.stockItem.updateMany({
        where: { id: item.id, quantity: { gte: take } },
        data: { quantity: { decrement: take } },
      });
      if (updated.count === 0) {
        throw new BadRequestException(
          `INSUFFICIENT_STOCK:${medicineId}:concurrent-update`,
        );
      }
      const after = await tx.stockItem.findUniqueOrThrow({
        where: { id: item.id },
        select: { quantity: true },
      });

      await tx.stockMovement.create({
        data: {
          tenantId,
          branchId,
          medicineId,
          batchId: item.batchId,
          userId: ref.userId ?? null,
          type: movementType,
          quantity: -take,
          balanceAfter: after.quantity,
          reason: ref.reason ?? null,
          refType: ref.refType ?? null,
          refId: ref.refId ?? null,
        },
      });

      allocations.push({
        batchId: item.batchId,
        batchNumber: item.batch.batchNumber,
        quantity: take,
        expiryDate: item.batch.expiryDate,
        costPrice: Number(item.batch.costPrice),
      });
    }

    return allocations;
  }

  /**
   * Adds stock to a specific batch at a branch (purchases, returns,
   * transfers in, positive adjustments).
   */
  async addStock(
    tx: Tx,
    tenantId: string,
    branchId: string,
    medicineId: string,
    batchId: string,
    quantity: number,
    movementType: StockMovementType,
    ref: MovementRef,
  ): Promise<void> {
    if (quantity <= 0) {
      throw new BadRequestException('Quantity must be positive');
    }
    const item = await tx.stockItem.upsert({
      where: { branchId_batchId: { branchId, batchId } },
      update: { quantity: { increment: quantity } },
      create: { tenantId, branchId, batchId, quantity },
    });
    await tx.stockMovement.create({
      data: {
        tenantId,
        branchId,
        medicineId,
        batchId,
        userId: ref.userId ?? null,
        type: movementType,
        quantity,
        balanceAfter: item.quantity,
        reason: ref.reason ?? null,
        refType: ref.refType ?? null,
        refId: ref.refId ?? null,
      },
    });
  }

  /**
   * Removes stock from a specific batch (negative adjustments, transfers
   * out, purchase returns). Fails when the batch holds less than requested.
   */
  async removeStock(
    tx: Tx,
    tenantId: string,
    branchId: string,
    medicineId: string,
    batchId: string,
    quantity: number,
    movementType: StockMovementType,
    ref: MovementRef,
  ): Promise<void> {
    if (quantity <= 0) {
      throw new BadRequestException('Quantity must be positive');
    }
    const updated = await tx.stockItem.updateMany({
      where: { branchId, batchId, quantity: { gte: quantity } },
      data: { quantity: { decrement: quantity } },
    });
    if (updated.count === 0) {
      throw new BadRequestException('INSUFFICIENT_STOCK:batch');
    }
    const item = await tx.stockItem.findUniqueOrThrow({
      where: { branchId_batchId: { branchId, batchId } },
      select: { quantity: true },
    });
    await tx.stockMovement.create({
      data: {
        tenantId,
        branchId,
        medicineId,
        batchId,
        userId: ref.userId ?? null,
        type: movementType,
        quantity: -quantity,
        balanceAfter: item.quantity,
        reason: ref.reason ?? null,
        refType: ref.refType ?? null,
        refId: ref.refId ?? null,
      },
    });
  }

  /**
   * Sets the absolute quantity for a batch at a branch (inventory counts).
   */
  async setStock(
    tx: Tx,
    tenantId: string,
    branchId: string,
    medicineId: string,
    batchId: string,
    newQuantity: number,
    ref: MovementRef,
  ): Promise<void> {
    if (newQuantity < 0) {
      throw new BadRequestException('Quantity cannot be negative');
    }
    const existing = await tx.stockItem.findUnique({
      where: { branchId_batchId: { branchId, batchId } },
    });
    const current = existing?.quantity ?? 0;
    const diff = newQuantity - current;
    if (diff === 0) return;

    await tx.stockItem.upsert({
      where: { branchId_batchId: { branchId, batchId } },
      update: { quantity: newQuantity },
      create: { tenantId, branchId, batchId, quantity: newQuantity },
    });
    await tx.stockMovement.create({
      data: {
        tenantId,
        branchId,
        medicineId,
        batchId,
        userId: ref.userId ?? null,
        type: StockMovementType.COUNT,
        quantity: diff,
        balanceAfter: newQuantity,
        reason: ref.reason ?? null,
        refType: ref.refType ?? null,
        refId: ref.refId ?? null,
      },
    });
  }
}
