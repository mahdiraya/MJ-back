import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Cashbox } from '../entities/cashbox.entity';
import { CashboxEntry } from '../entities/cashbox-entry.entity';
import { Restock } from '../entities/restock.entity';
import { Payment } from '../entities/payment.entity';
import { Transaction } from '../entities/transaction.entity';

export type StatsOverview = {
  generatedAt: string;
  cashboxes: Array<{
    id: number;
    code: string;
    label: string;
    isActive: boolean;
    balance: number;
    totalIn: number;
    totalOut: number;
    lastMovementAt: string | null;
  }>;
  cashboxTotals: {
    totalIn: number;
    totalOut: number;
    balance: number;
  };
  supplierDebt: {
    totalOutstanding: number;
    suppliers: Array<{
      supplierId: number | null;
      total: number;
      paid: number;
      outstanding: number;
    }>;
  };
  sales: {
    today: number;
    last7Days: number;
    daily: Array<{ date: string; total: number }>;
  };
  restocks: {
    today: number;
    last7Days: number;
    daily: Array<{ date: string; total: number }>;
  };
  profitSeries: {
    weekly: Array<{ date: string; total: number }>;
    monthly: Array<{ date: string; total: number }>;
    yearly: Array<{ period: string; total: number }>;
  };
  cashReceivedSeries: {
    weekly: Array<{ date: string; total: number }>;
    monthly: Array<{ date: string; total: number }>;
    yearly: Array<{ period: string; total: number }>;
  };
  monthly: {
    sales: number;
    collected: number;
    purchases: number;
    net: number;
  };
};

@Injectable()
export class StatsService {
  constructor(
    @InjectRepository(Cashbox)
    private readonly cashboxRepo: Repository<Cashbox>,
    @InjectRepository(Restock)
    private readonly restockRepo: Repository<Restock>,
    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
  ) {}

  async getOverview(): Promise<StatsOverview> {
    const [
      cashboxes,
      supplierDebt,
      salesDaily,
      restocksDaily,
      monthlySummary,
      salesCurrentMonth,
      restocksCurrentMonth,
      salesYearly,
      restocksYearly,
      cashWeekly,
      cashMonthly,
      cashYearly,
    ] = await Promise.all([
      this.loadCashboxSummaries(),
      this.loadSupplierDebtSummary(),
      this.loadSalesDaily(),
      this.loadRestocksDaily(),
      this.computeMonthlySnapshot(),
      this.loadSalesCurrentMonthDaily(),
      this.loadRestocksCurrentMonthDaily(),
      this.loadSalesYearly(),
      this.loadRestocksYearly(),
      this.loadCashReceivedLast7Days(),
      this.loadCashReceivedCurrentMonthDaily(),
      this.loadCashReceivedYearly(),
    ]);

    const cashboxTotals = cashboxes.reduce(
      (acc, cb) => {
        acc.totalIn += cb.totalIn;
        acc.totalOut += cb.totalOut;
        acc.balance += cb.balance;
        return acc;
      },
      { totalIn: 0, totalOut: 0, balance: 0 },
    );

    const todayKey = this.formatDate(new Date());
    const salesToday = salesDaily.find((d) => d.date === todayKey)?.total ?? 0;
    const restocksToday =
      restocksDaily.find((d) => d.date === todayKey)?.total ?? 0;

    const salesLast7 = salesDaily.reduce((sum, d) => sum + d.total, 0);
    const restocksLast7 = restocksDaily.reduce((sum, d) => sum + d.total, 0);

    const restockWeeklyMap = new Map(
      restocksDaily.map((d) => [d.date, d.total]),
    );
    const profitWeekly = salesDaily.map((day) => ({
      date: day.date,
      total: +(day.total - (restockWeeklyMap.get(day.date) ?? 0)).toFixed(2),
    }));

    const restockMonthlyMap = new Map(
      restocksCurrentMonth.map((d) => [d.date, d.total]),
    );
    const profitMonthlyDaily = salesCurrentMonth.map((day) => ({
      date: day.date,
      total: +(day.total - (restockMonthlyMap.get(day.date) ?? 0)).toFixed(2),
    }));

    const restockYearlyMap = new Map(
      restocksYearly.map((m) => [m.period, m.total]),
    );
    const profitYearly = salesYearly.map((m) => ({
      period: m.period,
      total: +(m.total - (restockYearlyMap.get(m.period) ?? 0)).toFixed(2),
    }));

    return {
      generatedAt: new Date().toISOString(),
      cashboxes,
      cashboxTotals: {
        totalIn: +cashboxTotals.totalIn.toFixed(2),
        totalOut: +cashboxTotals.totalOut.toFixed(2),
        balance: +cashboxTotals.balance.toFixed(2),
      },
      supplierDebt,
      sales: {
        today: +salesToday.toFixed(2),
        last7Days: +salesLast7.toFixed(2),
        daily: salesDaily,
      },
      restocks: {
        today: +restocksToday.toFixed(2),
        last7Days: +restocksLast7.toFixed(2),
        daily: restocksDaily,
      },
      profitSeries: {
        weekly: profitWeekly,
        monthly: profitMonthlyDaily,
        yearly: profitYearly,
      },
      cashReceivedSeries: {
        weekly: cashWeekly,
        monthly: cashMonthly,
        yearly: cashYearly,
      },
      monthly: monthlySummary,
    };
  }

