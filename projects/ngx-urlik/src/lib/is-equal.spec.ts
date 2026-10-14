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

  it('compares deeply nested arrays of objects and arrays', () => {
    const left = {
      groups: [
        { name: 'admin', users: [{ id: 1, roles: ['read', 'write'] }] },
        { name: 'guest', users: [] },
      ],
    };
    expect(isEqual(left, structuredClone(left))).toBe(true);
    expect(
      isEqual(left, {
        groups: [
          { name: 'admin', users: [{ id: 1, roles: ['write', 'read'] }] },
          { name: 'guest', users: [] },
        ],
      }),
    ).toBe(false);
  });

  it('compares enumerable symbol properties at every depth', () => {
    const symbol = Symbol('nested');
    expect(isEqual({ value: { [symbol]: [1, 2] } }, { value: { [symbol]: [1, 2] } })).toBe(true);
    expect(isEqual({ value: { [symbol]: [1, 2] } }, { value: { [symbol]: [2, 1] } })).toBe(false);
  });

  it('compares invalid dates consistently and ignores non-enumerable properties', () => {
    expect(isEqual(new Date(Number.NaN), new Date(Number.NaN))).toBe(false);
    const left = { visible: true };
    const right = { visible: true };
    Object.defineProperty(left, 'hidden', { value: 1 });
    Object.defineProperty(right, 'hidden', { value: 2 });
    expect(isEqual(left, right)).toBe(true);
  });

  it('compares map entries and set members', () => {
    expect(isEqual(new Map([['a', [1]]]), new Map([['a', [1]]]))).toBe(true);
    expect(isEqual(new Map([['a', 1]]), new Map())).toBe(false);
    expect(isEqual(new Map([['a', 1]]), new Map([['a', 2]]))).toBe(false);
    expect(isEqual(new Set([1, 2]), new Set([2, 1]))).toBe(true);
    expect(isEqual(new Set([1]), new Set())).toBe(false);
    expect(isEqual(new Set([{ id: 1 }, { id: 1 }]), new Set([{ id: 1 }, { id: 2 }]))).toBe(false);
    expect(isEqual(new Set([{ id: 1 }, { id: 2 }]), new Set([{ id: 2 }, { id: 1 }]))).toBe(true);
  });

  it('compares cyclic values without overflowing', () => {
    type Node = { id: number; next?: Node };
    const left: Node = { id: 1 };
    left.next = left;
    const right: Node = { id: 1 };
    right.next = right;
    const other: Node = { id: 1, next: { id: 2 } };
    expect(isEqual(left, right)).toBe(true);
    expect(isEqual(left, other)).toBe(false);
  });
});
