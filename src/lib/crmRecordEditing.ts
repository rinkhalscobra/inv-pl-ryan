export type CrmRecord = Record<string, unknown>;
export type CrmRecordForm = Record<string, string | boolean>;

const immutableFields = new Set(['id', 'user_id', 'referrer_id', 'referred_user_id', 'created_at', 'updated_at']);
const walletLedgerFields = new Set(['balance_effect', 'balance_processed_at', 'balance_reversed_at', 'tickets_processed']);
const processedWalletFields = new Set(['type', 'amount', 'currency', 'withdrawal_details']);

export function isCrmRecordFieldReadOnly(table: string, field: string, row: CrmRecord): boolean {
  return immutableFields.has(field) || (table === 'transactions' && (
    walletLedgerFields.has(field) || (Boolean(row.balance_processed_at) && processedWalletFields.has(field))
  ));
}

export function createCrmRecordForm(row: CrmRecord): CrmRecordForm {
  return Object.fromEntries(Object.entries(row)
    .filter(([key]) => !immutableFields.has(key))
    .map(([key, value]) => [key, typeof value === 'boolean' ? value
      : value !== null && typeof value === 'object' ? JSON.stringify(value, null, 2)
        : value === null || value === undefined ? '' : String(value)]));
}

export function buildCrmRecordChanges(table: string, row: CrmRecord, form: CrmRecordForm): CrmRecord {
  const changes: CrmRecord = {};
  const initial = createCrmRecordForm(row);
  for (const [key, value] of Object.entries(form)) {
    if (isCrmRecordFieldReadOnly(table, key, row) || value === initial[key]) continue;
    const original = row[key];
    if (typeof original === 'number') {
      if (value === '') changes[key] = null;
      else {
        const number = Number(value);
        if (!Number.isFinite(number)) throw new Error(`Enter a valid number for ${key.replace(/_/g, ' ')}.`);
        changes[key] = number;
      }
    } else if (typeof original === 'boolean') changes[key] = Boolean(value);
    else if (original !== null && typeof original === 'object') {
      try { changes[key] = value === '' ? null : JSON.parse(String(value)); }
      catch { throw new Error(`Enter valid JSON for ${key.replace(/_/g, ' ')}.`); }
    } else changes[key] = value === '' && original === null ? null : value;
  }
  return changes;
}
