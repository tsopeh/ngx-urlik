import { isEqual } from './is-equal';

describe('isEqual', () => {
  it('deeply compares supported state values including symbols, arrays, and dates', () => {
    const key = Symbol('key');
    const left = { nested: [1, { value: 'same' }], date: new Date(123), [key]: true };
    const right = { nested: [1, { value: 'same' }], date: new Date(123), [key]: true };
    expect(isEqual(left, right)).toBe(true);
    right.nested[1] = { value: 'different' };
    expect(isEqual(left, right)).toBe(false);
  });

  it('uses Object.is for primitives and requires matching prototypes', () => {
    expect(isEqual(Number.NaN, Number.NaN)).toBe(true);
    expect(isEqual(0, -0)).toBe(false);
    expect(isEqual(Object.create(null), {})).toBe(false);
  });
});
