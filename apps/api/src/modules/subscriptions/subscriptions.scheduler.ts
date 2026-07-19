import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SubscriptionsService } from './subscriptions.service';

@Injectable()
export class SubscriptionsScheduler {
  private readonly logger = new Logger(SubscriptionsScheduler.name);

  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async handleExpirations(): Promise<void> {
    const result = await this.subscriptions.processExpirations();
    this.logger.log(
      `Subscription sweep: ${result.expired} expired, ${result.warned} warned`,
    );
  }
}
