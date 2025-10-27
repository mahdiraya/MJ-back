import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCreatedAtToPayments1757050000000
  implements MigrationInterface
{
  name = 'AddCreatedAtToPayments1757050000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`payments\`
      ADD \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`payments\` DROP COLUMN \`created_at\`
    `);
  }
}
