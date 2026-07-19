import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantsService } from './tenants.service';
import { UpdateTenantDto, UpdateTenantSettingsDto } from './tenants.dto';
import {
  Audited,
  Public,
  RequirePermissions,
  SkipSubscriptionCheck,
  TenantId,
} from '../../common/decorators';
import { PERMISSIONS } from '../../common/permissions';

@ApiTags('Tenant')
@Controller('tenant')
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Public()
  @Get('public/:subdomain')
  @ApiOperation({ summary: 'Public tenant branding by subdomain (login page)' })
  publicProfile(@Param('subdomain') subdomain: string) {
    return this.tenants.getPublicBySubdomain(subdomain);
  }

  @Get('me')
  @ApiBearerAuth('access-token')
  @SkipSubscriptionCheck()
  @ApiOperation({ summary: 'Current tenant profile and settings' })
  me(@TenantId() tenantId: string) {
    return this.tenants.getMine(tenantId);
  }

  @Patch('me')
  @ApiBearerAuth('access-token')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @Audited('tenant.update', 'tenant')
  @ApiOperation({ summary: 'Update tenant profile' })
  update(@TenantId() tenantId: string, @Body() dto: UpdateTenantDto) {
    return this.tenants.updateMine(tenantId, dto);
  }

  @Patch('me/settings')
  @ApiBearerAuth('access-token')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @Audited('tenant.settings.update', 'tenant_settings')
  @ApiOperation({ summary: 'Update tenant operational settings' })
  updateSettings(
    @TenantId() tenantId: string,
    @Body() dto: UpdateTenantSettingsDto,
  ) {
    return this.tenants.updateSettings(tenantId, dto);
  }
}
