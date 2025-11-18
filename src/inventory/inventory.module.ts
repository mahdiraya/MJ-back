import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { InventoryUnit } from '../entities/inventory-unit.entity';
import { Item } from '../entities/item.entity';
import { TransactionItemUnit } from '../entities/transaction-item-unit.entity';
import { TransactionItem } from '../entities/transaction-item.entity';
import { Transaction } from '../entities/transaction.entity';
import { Customer } from '../entities/customer.entity';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { ReturnsModule } from '../returns/returns.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      InventoryUnit,
      Item,
      TransactionItemUnit,
      TransactionItem,
      Transaction,
      Customer,
    ]),
    ReturnsModule,
  ],
  controllers: [InventoryController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
