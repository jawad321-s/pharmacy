import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InventoryCountType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class StockQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional({ description: 'low | out | nearExpiry | expired' })
  @IsOptional()
  @IsString()
  alert?: string;
}

export class AdjustStockDto {
  @ApiProperty()
  @IsUUID()
  branchId: string;

  @ApiProperty()
  @IsUUID()
  batchId: string;

  @ApiProperty({ description: 'Signed quantity change (+ add, - remove)' })
  @Type(() => Number)
  @IsInt()
  quantityChange: number;

  @ApiProperty({ example: 'Damaged stock write-off' })
  @IsString()
  @IsNotEmpty()
  reason: string;
}

export class CreateTransferItemDto {
  @ApiProperty()
  @IsUUID()
  batchId: string;

  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;
}

export class CreateTransferDto {
  @ApiProperty()
  @IsUUID()
  fromBranchId: string;

  @ApiProperty()
  @IsUUID()
  toBranchId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ type: [CreateTransferItemDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CreateTransferItemDto)
  items: CreateTransferItemDto[];
}

export class CreateCountDto {
  @ApiProperty()
  @IsUUID()
  branchId: string;

  @ApiProperty({ enum: InventoryCountType, example: InventoryCountType.FULL })
  @IsEnum(InventoryCountType)
  type: InventoryCountType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    description: 'Batch ids to include for CYCLE / SPOT counts; FULL includes everything',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  batchIds?: string[];
}

export class CountItemEntryDto {
  @ApiProperty()
  @IsUUID()
  batchId: string;

  @ApiProperty({ minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  countedQty: number;
}

export class SubmitCountDto {
  @ApiProperty({ type: [CountItemEntryDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CountItemEntryDto)
  items: CountItemEntryDto[];
}
