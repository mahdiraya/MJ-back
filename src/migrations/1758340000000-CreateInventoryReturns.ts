import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateInventoryReturns1758340000000
  implements MigrationInterface
{
  name = 'CreateInventoryReturns1758340000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable('inventory_returns');
    if (!hasTable) {
      await queryRunner.query(`
        CREATE TABLE inventory_returns (
          id INT AUTO_INCREMENT PRIMARY KEY,
          inventory_unit_id INT NOT NULL UNIQUE,
          requestedOutcome ENUM('restock','defective') NOT NULL,
          status ENUM('pending','restocked','trashed','returned_to_supplier') NOT NULL DEFAULT 'pending',
          note TEXT NULL,
          supplier_id INT NULL,
          supplierNote TEXT NULL,
          resolvedAt DATETIME NULL,
          created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          CONSTRAINT FK_inventory_returns_unit
            FOREIGN KEY (inventory_unit_id) REFERENCES inventory_units(id) ON DELETE CASCADE,
          CONSTRAINT FK_inventory_returns_supplier
            FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable('inventory_returns');
    if (hasTable) {
      await queryRunner.query('DROP TABLE inventory_returns');
    }
  }
}
