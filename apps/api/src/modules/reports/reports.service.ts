import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, SaleStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { round2, toNumber } from '../../common/utils/numbers';
import { AccountingService } from '../accounting/accounting.service';
import { ReportData } from './report-export.service';

export type ReportType =
  | 'sales'
  | 'purchases'
  | 'inventory'
  | 'profit'
  | 'customers'
  | 'suppliers'
  | 'tax'
  | 'expiry'
  | 'branches';

export interface ReportParams {
  from?: Date;
  to?: Date;
  branchId?: string;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: AccountingService,
  ) {}

  async build(
    tenantId: string,
    type: ReportType,
    params: ReportParams,
  ): Promise<ReportData> {
    switch (type) {
      case 'sales':
        return this.salesReport(tenantId, params);
      case 'purchases':
        return this.purchasesReport(tenantId, params);
      case 'inventory':
        return this.inventoryReport(tenantId, params);
      case 'profit':
        return this.profitReport(tenantId, params);
      case 'customers':
        return this.customersReport(tenantId);
      case 'suppliers':
        return this.suppliersReport(tenantId);
      case 'tax':
        return this.taxReport(tenantId, params);
      case 'expiry':
        return this.expiryReport(tenantId, params);
      case 'branches':
        return this.branchesReport(tenantId, params);
      default:
        throw new BadRequestException(`Unknown report type: ${String(type)}`);
    }
  }

  private periodSubtitle(params: ReportParams): string {
    const from = params.from ? params.from.toISOString().slice(0, 10) : 'Beginning';
    const to = params.to ? params.to.toISOString().slice(0, 10) : 'Today';
    return `Period: ${from} → ${to}`;
  }

  private dateFilter(params: ReportParams) {
    return params.from || params.to
      ? {
          ...(params.from ? { gte: params.from } : {}),
          ...(params.to ? { lte: params.to } : {}),
        }
      : undefined;
  }

  private async salesReport(tenantId: string, params: ReportParams): Promise<ReportData> {
    const createdAt = this.dateFilter(params);
    const sales = await this.prisma.sale.findMany({
      where: {
        tenantId,
        status: { not: SaleStatus.VOID },
        ...(params.branchId ? { branchId: params.branchId } : {}),
        ...(createdAt ? { createdAt } : {}),
      },
      orderBy: { createdAt: 'asc' },
      include: {
        branch: { select: { name: true } },
        customer: { select: { name: true } },
        user: { select: { firstName: true, lastName: true } },
      },
    });

    const rows = sales.map((sale) => ({
      number: sale.number,
      date: sale.createdAt.toISOString().slice(0, 16).replace('T', ' '),
      branch: sale.branch.name,
      cashier: sale.user ? `${sale.user.firstName} ${sale.user.lastName}` : '-',
      customer: sale.customer?.name ?? 'Walk-in',
      payment: sale.paymentMethod,
      subtotal: toNumber(sale.subtotal),
      discount: toNumber(sale.discountAmount),
      tax: toNumber(sale.taxAmount),
      total: toNumber(sale.total),
    }));

    return {
      title: 'Sales Report',
      subtitle: this.periodSubtitle(params),
      columns: [
        { key: 'number', header: 'Invoice', width: 18 },
        { key: 'date', header: 'Date', width: 18 },
        { key: 'branch', header: 'Branch', width: 16 },
        { key: 'cashier', header: 'Cashier', width: 18 },
        { key: 'customer', header: 'Customer', width: 18 },
        { key: 'payment', header: 'Payment', width: 14 },
        { key: 'subtotal', header: 'Subtotal', numeric: true, width: 12 },
        { key: 'discount', header: 'Discount', numeric: true, width: 12 },
        { key: 'tax', header: 'Tax', numeric: true, width: 10 },
        { key: 'total', header: 'Total', numeric: true, width: 12 },
      ],
      rows,
      totals: {
        number: `TOTAL (${rows.length})`,
        subtotal: round2(rows.reduce((s, r) => s + r.subtotal, 0)),
        discount: round2(rows.reduce((s, r) => s + r.discount, 0)),
        tax: round2(rows.reduce((s, r) => s + r.tax, 0)),
        total: round2(rows.reduce((s, r) => s + r.total, 0)),
      },
    };
  }

  private async purchasesReport(tenantId: string, params: ReportParams): Promise<ReportData> {
    const createdAt = this.dateFilter(params);
    const invoices = await this.prisma.purchaseInvoice.findMany({
      where: {
        tenantId,
        ...(params.branchId ? { branchId: params.branchId } : {}),
        ...(createdAt ? { createdAt } : {}),
      },
      orderBy: { createdAt: 'asc' },
      include: {
        supplier: { select: { name: true } },
        branch: { select: { name: true } },
      },
    });
    const rows = invoices.map((invoice) => ({
      number: invoice.number,
      date: invoice.createdAt.toISOString().slice(0, 10),
      supplier: invoice.supplier.name,
      branch: invoice.branch.name,
      subtotal: toNumber(invoice.subtotal),
      discount: toNumber(invoice.discountAmount),
      tax: toNumber(invoice.taxAmount),
      total: toNumber(invoice.total),
      paid: toNumber(invoice.paidAmount),
      balance: round2(toNumber(invoice.total) - toNumber(invoice.paidAmount)),
    }));
    return {
      title: 'Purchases Report',
      subtitle: this.periodSubtitle(params),
      columns: [
        { key: 'number', header: 'Invoice', width: 16 },
        { key: 'date', header: 'Date', width: 12 },
        { key: 'supplier', header: 'Supplier', width: 24 },
        { key: 'branch', header: 'Branch', width: 16 },
        { key: 'subtotal', header: 'Subtotal', numeric: true, width: 12 },
        { key: 'discount', header: 'Discount', numeric: true, width: 12 },
        { key: 'tax', header: 'Tax', numeric: true, width: 10 },
        { key: 'total', header: 'Total', numeric: true, width: 12 },
        { key: 'paid', header: 'Paid', numeric: true, width: 12 },
        { key: 'balance', header: 'Balance', numeric: true, width: 12 },
      ],
      rows,
      totals: {
        number: `TOTAL (${rows.length})`,
        total: round2(rows.reduce((s, r) => s + r.total, 0)),
        paid: round2(rows.reduce((s, r) => s + r.paid, 0)),
        balance: round2(rows.reduce((s, r) => s + r.balance, 0)),
      },
    };
  }

  private async inventoryReport(tenantId: string, params: ReportParams): Promise<ReportData> {
    const medicines = await this.prisma.medicine.findMany({
      where: { tenantId, status: 'ACTIVE' },
      orderBy: { name: 'asc' },
      include: {
        batches: {
          include: {
            stockItems: params.branchId
              ? { where: { branchId: params.branchId } }
              : true,
          },
        },
        category: { select: { name: true } },
      },
    });
    const rows = medicines.map((medicine) => {
      const quantity = medicine.batches.reduce(
        (sum, batch) =>
          sum + batch.stockItems.reduce((s, item) => s + item.quantity, 0),
        0,
      );
      const value = medicine.batches.reduce(
        (sum, batch) =>
          sum +
          toNumber(batch.costPrice) *
            batch.stockItems.reduce((s, item) => s + item.quantity, 0),
        0,
      );
      return {
        barcode: medicine.barcode,
        name: medicine.name,
        category: medicine.category?.name ?? '-',
        unit: medicine.unit,
        minStock: medicine.minStock,
        quantity,
        cost: toNumber(medicine.costPrice),
        value: round2(value),
        status:
          quantity === 0 ? 'OUT' : quantity <= medicine.minStock ? 'LOW' : 'OK',
      };
    });
    return {
      title: 'Inventory Report',
      subtitle: this.periodSubtitle(params),
      columns: [
        { key: 'barcode', header: 'Barcode', width: 16 },
        { key: 'name', header: 'Medicine', width: 30 },
        { key: 'category', header: 'Category', width: 16 },
        { key: 'unit', header: 'Unit', width: 8 },
        { key: 'minStock', header: 'Min', width: 8 },
        { key: 'quantity', header: 'Qty', width: 10 },
        { key: 'cost', header: 'Unit Cost', numeric: true, width: 12 },
        { key: 'value', header: 'Value', numeric: true, width: 12 },
        { key: 'status', header: 'Status', width: 8 },
      ],
      rows,
      totals: {
        barcode: `TOTAL (${rows.length})`,
        quantity: rows.reduce((s, r) => s + r.quantity, 0),
        value: round2(rows.reduce((s, r) => s + r.value, 0)),
      },
    };
  }

  private async profitReport(tenantId: string, params: ReportParams): Promise<ReportData> {
    const pnl = await this.accounting.profitAndLoss(
      tenantId,
      params.from,
      params.to,
    );
    const rows: Record<string, string | number>[] = [
      { item: 'Gross Revenue', amount: pnl.grossRevenue },
      { item: 'Tax Collected', amount: -pnl.taxCollected },
      { item: 'Sales Returns', amount: -pnl.returns },
      { item: 'Net Revenue', amount: pnl.netRevenue },
      { item: 'Cost of Goods Sold', amount: -pnl.costOfGoodsSold },
      { item: 'Gross Profit', amount: pnl.grossProfit },
      ...pnl.expenses.map((expense) => ({
        item: `Expense — ${expense.category}`,
        amount: -expense.amount,
      })),
      { item: 'Total Expenses', amount: -pnl.totalExpenses },
    ];
    return {
      title: 'Profit & Loss Report',
      subtitle: this.periodSubtitle(params),
      columns: [
        { key: 'item', header: 'Item', width: 40 },
        { key: 'amount', header: 'Amount', numeric: true, width: 18 },
      ],
      rows,
      totals: { item: 'NET PROFIT', amount: pnl.netProfit },
    };
  }

  private async customersReport(tenantId: string): Promise<ReportData> {
    const customers = await this.prisma.customer.findMany({
      where: { tenantId },
      orderBy: { totalSpent: 'desc' },
      include: { _count: { select: { sales: true } } },
    });
    const rows = customers.map((customer) => ({
      name: customer.name,
      phone: customer.phone ?? '-',
      email: customer.email ?? '-',
      orders: customer._count.sales,
      loyaltyPoints: customer.loyaltyPoints,
      totalSpent: toNumber(customer.totalSpent),
    }));
    return {
      title: 'Customers Report',
      columns: [
        { key: 'name', header: 'Customer', width: 26 },
        { key: 'phone', header: 'Phone', width: 16 },
        { key: 'email', header: 'Email', width: 24 },
        { key: 'orders', header: 'Orders', width: 10 },
        { key: 'loyaltyPoints', header: 'Points', width: 10 },
        { key: 'totalSpent', header: 'Total Spent', numeric: true, width: 14 },
      ],
      rows,
      totals: {
        name: `TOTAL (${rows.length})`,
        totalSpent: round2(rows.reduce((s, r) => s + r.totalSpent, 0)),
      },
    };
  }

  private async suppliersReport(tenantId: string): Promise<ReportData> {
    const suppliers = await this.prisma.supplier.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });
    const rows = await Promise.all(
      suppliers.map(async (supplier) => {
        const agg = await this.prisma.purchaseInvoice.aggregate({
          where: { tenantId, supplierId: supplier.id },
          _sum: { total: true, paidAmount: true },
          _count: true,
        });
        return {
          name: supplier.name,
          phone: supplier.phone ?? '-',
          invoices: agg._count,
          purchased: toNumber(agg._sum.total),
          paid: toNumber(agg._sum.paidAmount),
          balance: round2(
            toNumber(supplier.openingBalance) +
              toNumber(agg._sum.total) -
              toNumber(agg._sum.paidAmount),
          ),
        };
      }),
    );
    return {
      title: 'Suppliers Report',
      columns: [
        { key: 'name', header: 'Supplier', width: 28 },
        { key: 'phone', header: 'Phone', width: 16 },
        { key: 'invoices', header: 'Invoices', width: 10 },
        { key: 'purchased', header: 'Purchased', numeric: true, width: 14 },
        { key: 'paid', header: 'Paid', numeric: true, width: 14 },
        { key: 'balance', header: 'Balance', numeric: true, width: 14 },
      ],
      rows,
      totals: {
        name: `TOTAL (${rows.length})`,
        purchased: round2(rows.reduce((s, r) => s + r.purchased, 0)),
        paid: round2(rows.reduce((s, r) => s + r.paid, 0)),
        balance: round2(rows.reduce((s, r) => s + r.balance, 0)),
      },
    };
  }

  private async taxReport(tenantId: string, params: ReportParams): Promise<ReportData> {
    const createdAt = this.dateFilter(params);
    const sales = await this.prisma.sale.findMany({
      where: {
        tenantId,
        status: { not: SaleStatus.VOID },
        ...(createdAt ? { createdAt } : {}),
      },
      select: { number: true, createdAt: true, subtotal: true, taxAmount: true, total: true },
      orderBy: { createdAt: 'asc' },
    });
    const rows = sales
      .filter((sale) => toNumber(sale.taxAmount) > 0)
      .map((sale) => ({
        number: sale.number,
        date: sale.createdAt.toISOString().slice(0, 10),
        taxable: round2(toNumber(sale.total) - toNumber(sale.taxAmount)),
        tax: toNumber(sale.taxAmount),
        total: toNumber(sale.total),
      }));
    return {
      title: 'Tax Report (Output VAT)',
      subtitle: this.periodSubtitle(params),
      columns: [
        { key: 'number', header: 'Invoice', width: 18 },
        { key: 'date', header: 'Date', width: 12 },
        { key: 'taxable', header: 'Taxable Amount', numeric: true, width: 16 },
        { key: 'tax', header: 'Tax', numeric: true, width: 12 },
        { key: 'total', header: 'Total', numeric: true, width: 12 },
      ],
      rows,
      totals: {
        number: `TOTAL (${rows.length})`,
        taxable: round2(rows.reduce((s, r) => s + r.taxable, 0)),
        tax: round2(rows.reduce((s, r) => s + r.tax, 0)),
        total: round2(rows.reduce((s, r) => s + r.total, 0)),
      },
    };
  }

  private async expiryReport(tenantId: string, params: ReportParams): Promise<ReportData> {
    const settings = await this.prisma.tenantSetting.findUnique({
      where: { tenantId },
    });
    const nearDays = settings?.nearExpiryDays ?? 90;
    const now = new Date();
    const nearDate = new Date(now.getTime() + nearDays * 24 * 60 * 60 * 1000);

    const batches = await this.prisma.batch.findMany({
      where: {
        tenantId,
        expiryDate: { lte: nearDate },
        stockItems: {
          some: {
            quantity: { gt: 0 },
            ...(params.branchId ? { branchId: params.branchId } : {}),
          },
        },
      },
      orderBy: { expiryDate: 'asc' },
      include: {
        medicine: { select: { name: true, barcode: true } },
        stockItems: params.branchId
          ? { where: { branchId: params.branchId } }
          : true,
      },
    });
    const rows = batches.map((batch) => {
      const quantity = batch.stockItems.reduce((s, item) => s + item.quantity, 0);
      const daysLeft = Math.ceil(
        (batch.expiryDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
      );
      return {
        barcode: batch.medicine.barcode,
        medicine: batch.medicine.name,
        batch: batch.batchNumber,
        expiry: batch.expiryDate.toISOString().slice(0, 10),
        daysLeft,
        quantity,
        value: round2(quantity * toNumber(batch.costPrice)),
        status: daysLeft <= 0 ? 'EXPIRED' : 'NEAR EXPIRY',
      };
    });
    return {
      title: 'Expiry Report',
      subtitle: `Batches expiring within ${nearDays} days (or already expired)`,
      columns: [
        { key: 'barcode', header: 'Barcode', width: 16 },
        { key: 'medicine', header: 'Medicine', width: 28 },
        { key: 'batch', header: 'Batch', width: 14 },
        { key: 'expiry', header: 'Expiry', width: 12 },
        { key: 'daysLeft', header: 'Days Left', width: 10 },
        { key: 'quantity', header: 'Qty', width: 8 },
        { key: 'value', header: 'Value at Risk', numeric: true, width: 14 },
        { key: 'status', header: 'Status', width: 12 },
      ],
      rows,
      totals: {
        barcode: `TOTAL (${rows.length})`,
        quantity: rows.reduce((s, r) => s + r.quantity, 0),
        value: round2(rows.reduce((s, r) => s + r.value, 0)),
      },
    };
  }

  private async branchesReport(tenantId: string, params: ReportParams): Promise<ReportData> {
    const createdAt = this.dateFilter(params);
    const branches = await this.prisma.branch.findMany({
      where: { tenantId },
      orderBy: [{ isMain: 'desc' }, { name: 'asc' }],
    });
    const rows = await Promise.all(
      branches.map(async (branch) => {
        const [salesAgg, itemsAgg, stockRows] = await Promise.all([
          this.prisma.sale.aggregate({
            where: {
              tenantId,
              branchId: branch.id,
              status: { not: SaleStatus.VOID },
              ...(createdAt ? { createdAt } : {}),
            },
            _sum: { total: true },
            _count: true,
          }),
          this.prisma.expense.aggregate({
            where: {
              tenantId,
              branchId: branch.id,
              ...(createdAt ? { date: createdAt } : {}),
            },
            _sum: { amount: true },
          }),
          this.prisma.stockItem.findMany({
            where: { tenantId, branchId: branch.id, quantity: { gt: 0 } },
            select: { quantity: true, batch: { select: { costPrice: true } } },
          }),
        ]);
        return {
          branch: branch.name,
          type: branch.isMain ? 'Main' : 'Branch',
          sales: salesAgg._count,
          revenue: toNumber(salesAgg._sum.total),
          expenses: toNumber(itemsAgg._sum.amount),
          inventoryValue: round2(
            stockRows.reduce(
              (sum, row) => sum + row.quantity * toNumber(row.batch.costPrice),
              0,
            ),
          ),
        };
      }),
    );
    return {
      title: 'Branch Performance Report',
      subtitle: this.periodSubtitle(params),
      columns: [
        { key: 'branch', header: 'Branch', width: 26 },
        { key: 'type', header: 'Type', width: 10 },
        { key: 'sales', header: 'Sales', width: 10 },
        { key: 'revenue', header: 'Revenue', numeric: true, width: 14 },
        { key: 'expenses', header: 'Expenses', numeric: true, width: 14 },
        { key: 'inventoryValue', header: 'Inventory Value', numeric: true, width: 16 },
      ],
      rows,
      totals: {
        branch: `TOTAL (${rows.length})`,
        revenue: round2(rows.reduce((s, r) => s + r.revenue, 0)),
        expenses: round2(rows.reduce((s, r) => s + r.expenses, 0)),
        inventoryValue: round2(rows.reduce((s, r) => s + r.inventoryValue, 0)),
      },
    };
  }
}
