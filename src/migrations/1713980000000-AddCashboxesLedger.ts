import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableColumn,
  TableForeignKey,
} from 'typeorm';

export class AddCashboxesLedger1713980000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'cashboxes',
        columns: [
          {
            name: 'id',
            type: 'int',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          {
            name: 'code',
            type: 'varchar',
            length: '50',
            isUnique: true,
          },
          {
            name: 'label',
            type: 'varchar',
            length: '120',
          },
          {
            name: 'is_active',
            type: 'tinyint',
            default: 1,
          },
          {
            name: 'created_at',
            type: 'datetime',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'datetime',
            default: 'CURRENT_TIMESTAMP',
            onUpdate: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'cashbox_entries',
        columns: [
          {
            name: 'id',
            type: 'int',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          {
            name: 'cashbox_id',
            type: 'int',
            isNullable: false,
          },
          {
            name: 'kind',
            type: 'enum',
            enum: ['payment', 'expense', 'income', 'transfer', 'adjustment'],
          },
          {
            name: 'direction',
            type: 'enum',
            enum: ['in', 'out'],
          },
          {
            name: 'amount',
            type: 'decimal',
            precision: 12,
            scale: 2,
          },
          {
            name: 'reference_type',
            type: 'varchar',
            length: '64',
            isNullable: true,
          },
          {
            name: 'reference_id',
            type: 'int',
            isNullable: true,
          },
          {
            name: 'payment_id',
            type: 'int',
            isNullable: true,
          },
          {
            name: 'meta',
            type: 'json',
            isNullable: true,
          },
          {
            name: 'note',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'occurred_at',
            type: 'datetime',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'datetime',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
    );

    await queryRunner.createForeignKeys('cashbox_entries', [
      new TableForeignKey({
        columnNames: ['cashbox_id'],
        referencedTableName: 'cashboxes',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
      new TableForeignKey({
        columnNames: ['payment_id'],
        referencedTableName: 'payments',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    ]);

    await queryRunner.addColumn(
      'payments',
      new TableColumn({
        name: 'cashbox_id',
        type: 'int',
        isNullable: true,
      }),
    );

    await queryRunner.createForeignKey(
      'payments',
      new TableForeignKey({
        columnNames: ['cashbox_id'],
        referencedTableName: 'cashboxes',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );

    await queryRunner.addColumns('restocks', [
      new TableColumn({
        name: 'status_manual_enabled',
        type: 'tinyint',
        isNullable: false,
        default: 0,
      }),
      new TableColumn({
        name: 'status_manual_value',
        type: 'enum',
        enum: ['PAID', 'PARTIAL', 'UNPAID'],
        isNullable: true,
      }),
      new TableColumn({
        name: 'status_manual_note',
        type: 'text',
        isNullable: true,
      }),
      new TableColumn({
        name: 'status_manual_set_at',
        type: 'datetime',
        isNullable: true,
      }),
    ]);

    await queryRunner.addColumns('transactions', [
      new TableColumn({
        name: 'status_manual_enabled',
        type: 'tinyint',
        isNullable: false,
        default: 0,
      }),
      new TableColumn({
        name: 'status_manual_value',
        type: 'enum',
        enum: ['PAID', 'PARTIAL', 'UNPAID'],
        isNullable: true,
      }),
      new TableColumn({
        name: 'status_manual_note',
        type: 'text',
        isNullable: true,
      }),
      new TableColumn({
        name: 'status_manual_set_at',
        type: 'datetime',
        isNullable: true,
      }),
    ]);

    await queryRunner.manager
      .createQueryBuilder()
      .insert()
      .into('cashboxes')
      .values([
        { code: 'A', label: 'Cashbox A', is_active: true },
        { code: 'B', label: 'Cashbox B', is_active: true },
        { code: 'C', label: 'Cashbox C', is_active: true },
      ])
      .orIgnore()
      .execute();
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const paymentsTable = await queryRunner.getTable('payments');
    const paymentsCashboxFk = paymentsTable?.foreignKeys.find((fk) =>
      fk.columnNames.includes('cashbox_id'),
    );
    if (paymentsCashboxFk) {
      await queryRunner.dropForeignKey('payments', paymentsCashboxFk);
    }
    await queryRunner.dropColumn('payments', 'cashbox_id');

    await queryRunner.dropColumns('transactions', [
      'status_manual_enabled',
      'status_manual_value',
      'status_manual_note',
      'status_manual_set_at',
    ]);

    await queryRunner.dropColumns('restocks', [
      'status_manual_enabled',
      'status_manual_value',
      'status_manual_note',
      'status_manual_set_at',
    ]);

    await queryRunner.dropTable('cashbox_entries');
    await queryRunner.dropTable('cashboxes');
  }
}
