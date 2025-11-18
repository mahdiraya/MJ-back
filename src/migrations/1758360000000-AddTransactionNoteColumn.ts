import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTransactionNoteColumn1758360000000
  implements MigrationInterface
{
  name = 'AddTransactionNoteColumn1758360000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('transactions');
    const hasColumn = table?.findColumnByName('note');
    if (!hasColumn) {
      await queryRunner.query(
        'ALTER TABLE `transactions` ADD COLUMN `note` text NULL',
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('transactions');
    const hasColumn = table?.findColumnByName('note');
    if (hasColumn) {
      await queryRunner.query(
        'ALTER TABLE `transactions` DROP COLUMN `note`',
      );
    }
  }
}
