/**
 * Compares values deeply. Primitives use `Object.is`, prototypes must match, dates compare by time,
 * maps by entries, sets by members, and other objects by their enumerable own keys.
 */
export function isEqual<T>(left: T, right: T): boolean {
  return equal(left, right, new Map());
}

function equal(left: unknown, right: unknown, comparing: Map<object, Set<object>>): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== 'object' || left === null || typeof right !== 'object' || right === null)
    return false;
  if (Object.getPrototypeOf(left) !== Object.getPrototypeOf(right)) return false;
  if (left instanceof Date && right instanceof Date) return left.getTime() === right.getTime();
  // A pair already under comparison is assumed equal; the rest of the comparison decides.
  const partners = comparing.get(left) ?? new Set<object>();
  if (partners.has(right)) return true;
  comparing.set(left, partners.add(right));
  try {
    return equalCollections(left, right, comparing) && equalKeys(left, right, comparing);
  } finally {
    partners.delete(right);
  }
}

function equalCollections(
  left: object,
  right: object,
  comparing: Map<object, Set<object>>,
): boolean {
  if (left instanceof Map && right instanceof Map) {
    if (left.size !== right.size) return false;
    for (const [key, value] of left)
      if (!right.has(key) || !equal(value, right.get(key), comparing)) return false;
  }
  if (left instanceof Set && right instanceof Set) {
    if (left.size !== right.size) return false;
    const unmatched = [...right];
    for (const member of left) {
      const index = unmatched.findIndex((candidate) => equal(member, candidate, comparing));
      if (index === -1) return false;
      unmatched.splice(index, 1);
    }
  }
  return true;
}

function equalKeys(left: object, right: object, comparing: Map<object, Set<object>>): boolean {
  const leftKeys = Reflect.ownKeys(left).filter((key) =>
    Object.prototype.propertyIsEnumerable.call(left, key),
  );
  const rightKeys = Reflect.ownKeys(right).filter((key) =>
    Object.prototype.propertyIsEnumerable.call(right, key),
  );
  if (leftKeys.length !== rightKeys.length || leftKeys.some((key) => !rightKeys.includes(key)))
    return false;
  return leftKeys.every((key) =>
    equal(
      (left as Record<PropertyKey, unknown>)[key],
      (right as Record<PropertyKey, unknown>)[key],
      comparing,
    ),
  );
}
