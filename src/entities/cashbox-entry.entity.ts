import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Cashbox } from './cashbox.entity';
import { Payment } from './payment.entity';

const dec2 = {
  to: (v: any) => v,
  from: (v: any) => (v == null ? null : Number(v)),
};

export type CashboxEntryKind =
  | 'payment'
  | 'expense'
  | 'income'
  | 'transfer'
  | 'adjustment';

export type CashboxEntryDirection = 'in' | 'out';

@Entity('cashbox_entries')
export class CashboxEntry {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Cashbox, (cashbox) => cashbox.entries, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'cashbox_id' })
  cashbox: Cashbox;

  @Column({
    type: 'enum',
    enum: ['payment', 'expense', 'income', 'transfer', 'adjustment'],
  })
  kind: CashboxEntryKind;

  @Column({ type: 'enum', enum: ['in', 'out'] })
  direction: CashboxEntryDirection;

  @Column({ type: 'decimal', precision: 12, scale: 2, transformer: dec2 })
  amount: number;

  @Column({
    name: 'reference_type',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  referenceType: string | null;

  @Column({ name: 'reference_id', type: 'int', nullable: true })
  referenceId: number | null;

  @ManyToOne(() => Payment, (payment) => payment.cashboxEntries, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'payment_id' })
  payment: Payment | null;

  @Column({ type: 'json', nullable: true })
  meta: Record<string, unknown> | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({ name: 'occurred_at', type: 'datetime', nullable: true })
  occurredAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
