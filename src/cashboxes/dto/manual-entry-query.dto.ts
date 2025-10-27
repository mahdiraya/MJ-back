import { IsOptional, IsIn, IsInt, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

export class ManualEntryQueryDto {
  @IsOptional()
  @IsIn(['income', 'expense'])
  kind?: 'income' | 'expense';

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  cashboxId?: number;

  @IsOptional()
  cashboxCode?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  search?: string;
}
