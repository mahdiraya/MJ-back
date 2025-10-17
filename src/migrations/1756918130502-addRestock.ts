// src/migrations/1710000000000-add-restock-columns.ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRestockColumns1710000000000 implements MigrationInterface {
  name = 'AddRestockColumns1710000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // restock_items.price_each
    await queryRunner.query(
      `ALTER TABLE restock_items ADD COLUMN price_each DECIMAL(10,2) NOT NULL DEFAULT 0`,
    );

    // restocks money columns
    await queryRunner.query(
      `ALTER TABLE restocks ADD COLUMN subtotal DECIMAL(10,2) NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE restocks ADD COLUMN tax DECIMAL(10,2) NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE restocks ADD COLUMN total DECIMAL(10,2) NOT NULL DEFAULT 0`,
    );

    // restock_rolls table (if you don’t already have a migration that created it)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS restock_rolls (
        id INT AUTO_INCREMENT PRIMARY KEY,sks
        restock_item_id INT NOT NULL,
        roll_id INT NOT NULL,
        length_m DECIMAL(10,3) NOT NULL,
        CONSTRAINT FK_restock_rolls__restock_item
          FOREIGN KEY (restock_item_id) REFERENCES restock_items(id) ON DELETE CASCADE,
        CONSTRAINT FK_restock_rolls__roll
          FOREIGN KEY (roll_id) REFERENCES rolls(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Rolling back — adjust to your needs
    await queryRunner.query(`DROP TABLE IF EXISTS restock_rolls`);
    await queryRunner.query(`ALTER TABLE restocks DROP COLUMN total`);
    await queryRunner.query(`ALTER TABLE restocks DROP COLUMN tax`);
    await queryRunner.query(`ALTER TABLE restocks DROP COLUMN subtotal`);
    await queryRunner.query(`ALTER TABLE restock_items DROP COLUMN price_each`);
  }
}
