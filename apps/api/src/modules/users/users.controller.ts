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
import { UsersService } from './users.service';
import { CreateUserDto, ResetUserPasswordDto, UpdateUserDto } from './users.dto';
import {
  Audited,
  CurrentUser,
  RequirePermissions,
  TenantId,
} from '../../common/decorators';
import { PERMISSIONS } from '../../common/permissions';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { AuthenticatedUser } from '../../common/types';

@ApiTags('Users')
@ApiBearerAuth('access-token')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.USERS_VIEW)
  @ApiOperation({ summary: 'List tenant users' })
  list(@TenantId() tenantId: string, @Query() query: PaginationQueryDto) {
    return this.users.list(tenantId, query);
  }

  @Get('login-history')
  @RequirePermissions(PERMISSIONS.AUDIT_VIEW)
  @ApiOperation({ summary: 'Tenant login history' })
  loginHistory(@TenantId() tenantId: string, @Query() query: PaginationQueryDto) {
    return this.users.loginHistory(tenantId, query);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  @Audited('user.create', 'user')
  @ApiOperation({ summary: 'Create a tenant user' })
  create(@TenantId() tenantId: string, @Body() dto: CreateUserDto) {
    return this.users.create(tenantId, dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  @Audited('user.update', 'user')
  @ApiOperation({ summary: 'Update a tenant user' })
  update(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.users.update(tenantId, id, dto);
  }

  @Post(':id/reset-password')
  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  @Audited('user.reset_password', 'user')
  @ApiOperation({ summary: 'Reset a user password (admin action)' })
  resetPassword(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: ResetUserPasswordDto,
  ) {
    return this.users.resetPassword(tenantId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  @Audited('user.deactivate', 'user')
  @ApiOperation({ summary: 'Deactivate a tenant user' })
  remove(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.users.remove(tenantId, id, actor.id);
  }
}
