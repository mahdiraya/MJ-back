import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  JoinColumn,
} from 'typeorm';
import { Item } from './item.entity';
import { TransactionItem } from './transaction-item.entity';
import { InventoryUnit } from './inventory-unit.entity';

const decimalTransformer = {
  to: (v: number | null) => v,
  from: (v: string | null) => (v == null ? null : Number(v)),
};

@Entity('rolls')
export class Roll {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Item, (item) => item.rolls, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'item_id' })
  item: Item;

  // Original roll length (meters)
  @Column({
    type: 'decimal',
    precision: 10,
    scale: 3,
    transformer: decimalTransformer,
  })
  length_m: number;

  // Remaining length (meters) — decremented on meter sales
  @Column({
    type: 'decimal',
    precision: 10,
    scale: 3,
    transformer: decimalTransformer,
  })
  remaining_m: number;

  @CreateDateColumn({ type: 'datetime' })
  created_at: Date;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  cost_per_meter: number | null;

  @OneToMany(() => TransactionItem, (ti) => ti.roll)
  transactionItems: TransactionItem[];

  @OneToMany(() => InventoryUnit, (unit) => unit.roll)
  inventoryUnits: InventoryUnit[];
}
