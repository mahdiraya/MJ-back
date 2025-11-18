import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { TransactionItem } from './transaction-item.entity';
import { Roll } from './roll.entity';
import { InventoryUnit } from './inventory-unit.entity';

export type ItemCategory = 'internet' | 'solar' | 'camera' | 'satellite';
export type StockUnit = 'm' | null;

const decimalTransformer = {
  to: (value: number | null) => value,
  from: (value: string | null) => (value == null ? null : Number(value)),
};

@Entity('items')
export class Item {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 191, nullable: true, unique: true })
  sku: string | null;

  @Column({
    type: 'enum',
    enum: ['internet', 'solar', 'camera', 'satellite'],
    nullable: true,
  })
  category: ItemCategory | null;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 3,
    transformer: decimalTransformer,
  })
  stock: number;

  @Column({ type: 'enum', enum: ['m'], nullable: true, default: null })
  stockUnit: StockUnit;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  rollLength: number | null;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  priceRetail: number | null;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  priceWholesale: number | null;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    transformer: decimalTransformer,
  })
  price: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  photoUrl: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @OneToMany(() => Roll, (roll) => roll.item, { cascade: false })
  rolls: Roll[];

  @OneToMany(() => TransactionItem, (transactionItem) => transactionItem.item)
  transactionItems: TransactionItem[];

  @OneToMany(() => InventoryUnit, (unit) => unit.item)
  inventoryUnits: InventoryUnit[];
}
