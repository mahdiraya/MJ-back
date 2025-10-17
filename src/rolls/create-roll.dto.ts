import { IsInt, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateRollDto {
  @IsInt()
  @Type(() => Number)
  itemId: number;

  @IsNumber({ maxDecimalPlaces: 3 })
  @Type(() => Number)
  @Min(0.001)
  length_m: number;
}
