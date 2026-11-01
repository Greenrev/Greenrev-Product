import test from 'node:test';
import assert from 'node:assert/strict';
import { journal, reports, reversal } from '../src/ledger.js';

test('journal rejects unbalanced/zero lines', () => {
  assert.throws(() => journal('A', 'BILL', '1', 'x', [['1000', 100, 0], ['2000', 0, 99]], '2026-01-01'));
  assert.throws(() => journal('A', 'BILL', '1', 'x', [['1000', 0, 0]], '2026-01-01'));
});
test('financial statements reconcile and reversals preserve provenance', () => {
  const first = journal('A', 'CAPITAL', '1', 'Owner capital',
    [['1000', 10000, 0], ['3000', 0, 10000]], '2026-01-01');
  const second = journal('A', 'OVERHEAD', '2', 'Office expense',
    [['6000', 1000, 0], ['2000', 0, 1000]], '2026-01-02');
  const r = reports('A', [first, second]);
  assert.equal(r.net_profit_minor, -1000);
  assert.equal(r.payable_minor, 1000);
  assert.equal(r.balance_check_minor, 0);
  const reversed = reports('A', [first, second, reversal(second, 'correction')]);
  assert.equal(reversed.net_profit_minor, 0);
  assert.equal(reversed.balance_check_minor, 0);
});
