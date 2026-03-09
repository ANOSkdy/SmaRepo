import 'server-only';

import { query } from '@/lib/db';
import { hasDatabaseUrl } from '@/lib/server-env';

type InventoryQueryRow = Record<string, unknown>;

export async function inventoryQuery<T extends InventoryQueryRow = InventoryQueryRow>(text: string, params: unknown[] = []) {
  if (!hasDatabaseUrl()) {
    throw new Error('DB env missing');
  }

  return query<T>(text, params);
}
