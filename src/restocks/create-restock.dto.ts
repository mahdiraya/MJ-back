// src/restocks/create-restock.dto.ts
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  Min,
  ValidateNested,
  IsString,
} from 'class-validator';

// Matches your Item entity
export type ItemCategory = 'internet' | 'solar' | 'camera' | 'satellite';
export type StockUnit = 'm' | null;

export class NewItemDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  sku?: string | null;

  @IsOptional()
  @IsIn(['internet', 'solar', 'camera', 'satellite'])
  category?: ItemCategory | null;

  // 'm' for meter items, null (or omitted) for EACH
  @IsOptional()
  @IsIn(['m', null])
  stockUnit?: StockUnit;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Type(() => Number)
  @Min(0)
  rollLength?: number | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Type(() => Number)
  @Min(0)
  priceRetail?: number | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Type(() => Number)
  @Min(0)
  priceWholesale?: number | null;

  @IsOptional()
  @IsString()
  description?: string | null;
}

export class RestockLineDto {
  // Either itemId OR newItem must be provided (service enforces XOR)
  @IsOptional()
  @IsInt()
  itemId?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => NewItemDto)
  newItem?: NewItemDto;

  @IsIn(['EACH', 'METER'])
  mode!: 'EACH' | 'METER';

  // EACH
  @Type(() => Number)
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(1)
  quantity?: number;

  // METER: lengths for new rolls (each number is meters)
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @Type(() => Number)
  newRolls?: number[];

  // optional costing per unit (piece or meter)
  @Type(() => Number)
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitCost?: number;
}

export class CreateRestockDto {
  // optional supplier id (you can add a Supplier entity later)
  @IsOptional()
  @IsInt()
  supplier?: number;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsNotEmpty()
  note?: string;

  @Type(() => Number)
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  tax?: number;

  @ValidateNested({ each: true })
  @Type(() => RestockLineDto)
  @ArrayMinSize(1)
  items!: RestockLineDto[];
}
