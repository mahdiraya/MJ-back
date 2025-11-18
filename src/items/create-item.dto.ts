import {
  IsString,
  IsOptional,
  IsNumber,
  IsNotEmpty,
  IsIn,
  Min,
  IsArray,
  IsNumberOptions,
  ValidateIf,
  ArrayMaxSize,
  ArrayNotEmpty,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ItemCategory, StockUnit } from '../entities/item.entity';

const num2: IsNumberOptions = { maxDecimalPlaces: 2 };
const num3: IsNumberOptions = { maxDecimalPlaces: 3 };

export class CreateItemDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  sku?: string;

  @IsIn(['internet', 'solar', 'camera', 'satellite'])
  @IsOptional()
  category?: ItemCategory;

  // For unit items: how many pieces are in stock initially
  // For meter items: will be computed from rolls if initialRolls is provided
  @Type(() => Number)
  @IsNumber(num3)
  @Min(0)
  stock: number;

  // unified storage: only 'm' or null
  @IsIn(['m', null])
  @IsOptional()
  stockUnit?: StockUnit;

  // Optional UI hint (not enforced)
  @Type(() => Number)
  @IsOptional()
  @IsNumber(num2)
  @Min(0)
  rollLength?: number;

  /** Preferred retail price */
  @Type(() => Number)
  @IsOptional()
  @IsNumber(num2)
  @Min(0)
  priceRetail?: number;

  /** Wholesale price */
  @Type(() => Number)
  @IsOptional()
  @IsNumber(num2)
  @Min(0)
  priceWholesale?: number;

  /** LEGACY fallback: service may copy to priceRetail if missing */
  @Type(() => Number)
  @IsOptional()
  @IsNumber(num2)
  @Min(0)
  price?: number;

  /** Optional image url (usually set by upload endpoint; allowing here is harmless) */
  @IsString()
  @IsOptional()
  photoUrl?: string | null;

  @IsString()
  @IsOptional()
  description?: string;

  // Optional: create rolls at item creation when stockUnit === 'm'
  // Example: [100, 80.5, 120]
  @IsOptional()
  @IsArray()
  @ValidateIf((o) => o.stockUnit === 'm')
  @Type(() => Number)
  initialRolls?: number[];

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  initialSerials?: string[];

  @IsOptional()
  @IsBoolean()
  autoSerial?: boolean;
}
