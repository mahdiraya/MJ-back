import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Supplier } from '../entities/supplier.entity';
import { Restock } from '../entities/restock.entity';
import { Payment } from '../entities/payment.entity';
import { Cashbox } from '../entities/cashbox.entity';
import { CashboxEntry } from '../entities/cashbox-entry.entity';
import { SuppliersService } from './suppliers.service';
import { SuppliersController } from './suppliers.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Supplier,
      Restock,
      Payment,
      Cashbox,
      CashboxEntry,
    ]),
  ],
  providers: [SuppliersService],
  controllers: [SuppliersController],
  exports: [TypeOrmModule, SuppliersService],
})
export class SuppliersModule {}
