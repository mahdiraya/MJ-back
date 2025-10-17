import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseService } from '../base/base.service';
import { TransactionItem } from '../entities/transaction-item.entity';

@Injectable()
export class TransactionItemsService extends BaseService<TransactionItem> {
  constructor(
    @InjectRepository(TransactionItem) repo: Repository<TransactionItem>,
  ) {
    super(repo);
  }
}
