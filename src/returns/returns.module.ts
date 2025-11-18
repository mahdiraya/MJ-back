import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { InventoryUnit } from '../entities/inventory-unit.entity';
import { InventoryReturn } from '../entities/inventory-return.entity';
import { Item } from '../entities/item.entity';
import { Supplier } from '../entities/supplier.entity';
import { ReturnsService } from './returns.service';
import { ReturnsController } from './returns.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([InventoryUnit, InventoryReturn, Item, Supplier]),
  ],
  controllers: [ReturnsController],
  providers: [ReturnsService],
  exports: [ReturnsService],
})
export class ReturnsModule {}
