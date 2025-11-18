import { MigrationInterface, QueryRunner } from 'typeorm';

export class MakeInventoryUnitRestockNullable1758330000000
  implements MigrationInterface
{
  name = 'MakeInventoryUnitRestockNullable1758330000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasColumn = await queryRunner.hasColumn(
      'inventory_units',
      'restock_item_id',
    );
    if (hasColumn) {
      await queryRunner.query(`
        ALTER TABLE inventory_units
        MODIFY restock_item_id INT NULL
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasColumn = await queryRunner.hasColumn(
      'inventory_units',
      'restock_item_id',
    );
    if (hasColumn) {
      await queryRunner.query(`
        ALTER TABLE inventory_units
        MODIFY restock_item_id INT NOT NULL
      `);
    }
  }
}
