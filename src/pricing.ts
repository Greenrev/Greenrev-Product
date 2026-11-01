import { Problem } from './errors.js';
import { basisPoints, ceilRatio, convert, minor, proportional, rate } from './money.js';

const CURRENCIES = new Set(['NGN', 'USD', 'GBP', 'EUR', 'CAD', 'AED', 'CNY']);
export interface EstimateInput {
  currency?: string;
  fx?: string;
  purchase: string;
  additional_costs?: string;
  bank_fees?: string;
  contingency_percent?: string;
  margin_percent?: string;
}

export function estimate(input: EstimateInput) {
  const currency = input.currency ?? 'USD';
  if (!CURRENCIES.has(currency)) throw new Problem('Unsupported currency');
  const fx = currency === 'NGN' ? '1.00000000' : rate(input.fx ?? '');
  const purchase = convert(minor(input.purchase, true), fx);
  const costs = minor(input.additional_costs ?? '0') + minor(input.bank_fees ?? '0');
  const contingency = proportional(purchase + costs,
    basisPoints(input.contingency_percent ?? '0'), 10_000);
  const landed = purchase + costs + contingency;
  const margin = basisPoints(input.margin_percent ?? '15');
  if (margin === 10_000) throw new Problem('A target margin of 100% has no finite selling price');
  const price = ceilRatio(landed, 10_000, 10_000 - margin);
  return {
    landed_minor: landed, contingency_minor: contingency,
    recommended_price_minor: price, estimated_profit_minor: price - landed,
    target_margin_bps: margin, fx, indicative: true,
    message: 'Tax-exclusive estimate. Bank charges, taxes and costs are only those entered; this is not an execution quote or a recorded purchase.'
  };
}
