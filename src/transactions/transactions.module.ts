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
import { Cashbox } from '../entities/cashbox.entity';
import { CashboxEntry } from '../entities/cashbox-entry.entity';
import { Customer } from '../entities/customer.entity';
import { InventoryUnit } from '../entities/inventory-unit.entity';
import { TransactionItemUnit } from '../entities/transaction-item-unit.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Transaction,
      TransactionItem,
      Item,
      Roll,
      Payment, // <-- add this
      Cashbox,
      CashboxEntry,
      Customer,
      InventoryUnit,
      TransactionItemUnit,
    ]),
  ],
  controllers: [TransactionsController],
  providers: [TransactionsService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
