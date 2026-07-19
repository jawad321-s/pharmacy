import { Module } from '@nestjs/common';
import { AccountingController } from './accounting.controller';
import { AccountingService } from './accounting.service';
import { LedgerService } from './ledger.service';

@Module({
  controllers: [AccountingController],
  providers: [AccountingService, LedgerService],
  exports: [AccountingService, LedgerService],
})
export class AccountingModule {}
