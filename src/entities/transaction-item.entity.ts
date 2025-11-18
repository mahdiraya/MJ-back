import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { Transaction } from './transaction.entity';
import { Item } from './item.entity';
import { Roll } from './roll.entity';
import { TransactionItemUnit } from './transaction-item-unit.entity';

const decimalTransformer = {
  to: (v: number | null) => v,
  from: (v: string | null) => (v == null ? null : Number(v)),
};

export type LineMode = 'EACH' | 'METER';

@Entity('transaction_items')
export class TransactionItem {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Transaction, (transaction) => transaction.transactionItems)
  @JoinColumn({ name: 'transaction_id' })
  transaction: Transaction;

  @ManyToOne(() => Item, (item) => item.transactionItems)
  @JoinColumn({ name: 'item_id' })
  item: Item;

  // EACH lines => quantity > 0, length_m = null, roll = null
  // METER lines => quantity usually 1, length_m > 0, roll may be set (recommended)
  @Column({ type: 'int', default: 0 })
  quantity: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 3,
    nullable: true,
    transformer: decimalTransformer,
  })
  length_m: number | null;

  @ManyToOne(() => Roll, (roll) => roll.transactionItems, { nullable: true })
  @JoinColumn({ name: 'roll_id' })
  roll: Roll | null;

  @Column({ type: 'enum', enum: ['EACH', 'METER'] })
  mode: LineMode;

  // unit price (per item OR per meter)
  @Column('decimal', {
    precision: 10,
    scale: 2,
    transformer: decimalTransformer,
  })
  price_each: number;

  @Column('decimal', {
    precision: 10,
    scale: 2,
    transformer: decimalTransformer,
    nullable: true,
  })
  cost_each: number | null;

  @OneToMany(
    () => TransactionItemUnit,
    (transactionItemUnit) => transactionItemUnit.transactionItem,
  )
  inventoryUnitLinks!: TransactionItemUnit[];
}
