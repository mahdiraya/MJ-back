import {
  Injectable,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Repository, In } from 'typeorm';
import { Item } from '../entities/item.entity';
import { BaseService } from '../base/base.service';
import { CreateItemDto } from './create-item.dto';
import { UpdateItemDto } from './update-item.dto';
import { Roll } from '../entities/roll.entity';
import { LowStockQueryDto } from './dto/low-stock.query.dto';
import { InventoryUnit } from '../entities/inventory-unit.entity';
import { generatePlaceholderBarcode } from '../inventory/inventory.utils';

@Injectable()
export class ItemsService extends BaseService<Item> {
  constructor(
    @InjectRepository(Item) private readonly itemsRepo: Repository<Item>,
    @InjectRepository(Roll) private readonly rollsRepo: Repository<Roll>,
    @InjectRepository(InventoryUnit)
    private readonly inventoryRepo: Repository<InventoryUnit>,
  ) {
    super(itemsRepo);
  }

  /** Normalize payload: numbers, units, price-tier fallbacks. */
  private normalizeUnits(data: Partial<Item>): Partial<Item> {
    const payload: Partial<Item> = { ...data };

    // --- coerce numerics
    if (payload.stock !== undefined) payload.stock = Number(payload.stock);
    if (payload.price !== undefined) payload.price = Number(payload.price);
    if (payload['priceRetail'] !== undefined && payload['priceRetail'] !== null)
      (payload as any).priceRetail = Number((payload as any).priceRetail);
    if (
      payload['priceWholesale'] !== undefined &&
      payload['priceWholesale'] !== null
    )
      (payload as any).priceWholesale = Number((payload as any).priceWholesale);
    if (payload.rollLength !== undefined && payload.rollLength !== null)
      payload.rollLength = Number(payload.rollLength);

    // --- units
    const unit = (payload.stockUnit ?? null) as 'm' | 'cm' | null;
    if (unit === 'cm') {
      // normalize to meters for storage
      payload.stock = Number.isFinite(payload.stock as number)
        ? Number(((payload.stock as number) / 100).toFixed(3))
        : 0;
      payload.stockUnit = 'm';
    } else if (unit !== 'm') {
      payload.stockUnit = null;
    }

    // rollLength only meaningful for meter items
    if (payload.stockUnit !== 'm') {
      payload.rollLength = null;
    }

    // --- rounding
    if (payload.stock !== undefined)
      payload.stock = Number((payload.stock as number).toFixed(3));
    if (payload.rollLength !== undefined && payload.rollLength !== null)
      payload.rollLength = Number((payload.rollLength as number).toFixed(2));
    if (payload.price !== undefined)
      payload.price = Number((payload.price as number).toFixed(2));
    if (
      (payload as any).priceRetail !== undefined &&
      (payload as any).priceRetail !== null
    )
      (payload as any).priceRetail = Number(
        ((payload as any).priceRetail as number).toFixed(2),
      );
    if (
      (payload as any).priceWholesale !== undefined &&
      (payload as any).priceWholesale !== null
    )
      (payload as any).priceWholesale = Number(
        ((payload as any).priceWholesale as number).toFixed(2),
      );

    // --- price fallbacks
    // If only legacy price provided -> copy to retail
    if ((payload as any).priceRetail == null && payload.price != null) {
      (payload as any).priceRetail = payload.price;
    }
    // Ensure legacy price is set at least to retail (helps older UIs/queries)
    if (payload.price == null && (payload as any).priceRetail != null) {
      payload.price = (payload as any).priceRetail as number;
    } else if (
      payload.price == null &&
      (payload as any).priceWholesale != null
    ) {
      payload.price = (payload as any).priceWholesale as number;
    }

    return payload;
  }

  async create(dto: CreateItemDto): Promise<Item> {
    try {
      // Normalize & enforce roll-only for meter items
      const normalized = this.normalizeUnits(dto);
      const wantsAutoSerial = !!dto.autoSerial;

      if (normalized.stockUnit === 'm') {
        // For meter items: ignore any incoming "stock" and compute from rolls
        normalized.stock = 0;
        if (wantsAutoSerial) {
          throw new BadRequestException(
            'Auto serial generation is only supported for EACH items.',
          );
        }
      }

      const serials =
        dto.initialSerials
          ?.map((s) => `${s ?? ''}`.trim())
          .filter((s) => !!s) || [];
      if (serials.length && normalized.stockUnit === 'm') {
        throw new BadRequestException(
          'Serial numbers are only supported for EACH items.',
        );
      }
      if (serials.length) {
        normalized.stock = serials.length;
      } else if (wantsAutoSerial && normalized.stockUnit !== 'm') {
        normalized.stock = Math.max(
          0,
          Math.floor(Number(dto.stock ?? normalized.stock ?? 0)),
        );
      } else if ((normalized.stock ?? 0) > 0) {
        throw new BadRequestException(
          'Provide serial numbers or enable auto-generation for initial stock.',
        );
      }

      const entity = this.itemsRepo.create(normalized as DeepPartial<Item>);
      const saved = await this.itemsRepo.save(entity);

      // If meter item and initialRolls provided, create rolls and recompute stock
      if (
        dto.stockUnit === 'm' &&
        Array.isArray(dto.initialRolls) &&
        dto.initialRolls.length
      ) {
        let sum = 0;
        for (const len of dto.initialRolls) {
          const l = Number(len);
          if (!(l > 0)) continue;
          const L = Number(l.toFixed(3));
          sum += L;
          const roll = this.rollsRepo.create({
            item: { id: saved.id } as any,
            length_m: L,
            remaining_m: L,
          });
          await this.rollsRepo.save(roll);
        }
        saved.stock = Number(sum.toFixed(3));
        await this.itemsRepo.save(saved);
      }

      if (serials.length) {
        const unique = Array.from(new Set(serials));
        if (unique.length !== serials.length) {
          throw new BadRequestException('Serial numbers must be unique.');
        }
        const existing = await this.inventoryRepo.count({
          where: { barcode: In(unique) },
        });
        if (existing) {
          throw new BadRequestException(
            'One or more serial numbers are already in use.',
          );
        }
        const units = serials.map((barcode) =>
          this.inventoryRepo.create({
            item: { id: saved.id } as any,
            barcode,
            isPlaceholder: false,
            status: 'available',
            restockItem: null,
            costEach: 0,
          }),
        );
        await this.inventoryRepo.save(units);
      } else if (wantsAutoSerial && (normalized.stock ?? 0) > 0) {
        const count = Math.max(
          0,
          Math.floor(Number(normalized.stock ?? 0)),
        );
        const units = Array.from({ length: count }, () =>
          this.inventoryRepo.create({
            item: { id: saved.id } as any,
            barcode: generatePlaceholderBarcode(),
            isPlaceholder: true,
            status: 'available',
            restockItem: null,
            costEach: 0,
          }),
        );
        if (units.length) {
          await this.inventoryRepo.save(units);
        }
      }

      return await this.itemsRepo.findOneOrFail({
        where: { id: saved.id },
        relations: ['rolls'],
      });
    } catch (e: any) {
      throw new InternalServerErrorException(
        e?.sqlMessage || e?.message || 'Create failed',
      );
    }
  }

