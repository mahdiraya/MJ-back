import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction } from '../entities/transaction.entity';
import { Restock } from '../entities/restock.entity';

type UnifiedMode = 'IN' | 'OUT';

type UnifiedReceiptRow = {
  id: string; // "OUT-12" | "IN-5"
  mode: UnifiedMode;
  date: Date | null; // kept as Date|null; frontend can coerce to string if desired
  total: number;
  paid: number;
  statusCode?: 'PAID' | 'PARTIAL' | 'UNPAID';
  user: { id: number; name?: string } | null;
  party: { id: number; name?: string } | null; // customer (OUT) or { id } (IN) for now
  rawId: number;
  type: string; // 'simple' | 'detailed' | 'restock'
};

@Injectable()
export class ReceiptsService {
  constructor(
    @InjectRepository(Transaction) private txRepo: Repository<Transaction>,
    @InjectRepository(Restock) private rsRepo: Repository<Restock>,
  ) {}

  /** Safe date -> timestamp (null/undefined => 0) */
  private toTs(d: Date | string | null | undefined): number {
    if (!d) return 0;
    return d instanceof Date ? d.getTime() : new Date(d).getTime();
  }

  async listUnified(limit = 200): Promise<UnifiedReceiptRow[]> {
    const outsRaw = await this.txRepo
      .createQueryBuilder('t')
      .leftJoin('t.user', 'user')
      .leftJoin('t.customer', 'customer')
      .leftJoin('t.payments', 'pay')
      .select('t.id', 'id')
      .addSelect('t.date', 'date')
      .addSelect('t.total', 'total')
      .addSelect('t.receipt_type', 'type')
      .addSelect('t.status', 'status')
      .addSelect('user.id', 'userId')
      .addSelect('user.name', 'userName')
      .addSelect('user.username', 'userUsername')
      .addSelect('customer.id', 'customerId')
      .addSelect('customer.name', 'customerName')
      .addSelect(
        `COALESCE(SUM(CASE WHEN pay.kind = 'sale' THEN pay.amount ELSE 0 END), 0)`,
        'paid',
      )
      .orderBy('t.date', 'DESC')
      .addOrderBy('t.id', 'DESC')
      .limit(limit)
      .groupBy('t.id')
      .addGroupBy('user.id')
      .addGroupBy('customer.id')
      .addGroupBy('user.name')
      .addGroupBy('user.username')
      .addGroupBy('customer.name')
      .addGroupBy('t.total')
      .addGroupBy('t.receipt_type')
      .addGroupBy('t.status')
      .getRawMany<{
        id: number;
        date: Date | null;
        total: string;
        type: string;
        status: 'PAID' | 'PARTIAL' | 'UNPAID' | null;
        paid: string;
        userId: number | null;
        userName: string | null;
        userUsername: string | null;
        customerId: number | null;
        customerName: string | null;
      }>();

    const insRaw = await this.rsRepo
      .createQueryBuilder('r')
      .leftJoin('r.user', 'user')
      .leftJoin('r.payments', 'pay')
      .select('r.id', 'id')
      .addSelect('COALESCE(r.date, r.created_at)', 'date')
      .addSelect('r.total', 'total')
      .addSelect('r.status', 'status')
      .addSelect('r.supplierId', 'supplierId')
      .addSelect('user.id', 'userId')
      .addSelect('user.name', 'userName')
      .addSelect('user.username', 'userUsername')
      .addSelect(
        `COALESCE(SUM(CASE WHEN pay.kind = 'restock' THEN pay.amount ELSE 0 END), 0)`,
        'paid',
      )
      .orderBy('date', 'DESC')
      .addOrderBy('r.id', 'DESC')
      .limit(limit)
      .groupBy('r.id')
      .addGroupBy('user.id')
      .addGroupBy('user.name')
      .addGroupBy('user.username')
      .addGroupBy('r.supplierId')
      .addGroupBy('r.total')
      .addGroupBy('r.status')
      .getRawMany<{
        id: number;
        date: Date | null;
        total: string;
        status: 'PAID' | 'PARTIAL' | 'UNPAID' | null;
        supplierId: number | null;
        paid: string;
        userId: number | null;
        userName: string | null;
        userUsername: string | null;
      }>();

    const mappedOut: UnifiedReceiptRow[] = outsRaw.map((row) => ({
      id: `OUT-${row.id}`,
      mode: 'OUT',
      date: row.date ?? null,
      total: Number(row.total || 0),
      paid: Number(row.paid || 0),
      statusCode: row.status ?? undefined,
      user: row.userId
        ? {
            id: Number(row.userId),
            name: row.userName || row.userUsername || undefined,
          }
        : null,
      party: row.customerId
        ? {
            id: Number(row.customerId),
            name: row.customerName ?? undefined,
          }
        : null,
      rawId: Number(row.id),
      type: row.type ?? 'simple',
    }));

    const mappedIn: UnifiedReceiptRow[] = insRaw.map((row) => ({
      id: `IN-${row.id}`,
      mode: 'IN',
      date: row.date ?? null,
      total: Number(row.total || 0),
      paid: Number(row.paid || 0),
      statusCode: row.status ?? undefined,
      user: row.userId
        ? {
            id: Number(row.userId),
            name: row.userName || row.userUsername || undefined,
          }
        : null,
      party:
        row.supplierId != null
          ? {
              id: Number(row.supplierId),
              name: undefined,
            }
          : null,
      rawId: Number(row.id),
      type: 'restock',
    }));

    return [...mappedOut, ...mappedIn]
      .sort((a, b) => this.toTs(b.date) - this.toTs(a.date))
      .slice(0, limit);
  }
}
