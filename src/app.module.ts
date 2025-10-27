import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { UsersModule } from './users/users.module';
import { CustomersModule } from './customers/customers.module';
import { ItemsModule } from './items/items.module';
import { TransactionsModule } from './transactions/transactions.module';
import { TransactionItemsModule } from './transaction-items/transaction-items.module';
import { AuthModule } from './auth/auth.module';
import { RollsModule } from './rolls/rolls.module';
import { join } from 'path';
import { ServeStaticModule } from '@nestjs/serve-static';
import { RestocksModule } from './restocks/restocks.module';
import { ReceiptsModule } from './receipts/receipts.module';
import { StatsModule } from './stats/stats.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { CashboxesModule } from './cashboxes/cashboxes.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'uploads'),
      serveRoot: '/uploads',
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'mysql',
        host: config.get('DB_HOST'),
        port: +config.get('DB_PORT'),
        username: config.get('DB_USERNAME'),
        password: config.get('DB_PASSWORD'),
        database: config.get('DB_DATABASE'),
        autoLoadEntities: true,
        synchronize: false,
      }),
    }),
    UsersModule,
    CustomersModule,
    ItemsModule,
    TransactionsModule,
    TransactionItemsModule,
    AuthModule,
    RollsModule,
    RestocksModule,
    ReceiptsModule,
    StatsModule,
    SuppliersModule,
    CashboxesModule,
  ],
})
export class AppModule {}
