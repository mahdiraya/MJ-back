import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Item } from './item.entity';
import { RestockItem } from './restock-item.entity';
import { Roll } from './roll.entity';
import { TransactionItemUnit } from './transaction-item-unit.entity';
import { InventoryReturn } from './inventory-return.entity';

const decimalTransformer = {
  to: (value: number | null) => value,
  from: (value: string | null) => (value == null ? 0 : Number(value)),
};

export type InventoryUnitStatus =
  | 'available'
  | 'reserved'
  | 'sold'
  | 'returned'
  | 'defective';

@Entity('inventory_units')
export class InventoryUnit {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Item, (item) => item.inventoryUnits, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'item_id' })
  item!: Item;

  @ManyToOne(() => RestockItem, (ri) => ri.inventoryUnits, {
    onDelete: 'CASCADE',
    nullable: true,
  })
  @JoinColumn({ name: 'restock_item_id' })
  restockItem!: RestockItem | null;

  @ManyToOne(() => Roll, (roll) => roll.inventoryUnits, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'roll_id' })
  roll!: Roll | null;

  @Column({ type: 'varchar', length: 191, nullable: true, unique: true })
  barcode!: string | null;

  @Column({ name: 'is_placeholder', type: 'boolean', default: true })
  isPlaceholder!: boolean;

  @Column({
    type: 'enum',
    enum: ['available', 'reserved', 'sold', 'returned', 'defective'],
    default: 'available',
  })
  status!: InventoryUnitStatus;

  @Column({
    name: 'cost_each',
    type: 'decimal',
    precision: 10,
    scale: 2,
    transformer: decimalTransformer,
    default: 0,
  })
  costEach!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @OneToMany(() => TransactionItemUnit, (link) => link.inventoryUnit)
  transactionItemLinks!: TransactionItemUnit[];

  @OneToMany(() => InventoryReturn, (ret) => ret.inventoryUnit)
  returns!: InventoryReturn[];
}
