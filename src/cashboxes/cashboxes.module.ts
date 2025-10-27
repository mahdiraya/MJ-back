import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Cashbox } from '../entities/cashbox.entity';
import { CashboxEntry } from '../entities/cashbox-entry.entity';
import { CashboxesService } from './cashboxes.service';
import { CashboxesController } from './cashboxes.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Cashbox, CashboxEntry])],
  controllers: [CashboxesController],
  providers: [CashboxesService],
  exports: [CashboxesService],
})
export class CashboxesModule {}
