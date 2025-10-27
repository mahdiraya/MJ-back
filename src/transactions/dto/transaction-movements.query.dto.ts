import { IsOptional, IsInt, IsIn, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

export class TransactionMovementsQueryDto {
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  customerId?: number;

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
