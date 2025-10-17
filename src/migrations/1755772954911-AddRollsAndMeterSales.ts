import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRollsAndMeterSales1724230000000 implements MigrationInterface {
  name = 'AddRollsAndMeterSales1724230000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`rolls\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`item_id\` int NOT NULL,
        \`length_m\` decimal(10,3) NOT NULL,
        \`remaining_m\` decimal(10,3) NOT NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        INDEX \`IDX_rolls_item_id\` (\`item_id\`),
        CONSTRAINT \`FK_rolls_item\` FOREIGN KEY (\`item_id\`) REFERENCES \`items\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      ALTER TABLE \`transaction_items\`
      ADD \`mode\` ENUM('EACH','METER') NOT NULL DEFAULT 'EACH'
    `);
    await queryRunner.query(`
      ALTER TABLE \`transaction_items\`
      ADD \`length_m\` decimal(10,3) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE \`transaction_items\`
      ADD \`roll_id\` int NULL
    `);
    await queryRunner.query(`
      ALTER TABLE \`transaction_items\`
      ADD CONSTRAINT \`FK_tx_items_roll\` FOREIGN KEY (\`roll_id\`) REFERENCES \`rolls\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`transaction_items\` DROP FOREIGN KEY \`FK_tx_items_roll\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`transaction_items\` DROP COLUMN \`roll_id\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`transaction_items\` DROP COLUMN \`length_m\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`transaction_items\` DROP COLUMN \`mode\``,
    );
    await queryRunner.query(`DROP TABLE \`rolls\``);
  }
}
