import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { RestocksController } from './restocks.controller';
import { RestocksService } from './restocks.service';

import { Restock } from '../entities/restock.entity';
import { RestockItem } from '../entities/restock-item.entity';
import { RestockRoll } from '../entities/restock-roll.entity'; // <-- add
import { Item } from '../entities/item.entity';
import { Roll } from '../entities/roll.entity';
import { Payment } from '../entities/payment.entity'; // if RestocksService writes payments
import { Cashbox } from '../entities/cashbox.entity';
import { CashboxEntry } from '../entities/cashbox-entry.entity';
import { InventoryUnit } from '../entities/inventory-unit.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Restock,
      RestockItem,
      RestockRoll, // <-- register inverse entity so TypeORM can resolve RestockItem#rolls
      Item,
      Roll,
      Payment, // keep if you're creating payments on restock
      Cashbox,
      CashboxEntry,
      InventoryUnit,
    ]),
  ],
  controllers: [RestocksController],
  providers: [RestocksService],
  exports: [RestocksService],
})
export class RestocksModule {}
