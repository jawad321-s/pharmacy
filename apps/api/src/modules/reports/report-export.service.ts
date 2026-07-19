import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

export interface ReportColumn {
  key: string;
  header: string;
  width?: number;
  numeric?: boolean;
}

export interface ReportData {
  title: string;
  subtitle?: string;
  columns: ReportColumn[];
  rows: Record<string, string | number | null>[];
  totals?: Record<string, string | number>;
}

/**
 * Generic tabular report exporters. Every report in the system is
 * expressed as ReportData and rendered to Excel or PDF here.
 */
@Injectable()
export class ReportExportService {
  async toExcel(report: ReportData): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'PharmaSaaS';
    const sheet = workbook.addWorksheet(report.title.slice(0, 31));

    sheet.mergeCells(1, 1, 1, Math.max(report.columns.length, 1));
    const titleCell = sheet.getCell(1, 1);
    titleCell.value = report.title;
    titleCell.font = { bold: true, size: 14 };
    if (report.subtitle) {
      sheet.mergeCells(2, 1, 2, Math.max(report.columns.length, 1));
      const subtitleCell = sheet.getCell(2, 1);
      subtitleCell.value = report.subtitle;
      subtitleCell.font = { size: 10, color: { argb: 'FF666666' } };
    }

    const headerRowIndex = report.subtitle ? 4 : 3;
    const headerRow = sheet.getRow(headerRowIndex);
    report.columns.forEach((column, index) => {
      const cell = headerRow.getCell(index + 1);
      cell.value = column.header;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1E7A4C' },
      };
      sheet.getColumn(index + 1).width = column.width ?? 20;
    });

    let rowIndex = headerRowIndex + 1;
    for (const row of report.rows) {
      const sheetRow = sheet.getRow(rowIndex);
      report.columns.forEach((column, index) => {
        sheetRow.getCell(index + 1).value = row[column.key] ?? '';
        if (column.numeric) {
          sheetRow.getCell(index + 1).numFmt = '#,##0.00';
        }
      });
      rowIndex += 1;
    }

    if (report.totals) {
      const totalsRow = sheet.getRow(rowIndex + 1);
      report.columns.forEach((column, index) => {
        const value = report.totals?.[column.key];
        if (value !== undefined) {
          const cell = totalsRow.getCell(index + 1);
          cell.value = value;
          cell.font = { bold: true };
          if (column.numeric) cell.numFmt = '#,##0.00';
        }
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async toPdf(report: ReportData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        layout: report.columns.length > 6 ? 'landscape' : 'portrait',
        margin: 40,
      });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pageWidth = doc.page.width - 80;
      const columnWidth = pageWidth / report.columns.length;

      doc.fontSize(16).font('Helvetica-Bold').text(report.title);
      if (report.subtitle) {
        doc.fontSize(9).font('Helvetica').fillColor('#666666').text(report.subtitle);
      }
      doc.moveDown(0.8);

      const drawHeader = () => {
        const y = doc.y;
        doc.rect(40, y, pageWidth, 20).fill('#1E7A4C');
        doc.fillColor('#FFFFFF').fontSize(8).font('Helvetica-Bold');
        report.columns.forEach((column, index) => {
          doc.text(column.header, 44 + index * columnWidth, y + 6, {
            width: columnWidth - 8,
            align: column.numeric ? 'right' : 'left',
            lineBreak: false,
          });
        });
        doc.y = y + 24;
        doc.fillColor('#000000').font('Helvetica');
      };

      drawHeader();

      let stripe = false;
      for (const row of report.rows) {
        if (doc.y > doc.page.height - 80) {
          doc.addPage();
          drawHeader();
        }
        const y = doc.y;
        if (stripe) {
          doc.rect(40, y - 2, pageWidth, 16).fill('#F2F7F4');
          doc.fillColor('#000000');
        }
        stripe = !stripe;
        doc.fontSize(8);
        report.columns.forEach((column, index) => {
          const value = row[column.key];
          const text =
            typeof value === 'number'
              ? value.toLocaleString('en-US', {
                  minimumFractionDigits: column.numeric ? 2 : 0,
                  maximumFractionDigits: 2,
                })
              : String(value ?? '');
          doc.text(text, 44 + index * columnWidth, y, {
            width: columnWidth - 8,
            align: column.numeric ? 'right' : 'left',
            lineBreak: false,
          });
        });
        doc.y = y + 16;
      }

      if (report.totals) {
        const y = doc.y + 4;
        doc.moveTo(40, y).lineTo(40 + pageWidth, y).stroke('#1E7A4C');
        doc.font('Helvetica-Bold').fontSize(8);
        report.columns.forEach((column, index) => {
          const value = report.totals?.[column.key];
          if (value === undefined) return;
          const text =
            typeof value === 'number'
              ? value.toLocaleString('en-US', {
                  minimumFractionDigits: column.numeric ? 2 : 0,
                  maximumFractionDigits: 2,
                })
              : String(value);
          doc.text(text, 44 + index * columnWidth, y + 6, {
            width: columnWidth - 8,
            align: column.numeric ? 'right' : 'left',
            lineBreak: false,
          });
        });
        doc.y = y + 24;
      }

      doc
        .fontSize(7)
        .font('Helvetica')
        .fillColor('#999999')
        .text(
          `Generated by PharmaSaaS on ${new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC`,
          40,
          doc.page.height - 50,
        );

      doc.end();
    });
  }
}
