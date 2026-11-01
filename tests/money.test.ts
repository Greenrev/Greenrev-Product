import test from 'node:test';
import assert from 'node:assert/strict';
import { basisPoints, convert, isoDate, minor, monthAfter, proportional, rate, schedule } from '../src/money.js';
import { estimate } from '../src/pricing.js';

test('money uses exact kobo and rejects fractional kobo', () => {
  assert.equal(minor('12345.67'), 1234567);
  assert.equal(minor('0.0100'), 1);
  assert.throws(() => minor('0.001'));
  assert.throws(() => minor('-1'));
  assert.throws(() => minor('1e4'));
  assert.throws(() => minor('0', true));
});
test('FX rates use eight decimals and half-up rounding', () => {
  assert.equal(rate('1500.123456789'), '1500.12345679');
  assert.equal(convert(101, '1.005'), 102);
  assert.equal(convert(100, '1500'), 150000);
  assert.throws(() => rate('0'));
  assert.throws(() => rate('10000001'));
});
test('percentage, proportional and calendar functions', () => {
  assert.equal(basisPoints('7.50'), 750);
  assert.equal(proportional(101, 1, 2), 51);
  assert.equal(monthAfter('2024-01-31', 1), '2024-02-29');
  assert.equal(monthAfter('2025-01-31', 1), '2025-02-28');
  assert.throws(() => isoDate('2025-02-29'));
});
test('instalment schedules allocate every kobo', () => {
  const items = schedule(10003, 1001, 3000, 3, '2026-11-30', '2026-10-30');
  assert.equal(items.length, 4);
  assert.equal(items.reduce((n, row) => n + row.principal_minor, 0), 10003);
  assert.equal(items.reduce((n, row) => n + row.finance_minor, 0), 1001);
  assert.equal(items.at(-1)?.due_date, '2027-01-30');
});
test('pricing matches a tax-exclusive target margin', () => {
  const result = estimate({ currency: 'USD', fx: '1500', purchase: '100',
    additional_costs: '1000', contingency_percent: '10', margin_percent: '20' });
  assert.equal(result.landed_minor, 16610000);
  assert.equal(result.recommended_price_minor, 20762500);
  assert.equal(result.estimated_profit_minor, 4152500);
  assert.throws(() => estimate({ purchase: '1', fx: '1', margin_percent: '100' }));
});
