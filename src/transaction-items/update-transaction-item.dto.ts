import { PartialType } from '@nestjs/mapped-types';
import { CreateTransactionItemDto } from './create-transaction-item.dto';

export class UpdateTransactionItemDto extends PartialType(
  CreateTransactionItemDto,
) {}
