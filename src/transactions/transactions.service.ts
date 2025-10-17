import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Scope,
  Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  DataSource,
  In,
  DeepPartial,
  MoreThanOrEqual,
} from 'typeorm';
import { BaseService } from '../base/base.service';
import { Transaction } from '../entities/transaction.entity';
import { Item } from '../entities/item.entity';
import { TransactionItem } from '../entities/transaction-item.entity';
import { CreateTransactionDto } from './create-transaction.dto';
import { REQUEST } from '@nestjs/core';
import { Request } from 'express';
import { Roll } from '../entities/roll.entity';
import { Payment } from '../entities/payment.entity';

type PriceTier = 'retail' | 'wholesale';

type EachLine = {
  itemId: number;
  mode: 'EACH';
  quantity: number;
  priceTier?: PriceTier;
  unitPrice?: number;
};

type MeterLine = {
  itemId: number;
  mode: 'METER';
  lengthMeters: number;
  rollId?: number;
  priceTier?: PriceTier;
  unitPrice?: number;
};

type AnyLine = EachLine | MeterLine;

@Injectable({ scope: Scope.REQUEST })
export class TransactionsService extends BaseService<Transaction> {
  constructor(
    @InjectRepository(Transaction) repo: Repository<Transaction>,
    private dataSource: DataSource,
    @InjectRepository(Item) private itemRepo: Repository<Item>,
    @InjectRepository(Roll) private rollRepo: Repository<Roll>,
    @InjectRepository(TransactionItem)
    private transactionItemRepo: Repository<TransactionItem>,
    @InjectRepository(Payment) private paymentRepo: Repository<Payment>,
    @Inject(REQUEST) private readonly req: Request,
  ) {
    super(repo);
  }

  private num2(n: any): number {
    const v = Number(n ?? 0);
    return +v.toFixed(2);
  }

  private resolveUserId(dto: Partial<CreateTransactionDto>): number {
    if ((dto as any)?.user != null) {
      const n = Number((dto as any).user);
      if (!Number.isNaN(n) && n > 0) return n;
    }
    const u: any = (this.req as any)?.user || {};
    const cand = u.id ?? u.userId ?? u.sub ?? u.uid;
    const n = Number(cand);
    if (!cand || Number.isNaN(n) || n <= 0) {
      throw new BadRequestException('Missing user for transaction.');
    }
    return n;
  }

  private pickUnitPrice(
    item: Item,
    priceTier?: PriceTier,
    unitPrice?: number,
  ): number {
    if (typeof unitPrice === 'number' && unitPrice >= 0) {
      return Number(unitPrice.toFixed(2));
    }

    const retail =
      (item as any).priceRetail ?? item.price ?? (item as any).priceWholesale;
    const wholesale =
      (item as any).priceWholesale ?? (item as any).priceRetail ?? item.price;

    const chosen = (priceTier === 'wholesale' ? wholesale : retail) ?? 0;
    return Number(Number(chosen).toFixed(2));
  }

