import { Injectable } from '@nestjs/common';
import { Prisma, SaleStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { round2, toNumber } from '../../common/utils/numbers';
import { InventoryService } from '../inventory/inventory.service';
import { AccountingService } from '../accounting/accounting.service';

function startOfDay(date = new Date()): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfMonth(date = new Date()): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), 1);
  return d;
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly accounting: AccountingService,
  ) {}

  async tenantDashboard(tenantId: string, branchId?: string) {
    const now = new Date();
    const today = startOfDay(now);
    const monthStart = startOfMonth(now);

    const baseSaleWhere: Prisma.SaleWhereInput = {
      tenantId,
      status: { not: SaleStatus.VOID },
      ...(branchId ? { branchId } : {}),
    };

    const [todayAgg, monthAgg, monthExpenses, monthPnl, alerts, inventoryValueRows, recentSales, topRows] =
      await Promise.all([
        this.prisma.sale.aggregate({
          where: { ...baseSaleWhere, createdAt: { gte: today } },
          _sum: { total: true },
          _count: true,
        }),
        this.prisma.sale.aggregate({
          where: { ...baseSaleWhere, createdAt: { gte: monthStart } },
          _sum: { total: true },
          _count: true,
        }),
        this.prisma.expense.aggregate({
          where: { tenantId, date: { gte: monthStart } },
          _sum: { amount: true },
        }),
        this.accounting.profitAndLoss(tenantId, monthStart, now),
        this.inventory.alertsSummary(tenantId, branchId),
        this.prisma.stockItem.findMany({
          where: { tenantId, quantity: { gt: 0 }, ...(branchId ? { branchId } : {}) },
          select: { quantity: true, batch: { select: { costPrice: true } } },
        }),
        this.prisma.sale.findMany({
          where: baseSaleWhere,
          orderBy: { createdAt: 'desc' },
          take: 8,
          select: {
            id: true,
            number: true,
            total: true,
            paymentMethod: true,
            status: true,
            createdAt: true,
            customer: { select: { name: true } },
            user: { select: { firstName: true, lastName: true } },
          },
        }),
        this.prisma.saleItem.groupBy({
          by: ['medicineId'],
          where: { sale: { ...baseSaleWhere, createdAt: { gte: monthStart } } },
          _sum: { quantity: true, total: true },
          orderBy: { _sum: { quantity: 'desc' } },
          take: 5,
        }),
      ]);

    const inventoryValue = round2(
      inventoryValueRows.reduce(
        (sum, row) => sum + row.quantity * toNumber(row.batch.costPrice),
        0,
      ),
    );

    // Receivables (money customers owe us) and payables (money we owe
    // suppliers) — a headline cash-position figure for the owner.
    const [
      customerOpening,
      creditAgg,
      customerPaid,
      supplierOpening,
      purchaseAgg,
      purchaseReturnAgg,
    ] = await Promise.all([
      this.prisma.customer.aggregate({
        where: { tenantId },
        _sum: { openingBalance: true },
      }),
      this.prisma.sale.aggregate({
        where: { tenantId },
        _sum: { creditAmount: true },
      }),
      this.prisma.customerPayment.aggregate({
        where: { tenantId },
        _sum: { amount: true },
      }),
      this.prisma.supplier.aggregate({
        where: { tenantId },
        _sum: { openingBalance: true },
      }),
      this.prisma.purchaseInvoice.aggregate({
        where: { tenantId },
        _sum: { total: true, paidAmount: true },
      }),
      this.prisma.purchaseReturn.aggregate({
        where: { tenantId },
        _sum: { total: true },
      }),
    ]);

    const receivables = round2(
      toNumber(customerOpening._sum.openingBalance) +
        toNumber(creditAgg._sum.creditAmount) -
        toNumber(customerPaid._sum.amount),
    );
    const payables = round2(
      toNumber(supplierOpening._sum.openingBalance) +
        toNumber(purchaseAgg._sum.total) -
        toNumber(purchaseAgg._sum.paidAmount) -
        toNumber(purchaseReturnAgg._sum.total),
    );

    const topMedicineIds = topRows.map((row) => row.medicineId);
    const topMedicines = await this.prisma.medicine.findMany({
      where: { id: { in: topMedicineIds } },
      select: { id: true, name: true, nameAr: true },
    });
    const nameById = new Map(topMedicines.map((m) => [m.id, m]));

    // 14-day sales chart
    const chartStart = new Date(today.getTime() - 13 * 24 * 60 * 60 * 1000);
    const chartSales = await this.prisma.sale.findMany({
      where: { ...baseSaleWhere, createdAt: { gte: chartStart } },
      select: { total: true, createdAt: true },
    });
    const chart = new Map<string, number>();
    for (let i = 0; i < 14; i += 1) {
      const day = new Date(chartStart.getTime() + i * 24 * 60 * 60 * 1000);
      chart.set(day.toISOString().slice(0, 10), 0);
    }
    for (const sale of chartSales) {
      const day = sale.createdAt.toISOString().slice(0, 10);
      chart.set(day, (chart.get(day) ?? 0) + toNumber(sale.total));
    }

    return {
      revenueToday: toNumber(todayAgg._sum.total),
      salesCountToday: todayAgg._count,
      revenueMonth: toNumber(monthAgg._sum.total),
      salesCountMonth: monthAgg._count,
      expensesMonth: toNumber(monthExpenses._sum.amount),
      profitMonth: monthPnl.netProfit,
      inventoryValue,
      receivables,
      payables,
      alerts,
      recentSales,
      topMedicines: topRows.map((row) => ({
        medicineId: row.medicineId,
        name: nameById.get(row.medicineId)?.name ?? 'Unknown',
        nameAr: nameById.get(row.medicineId)?.nameAr ?? null,
        quantity: row._sum.quantity ?? 0,
        revenue: toNumber(row._sum.total),
      })),
      salesChart: [...chart.entries()].map(([date, total]) => ({
        date,
        total: round2(total),
      })),
    };
  }
}
