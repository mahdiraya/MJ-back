import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Cashbox } from '../entities/cashbox.entity';
import { CashboxEntry } from '../entities/cashbox-entry.entity';
import { CreateManualCashboxEntryDto } from './dto/create-manual-entry.dto';
import { ManualEntryQueryDto } from './dto/manual-entry-query.dto';

@Injectable()
export class CashboxesService {
  constructor(
    @InjectRepository(Cashbox)
    private readonly cashboxRepo: Repository<Cashbox>,
    @InjectRepository(CashboxEntry)
    private readonly entryRepo: Repository<CashboxEntry>,
  ) {}

  async listCashboxes() {
    return this.cashboxRepo.find({
      order: { code: 'ASC' },
    });
  }

  async createManualEntry(dto: CreateManualCashboxEntryDto) {
    const cashbox = await this.resolveCashbox(dto);
    if (!cashbox) {
      throw new BadRequestException('Valid cashbox is required');
    }

    const amount = +Number(dto.amount).toFixed(2);
    const direction = dto.kind === 'income' ? 'in' : 'out';

    const entry = this.entryRepo.create({
      cashbox: { id: cashbox.id } as any,
      kind: dto.kind,
      direction,
      amount,
      note: dto.note ?? null,
      referenceType: 'manual',
      referenceId: null,
      occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
      meta: null,
    });

    return this.entryRepo.save(entry);
  }

  async listManualEntries(query: ManualEntryQueryDto) {
    const qb = this.entryRepo
      .createQueryBuilder('entry')
      .leftJoinAndSelect('entry.cashbox', 'cashbox')
      .where("entry.referenceType = 'manual'")
      .orderBy('entry.occurredAt', 'DESC')
      .addOrderBy('entry.id', 'DESC');

    if (query.kind) {
      qb.andWhere('entry.kind = :kind', { kind: query.kind });
    }

    if (query.cashboxId) {
      qb.andWhere('cashbox.id = :cashboxId', {
        cashboxId: Number(query.cashboxId),
      });
    }

    if (query.cashboxCode) {
      qb.andWhere('cashbox.code = :cashboxCode', {
        cashboxCode: query.cashboxCode.toUpperCase(),
      });
    }

    if (query.startDate) {
      qb.andWhere('entry.occurredAt >= :startDate', {
        startDate: query.startDate,
      });
    }

    if (query.endDate) {
      qb.andWhere('entry.occurredAt <= :endDate', {
        endDate: query.endDate,
      });
    }

    if (query.search) {
      const term = `%${query.search.trim()}%`;
      qb.andWhere('entry.note LIKE :term', { term });
    }

    const rows = await qb.getMany();
    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      direction: row.direction,
      amount: +Number(row.amount).toFixed(2),
      note: row.note,
      occurredAt: row.occurredAt?.toISOString() ?? null,
      cashbox: row.cashbox
        ? {
            id: row.cashbox.id,
            code: row.cashbox.code,
            label: row.cashbox.label,
          }
        : null,
    }));
  }

  private async resolveCashbox(dto: CreateManualCashboxEntryDto) {
    if (dto.cashboxId) {
      const found = await this.cashboxRepo.findOne({
        where: { id: Number(dto.cashboxId) },
      });
      if (found) return found;
    }
    if (dto.cashboxCode) {
      const found = await this.cashboxRepo.findOne({
        where: { code: dto.cashboxCode.toUpperCase() },
      });
      if (found) return found;
    }
    return null;
  }
}