  async createTransaction(
    data: CreateTransactionDto,
  ): Promise<Transaction | any> {
    return this.dataSource.transaction(async (manager) => {
      if (
        !data.items ||
        !Array.isArray(data.items) ||
        data.items.length === 0
      ) {
        throw new BadRequestException('No items provided for transaction.');
      }

      const userId = this.resolveUserId(data);

      // Normalize lines
      const lines: AnyLine[] = data.items.map((i: any) => {
        const mode = (i.mode as 'EACH' | 'METER') || 'EACH';
        const base = {
          itemId: Number(i.itemId ?? i.item),
          priceTier: i.priceTier as PriceTier | undefined,
          unitPrice: i.unitPrice != null ? Number(i.unitPrice) : undefined,
        };
        if (mode === 'EACH') {
          return { ...base, mode, quantity: Number(i.quantity ?? 0) };
        }
        return {
          ...base,
          mode,
          lengthMeters: Number(i.lengthMeters ?? 0),
          rollId: i.rollId != null ? Number(i.rollId) : undefined,
        };
      });

      const ids = lines.map((l) => l.itemId);
      const itemsInDb = await manager
        .getRepository(Item)
        .findBy({ id: In(ids) });
      const itemMap = new Map<number, Item>(itemsInDb.map((it) => [it.id, it]));

      // Validate & roll checks
      for (const l of lines) {
        const it = itemMap.get(l.itemId);
        if (!it)
          throw new BadRequestException(`Item with id ${l.itemId} not found`);

        if (l.mode === 'EACH') {
          if (it.stockUnit === 'm') {
            throw new BadRequestException(
              `Item "${it.name}" is metered; sell as METER.`,
            );
          }
          if (!(l.quantity > 0)) {
            throw new BadRequestException(
              `Quantity must be > 0 for "${it.name}".`,
            );
          }
          if (Number(it.stock) < l.quantity) {
            throw new BadRequestException(
              `Not enough stock for "${it.name}" (wanted ${l.quantity}, in stock ${it.stock}).`,
            );
          }
        } else {
          if (it.stockUnit !== 'm') {
            throw new BadRequestException(
              `Item "${it.name}" is unit-based; sell as EACH.`,
            );
          }
          if (!(l.lengthMeters > 0)) {
            throw new BadRequestException(
              `lengthMeters must be > 0 for "${it.name}".`,
            );
          }
          if (Number(it.stock) < l.lengthMeters) {
            throw new BadRequestException(
              `Not enough meters for "${it.name}" (wanted ${l.lengthMeters}, available ${it.stock}).`,
            );
          }

          if (l.rollId) {
            const roll = await manager.getRepository(Roll).findOne({
              where: { id: l.rollId },
              relations: ['item'],
            });
            if (!roll || roll.item.id !== it.id) {
              throw new BadRequestException(
                `Roll ${l.rollId} not found for item "${it.name}".`,
              );
            }
            if (Number(roll.remaining_m) < l.lengthMeters) {
              throw new BadRequestException(
                `Roll ${l.rollId} for "${it.name}" has only ${roll.remaining_m}m left.`,
              );
            }
          } else {
            const roll = await manager.getRepository(Roll).findOne({
              where: {
                item: { id: it.id },
                remaining_m: MoreThanOrEqual(l.lengthMeters),
              },
              order: { id: 'ASC' },
            });
            if (!roll) {
              throw new BadRequestException(
                `No roll with enough remaining meters for "${it.name}". Please choose a specific roll.`,
              );
            }
            (l as MeterLine).rollId = roll.id;
          }
        }
      }

      // Apply stock changes
      for (const l of lines) {
        const it = itemMap.get(l.itemId)!;
        if (l.mode === 'EACH') {
          await manager
            .getRepository(Item)
            .decrement({ id: it.id }, 'stock', l.quantity);
          it.stock = Number((Number(it.stock) - l.quantity).toFixed(3));
        } else {
          const roll = await manager
            .getRepository(Roll)
            .findOneByOrFail({ id: (l as MeterLine).rollId! });
          await manager
            .getRepository(Roll)
            .decrement({ id: roll.id }, 'remaining_m', l.lengthMeters);
          await manager
            .getRepository(Item)
            .decrement({ id: it.id }, 'stock', l.lengthMeters);
          it.stock = Number((Number(it.stock) - l.lengthMeters).toFixed(3));
        }
      }

      // Price lines
      type Priced = AnyLine & { priceEach: number };
      const pricedLines: Priced[] = lines.map((l) => {
        const it = itemMap.get(l.itemId)!;
        const priceEach = this.pickUnitPrice(
          it,
          (l as any).priceTier,
          (l as any).unitPrice,
        );
        return { ...l, priceEach };
      });

      const total = pricedLines.reduce((sum, l) => {
        const qtyOrMeters =
          l.mode === 'EACH'
            ? (l as EachLine).quantity
            : (l as MeterLine).lengthMeters;
        return sum + l.priceEach * qtyOrMeters;
      }, 0);

      // Create transaction
      const txRepo = manager.getRepository(Transaction);
      const txEntity = txRepo.create({
        user: { id: userId } as any,
        customer: (data as any).customer
          ? ({ id: (data as any).customer } as any)
          : undefined,
        total: this.num2(total),
        receipt_type: (data as any).receipt_type || 'simple',
        date: new Date(),
        note: (data as any).note ?? null,
      } as DeepPartial<Transaction>);
      const savedTx = await txRepo.save(txEntity);

      // Lines
      const tiRepo = manager.getRepository(TransactionItem);
      for (const l of pricedLines) {
        const tiEntity = tiRepo.create({
          transaction: { id: savedTx.id } as any,
          item: { id: l.itemId } as any,
          quantity: l.mode === 'EACH' ? (l as EachLine).quantity : 1,
          length_m:
            l.mode === 'METER'
              ? Number((l as MeterLine).lengthMeters.toFixed(3))
              : null,
          roll:
            l.mode === 'METER' && (l as MeterLine).rollId
              ? ({ id: (l as MeterLine).rollId } as any)
              : null,
          mode: l.mode,
          price_each: Number(l.priceEach.toFixed(2)),
        } as DeepPartial<TransactionItem>);
        await tiRepo.save(tiEntity);
      }

      // === NEW: capture optional payment for this sale ===
      const paidParam = this.num2(
        Number(
          (data as any).paid ??
            (data as any).paidAmount ??
            (data as any).amountPaid ??
            0,
        ),
      );
      if (paidParam > 0) {
        const payEntity = manager.getRepository(Payment).create({
          kind: 'sale',
          amount: paidParam,
          transaction: { id: savedTx.id } as any,
          note: (data as any).paymentNote ?? null,
        } as DeepPartial<Payment>);
        await manager.getRepository(Payment).save(payEntity);
      }

      // Compute paid/status via relation (no FK column hardcoding)
      const paidRow = await manager
        .getRepository(Payment)
        .createQueryBuilder('p')
        .select('COALESCE(SUM(p.amount), 0)', 'sum')
        .leftJoin('p.transaction', 't')
        .where('p.kind = :kind', { kind: 'sale' })
        .andWhere('t.id = :id', { id: savedTx.id })
        .getRawOne<{ sum?: string }>();

      const paid = this.num2(Number(paidRow?.sum ?? 0));
      const status: 'paid' | 'partial' | 'unpaid' =
        paid >= this.num2(total) ? 'paid' : paid > 0 ? 'partial' : 'unpaid';

      const fullTx = await manager.getRepository(Transaction).findOne({
        where: { id: savedTx.id },
        relations: [
          'user',
          'customer',
          'transactionItems',
          'transactionItems.item',
          'transactionItems.roll',
        ],
      });
      if (!fullTx)
        throw new NotFoundException('Transaction not found after save');

      return { ...fullTx, paid, status };
    });
  }

