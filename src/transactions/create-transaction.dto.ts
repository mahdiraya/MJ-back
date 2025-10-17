import {
  IsInt,
  IsNumber,
  IsOptional,
  IsIn,
  ValidateNested,
  ArrayMinSize,
  IsString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateTransactionItemDto } from 'src/transaction-items/create-transaction-item.dto';

export type PriceTier = 'retail' | 'wholesale';
export type PaymentCashbox = 'A' | 'B' | 'C';
export type PaymentMethod = 'cash' | 'card' | 'transfer' | 'other';

export class CreateTransactionDto {
  @IsInt()
  @IsOptional()
  user?: number;

  @IsInt()
  @IsOptional()
  customer?: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsOptional()
  total?: number;

  @IsIn(['simple', 'detailed'])
  receipt_type: 'simple' | 'detailed';

  /** Optional note */
  @IsString()
  @IsOptional()
  note?: string;

  /** OPTIONAL immediate payment on checkout */
  @Type(() => Number)
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amountPaidNow?: number;

  @IsOptional()
  @IsIn(['A', 'B', 'C'])
  cashbox?: PaymentCashbox;

  @IsOptional()
  @IsIn(['cash', 'card', 'transfer', 'other'])
  payMethod?: PaymentMethod;

  @ValidateNested({ each: true })
  @Type(() => CreateTransactionItemDto)
  @ArrayMinSize(1)
  items: CreateTransactionItemDto[];
}
