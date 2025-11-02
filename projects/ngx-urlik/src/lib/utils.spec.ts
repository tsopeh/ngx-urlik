import { initIsEnumValue, resolveFallbackValue } from './utils';

describe('utils', () => {
  describe('resolveFallbackValue', () => {
    it('should work', () => {
      expect(resolveFallbackValue<string>(undefined)).toBe(undefined);

      expect(resolveFallbackValue<string>('')).toBe('');
      expect(resolveFallbackValue<string>('test')).toBe('test');
      expect(resolveFallbackValue<string>(() => 'test')).toBe('test');

      expect(resolveFallbackValue<number>(0)).toBe(0);
      expect(resolveFallbackValue<number>(() => 0)).toBe(0);
      expect(resolveFallbackValue<number>(5)).toBe(5);
      expect(resolveFallbackValue<number>(() => 5)).toBe(5);

      expect(resolveFallbackValue<boolean>(false)).toBe(false);
      expect(resolveFallbackValue<boolean>(() => false)).toBe(false);
      expect(resolveFallbackValue<boolean>(true)).toBe(true);
      expect(resolveFallbackValue<boolean>(() => true)).toBe(true);
    });
  });

  describe('initIsEnumValue', () => {
    it('should work', () => {
      enum Test {
        First, // 0
        Second = 'Second',
        Third = 3.14,
        Fourth = 'fourth',
        Fifth = 5,
        Sixth, // 6
      }

      const isTestEnum = initIsEnumValue(Test);

      expect(isTestEnum('')).toBe(false);
      expect(isTestEnum(null)).toBe(false);
      expect(isTestEnum(undefined)).toBe(false);

      expect(isTestEnum(Test.First)).toBe(true);
      expect(isTestEnum(Test.Second)).toBe(true);
      expect(isTestEnum(Test.Third)).toBe(true);
      expect(isTestEnum(Test.Fourth)).toBe(true);
      expect(isTestEnum(Test.Fifth)).toBe(true);
      expect(isTestEnum(Test.Sixth)).toBe(true);

      expect(isTestEnum(0)).toBe(true);
      expect(isTestEnum('Second')).toBe(true);
      expect(isTestEnum(3.14)).toBe(true);
      expect(isTestEnum('fourth')).toBe(true);
      expect(isTestEnum(5)).toBe(true);
      expect(isTestEnum(6)).toBe(true);

      expect(isTestEnum('0')).toBe(false);
      expect(isTestEnum(1)).toBe(false);
      expect(isTestEnum('SECOND')).toBe(false);
      expect(isTestEnum('2')).toBe(false);
      expect(isTestEnum(3)).toBe(false);
      expect(isTestEnum('3.14')).toBe(false);
      expect(isTestEnum('Fourth')).toBe(false);
      expect(isTestEnum(7)).toBe(false);
    });
  });
});
