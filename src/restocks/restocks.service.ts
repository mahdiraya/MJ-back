import {
  Injectable,
  BadRequestException,
  Scope,
  Inject,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  In,
  Repository,
  DeepPartial,
  EntityManager,
} from 'typeorm';
import { REQUEST } from '@nestjs/core';
import { Request } from 'express';

import { Restock, ReceiptStatus } from '../entities/restock.entity';
import { RestockItem } from '../entities/restock-item.entity';
import { Item } from '../entities/item.entity';
import { Roll } from '../entities/roll.entity';
import { Cashbox } from '../entities/cashbox.entity';
import { InventoryUnit } from '../entities/inventory-unit.entity';
import {
  CreateRestockDto,
  RestockLineDto,
  NewItemDto,
} from './create-restock.dto';
import { Payment } from '../entities/payment.entity';
import { CashboxEntry } from '../entities/cashbox-entry.entity';
import { Supplier } from '../entities/supplier.entity';
import {
  extractManualStatus,
  resolveCashboxFromDto,
  computeReceiptStatus,
  ManualStatusState,
} from '../payments/payment.helpers';
import { RestockMovementsQueryDto } from './dto/restock-movements.query.dto';
import { generatePlaceholderBarcode } from '../inventory/inventory.utils';

const RECEIPT_STATUSES = ['PAID', 'PARTIAL', 'UNPAID'] as const;

type PendingRestockItem = {
  payload: Partial<RestockItem>;
  unitCount: number;
  rollId?: number | null;
  serials?: string[];
  autoSerial?: boolean;
};

@Injectable({ scope: Scope.REQUEST })
export class RestocksService {
  constructor(
    @InjectRepository(Restock) private restockRepo: Repository<Restock>,
    @InjectRepository(RestockItem)
    private restockItemRepo: Repository<RestockItem>,
    @InjectRepository(Item) private itemRepo: Repository<Item>,
    @InjectRepository(Roll) private rollRepo: Repository<Roll>,
    @InjectRepository(Payment) private paymentRepo: Repository<Payment>,
    private dataSource: DataSource,
    @Inject(REQUEST) private readonly req: Request,
  ) {}

  private resolveUserId(): number | null {
    const u: any = (this.req as any)?.user || {};
    const cand = u.id ?? u.userId ?? u.sub ?? u.uid;
    const n = Number(cand);
    return !cand || Number.isNaN(n) || n <= 0 ? null : n;
  }

  private num2(n: any): number {
    const v = Number(n ?? 0);
    return +v.toFixed(2);
  }
  private num3(n: any): number {
    const v = Number(n ?? 0);
    return +v.toFixed(3);
  }

  private async createNewItemOnTheFly(dto: NewItemDto): Promise<Item> {
    const payload: Partial<Item> = {
      name: dto.name,
      sku: dto.sku ?? null,
      category: (dto.category as any) ?? null,
      stockUnit: (dto.stockUnit as any) ?? null,
      rollLength:
        dto.stockUnit === 'm' && dto.rollLength != null
          ? this.num2(dto.rollLength)
          : null,
      priceRetail: dto.priceRetail != null ? this.num2(dto.priceRetail) : null,
      priceWholesale:
        dto.priceWholesale != null ? this.num2(dto.priceWholesale) : null,
      description: dto.description ?? null,
      price:
        dto.priceRetail != null
          ? this.num2(dto.priceRetail)
          : dto.priceWholesale != null
            ? this.num2(dto.priceWholesale)
            : 0,
      stock: 0,
    };
    if (payload.stockUnit !== 'm') payload.stockUnit = null;
    const entity = this.itemRepo.create(payload as Item);
    return await this.itemRepo.save(entity);
  }

