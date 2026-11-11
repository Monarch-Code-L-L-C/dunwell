// Quick-job credits. Two pools:
//   purchase : bought for one specific job, never expires
//   allowance: a plan's monthly allowance, usable on any job, resets each calendar month (UTC)

export type LedgerRow = { delta: number; job: string | null; source: 'purchase' | 'allowance'; createdAt: string };

export function purchasedLeft(rows: LedgerRow[], job: string): number {
  let n = 0;
  for (const r of rows) if (r.source === 'purchase' && r.job === job) n += r.delta;
  return Math.max(0, n);
}

export function allowanceLeft(rows: LedgerRow[], monthlyAllowance: number, now: Date = new Date()): number {
  const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  let used = 0;
  for (const r of rows) {
    if (r.source === 'allowance' && r.delta < 0 && new Date(r.createdAt).getTime() >= monthStart) used -= r.delta;
  }
  return Math.max(0, monthlyAllowance - used);
}
