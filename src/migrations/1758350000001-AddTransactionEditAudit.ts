import {
  MigrationInterface,
  QueryRunner,
  TableColumn,
  TableForeignKey,
} from 'typeorm';

export class AddTransactionEditAudit1758350000001
  implements MigrationInterface
{
  name = 'AddTransactionEditAudit1758350000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('transactions');
    if (table && !table.findColumnByName('last_edit_note')) {
      await queryRunner.addColumn(
        'transactions',
        new TableColumn({
          name: 'last_edit_note',
          type: 'text',
          isNullable: true,
        }),
      );
    }
    if (table && !table.findColumnByName('last_edit_at')) {
      await queryRunner.addColumn(
        'transactions',
        new TableColumn({
          name: 'last_edit_at',
          type: 'datetime',
          isNullable: true,
        }),
      );
    }
    if (table && !table.findColumnByName('last_edit_user_id')) {
      await queryRunner.addColumn(
        'transactions',
        new TableColumn({
          name: 'last_edit_user_id',
          type: 'int',
          isNullable: true,
        }),
      );
      await queryRunner.createForeignKey(
        'transactions',
        new TableForeignKey({
          columnNames: ['last_edit_user_id'],
          referencedTableName: 'users',
          referencedColumnNames: ['id'],
          onDelete: 'SET NULL',
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('transactions');
    if (table) {
      const fk = table.foreignKeys.find((key) =>
        key.columnNames.includes('last_edit_user_id'),
      );
      if (fk) {
        await queryRunner.dropForeignKey('transactions', fk);
      }
    }
    await queryRunner.dropColumn('transactions', 'last_edit_user_id');
    await queryRunner.dropColumn('transactions', 'last_edit_note');
    await queryRunner.dropColumn('transactions', 'last_edit_at');
  }
}
