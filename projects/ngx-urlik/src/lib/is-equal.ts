export function isEqual<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true;

  if (a === null || b === null) return false;
  if (typeof a !== 'object' || typeof b !== 'object') return false;

  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  }

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;

    for (let i = 0; i < a.length; i++) {
      if (!isEqual(a[i], b[i])) return false;
    }

    return true;
  }

  const aProto = Object.getPrototypeOf(a);
  const bProto = Object.getPrototypeOf(b);
  if (aProto !== bProto) return false;

  const aObj = a as Record<PropertyKey, unknown>;
  const bObj = b as Record<PropertyKey, unknown>;

  const aKeys = Reflect.ownKeys(aObj);
  const bKeys = Reflect.ownKeys(bObj);

  if (aKeys.length !== bKeys.length) return false;

  for (const key of aKeys) {
    if (!Object.prototype.propertyIsEnumerable.call(aObj, key)) continue;

    if (!Object.prototype.hasOwnProperty.call(bObj, key)) {
      return false;
    }

    if (!Object.prototype.propertyIsEnumerable.call(bObj, key)) {
      return false;
    }

    if (!isEqual(aObj[key], bObj[key])) {
      return false;
    }
  }

  return true;
}
