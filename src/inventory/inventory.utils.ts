import { randomUUID } from 'crypto';

/**
 * Generate a deterministic-length placeholder barcode that can be
 * overwritten later when the real barcode is scanned.
 */
export function generatePlaceholderBarcode(prefix = 'AUTO') {
  const raw = `${prefix}-${randomUUID()}`;
  return raw.length > 191 ? raw.slice(0, 191) : raw;
}
