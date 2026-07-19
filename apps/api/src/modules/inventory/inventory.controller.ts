import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InventoryService } from './inventory.service';
import { TransfersService } from './transfers.service';
import { CountsService } from './counts.service';
import {
  AdjustStockDto,
  CreateCountDto,
  CreateTransferDto,
  StockQueryDto,
  SubmitCountDto,
} from './inventory.dto';
import {
  Audited,
  CurrentUser,
  RequirePermissions,
  TenantId,
} from '../../common/decorators';
import { PERMISSIONS } from '../../common/permissions';
import { DateRangeQueryDto } from '../../common/dto/pagination.dto';
import { AuthenticatedUser } from '../../common/types';

@ApiTags('Inventory')
@ApiBearerAuth('access-token')
@Controller('inventory')
export class InventoryController {
  constructor(
    private readonly inventory: InventoryService,
    private readonly transfers: TransfersService,
    private readonly counts: CountsService,
  ) {}

  @Get('stock')
  @RequirePermissions(PERMISSIONS.INVENTORY_VIEW)
  @ApiOperation({ summary: 'Stock levels with batch detail and alert flags' })
  stock(@TenantId() tenantId: string, @Query() query: StockQueryDto) {
    return this.inventory.stockLevels(tenantId, query);
  }

  @Get('alerts')
  @RequirePermissions(PERMISSIONS.INVENTORY_VIEW)
  @ApiOperation({ summary: 'Alert counters (out of stock, low, near expiry, expired)' })
  alerts(
    @TenantId() tenantId: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.inventory.alertsSummary(tenantId, branchId);
  }

  @Get('movements')
  @RequirePermissions(PERMISSIONS.INVENTORY_VIEW)
  @ApiOperation({ summary: 'Stock movement audit trail' })
  movements(
    @TenantId() tenantId: string,
    @Query() query: DateRangeQueryDto,
    @Query('branchId') branchId?: string,
    @Query('medicineId') medicineId?: string,
  ) {
    return this.inventory.movements(tenantId, Object.assign(query, { branchId, medicineId }));
  }

  @Post('adjust')
  @RequirePermissions(PERMISSIONS.INVENTORY_ADJUST)
  @Audited('inventory.adjust', 'stock')
  @ApiOperation({ summary: 'Manual stock adjustment with reason' })
  adjust(
    @TenantId() tenantId: string,
    @Body() dto: AdjustStockDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inventory.adjust(tenantId, dto, user.id);
  }

  @Get('transfers')
  @RequirePermissions(PERMISSIONS.INVENTORY_TRANSFER)
  @ApiOperation({ summary: 'List stock transfers' })
  listTransfers(@TenantId() tenantId: string) {
    return this.transfers.list(tenantId);
  }

  @Post('transfers')
  @RequirePermissions(PERMISSIONS.INVENTORY_TRANSFER)
  @Audited('inventory.transfer.create', 'stock_transfer')
  @ApiOperation({ summary: 'Create a transfer (stock leaves source immediately)' })
  createTransfer(
    @TenantId() tenantId: string,
    @Body() dto: CreateTransferDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.transfers.create(tenantId, dto, user.id);
  }

  @Post('transfers/:id/complete')
  @RequirePermissions(PERMISSIONS.INVENTORY_TRANSFER)
  @Audited('inventory.transfer.complete', 'stock_transfer')
  @ApiOperation({ summary: 'Receive a transfer at the destination branch' })
  completeTransfer(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.transfers.complete(tenantId, id, user.id);
  }

  @Post('transfers/:id/cancel')
  @RequirePermissions(PERMISSIONS.INVENTORY_TRANSFER)
  @Audited('inventory.transfer.cancel', 'stock_transfer')
  @ApiOperation({ summary: 'Cancel an in-transit transfer' })
  cancelTransfer(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.transfers.cancel(tenantId, id, user.id);
  }

  @Get('counts')
  @RequirePermissions(PERMISSIONS.INVENTORY_COUNT)
  @ApiOperation({ summary: 'List inventory counts' })
  listCounts(@TenantId() tenantId: string) {
    return this.counts.list(tenantId);
  }

  @Get('counts/:id')
  @RequirePermissions(PERMISSIONS.INVENTORY_COUNT)
  @ApiOperation({ summary: 'Get an inventory count session' })
  getCount(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.counts.get(tenantId, id);
  }

  @Post('counts')
  @RequirePermissions(PERMISSIONS.INVENTORY_COUNT)
  @Audited('inventory.count.create', 'inventory_count')
  @ApiOperation({ summary: 'Start an inventory count (FULL / CYCLE / SPOT)' })
  createCount(
    @TenantId() tenantId: string,
    @Body() dto: CreateCountDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.counts.create(tenantId, dto, user.id);
  }

  @Post('counts/:id/complete')
  @RequirePermissions(PERMISSIONS.INVENTORY_COUNT)
  @Audited('inventory.count.complete', 'inventory_count')
  @ApiOperation({ summary: 'Submit counted quantities and apply variances' })
  completeCount(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: SubmitCountDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.counts.complete(tenantId, id, dto, user.id);
  }

  @Post('counts/:id/cancel')
  @RequirePermissions(PERMISSIONS.INVENTORY_COUNT)
  @Audited('inventory.count.cancel', 'inventory_count')
  @ApiOperation({ summary: 'Cancel an inventory count' })
  cancelCount(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.counts.cancel(tenantId, id);
  }
}