  async update(id: number, dto: UpdateItemDto): Promise<Item> {
    try {
      const existing = await this.itemsRepo.findOneByOrFail({ id });

      // Disallow switching from METER -> EACH while rolls exist
      if (
        existing.stockUnit === 'm' &&
        dto &&
        (dto as any).stockUnit === null
      ) {
        const rollsCount = await this.rollsRepo.count({
          where: { item: { id } },
        });
        if (rollsCount > 0) {
          throw new BadRequestException(
            'Cannot switch to EACH while rolls exist for this item.',
          );
        }
      }

      // Merge then normalize
      const merged: Partial<Item> = { ...existing, ...dto };
      const normalized = this.normalizeUnits(merged);

      // If item is meter type, never let updates change "stock" directly.
      // Stock is managed by rolls & transactions.
      if (existing.stockUnit === 'm') {
        delete (normalized as any).stock;
      }

      const toSave: DeepPartial<Item> = { ...existing, ...normalized };
      await this.itemsRepo.save(toSave);

      return await this.itemsRepo.findOneOrFail({
        where: { id },
        relations: ['rolls'],
      });
    } catch (e: any) {
      throw new InternalServerErrorException(
        e?.sqlMessage || e?.message || 'Update failed',
      );
    }
  }

  /** Normalize & persist the item image URL (used by /items/:id/photo). */
  async setPhotoUrl(id: number, url: string) {
    const existing = await this.itemsRepo.findOneByOrFail({ id });

    // Normalize (accept absolute or relative; we store a web-relative path)
    let normalized = url.trim();
    // If someone passed a filename only (e.g. "item-1-123.jpg"), prefix our folder
    if (!normalized.startsWith('/uploads/')) {
      normalized = normalized.replace(/^\.?\/?uploads\/?/, ''); // strip loose prefixes
      normalized = `/uploads/${normalized.replace(/^\/+/, '')}`;
    }

    // Support either column name in your entity: photoUrl or imageUrl
    (existing as any).photoUrl = normalized;
    (existing as any).imageUrl = normalized;

    await this.itemsRepo.save(existing);
    return this.itemsRepo.findOneOrFail({
      where: { id },
      relations: ['rolls'],
    });
  }

  /** Alias to keep controller compatibility if it calls updateImageUrl(). */
  async updateImageUrl(id: number, url: string) {
    return this.setPhotoUrl(id, url);
  }

  async findLowStock(params: LowStockQueryDto) {
    const eachThreshold = params.eachThreshold ?? 5;
    const meterThreshold = params.meterThreshold ?? 10;

    const rows = await this.itemsRepo
      .createQueryBuilder('item')
      .select('item.id', 'id')
      .addSelect('item.name', 'name')
      .addSelect('item.sku', 'sku')
      .addSelect('item.category', 'category')
      .addSelect('item.stockUnit', 'stockUnit')
      .addSelect('COALESCE(item.stock, 0)', 'stock')
      .where(
        "(item.stockUnit = 'm' AND COALESCE(item.stock,0) <= :meterThreshold) OR ( (item.stockUnit IS NULL OR item.stockUnit <> 'm') AND COALESCE(item.stock,0) <= :eachThreshold)",
        { meterThreshold, eachThreshold },
      )
      .orderBy('stock', 'ASC')
      .addOrderBy('item.name', 'ASC')
      .getRawMany<{
        id: number;
        name: string;
        sku: string | null;
        category: string | null;
        stockUnit: 'm' | null;
        stock: string;
      }>();

    return rows.map((row) => ({
      id: Number(row.id),
      name: row.name,
      sku: row.sku,
      category: row.category as any,
      stockUnit: row.stockUnit as any,
      stock: +Number(row.stock || 0).toFixed(row.stockUnit === 'm' ? 3 : 0),
    }));
  }
}
