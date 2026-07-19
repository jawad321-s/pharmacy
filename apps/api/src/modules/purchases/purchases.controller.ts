import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PurchasesService } from './purchases.service';
import {
  CreatePurchaseInvoiceDto,
  CreatePurchaseOrderDto,
  CreatePurchaseReturnDto,
  PurchaseQueryDto,
  RecordSupplierPaymentDto,
} from './purchases.dto';
import {
  Audited,
  CurrentUser,
  RequirePermissions,
  TenantId,
} from '../../common/decorators';
import { PERMISSIONS } from '../../common/permissions';
import { AuthenticatedUser } from '../../common/types';

@ApiTags('Purchases')
@ApiBearerAuth('access-token')
@Controller('purchases')
export class PurchasesController {
  constructor(private readonly purchases: PurchasesService) {}

  @Get('orders')
  @RequirePermissions(PERMISSIONS.PURCHASES_VIEW)
  @ApiOperation({ summary: 'List purchase orders' })
  listOrders(@TenantId() tenantId: string, @Query() query: PurchaseQueryDto) {
    return this.purchases.listOrders(tenantId, query);
  }

  @Post('orders')
  @RequirePermissions(PERMISSIONS.PURCHASES_MANAGE)
  @Audited('purchase.order.create', 'purchase_order')
  @ApiOperation({ summary: 'Create a purchase order' })
  createOrder(
    @TenantId() tenantId: string,
    @Body() dto: CreatePurchaseOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.purchases.createOrder(tenantId, dto, user.id);
  }

  @Post('orders/:id/cancel')
  @RequirePermissions(PERMISSIONS.PURCHASES_MANAGE)
  @Audited('purchase.order.cancel', 'purchase_order')
  @ApiOperation({ summary: 'Cancel a purchase order' })
  cancelOrder(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.purchases.cancelOrder(tenantId, id);
  }

  @Get('invoices')
  @RequirePermissions(PERMISSIONS.PURCHASES_VIEW)
  @ApiOperation({ summary: 'List purchase invoices' })
  listInvoices(@TenantId() tenantId: string, @Query() query: PurchaseQueryDto) {
    return this.purchases.listInvoices(tenantId, query);
  }

  @Get('invoices/:id')
  @RequirePermissions(PERMISSIONS.PURCHASES_VIEW)
  @ApiOperation({ summary: 'Get a purchase invoice' })
  getInvoice(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.purchases.getInvoice(tenantId, id);
  }

  @Post('invoices')
  @RequirePermissions(PERMISSIONS.PURCHASES_MANAGE)
  @Audited('purchase.invoice.create', 'purchase_invoice')
  @ApiOperation({ summary: 'Receive goods (creates batches, stock and ledger entries)' })
  createInvoice(
    @TenantId() tenantId: string,
    @Body() dto: CreatePurchaseInvoiceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.purchases.createInvoice(tenantId, dto, user.id);
  }

  @Post('invoices/:id/payments')
  @RequirePermissions(PERMISSIONS.PURCHASES_MANAGE)
  @Audited('purchase.payment', 'purchase_invoice')
  @ApiOperation({ summary: 'Record a supplier payment' })
  recordPayment(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: RecordSupplierPaymentDto,
  ) {
    return this.purchases.recordPayment(tenantId, id, dto);
  }

  @Post('invoices/:id/returns')
  @RequirePermissions(PERMISSIONS.PURCHASES_MANAGE)
  @Audited('purchase.return', 'purchase_return')
  @ApiOperation({ summary: 'Return goods to the supplier' })
  createReturn(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: CreatePurchaseReturnDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.purchases.createReturn(tenantId, id, dto, user.id);
  }
}
