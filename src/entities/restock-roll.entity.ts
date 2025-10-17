import {
  Column,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  JoinColumn,
} from 'typeorm';
import { RestockItem } from './restock-item.entity';
import { Roll } from './roll.entity';

const d3 = {
  to: (v: number | null) => v,
  from: (v: string | null) => (v == null ? null : Number(v)),
};

@Entity('restock_rolls')
export class RestockRoll {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => RestockItem, (ri) => ri.rolls, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'restock_item_id' })
  restockItem!: RestockItem;

  @ManyToOne(() => Roll, { nullable: false })
  @JoinColumn({ name: 'roll_id' })
  roll!: Roll;

  @Column({ type: 'decimal', precision: 10, scale: 3, transformer: d3 })
  length_m!: number;
}
