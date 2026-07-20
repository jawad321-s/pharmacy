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
import {
  CreateCustomerDto,
  RecordCustomerPaymentDto,
  UpdateCustomerDto,
} from './customers.dto';
import {
  Audited,
  CurrentUser,
  RequirePermissions,
  TenantId,
} from '../../common/decorators';
import { PERMISSIONS } from '../../common/permissions';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { AuthenticatedUser } from '../../common/types';

@ApiTags('Customers')
@ApiBearerAuth('access-token')
@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CUSTOMERS_VIEW)
  @ApiOperation({ summary: 'List customers with outstanding balances' })
  list(@TenantId() tenantId: string, @Query() query: PaginationQueryDto) {
    return this.customers.list(tenantId, query);
  }

  @Get('debts')
  @RequirePermissions(PERMISSIONS.CUSTOMERS_VIEW)
  @ApiOperation({ summary: 'Customers who owe money + total receivable' })
  debts(@TenantId() tenantId: string, @Query() query: PaginationQueryDto) {
    return this.customers.debts(tenantId, query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.CUSTOMERS_VIEW)
  @ApiOperation({ summary: 'Get a customer (with balance)' })
  get(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.customers.get(tenantId, id);
  }

  @Get(':id/statement')
  @RequirePermissions(PERMISSIONS.CUSTOMERS_VIEW)
  @ApiOperation({ summary: 'Customer account statement (credit sales + payments)' })
  statement(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.customers.statement(tenantId, id);
  }

  @Post(':id/payments')
  @RequirePermissions(PERMISSIONS.CUSTOMERS_MANAGE)
  @Audited('customer.payment', 'customer_payment')
  @ApiOperation({ summary: 'Record a debt settlement (supports foreign currency)' })
  recordPayment(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: RecordCustomerPaymentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.customers.recordPayment(tenantId, id, dto, user.id);
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
