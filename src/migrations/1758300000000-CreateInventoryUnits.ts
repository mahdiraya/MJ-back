import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateInventoryUnits1758300000000 implements MigrationInterface {
  name = 'CreateInventoryUnits1758300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable('inventory_units');
    if (!hasTable) {
      await queryRunner.query(`
        CREATE TABLE inventory_units (
          id INT AUTO_INCREMENT PRIMARY KEY,
          item_id INT NOT NULL,
          restock_item_id INT NOT NULL,
          roll_id INT NULL,
          barcode VARCHAR(191) NULL UNIQUE,
          is_placeholder TINYINT(1) NOT NULL DEFAULT 1,
          status ENUM('available','reserved','sold','returned','defective') NOT NULL DEFAULT 'available',
          cost_each DECIMAL(10,2) NOT NULL DEFAULT 0,
          created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          CONSTRAINT FK_inventory_units_item
            FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
          CONSTRAINT FK_inventory_units_restock_item
            FOREIGN KEY (restock_item_id) REFERENCES restock_items(id) ON DELETE CASCADE,
          CONSTRAINT FK_inventory_units_roll
            FOREIGN KEY (roll_id) REFERENCES rolls(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      await queryRunner.query(
        `CREATE INDEX IDX_inventory_units_item ON inventory_units (item_id)`,
      );
      await queryRunner.query(
        `CREATE INDEX IDX_inventory_units_restock_item ON inventory_units (restock_item_id)`,
      );
      await queryRunner.query(
        `CREATE INDEX IDX_inventory_units_roll ON inventory_units (roll_id)`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable('inventory_units');
    if (hasTable) {
      await queryRunner.query(`DROP TABLE inventory_units`);
    }
  }
}
