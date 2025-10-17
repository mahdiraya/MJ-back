// src/transactions/transactions.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';

import { Transaction } from '../entities/transaction.entity';
import { TransactionItem } from '../entities/transaction-item.entity';
import { Item } from '../entities/item.entity';
import { Roll } from '../entities/roll.entity';
import { Payment } from '../entities/payment.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Transaction,
      TransactionItem,
      Item,
      Roll,
      Payment, // <-- add this
    ]),
  ],
  controllers: [TransactionsController],
  providers: [TransactionsService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
