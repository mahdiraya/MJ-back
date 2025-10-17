import {
  Injectable,
  BadRequestException,
  Scope,
  Inject,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository, DeepPartial } from 'typeorm';
import { REQUEST } from '@nestjs/core';
import { Request } from 'express';

import { Restock } from '../entities/restock.entity';
import { RestockItem } from '../entities/restock-item.entity';
import { Item } from '../entities/item.entity';
import { Roll } from '../entities/roll.entity';
import {
  CreateRestockDto,
  RestockLineDto,
  NewItemDto,
} from './create-restock.dto';
import { Payment } from '../entities/payment.entity';

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

      const restockItemsToCreate: Array<Partial<RestockItem>> = [];
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

          restockItemsToCreate.push({
            restock: undefined as any,
            item: { id: it.id } as any,
            mode: 'EACH',
            quantity: qty,
            length_m: null,
            price_each: unitCost,
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
            });
            await manager.getRepository(Roll).save(roll);

            await manager
              .getRepository(Item)
              .increment({ id: it.id }, 'stock', len);
            it.stock = this.num3((it.stock ?? 0) + len);

            restockItemsToCreate.push({
              restock: undefined as any,
              item: { id: it.id } as any,
              mode: 'METER',
              quantity: 1,
              length_m: len,
              price_each: unitCost,
            });
            subtotal += this.num2(unitCost * len);
          }
        }
      }

      const tax = this.num2(dto.tax ?? 0);
      const total = this.num2(subtotal + tax);

      const restock = manager.getRepository(Restock).create({
        date: dto.date ? new Date(dto.date) : new Date(),
        supplierId: (dto as any).supplier ?? null,
        note: dto.note ?? null,
        subtotal,
        tax,
        total,
        user: this.resolveUserId()
          ? ({ id: this.resolveUserId()! } as any)
          : null,
      });
      const saved = await manager.getRepository(Restock).save(restock);

      for (const row of restockItemsToCreate) {
        const ri = manager.getRepository(RestockItem).create({
          ...row,
          restock: { id: saved.id } as any,
        });
        await manager.getRepository(RestockItem).save(ri);
      }

      // === NEW: capture optional payment for this purchase ===
      const paidParam = this.num2(
        Number(
          (dto as any).paid ??
            (dto as any).paidAmount ??
            (dto as any).amountPaid ??
            0,
        ),
      );
      if (paidParam > 0) {
        const payEntity = manager.getRepository(Payment).create({
          kind: 'restock',
          amount: paidParam,
          restock: { id: saved.id } as any,
          note: (dto as any).paymentNote ?? null,
        } as DeepPartial<Payment>);
        await manager.getRepository(Payment).save(payEntity);
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
      const status: 'paid' | 'partial' | 'unpaid' =
        paid >= total ? 'paid' : paid > 0 ? 'partial' : 'unpaid';

      const full = await manager.getRepository(Restock).findOne({
        where: { id: saved.id },
        relations: ['user', 'restockItems', 'restockItems.item'],
      });
      if (!full) throw new NotFoundException('Restock not found after save');

      return { ...full, paid, status };
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
    const status: 'paid' | 'partial' | 'unpaid' =
      paid >= total ? 'paid' : paid > 0 ? 'partial' : 'unpaid';

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
