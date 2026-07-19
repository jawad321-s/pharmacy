import { Module } from '@nestjs/common';
import { PurchasesController } from './purchases.controller';
import { PurchasesService } from './purchases.service';
import { InventoryModule } from '../inventory/inventory.module';
import { LedgerService } from '../accounting/ledger.service';

@Module({
  imports: [InventoryModule],
  controllers: [PurchasesController],
  providers: [PurchasesService, LedgerService],
  exports: [PurchasesService],
})
export class PurchasesModule {}
