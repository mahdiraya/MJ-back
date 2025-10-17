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
    const [outs, ins] = await Promise.all([
      this.txRepo.find({
        relations: ['user', 'customer'],
        order: { date: 'DESC' },
        take: limit,
      }),
      this.rsRepo.find({
        relations: ['user'], // Restock has user; supplierId is just a number for now
        order: { date: 'DESC' },
        take: limit,
      }),
    ]);

    const mappedOut: UnifiedReceiptRow[] = outs.map((t) => ({
      id: `OUT-${t.id}`,
      mode: 'OUT',
      date: (t as any).date ?? null,
      total: Number((t as any).total ?? 0),
      user: (t as any).user
        ? {
            id: Number((t as any).user.id),
            name: (t as any).user.name || (t as any).user.username,
          }
        : null,
      party: (t as any).customer
        ? {
            id: Number((t as any).customer.id),
            name: (t as any).customer.name,
          }
        : null,
      rawId: t.id,
      type: (t as any).receipt_type ?? 'simple',
    }));

    const mappedIn: UnifiedReceiptRow[] = ins.map((r) => {
      // Prefer explicit date; fall back to created_at so it always sorts/prints
      const date: Date | null =
        ((r as any).date as Date | null) ??
        ((r as any).created_at as Date | null) ??
        null;
      return {
        id: `IN-${r.id}`,
        mode: 'IN',
        date,
        total: Number((r as any).total ?? 0),
        user: (r as any).user
          ? {
              id: Number((r as any).user.id),
              name: (r as any).user.name || (r as any).user.username,
            }
          : null,
        party:
          (r as any).supplierId != null
            ? { id: Number((r as any).supplierId) }
            : null,
        rawId: r.id,
        type: 'restock',
      };
    });

    return [...mappedOut, ...mappedIn]
      .sort((a, b) => this.toTs(b.date) - this.toTs(a.date))
      .slice(0, limit);
  }
}
