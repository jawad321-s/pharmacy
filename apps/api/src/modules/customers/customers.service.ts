import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  LedgerAccount,
  LedgerSide,
  PaymentMethod,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { paginate } from '../../common/types';
import { round2, toNumber } from '../../common/utils/numbers';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { LedgerService } from '../accounting/ledger.service';
import {
  CreateCustomerDto,
  RecordCustomerPaymentDto,
  UpdateCustomerDto,
} from './customers.dto';

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
  ) {}

  /**
   * Attaches each customer's outstanding debt (balance) to a set of
   * customer rows in a single pair of grouped queries.
   */
  private async withBalances<T extends { id: string; openingBalance: Prisma.Decimal }>(
    tenantId: string,
    customers: T[],
  ): Promise<(T & { balance: number })[]> {
    const ids = customers.map((c) => c.id);
    if (ids.length === 0) return [];
    const [creditRows, paymentRows] = await Promise.all([
      this.prisma.sale.groupBy({
        by: ['customerId'],
        where: { tenantId, customerId: { in: ids } },
        _sum: { creditAmount: true },
      }),
      this.prisma.customerPayment.groupBy({
        by: ['customerId'],
        where: { tenantId, customerId: { in: ids } },
        _sum: { amount: true },
      }),
    ]);
    const creditBy = new Map(
      creditRows.map((r) => [r.customerId, toNumber(r._sum.creditAmount)]),
    );
    const paidBy = new Map(
      paymentRows.map((r) => [r.customerId, toNumber(r._sum.amount)]),
    );
    return customers.map((customer) => ({
      ...customer,
      balance: round2(
        toNumber(customer.openingBalance) +
          (creditBy.get(customer.id) ?? 0) -
          (paidBy.get(customer.id) ?? 0),
      ),
    }));
  }

  async list(
    tenantId: string,
    query: PaginationQueryDto & { withDebt?: boolean },
  ) {
    const where: Prisma.CustomerWhereInput = {
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
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.pageSize,
      }),
      this.prisma.customer.count({ where }),
    ]);
    const data = await this.withBalances(tenantId, rows);
    return paginate(data, total, query.page, query.pageSize);
  }

  /**
   * Customers who currently owe money, plus the total receivable — the
   * data behind the Debts page.
   */
  async debts(tenantId: string, query: PaginationQueryDto) {
    const rows = await this.prisma.customer.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });
    const withBalance = await this.withBalances(tenantId, rows);
    const debtors = withBalance
      .filter((c) => c.balance > 0.005)
      .sort((a, b) => b.balance - a.balance);
    const totalReceivable = round2(
      debtors.reduce((sum, c) => sum + c.balance, 0),
    );
    const start = query.skip;
    const page = debtors.slice(start, start + query.pageSize);
    return {
      ...paginate(page, debtors.length, query.page, query.pageSize),
      totalReceivable,
      debtorCount: debtors.length,
    };
  }

  async get(tenantId: string, id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, tenantId },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }
    const [withBalance] = await this.withBalances(tenantId, [customer]);
    return withBalance;
  }

  /**
   * Customer account statement (كشف حساب): credit sales as debits and
   * settlements as credits, in chronological order with a running balance.
   */
  async statement(tenantId: string, id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, tenantId },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const [creditSales, payments] = await Promise.all([
      this.prisma.sale.findMany({
        where: { tenantId, customerId: id, creditAmount: { gt: 0 } },
        select: {
          id: true,
          number: true,
          total: true,
          creditAmount: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.customerPayment.findMany({
        where: { tenantId, customerId: id },
        orderBy: { createdAt: 'asc' },
        include: { user: { select: { firstName: true, lastName: true } } },
      }),
    ]);

    const entries = [
      ...creditSales.map((sale) => ({
        date: sale.createdAt,
        type: 'CREDIT_SALE' as const,
        reference: sale.number,
        debit: toNumber(sale.creditAmount),
        credit: 0,
        note: null as string | null,
      })),
      ...payments.map((payment) => ({
        date: payment.createdAt,
        type: 'PAYMENT' as const,
        reference: payment.paymentCurrency !== 'ILS'
          ? `${payment.paidCurrencyAmount} ${payment.paymentCurrency}`
          : payment.method,
        debit: 0,
        credit: toNumber(payment.amount),
        note: payment.note,
      })),
    ].sort((a, b) => a.date.getTime() - b.date.getTime());

    let running = toNumber(customer.openingBalance);
    const ledger = entries.map((entry) => {
      running += entry.debit - entry.credit;
      return { ...entry, balance: round2(running) };
    });

    return {
      customer,
      openingBalance: toNumber(customer.openingBalance),
      entries: ledger,
      balance: round2(running),
    };
  }

  /**
   * Records a settlement a customer pays toward their debt. Supports
   * foreign-currency tender converted at the tenant exchange rate, and
   * posts the matching cash / receivable ledger entries.
   */
  async recordPayment(
    tenantId: string,
    id: string,
    dto: RecordCustomerPaymentDto,
    userId: string,
  ) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, tenantId },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { currency: true, settings: { select: { exchangeRates: true } } },
    });
    const baseCurrency = tenant.currency;
    const payCurrency = (dto.paymentCurrency ?? baseCurrency).toUpperCase();
    const rates = (tenant.settings?.exchangeRates ?? {}) as Record<string, number>;
    let exchangeRate = 1;
    if (payCurrency !== baseCurrency) {
      const configured = Number(rates[payCurrency]);
      if (!Number.isFinite(configured) || configured <= 0) {
        throw new BadRequestException(
          `No exchange rate configured for ${payCurrency}`,
        );
      }
      exchangeRate = configured;
    }
    const amountInBase = round2(dto.amount * exchangeRate);
    if (amountInBase <= 0) {
      throw new BadRequestException('Payment amount must be positive');
    }

    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.customerPayment.create({
        data: {
          tenantId,
          customerId: id,
          branchId: dto.branchId ?? null,
          userId,
          amount: amountInBase,
          method: dto.method ?? PaymentMethod.CASH,
          paymentCurrency: payCurrency,
          exchangeRate,
          paidCurrencyAmount: dto.amount,
          note: dto.note ?? null,
        },
      });
      await this.ledger.post(
        tx,
        tenantId,
        [
          {
            account: LedgerAccount.CASH,
            side: LedgerSide.DEBIT,
            amount: amountInBase,
            description: `Debt payment — ${customer.name}`,
          },
          {
            account: LedgerAccount.ACCOUNTS_RECEIVABLE,
            side: LedgerSide.CREDIT,
            amount: amountInBase,
            description: `Debt settlement — ${customer.name}`,
          },
        ],
        { refType: 'customer-payment', refId: payment.id },
      );
      return payment;
    });
  }

  async purchaseHistory(tenantId: string, id: string, query: PaginationQueryDto) {
    await this.get(tenantId, id);
    const where: Prisma.SaleWhereInput = { tenantId, customerId: id };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.sale.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.pageSize,
        include: {
          items: {
            include: { medicine: { select: { name: true, nameAr: true } } },
          },
          branch: { select: { name: true } },
        },
      }),
      this.prisma.sale.count({ where }),
    ]);
    return paginate(data, total, query.page, query.pageSize);
  }

  create(tenantId: string, dto: CreateCustomerDto) {
    return this.prisma.customer.create({
      data: {
        tenantId,
        name: dto.name,
        phone: dto.phone ?? null,
        email: dto.email ?? null,
        openingBalance: dto.openingBalance ?? 0,
        creditLimit: dto.creditLimit ?? 0,
      },
    });
  }

  async update(tenantId: string, id: string, dto: UpdateCustomerDto) {
    await this.get(tenantId, id);
    return this.prisma.customer.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.email !== undefined ? { email: dto.email } : {}),
        ...(dto.openingBalance !== undefined
          ? { openingBalance: dto.openingBalance }
          : {}),
        ...(dto.creditLimit !== undefined ? { creditLimit: dto.creditLimit } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  async remove(tenantId: string, id: string) {
    await this.get(tenantId, id);
    const sales = await this.prisma.sale.count({ where: { customerId: id } });
    if (sales > 0) {
      return this.prisma.customer.update({
        where: { id },
        data: { isActive: false },
      });
    }
    return this.prisma.customer.delete({ where: { id } });
  }
}