  private async computeMonthlySnapshot(): Promise<{
    sales: number;
    collected: number;
    purchases: number;
    net: number;
  }> {
    const now = new Date();
    const startOfMonth = new Date(
      now.getFullYear(),
      now.getMonth(),
      1,
      0,
      0,
      0,
      0,
    );

    const salesRow = await this.transactionRepo
      .createQueryBuilder('t')
      .select('COALESCE(SUM(t.total), 0)', 'total')
      .where('t.date >= :start', { start: startOfMonth })
      .getRawOne<{ total?: string }>();

    const restockRow = await this.restockRepo
      .createQueryBuilder('r')
      .select('COALESCE(SUM(r.total), 0)', 'total')
      .where('COALESCE(r.date, r.created_at) >= :start', {
        start: startOfMonth,
      })
      .getRawOne<{ total?: string }>();

    const collectedRow = await this.paymentRepo
      .createQueryBuilder('p')
      .select('COALESCE(SUM(p.amount), 0)', 'total')
      .where('p.kind = :kind', { kind: 'sale' })
      .andWhere('p.created_at >= :start', { start: startOfMonth })
      .getRawOne<{ total?: string }>();

    const monthSales = Number(salesRow?.total ?? 0);
    const monthPurchases = Number(restockRow?.total ?? 0);
    const monthCollected = Number(collectedRow?.total ?? 0);
    const net = monthSales - monthPurchases;

    return {
      sales: +monthSales.toFixed(2),
      collected: +monthCollected.toFixed(2),
      purchases: +monthPurchases.toFixed(2),
      net: +net.toFixed(2),
    };
  }

  private async loadCashReceivedLast7Days() {
    const range = this.buildLast7DaysRange();
    const rows = await this.paymentRepo
      .createQueryBuilder('p')
      .select('DATE(p.created_at)', 'day')
      .addSelect('SUM(p.amount)', 'total')
      .where('p.kind = :kind', { kind: 'sale' })
      .andWhere('p.created_at >= :from', { from: range.start })
      .groupBy('day')
      .orderBy('day', 'ASC')
      .getRawMany<{ day: string; total: string }>();

    const map = new Map<string, number>();
    for (const row of rows) {
      map.set(this.formatDate(row.day), Number(row.total || 0));
    }

    return range.days.map((day) => ({
      date: day,
      total: +(map.get(day) ?? 0).toFixed(2),
    }));
  }

  private async loadCashReceivedCurrentMonthDaily() {
    const range = this.buildCurrentMonthRange();
    const rows = await this.paymentRepo
      .createQueryBuilder('p')
      .select('DATE(p.created_at)', 'day')
      .addSelect('SUM(p.amount)', 'total')
      .where('p.kind = :kind', { kind: 'sale' })
      .andWhere('p.created_at >= :start', { start: range.start })
      .groupBy('day')
      .orderBy('day', 'ASC')
      .getRawMany<{ day: string; total: string }>();

    const map = new Map<string, number>();
    for (const row of rows) {
      map.set(this.formatDate(row.day), Number(row.total || 0));
    }

    return range.days.map((day) => ({
      date: day,
      total: +(map.get(day) ?? 0).toFixed(2),
    }));
  }

  private async loadCashReceivedYearly() {
    const months = this.buildLastMonthsRange(12);
    const rows = await this.paymentRepo
      .createQueryBuilder('p')
      .select("DATE_FORMAT(p.created_at, '%Y-%m')", 'period')
      .addSelect('SUM(p.amount)', 'total')
      .where('p.kind = :kind', { kind: 'sale' })
      .andWhere('p.created_at >= :start', { start: months[0].start })
      .groupBy('period')
      .getRawMany<{ period: string; total: string }>();

    const map = new Map<string, number>();
    for (const row of rows) {
      map.set(row.period, Number(row.total || 0));
    }

    return months.map((month) => ({
      period: month.label,
      total: +(map.get(month.label) ?? 0).toFixed(2),
    }));
  }

