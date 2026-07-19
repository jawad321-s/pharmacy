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
import { CategoriesService } from './categories.service';
import { CreateCategoryDto, UpdateCategoryDto } from './catalog.dto';
import { Audited, RequirePermissions, TenantId } from '../../common/decorators';
import { PERMISSIONS } from '../../common/permissions';

@ApiTags('Categories')
@ApiBearerAuth('access-token')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.MEDICINES_VIEW)
  @ApiOperation({ summary: 'List categories' })
  list(
    @TenantId() tenantId: string,
    @Query('includeArchived') includeArchived?: string,
  ) {
    return this.categories.list(tenantId, includeArchived === 'true');
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CATEGORIES_MANAGE)
  @Audited('category.create', 'category')
  @ApiOperation({ summary: 'Create a category' })
  create(@TenantId() tenantId: string, @Body() dto: CreateCategoryDto) {
    return this.categories.create(tenantId, dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CATEGORIES_MANAGE)
  @Audited('category.update', 'category')
  @ApiOperation({ summary: 'Update or archive a category' })
  update(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categories.update(tenantId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.CATEGORIES_MANAGE)
  @Audited('category.delete', 'category')
  @ApiOperation({ summary: 'Delete a category (archives when in use)' })
  remove(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.categories.remove(tenantId, id);
  }
}
