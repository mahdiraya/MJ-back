import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ItemsController } from './items.controller';
import { ItemsService } from './items.service';
import { Item } from '../entities/item.entity';
import { Roll } from '../entities/roll.entity';
import { InventoryUnit } from '../entities/inventory-unit.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Item, Roll, InventoryUnit]),
  ],
  controllers: [ItemsController],
  providers: [ItemsService],
  exports: [ItemsService, TypeOrmModule],
})
export class ItemsModule {}