  async getReceipt(id: number): Promise<any> {
    const tx = await this.repo.findOne({
      where: { id },
      relations: [
        'user',
        'customer',
        'transactionItems',
        'transactionItems.item',
        'transactionItems.roll',
      ],
    });
    if (!tx) throw new NotFoundException('Transaction not found');

    const paidRow = await this.paymentRepo
      .createQueryBuilder('p')
      .select('COALESCE(SUM(p.amount), 0)', 'sum')
      .leftJoin('p.transaction', 't')
      .where('p.kind = :kind', { kind: 'sale' })
      .andWhere('t.id = :id', { id })
      .getRawOne<{ sum?: string }>();

    const paid = this.num2(Number(paidRow?.sum ?? 0));
    const status: 'paid' | 'partial' | 'unpaid' =
      paid >= this.num2(tx.total) ? 'paid' : paid > 0 ? 'partial' : 'unpaid';

    return { ...tx, paid, status };
  }

  async findAllWithPeople(): Promise<Partial<Transaction>[]> {
    return this.repo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.user', 'user')
      .leftJoinAndSelect('t.customer', 'customer')
      .select([
        't.id',
        't.date',
        't.total',
        't.receipt_type',
        'user.id',
        'user.name',
        'user.username',
        'customer.id',
        'customer.name',
      ])
      .orderBy('t.date', 'DESC')
      .addOrderBy('t.id', 'DESC')
      .getMany();
  }

  async listRecent(limit = 200): Promise<Partial<Transaction>[]> {
    return this.repo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.user', 'user')
      .leftJoinAndSelect('t.customer', 'customer')
      .select([
        't.id',
        't.date',
        't.total',
        't.receipt_type',
        'user.id',
        'user.name',
        'user.username',
        'customer.id',
        'customer.name',
      ])
      .orderBy('t.date', 'DESC')
      .addOrderBy('t.id', 'DESC')
      .limit(Math.max(1, Math.min(1000, limit)))
      .getMany();
  }
}
