import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { InventoryUnit } from '../entities/inventory-unit.entity';
import {
  InventoryReturn,
  ReturnStatus,
} from '../entities/inventory-return.entity';
import { Item } from '../entities/item.entity';
import { Supplier } from '../entities/supplier.entity';

export type CreateReturnDto = {
  requestedOutcome: 'restock' | 'defective';
  note?: string;
};

export type ResolveReturnDto = {
  action: 'restock' | 'trash' | 'returnToSupplier';
  note?: string;
  supplierId?: number;
  supplierNote?: string;
};

@Injectable()
export class ReturnsService {
  constructor(
    @InjectRepository(InventoryUnit)
    private readonly unitRepo: Repository<InventoryUnit>,
    @InjectRepository(InventoryReturn)
    private readonly returnRepo: Repository<InventoryReturn>,
    @InjectRepository(Item)
    private readonly itemRepo: Repository<Item>,
    @InjectRepository(Supplier)
    private readonly supplierRepo: Repository<Supplier>,
  ) {}

  async requestReturn(unitId: number, dto: CreateReturnDto) {
    const unit = await this.unitRepo.findOne({
      where: { id: unitId },
      relations: ['item'],
    });
    if (!unit) {
      throw new NotFoundException('Inventory unit not found');
    }
    if (unit.status !== 'sold') {
      throw new BadRequestException(
        'Only sold units can be marked for return.',
      );
    }
    const existing = await this.returnRepo.findOne({
      where: { inventoryUnit: { id: unit.id }, status: 'pending' },
    });
    if (existing) {
      throw new BadRequestException('Return already pending for this unit.');
    }

    unit.status = 'returned';
    await this.unitRepo.save(unit);

    const payload = this.returnRepo.create({
      inventoryUnit: { id: unit.id } as InventoryUnit,
      requestedOutcome: dto.requestedOutcome,
      status: 'pending',
      note: dto.note ?? null,
    });
    return this.returnRepo.save(payload);
  }

  async listReturns() {
    const rows = await this.returnRepo.find({
      relations: [
        'inventoryUnit',
        'inventoryUnit.item',
        'supplier',
        'inventoryUnit.transactionItemLinks',
        'inventoryUnit.transactionItemLinks.transactionItem',
        'inventoryUnit.transactionItemLinks.transactionItem.transaction',
      ],
      order: { status: 'ASC', createdAt: 'DESC' },
    });

    return rows.map((entry) => {
      const link = entry.inventoryUnit.transactionItemLinks?.[0];
      const txItem = link?.transactionItem;
      const tx = txItem?.transaction;
      return {
        id: entry.id,
        status: entry.status,
        requestedOutcome: entry.requestedOutcome,
        note: entry.note,
        createdAt: entry.createdAt,
        resolvedAt: entry.resolvedAt,
        supplier: entry.supplier
          ? { id: entry.supplier.id, name: entry.supplier.name }
          : null,
        supplierNote: entry.supplierNote,
        transaction: tx
          ? {
              id: tx.id,
              date: tx.date,
              lineId: txItem?.id ?? null,
              unitPrice: txItem?.price_each ?? null,
            }
          : null,
        inventoryUnit: {
          id: entry.inventoryUnit.id,
          barcode: entry.inventoryUnit.barcode,
          status: entry.inventoryUnit.status,
          item: entry.inventoryUnit.item
            ? {
                id: entry.inventoryUnit.item.id,
                name: entry.inventoryUnit.item.name,
                sku: entry.inventoryUnit.item.sku,
              }
            : null,
        },
      };
    });
  }

  async resolveReturn(id: number, dto: ResolveReturnDto) {
    const record = await this.returnRepo.findOne({
      where: { id },
      relations: ['inventoryUnit', 'inventoryUnit.item'],
    });
    if (!record) {
      throw new NotFoundException('Return record not found');
    }
    if (record.status !== 'pending') {
      throw new BadRequestException('Return already resolved.');
    }
    const unit = record.inventoryUnit;
    const item = record.inventoryUnit.item;
    if (!unit || !item) {
      throw new BadRequestException('Invalid return record');
    }

    if (dto.action === 'restock') {
      unit.status = 'available';
      record.status = 'restocked';
      await this.itemRepo.increment({ id: item.id }, 'stock', 1);
    } else if (dto.action === 'trash') {
      unit.status = 'defective';
      record.status = 'trashed';
    } else if (dto.action === 'returnToSupplier') {
      unit.status = 'defective';
      record.status = 'returned_to_supplier';
      if (dto.supplierId) {
        const supplier = await this.supplierRepo.findOne({
          where: { id: Number(dto.supplierId) },
        });
        if (!supplier) {
          throw new BadRequestException('Supplier not found.');
        }
        record.supplier = supplier;
      } else {
        record.supplier = null;
      }
      record.supplierNote = dto.supplierNote ?? null;
    } else {
      throw new BadRequestException('Unknown action.');
    }

    record.note = dto.note ?? record.note ?? null;
    record.resolvedAt = new Date();

    await this.unitRepo.save(unit);
    await this.returnRepo.save(record);
    return record;
  }
}
