import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';
import { RestockItem } from './restock-item.entity';
import { Payment } from './payment.entity';

const dec2 = {
  to: (v: any) => v,
  from: (v: any) => (v == null ? null : Number(v)),
};

export type ReceiptStatus = 'PAID' | 'PARTIAL' | 'UNPAID';

@Entity('restocks')
export class Restock {
  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  date: Date | null;

  @Column({ name: 'supplier_id', type: 'int', nullable: true })
  supplierId: number | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: dec2,
  })
  subtotal: number | null;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: dec2,
  })
  tax: number | null;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: false,
    default: 0,
    transformer: dec2,
  })
  total: number;

  @Column({
    type: 'enum',
    enum: ['PAID', 'PARTIAL', 'UNPAID'],
    default: 'UNPAID',
  })
  status!: ReceiptStatus;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'userId' })
  user: User | null;

  @OneToMany(() => RestockItem, (ri) => ri.restock)
  restockItems: RestockItem[];

  @OneToMany(() => Payment, (p) => p.restock)
  payments: Payment[];
}
