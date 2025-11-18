import {
  IsOptional,
  IsIn,
  IsInt,
  IsNumber,
  Min,
  ValidateIf,
  IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';

export type LineMode = 'EACH' | 'METER';
export type PriceTier = 'retail' | 'wholesale';

export class CreateTransactionItemDto {
  /** Accepts either `itemId` (new) or `item` (legacy). Service will normalize. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  itemId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  item?: number;

  /** Optional; backend defaults to 'EACH' if omitted */
  @IsOptional()
  @IsIn(['EACH', 'METER'])
  mode?: LineMode;

  // ===== EACH mode fields =====
  @ValidateIf((o) => (o.mode ?? 'EACH') === 'EACH')
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(1)
  quantity?: number;

  @ValidateIf((o) => (o.mode ?? 'EACH') === 'EACH')
  @IsOptional()
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  inventoryUnitIds?: number[];

  // ===== METER mode fields =====
  @ValidateIf((o) => (o.mode ?? 'EACH') === 'METER')
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  lengthMeters?: number;

  @ValidateIf((o) => (o.mode ?? 'EACH') === 'METER' && o.rollId !== undefined)
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  rollId?: number;

  // ===== Pricing per line =====
  /** Optional per-line tier; ignored if unitPrice is provided */
  @IsOptional()
  @IsIn(['retail', 'wholesale'])
  priceTier?: PriceTier;

  /** Optional unit price override (per piece/meter) */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice?: number;
}
