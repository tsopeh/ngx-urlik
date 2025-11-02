export function resolveFallbackValue<T>(fallbackValue: T | (() => T) | undefined): T | undefined {
  return typeof fallbackValue === 'function' ? (fallbackValue as Function)() : fallbackValue;
}

export function initIsEnumValue<T extends Record<any, any>>(enumObject: T) {
  const possibleValues = Object.values(enumObject);
  return (enumValue: unknown): enumValue is T[keyof T] => {
    return enumValue != null && possibleValues.includes(enumValue as any);
  };
}
