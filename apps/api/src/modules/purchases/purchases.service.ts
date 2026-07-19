import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  LedgerAccount,
  LedgerSide,
  Prisma,
  PurchaseOrderStatus,
  StockMovementType,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { paginate } from '../../common/types';
import { round2, toNumber } from '../../common/utils/numbers';
import { StockService } from '../inventory/stock.service';
import { LedgerService } from '../accounting/ledger.service';
import {
  CreatePurchaseInvoiceDto,
  CreatePurchaseOrderDto,
  CreatePurchaseReturnDto,
  PurchaseQueryDto,
  RecordSupplierPaymentDto,
} from './purchases.dto';

@Injectable()
export class PurchasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
    private readonly ledger: LedgerService,
  ) {}

  // ------------------------------------------------------------------
  // Purchase orders
  // ------------------------------------------------------------------

  async listOrders(tenantId: string, query: PurchaseQueryDto) {
    const where: Prisma.PurchaseOrderWhereInput = {
      tenantId,
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search ? { number: { contains: query.search, mode: 'insensitive' } } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.purchaseOrder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.pageSize,
        include: {
          supplier: { select: { id: true, name: true } },
          branch: { select: { id: true, name: true } },
          items: { include: { medicine: { select: { name: true, nameAr: true } } } },
        },
      }),
      this.prisma.purchaseOrder.count({ where }),
    ]);
    return paginate(data, total, query.page, query.pageSize);
  }

  async createOrder(tenantId: string, dto: CreatePurchaseOrderDto, userId: string) {
    await this.assertBranchAndSupplier(tenantId, dto.branchId, dto.supplierId);
    await this.assertMedicines(tenantId, dto.items.map((item) => item.medicineId));

    const subtotal = round2(
      dto.items.reduce((sum, item) => sum + item.unitCost * item.quantity, 0),
    );
    const seq = await this.prisma.purchaseOrder.count({ where: { tenantId } });
    const number = `PO-${new Date().getFullYear()}-${String(seq + 1).padStart(5, '0')}`;

    return this.prisma.purchaseOrder.create({
      data: {
        tenantId,
        branchId: dto.branchId,
        supplierId: dto.supplierId,
        userId,
        number,
        status: PurchaseOrderStatus.ORDERED,
        expectedAt: dto.expectedAt ? new Date(dto.expectedAt) : null,
        notes: dto.notes ?? null,
        subtotal,
        total: subtotal,
        items: {
          create: dto.items.map((item) => ({
            medicineId: item.medicineId,
            quantity: item.quantity,
            unitCost: item.unitCost,
          })),
        },
      },
      include: { items: true, supplier: { select: { name: true } } },
    });
  }

  async cancelOrder(tenantId: string, id: string) {
    const order = await this.prisma.purchaseOrder.findFirst({
      where: { id, tenantId },
    });
    if (!order) throw new NotFoundException('Purchase order not found');
    if (
      order.status === PurchaseOrderStatus.RECEIVED ||
      order.status === PurchaseOrderStatus.PARTIALLY_RECEIVED
    ) {
      throw new BadRequestException('Received orders cannot be cancelled');
    }
    return this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: PurchaseOrderStatus.CANCELLED },
    });
  }

  // ------------------------------------------------------------------
  // Purchase invoices (goods receipt)
  // ------------------------------------------------------------------

  async listInvoices(tenantId: string, query: PurchaseQueryDto) {
    const where: Prisma.PurchaseInvoiceWhereInput = {
      tenantId,
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(query.search ? { number: { contains: query.search, mode: 'insensitive' } } : {}),
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
      this.prisma.purchaseInvoice.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.pageSize,
        include: {
          supplier: { select: { id: true, name: true } },
          branch: { select: { id: true, name: true } },
          items: {
            include: { medicine: { select: { name: true, nameAr: true, barcode: true } } },
          },
        },
      }),
      this.prisma.purchaseInvoice.count({ where }),
    ]);
    return paginate(data, total, query.page, query.pageSize);
  }

  async getInvoice(tenantId: string, id: string) {
    const invoice = await this.prisma.purchaseInvoice.findFirst({
      where: { id, tenantId },
      include: {
        supplier: true,
        branch: { select: { id: true, name: true } },
        user: { select: { firstName: true, lastName: true } },
        items: {
          include: { medicine: { select: { name: true, nameAr: true, barcode: true, unit: true } } },
        },
        returns: { include: { items: true } },
      },
    });
    if (!invoice) throw new NotFoundException('Purchase invoice not found');
    return invoice;
  }

  /**
   * Receives goods: creates batches (or tops up existing ones), adds
   * stock, updates the medicine's cost/purchase price, marks linked
   * order lines as received and posts ledger entries.
   */
  async createInvoice(tenantId: string, dto: CreatePurchaseInvoiceDto, userId: string) {
    await this.assertBranchAndSupplier(tenantId, dto.branchId, dto.supplierId);
    const medicineIds = [...new Set(dto.items.map((item) => item.medicineId))];
    const medicines = await this.assertMedicines(tenantId, medicineIds);
    const medicineById = new Map(medicines.map((m) => [m.id, m]));

    const now = new Date();
    for (const item of dto.items) {
      const expiry = new Date(item.expiryDate);
      if (Number.isNaN(expiry.getTime()) || expiry <= now) {
        throw new BadRequestException(
          `Batch ${item.batchNumber} has an invalid or past expiry date`,
        );
      }
    }

    const subtotal = round2(
      dto.items.reduce((sum, item) => sum + item.unitCost * item.quantity, 0),
    );
    const discountAmount = dto.discountAmount ?? 0;
    const taxAmount = dto.taxAmount ?? 0;
    const total = round2(subtotal - discountAmount + taxAmount);
    const paidAmount = Math.min(dto.paidAmount ?? 0, total);
    if (discountAmount > subtotal) {
      throw new BadRequestException('Discount exceeds the subtotal');
    }

    return this.prisma.$transaction(async (tx) => {
      const seq = await tx.purchaseInvoice.count({ where: { tenantId } });
      const number = `PI-${new Date().getFullYear()}-${String(seq + 1).padStart(5, '0')}`;

      const invoice = await tx.purchaseInvoice.create({
        data: {
          tenantId,
          branchId: dto.branchId,
          supplierId: dto.supplierId,
          orderId: dto.orderId ?? null,
          userId,
          number,
          subtotal,
          discountAmount,
          taxAmount,
          total,
          paidAmount,
          notes: dto.notes ?? null,
        },
      });

      for (const item of dto.items) {
        const batch = await tx.batch.upsert({
          where: {
            tenantId_medicineId_batchNumber: {
              tenantId,
              medicineId: item.medicineId,
              batchNumber: item.batchNumber,
            },
          },
          update: {
            expiryDate: new Date(item.expiryDate),
            manufacturingDate: item.manufacturingDate
              ? new Date(item.manufacturingDate)
              : null,
            costPrice: item.unitCost,
          },
          create: {
            tenantId,
            medicineId: item.medicineId,
            batchNumber: item.batchNumber,
            expiryDate: new Date(item.expiryDate),
            manufacturingDate: item.manufacturingDate
              ? new Date(item.manufacturingDate)
              : null,
            costPrice: item.unitCost,
          },
        });

        await tx.purchaseInvoiceItem.create({
          data: {
            invoiceId: invoice.id,
            medicineId: item.medicineId,
            batchId: batch.id,
            batchNumber: item.batchNumber,
            manufacturingDate: item.manufacturingDate
              ? new Date(item.manufacturingDate)
              : null,
            expiryDate: new Date(item.expiryDate),
            quantity: item.quantity,
            unitCost: item.unitCost,
            total: round2(item.unitCost * item.quantity),
          },
        });

        await this.stock.addStock(
          tx,
          tenantId,
          dto.branchId,
          item.medicineId,
          batch.id,
          item.quantity,
          StockMovementType.PURCHASE,
          { userId, refType: 'purchase', refId: invoice.id },
        );

        // Latest purchase cost becomes the medicine's reference cost.
        const medicine = medicineById.get(item.medicineId)!;
        if (toNumber(medicine.purchasePrice) !== item.unitCost) {
          await tx.medicine.update({
            where: { id: item.medicineId },
            data: { purchasePrice: item.unitCost, costPrice: item.unitCost },
          });
        }
      }

      if (dto.orderId) {
        const order = await tx.purchaseOrder.findFirst({
          where: { id: dto.orderId, tenantId },
          include: { items: true },
        });
        if (order) {
          for (const orderItem of order.items) {
            const received = dto.items
              .filter((item) => item.medicineId === orderItem.medicineId)
              .reduce((sum, item) => sum + item.quantity, 0);
            if (received > 0) {
              await tx.purchaseOrderItem.update({
                where: { id: orderItem.id },
                data: { receivedQty: { increment: received } },
              });
            }
          }
          const refreshed = await tx.purchaseOrderItem.findMany({
            where: { orderId: order.id },
          });
          const fully = refreshed.every((item) => item.receivedQty >= item.quantity);
          await tx.purchaseOrder.update({
            where: { id: order.id },
            data: {
              status: fully
                ? PurchaseOrderStatus.RECEIVED
                : PurchaseOrderStatus.PARTIALLY_RECEIVED,
            },
          });
        }
      }

      await this.ledger.post(
        tx,
        tenantId,
        [
          {
            account: LedgerAccount.INVENTORY,
            side: LedgerSide.DEBIT,
            amount: total,
            description: `Purchase ${number}`,
          },
          {
            account: LedgerAccount.CASH,
            side: LedgerSide.CREDIT,
            amount: paidAmount,
            description: `Payment for purchase ${number}`,
          },
          {
            account: LedgerAccount.ACCOUNTS_PAYABLE,
            side: LedgerSide.CREDIT,
            amount: round2(total - paidAmount),
            description: `Payable for purchase ${number}`,
          },
        ],
        { refType: 'purchase', refId: invoice.id },
      );

      return this.getInvoiceTx(tx, tenantId, invoice.id);
    });
  }

  async recordPayment(
    tenantId: string,
    invoiceId: string,
    dto: RecordSupplierPaymentDto,
  ) {
    const invoice = await this.prisma.purchaseInvoice.findFirst({
      where: { id: invoiceId, tenantId },
    });
    if (!invoice) throw new NotFoundException('Purchase invoice not found');
    const outstanding = round2(toNumber(invoice.total) - toNumber(invoice.paidAmount));
    if (dto.amount > outstanding + 0.005) {
      throw new BadRequestException(
        `Payment exceeds the outstanding balance (${outstanding})`,
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.purchaseInvoice.update({
        where: { id: invoiceId },
        data: { paidAmount: { increment: dto.amount } },
      });
      await this.ledger.post(
        tx,
        tenantId,
        [
          {
            account: LedgerAccount.ACCOUNTS_PAYABLE,
            side: LedgerSide.DEBIT,
            amount: dto.amount,
            description: `Supplier payment for ${invoice.number}`,
          },
          {
            account: LedgerAccount.CASH,
            side: LedgerSide.CREDIT,
            amount: dto.amount,
            description: `Supplier payment for ${invoice.number}`,
          },
        ],
        { refType: 'supplier-payment', refId: invoice.id },
      );
      return updated;
    });
  }

  /**
   * Returns goods to the supplier. Stock leaves the branch from the
   * exact batches received on the invoice.
   */
  async createReturn(
    tenantId: string,
    invoiceId: string,
    dto: CreatePurchaseReturnDto,
    userId: string,
  ) {
    const invoice = await this.prisma.purchaseInvoice.findFirst({
      where: { id: invoiceId, tenantId },
      include: { items: true },
    });
    if (!invoice) throw new NotFoundException('Purchase invoice not found');

    const itemsById = new Map(invoice.items.map((item) => [item.id, item]));
    for (const entry of dto.items) {
      const item = itemsById.get(entry.invoiceItemId);
      if (!item) {
        throw new BadRequestException('Invoice item not found');
      }
      if (entry.quantity > item.quantity - item.returnedQty) {
        throw new BadRequestException(
          `Return quantity exceeds remaining received quantity for ${item.batchNumber}`,
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const seq = await tx.purchaseReturn.count({ where: { tenantId } });
      const number = `PR-${new Date().getFullYear()}-${String(seq + 1).padStart(5, '0')}`;

      let total = 0;
      const returnItems: { invoiceItemId: string; quantity: number; amount: number }[] = [];

      for (const entry of dto.items) {
        const item = itemsById.get(entry.invoiceItemId)!;
        const amount = round2(toNumber(item.unitCost) * entry.quantity);
        total += amount;
        returnItems.push({
          invoiceItemId: item.id,
          quantity: entry.quantity,
          amount,
        });

        if (!item.batchId) {
          throw new BadRequestException(
            `Invoice item ${item.batchNumber} has no linked batch`,
          );
        }
        await this.stock.removeStock(
          tx,
          tenantId,
          invoice.branchId,
          item.medicineId,
          item.batchId,
          entry.quantity,
          StockMovementType.PURCHASE_RETURN,
          { userId, refType: 'purchase-return', refId: invoice.id, reason: dto.reason },
        );
        await tx.purchaseInvoiceItem.update({
          where: { id: item.id },
          data: { returnedQty: { increment: entry.quantity } },
        });
      }

      total = round2(total);
      const purchaseReturn = await tx.purchaseReturn.create({
        data: {
          tenantId,
          invoiceId: invoice.id,
          number,
          userId,
          reason: dto.reason ?? null,
          total,
          items: { create: returnItems },
        },
        include: { items: true },
      });

      await this.ledger.post(
        tx,
        tenantId,
        [
          {
            account: LedgerAccount.ACCOUNTS_PAYABLE,
            side: LedgerSide.DEBIT,
            amount: total,
            description: `Purchase return ${number}`,
          },
          {
            account: LedgerAccount.INVENTORY,
            side: LedgerSide.CREDIT,
            amount: total,
            description: `Purchase return ${number}`,
          },
        ],
        { refType: 'purchase-return', refId: purchaseReturn.id },
      );

      return purchaseReturn;
    });
  }

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  private async getInvoiceTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    id: string,
  ) {
    return tx.purchaseInvoice.findFirstOrThrow({
      where: { id, tenantId },
      include: {
        supplier: { select: { id: true, name: true } },
        items: {
          include: { medicine: { select: { name: true, nameAr: true } } },
        },
      },
    });
  }

  private async assertBranchAndSupplier(
    tenantId: string,
    branchId: string,
    supplierId: string,
  ) {
    const [branch, supplier] = await Promise.all([
      this.prisma.branch.findFirst({ where: { id: branchId, tenantId } }),
      this.prisma.supplier.findFirst({ where: { id: supplierId, tenantId } }),
    ]);
    if (!branch) throw new BadRequestException('Branch not found');
    if (!supplier) throw new BadRequestException('Supplier not found');
  }

  private async assertMedicines(tenantId: string, ids: string[]) {
    const medicines = await this.prisma.medicine.findMany({
      where: { tenantId, id: { in: ids } },
    });
    if (medicines.length !== new Set(ids).size) {
      throw new BadRequestException('One or more medicines were not found');
    }
    return medicines;
  }
}