  async createRestock(dto: CreateRestockDto) {
    if (!dto?.items?.length) {
      throw new BadRequestException('No items to restock.');
    }

    // Resolve lines & create new items if needed
    const concreteLines: (RestockLineDto & { itemId: number })[] = [];
    for (const raw of dto.items) {
      if (!raw.itemId && !raw.newItem) {
        throw new BadRequestException('Each line needs itemId or newItem.');
      }
      if (raw.itemId && raw.newItem) {
        throw new BadRequestException(
          'Provide either itemId or newItem, not both.',
        );
      }
      if (raw.newItem) {
        const newIt = await this.createNewItemOnTheFly(raw.newItem);
        concreteLines.push({ ...raw, itemId: newIt.id });
      } else {
        concreteLines.push({ ...raw, itemId: Number(raw.itemId) });
      }
    }

    return this.dataSource.transaction(async (manager) => {
      const ids = [...new Set(concreteLines.map((l) => l.itemId))];
      const items = await manager.getRepository(Item).findBy({ id: In(ids) });
      const itemMap = new Map(items.map((it) => [it.id, it]));

      const restockItemsToCreate: PendingRestockItem[] = [];
      const providedSerials: string[] = [];
      let subtotal = 0;

      for (const l of concreteLines) {
        const it = itemMap.get(l.itemId);
        if (!it) throw new BadRequestException(`Item ${l.itemId} not found.`);
        const unitCost = this.num2(l.unitCost ?? 0);

        if (l.mode === 'EACH') {
          if (it.stockUnit === 'm') {
            throw new BadRequestException(
              `Item "${it.name}" is metered; use METER mode.`,
            );
          }
          const qty = Math.max(1, Math.floor(Number(l.quantity || 0)));
          await manager
            .getRepository(Item)
            .increment({ id: it.id }, 'stock', qty);
          it.stock = this.num3((it.stock ?? 0) + qty);

          const rawSerials = Array.isArray((l as any).serials)
            ? (l as any).serials
            : [];
          const cleanedSerials = rawSerials
            .map((serial) => `${serial ?? ''}`.trim())
            .filter(Boolean);
          const autoSerial = !!(l as any).autoSerial;

          if (!autoSerial && cleanedSerials.length !== qty) {
            throw new BadRequestException(
              `Provide exactly ${qty} serial numbers for "${it.name}" or enable auto generation.`,
            );
          }
          if (autoSerial && cleanedSerials.length) {
            throw new BadRequestException(
              `Cannot supply serial numbers and enable auto generation for "${it.name}".`,
            );
          }
          const uniqueSerials = new Set(cleanedSerials);
          if (uniqueSerials.size !== cleanedSerials.length) {
            throw new BadRequestException(
              `Duplicate serial numbers detected for "${it.name}".`,
            );
          }
          cleanedSerials.forEach((serial) => providedSerials.push(serial));

          restockItemsToCreate.push({
            payload: {
              restock: undefined as any,
              item: { id: it.id } as any,
              mode: 'EACH',
              quantity: qty,
              length_m: null,
              price_each: unitCost,
            },
            unitCount: qty,
            serials: cleanedSerials.length ? cleanedSerials : undefined,
            autoSerial,
          });
          subtotal += this.num2(unitCost * qty);
        } else {
          if (it.stockUnit !== 'm') {
            throw new BadRequestException(
              `Item "${it.name}" is unit-based; use EACH mode.`,
            );
          }
          const rolls = Array.isArray(l.newRolls) ? l.newRolls : [];
          if (!rolls.length) {
            throw new BadRequestException(
              `newRolls must contain at least one positive number for "${it.name}".`,
            );
          }
          for (const rawLen of rolls) {
            const len = this.num3(rawLen);
            if (!(len > 0)) continue;

            const roll = manager.getRepository(Roll).create({
              item: { id: it.id } as any,
              length_m: len,
              remaining_m: len,
              cost_per_meter: unitCost,
            });
            const savedRoll = await manager.getRepository(Roll).save(roll);

            await manager
              .getRepository(Item)
              .increment({ id: it.id }, 'stock', len);
            it.stock = this.num3((it.stock ?? 0) + len);

            restockItemsToCreate.push({
              payload: {
                restock: undefined as any,
                item: { id: it.id } as any,
                mode: 'METER',
                quantity: 1,
                length_m: len,
                price_each: unitCost,
              },
              unitCount: 1,
              rollId: savedRoll.id,
            });
            subtotal += this.num2(unitCost * len);
          }
        }
      }

      if (providedSerials.length) {
        const serialSet = new Set(providedSerials);
        if (serialSet.size !== providedSerials.length) {
          throw new BadRequestException('Duplicate serial numbers provided.');
        }
        const existing = await manager
          .getRepository(InventoryUnit)
          .count({ where: { barcode: In(Array.from(serialSet)) } });
        if (existing > 0) {
          throw new BadRequestException(
            'One or more serial numbers already exist in inventory.',
          );
        }
      }

      const tax = this.num2(dto.tax ?? 0);
      const total = this.num2(subtotal + tax);
      const manual = extractManualStatus<ReceiptStatus>(
        dto as Record<string, any>,
        RECEIPT_STATUSES,
      );
      const manualSetAt = manual.enabled ? new Date() : null;
      const paidParam = this.num2(
        Number(
          dto.paid ??
            (dto as any).paidAmount ??
            (dto as any).amountPaid ??
            0,
        ),
      );
      const initialStatus = computeReceiptStatus<ReceiptStatus>(
        paidParam,
        total,
        manual,
        (n) => this.num2(n),
        RECEIPT_STATUSES,
      );

      const supplierRepo = manager.getRepository(Supplier);
      const trimmedSupplierName = (dto as any).supplierName
        ? String((dto as any).supplierName).trim()
        : '';
      let supplierEntity: Supplier | null = null;

      if (dto.supplier != null) {
        supplierEntity = await supplierRepo.findOne({
          where: { id: Number(dto.supplier) },
        });
        if (!supplierEntity) {
          throw new BadRequestException('Supplier not found.');
        }
      }

      if (!supplierEntity) {
        if (!trimmedSupplierName) {
          throw new BadRequestException('Supplier name is required.');
        }
        supplierEntity = await supplierRepo
          .createQueryBuilder('s')
          .where('LOWER(s.name) = :name', {
            name: trimmedSupplierName.toLowerCase(),
          })
          .getOne();
        if (!supplierEntity) {
          supplierEntity = supplierRepo.create({
            name: trimmedSupplierName,
          } as DeepPartial<Supplier>);
          supplierEntity = await supplierRepo.save(supplierEntity);
        }
      }

      const supplierInfo = supplierEntity
        ? { id: supplierEntity.id, name: supplierEntity.name }
        : { id: null, name: null };

      const restock = manager.getRepository(Restock).create({
        date: dto.date ? new Date(dto.date) : new Date(),
        supplierId: supplierInfo.id ?? null,
        note: dto.note ?? null,
        subtotal,
        tax,
        total,
        status: initialStatus,
        statusManualEnabled: manual.enabled,
        statusManualValue: manual.value ?? null,
        statusManualNote: manual.note,
        statusManualSetAt: manualSetAt,
        user: this.resolveUserId()
          ? ({ id: this.resolveUserId()! } as any)
          : null,
      });
      const saved = await manager.getRepository(Restock).save(restock);

      const savedRestockItems: Array<{
        restockItem: RestockItem;
        unitCount: number;
        rollId?: number | null;
        serials?: string[];
      }> = [];

      for (const entry of restockItemsToCreate) {
        const ri = manager.getRepository(RestockItem).create({
          ...entry.payload,
          restock: { id: saved.id } as any,
        });
        const stored = await manager.getRepository(RestockItem).save(ri);
        savedRestockItems.push({
          restockItem: stored,
          unitCount: entry.unitCount,
          rollId: entry.rollId ?? null,
           serials: entry.serials,
        });
      }

      await this.createInventoryUnits(manager, savedRestockItems);

      // === NEW: capture optional payment for this purchase ===
      let paymentCashbox: Cashbox | null = null;
      if (paidParam > 0) {
        paymentCashbox = await resolveCashboxFromDto(
          manager,
          dto as Record<string, any>,
        );
        if (!paymentCashbox) {
          throw new BadRequestException(
            'Providing a payment requires a valid cashbox.',
          );
        }
        const payEntity = manager.getRepository(Payment).create({
          kind: 'restock',
          amount: paidParam,
          restock: { id: saved.id } as any,
          note: (dto as any).paymentNote ?? null,
          cashbox: { id: paymentCashbox.id } as any,
        } as DeepPartial<Payment>);
        const savedPayment = await manager
          .getRepository(Payment)
          .save(payEntity);

        const entryRepo = manager.getRepository(CashboxEntry);
        const entry = entryRepo.create({
          cashbox: { id: paymentCashbox.id } as any,
          kind: 'payment',
          direction: 'out',
          amount: paidParam,
          payment: { id: savedPayment.id } as any,
          referenceType: 'restock',
          referenceId: saved.id,
          occurredAt: dto.paymentDate ? new Date(dto.paymentDate) : new Date(),
          note:
            (dto as any).cashboxNote ??
            (dto as any).paymentNote ??
            null,
        });
        await entryRepo.save(entry);
      }

      // Compute paid/status for the restock
      const paidRow = await manager
        .getRepository(Payment)
        .createQueryBuilder('p')
        .select('COALESCE(SUM(p.amount), 0)', 'sum')
        .leftJoin('p.restock', 'r')
        .where('p.kind = :kind', { kind: 'restock' })
        .andWhere('r.id = :id', { id: saved.id })
        .getRawOne<{ sum?: string }>();

      const paid = this.num2(Number(paidRow?.sum ?? 0));

      const full = await manager.getRepository(Restock).findOne({
        where: { id: saved.id },
        relations: ['user', 'restockItems', 'restockItems.item'],
      });
      if (!full) throw new NotFoundException('Restock not found after save');

      const manualState: ManualStatusState<ReceiptStatus> = {
        enabled: !!full.statusManualEnabled,
        value: full.statusManualValue,
        note: full.statusManualNote ?? null,
      };
      const effectiveStatus = computeReceiptStatus<ReceiptStatus>(
        paid,
        full.total ?? total,
        manualState,
        (n) => this.num2(n),
        RECEIPT_STATUSES,
      );

      if (full.status !== effectiveStatus) {
        await manager
          .getRepository(Restock)
          .update(full.id, { status: effectiveStatus });
        full.status = effectiveStatus;
      }

      const statusLabel = effectiveStatus.toLowerCase() as
        | 'paid'
        | 'partial'
        | 'unpaid';

      return {
        ...full,
        paid,
        status: statusLabel,
        statusCode: effectiveStatus,
        statusManualEnabled: full.statusManualEnabled,
        statusManualValue: full.statusManualValue,
        statusManualNote: full.statusManualNote,
        statusManualSetAt: full.statusManualSetAt,
        supplierName: supplierInfo.name ?? null,
      };
    });
  }

