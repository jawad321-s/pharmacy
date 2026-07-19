import { Injectable } from '@nestjs/common';
import { LedgerAccount, LedgerSide, Prisma } from '@prisma/client';

export interface LedgerLine {
  account: LedgerAccount;
  side: LedgerSide;
  amount: number;
  description: string;
}

/**
 * Double-entry style ledger writer. Business services post balanced
 * entries inside their own transactions.
 */
@Injectable()
export class LedgerService {
  async post(
    tx: Prisma.TransactionClient,
    tenantId: string,
    lines: LedgerLine[],
    ref: { refType: string; refId: string; date?: Date },
  ): Promise<void> {
    const filtered = lines.filter((line) => line.amount > 0.004);
    if (filtered.length === 0) return;
    await tx.ledgerEntry.createMany({
      data: filtered.map((line) => ({
        tenantId,
        account: line.account,
        side: line.side,
        amount: Math.round(line.amount * 100) / 100,
        description: line.description,
        refType: ref.refType,
        refId: ref.refId,
        date: ref.date ?? new Date(),
      })),
    });
  }
}
