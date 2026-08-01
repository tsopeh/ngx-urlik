export function isEqual<T>(left: T, right: T): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== 'object' || left === null || typeof right !== 'object' || right === null)
    return false;
  if (Object.getPrototypeOf(left) !== Object.getPrototypeOf(right)) return false;
  if (left instanceof Date && right instanceof Date) return left.getTime() === right.getTime();
  const leftKeys = Reflect.ownKeys(left).filter((key) =>
    Object.prototype.propertyIsEnumerable.call(left, key),
  );
  const rightKeys = Reflect.ownKeys(right).filter((key) =>
    Object.prototype.propertyIsEnumerable.call(right, key),
  );
  if (leftKeys.length !== rightKeys.length || leftKeys.some((key) => !rightKeys.includes(key)))
    return false;
  return leftKeys.every((key) =>
    isEqual(
      (left as Record<PropertyKey, unknown>)[key],
      (right as Record<PropertyKey, unknown>)[key],
    ),
  );
}
