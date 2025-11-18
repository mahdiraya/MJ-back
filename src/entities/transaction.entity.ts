import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Customer } from './customer.entity';
import { TransactionItem } from './transaction-item.entity';
import { Payment } from './payment.entity';

export type ReceiptStatus = 'PAID' | 'PARTIAL' | 'UNPAID';

@Entity('transactions')
export class Transaction {
  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn({ type: 'datetime' })
  date: Date;

  @ManyToOne(() => User, (user) => user.transactions)
  @JoinColumn({ name: 'user_id' }) // <<<<<
  user: User;

  @ManyToOne(() => Customer, (customer) => customer.transactions, {
    nullable: true,
  })
  @JoinColumn({ name: 'customer_id' }) // <<<<<
  customer: Customer;

  @Column('decimal', { precision: 10, scale: 2 })
  total: number;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({ type: 'enum', enum: ['simple', 'detailed'] })
  receipt_type: 'simple' | 'detailed';

  @Column({
    type: 'enum',
    enum: ['PAID', 'PARTIAL', 'UNPAID'],
    default: 'UNPAID',
  })
  status!: ReceiptStatus;

  @Column({
    name: 'status_manual_enabled',
    type: 'boolean',
    default: false,
  })
  statusManualEnabled: boolean;

  @Column({
    name: 'status_manual_value',
    type: 'enum',
    enum: ['PAID', 'PARTIAL', 'UNPAID'],
    nullable: true,
  })
  statusManualValue: ReceiptStatus | null;

  @Column({ name: 'status_manual_note', type: 'text', nullable: true })
  statusManualNote: string | null;

  @Column({ name: 'status_manual_set_at', type: 'datetime', nullable: true })
  statusManualSetAt: Date | null;

  @OneToMany(
    () => TransactionItem,
    (transactionItem) => transactionItem.transaction,
  )
  transactionItems: TransactionItem[];

  @OneToMany(() => Payment, (p) => p.transaction)
  payments: Payment[];

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'last_edit_user_id' })
  lastEditUser?: User | null;

  @Column({ name: 'last_edit_note', type: 'text', nullable: true })
  lastEditNote?: string | null;

  @Column({ name: 'last_edit_at', type: 'datetime', nullable: true })
  lastEditAt?: Date | null;
}
