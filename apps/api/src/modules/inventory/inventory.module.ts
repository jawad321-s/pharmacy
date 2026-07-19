import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { StockService } from './stock.service';
import { TransfersService } from './transfers.service';
import { CountsService } from './counts.service';
import { AlertsScheduler } from './alerts.scheduler';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [InventoryController],
  providers: [
    InventoryService,
    StockService,
    TransfersService,
    CountsService,
    AlertsScheduler,
  ],
  exports: [StockService, InventoryService],
})
export class InventoryModule {}