  private async loadCashboxSummaries() {
    const raw = await this.cashboxRepo
      .createQueryBuilder('c')
      .leftJoin(
        (qb) =>
          qb
            .subQuery()
            .select('ce.cashbox_id', 'cashbox_id')
            .addSelect(
              `SUM(CASE WHEN ce.direction = 'in' THEN ce.amount ELSE 0 END)`,
              'sum_in',
            )
            .addSelect(
              `SUM(CASE WHEN ce.direction = 'out' THEN ce.amount ELSE 0 END)`,
              'sum_out',
            )
            .addSelect('MAX(ce.occurred_at)', 'last_movement')
            .addSelect('MAX(ce.created_at)', 'last_created')
            .from(CashboxEntry, 'ce')
            .groupBy('ce.cashbox_id'),
        'agg',
        'agg.cashbox_id = c.id',
      )
      .select([
        'c.id AS id',
        'c.code AS code',
        'c.label AS label',
        'c.is_active AS isActive',
        'COALESCE(agg.sum_in, 0) AS totalIn',
        'COALESCE(agg.sum_out, 0) AS totalOut',
        'COALESCE(agg.last_movement, agg.last_created) AS lastMovement',
      ])
      .orderBy('c.code', 'ASC')
      .getRawMany<{
        id: number;
        code: string;
        label: string;
        isActive: number;
        totalIn: string;
        totalOut: string;
        lastMovement: Date | null;
      }>();

    return raw.map((row) => {
      const totalIn = Number(row.totalIn || 0);
      const totalOut = Number(row.totalOut || 0);
      return {
        id: Number(row.id),
        code: row.code,
        label: row.label,
        isActive: !!row.isActive,
        totalIn: +totalIn.toFixed(2),
        totalOut: +totalOut.toFixed(2),
        balance: +(totalIn - totalOut).toFixed(2),
        lastMovementAt: row.lastMovement
          ? new Date(row.lastMovement).toISOString()
          : null,
      };
    });
  }

  private async loadSupplierDebtSummary() {
    const rows = await this.restockRepo
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
      .select('r.supplierId', 'supplierId')
      .addSelect('SUM(r.total)', 'total')
      .addSelect('SUM(COALESCE(pay.paid, 0))', 'paid')
      .groupBy('r.supplierId')
      .getRawMany<{
        supplierId: number | null;
        total: string;
        paid: string;
      }>();

    const suppliers = rows.map((row) => {
      const total = Number(row.total || 0);
      const paid = Number(row.paid || 0);
      return {
        supplierId: row.supplierId != null ? Number(row.supplierId) : null,
        total: +total.toFixed(2),
        paid: +paid.toFixed(2),
        outstanding: +(total - paid).toFixed(2),
      };
    });

    const totalOutstanding = suppliers.reduce(
      (sum, s) => sum + s.outstanding,
      0,
    );

    return {
      totalOutstanding: +totalOutstanding.toFixed(2),
      suppliers: suppliers.sort((a, b) => b.outstanding - a.outstanding),
    };
  }

  private async loadSalesDaily() {
    const range = this.buildLast7DaysRange();
    const rows = await this.transactionRepo
      .createQueryBuilder('t')
      .select(`DATE(t.date)`, 'day')
      .addSelect('SUM(t.total)', 'total')
      .where('t.date >= :from', { from: range.start })
      .groupBy('day')
      .orderBy('day', 'ASC')
      .getRawMany<{ day: string; total: string }>();

    const map = new Map<string, number>();
    for (const row of rows) {
      map.set(this.formatDate(row.day), Number(row.total || 0));
    }

    return range.days.map((day) => ({
      date: day,
      total: +(map.get(day) ?? 0).toFixed(2),
    }));
  }

  private async loadRestocksDaily() {
    const range = this.buildLast7DaysRange();
    const rows = await this.restockRepo
      .createQueryBuilder('r')
      .select(`DATE(COALESCE(r.date, r.created_at))`, 'day')
      .addSelect('SUM(r.total)', 'total')
      .where('COALESCE(r.date, r.created_at) >= :from', { from: range.start })
      .groupBy('day')
      .orderBy('day', 'ASC')
      .getRawMany<{ day: string; total: string }>();

    const map = new Map<string, number>();
    for (const row of rows) {
      map.set(this.formatDate(row.day), Number(row.total || 0));
    }

    return range.days.map((day) => ({
      date: day,
      total: +(map.get(day) ?? 0).toFixed(2),
    }));
  }

