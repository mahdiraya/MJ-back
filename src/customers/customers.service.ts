import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Customer } from '../entities/customer.entity';
import { Transaction } from '../entities/transaction.entity';
import { Repository } from 'typeorm';
import { BaseService } from '../base/base.service';

export type CustomerSalesSummary = {
  id: number;
  name: string;
  receiptCount: number;
  totalSpent: number;
  lastPurchase: string | null;
};

@Injectable()
export class CustomersService extends BaseService<Customer> {
  constructor(
    @InjectRepository(Customer) repo: Repository<Customer>,
    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,
  ) {
    super(repo);
  }

  async findWithSales(): Promise<CustomerSalesSummary[]> {
    const rows = await this.transactionRepo
      .createQueryBuilder('t')
      .innerJoin('t.customer', 'customer')
      .select('customer.id', 'id')
      .addSelect('customer.name', 'name')
      .addSelect('COUNT(t.id)', 'receiptCount')
      .addSelect('SUM(t.total)', 'totalSpent')
      .addSelect('MAX(t.date)', 'lastPurchase')
      .groupBy('customer.id')
      .addGroupBy('customer.name')
      .orderBy('customer.name', 'ASC')
      .getRawMany<{
        id: string;
        name: string;
        receiptCount: string;
        totalSpent: string;
        lastPurchase: Date | string | null;
      }>();

    return rows.map((row) => ({
      id: Number(row.id),
      name: row.name,
      receiptCount: Number(row.receiptCount || 0),
      totalSpent: +Number(row.totalSpent || 0).toFixed(2),
      lastPurchase: row.lastPurchase
        ? new Date(row.lastPurchase).toISOString()
        : null,
    }));
  }
}
