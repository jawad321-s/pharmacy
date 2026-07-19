import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { StockMovementType, TransferStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StockService } from './stock.service';
import { CreateTransferDto } from './inventory.dto';

@Injectable()
export class TransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
  ) {}

  list(tenantId: string) {
    return this.prisma.stockTransfer.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        fromBranch: { select: { name: true } },
        toBranch: { select: { name: true } },
        user: { select: { firstName: true, lastName: true } },
        items: {
          include: {
            batch: {
              include: { medicine: { select: { name: true, nameAr: true } } },
            },
          },
        },
      },
    });
  }

  /**
   * Creates a transfer and immediately moves the stock out of the source
   * branch (state PENDING → stock is "in transit").
   */
  async create(tenantId: string, dto: CreateTransferDto, userId: string) {
    if (dto.fromBranchId === dto.toBranchId) {
      throw new BadRequestException('Source and destination must differ');
    }
    const branches = await this.prisma.branch.findMany({
      where: { tenantId, id: { in: [dto.fromBranchId, dto.toBranchId] } },
    });
    if (branches.length !== 2) {
      throw new BadRequestException('Branch not found');
    }

    const count = await this.prisma.stockTransfer.count({ where: { tenantId } });
    const number = `TRF-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;

    return this.prisma.$transaction(async (tx) => {
      const transfer = await tx.stockTransfer.create({
        data: {
          tenantId,
          number,
          fromBranchId: dto.fromBranchId,
          toBranchId: dto.toBranchId,
          status: TransferStatus.IN_TRANSIT,
          userId,
          notes: dto.notes ?? null,
          items: {
            create: dto.items.map((item) => ({
              batchId: item.batchId,
              quantity: item.quantity,
            })),
          },
        },
        include: { items: { include: { batch: true } } },
      });

      for (const item of transfer.items) {
        if (item.batch.tenantId !== tenantId) {
          throw new BadRequestException('Batch does not belong to this pharmacy');
        }
        await this.stock.removeStock(
          tx,
          tenantId,
          dto.fromBranchId,
          item.batch.medicineId,
          item.batchId,
          item.quantity,
          StockMovementType.TRANSFER_OUT,
          { userId, refType: 'transfer', refId: transfer.id },
        );
      }
      return transfer;
    });
  }

  /**
   * Completes a transfer: stock is received at the destination branch.
   */
  async complete(tenantId: string, id: string, userId: string) {
    const transfer = await this.prisma.stockTransfer.findFirst({
      where: { id, tenantId },
      include: { items: { include: { batch: true } } },
    });
    if (!transfer) {
      throw new NotFoundException('Transfer not found');
    }
    if (transfer.status !== TransferStatus.IN_TRANSIT) {
      throw new BadRequestException('Transfer is not in transit');
    }

    return this.prisma.$transaction(async (tx) => {
      for (const item of transfer.items) {
        await this.stock.addStock(
          tx,
          tenantId,
          transfer.toBranchId,
          item.batch.medicineId,
          item.batchId,
          item.quantity,
          StockMovementType.TRANSFER_IN,
          { userId, refType: 'transfer', refId: transfer.id },
        );
      }
      return tx.stockTransfer.update({
        where: { id },
        data: { status: TransferStatus.COMPLETED, completedAt: new Date() },
      });
    });
  }

  /**
   * Cancels an in-transit transfer: stock returns to the source branch.
   */
  async cancel(tenantId: string, id: string, userId: string) {
    const transfer = await this.prisma.stockTransfer.findFirst({
      where: { id, tenantId },
      include: { items: { include: { batch: true } } },
    });
    if (!transfer) {
      throw new NotFoundException('Transfer not found');
    }
    if (transfer.status !== TransferStatus.IN_TRANSIT) {
      throw new BadRequestException('Only in-transit transfers can be cancelled');
    }

    return this.prisma.$transaction(async (tx) => {
      for (const item of transfer.items) {
        await this.stock.addStock(
          tx,
          tenantId,
          transfer.fromBranchId,
          item.batch.medicineId,
          item.batchId,
          item.quantity,
          StockMovementType.TRANSFER_IN,
          {
            userId,
            refType: 'transfer-cancel',
            refId: transfer.id,
            reason: 'Transfer cancelled',
          },
        );
      }
      return tx.stockTransfer.update({
        where: { id },
        data: { status: TransferStatus.CANCELLED },
      });
    });
  }
}
