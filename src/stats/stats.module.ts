import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';
import { Cashbox } from '../entities/cashbox.entity';
import { CashboxEntry } from '../entities/cashbox-entry.entity';
import { Restock } from '../entities/restock.entity';
import { Transaction } from '../entities/transaction.entity';
import { Payment } from '../entities/payment.entity';
import { TransactionItem } from '../entities/transaction-item.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Cashbox,
      CashboxEntry,
      Restock,
      Transaction,
      TransactionItem,
      Payment,
    ]),
  ],
  controllers: [StatsController],
  providers: [StatsService],
  exports: [StatsService],
})
export class StatsModule {}
