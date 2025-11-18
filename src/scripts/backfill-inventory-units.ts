import 'reflect-metadata';
import { Repository } from 'typeorm';

import { AppDataSource } from '../data-source';
import { RestockItem } from '../entities/restock-item.entity';
import { InventoryUnit } from '../entities/inventory-unit.entity';
import { RestockRoll } from '../entities/restock-roll.entity';
import { generatePlaceholderBarcode } from '../inventory/inventory.utils';

const BATCH_SIZE = 100;

async function main() {
  await AppDataSource.initialize();
  try {
    const restockRepo = AppDataSource.getRepository(RestockItem);
    const unitRepo = AppDataSource.getRepository(InventoryUnit);
    const rollRepo = AppDataSource.getRepository(RestockRoll);

    const total = await restockRepo.count();
    let processed = 0;
    let created = 0;
    let offset = 0;

    while (true) {
      const chunk = await restockRepo.find({
        relations: ['item'],
        order: { id: 'ASC' },
        skip: offset,
        take: BATCH_SIZE,
      });
      if (!chunk.length) break;

      for (const restockItem of chunk) {
        processed += 1;
        created += await backfillUnitsForRestockItem(
          restockItem,
          unitRepo,
          rollRepo,
        );
      }

      offset += chunk.length;
      process.stdout.write(
        `\rProcessed ${processed}/${total} restock items...`,
      );
    }

    process.stdout.write('\n');
    console.log(`Backfill complete. Created ${created} inventory unit(s).`);
  } finally {
    await AppDataSource.destroy();
  }
}

async function backfillUnitsForRestockItem(
  restockItem: RestockItem,
  unitRepo: Repository<InventoryUnit>,
  rollRepo: Repository<RestockRoll>,
) {
  const itemId = restockItem.item?.id;
  if (!itemId) return 0;

  const costEach = Number(Number(restockItem.price_each ?? 0).toFixed(2));

  if (restockItem.mode === 'METER') {
    const rolls = await rollRepo.find({
      where: { restockItem: { id: restockItem.id } },
    });

    if (rolls.length) {
      let createdForRolls = 0;
      for (const roll of rolls) {
        const existing = await unitRepo.findOne({
          where: { roll: { id: roll.id } },
        });
        if (existing) continue;

        await unitRepo.save(
          unitRepo.create({
            item: { id: itemId } as any,
            restockItem: { id: restockItem.id } as any,
            roll: { id: roll.id } as any,
            barcode: generatePlaceholderBarcode(),
            isPlaceholder: true,
            status: 'available',
            costEach,
          }),
        );
        createdForRolls += 1;
      }
      if (createdForRolls > 0) {
        return createdForRolls;
      }
    }
  }

  const expectedUnits =
    restockItem.mode === 'EACH'
      ? Math.max(1, restockItem.quantity ?? 0)
      : Math.max(1, restockItem.quantity ?? 1);

  const existingCount = await unitRepo.count({
    where: { restockItem: { id: restockItem.id } },
  });
  const missing = expectedUnits - existingCount;
  if (missing <= 0) {
    return 0;
  }

  const payloads = Array.from({ length: missing }, () =>
    unitRepo.create({
      item: { id: itemId } as any,
      restockItem: { id: restockItem.id } as any,
      roll: null,
      barcode: generatePlaceholderBarcode(),
      isPlaceholder: true,
      status: 'available',
      costEach,
    }),
  );

  await unitRepo.save(payloads);
  return payloads.length;
}

main().catch((err) => {
  console.error('\nBackfill failed:', err);
  process.exit(1);
});
