import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { ReportsService, ReportType } from './reports.service';
import { ReportExportService } from './report-export.service';
import { RequirePermissions, TenantId } from '../../common/decorators';
import { PERMISSIONS } from '../../common/permissions';

const REPORT_TYPES: ReportType[] = [
  'sales',
  'purchases',
  'inventory',
  'profit',
  'customers',
  'suppliers',
  'tax',
  'expiry',
  'branches',
];

@ApiTags('Reports')
@ApiBearerAuth('access-token')
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly exporter: ReportExportService,
  ) {}

  private params(from?: string, to?: string, branchId?: string) {
    return {
      from: from ? new Date(from) : undefined,
      to: to ? new Date(`${to}T23:59:59.999Z`) : undefined,
      branchId: branchId || undefined,
    };
  }

  @Get('types')
  @RequirePermissions(PERMISSIONS.REPORTS_VIEW)
  @ApiOperation({ summary: 'Available report types' })
  types() {
    return REPORT_TYPES;
  }

  @Get(':type')
  @RequirePermissions(PERMISSIONS.REPORTS_VIEW)
  @ApiParam({ name: 'type', enum: REPORT_TYPES })
  @ApiOperation({ summary: 'Report data as JSON (for on-screen preview)' })
  json(
    @TenantId() tenantId: string,
    @Param('type') type: ReportType,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.reports.build(tenantId, type, this.params(from, to, branchId));
  }

  @Get(':type/excel')
  @RequirePermissions(PERMISSIONS.REPORTS_VIEW)
  @ApiParam({ name: 'type', enum: REPORT_TYPES })
  @ApiOperation({ summary: 'Download report as Excel' })
  async excel(
    @TenantId() tenantId: string,
    @Param('type') type: ReportType,
    @Res() res: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('branchId') branchId?: string,
  ) {
    const report = await this.reports.build(
      tenantId,
      type,
      this.params(from, to, branchId),
    );
    const buffer = await this.exporter.toExcel(report);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${type}-report.xlsx"`,
    );
    res.send(buffer);
  }

  @Get(':type/pdf')
  @RequirePermissions(PERMISSIONS.REPORTS_VIEW)
  @ApiParam({ name: 'type', enum: REPORT_TYPES })
  @ApiOperation({ summary: 'Download report as PDF' })
  async pdf(
    @TenantId() tenantId: string,
    @Param('type') type: ReportType,
    @Res() res: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('branchId') branchId?: string,
  ) {
    const report = await this.reports.build(
      tenantId,
      type,
      this.params(from, to, branchId),
    );
    const buffer = await this.exporter.toPdf(report);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${type}-report.pdf"`,
    );
    res.send(buffer);
  }
}
