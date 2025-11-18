import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTransactionItemCost1758310000000 implements MigrationInterface {
  name = 'AddTransactionItemCost1758310000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasCost = await queryRunner.hasColumn('transaction_items', 'cost_each');
    if (!hasCost) {
      await queryRunner.query(`
        ALTER TABLE transaction_items
        ADD COLUMN cost_each DECIMAL(10,2) NULL AFTER price_each
      `);
    }

    const hasLinkTable = await queryRunner.hasTable('transaction_item_units');
    if (!hasLinkTable) {
      await queryRunner.query(`
        CREATE TABLE transaction_item_units (
          id INT AUTO_INCREMENT PRIMARY KEY,
          transaction_item_id INT NOT NULL,
          inventory_unit_id INT NOT NULL,
          created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          CONSTRAINT FK_tiu_transaction_item
            FOREIGN KEY (transaction_item_id) REFERENCES transaction_items(id) ON DELETE CASCADE,
          CONSTRAINT FK_tiu_inventory_unit
            FOREIGN KEY (inventory_unit_id) REFERENCES inventory_units(id) ON DELETE CASCADE,
          CONSTRAINT UQ_tiu_inventory_unit UNIQUE (inventory_unit_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      await queryRunner.query(
        `CREATE INDEX IDX_tiu_transaction_item ON transaction_item_units (transaction_item_id)`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasLinkTable = await queryRunner.hasTable('transaction_item_units');
    if (hasLinkTable) {
      await queryRunner.query(`DROP TABLE transaction_item_units`);
    }

    const hasCost = await queryRunner.hasColumn('transaction_items', 'cost_each');
    if (hasCost) {
      await queryRunner.query(
        `ALTER TABLE transaction_items DROP COLUMN cost_each`,
      );
    }
  }
}
