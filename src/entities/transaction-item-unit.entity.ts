import { Entity, PrimaryGeneratedColumn, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { TransactionItem } from './transaction-item.entity';
import { InventoryUnit } from './inventory-unit.entity';

@Entity('transaction_item_units')
@Unique(['inventoryUnit'])
export class TransactionItemUnit {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(
    () => TransactionItem,
    (transactionItem) => transactionItem.inventoryUnitLinks,
    { onDelete: 'CASCADE' },
  )
  @JoinColumn({ name: 'transaction_item_id' })
  transactionItem!: TransactionItem;

  @ManyToOne(
    () => InventoryUnit,
    (inventoryUnit) => inventoryUnit.transactionItemLinks,
    { onDelete: 'CASCADE' },
  )
  @JoinColumn({ name: 'inventory_unit_id' })
  inventoryUnit!: InventoryUnit;
}
