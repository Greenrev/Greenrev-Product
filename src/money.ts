/** Exact kobo arithmetic. Never use floating-point amounts for journal postings. */
import { Problem } from './errors.js';

const MAX_MINOR = 900_000_000_000_000n;
const TEN8 = 100_000_000n;
const DECIMAL = /^([+-]?)(\d+)(?:\.(\d+))?$/;

function parts(value: string | number | bigint): { negative: boolean; whole: bigint; fraction: string } {
  if (typeof value === 'boolean' || value === null || value === undefined) {
    throw new Problem('A finite decimal number is required');
  }
  const raw = String(value).trim();
  const m = DECIMAL.exec(raw);
  if (!m) throw new Problem('A finite decimal number is required');
  const negative = m[1] === '-';
  const whole = BigInt(m[2] ?? '0');
  const fraction = m[3] ?? '';
  if (whole > 1_000_000_000_000n) throw new Problem('A finite decimal number is required');
  return { negative, whole, fraction };
}

function fixed(value: string | number | bigint, scale: number, rejectPrecision = false): bigint {
  const n = parts(value);
  if (rejectPrecision && /[1-9]/.test(n.fraction.slice(scale))) {
    throw new Problem('Amount must be non-negative with at most two decimal places');
  }
  let result = n.whole * 10n ** BigInt(scale)
    + BigInt((n.fraction.slice(0, scale)).padEnd(scale, '0') || '0');
  if (!rejectPrecision && n.fraction.length > scale && Number(n.fraction[scale]) >= 5) {
    result += 1n;
  }
  return n.negative ? -result : result;
}

function safe(value: bigint): number {
  if (value > MAX_MINOR || value < -MAX_MINOR) {
    throw new Problem('Converted amount exceeds the supported transaction limit');
  }
  return Number(value);
}

function roundRatio(num: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Problem('Invalid division');
  const sign = num < 0n ? -1n : 1n;
  const a = num < 0n ? -num : num;
  return sign * ((a + denominator / 2n) / denominator);
}

export function minor(value: string | number | bigint, positive = false): number {
  const result = fixed(value, 2, true);
  if (result < 0n || (positive && result === 0n)) {
    throw new Problem('Amount must be non-negative with at most two decimal places');
  }
  return safe(result);
}

export function rate(value: string | number): string {
  const result = fixed(value, 8);
  if (result < 1n || result > 10_000_000n * TEN8) {
    throw new Problem('FX rate is outside the supported range');
  }
  const whole = result / TEN8;
  const dec = String(result % TEN8).padStart(8, '0');
  return String(whole) + '.' + dec;
}

export function convert(amountMinor: number, fx: string | number): number {
  const result = roundRatio(BigInt(amountMinor) * fixed(fx, 8), TEN8);
  if (result < 0n) throw new Problem('Converted amount exceeds the supported transaction limit');
  return safe(result);
}

export function proportional(total: number, part: number, whole: number): number {
  if (!whole) return 0;
  return safe(roundRatio(BigInt(total) * BigInt(part), BigInt(whole)));
}

export function basisPoints(value: string | number): number {
  const n = fixed(value, 2, true);
  if (n < 0n || n > 10_000n) {
    throw new Problem('Percentage must be between 0 and 100, with at most two decimals');
  }
  return Number(n);
}

export function integer(value: string | number, low: number, high: number): number {
  if (typeof value === 'boolean' || !/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value))
      || Number(value) < low || Number(value) > high) {
    throw new Problem('Integer between ' + low + ' and ' + high + ' required');
  }
  return Number(value);
}

export function cleanText(value: unknown, limit = 200, required = true): string {
  if (typeof value !== 'string' || value.trim().length > limit
      || (required && !value.trim()) || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)) {
    throw new Problem('Text required, maximum ' + limit + ' characters');
  }
  return value.trim();
}

export function isoDate(value?: string): string {
  const input = value || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) throw new Problem('Date must be YYYY-MM-DD');
  const d = new Date(input + 'T00:00:00.000Z');
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== input) {
    throw new Problem('Date must be YYYY-MM-DD');
  }
  return input;
}

export function monthAfter(day: string, offset: number): string {
  const d = new Date(isoDate(day) + 'T00:00:00.000Z');
  const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offset, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(),
    Math.min(d.getUTCDate(), lastDay))).toISOString().slice(0, 10);
}

export interface Due {
  due_date: string;
  principal_minor: number;
  finance_minor: number;
}

export function schedule(principal: number, fee: number, deposit: number, months: number,
  firstDue: string, today = isoDate()): Due[] {
  if (deposit < 0 || deposit > principal) throw new Problem('Deposit cannot exceed the principal');
  if (principal === deposit && fee) throw new Problem('Finance charge requires a financed balance');
  integer(months, 1, 60);
  const result: Due[] = deposit
    ? [{ due_date: isoDate(today), principal_minor: deposit, finance_minor: 0 }] : [];
  const rest = principal - deposit;
  for (let i = 0; i < months && (rest || fee); i++) {
    const p = Math.floor(rest / months) + (i < rest % months ? 1 : 0);
    const f = Math.floor(fee / months) + (i < fee % months ? 1 : 0);
    if (p + f) result.push({ due_date: monthAfter(firstDue, i), principal_minor: p, finance_minor: f });
  }
  return result;
}

export function ceilRatio(amount: number, numerator: number, denominator: number): number {
  if (denominator <= 0) throw new Problem('Invalid margin');
  return safe((BigInt(amount) * BigInt(numerator) + BigInt(denominator) - 1n) / BigInt(denominator));
}
