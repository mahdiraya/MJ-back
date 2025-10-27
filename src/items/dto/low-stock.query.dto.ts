import { IsOptional, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class LowStockQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  eachThreshold?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  meterThreshold?: number;
}
