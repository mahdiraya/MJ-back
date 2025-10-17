import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { Transaction } from './transaction.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  username: string;

  @Column()
  password_hash: string;

  @Column()
  name: string;

  @Column({
    type: 'enum',
    enum: ['cashier', 'manager', 'admin'],
    default: 'cashier',
  })
  role: 'cashier' | 'manager' | 'admin';

  @OneToMany(() => Transaction, (transaction) => transaction.user)
  transactions: Transaction[];
}
