import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

import { InventoryUnitStatus } from '../../entities/inventory-unit.entity';

export class ListInventoryUnitsDto {
  @Type(() => Boolean)
  @IsOptional()
  @IsBoolean()
  includePlaceholders?: boolean;

  @IsOptional()
  @IsIn(['available', 'reserved', 'sold', 'returned', 'defective'])
  status?: InventoryUnitStatus;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;
}

export class AssignBarcodeDto {
  @IsOptional()
  @IsString()
  barcode?: string | null;
}

export class ReturnInventoryUnitDto {
  @IsIn(['restock', 'defective'])
  outcome!: 'restock' | 'defective';

  @IsOptional()
  @IsString()
  note?: string;
}
