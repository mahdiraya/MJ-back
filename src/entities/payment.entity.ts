// payment.entity.ts (relevant parts)
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Transaction } from './transaction.entity';
import { Restock } from './restock.entity';

const dec2 = {
  to: (v: any) => v,
  from: (v: any) => (v == null ? null : Number(v)),
};

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'enum', enum: ['sale', 'restock', 'other'] })
  kind: 'sale' | 'restock' | 'other';

  @Column({ type: 'decimal', precision: 12, scale: 2, transformer: dec2 })
  amount: number;

  @ManyToOne(() => Transaction, (t) => t.payments, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'transaction_id' }) // FK column name in DB
  transaction: Transaction | null;

  @ManyToOne(() => Restock, (r) => r.payments, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'restock_id' }) // FK for restock payments
  restock: Restock | null;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @Column({ type: 'text', nullable: true })
  note: string | null;
}
