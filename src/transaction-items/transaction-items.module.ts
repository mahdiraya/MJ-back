import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionItemsService } from './transaction-items.service';
import { TransactionItemsController } from './transaction-items.controller';
import { TransactionItem } from 'src/entities/transaction-item.entity';

@Module({
  imports: [TypeOrmModule.forFeature([TransactionItem])],
  providers: [TransactionItemsService],
  controllers: [TransactionItemsController],
  exports: [TypeOrmModule],
})
export class TransactionItemsModule {}
