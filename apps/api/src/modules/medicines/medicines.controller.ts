import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { MedicinesService } from './medicines.service';
import {
  CreateBatchDto,
  CreateMedicineDto,
  MedicineQueryDto,
  UpdateMedicineDto,
} from './medicines.dto';
import {
  Audited,
  CurrentUser,
  RequirePermissions,
  TenantId,
} from '../../common/decorators';
import { PERMISSIONS } from '../../common/permissions';
import { AuthenticatedUser } from '../../common/types';

@ApiTags('Medicines')
@ApiBearerAuth('access-token')
@Controller('medicines')
export class MedicinesController {
  constructor(private readonly medicines: MedicinesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.MEDICINES_VIEW)
  @ApiOperation({ summary: 'List and search medicines' })
  list(@TenantId() tenantId: string, @Query() query: MedicineQueryDto) {
    return this.medicines.list(tenantId, query);
  }

  @Get('barcode/:barcode')
  @RequirePermissions(PERMISSIONS.MEDICINES_VIEW)
  @ApiOperation({ summary: 'Lookup a medicine by barcode (POS scan-to-sell)' })
  byBarcode(
    @TenantId() tenantId: string,
    @Param('barcode') barcode: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.medicines.findByBarcode(tenantId, barcode, branchId);
  }

  @Get('export')
  @RequirePermissions(PERMISSIONS.MEDICINES_VIEW)
  @Header(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  @Header('Content-Disposition', 'attachment; filename="medicines.xlsx"')
  @ApiOperation({ summary: 'Export medicines to Excel' })
  async exportExcel(@TenantId() tenantId: string, @Res() res: Response) {
    const buffer = await this.medicines.exportExcel(tenantId);
    res.send(buffer);
  }

  @Post('import')
  @RequirePermissions(PERMISSIONS.MEDICINES_MANAGE)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @Audited('medicine.import', 'medicine')
  @ApiOperation({ summary: 'Import medicines from Excel' })
  importExcel(
    @TenantId() tenantId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Excel file is required');
    }
    return this.medicines.importExcel(tenantId, file.buffer);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.MEDICINES_VIEW)
  @ApiOperation({ summary: 'Get medicine detail with batches and stock' })
  get(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.medicines.get(tenantId, id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.MEDICINES_MANAGE)
  @Audited('medicine.create', 'medicine')
  @ApiOperation({ summary: 'Create a medicine (plan limits apply)' })
  create(@TenantId() tenantId: string, @Body() dto: CreateMedicineDto) {
    return this.medicines.create(tenantId, dto);
  }

  @Post(':id/batches')
  @RequirePermissions(PERMISSIONS.INVENTORY_ADJUST)
  @Audited('medicine.batch.create', 'batch')
  @ApiOperation({ summary: 'Add a batch with initial stock' })
  addBatch(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: CreateBatchDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.medicines.addBatch(tenantId, id, dto, user.id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.MEDICINES_MANAGE)
  @Audited('medicine.update', 'medicine')
  @ApiOperation({ summary: 'Update a medicine' })
  update(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateMedicineDto,
  ) {
    return this.medicines.update(tenantId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.MEDICINES_MANAGE)
  @Audited('medicine.delete', 'medicine')
  @ApiOperation({ summary: 'Delete a medicine (archives when it has sales history)' })
  remove(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.medicines.remove(tenantId, id);
  }
}
