import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { BillingCycle, PaymentMethod } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { SubscriptionsService } from './subscriptions.service';
import {
  Audited,
  Public,
  RequirePermissions,
  SkipSubscriptionCheck,
  TenantId,
} from '../../common/decorators';
import { PERMISSIONS } from '../../common/permissions';

class SubscribeDto {
  @ApiProperty({ example: 'professional' })
  @IsString()
  planSlug: string;

  @ApiProperty({ enum: BillingCycle, example: BillingCycle.MONTHLY })
  @IsEnum(BillingCycle)
  cycle: BillingCycle;
}

class PayInvoiceDto {
  @ApiProperty({ enum: PaymentMethod, example: PaymentMethod.BANK_TRANSFER })
  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @ApiPropertyOptional({ example: 'TRX-1029384756' })
  @IsOptional()
  @IsString()
  reference?: string;
}

@ApiTags('Subscriptions & Billing')
@ApiBearerAuth('access-token')
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Public()
  @Get('plans')
  @ApiOperation({ summary: 'List public subscription plans' })
  listPlans() {
    return this.subscriptions.listPlans();
  }

  @Get('current')
  @SkipSubscriptionCheck()
  @RequirePermissions(PERMISSIONS.BILLING_MANAGE)
  @ApiOperation({ summary: 'Current subscription and plan usage for the tenant' })
  current(@TenantId() tenantId: string) {
    return this.subscriptions.currentForTenant(tenantId);
  }

  @Get('invoices')
  @SkipSubscriptionCheck()
  @RequirePermissions(PERMISSIONS.BILLING_MANAGE)
  @ApiOperation({ summary: 'Billing history for the tenant' })
  invoices(@TenantId() tenantId: string) {
    return this.subscriptions.billingHistory(tenantId);
  }

  @Post('subscribe')
  @SkipSubscriptionCheck()
  @RequirePermissions(PERMISSIONS.BILLING_MANAGE)
  @Audited('subscription.subscribe', 'subscription')
  @ApiOperation({ summary: 'Subscribe to or renew a plan (creates a pending invoice)' })
  subscribe(@TenantId() tenantId: string, @Body() dto: SubscribeDto) {
    return this.subscriptions.subscribe(tenantId, dto.planSlug, dto.cycle);
  }

  @Post('invoices/:id/pay')
  @SkipSubscriptionCheck()
  @RequirePermissions(PERMISSIONS.BILLING_MANAGE)
  @Audited('subscription.invoice.pay', 'billing_invoice')
  @ApiOperation({ summary: 'Record payment for a billing invoice and activate the plan' })
  pay(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: PayInvoiceDto,
  ) {
    return this.subscriptions.payInvoice(tenantId, id, dto.method, dto.reference);
  }
}