  private async createInventoryUnits(
    manager: EntityManager,
    entries: Array<{
      restockItem: RestockItem;
      unitCount: number;
      rollId?: number | null;
      serials?: string[];
    }>,
  ) {
    if (!entries.length) return;
    const unitRepo = manager.getRepository(InventoryUnit);
    const unitsToSave: InventoryUnit[] = [];

    for (const entry of entries) {
      const { restockItem, unitCount, rollId, serials } = entry;
      const itemId = restockItem.item?.id;
      if (!itemId) continue;

      const totalUnits =
        restockItem.mode === 'EACH'
          ? Math.max(1, unitCount || restockItem.quantity || 0)
          : Math.max(1, unitCount || 1);
      const costEach = this.num2(restockItem.price_each ?? 0);
      const serialQueue = serials ? [...serials] : [];

      for (let i = 0; i < totalUnits; i += 1) {
        const serial = serialQueue.shift() ?? null;
        unitsToSave.push(
          unitRepo.create({
            item: { id: itemId } as any,
            restockItem: { id: restockItem.id } as any,
            roll: rollId ? ({ id: rollId } as any) : null,
            barcode: serial ?? generatePlaceholderBarcode(),
            isPlaceholder: !serial,
            status: 'available',
            costEach,
          }),
        );
      }
    }

    if (unitsToSave.length) {
      await unitRepo.save(unitsToSave);
    }
  }

