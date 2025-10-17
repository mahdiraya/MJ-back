import { Controller, UseGuards, Delete, Param } from '@nestjs/common';
import { TransactionItemsService } from './transaction-items.service';
import { BaseController } from '../base/base.controller';
import { TransactionItem } from '../entities/transaction-item.entity';
import { CreateTransactionItemDto } from './create-transaction-item.dto';
import { UpdateTransactionItemDto } from './update-transaction-item.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('transaction-items')
export class TransactionItemsController extends BaseController<
  TransactionItem,
  CreateTransactionItemDto,
  UpdateTransactionItemDto
> {
  constructor(
    private readonly transactionItemsService: TransactionItemsService,
  ) {
    super(transactionItemsService);
  }

  @Roles('manager', 'admin')
  @Delete(':id')
  delete(@Param('id') id: number) {
    return this.service.delete(id);
  }
}
