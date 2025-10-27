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
import { Transaction, ReceiptStatus } from '../entities/transaction.entity';
import { Item } from '../entities/item.entity';
import { TransactionItem } from '../entities/transaction-item.entity';
import { CreateTransactionDto } from './create-transaction.dto';
import { REQUEST } from '@nestjs/core';
import { Request } from 'express';
import { Roll } from '../entities/roll.entity';
import { Payment } from '../entities/payment.entity';
import { Cashbox } from '../entities/cashbox.entity';
import { CashboxEntry } from '../entities/cashbox-entry.entity';
import {
  extractManualStatus,
  resolveCashboxFromDto,
  computeReceiptStatus,
  ManualStatusState,
} from '../payments/payment.helpers';
import { TransactionMovementsQueryDto } from './dto/transaction-movements.query.dto';

const TRANSACTION_STATUSES = ['PAID', 'PARTIAL', 'UNPAID'] as const;

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
      const totalRounded = this.num2(total);
      const manual = extractManualStatus<ReceiptStatus>(
        data as Record<string, any>,
        TRANSACTION_STATUSES,
      );
      const manualSetAt = manual.enabled ? new Date() : null;
      const paidParam = this.num2(
        Number(
          data.paid ??
            data.amountPaidNow ??
            (data as any).paidAmount ??
            (data as any).amountPaid ??
            0,
        ),
      );
      const initialStatus = computeReceiptStatus<ReceiptStatus>(
        paidParam,
        totalRounded,
        manual,
        (n) => this.num2(n),
        TRANSACTION_STATUSES,
      );

      // Create transaction
      const txRepo = manager.getRepository(Transaction);
      const txEntity = txRepo.create({
        user: { id: userId } as any,
        customer: (data as any).customer
          ? ({ id: (data as any).customer } as any)
          : undefined,
        total: totalRounded,
        receipt_type: (data as any).receipt_type || 'simple',
        date: new Date(),
        note: (data as any).note ?? null,
        status: initialStatus,
        statusManualEnabled: manual.enabled,
        statusManualValue: manual.value ?? null,
        statusManualNote: manual.note,
        statusManualSetAt: manualSetAt,
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
      let paymentCashbox: Cashbox | null = null;
      if (paidParam > 0) {
        paymentCashbox = await resolveCashboxFromDto(
          manager,
          data as Record<string, any>,
        );
        if (!paymentCashbox) {
          throw new BadRequestException(
            'Providing a payment requires a valid cashbox.',
          );
        }
        const payEntity = manager.getRepository(Payment).create({
          kind: 'sale',
          amount: paidParam,
          transaction: { id: savedTx.id } as any,
          note: (data as any).paymentNote ?? null,
          cashbox: { id: paymentCashbox.id } as any,
        } as DeepPartial<Payment>);
        const savedPayment = await manager
          .getRepository(Payment)
          .save(payEntity);

        const entryRepo = manager.getRepository(CashboxEntry);
        const meta =
          (data as any).payMethod ?? (data as any).paymentMethod
            ? {
                method:
                  (data as any).payMethod ?? (data as any).paymentMethod,
              }
            : null;
        const entry = entryRepo.create({
          cashbox: { id: paymentCashbox.id } as any,
          kind: 'payment',
          direction: 'in',
          amount: paidParam,
          payment: { id: savedPayment.id } as any,
          referenceType: 'sale',
          referenceId: savedTx.id,
          occurredAt: data.paymentDate ? new Date(data.paymentDate) : new Date(),
          note:
            (data as any).cashboxNote ??
            (data as any).paymentNote ??
            null,
          meta,
        });
        await entryRepo.save(entry);
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

      const manualState: ManualStatusState<ReceiptStatus> = {
        enabled: !!fullTx.statusManualEnabled,
        value: fullTx.statusManualValue,
        note: fullTx.statusManualNote ?? null,
      };
      const statusCode = computeReceiptStatus<ReceiptStatus>(
        paid,
        fullTx.total ?? totalRounded,
        manualState,
        (n) => this.num2(n),
        TRANSACTION_STATUSES,
      );
      if (fullTx.status !== statusCode) {
        await manager
          .getRepository(Transaction)
          .update(fullTx.id, { status: statusCode });
        fullTx.status = statusCode;
      }
      const status = statusCode.toLowerCase() as 'paid' | 'partial' | 'unpaid';

      return {
        ...fullTx,
        paid,
        status,
        statusCode,
        statusManualEnabled: fullTx.statusManualEnabled,
        statusManualValue: fullTx.statusManualValue,
        statusManualNote: fullTx.statusManualNote,
        statusManualSetAt: fullTx.statusManualSetAt,
      };
    });
  }

  async listMovements(
    filters: TransactionMovementsQueryDto,
  ): Promise<
    Array<{
      id: number;
      date: string | null;
      customerId: number | null;
      customerName: string | null;
      total: number;
      paid: number;
      outstanding: number;
      status: ReceiptStatus;
      cashboxes: string[];
      user: { id: number; name?: string | null; username?: string | null } | null;
    }>
  > {
    const qb = this.repo
      .createQueryBuilder('t')
      .leftJoin('t.user', 'user')
      .leftJoin('t.customer', 'customer')
      .leftJoin('t.payments', 'pay', 'pay.kind = :saleKind', {
        saleKind: 'sale',
      })
      .leftJoin('pay.cashbox', 'cashbox')
      .select('t.id', 'id')
      .addSelect('t.date', 'date')
      .addSelect('customer.id', 'customerId')
      .addSelect('customer.name', 'customerName')
      .addSelect('t.total', 'total')
      .addSelect('t.status', 'status')
      .addSelect('user.id', 'userId')
      .addSelect('user.name', 'userName')
      .addSelect('user.username', 'userUsername')
      .addSelect('COALESCE(SUM(pay.amount), 0)', 'paid')
      .addSelect(
        "GROUP_CONCAT(DISTINCT cashbox.code SEPARATOR ',')",
        'cashboxes',
      )
      .groupBy('t.id')
      .addGroupBy('t.date')
      .addGroupBy('customer.id')
      .addGroupBy('customer.name')
      .addGroupBy('t.total')
      .addGroupBy('t.status')
      .addGroupBy('user.id')
      .addGroupBy('user.name')
      .addGroupBy('user.username')
      .orderBy('t.date', 'DESC')
      .addOrderBy('t.id', 'DESC');

    if (filters.customerId != null) {
      qb.andWhere('t.customer = :customerId', {
        customerId: Number(filters.customerId),
      });
    }

    if (filters.status) {
      qb.andWhere('t.status = :status', { status: filters.status });
    }

    if (filters.cashboxCode) {
      qb.andWhere('cashbox.code = :cashboxCode', {
        cashboxCode: filters.cashboxCode.toUpperCase(),
      });
    }

    if (filters.startDate) {
      qb.andWhere('t.date >= :startDate', { startDate: filters.startDate });
    }

    if (filters.endDate) {
      qb.andWhere('t.date <= :endDate', { endDate: filters.endDate });
    }

    if (filters.search) {
      const term = filters.search.trim();
      const idNumber = Number(term);
      const params: any = { term: `%${term}%` };
      if (!Number.isNaN(idNumber)) {
        params.idExact = idNumber;
        qb.andWhere(
          '(t.id = :idExact OR customer.name LIKE :term)',
          params,
        );
      } else {
        qb.andWhere('customer.name LIKE :term', params);
      }
    }

    const rows = await qb.getRawMany<{
      id: number;
      date: Date | string;
      customerId: number | null;
      customerName: string | null;
      total: string;
      status: ReceiptStatus;
      userId: number | null;
      userName: string | null;
      userUsername: string | null;
      paid: string;
      cashboxes: string | null;
    }>();

    return rows.map((row) => {
      const total = Number(row.total || 0);
      const paid = Number(row.paid || 0);
      return {
        id: Number(row.id),
        date: row.date ? new Date(row.date).toISOString() : null,
        customerId: row.customerId != null ? Number(row.customerId) : null,
        customerName: row.customerName ?? null,
        total: +total.toFixed(2),
        paid: +paid.toFixed(2),
        outstanding: +(total - paid).toFixed(2),
        status: row.status,
        cashboxes: row.cashboxes
          ? row.cashboxes.split(',').filter(Boolean)
          : [],
        user: row.userId
          ? {
              id: Number(row.userId),
              name: row.userName,
              username: row.userUsername,
            }
          : null,
      };
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
    const manualState: ManualStatusState<ReceiptStatus> = {
      enabled: !!tx.statusManualEnabled,
      value: tx.statusManualValue,
      note: tx.statusManualNote ?? null,
    };
    const statusCode = computeReceiptStatus<ReceiptStatus>(
      paid,
      tx.total ?? 0,
      manualState,
      (n) => this.num2(n),
      TRANSACTION_STATUSES,
    );
    const status = statusCode.toLowerCase() as 'paid' | 'partial' | 'unpaid';

    return {
      ...tx,
      paid,
      status,
      statusCode,
      statusManualEnabled: tx.statusManualEnabled,
      statusManualValue: tx.statusManualValue,
      statusManualNote: tx.statusManualNote,
      statusManualSetAt: tx.statusManualSetAt,
    };
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
