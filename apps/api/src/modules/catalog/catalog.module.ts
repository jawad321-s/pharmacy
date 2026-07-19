import { Module } from '@nestjs/common';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { SuppliersController } from './suppliers.controller';
import { SuppliersService } from './suppliers.service';

@Module({
  controllers: [CategoriesController, SuppliersController],
  providers: [CategoriesService, SuppliersService],
  exports: [CategoriesService, SuppliersService],
})
export class CatalogModule {}
