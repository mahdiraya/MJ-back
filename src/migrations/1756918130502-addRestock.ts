import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRestockColumns1710000000000 implements MigrationInterface {
  name = 'AddRestockColumns1710000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // restock_items.price_each
    const hasPriceEach = await queryRunner.hasColumn(
      'restock_items',
      'price_each',
    );
    if (!hasPriceEach) {
      await queryRunner.query(`
        ALTER TABLE restock_items
        ADD COLUMN price_each DECIMAL(10,2) NOT NULL DEFAULT 0
      `);
    }

    // restocks monetary columns
    const restockColumns: Array<{ name: string; ddl: string }> = [
      {
        name: 'subtotal',
        ddl: `
          ALTER TABLE restocks
          ADD COLUMN subtotal DECIMAL(10,2) NOT NULL DEFAULT 0
        `,
      },
      {
        name: 'tax',
        ddl: `
          ALTER TABLE restocks
          ADD COLUMN tax DECIMAL(10,2) NOT NULL DEFAULT 0
        `,
      },
      {
        name: 'total',
        ddl: `
          ALTER TABLE restocks
          ADD COLUMN total DECIMAL(10,2) NOT NULL DEFAULT 0
        `,
      },
    ];

    for (const column of restockColumns) {
      const hasColumn = await queryRunner.hasColumn('restocks', column.name);
      if (!hasColumn) {
        await queryRunner.query(column.ddl);
      }
    }

    // restock_rolls table
    const hasRestockRolls = await queryRunner.hasTable('restock_rolls');
    if (!hasRestockRolls) {
      await queryRunner.query(`
        CREATE TABLE restock_rolls (
          id INT AUTO_INCREMENT PRIMARY KEY,
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
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasRestockRolls = await queryRunner.hasTable('restock_rolls');
    if (hasRestockRolls) {
      await queryRunner.query(`DROP TABLE restock_rolls`);
    }

    const restockColumns = ['total', 'tax', 'subtotal'];
    for (const name of restockColumns) {
      const hasColumn = await queryRunner.hasColumn('restocks', name);
      if (hasColumn) {
        await queryRunner.query(`ALTER TABLE restocks DROP COLUMN ${name}`);
      }
    }

    const hasPriceEach = await queryRunner.hasColumn(
      'restock_items',
      'price_each',
    );
    if (hasPriceEach) {
      await queryRunner.query(
        `ALTER TABLE restock_items DROP COLUMN price_each`,
      );
    }
  }
}
