import { IsOptional, IsInt, IsIn, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

export class RestockMovementsQueryDto {
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  supplierId?: number;

  @IsOptional()
  @IsIn(['PAID', 'PARTIAL', 'UNPAID'])
  status?: 'PAID' | 'PARTIAL' | 'UNPAID';

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
