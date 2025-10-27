import {
  IsIn,
  IsNumber,
  Min,
  IsOptional,
  IsInt,
  IsString,
  IsDateString,
} from 'class-validator';

export class CreateManualCashboxEntryDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @IsIn(['income', 'expense'])
  kind!: 'income' | 'expense';

  @IsOptional()
  @IsInt()
  cashboxId?: number;

  @IsOptional()
  @IsString()
  cashboxCode?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsDateString()
  occurredAt?: string;
}
