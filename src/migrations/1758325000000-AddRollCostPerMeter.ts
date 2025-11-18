import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRollCostPerMeter1758325000000 implements MigrationInterface {
  name = 'AddRollCostPerMeter1758325000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasColumn = await queryRunner.hasColumn('rolls', 'cost_per_meter');
    if (!hasColumn) {
      await queryRunner.query(`
        ALTER TABLE rolls
        ADD COLUMN cost_per_meter DECIMAL(10,2) NULL
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasColumn = await queryRunner.hasColumn('rolls', 'cost_per_meter');
    if (hasColumn) {
      await queryRunner.query(
        `ALTER TABLE rolls DROP COLUMN cost_per_meter`,
      );
    }
  }
}
