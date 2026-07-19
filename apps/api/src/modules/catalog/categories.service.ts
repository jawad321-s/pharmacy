import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCategoryDto, UpdateCategoryDto } from './catalog.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  list(tenantId: string, includeArchived = false) {
    return this.prisma.category.findMany({
      where: { tenantId, ...(includeArchived ? {} : { isArchived: false }) },
      orderBy: { name: 'asc' },
      include: { _count: { select: { medicines: true } } },
    });
  }

  create(tenantId: string, dto: CreateCategoryDto) {
    return this.prisma.category.create({
      data: {
        tenantId,
        name: dto.name,
        nameAr: dto.nameAr ?? null,
        description: dto.description ?? null,
      },
    });
  }

  async update(tenantId: string, id: string, dto: UpdateCategoryDto) {
    await this.findOne(tenantId, id);
    return this.prisma.category.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.nameAr !== undefined ? { nameAr: dto.nameAr } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.isArchived !== undefined ? { isArchived: dto.isArchived } : {}),
      },
    });
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    const medicines = await this.prisma.medicine.count({
      where: { categoryId: id },
    });
    if (medicines > 0) {
      // Archive instead of delete when in use.
      return this.prisma.category.update({
        where: { id },
        data: { isArchived: true },
      });
    }
    return this.prisma.category.delete({ where: { id } });
  }

  private async findOne(tenantId: string, id: string) {
    const category = await this.prisma.category.findFirst({
      where: { id, tenantId },
    });
    if (!category) {
      throw new NotFoundException('Category not found');
    }
    return category;
  }
}
