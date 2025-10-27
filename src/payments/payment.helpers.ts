import { EntityManager } from 'typeorm';
import { Cashbox } from '../entities/cashbox.entity';

export type ManualStatusState<T extends string> = {
  enabled: boolean;
  value: T | null;
  note: string | null;
};

export function normalizeReceiptStatus<T extends string>(
  value: any,
  allowed: readonly T[],
): T | null {
  if (value == null) return null;
  const upper = String(value).trim().toUpperCase() as T;
  return allowed.includes(upper) ? upper : null;
}

export function extractManualStatus<T extends string>(
  dto: Record<string, any>,
  allowed: readonly T[],
): ManualStatusState<T> {
  const raw =
    dto.statusManualValue ??
    dto.statusOverride ??
    dto.status ??
    dto.manualStatus ??
    null;

  const normalized = normalizeReceiptStatus(raw, allowed);
  const noteCandidate =
    dto.statusOverrideNote ??
    dto.statusManualNote ??
    dto.manualStatusNote ??
    null;
  const note =
    typeof noteCandidate === 'string' && noteCandidate.trim().length > 0
      ? noteCandidate.trim()
      : null;

  return {
    enabled: normalized != null,
    value: normalized,
    note,
  };
}

export async function resolveCashboxFromDto(
  manager: EntityManager,
  dto: Record<string, any>,
): Promise<Cashbox | null> {
  const repo = manager.getRepository(Cashbox);

  if (
    dto.cashbox != null &&
    dto.cashboxId == null &&
    dto.cashboxCode == null
  ) {
    if (typeof dto.cashbox === 'number') {
      dto.cashboxId = Number(dto.cashbox);
    } else if (typeof dto.cashbox === 'string') {
      dto.cashboxCode = dto.cashbox;
    }
  }

  if (dto.cashboxId != null) {
    const id = Number(dto.cashboxId);
    if (!Number.isNaN(id) && id > 0) {
      const found = await repo.findOne({ where: { id } });
      if (found) return found;
    }
  }

  const codeCandidate =
    dto.cashboxCode ?? dto.cashbox_label ?? dto.cashboxCode ?? dto.cashbox;
  if (codeCandidate != null) {
    const code = String(codeCandidate).trim().toUpperCase();
    if (code.length > 0) {
      const found = await repo.findOne({ where: { code } });
      if (found) return found;
    }
  }

  return null;
}

export function computeReceiptStatus<T extends string>(
  paid: number,
  total: number,
  manual: ManualStatusState<T>,
  roundFn: (n: number) => number,
  allowed: readonly T[],
): T {
  const roundedPaid = roundFn(paid);
  const roundedTotal = roundFn(total);
  const paidStatus =
    allowed.find((v) => v === ('PAID' as unknown as T)) ?? allowed[0];
  const partialStatus =
    allowed.find((v) => v === ('PARTIAL' as unknown as T)) ??
    allowed.find((v) => v !== paidStatus) ??
    allowed[0];
  const unpaidStatus =
    allowed.find((v) => v === ('UNPAID' as unknown as T)) ??
    allowed.find((v) => v !== paidStatus && v !== partialStatus) ??
    allowed[0];

  const derived =
    roundedPaid >= roundedTotal
      ? paidStatus
      : roundedPaid > 0
        ? partialStatus
        : unpaidStatus;

  if (manual.enabled && manual.value && allowed.includes(manual.value)) {
    return manual.value;
  }

  return derived;
}
