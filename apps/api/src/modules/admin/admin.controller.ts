import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { PlatformRole, TenantStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';
import { AdminService } from './admin.service';
import { Audited, RequirePlatformRoles } from '../../common/decorators';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

class SetTenantStatusDto {
  @ApiProperty({ enum: TenantStatus })
  @IsEnum(TenantStatus)
  status: TenantStatus;
}

@ApiTags('Platform Admin')
@ApiBearerAuth('access-token')
@RequirePlatformRoles(PlatformRole.SUPER_ADMIN, PlatformRole.SUPPORT_AGENT)
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Platform dashboard (tenants, revenue, churn)' })
  dashboard() {
    return this.admin.platformDashboard();
  }

  @Get('tenants')
  @ApiOperation({ summary: 'List all tenants' })
  tenants(
    @Query() query: PaginationQueryDto,
    @Query('status') status?: TenantStatus,
  ) {
    return this.admin.listTenants(Object.assign(query, { status }));
  }

  @Get('tenants/:id')
  @ApiOperation({ summary: 'Tenant detail with subscriptions and billing' })
  tenant(@Param('id') id: string) {
    return this.admin.getTenant(id);
  }

  @Patch('tenants/:id/status')
  @RequirePlatformRoles(PlatformRole.SUPER_ADMIN)
  @Audited('admin.tenant.status', 'tenant')
  @ApiOperation({ summary: 'Suspend / activate a tenant' })
  setStatus(@Param('id') id: string, @Body() dto: SetTenantStatusDto) {
    return this.admin.setTenantStatus(id, dto.status);
  }

  @Get('invoices/pending')
  @ApiOperation({ summary: 'Pending subscription invoices across the platform' })
  pendingInvoices() {
    return this.admin.listPendingInvoices();
  }
}
