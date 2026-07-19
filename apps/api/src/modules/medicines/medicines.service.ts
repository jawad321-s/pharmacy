import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MedicineStatus, Prisma, StockMovementType } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../../prisma/prisma.service';
import { paginate } from '../../common/types';
import { toNumber, round2 } from '../../common/utils/numbers';
import { PlanLimitsService } from '../subscriptions/plan-limits.service';
import {
  CreateBatchDto,
  CreateMedicineDto,
  MedicineQueryDto,
  UpdateMedicineDto,
} from './medicines.dto';

const MEDICINE_INCLUDE = {
  category: { select: { id: true, name: true, nameAr: true } },
  supplier: { select: { id: true, name: true } },
} satisfies Prisma.MedicineInclude;

@Injectable()
export class MedicinesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly planLimits: PlanLimitsService,
  ) {}

  async list(tenantId: string, query: MedicineQueryDto) {
    const where: Prisma.MedicineWhereInput = {
      tenantId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { nameAr: { contains: query.search } },
              { scientificName: { contains: query.search, mode: 'insensitive' } },
              { barcode: { contains: query.search } },
              { sku: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [medicines, total] = await this.prisma.$transaction([
      this.prisma.medicine.findMany({
        where,
        include: MEDICINE_INCLUDE,
        orderBy: { name: 'asc' },
        skip: query.skip,
        take: query.pageSize,
      }),
      this.prisma.medicine.count({ where }),
    ]);

    const ids = medicines.map((m) => m.id);
    const stock = await this.prisma.stockItem.groupBy({
      by: ['batchId'],
      where: {
        tenantId,
        batch: { medicineId: { in: ids } },
        ...(query.branchId ? { branchId: query.branchId } : {}),
      },
      _sum: { quantity: true },
    });
    const batches = await this.prisma.batch.findMany({
      where: { medicineId: { in: ids } },
      select: { id: true, medicineId: true, expiryDate: true },
    });
    const batchToMedicine = new Map(batches.map((b) => [b.id, b]));
    const totals = new Map<string, number>();
    for (const row of stock) {
      const batch = batchToMedicine.get(row.batchId);
      if (!batch) continue;
      totals.set(
        batch.medicineId,
        (totals.get(batch.medicineId) ?? 0) + (row._sum.quantity ?? 0),
      );
    }

    const data = medicines.map((medicine) => ({
      ...medicine,
      totalQuantity: totals.get(medicine.id) ?? 0,
      profitMargin:
        toNumber(medicine.costPrice) > 0
          ? round2(
              ((toNumber(medicine.sellingPrice) - toNumber(medicine.costPrice)) /
                toNumber(medicine.costPrice)) *
                100,
            )
          : null,
    }));

    return paginate(data, total, query.page, query.pageSize);
  }

  async get(tenantId: string, id: string) {
    const medicine = await this.prisma.medicine.findFirst({
      where: { id, tenantId },
      include: {
        ...MEDICINE_INCLUDE,
        batches: {
          orderBy: { expiryDate: 'asc' },
          include: {
            stockItems: {
              include: { branch: { select: { id: true, name: true } } },
            },
          },
        },
      },
    });
    if (!medicine) {
      throw new NotFoundException('Medicine not found');
    }
    return medicine;
  }

  async findByBarcode(tenantId: string, barcode: string, branchId?: string) {
    const medicine = await this.prisma.medicine.findFirst({
      where: { tenantId, barcode, status: MedicineStatus.ACTIVE },
      include: MEDICINE_INCLUDE,
    });
    if (!medicine) {
      throw new NotFoundException('No medicine matches this barcode');
    }
    const batches = await this.prisma.batch.findMany({
      where: { medicineId: medicine.id },
      orderBy: { expiryDate: 'asc' },
      include: {
        stockItems: branchId
          ? { where: { branchId } }
          : true,
      },
    });
    const available = batches.map((batch) => ({
      id: batch.id,
      batchNumber: batch.batchNumber,
      expiryDate: batch.expiryDate,
      quantity: batch.stockItems.reduce((sum, item) => sum + item.quantity, 0),
    }));
    return {
      ...medicine,
      batches: available,
      totalQuantity: available.reduce((sum, batch) => sum + batch.quantity, 0),
    };
  }

  async create(tenantId: string, dto: CreateMedicineDto) {
    await this.planLimits.assertCanAddProducts(tenantId);
    const sku = dto.sku ?? (await this.nextSku(tenantId));
    return this.prisma.medicine.create({
      data: {
        tenantId,
        barcode: dto.barcode.trim(),
        sku,
        name: dto.name,
        nameAr: dto.nameAr ?? null,
        scientificName: dto.scientificName ?? null,
        description: dto.description ?? null,
        manufacturer: dto.manufacturer ?? null,
        categoryId: dto.categoryId ?? null,
        supplierId: dto.supplierId ?? null,
        purchasePrice: dto.purchasePrice,
        sellingPrice: dto.sellingPrice,
        costPrice: dto.costPrice ?? dto.purchasePrice,
        taxRate: dto.taxRate ?? 0,
        unit: dto.unit ?? 'piece',
        imageUrl: dto.imageUrl ?? null,
        minStock: dto.minStock ?? 10,
      },
      include: MEDICINE_INCLUDE,
    });
  }

  async update(tenantId: string, id: string, dto: UpdateMedicineDto) {
    const existing = await this.prisma.medicine.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      throw new NotFoundException('Medicine not found');
    }
    const updated = await this.prisma.medicine.update({
      where: { id },
      data: {
        ...(dto.barcode !== undefined ? { barcode: dto.barcode.trim() } : {}),
        ...(dto.sku !== undefined ? { sku: dto.sku } : {}),
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.nameAr !== undefined ? { nameAr: dto.nameAr } : {}),
        ...(dto.scientificName !== undefined
          ? { scientificName: dto.scientificName }
          : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.manufacturer !== undefined
          ? { manufacturer: dto.manufacturer }
          : {}),
        ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
        ...(dto.supplierId !== undefined ? { supplierId: dto.supplierId } : {}),
        ...(dto.purchasePrice !== undefined
          ? { purchasePrice: dto.purchasePrice }
          : {}),
        ...(dto.sellingPrice !== undefined
          ? { sellingPrice: dto.sellingPrice }
          : {}),
        ...(dto.costPrice !== undefined ? { costPrice: dto.costPrice } : {}),
        ...(dto.taxRate !== undefined ? { taxRate: dto.taxRate } : {}),
        ...(dto.unit !== undefined ? { unit: dto.unit } : {}),
        ...(dto.imageUrl !== undefined ? { imageUrl: dto.imageUrl } : {}),
        ...(dto.minStock !== undefined ? { minStock: dto.minStock } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
      include: MEDICINE_INCLUDE,
    });
    return Object.assign(updated, { __auditOld: existing });
  }

  async remove(tenantId: string, id: string) {
    const medicine = await this.prisma.medicine.findFirst({
      where: { id, tenantId },
    });
    if (!medicine) {
      throw new NotFoundException('Medicine not found');
    }
    const used = await this.prisma.saleItem.count({ where: { medicineId: id } });
    if (used > 0) {
      return this.prisma.medicine.update({
        where: { id },
        data: { status: MedicineStatus.ARCHIVED },
        include: MEDICINE_INCLUDE,
      });
    }
    return this.prisma.medicine.delete({ where: { id }, include: MEDICINE_INCLUDE });
  }

  /**
   * Adds a batch with initial stock at a branch and records the movement.
   */
  async addBatch(tenantId: string, medicineId: string, dto: CreateBatchDto, userId: string) {
    const medicine = await this.prisma.medicine.findFirst({
      where: { id: medicineId, tenantId },
    });
    if (!medicine) {
      throw new NotFoundException('Medicine not found');
    }
    const branch = await this.prisma.branch.findFirst({
      where: { id: dto.branchId, tenantId },
    });
    if (!branch) {
      throw new BadRequestException('Branch not found');
    }
    const expiryDate = new Date(dto.expiryDate);
    if (Number.isNaN(expiryDate.getTime())) {
      throw new BadRequestException('Invalid expiry date');
    }

    return this.prisma.$transaction(async (tx) => {
      const batch = await tx.batch.upsert({
        where: {
          tenantId_medicineId_batchNumber: {
            tenantId,
            medicineId,
            batchNumber: dto.batchNumber,
          },
        },
        update: {
          expiryDate,
          manufacturingDate: dto.manufacturingDate
            ? new Date(dto.manufacturingDate)
            : null,
          ...(dto.costPrice !== undefined ? { costPrice: dto.costPrice } : {}),
        },
        create: {
          tenantId,
          medicineId,
          batchNumber: dto.batchNumber,
          expiryDate,
          manufacturingDate: dto.manufacturingDate
            ? new Date(dto.manufacturingDate)
            : null,
          costPrice: dto.costPrice ?? toNumber(medicine.costPrice),
        },
      });

      if (dto.quantity > 0) {
        const stockItem = await tx.stockItem.upsert({
          where: { branchId_batchId: { branchId: dto.branchId, batchId: batch.id } },
          update: { quantity: { increment: dto.quantity } },
          create: {
            tenantId,
            branchId: dto.branchId,
            batchId: batch.id,
            quantity: dto.quantity,
          },
        });
        await tx.stockMovement.create({
          data: {
            tenantId,
            branchId: dto.branchId,
            medicineId,
            batchId: batch.id,
            userId,
            type: StockMovementType.ADJUSTMENT,
            quantity: dto.quantity,
            balanceAfter: stockItem.quantity,
            reason: 'Initial batch stock',
            refType: 'batch',
            refId: batch.id,
          },
        });
      }
      return batch;
    });
  }

  async exportExcel(tenantId: string): Promise<Buffer> {
    const medicines = await this.prisma.medicine.findMany({
      where: { tenantId },
      include: MEDICINE_INCLUDE,
      orderBy: { name: 'asc' },
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Medicines');
    sheet.columns = [
      { header: 'Barcode', key: 'barcode', width: 18 },
      { header: 'SKU', key: 'sku', width: 14 },
      { header: 'Name', key: 'name', width: 32 },
      { header: 'Arabic Name', key: 'nameAr', width: 32 },
      { header: 'Scientific Name', key: 'scientificName', width: 28 },
      { header: 'Manufacturer', key: 'manufacturer', width: 22 },
      { header: 'Category', key: 'category', width: 20 },
      { header: 'Supplier', key: 'supplier', width: 22 },
      { header: 'Purchase Price', key: 'purchasePrice', width: 14 },
      { header: 'Cost Price', key: 'costPrice', width: 12 },
      { header: 'Selling Price', key: 'sellingPrice', width: 14 },
      { header: 'Tax %', key: 'taxRate', width: 8 },
      { header: 'Unit', key: 'unit', width: 10 },
      { header: 'Min Stock', key: 'minStock', width: 10 },
      { header: 'Status', key: 'status', width: 12 },
    ];
    sheet.getRow(1).font = { bold: true };
    for (const medicine of medicines) {
      sheet.addRow({
        barcode: medicine.barcode,
        sku: medicine.sku,
        name: medicine.name,
        nameAr: medicine.nameAr ?? '',
        scientificName: medicine.scientificName ?? '',
        manufacturer: medicine.manufacturer ?? '',
        category: medicine.category?.name ?? '',
        supplier: medicine.supplier?.name ?? '',
        purchasePrice: toNumber(medicine.purchasePrice),
        costPrice: toNumber(medicine.costPrice),
        sellingPrice: toNumber(medicine.sellingPrice),
        taxRate: toNumber(medicine.taxRate),
        unit: medicine.unit,
        minStock: medicine.minStock,
        status: medicine.status,
      });
    }
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  /**
   * Imports medicines from an Excel file. Columns are matched by the
   * headers produced by exportExcel. Rows with an existing barcode update
   * the record; new barcodes create records.
   */
  async importExcel(tenantId: string, fileBuffer: Buffer) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fileBuffer as unknown as ArrayBuffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) {
      throw new BadRequestException('The Excel file contains no worksheets');
    }

    const headerRow = sheet.getRow(1);
    const headers = new Map<string, number>();
    headerRow.eachCell((cell, col) => {
      headers.set(String(cell.value ?? '').trim().toLowerCase(), col);
    });
    const col = (name: string) => headers.get(name.toLowerCase());
    if (!col('barcode') || !col('name')) {
      throw new BadRequestException(
        'Missing required columns: Barcode and Name',
      );
    }

    const errors: { row: number; message: string }[] = [];
    let created = 0;
    let updated = 0;

    const categories = await this.prisma.category.findMany({
      where: { tenantId },
    });
    const suppliers = await this.prisma.supplier.findMany({
      where: { tenantId },
    });
    const categoryByName = new Map(
      categories.map((c) => [c.name.toLowerCase(), c.id]),
    );
    const supplierByName = new Map(
      suppliers.map((s) => [s.name.toLowerCase(), s.id]),
    );

    const text = (row: ExcelJS.Row, name: string): string => {
      const index = col(name);
      if (!index) return '';
      const value = row.getCell(index).value;
      if (value === null || value === undefined) return '';
      if (typeof value === 'object' && 'text' in (value as object)) {
        return String((value as { text: string }).text).trim();
      }
      return String(value).trim();
    };
    const num = (row: ExcelJS.Row, name: string): number => {
      const raw = text(row, name);
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : 0;
    };

    for (let rowIndex = 2; rowIndex <= sheet.rowCount; rowIndex += 1) {
      const row = sheet.getRow(rowIndex);
      const barcode = text(row, 'barcode');
      const name = text(row, 'name');
      if (!barcode && !name) continue;
      if (!barcode || !name) {
        errors.push({ row: rowIndex, message: 'Barcode and Name are required' });
        continue;
      }

      const categoryName = text(row, 'category').toLowerCase();
      const supplierName = text(row, 'supplier').toLowerCase();

      const data = {
        name,
        nameAr: text(row, 'arabic name') || null,
        scientificName: text(row, 'scientific name') || null,
        manufacturer: text(row, 'manufacturer') || null,
        categoryId: categoryName ? categoryByName.get(categoryName) ?? null : null,
        supplierId: supplierName ? supplierByName.get(supplierName) ?? null : null,
        purchasePrice: num(row, 'purchase price'),
        costPrice: num(row, 'cost price') || num(row, 'purchase price'),
        sellingPrice: num(row, 'selling price'),
        taxRate: num(row, 'tax %'),
        unit: text(row, 'unit') || 'piece',
        minStock: Math.max(0, Math.trunc(num(row, 'min stock'))) || 10,
      };

      try {
        const existing = await this.prisma.medicine.findFirst({
          where: { tenantId, barcode },
        });
        if (existing) {
          await this.prisma.medicine.update({
            where: { id: existing.id },
            data,
          });
          updated += 1;
        } else {
          await this.planLimits.assertCanAddProducts(tenantId);
          await this.prisma.medicine.create({
            data: {
              tenantId,
              barcode,
              sku: text(row, 'sku') || (await this.nextSku(tenantId)),
              ...data,
            },
          });
          created += 1;
        }
      } catch (error) {
        errors.push({
          row: rowIndex,
          message: error instanceof Error ? error.message : 'Import failed',
        });
      }
    }

    return { created, updated, errors };
  }

  private async nextSku(tenantId: string): Promise<string> {
    const count = await this.prisma.medicine.count({ where: { tenantId } });
    return `MED-${String(count + 1).padStart(5, '0')}`;
  }
}