  private async loadSalesCurrentMonthDaily() {
    const range = this.buildCurrentMonthRange();
    const rows = await this.transactionRepo
      .createQueryBuilder('t')
      .select(`DATE(t.date)`, 'day')
      .addSelect('SUM(t.total)', 'total')
      .where('t.date >= :start', { start: range.start })
      .groupBy('day')
      .orderBy('day', 'ASC')
      .getRawMany<{ day: string; total: string }>();

    const map = new Map<string, number>();
    for (const row of rows) {
      map.set(this.formatDate(row.day), Number(row.total || 0));
    }

    return range.days.map((day) => ({
      date: day,
      total: +(map.get(day) ?? 0).toFixed(2),
    }));
  }

  private async loadRestocksCurrentMonthDaily() {
    const range = this.buildCurrentMonthRange();
    const rows = await this.restockRepo
      .createQueryBuilder('r')
      .select(`DATE(COALESCE(r.date, r.created_at))`, 'day')
      .addSelect('SUM(r.total)', 'total')
      .where('COALESCE(r.date, r.created_at) >= :start', {
        start: range.start,
      })
      .groupBy('day')
      .orderBy('day', 'ASC')
      .getRawMany<{ day: string; total: string }>();

    const map = new Map<string, number>();
    for (const row of rows) {
      map.set(this.formatDate(row.day), Number(row.total || 0));
    }

    return range.days.map((day) => ({
      date: day,
      total: +(map.get(day) ?? 0).toFixed(2),
    }));
  }

  private async loadSalesYearly() {
    const months = this.buildLastMonthsRange(12);
    const rows = await this.transactionRepo
      .createQueryBuilder('t')
      .select("DATE_FORMAT(t.date, '%Y-%m')", 'period')
      .addSelect('SUM(t.total)', 'total')
      .where('t.date >= :start', { start: months[0].start })
      .groupBy('period')
      .getRawMany<{ period: string; total: string }>();

    const map = new Map<string, number>();
    for (const row of rows) {
      map.set(row.period, Number(row.total || 0));
    }

    return months.map((month) => ({
      period: month.label,
      total: +(map.get(month.label) ?? 0).toFixed(2),
    }));
  }

  private async loadRestocksYearly() {
    const months = this.buildLastMonthsRange(12);
    const rows = await this.restockRepo
      .createQueryBuilder('r')
      .select("DATE_FORMAT(COALESCE(r.date, r.created_at), '%Y-%m')", 'period')
      .addSelect('SUM(r.total)', 'total')
      .where('COALESCE(r.date, r.created_at) >= :start', {
        start: months[0].start,
      })
      .groupBy('period')
      .getRawMany<{ period: string; total: string }>();

    const map = new Map<string, number>();
    for (const row of rows) {
      map.set(row.period, Number(row.total || 0));
    }

    return months.map((month) => ({
      period: month.label,
      total: +(map.get(month.label) ?? 0).toFixed(2),
    }));
  }

  private buildLast7DaysRange() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const start = new Date(today);
    start.setDate(today.getDate() - 6);

    const days: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      days.push(this.formatDate(d));
    }

    return { start, days };
  }

  private buildCurrentMonthRange() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const days: string[] = [];
    const cursor = new Date(start);
    while (cursor <= today) {
      days.push(this.formatDate(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return { start, end: today, days };
  }

  private buildLastMonthsRange(count: number) {
    const now = new Date();
    now.setDate(1);
    now.setHours(0, 0, 0, 0);

    const months: Array<{ start: Date; end: Date; label: string }> = [];
    for (let i = count - 1; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const label = `${start.getFullYear()}-${`${start.getMonth() + 1}`.padStart(
        2,
        '0',
      )}`;
      months.push({ start, end, label });
    }
    return months;
  }

  private formatDate(input: string | Date): string {
    if (typeof input === 'string') {
      if (/^\d{4}-\d{2}-\d{2}$/.test(input.trim())) {
        return input.trim();
      }
      const parsed = new Date(input);
      if (!Number.isNaN(parsed.getTime())) {
        return this.formatDate(parsed);
      }
      return input;
    }

    const date = new Date(input.getTime());
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
