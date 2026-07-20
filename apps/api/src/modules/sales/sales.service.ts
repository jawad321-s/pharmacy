import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  LedgerAccount,
  LedgerSide,
  Prisma,
  SaleStatus,
  StockMovementType,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { paginate } from '../../common/types';
import { round2, toNumber } from '../../common/utils/numbers';
import { StockService } from '../inventory/stock.service';
import { LedgerService } from '../accounting/ledger.service';
import {
  CreateSaleDto,
  CreateSaleReturnDto,
  SalesQueryDto,
} from './sales.dto';

const SALE_INCLUDE = {
  items: {
    include: {
      medicine: {
        select: { id: true, name: true, nameAr: true, barcode: true, unit: true },
      },
    },
  },
  customer: { select: { id: true, name: true, phone: true, loyaltyPoints: true } },
  user: { select: { id: true, firstName: true, lastName: true } },
  branch: { select: { id: true, name: true } },
} satisfies Prisma.SaleInclude;

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
    private readonly ledger: LedgerService,
  ) {}

  async list(tenantId: string, query: SalesQueryDto) {
    const where: Prisma.SaleWhereInput = {
      tenantId,
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
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
      this.prisma.sale.findMany({
        where,
        include: SALE_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.pageSize,
      }),
      this.prisma.sale.count({ where }),
    ]);
    return paginate(data, total, query.page, query.pageSize);
  }

  async get(tenantId: string, id: string) {
    const sale = await this.prisma.sale.findFirst({
      where: { id, tenantId },
      include: {
        ...SALE_INCLUDE,
        returns: { include: { items: true } },
        tenant: {
          select: {
            name: true,
            currency: true,
            address: true,
            phone: true,
            logoUrl: true,
            settings: { select: { receiptHeader: true, receiptFooter: true } },
          },
        },
      },
    });
    if (!sale) {
      throw new NotFoundException('Sale not found');
    }
    return sale;
  }

  /**
   * POS checkout. Validates stock and expiry (via FEFO allocator which
   * never allocates expired batches), computes totals server-side,
   * updates loyalty points and posts ledger entries — all in one
   * transaction.
   */
  async create(tenantId: string, dto: CreateSaleDto, userId: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { id: dto.branchId, tenantId, isActive: true },
    });
    if (!branch) {
      throw new BadRequestException('Branch not found');
    }

    const [settings, tenant] = await Promise.all([
      this.prisma.tenantSetting.findUnique({ where: { tenantId } }),
      this.prisma.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        select: { currency: true },
      }),
    ]);
    const loyaltyEarnRate = toNumber(settings?.loyaltyEarnRate ?? 1);
    const loyaltyRedeemValue = toNumber(settings?.loyaltyRedeemValue ?? 0.01);

    // Resolve the payment currency and its exchange rate to the base
    // currency. Base currency is always rate 1; other currencies must be
    // configured in tenant settings.
    const baseCurrency = tenant.currency;
    const paymentCurrency = (dto.paymentCurrency ?? baseCurrency).toUpperCase();
    const rates = (settings?.exchangeRates ?? {}) as Record<string, number>;
    let exchangeRate = 1;
    if (paymentCurrency !== baseCurrency) {
      const configured = Number(rates[paymentCurrency]);
      if (!Number.isFinite(configured) || configured <= 0) {
        throw new BadRequestException(
          `No exchange rate configured for ${paymentCurrency}`,
        );
      }
      exchangeRate = configured;
    }

    const medicineIds = [...new Set(dto.items.map((item) => item.medicineId))];
    const medicines = await this.prisma.medicine.findMany({
      where: { tenantId, id: { in: medicineIds }, status: 'ACTIVE' },
    });
    const medicineById = new Map(medicines.map((m) => [m.id, m]));
    for (const id of medicineIds) {
      if (!medicineById.has(id)) {
        throw new BadRequestException(`Medicine ${id} not found or archived`);
      }
    }

    let customer = null;
    if (dto.customerId) {
      customer = await this.prisma.customer.findFirst({
        where: { id: dto.customerId, tenantId, isActive: true },
      });
      if (!customer) {
        throw new BadRequestException('Customer not found');
      }
    }
    const redeemPoints = dto.redeemPoints ?? 0;
    if (redeemPoints > 0) {
      if (!customer) {
        throw new BadRequestException('Select a customer to redeem points');
      }
      if (customer.loyaltyPoints < redeemPoints) {
        throw new BadRequestException('Not enough loyalty points');
      }
    }

    // Server-side pricing: line totals, invoice discount, taxes.
    const discountPercent = dto.discountPercent ?? 0;
    let subtotal = 0;
    const pricedItems = dto.items.map((item) => {
      const medicine = medicineById.get(item.medicineId)!;
      const unitPrice = toNumber(medicine.sellingPrice);
      const lineGross = unitPrice * item.quantity;
      const lineDiscount = item.discount ?? 0;
      if (lineDiscount > lineGross) {
        throw new BadRequestException(
          `Discount on ${medicine.name} exceeds the line total`,
        );
      }
      subtotal += lineGross;
      return { ...item, medicine, unitPrice, lineGross, lineDiscount };
    });

    const lineDiscountTotal = pricedItems.reduce((s, i) => s + i.lineDiscount, 0);
    const invoiceDiscount = round2(
      ((subtotal - lineDiscountTotal) * discountPercent) / 100,
    );
    const discountAmount = round2(lineDiscountTotal + invoiceDiscount);

    let taxAmount = 0;
    for (const item of pricedItems) {
      const lineNet =
        (item.lineGross - item.lineDiscount) * (1 - discountPercent / 100);
      taxAmount += (lineNet * toNumber(item.medicine.taxRate)) / 100;
    }
    taxAmount = round2(taxAmount);

    const redeemValue = round2(redeemPoints * loyaltyRedeemValue);
    const total = round2(subtotal - discountAmount + taxAmount - redeemValue);
    if (total < 0) {
      throw new BadRequestException('Total cannot be negative');
    }
    // Convert the tendered amount from the payment currency to the base
    // currency. total, paidAmount and changeAmount are always stored in
    // the base currency; paidCurrencyAmount keeps the original tender.
    const paidInBase = round2(dto.paidAmount * exchangeRate);
    if (paidInBase + 0.005 < total) {
      throw new BadRequestException('Paid amount is less than the total');
    }
    const changeAmount = round2(paidInBase - total);
    const loyaltyEarned = customer ? Math.floor(total * loyaltyEarnRate) : 0;

    return this.prisma.$transaction(async (tx) => {
      const seq = await tx.sale.count({ where: { tenantId } });
      const prefix = settings?.invoicePrefix ?? 'INV';
      const number = `${prefix}-${new Date().getFullYear()}-${String(seq + 1).padStart(6, '0')}`;

      const sale = await tx.sale.create({
        data: {
          tenantId,
          branchId: dto.branchId,
          number,
          userId,
          customerId: customer?.id ?? null,
          subtotal: round2(subtotal),
          discountAmount,
          taxAmount,
          total,
          paidAmount: paidInBase,
          changeAmount,
          paymentMethod: dto.paymentMethod,
          paymentCurrency,
          exchangeRate,
          paidCurrencyAmount: dto.paidAmount,
          loyaltyEarned,
          loyaltyRedeemed: redeemPoints,
          notes: dto.notes ?? null,
        },
      });

      let costOfGoods = 0;
      for (const item of pricedItems) {
        // FEFO allocation — throws on insufficient / expired-only stock.
        const allocations = await this.stock.allocateFefo(
          tx,
          tenantId,
          dto.branchId,
          item.medicineId,
          item.quantity,
          { userId, refType: 'sale', refId: sale.id },
          StockMovementType.SALE,
        );
        const itemCost = allocations.reduce(
          (sum, a) => sum + a.costPrice * a.quantity,
          0,
        );
        costOfGoods += itemCost;

        const lineNet = round2(
          (item.lineGross - item.lineDiscount) * (1 - discountPercent / 100),
        );
        const lineTax = round2((lineNet * toNumber(item.medicine.taxRate)) / 100);

        await tx.saleItem.create({
          data: {
            saleId: sale.id,
            medicineId: item.medicineId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            costPrice: round2(itemCost / item.quantity),
            discount: item.lineDiscount,
            taxRate: toNumber(item.medicine.taxRate),
            taxAmount: lineTax,
            total: round2(lineNet + lineTax),
            allocations: allocations.map((a) => ({
              batchId: a.batchId,
              batchNumber: a.batchNumber,
              quantity: a.quantity,
            })) as Prisma.InputJsonValue,
          },
        });
      }

      if (customer) {
        await tx.customer.update({
          where: { id: customer.id },
          data: {
            loyaltyPoints: {
              increment: loyaltyEarned - redeemPoints,
            },
            totalSpent: { increment: total },
          },
        });
      }

      await this.ledger.post(
        tx,
        tenantId,
        [
          {
            account: LedgerAccount.CASH,
            side: LedgerSide.DEBIT,
            amount: total,
            description: `Sale ${number}`,
          },
          {
            account: LedgerAccount.SALES_REVENUE,
            side: LedgerSide.CREDIT,
            amount: round2(total - taxAmount),
            description: `Sale ${number}`,
          },
          {
            account: LedgerAccount.TAX_PAYABLE,
            side: LedgerSide.CREDIT,
            amount: taxAmount,
            description: `VAT on sale ${number}`,
          },
          {
            account: LedgerAccount.COST_OF_GOODS_SOLD,
            side: LedgerSide.DEBIT,
            amount: round2(costOfGoods),
            description: `COGS for sale ${number}`,
          },
          {
            account: LedgerAccount.INVENTORY,
            side: LedgerSide.CREDIT,
            amount: round2(costOfGoods),
            description: `Inventory relief for sale ${number}`,
          },
        ],
        { refType: 'sale', refId: sale.id },
      );

      return tx.sale.findUniqueOrThrow({
        where: { id: sale.id },
        include: SALE_INCLUDE,
      });
    });
  }

  /**
   * Returns items from a sale. Stock is restored to the original batches
   * recorded in the FEFO allocations; refund is proportional to what was
   * actually paid per line (net of discounts + tax).
   */
  async createReturn(
    tenantId: string,
    saleId: string,
    dto: CreateSaleReturnDto,
    userId: string,
  ) {
    const sale = await this.prisma.sale.findFirst({
      where: { id: saleId, tenantId },
      include: { items: true },
    });
    if (!sale) {
      throw new NotFoundException('Sale not found');
    }
    if (sale.status === SaleStatus.VOID) {
      throw new BadRequestException('Voided sales cannot be returned');
    }

    const itemsById = new Map(sale.items.map((item) => [item.id, item]));
    for (const entry of dto.items) {
      const item = itemsById.get(entry.saleItemId);
      if (!item) {
        throw new BadRequestException('Sale item not found on this invoice');
      }
      if (entry.quantity > item.quantity - item.returnedQty) {
        throw new BadRequestException(
          `Return quantity exceeds remaining quantity for item ${item.id}`,
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const seq = await tx.saleReturn.count({ where: { tenantId } });
      const number = `RET-${new Date().getFullYear()}-${String(seq + 1).padStart(6, '0')}`;

      let refundTotal = 0;
      const returnItemsData: { saleItemId: string; quantity: number; amount: number }[] = [];

      for (const entry of dto.items) {
        const item = itemsById.get(entry.saleItemId)!;
        const perUnitPaid = toNumber(item.total) / item.quantity;
        const amount = round2(perUnitPaid * entry.quantity);
        refundTotal += amount;
        returnItemsData.push({
          saleItemId: item.id,
          quantity: entry.quantity,
          amount,
        });

        // Restore stock to original batches, oldest allocation first.
        const allocations = (item.allocations as { batchId: string; quantity: number }[]) ?? [];
        let remaining = entry.quantity;
        const alreadyReturned = item.returnedQty;
        // Skip allocations consumed by previous returns.
        let skip = alreadyReturned;
        for (const allocation of allocations) {
          let availableInAllocation = allocation.quantity;
          if (skip > 0) {
            const consumed = Math.min(skip, availableInAllocation);
            availableInAllocation -= consumed;
            skip -= consumed;
          }
          if (availableInAllocation <= 0 || remaining <= 0) continue;
          const put = Math.min(availableInAllocation, remaining);
          remaining -= put;
          await this.stock.addStock(
            tx,
            tenantId,
            sale.branchId,
            item.medicineId,
            allocation.batchId,
            put,
            StockMovementType.SALE_RETURN,
            { userId, refType: 'sale-return', refId: sale.id, reason: dto.reason },
          );
        }
        if (remaining > 0) {
          throw new BadRequestException(
            'Batch allocation data is inconsistent with the return quantity',
          );
        }

        await tx.saleItem.update({
          where: { id: item.id },
          data: { returnedQty: { increment: entry.quantity } },
        });
      }

      refundTotal = round2(refundTotal);
      const saleReturn = await tx.saleReturn.create({
        data: {
          tenantId,
          branchId: sale.branchId,
          saleId: sale.id,
          number,
          userId,
          reason: dto.reason ?? null,
          total: refundTotal,
          items: { create: returnItemsData },
        },
        include: { items: true },
      });

      const updatedItems = await tx.saleItem.findMany({
        where: { saleId: sale.id },
      });
      const fullyReturned = updatedItems.every(
        (item) => item.returnedQty >= item.quantity,
      );
      await tx.sale.update({
        where: { id: sale.id },
        data: {
          status: fullyReturned
            ? SaleStatus.REFUNDED
            : SaleStatus.PARTIALLY_REFUNDED,
        },
      });

      await this.ledger.post(
        tx,
        tenantId,
        [
          {
            account: LedgerAccount.SALES_RETURNS,
            side: LedgerSide.DEBIT,
            amount: refundTotal,
            description: `Sale return ${number}`,
          },
          {
            account: LedgerAccount.CASH,
            side: LedgerSide.CREDIT,
            amount: refundTotal,
            description: `Refund for ${number}`,
          },
        ],
        { refType: 'sale-return', refId: saleReturn.id },
      );

      return saleReturn;
    });
  }

  /**
   * Voids a same-day unreturned sale: restores all stock and reverses
   * loyalty and ledger effects.
   */
  async voidSale(tenantId: string, saleId: string, userId: string) {
    const sale = await this.prisma.sale.findFirst({
      where: { id: saleId, tenantId },
      include: { items: true },
    });
    if (!sale) {
      throw new NotFoundException('Sale not found');
    }
    if (sale.status !== SaleStatus.COMPLETED) {
      throw new BadRequestException('Only completed sales can be voided');
    }
    if (sale.items.some((item) => item.returnedQty > 0)) {
      throw new BadRequestException('Sales with returns cannot be voided');
    }

    return this.prisma.$transaction(async (tx) => {
      for (const item of sale.items) {
        const allocations =
          (item.allocations as { batchId: string; quantity: number }[]) ?? [];
        for (const allocation of allocations) {
          await this.stock.addStock(
            tx,
            tenantId,
            sale.branchId,
            item.medicineId,
            allocation.batchId,
            allocation.quantity,
            StockMovementType.SALE_RETURN,
            { userId, refType: 'sale-void', refId: sale.id, reason: 'Sale voided' },
          );
        }
      }

      if (sale.customerId) {
        await tx.customer.update({
          where: { id: sale.customerId },
          data: {
            loyaltyPoints: {
              increment: sale.loyaltyRedeemed - sale.loyaltyEarned,
            },
            totalSpent: { decrement: toNumber(sale.total) },
          },
        });
      }

      await this.ledger.post(
        tx,
        tenantId,
        [
          {
            account: LedgerAccount.SALES_RETURNS,
            side: LedgerSide.DEBIT,
            amount: toNumber(sale.total),
            description: `Void sale ${sale.number}`,
          },
          {
            account: LedgerAccount.CASH,
            side: LedgerSide.CREDIT,
            amount: toNumber(sale.total),
            description: `Void sale ${sale.number}`,
          },
        ],
        { refType: 'sale-void', refId: sale.id },
      );

      return tx.sale.update({
        where: { id: sale.id },
        data: { status: SaleStatus.VOID },
        include: SALE_INCLUDE,
      });
    });
  }
}
