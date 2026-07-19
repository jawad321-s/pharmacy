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
import { AccountingService } from './accounting.service';
import {
  CreateExpenseDto,
  ExpenseQueryDto,
  LedgerQueryDto,
  UpdateExpenseDto,
} from './accounting.dto';
import {
  Audited,
  CurrentUser,
  RequirePermissions,
  TenantId,
} from '../../common/decorators';
import { PERMISSIONS } from '../../common/permissions';
import { AuthenticatedUser } from '../../common/types';

@ApiTags('Accounting')
@ApiBearerAuth('access-token')
@Controller('accounting')
export class AccountingController {
  constructor(private readonly accounting: AccountingService) {}

  @Get('expenses')
  @RequirePermissions(PERMISSIONS.ACCOUNTING_VIEW)
  @ApiOperation({ summary: 'List expenses' })
  listExpenses(@TenantId() tenantId: string, @Query() query: ExpenseQueryDto) {
    return this.accounting.listExpenses(tenantId, query);
  }

  @Post('expenses')
  @RequirePermissions(PERMISSIONS.ACCOUNTING_MANAGE)
  @Audited('expense.create', 'expense')
  @ApiOperation({ summary: 'Record an expense' })
  createExpense(
    @TenantId() tenantId: string,
    @Body() dto: CreateExpenseDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.accounting.createExpense(tenantId, dto, user.id);
  }

  @Patch('expenses/:id')
  @RequirePermissions(PERMISSIONS.ACCOUNTING_MANAGE)
  @Audited('expense.update', 'expense')
  @ApiOperation({ summary: 'Update an expense' })
  updateExpense(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateExpenseDto,
  ) {
    return this.accounting.updateExpense(tenantId, id, dto);
  }

  @Delete('expenses/:id')
  @RequirePermissions(PERMISSIONS.ACCOUNTING_MANAGE)
  @Audited('expense.delete', 'expense')
  @ApiOperation({ summary: 'Delete an expense (and its ledger entries)' })
  removeExpense(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.accounting.removeExpense(tenantId, id);
  }

  @Get('profit-loss')
  @RequirePermissions(PERMISSIONS.ACCOUNTING_VIEW)
  @ApiOperation({ summary: 'Profit & loss statement' })
  profitLoss(
    @TenantId() tenantId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.accounting.profitAndLoss(
      tenantId,
      from ? new Date(from) : undefined,
      to ? new Date(`${to}T23:59:59.999Z`) : undefined,
    );
  }

  @Get('cash-flow')
  @RequirePermissions(PERMISSIONS.ACCOUNTING_VIEW)
  @ApiOperation({ summary: 'Daily cash flow' })
  cashFlow(
    @TenantId() tenantId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.accounting.cashFlow(
      tenantId,
      from ? new Date(from) : undefined,
      to ? new Date(`${to}T23:59:59.999Z`) : undefined,
    );
  }

  @Get('ledger')
  @RequirePermissions(PERMISSIONS.ACCOUNTING_VIEW)
  @ApiOperation({ summary: 'General ledger entries' })
  ledger(@TenantId() tenantId: string, @Query() query: LedgerQueryDto) {
    return this.accounting.generalLedger(tenantId, query);
  }
}
