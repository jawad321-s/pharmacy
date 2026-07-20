import { Module } from '@nestjs/common';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { LedgerService } from '../accounting/ledger.service';

@Module({
  controllers: [CustomersController],
  providers: [CustomersService, LedgerService],
  exports: [CustomersService],
})
export class CustomersModule {}
