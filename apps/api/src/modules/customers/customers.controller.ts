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
import { CustomersService } from './customers.service';
import { CreateCustomerDto, UpdateCustomerDto } from './customers.dto';
import { Audited, RequirePermissions, TenantId } from '../../common/decorators';
import { PERMISSIONS } from '../../common/permissions';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

@ApiTags('Customers')
@ApiBearerAuth('access-token')
@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CUSTOMERS_VIEW)
  @ApiOperation({ summary: 'List customers' })
  list(@TenantId() tenantId: string, @Query() query: PaginationQueryDto) {
    return this.customers.list(tenantId, query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.CUSTOMERS_VIEW)
  @ApiOperation({ summary: 'Get a customer' })
  get(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.customers.get(tenantId, id);
  }

  @Get(':id/purchases')
  @RequirePermissions(PERMISSIONS.CUSTOMERS_VIEW)
  @ApiOperation({ summary: 'Customer purchase history' })
  purchases(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.customers.purchaseHistory(tenantId, id, query);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CUSTOMERS_MANAGE)
  @Audited('customer.create', 'customer')
  @ApiOperation({ summary: 'Create a customer' })
  create(@TenantId() tenantId: string, @Body() dto: CreateCustomerDto) {
    return this.customers.create(tenantId, dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CUSTOMERS_MANAGE)
  @Audited('customer.update', 'customer')
  @ApiOperation({ summary: 'Update a customer' })
  update(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.customers.update(tenantId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.CUSTOMERS_MANAGE)
  @Audited('customer.delete', 'customer')
  @ApiOperation({ summary: 'Delete a customer (deactivates when in use)' })
  remove(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.customers.remove(tenantId, id);
  }
}
