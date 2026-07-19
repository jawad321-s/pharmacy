import { Module } from '@nestjs/common';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
import { InventoryModule } from '../inventory/inventory.module';
import { LedgerService } from '../accounting/ledger.service';

@Module({
  imports: [InventoryModule],
  controllers: [SalesController],
  providers: [SalesService, LedgerService],
  exports: [SalesService],
})
export class SalesModule {}
