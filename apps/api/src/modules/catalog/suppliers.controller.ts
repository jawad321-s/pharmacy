import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SuppliersService } from './suppliers.service';
import { CreateSupplierDto, UpdateSupplierDto } from './catalog.dto';
import { Audited, RequirePermissions, TenantId } from '../../common/decorators';
import { PERMISSIONS } from '../../common/permissions';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

@ApiTags('Suppliers')
@ApiBearerAuth('access-token')
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.SUPPLIERS_VIEW)
  @ApiOperation({ summary: 'List suppliers with balances' })
  list(@TenantId() tenantId: string, @Query() query: PaginationQueryDto) {
    return this.suppliers.list(tenantId, query);
  }

  @Get(':id/ledger')
  @RequirePermissions(PERMISSIONS.SUPPLIERS_VIEW)
  @ApiOperation({ summary: 'Supplier ledger (purchases, payments, returns)' })
  ledger(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.suppliers.ledger(tenantId, id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.SUPPLIERS_MANAGE)
  @Audited('supplier.create', 'supplier')
  @ApiOperation({ summary: 'Create a supplier' })
  create(@TenantId() tenantId: string, @Body() dto: CreateSupplierDto) {
    return this.suppliers.create(tenantId, dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.SUPPLIERS_MANAGE)
  @Audited('supplier.update', 'supplier')
  @ApiOperation({ summary: 'Update a supplier' })
  update(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateSupplierDto,
  ) {
    return this.suppliers.update(tenantId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.SUPPLIERS_MANAGE)
  @Audited('supplier.delete', 'supplier')
  @ApiOperation({ summary: 'Delete a supplier (deactivates when in use)' })
  remove(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.suppliers.remove(tenantId, id);
  }
}
