import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer } from '../entities/customer.entity';
import { Transaction } from '../entities/transaction.entity';
import { CustomersService } from './customers.service';
import { CustomersController } from './customers.controller';
import { TransactionsModule } from '../transactions/transactions.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Customer, Transaction]),
    TransactionsModule,
  ],
  providers: [CustomersService],
  controllers: [CustomersController],
  exports: [TypeOrmModule, CustomersService],
})
export class CustomersModule {}
