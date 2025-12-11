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
  EntityManager,
} from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { BaseService } from '../base/base.service';
import { Transaction, ReceiptStatus } from '../entities/transaction.entity';
import { Item } from '../entities/item.entity';
import { TransactionItem } from '../entities/transaction-item.entity';
import { Customer } from '../entities/customer.entity';
import { CreateTransactionDto } from './create-transaction.dto';
import { UpdateTransactionDto } from './update-transaction.dto';
import { REQUEST } from '@nestjs/core';
import { Request } from 'express';
import { Roll } from '../entities/roll.entity';
import { Payment } from '../entities/payment.entity';
import { Cashbox } from '../entities/cashbox.entity';
import { CashboxEntry } from '../entities/cashbox-entry.entity';
import { InventoryUnit } from '../entities/inventory-unit.entity';
import { InventoryReturn } from '../entities/inventory-return.entity';
import { TransactionItemUnit } from '../entities/transaction-item-unit.entity';
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
  inventoryUnitIds?: number[];
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

type PricedLine = AnyLine & { priceEach: number };

type SalePlan = {
  userId: number;
  customer: Customer | null;
  lines: PricedLine[];
  lineUnitSelections: (InventoryUnit[] | null)[];
  meterRollSelections: (Roll | null)[];
  itemMap: Map<number, Item>;
  totalRounded: number;
  manual: ManualStatusState<ReceiptStatus>;
  manualSetAt: Date | null;
  paidParam: number;
  initialStatus: ReceiptStatus;
  receiptType: 'simple' | 'detailed';
  note?: string | null;
};

