import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ExpenseCategory,
  LedgerAccount,
  LedgerSide,
  Prisma,
  SaleStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { paginate } from '../../common/types';
import { round2, toNumber } from '../../common/utils/numbers';
import { LedgerService } from './ledger.service';
import {
  CreateExpenseDto,
  ExpenseQueryDto,
  LedgerQueryDto,
  UpdateExpenseDto,
} from './accounting.dto';

@Injectable()
export class AccountingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
  ) {}

  // ------------------------------------------------------------------
  // Expenses
  // ------------------------------------------------------------------

  async listExpenses(tenantId: string, query: ExpenseQueryDto) {
    const where: Prisma.ExpenseWhereInput = {
      tenantId,
      ...(query.category ? { category: query.category } : {}),
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.fromDate || query.toDate
        ? {
            date: {
              ...(query.fromDate ? { gte: query.fromDate } : {}),
              ...(query.toDate ? { lte: query.toDate } : {}),
            },
          }
        : {}),
    };
    const [data, total, sum] = await this.prisma.$transaction([
      this.prisma.expense.findMany({
        where,
        orderBy: { date: 'desc' },
        skip: query.skip,
        take: query.pageSize,
        include: {
          user: { select: { firstName: true, lastName: true } },
          branch: { select: { name: true } },
        },
      }),
      this.prisma.expense.count({ where }),
      this.prisma.expense.aggregate({ where, _sum: { amount: true } }),
    ]);
    return {
      ...paginate(data, total, query.page, query.pageSize),
      totalAmount: toNumber(sum._sum.amount),
    };
  }

  async createExpense(tenantId: string, dto: CreateExpenseDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const expense = await tx.expense.create({
        data: {
          tenantId,
          branchId: dto.branchId ?? null,
          category: dto.category,
          amount: dto.amount,
          description: dto.description ?? null,
          date: dto.date ? new Date(dto.date) : new Date(),
          userId,
        },
      });
      await this.ledger.post(
        tx,
        tenantId,
        [
          {
            account: LedgerAccount.EXPENSES,
            side: LedgerSide.DEBIT,
            amount: dto.amount,
            description: `${dto.category} expense`,
          },
          {
            account: LedgerAccount.CASH,
            side: LedgerSide.CREDIT,
            amount: dto.amount,
            description: `${dto.category} expense`,
          },
        ],
        { refType: 'expense', refId: expense.id, date: expense.date },
      );
      return expense;
    });
  }

  async updateExpense(tenantId: string, id: string, dto: UpdateExpenseDto) {
    const expense = await this.prisma.expense.findFirst({
      where: { id, tenantId },
    });
    if (!expense) throw new NotFoundException('Expense not found');
    return this.prisma.expense.update({
      where: { id },
      data: {
        ...(dto.category !== undefined ? { category: dto.category } : {}),
        ...(dto.amount !== undefined ? { amount: dto.amount } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.date !== undefined ? { date: new Date(dto.date) } : {}),
        ...(dto.branchId !== undefined ? { branchId: dto.branchId } : {}),
      },
    });
  }

  async removeExpense(tenantId: string, id: string) {
    const expense = await this.prisma.expense.findFirst({
      where: { id, tenantId },
    });
    if (!expense) throw new NotFoundException('Expense not found');
    return this.prisma.$transaction(async (tx) => {
      await tx.ledgerEntry.deleteMany({
        where: { tenantId, refType: 'expense', refId: id },
      });
      return tx.expense.delete({ where: { id } });
    });
  }

  // ------------------------------------------------------------------
  // Financial statements
  // ------------------------------------------------------------------

  /**
   * Profit & Loss statement for a period.
   */
  async profitAndLoss(tenantId: string, from?: Date, to?: Date) {
    const dateFilter = {
      ...(from ? { gte: from } : {}),
      ...(to ? { lte: to } : {}),
    };
    const saleWhere: Prisma.SaleWhereInput = {
      tenantId,
      status: { not: SaleStatus.VOID },
      ...(from || to ? { createdAt: dateFilter } : {}),
    };

    const [salesAgg, saleItems, returnsAgg, expensesByCategory] =
      await Promise.all([
        this.prisma.sale.aggregate({
          where: saleWhere,
          _sum: { total: true, taxAmount: true, discountAmount: true },
          _count: true,
        }),
        this.prisma.saleItem.findMany({
          where: { sale: saleWhere },
          select: { costPrice: true, quantity: true, returnedQty: true },
        }),
        this.prisma.saleReturn.aggregate({
          where: { tenantId, ...(from || to ? { createdAt: dateFilter } : {}) },
          _sum: { total: true },
        }),
        this.prisma.expense.groupBy({
          by: ['category'],
          where: { tenantId, ...(from || to ? { date: dateFilter } : {}) },
          _sum: { amount: true },
        }),
      ]);

    const grossRevenue = toNumber(salesAgg._sum.total);
    const taxCollected = toNumber(salesAgg._sum.taxAmount);
    const returns = toNumber(returnsAgg._sum.total);
    const netRevenue = round2(grossRevenue - taxCollected - returns);
    const costOfGoodsSold = round2(
      saleItems.reduce(
        (sum, item) =>
          sum + toNumber(item.costPrice) * (item.quantity - item.returnedQty),
        0,
      ),
    );
    const grossProfit = round2(netRevenue - costOfGoodsSold);

    const expenses = Object.values(ExpenseCategory).map((category) => ({
      category,
      amount: toNumber(
        expensesByCategory.find((e) => e.category === category)?._sum.amount,
      ),
    }));
    const totalExpenses = round2(
      expenses.reduce((sum, e) => sum + e.amount, 0),
    );
    const netProfit = round2(grossProfit - totalExpenses);

    return {
      grossRevenue,
      taxCollected,
      returns,
      netRevenue,
      costOfGoodsSold,
      grossProfit,
      expenses,
      totalExpenses,
      netProfit,
      salesCount: salesAgg._count,
    };
  }

  /**
   * Cash flow: cash-affecting ledger movements grouped by day.
   */
  async cashFlow(tenantId: string, from?: Date, to?: Date) {
    const entries = await this.prisma.ledgerEntry.findMany({
      where: {
        tenantId,
        account: LedgerAccount.CASH,
        ...(from || to
          ? {
              date: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {}),
              },
            }
          : {}),
      },
      orderBy: { date: 'asc' },
    });

    const byDay = new Map<string, { inflow: number; outflow: number }>();
    let totalIn = 0;
    let totalOut = 0;
    for (const entry of entries) {
      const day = entry.date.toISOString().slice(0, 10);
      const bucket = byDay.get(day) ?? { inflow: 0, outflow: 0 };
      if (entry.side === LedgerSide.DEBIT) {
        bucket.inflow += toNumber(entry.amount);
        totalIn += toNumber(entry.amount);
      } else {
        bucket.outflow += toNumber(entry.amount);
        totalOut += toNumber(entry.amount);
      }
      byDay.set(day, bucket);
    }

    let running = 0;
    const days = [...byDay.entries()].map(([date, bucket]) => {
      running += bucket.inflow - bucket.outflow;
      return {
        date,
        inflow: round2(bucket.inflow),
        outflow: round2(bucket.outflow),
        net: round2(bucket.inflow - bucket.outflow),
        balance: round2(running),
      };
    });

    return {
      totalInflow: round2(totalIn),
      totalOutflow: round2(totalOut),
      netCashFlow: round2(totalIn - totalOut),
      days,
    };
  }

  async generalLedger(tenantId: string, query: LedgerQueryDto) {
    const where: Prisma.LedgerEntryWhereInput = {
      tenantId,
      ...(query.account ? { account: query.account } : {}),
      ...(query.fromDate || query.toDate
        ? {
            date: {
              ...(query.fromDate ? { gte: query.fromDate } : {}),
              ...(query.toDate ? { lte: query.toDate } : {}),
            },
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.ledgerEntry.findMany({
        where,
        orderBy: { date: 'desc' },
        skip: query.skip,
        take: query.pageSize,
      }),
      this.prisma.ledgerEntry.count({ where }),
    ]);
    return paginate(data, total, query.page, query.pageSize);
  }
}
