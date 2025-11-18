import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  InventoryUnit,
  InventoryUnitStatus,
} from '../entities/inventory-unit.entity';
import { Item } from '../entities/item.entity';
import { TransactionItemUnit } from '../entities/transaction-item-unit.entity';
import { ListInventoryUnitsDto } from './dto/list-inventory-units.dto';

@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(InventoryUnit)
    private readonly inventoryRepo: Repository<InventoryUnit>,
    @InjectRepository(Item)
    private readonly itemRepo: Repository<Item>,
    @InjectRepository(TransactionItemUnit)
    private readonly linkRepo: Repository<TransactionItemUnit>,
  ) {}

  async listUnitsForItem(
    itemId: number,
    query: ListInventoryUnitsDto = {},
  ) {
    const limit = Math.min(Math.max(query.limit ?? 200, 1), 1000);
    const qb = this.inventoryRepo
      .createQueryBuilder('unit')
      .leftJoinAndSelect('unit.item', 'item')
      .leftJoinAndSelect('unit.restockItem', 'restockItem')
      .leftJoinAndSelect('unit.roll', 'roll')
      .where('unit.item_id = :itemId', { itemId })
      .orderBy('unit.created_at', 'DESC')
      .limit(limit);

    if (!query.includePlaceholders) {
      qb.andWhere('unit.is_placeholder = 0');
    }

    if (query.status) {
      qb.andWhere('unit.status = :status', { status: query.status });
    }

    return qb.getMany();
  }

  async assignBarcode(unitId: number, barcode?: string | null) {
    const normalized = this.normalizeBarcode(barcode);
    const unit = await this.inventoryRepo.findOne({ where: { id: unitId } });
    if (!unit) throw new NotFoundException('Inventory unit not found');

    if (normalized) {
      const clash = await this.inventoryRepo.findOne({
        where: { barcode: normalized },
      });
      if (clash && clash.id !== unit.id) {
        throw new BadRequestException('Barcode already assigned to another unit');
      }
    }

    unit.barcode = normalized;
    unit.isPlaceholder = !normalized;
    return this.inventoryRepo.save(unit);
  }

  async updateStatus(unitId: number, status: InventoryUnitStatus) {
    const unit = await this.inventoryRepo.findOne({ where: { id: unitId } });
    if (!unit) throw new NotFoundException('Inventory unit not found');
    unit.status = status;
    return this.inventoryRepo.save(unit);
  }

  async lookupByBarcode(rawBarcode: string) {
    const normalized = this.normalizeBarcode(rawBarcode);
    if (!normalized) {
      throw new BadRequestException('Barcode is required.');
    }
    const unit = await this.inventoryRepo.findOne({
      where: { barcode: normalized },
      relations: ['item', 'restockItem', 'roll'],
    });
    if (!unit) {
      throw new NotFoundException('Inventory unit not found for this barcode.');
    }
    return unit;
  }

  async getUnitHistory(unitId: number) {
    const unit = await this.inventoryRepo.findOne({
      where: { id: unitId },
      relations: ['item', 'restockItem', 'restockItem.restock', 'roll'],
    });
    if (!unit) throw new NotFoundException('Inventory unit not found');

    const sales = await this.linkRepo
      .createQueryBuilder('link')
      .leftJoinAndSelect('link.transactionItem', 'transactionItem')
      .leftJoinAndSelect('transactionItem.transaction', 'transaction')
      .leftJoinAndSelect('transaction.customer', 'customer')
      .where('link.inventory_unit_id = :unitId', { unitId })
      .orderBy('transaction.date', 'DESC')
      .getMany();

    return {
      unit,
      restock: unit.restockItem?.restock ?? null,
      sales: sales.map((link) => {
        const ti = link.transactionItem;
        return {
          transactionId: ti.transaction?.id ?? null,
          transactionDate: ti.transaction?.date ?? null,
          customer: ti.transaction?.customer ?? null,
          quantity: ti.quantity,
          length_m: ti.length_m,
          price_each: ti.price_each,
          cost_each: ti.cost_each ?? null,
        };
      }),
    };
  }

  private normalizeBarcode(barcode?: string | null) {
    const trimmed = (barcode ?? '').trim();
    if (!trimmed) return null;
    if (trimmed.length > 191) {
      throw new BadRequestException('Barcode must be 191 characters or fewer');
    }
    return trimmed;
  }
}
