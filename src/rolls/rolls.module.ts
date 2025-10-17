import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Roll } from '../entities/roll.entity';
import { Item } from '../entities/item.entity';
import { RollsService } from './rolls.service';
import { RollsController } from './rolls.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Roll, Item])],
  controllers: [RollsController],
  providers: [RollsService],
  exports: [TypeOrmModule],
})
export class RollsModule {}
