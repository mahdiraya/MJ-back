import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddItemPriceTiersAndImage1724470000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('items');

    const has = (n: string) => table?.findColumnByName(n);

    if (!has('priceRetail')) {
      await queryRunner.addColumn(
        'items',
        new TableColumn({
          name: 'priceRetail',
          type: 'decimal',
          precision: 10,
          scale: 2,
          isNullable: true,
        }),
      );
    }

    if (!has('priceWholesale')) {
      await queryRunner.addColumn(
        'items',
        new TableColumn({
          name: 'priceWholesale',
          type: 'decimal',
          precision: 10,
          scale: 2,
          isNullable: true,
        }),
      );
    }

    if (!has('imageUrl')) {
      await queryRunner.addColumn(
        'items',
        new TableColumn({
          name: 'imageUrl',
          type: 'varchar',
          length: '500',
          isNullable: true,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('items');
    const dropIf = async (name: string) => {
      if (table?.findColumnByName(name))
        await queryRunner.dropColumn('items', name);
    };
    await dropIf('imageUrl');
    await dropIf('priceWholesale');
    await dropIf('priceRetail');
  }
}
