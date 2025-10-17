import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRetailWholesalePrices1724240000000
  implements MigrationInterface
{
  name = 'AddRetailWholesalePrices1724240000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`items\`
      ADD \`priceRetail\` decimal(10,2) NULL,
      ADD \`priceWholesale\` decimal(10,2) NULL
    `);

    // Backfill: set priceRetail = legacy price
    await queryRunner.query(`
      UPDATE \`items\`
      SET \`priceRetail\` = \`price\`
      WHERE \`priceRetail\` IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`items\` DROP COLUMN \`priceWholesale\`
    `);
    await queryRunner.query(`
      ALTER TABLE \`items\` DROP COLUMN \`priceRetail\`
    `);
  }
}
