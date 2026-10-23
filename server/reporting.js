import {merchants} from './catalog.js';

export const timezone = 'Australia/Melbourne';
const formatter = new Intl.DateTimeFormat('en-AU', {
  timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', hourCycle: 'h23',
});
export function businessTime(value = new Date()) {
  const parts = Object.fromEntries(formatter.formatToParts(new Date(value)).map(p => [p.type, p.value]));
  return {day: `${parts.year}-${parts.month}-${parts.day}`, hour: parts.hour};
}
export function registerReporting(db) {
  db.function('business_day', {deterministic: true}, value => businessTime(value).day);
  db.function('business_hour', {deterministic: true}, value => businessTime(value).hour);
}
export function periodFor(question, at = new Date()) {
  const day = businessTime(at).day;
  if (/\byesterday\b/i.test(question)) {
    const previous = new Date(`${day}T12:00:00Z`);
    previous.setUTCDate(previous.getUTCDate() - 1);
    return {kind: 'day', value: previous.toISOString().slice(0, 10), label: 'yesterday'};
  }
  if (/\btoday\b/i.test(question)) return {kind: 'day', value: day, label: 'today'};
  if (/\blast month\b/i.test(question)) {
    const previous = new Date(`${day.slice(0, 7)}-01T12:00:00Z`);
    previous.setUTCMonth(previous.getUTCMonth() - 1);
    return {kind: 'month', value: previous.toISOString().slice(0, 7), label: 'last month'};
  }
  if (/\b(this month|month|monthly)\b/i.test(question)) return {kind: 'month', value: day.slice(0, 7), label: 'this month'};
  return {kind: 'all', value: '', label: 'all time'};
}

// All amounts and counts are aggregated by SQLite over the full requested scope.
// Display limits are applied only after aggregation, never to source transactions.
export function analytics(db, {merchantId, period = periodFor(''), summaryOnly = false} = {}) {
  const clauses = [], args = [];
  if (merchantId) {clauses.push('merchant_id=?'); args.push(merchantId);}
  if (period.kind === 'day') {clauses.push('business_day(created_at)=?'); args.push(period.value);}
  if (period.kind === 'month') {clauses.push('substr(business_day(created_at),1,7)=?'); args.push(period.value);}
  const scope = clauses.length ? clauses.join(' AND ') : '1=1';
  const paid = "status='CONFIRMED' AND receipt='POSTED'";
  const totals = db.prepare(`SELECT COUNT(*) attempts,
    COALESCE(SUM(CASE WHEN ${paid} THEN 1 ELSE 0 END),0) confirmed,
    COALESCE(SUM(CASE WHEN ${paid} THEN amount_cents ELSE 0 END),0) cents,
    COALESCE(SUM(CASE WHEN status IN ('FAILED','DECLINED','EXPIRED') THEN 1 ELSE 0 END),0) failed,
    COALESCE(SUM(CASE WHEN status='UNKNOWN' THEN 1 ELSE 0 END),0) unknown,
    COALESCE(SUM(CASE WHEN ${paid} AND settlement!='RECONCILED' THEN 1 ELSE 0 END),0) unreconciled,
    COALESCE(SUM(CASE WHEN ${paid} AND settlement!='RECONCILED' THEN amount_cents ELSE 0 END),0) unsettled_cents
    FROM transactions WHERE ${scope}`).get(...args);
  if (summaryOnly) return {totals, period, timezone};
  const group = (expression, condition = paid, order = 'amount_cents DESC, label') => db.prepare(
    `SELECT ${expression} label,COUNT(*) count,SUM(amount_cents) amount_cents FROM transactions
     WHERE ${scope} AND ${condition} GROUP BY ${expression} ORDER BY ${order}`
  ).all(...args);
  return {
    totals, period, timezone,
    merchants: group('merchant_id').map(r => ({...r, label: merchants.find(m => m.id === r.label)?.name || r.label})),
    methods: group('upper(method)'), products: group('item_index'),
    days: group('business_day(created_at)', paid, 'label DESC'),
    hours: group('business_hour(created_at)'),
    failures: group('status', "status IN ('FAILED','DECLINED','EXPIRED')"),
    outstanding: group('reference', `${paid} AND settlement!='RECONCILED'`),
  };
}
