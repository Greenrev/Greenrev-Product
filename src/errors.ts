export class Problem extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = 'Problem';
  }
}

export function requireCondition(value: unknown, message: string, status = 400): asserts value {
  if (!value) throw new Problem(message, status);
}
