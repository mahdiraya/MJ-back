import {
  IsInt,
  IsNumber,
  IsOptional,
  IsIn,
  ValidateNested,
  ArrayMinSize,
  IsString,
  Min,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateTransactionItemDto } from 'src/transaction-items/create-transaction-item.dto';
import { ReceiptStatus } from '../entities/transaction.entity';

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

  @IsString()
  @IsOptional()
  customerName?: string;

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

  @Type(() => Number)
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  paid?: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  cashboxId?: number;

  @IsOptional()
  @IsString()
  cashboxCode?: string;

  @IsOptional()
  @IsString()
  paymentNote?: string;

  @IsOptional()
  @IsDateString()
  paymentDate?: string;

  @IsOptional()
  @IsIn(['PAID', 'PARTIAL', 'UNPAID'])
  statusOverride?: ReceiptStatus;

  @IsOptional()
  @IsString()
  statusOverrideNote?: string;
}
