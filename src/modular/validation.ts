import { randomUUID } from 'node:crypto';
import { Problem, requireCondition as check } from '../errors.js';
import { cleanText, integer, isoDate, minor } from '../money.js';
import { MODULES, type BusinessModule, type Input } from './model.js';

export const id = (prefix: string) => prefix + '-' + randomUUID();
export function text(d: Input, key: string, fallback?: string, limit = 200): string {
  return cleanText(d[key] ?? fallback, limit, fallback === undefined);
}
export function count(d: Input, key: string, min = 0, max = 1_000_000, fallback?: number): number {
  const value = d[key] ?? fallback;
  check(typeof value === 'string' || typeof value === 'number', key + ' must be an integer');
  return integer(value, min, max);
}
export function money(d: Input, key: string, fallback = '0', positive = false): number {
  const value = d[key] ?? fallback;
  check(typeof value === 'string', key + ' must be a decimal string in naira');
  return minor(value, positive);
}
export function object(value: unknown, label: string): Input {
  check(!!value && typeof value === 'object' && !Array.isArray(value), label + ' must be an object');
  return value as Input;
}
export function modules(value: unknown): BusinessModule[] {
  check(Array.isArray(value) && value.length > 0 && value.length <= MODULES.length,
    'Select at least one available business module');
  check(value.every(x => MODULES.includes(x as BusinessModule)), 'Unknown or unavailable module (auctions are not released)');
  check(new Set(value).size === value.length, 'Modules must be unique');
  return MODULES.filter(m => value.includes(m));
}
export function moduleCode(value: unknown): BusinessModule {
  check(MODULES.includes(value as BusinessModule), 'Select an available module');
  return value as BusinessModule;
}
export function timestamp(value: unknown): string {
  check(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}.*(?:Z|[+-]\d{2}:\d{2})$/.test(value),
    'Use an ISO date/time including timezone');
  const date = new Date(value);
  check(Number.isFinite(date.getTime()), 'Invalid date/time');
  isoDate(value.slice(0, 10));
  check(Number(value.slice(11, 13)) < 24 && Number(value.slice(14, 16)) < 60, 'Invalid date/time');
  return date.toISOString();
}
export function period(d: Input, now: string): [string, string] {
  const start = timestamp(d.start_at), end = timestamp(d.end_at);
  check(end > start && end > now && Date.parse(start) >= Date.parse(now) - 15 * 60000,
    'End must follow start; walk-in start times may be at most 15 minutes earlier');
  check(Date.parse(end) - Date.parse(start) <= 366 * 86400000, 'Schedule cannot exceed 366 days');
  return [start, end];
}
export function vin(value: unknown): string {
  const result = cleanText(value, 17).toUpperCase();
  check(/^[A-HJ-NPR-Z0-9]{17}$/.test(result), 'Use a 17-character VIN without I, O or Q');
  return result;
}
export function version(current: { version: number }, d: Input): void {
  check(d.version === current.version, 'Record changed; refresh before trying again', 409);
}
export function safeSum(values: readonly number[]): number {
  const sum = values.reduce((a, b) => a + BigInt(b), 0n);
  check(sum >= 0n && sum <= 900_000_000_000_000n, 'Total exceeds the supported amount');
  return Number(sum);
}
export function found<T>(value: T | undefined): T {
  if (!value) throw new Problem('Record not found', 404);
  return value;
}