export type RecordSalePaymentDto = {
  amount: number;
  cashboxId?: number;
  cashboxCode?: string;
  paymentDate?: string;
  paymentNote?: string;
  payMethod?: string;
};

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

  private normalizeLines(
    dto: CreateTransactionDto,
  ): { lines: AnyLine[]; meterRollSelections: (Roll | null)[] } {
    const lines: AnyLine[] = (dto.items || []).map((raw: any) => {
      const mode = (raw.mode as 'EACH' | 'METER') || 'EACH';
      const base = {
        itemId: Number(raw.itemId ?? raw.item),
        priceTier: raw.priceTier as PriceTier | undefined,
        unitPrice: raw.unitPrice != null ? Number(raw.unitPrice) : undefined,
        inventoryUnitIds: Array.isArray(raw.inventoryUnitIds)
          ? raw.inventoryUnitIds
              .map((id: any) => Number(id))
              .filter((id: number) => Number.isFinite(id) && id > 0)
          : undefined,
      };
      if (mode === 'EACH') {
        return { ...base, mode, quantity: Number(raw.quantity ?? 0) };
      }
      return {
        ...base,
        mode,
        lengthMeters: Number(raw.lengthMeters ?? 0),
        rollId: raw.rollId != null ? Number(raw.rollId) : undefined,
      };
    });
    return { lines, meterRollSelections: lines.map(() => null) };
  }

  private async buildSalePlan(
    manager: EntityManager,
    data: CreateTransactionDto,
    options: { lockedUnitIds?: Set<number> } = {},
  ): Promise<SalePlan> {
    if (!data.items || !Array.isArray(data.items) || data.items.length === 0) {
      throw new BadRequestException('No items provided for transaction.');
    }

    const userId = this.resolveUserId(data);
    const customerEntity = await this.resolveCustomer(
      manager.getRepository(Customer),
      data,
    );

    const { lines, meterRollSelections } = this.normalizeLines(data);
    const ids = lines.map((l) => l.itemId);
    const itemsInDb = await manager
      .getRepository(Item)
      .findBy({ id: In(ids) });
    const itemMap = new Map<number, Item>(itemsInDb.map((it) => [it.id, it]));

    for (const [index, l] of lines.entries()) {
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

        let roll: Roll | null = null;
        if (l.rollId) {
          roll = await manager.getRepository(Roll).findOne({
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
          roll = await manager.getRepository(Roll).findOne({
            where: { item: { id: it.id } },
            order: { created_at: 'ASC' },
          });
          if (!roll) {
            throw new BadRequestException(
              `No rolls available for "${it.name}". Scan a roll before selling.`,
            );
          }
          if (Number(roll.remaining_m) < l.lengthMeters) {
            throw new BadRequestException(
              `Roll ${roll.id} for "${it.name}" has only ${roll.remaining_m}m left.`,
            );
          }
        }
        meterRollSelections[index] = roll!;
      }
    }

    const lineUnitSelections: (InventoryUnit[] | null)[] = lines.map(
      () => null,
    );
    const inventoryRepo = manager.getRepository(InventoryUnit);
    const usedUnitIds = new Set<number>();
    for (const [index, l] of lines.entries()) {
      if (l.mode !== 'EACH') {
        continue;
      }
      const it = itemMap.get(l.itemId)!;
      if (it.stockUnit === 'm') {
        lineUnitSelections[index] = null;
        continue;
      }
      if (l.inventoryUnitIds?.length) {
        const unique = Array.from(new Set(l.inventoryUnitIds));
        const units = await inventoryRepo.find({
          where: { id: In(unique) },
          relations: ['item'],
        });
        if (units.length !== unique.length) {
          throw new BadRequestException('Some inventory units were not found.');
        }
        const ordered = unique.map((id) => {
          const unit = units.find((u) => u.id === id);
          if (!unit) {
            throw new BadRequestException(`Inventory unit ${id} missing.`);
          }
          if (!unit.item || unit.item.id !== l.itemId) {
            throw new BadRequestException(
              `Inventory unit ${id} does not belong to this item.`,
            );
          }
          const isLocked =
            options.lockedUnitIds?.has(unit.id) ?? false;
          if (!isLocked && unit.status !== 'available') {
            throw new BadRequestException(
              `Inventory unit ${id} is not available for sale.`,
            );
          }
          return unit;
        });
        ordered.forEach((unit) => usedUnitIds.add(unit.id));
        lineUnitSelections[index] = ordered;
        continue;
      }

      const needed = (l as EachLine).quantity;
      const qb = inventoryRepo
        .createQueryBuilder('unit')
        .where('unit.item_id = :itemId', { itemId: l.itemId })
        .andWhere('unit.status = :status', { status: 'available' });
      if (usedUnitIds.size) {
        qb.andWhere('unit.id NOT IN (:...used)', {
          used: Array.from(usedUnitIds),
        });
      }
      const units = await qb
        .orderBy('unit.created_at', 'ASC')
        .addOrderBy('unit.id', 'ASC')
        .limit(needed)
        .getMany();
      if (units.length < needed) {
        throw new BadRequestException(
          `Not enough tracked units for "${it.name}". Restock or scan inventory before selling.`,
        );
      }
      units.forEach((unit) => usedUnitIds.add(unit.id));
      lineUnitSelections[index] = units;
    }

    const pricedLines: PricedLine[] = lines.map((l) => {
      const it = itemMap.get(l.itemId)!;
      const priceEach = this.pickUnitPrice(
        it,
        (l as EachLine).priceTier,
        l.unitPrice,
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

    return {
      userId,
      customer: customerEntity,
      lines: pricedLines,
      lineUnitSelections,
      meterRollSelections,
      itemMap,
      totalRounded,
      manual,
      manualSetAt,
      paidParam,
      initialStatus,
      receiptType: (data as any).receipt_type || 'simple',
      note: (data as any).note ?? null,
    };
  }

  private async applySalePlan(
    manager: EntityManager,
    plan: SalePlan,
    transactionId: number,
    data: CreateTransactionDto,
  ) {
    const lineContexts = plan.lines.map((line, index) => ({
      line,
      units: plan.lineUnitSelections[index] ?? undefined,
      roll: plan.meterRollSelections[index] ?? undefined,
    }));

    for (const ctx of lineContexts) {
      const it = plan.itemMap.get(ctx.line.itemId)!;
      if (ctx.line.mode === 'EACH') {
        await manager
          .getRepository(Item)
          .decrement({ id: it.id }, 'stock', (ctx.line as EachLine).quantity);
        it.stock = Number(
          (Number(it.stock) - (ctx.line as EachLine).quantity).toFixed(3),
        );
      } else {
        const roll = ctx.roll;
        if (!roll) {
          throw new BadRequestException(
            `Missing roll selection for meter sale on "${it.name}".`,
          );
        }
        await manager
          .getRepository(Roll)
          .decrement(
            { id: roll.id },
            'remaining_m',
            (ctx.line as MeterLine).lengthMeters,
          );
        await manager
          .getRepository(Item)
          .decrement(
            { id: it.id },
            'stock',
            (ctx.line as MeterLine).lengthMeters,
          );
        it.stock = Number(
          (
            Number(it.stock) - (ctx.line as MeterLine).lengthMeters
          ).toFixed(3),
        );
      }
    }

    const tiRepo = manager.getRepository(TransactionItem);
    for (const ctx of lineContexts) {
      let costEachValue: number | null = null;
      if (ctx.line.mode === 'EACH' && ctx.units?.length) {
        const qty = (ctx.line as EachLine).quantity;
        const costSum = ctx.units.reduce(
          (sum, unit) => sum + Number(unit.costEach ?? 0),
          0,
        );
        costEachValue = qty > 0 ? this.num2(costSum / qty) : 0;
      } else if (ctx.line.mode === 'METER' && ctx.roll) {
        costEachValue = this.num2(Number(ctx.roll.cost_per_meter ?? 0));
      }

      const tiEntity = tiRepo.create({
        transaction: { id: transactionId } as any,
        item: { id: ctx.line.itemId } as any,
        quantity:
          ctx.line.mode === 'EACH' ? (ctx.line as EachLine).quantity : 1,
        length_m:
          ctx.line.mode === 'METER'
            ? Number((ctx.line as MeterLine).lengthMeters.toFixed(3))
            : null,
        roll:
          ctx.line.mode === 'METER' && (ctx.line as MeterLine).rollId
            ? ({ id: (ctx.line as MeterLine).rollId } as any)
            : null,
        mode: ctx.line.mode,
        price_each: Number(ctx.line.priceEach.toFixed(2)),
        cost_each: costEachValue,
      } as DeepPartial<TransactionItem>);
      const savedLine = await tiRepo.save(tiEntity);

      if (ctx.units?.length) {
        await this.linkUnitsToTransactionLine(manager, savedLine, ctx.units);
      }
    }

    if (plan.paidParam > 0) {
      const paymentCashbox = await resolveCashboxFromDto(
        manager,
        data as Record<string, any>,
      );
      if (!paymentCashbox) {
        throw new BadRequestException(
          'Providing a payment requires a valid cashbox.',
        );
      }
      const paymentRepo = manager.getRepository(Payment);
      const payEntity = paymentRepo.create({
        kind: 'sale',
        amount: plan.paidParam,
        transaction: { id: transactionId } as any,
        note: (data as any).paymentNote ?? null,
        cashbox: { id: paymentCashbox.id } as any,
      } as DeepPartial<Payment>);
      const savedPayment = await paymentRepo.save(payEntity);

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
        amount: plan.paidParam,
        payment: { id: savedPayment.id } as any,
        referenceType: 'sale',
        referenceId: transactionId,
        occurredAt: data.paymentDate ? new Date(data.paymentDate) : new Date(),
        note:
          (data as any).cashboxNote ??
          (data as any).paymentNote ??
          null,
        meta,
      });
      await entryRepo.save(entry);
    }
  }

  private async restoreInventoryFromTransaction(
    manager: EntityManager,
    tx: Transaction,
  ) {
    if (!tx.transactionItems?.length) return;

    const itemRepo = manager.getRepository(Item);
    const rollRepo = manager.getRepository(Roll);
    const unitRepo = manager.getRepository(InventoryUnit);

    for (const line of tx.transactionItems) {
      if (line.inventoryUnitLinks?.length) {
        const unitIds = line.inventoryUnitLinks
          .map((link) => link.inventoryUnit?.id)
          .filter((id): id is number => Number.isFinite(id));
        if (unitIds.length) {
          await unitRepo
            .createQueryBuilder()
            .update()
            .set({ status: 'available' })
            .where('id IN (:...ids)', { ids: unitIds })
            .execute();
        }
      }

      if (line.mode === 'EACH') {
        await itemRepo.increment(
          { id: line.item.id },
          'stock',
          Number(line.quantity),
        );
      } else {
        const meters = Number(line.length_m ?? 0);
        if (line.roll?.id && meters > 0) {
          await rollRepo.increment({ id: line.roll.id }, 'remaining_m', meters);
        }
        if (meters > 0) {
          await itemRepo.increment({ id: line.item.id }, 'stock', meters);
        }
      }
    }
  }

  private latestUnitReturn(unit?: InventoryUnit | null): InventoryReturn | null {
    if (!unit?.returns?.length) {
      return null;
    }
    return unit.returns.reduce<InventoryReturn | null>((latest, current) => {
      if (!latest) return current;
      const latestTime = new Date(latest.createdAt).getTime();
      const currentTime = new Date(current.createdAt).getTime();
      return currentTime > latestTime ? current : latest;
    }, null);
  }

  private async buildTransactionResponse(
    manager: EntityManager,
    id: number,
  ): Promise<any> {
      const tx = await manager.getRepository(Transaction).findOne({
      where: { id },
      relations: [
        'user',
        'customer',
        'transactionItems',
        'transactionItems.item',
        'transactionItems.roll',
        'transactionItems.inventoryUnitLinks',
        'transactionItems.inventoryUnitLinks.inventoryUnit',
        'transactionItems.inventoryUnitLinks.inventoryUnit.returns',
        'lastEditUser',
      ],
    });
    if (!tx) {
      throw new NotFoundException('Transaction not found');
    }

    const paidRow = await manager
      .getRepository(Payment)
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
    if (tx.status !== statusCode) {
      await manager
        .getRepository(Transaction)
        .update(tx.id, { status: statusCode });
      tx.status = statusCode;
    }

    const normalizedItems =
      tx.transactionItems?.map((line) => ({
        ...line,
        inventoryUnitLinks:
          line.inventoryUnitLinks?.map((link) => {
            if (!link.inventoryUnit) return link;
            const latestReturn = this.latestUnitReturn(link.inventoryUnit);
            const { returns, ...unitRest } = link.inventoryUnit as any;
            return {
              ...link,
              inventoryUnit: {
                ...unitRest,
                latestReturn: latestReturn
                  ? {
                      id: latestReturn.id,
                      status: latestReturn.status,
                      requestedOutcome: latestReturn.requestedOutcome,
                      note: latestReturn.note ?? null,
                      createdAt: latestReturn.createdAt,
                      resolvedAt: latestReturn.resolvedAt ?? null,
                    }
                  : null,
              },
            };
          }) ?? [],
      })) ?? [];

    (tx as any).transactionItems = normalizedItems;

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

  async createTransaction(
    data: CreateTransactionDto,
  ): Promise<Transaction | any> {
    return this.dataSource.transaction(async (manager) => {
      const plan = await this.buildSalePlan(manager, data);
      const txRepo = manager.getRepository(Transaction);
      const txEntity = txRepo.create({
        user: { id: plan.userId } as any,
        customer: plan.customer ? ({ id: plan.customer.id } as any) : undefined,
        total: plan.totalRounded,
        receipt_type: plan.receiptType,
        date: new Date(),
        note: plan.note ?? null,
        status: plan.initialStatus,
        statusManualEnabled: plan.manual.enabled,
        statusManualValue: plan.manual.value ?? null,
        statusManualNote: plan.manual.note,
        statusManualSetAt: plan.manualSetAt,
      } as DeepPartial<Transaction>);
      const savedTx = await txRepo.save(txEntity);
      await this.applySalePlan(manager, plan, savedTx.id, data);
      return this.buildTransactionResponse(manager, savedTx.id);
    });
  }
  async updateTransaction(
    id: number,
    data: UpdateTransactionDto,
  ): Promise<Transaction | any> {
    return this.dataSource.transaction(async (manager) => {
      const txRepo = manager.getRepository(Transaction);
      const existing = await txRepo.findOne({
        where: { id },
        relations: [
          'transactionItems',
          'transactionItems.item',
          'transactionItems.roll',
          'transactionItems.inventoryUnitLinks',
          'transactionItems.inventoryUnitLinks.inventoryUnit',
        ],
        lock: { mode: 'pessimistic_write' },
      });
      if (!existing) {
        throw new NotFoundException('Transaction not found');
      }

      const lockedUnitIds = new Set<number>();
      existing.transactionItems?.forEach((line) => {
        line.inventoryUnitLinks?.forEach((link) => {
          if (link.inventoryUnit?.id != null) {
            lockedUnitIds.add(link.inventoryUnit.id);
          }
        });
      });

      const plan = await this.buildSalePlan(manager, data as CreateTransactionDto, {
        lockedUnitIds,
      });
      const editNote = (data as any).editNote?.toString().trim();
      if (!editNote) {
        throw new BadRequestException('Editing a receipt requires an edit note.');
      }
      const editorUserId = this.resolveUserId(data);
      await this.restoreInventoryFromTransaction(manager, existing);

      await manager
        .createQueryBuilder()
        .delete()
        .from(TransactionItem)
        .where('transaction_id = :id', { id })
        .execute();

      await txRepo.update(
        id,
        {
          customer: plan.customer
            ? ({ id: plan.customer.id } as any)
            : null,
          total: plan.totalRounded,
          receipt_type: plan.receiptType,
          note: plan.note ?? null,
          status: plan.initialStatus,
          statusManualEnabled: plan.manual.enabled,
          statusManualValue: plan.manual.value ?? null,
          statusManualNote: plan.manual.note,
          statusManualSetAt: plan.manual.enabled ? new Date() : null,
          lastEditNote: editNote,
          lastEditAt: new Date(),
          lastEditUser: { id: editorUserId } as any,
        } as QueryDeepPartialEntity<Transaction>,
      );

      await this.applySalePlan(manager, plan, id, data as CreateTransactionDto);
      return this.buildTransactionResponse(manager, id);
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
      note: string | null;
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
      .addSelect('t.note', 'note')
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
      .addGroupBy('t.note')
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
      note: string | null;
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
        note: row.note ?? null,
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
    return this.buildTransactionResponse(this.repo.manager, id);
  }

  async recordPayment(
    transactionId: number,
    dto: RecordSalePaymentDto,
  ): Promise<any> {
    const amount = this.num2(dto.amount);
    if (!(amount > 0)) {
      throw new BadRequestException('Payment amount must be greater than zero.');
    }

    return this.dataSource.transaction(async (manager) => {
      const tx = await manager.getRepository(Transaction).findOne({
        where: { id: transactionId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!tx) {
        throw new NotFoundException('Transaction not found');
      }

      const cashbox = await resolveCashboxFromDto(manager, dto as any);
      if (!cashbox) {
        throw new BadRequestException(
          'Providing a payment requires a valid cashbox.',
        );
      }

      const paymentRepo = manager.getRepository(Payment);
      const payEntity = paymentRepo.create({
        kind: 'sale',
        amount,
        transaction: { id: transactionId } as any,
        note: dto.paymentNote ?? null,
        cashbox: { id: cashbox.id } as any,
      } as DeepPartial<Payment>);
      const savedPayment = await paymentRepo.save(payEntity);

      const entryRepo = manager.getRepository(CashboxEntry);
      const meta = dto.payMethod ? { method: dto.payMethod } : null;
      const entry = entryRepo.create({
        cashbox: { id: cashbox.id } as any,
        kind: 'payment',
        direction: 'in',
        amount,
        payment: { id: savedPayment.id } as any,
        referenceType: 'sale',
        referenceId: transactionId,
        occurredAt: dto.paymentDate ? new Date(dto.paymentDate) : new Date(),
        note: dto.paymentNote ?? null,
        meta,
      });
      await entryRepo.save(entry);

      const paidRow = await paymentRepo
        .createQueryBuilder('p')
        .select('COALESCE(SUM(p.amount), 0)', 'sum')
        .where('p.kind = :kind', { kind: 'sale' })
        .andWhere('p.transaction = :txId', { txId: transactionId })
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
      if (tx.status !== statusCode) {
        await manager
          .getRepository(Transaction)
          .update(tx.id, { status: statusCode });
      }

      return this.buildTransactionResponse(manager, transactionId);
    });
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

  private async resolveCustomer(
    repo: Repository<Customer>,
    data: Partial<CreateTransactionDto>,
  ): Promise<Customer | null> {
    const idCandidate = (data as any)?.customer;
    const rawPhone = ((data as any)?.customerPhone ?? '').toString().trim();
    const phoneValue = rawPhone ? rawPhone : null;
    if (idCandidate != null) {
      const id = Number(idCandidate);
      if (!Number.isFinite(id) || id <= 0) {
        throw new BadRequestException('Invalid customer id.');
      }
      const existing = await repo.findOne({ where: { id } });
      if (!existing) {
        throw new BadRequestException('Customer not found.');
      }
      if (phoneValue && existing.contact_info !== phoneValue) {
        existing.contact_info = phoneValue;
        await repo.save(existing);
      }
      return existing;
    }

    const nameRaw = ((data as any)?.customerName ?? '').toString().trim();
    if (!nameRaw) return null;

    const byName = await repo
      .createQueryBuilder('customer')
      .where('LOWER(customer.name) = :name', { name: nameRaw.toLowerCase() })
      .getOne();
    if (byName) {
      if (phoneValue && byName.contact_info !== phoneValue) {
        byName.contact_info = phoneValue;
        await repo.save(byName);
      }
      return byName;
    }

    const created = repo.create({
      name: nameRaw,
      customer_type: 'regular',
      contact_info: phoneValue,
    } as DeepPartial<Customer>);
    return repo.save(created);
  }

  private async linkUnitsToTransactionLine(
    manager: EntityManager,
    line: TransactionItem,
    units: InventoryUnit[],
  ) {
    const linkRepo = manager.getRepository(TransactionItemUnit);
    const unitRepo = manager.getRepository(InventoryUnit);
    const payloads = units.map((unit) =>
      linkRepo.create({
        transactionItem: { id: line.id } as any,
        inventoryUnit: { id: unit.id } as any,
      }),
    );
    await linkRepo.save(payloads);
    const ids = units.map((unit) => unit.id);
    if (ids.length) {
      await unitRepo
        .createQueryBuilder()
        .update()
        .set({ status: 'sold' })
        .where('id IN (:...ids)', { ids })
        .execute();
    }
  }
}
