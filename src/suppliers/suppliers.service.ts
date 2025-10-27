import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  DeepPartial,
  DataSource,
  EntityManager,
} from 'typeorm';
import { Supplier } from '../entities/supplier.entity';
import { Restock } from '../entities/restock.entity';
import { Payment } from '../entities/payment.entity';
import { Cashbox } from '../entities/cashbox.entity';
import { CashboxEntry } from '../entities/cashbox-entry.entity';
import {
  computeReceiptStatus,
  ManualStatusState,
} from '../payments/payment.helpers';
import { RecordSupplierPaymentDto } from './dto/record-supplier-payment.dto';

@Injectable()
export class SuppliersService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Supplier) private repo: Repository<Supplier>,
    @InjectRepository(Restock)
    private readonly restockRepo: Repository<Restock>,
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(Cashbox)
    private readonly cashboxRepo: Repository<Cashbox>,
    @InjectRepository(CashboxEntry)
    private readonly cashboxEntryRepo: Repository<CashboxEntry>,
  ) {}

  findAll() {
    return this.repo.find({ order: { id: 'DESC' } });
  }

  findOne(id: number) {
    return this.repo.findOneBy({ id });
  }

  async create(data: DeepPartial<Supplier>) {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async update(id: number, data: DeepPartial<Supplier>) {
    const existing = await this.repo.findOneBy({ id });
    if (!existing) throw new NotFoundException('Supplier not found');
    Object.assign(existing, data);
    return this.repo.save(existing);
  }

  async delete(id: number) {
    await this.repo.delete(id);
    return { success: true };
  }

  async getDebtOverview() {
    const rows = await this.restockRepo
      .createQueryBuilder('r')
      .leftJoin(Supplier, 's', 's.id = r.supplierId')
      .leftJoin(
        (qb) =>
          qb
            .subQuery()
            .select('p.restock_id', 'restockId')
            .addSelect('SUM(p.amount)', 'paid')
            .from(Payment, 'p')
            .where('p.kind = :kind', { kind: 'restock' })
            .groupBy('p.restock_id'),
        'pay',
        'pay.restockId = r.id',
      )
      .select('r.supplierId', 'supplierId')
      .addSelect('s.name', 'name')
      .addSelect('COUNT(r.id)', 'restocks')
      .addSelect('SUM(r.total)', 'total')
      .addSelect('SUM(COALESCE(pay.paid, 0))', 'paid')
      .groupBy('r.supplierId')
      .addGroupBy('s.name')
      .having('SUM(r.total) > 0')
      .getRawMany<{
        supplierId: number | null;
        name: string | null;
        restocks: string;
        total: string;
        paid: string;
      }>();

  const suppliers = rows.map((row) => {
      const total = Number(row.total || 0);
      const paid = Number(row.paid || 0);
      const outstanding = +(total - paid).toFixed(2);
      return {
        supplierId: row.supplierId != null ? Number(row.supplierId) : null,
        supplierName: row.name ?? '-',
        restockCount: Number(row.restocks || 0),
        total: +total.toFixed(2),
        paid: +paid.toFixed(2),
        outstanding,
      };
    });

    suppliers.sort((a, b) => b.outstanding - a.outstanding);

    return {
      suppliers,
      totalOutstanding: +suppliers
        .reduce((sum, item) => sum + item.outstanding, 0)
        .toFixed(2),
    };
  }

  async getSupplierDebtDetail(supplierId: number) {
    const supplier =
      (await this.repo.findOne({ where: { id: supplierId } })) ?? null;

    const restockRows = await this.restockRepo
      .createQueryBuilder('r')
      .leftJoin(
        (qb) =>
          qb
            .subQuery()
            .select('p.restock_id', 'restockId')
            .addSelect('SUM(p.amount)', 'paid')
            .from(Payment, 'p')
            .where('p.kind = :kind', { kind: 'restock' })
            .groupBy('p.restock_id'),
        'pay',
        'pay.restockId = r.id',
      )
      .select([
        'r.id AS id',
        'COALESCE(r.date, r.created_at) AS date',
        'r.total AS total',
        'r.status AS status',
        'r.status_manual_value AS statusManualValue',
        'r.status_manual_enabled AS statusManualEnabled',
        'COALESCE(pay.paid, 0) AS paid',
      ])
      .where('r.supplierId = :supplierId', { supplierId })
      .orderBy('COALESCE(r.date, r.created_at)', 'DESC')
      .getRawMany<{
        id: number;
        date: Date;
        total: string;
        paid: string;
        status: string;
        statusManualValue: string | null;
        statusManualEnabled: number;
      }>();

    const restocks = restockRows.map((row) => {
      const total = Number(row.total || 0);
      const paid = Number(row.paid || 0);
      return {
        id: Number(row.id),
        date: row.date ? new Date(row.date).toISOString() : null,
        total: +total.toFixed(2),
        paid: +paid.toFixed(2),
        outstanding: +(total - paid).toFixed(2),
        status: (row.status || 'UNPAID') as Restock['status'],
        statusManualEnabled: !!row.statusManualEnabled,
        statusManualValue: row.statusManualValue as Restock['status'] | null,
      };
    });

    const payments = await this.paymentRepo
      .createQueryBuilder('p')
      .innerJoin('p.restock', 'r')
      .leftJoin('p.cashbox', 'c')
      .select([
        'p.id AS id',
        'p.amount AS amount',
        'p.created_at AS createdAt',
        'p.note AS note',
        'r.id AS restockId',
        'c.code AS cashboxCode',
      ])
      .where('p.kind = :kind', { kind: 'restock' })
      .andWhere('r.supplierId = :supplierId', { supplierId })
      .orderBy('p.created_at', 'DESC')
      .getRawMany<{
        id: number;
        amount: string;
        createdAt: Date;
        note: string | null;
        restockId: number;
        cashboxCode: string | null;
      }>();

    const summary = restocks.reduce(
      (acc, r) => {
        acc.total += r.total;
        acc.paid += r.paid;
        acc.outstanding += r.outstanding;
        return acc;
      },
      { total: 0, paid: 0, outstanding: 0 },
    );

    const supplierInfo = supplier
      ? supplier
      : ({
          id: supplierId,
          name: `Supplier #${supplierId}`,
          phone: null,
          email: null,
          address: null,
        } as Supplier);

    return {
      supplier: supplierInfo,
      summary: {
        total: +summary.total.toFixed(2),
        paid: +summary.paid.toFixed(2),
        outstanding: +summary.outstanding.toFixed(2),
      },
      restocks,
      payments: payments.map((row) => ({
        id: Number(row.id),
        restockId: Number(row.restockId),
        amount: +Number(row.amount || 0).toFixed(2),
        note: row.note,
        cashboxCode: row.cashboxCode,
        createdAt: row.createdAt
          ? new Date(row.createdAt).toISOString()
          : null,
      })),
    };
  }

  async recordSupplierPayment(
    supplierId: number,
    dto: RecordSupplierPaymentDto,
  ) {
    if (!(dto.amount > 0)) {
      throw new BadRequestException('Payment amount must be greater than 0');
    }

    return this.dataSource.transaction(async (manager) => {
      const supplier = await manager
        .getRepository(Supplier)
        .findOne({ where: { id: supplierId } });
      if (!supplier) throw new NotFoundException('Supplier not found');

      const cashbox = await this.resolveCashbox(manager, dto);
      if (!cashbox) {
        throw new BadRequestException('Valid cashbox is required');
      }

      let amountRemaining = +Number(dto.amount).toFixed(2);
      const allocations =
        dto.allocations?.map((alloc) => ({
          restockId: Number(alloc.restockId),
          amount: +Number(alloc.amount).toFixed(2),
        })) || [];

      const restocksOutstanding = await this.loadOutstandingRestocks(
        manager,
        supplierId,
      );

      const allocationMap = new Map<number, number>();

      if (allocations.length) {
        for (const alloc of allocations) {
          if (!(alloc.amount > 0)) continue;
          allocationMap.set(alloc.restockId, alloc.amount);
        }
      }

      const paymentsCreated: Payment[] = [];

      for (const restock of restocksOutstanding) {
        if (amountRemaining <= 0) break;
        const outstanding = restock.outstanding;
        if (outstanding <= 0) continue;

        const preferred = allocationMap.get(restock.id);
        const portion =
          preferred != null
            ? Math.min(preferred, outstanding, amountRemaining)
            : Math.min(outstanding, amountRemaining);

        if (!(portion > 0)) continue;

        const payment = manager.getRepository(Payment).create({
          kind: 'restock',
          amount: portion,
          restock: { id: restock.id } as any,
          note: dto.note ?? null,
          cashbox: { id: cashbox.id } as any,
        });
        const saved = await manager.getRepository(Payment).save(payment);
        paymentsCreated.push(saved);

        const entry = manager.getRepository(CashboxEntry).create({
          cashbox: { id: cashbox.id } as any,
          kind: 'payment',
          direction: 'out',
          amount: portion,
          payment: { id: saved.id } as any,
          referenceType: 'restock',
          referenceId: restock.id,
          occurredAt: dto.paymentDate ? new Date(dto.paymentDate) : new Date(),
          note: dto.note ?? null,
          meta: dto.payMethod ? { method: dto.payMethod } : null,
        });
        await manager.getRepository(CashboxEntry).save(entry);

        await this.refreshRestockStatus(manager, restock.id);

        amountRemaining = +(
          amountRemaining - portion
        ).toFixed(2);
      }

      if (amountRemaining > 0.01) {
        throw new BadRequestException(
          'Could not allocate full amount to outstanding restocks',
        );
      }

      const detail = await this.getSupplierDebtDetail(supplierId);
      return { payments: paymentsCreated.length, detail };
    });
  }

  private async resolveCashbox(
    manager: EntityManager,
    dto: RecordSupplierPaymentDto,
  ) {
    if (dto.cashboxId) {
      const found = await manager.getRepository(Cashbox).findOne({
        where: { id: Number(dto.cashboxId) },
      });
      if (found) return found;
    }
    if (dto.cashboxCode) {
      const found = await manager.getRepository(Cashbox).findOne({
        where: { code: dto.cashboxCode.toUpperCase() },
      });
      if (found) return found;
    }
    return null;
  }

  private async loadOutstandingRestocks(manager: EntityManager, supplierId: number) {
    const rows = await manager
      .getRepository(Restock)
      .createQueryBuilder('r')
      .leftJoin(
        (qb) =>
          qb
            .subQuery()
            .select('p.restock_id', 'restockId')
            .addSelect('SUM(p.amount)', 'paid')
            .from(Payment, 'p')
            .where('p.kind = :kind', { kind: 'restock' })
            .groupBy('p.restock_id'),
        'pay',
        'pay.restockId = r.id',
      )
      .select([
        'r.id AS id',
        'r.total AS total',
        'COALESCE(pay.paid, 0) AS paid',
      ])
      .where('r.supplierId = :supplierId', { supplierId })
      .orderBy('COALESCE(r.date, r.created_at)', 'ASC')
      .getRawMany<{
        id: number;
        total: string;
        paid: string;
      }>();

    return rows.map((row) => ({
      id: Number(row.id),
      outstanding: +(
        Number(row.total || 0) - Number(row.paid || 0)
      ).toFixed(2),
    }));
  }

  private async refreshRestockStatus(
    manager: EntityManager,
    restockId: number,
  ) {
    const restock = await manager.getRepository(Restock).findOne({
      where: { id: restockId },
    });
    if (!restock) return;

    const paidRow = await manager
      .getRepository(Payment)
      .createQueryBuilder('p')
      .select('COALESCE(SUM(p.amount), 0)', 'paid')
      .where('p.kind = :kind', { kind: 'restock' })
      .andWhere('p.restock_id = :id', { id: restockId })
      .getRawOne<{ paid: string }>();

    const paid = +Number(paidRow?.paid || 0).toFixed(2);

    const manual: ManualStatusState<'PAID' | 'PARTIAL' | 'UNPAID'> = {
      enabled: !!restock.statusManualEnabled,
      value: restock.statusManualValue ?? null,
      note: restock.statusManualNote ?? null,
    };

    const status = computeReceiptStatus<'PAID' | 'PARTIAL' | 'UNPAID'>(
      paid,
      restock.total ?? 0,
      manual,
      (n) => +Number(n).toFixed(2),
      ['PAID', 'PARTIAL', 'UNPAID'],
    );

    if (restock.status !== status) {
      await manager
        .getRepository(Restock)
        .update(restockId, { status });
    }
  }
}
