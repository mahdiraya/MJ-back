import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { InventoryUnit } from './inventory-unit.entity';
import { Supplier } from './supplier.entity';

export type ReturnStatus =
  | 'pending'
  | 'restocked'
  | 'trashed'
  | 'returned_to_supplier';

@Entity('inventory_returns')
export class InventoryReturn {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => InventoryUnit, (unit) => unit.returns, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'inventory_unit_id' })
  inventoryUnit!: InventoryUnit;

  @Column({
    type: 'enum',
    enum: ['restock', 'defective'],
  })
  requestedOutcome!: 'restock' | 'defective';

  @Column({
    type: 'enum',
    enum: ['pending', 'restocked', 'trashed', 'returned_to_supplier'],
    default: 'pending',
  })
  status!: ReturnStatus;

  @Column({ type: 'text', nullable: true })
  note!: string | null;

  @ManyToOne(() => Supplier, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'supplier_id' })
  supplier!: Supplier | null;

  @Column({ type: 'text', nullable: true })
  supplierNote!: string | null;

  @Column({ type: 'datetime', nullable: true })
  resolvedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
