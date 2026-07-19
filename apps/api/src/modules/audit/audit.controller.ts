import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { RequirePermissions, TenantId } from '../../common/decorators';
import { PERMISSIONS } from '../../common/permissions';
import { DateRangeQueryDto } from '../../common/dto/pagination.dto';

@ApiTags('Audit')
@ApiBearerAuth('access-token')
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.AUDIT_VIEW)
  @ApiOperation({ summary: 'Tenant audit trail' })
  list(
    @TenantId() tenantId: string,
    @Query() query: DateRangeQueryDto,
    @Query('resource') resource?: string,
    @Query('userId') userId?: string,
  ) {
    return this.audit.list(tenantId, Object.assign(query, { resource, userId }));
  }
}
