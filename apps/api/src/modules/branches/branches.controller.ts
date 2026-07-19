import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BranchesService } from './branches.service';
import { CreateBranchDto, UpdateBranchDto } from './branches.dto';
import { Audited, RequirePermissions, TenantId } from '../../common/decorators';
import { PERMISSIONS } from '../../common/permissions';

@ApiTags('Branches')
@ApiBearerAuth('access-token')
@Controller('branches')
export class BranchesController {
  constructor(private readonly branches: BranchesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.BRANCHES_VIEW)
  @ApiOperation({ summary: 'List branches' })
  list(@TenantId() tenantId: string) {
    return this.branches.list(tenantId);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.BRANCHES_MANAGE)
  @Audited('branch.create', 'branch')
  @ApiOperation({ summary: 'Create a branch (plan limits apply)' })
  create(@TenantId() tenantId: string, @Body() dto: CreateBranchDto) {
    return this.branches.create(tenantId, dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.BRANCHES_MANAGE)
  @Audited('branch.update', 'branch')
  @ApiOperation({ summary: 'Update a branch' })
  update(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateBranchDto,
  ) {
    return this.branches.update(tenantId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.BRANCHES_MANAGE)
  @Audited('branch.delete', 'branch')
  @ApiOperation({ summary: 'Delete or deactivate a branch' })
  remove(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.branches.remove(tenantId, id);
  }
}