  async listMovements(
    filters: RestockMovementsQueryDto,
  ): Promise<
    Array<{
      id: number;
      date: string | null;
      supplierId: number | null;
      supplierName: string | null;
      total: number;
      tax: number | null;
      paid: number;
      outstanding: number;
      status: ReceiptStatus;
      cashboxes: string[];
      user: { id: number; name?: string | null; username?: string | null } | null;
    }>
  > {
    const qb = this.restockRepo
      .createQueryBuilder('r')
      .leftJoin(Supplier, 's', 's.id = r.supplierId')
      .leftJoin('r.user', 'user')
      .leftJoin('r.payments', 'pay')
      .leftJoin('pay.cashbox', 'cashbox')
      .select('r.id', 'id')
      .addSelect('COALESCE(r.date, r.created_at)', 'date')
      .addSelect('r.supplierId', 'supplierId')
      .addSelect('s.name', 'supplierName')
      .addSelect('r.total', 'total')
      .addSelect('r.tax', 'tax')
      .addSelect('r.status', 'status')
      .addSelect('user.id', 'userId')
      .addSelect('user.name', 'userName')
      .addSelect('user.username', 'userUsername')
      .addSelect('COALESCE(SUM(pay.amount), 0)', 'paid')
      .addSelect(
        "GROUP_CONCAT(DISTINCT cashbox.code SEPARATOR ',')",
        'cashboxes',
      )
      .groupBy('r.id')
      .addGroupBy('date')
      .addGroupBy('r.supplierId')
      .addGroupBy('supplierName')
      .addGroupBy('r.total')
      .addGroupBy('r.tax')
      .addGroupBy('r.status')
      .addGroupBy('user.id')
      .addGroupBy('user.name')
      .addGroupBy('user.username')
      .orderBy('date', 'DESC')
      .addOrderBy('r.id', 'DESC');

    if (filters.supplierId != null) {
      qb.andWhere('r.supplierId = :supplierId', {
        supplierId: Number(filters.supplierId),
      });
    }

    if (filters.status) {
      qb.andWhere('r.status = :status', { status: filters.status });
    }

    if (filters.cashboxCode) {
      qb.andWhere('cashbox.code = :cashboxCode', {
        cashboxCode: filters.cashboxCode.toUpperCase(),
      });
    }

    if (filters.startDate) {
      qb.andWhere('COALESCE(r.date, r.created_at) >= :startDate', {
        startDate: filters.startDate,
      });
    }

    if (filters.endDate) {
      qb.andWhere('COALESCE(r.date, r.created_at) <= :endDate', {
        endDate: filters.endDate,
      });
    }

    if (filters.search) {
      const term = filters.search.trim();
      const idNumber = Number(term);
      const params: any = { term: `%${term}%` };
      if (!Number.isNaN(idNumber)) {
        params.idExact = idNumber;
        qb.andWhere(
          '(r.id = :idExact OR s.name LIKE :term OR r.note LIKE :term)',
          params,
        );
      } else {
        qb.andWhere('(s.name LIKE :term OR r.note LIKE :term)', params);
      }
    }

    const rows = await qb.getRawMany<{
      id: number;
      date: Date | string | null;
      supplierId: number | null;
      supplierName: string | null;
      total: string;
      tax: string | null;
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
        supplierId:
          row.supplierId != null ? Number(row.supplierId) : null,
        supplierName: row.supplierName ?? null,
        total: +total.toFixed(2),
        tax: row.tax != null ? +Number(row.tax).toFixed(2) : null,
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

  async getReceipt(id: number) {
    const r = await this.restockRepo.findOne({
      where: { id },
      relations: ['user', 'restockItems', 'restockItems.item'],
    });
    if (!r) throw new NotFoundException('Restock not found');

    const items = (r.restockItems || []).map((ri) => {
      const qty = ri.mode === 'EACH' ? ri.quantity || 0 : 1;
      const meters = ri.mode === 'METER' ? ri.length_m || 0 : null;
      const price = Number((ri.price_each || 0).toFixed(2));
      const line_total =
        ri.mode === 'EACH'
          ? Number((qty * price).toFixed(2))
          : Number(((meters || 0) * price).toFixed(2));
      return {
        id: ri.id,
        mode: ri.mode,
        item: {
          id: ri.item.id,
          name: ri.item.name,
          sku: ri.item.sku,
          stockUnit: ri.item.stockUnit,
        },
        quantity: ri.mode === 'EACH' ? qty : null,
        length_m: meters,
        price_each: price,
        line_total,
      };
    });

    const subtotal = r.subtotal ?? items.reduce((s, x) => s + x.line_total, 0);
    const tax = r.tax ?? 0;
    const total = r.total ?? Number((subtotal + tax).toFixed(2));

    // sum payments
    const paidRow = await this.paymentRepo
      .createQueryBuilder('p')
      .select('COALESCE(SUM(p.amount), 0)', 'sum')
      .leftJoin('p.restock', 'r')
      .where('p.kind = :kind', { kind: 'restock' })
      .andWhere('r.id = :id', { id })
      .getRawOne<{ sum?: string }>();
    const paid = this.num2(Number(paidRow?.sum ?? 0));
    const manualState: ManualStatusState<ReceiptStatus> = {
      enabled: !!r.statusManualEnabled,
      value: r.statusManualValue,
      note: r.statusManualNote ?? null,
    };
    const statusCode = computeReceiptStatus<ReceiptStatus>(
      paid,
      total,
      manualState,
      (n) => this.num2(n),
      RECEIPT_STATUSES,
    );
    const status = statusCode.toLowerCase() as 'paid' | 'partial' | 'unpaid';

    return {
      id: r.id,
      date: r.date ?? r.created_at,
      created_at: r.created_at,
      supplierId: r.supplierId,
      note: r.note,
      subtotal,
      tax,
      total,
      paid,
      status,
      statusCode,
      statusManualEnabled: r.statusManualEnabled,
      statusManualValue: r.statusManualValue,
      statusManualNote: r.statusManualNote,
      statusManualSetAt: r.statusManualSetAt,
      user: r.user
        ? {
            id: r.user.id,
            name: (r.user as any).name || (r.user as any).username,
          }
        : null,
      items,
    };
  }
}
