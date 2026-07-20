import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SalesService } from './sales.service';
import {
  CreateSaleDto,
  CreateSaleReturnDto,
  SalesQueryDto,
} from './sales.dto';
import {
  Audited,
  CurrentUser,
  RequirePermissions,
  TenantId,
} from '../../common/decorators';
import { PERMISSIONS } from '../../common/permissions';
import { AuthenticatedUser } from '../../common/types';

@ApiTags('Sales (POS)')
@ApiBearerAuth('access-token')
@Controller('sales')
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.SALES_VIEW)
  @ApiOperation({ summary: 'List sales invoices' })
  list(@TenantId() tenantId: string, @Query() query: SalesQueryDto) {
    return this.sales.list(tenantId, query);
  }

  @Get('day-close')
  @RequirePermissions(PERMISSIONS.SALES_VIEW)
  @ApiOperation({
    summary: 'Day-close cash reconciliation (by payment method and currency)',
  })
  dayClose(
    @TenantId() tenantId: string,
    @Query('date') date?: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.sales.dayClose(tenantId, date, branchId || undefined);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.SALES_VIEW)
  @ApiOperation({ summary: 'Get sale detail (receipt data)' })
  get(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.sales.get(tenantId, id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.SALES_CREATE)
  @Audited('sale.create', 'sale')
  @ApiOperation({
    summary:
      'POS checkout — FEFO batch allocation, expiry & stock validation, loyalty, ledger',
  })
  create(
    @TenantId() tenantId: string,
    @Body() dto: CreateSaleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.sales.create(tenantId, dto, user.id);
  }

  @Post(':id/returns')
  @RequirePermissions(PERMISSIONS.SALES_RETURN)
  @Audited('sale.return', 'sale_return')
  @ApiOperation({ summary: 'Return items from a sale (refund + restock)' })
  createReturn(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: CreateSaleReturnDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.sales.createReturn(tenantId, id, dto, user.id);
  }

  @Post(':id/void')
  @RequirePermissions(PERMISSIONS.SALES_VOID)
  @Audited('sale.void', 'sale')
  @ApiOperation({ summary: 'Void a completed sale (full reversal)' })
  voidSale(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.sales.voidSale(tenantId, id, user.id);
  }
}
