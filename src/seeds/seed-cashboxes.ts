import { In } from 'typeorm';
import { AppDataSource } from '../data-source';
import { Cashbox } from '../entities/cashbox.entity';

async function main() {
  await AppDataSource.initialize();

  try {
    const repo = AppDataSource.getRepository(Cashbox);
    const defaults: Array<{ code: string; label: string }> = [
      { code: 'A', label: 'Cashbox A' },
      { code: 'B', label: 'Cashbox B' },
      { code: 'C', label: 'Cashbox C' },
    ];

    const existing = await repo.find({
      where: { code: In(defaults.map((d) => d.code)) },
    });
    const missingCodes = defaults
      .map((d) => d.code)
      .filter((code) => !existing.some((e) => e.code === code));

    if (missingCodes.length === 0) {
      console.log('Cashboxes already present. Nothing to seed.');
      return;
    }

    const toInsert = defaults.filter((d) =>
      missingCodes.includes(d.code),
    );

    await repo.insert(
      toInsert.map((d) => ({
        code: d.code,
        label: d.label,
        isActive: true,
      })),
    );

    console.log(
      `Seeded cashboxes: ${toInsert.map((d) => d.code).join(', ')}`,
    );
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((err) => {
  console.error('Failed to seed cashboxes', err);
  process.exitCode = 1;
});
