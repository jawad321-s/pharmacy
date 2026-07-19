import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { PlanLimitsService } from './plan-limits.service';
import { SubscriptionsScheduler } from './subscriptions.scheduler';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'subscriptions' }),
    NotificationsModule,
  ],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService, PlanLimitsService, SubscriptionsScheduler],
  exports: [SubscriptionsService, PlanLimitsService],
})
export class SubscriptionsModule {}
