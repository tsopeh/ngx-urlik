import {
  enumParam,
  initIsEnumValue,
  numberParam,
  resolveFallbackValue,
  stringParam,
} from './url-params';

describe('url params', () => {
  describe('stringParam', () => {
    it('should fallback to undefined by default', () => {
      const paramSerde = stringParam();
      expect(paramSerde.serialize(undefined)).toBe(undefined);
      expect(paramSerde.deserialize(undefined)).toBe(undefined);
    });

    it('should serialize and deserialize empty string', () => {
      const paramSerde = stringParam();
      expect(paramSerde.serialize('')).toBe('');
      expect(paramSerde.deserialize('')).toBe('');
    });

    it('should serialize and deserialize non-empty string', () => {
      const paramSerde = stringParam();
      expect(paramSerde.serialize('foo')).toBe('foo');
      expect(paramSerde.deserialize('foo')).toBe('foo');
    });

    it('should serialize `undefined` to `undefined`', () => {
      const paramSerde = stringParam('foo');
      expect(paramSerde.serialize(undefined)).toBe(undefined);
    });

    it('should deserialize `undefined` to fallback value', () => {
      const paramSerde = stringParam('foo');
      expect(paramSerde.deserialize(undefined)).toBe('foo');
    });

    it('should serialize value to `undefined` if equal to default value', () => {
      const paramSerde = stringParam(() => 'foo');
      expect(paramSerde.serialize('foo')).toBe(undefined);
    });
  });

  describe('numberParam', () => {
    it('should fallback to undefined by default', () => {
      const paramSerde = numberParam();
      expect(paramSerde.serialize(undefined)).toBe(undefined);
      expect(paramSerde.deserialize(undefined)).toBe(undefined);
    });

    it('should serialize and deserialize 0', () => {
      const paramSerde = numberParam();
      expect(paramSerde.serialize(0)).toBe('0');
      expect(paramSerde.deserialize('0')).toBe(0);
    });

    it('should serialize and deserialize non-0 number', () => {
      const paramSerde = numberParam();
      expect(paramSerde.serialize(5)).toBe('5');
      expect(paramSerde.deserialize('5')).toBe(5);
    });

    it('should serialize valid value', () => {
      const paramSerde = numberParam(5);
      expect(paramSerde.serialize(100)).toBe('100');
    });

    it('should deserialize `undefined` to fallback number', () => {
      const paramSerde = numberParam(5);
      expect(paramSerde.deserialize(undefined)).toBe(5);
    });

    it('should serialize `undefined` to `undefined`', () => {
      const paramSerde = numberParam(5);
      expect(paramSerde.serialize(undefined)).toBe(undefined);
    });

    it('should deserialize `undefined` to fallback function value', () => {
      const paramSerde = numberParam(() => 5);
      expect(paramSerde.deserialize(undefined)).toBe(5);
    });

    it('should serialize value to `undefined` if equal to default value', () => {
      const paramSerde = numberParam(() => 5);
      expect(paramSerde.serialize(5)).toBe(undefined);
    });

    it('should serialize invalid number to `undefined`', () => {
      const paramSerde = numberParam(5);
      expect(paramSerde.serialize(parseFloat('not a number'))).toBe(undefined);
    });

    it('should deserialize invalid number to fallback value', () => {
      const paramSerde = numberParam(5);
      expect(paramSerde.deserialize('not a number')).toBe(5);
    });
  });

  describe('enumParam', () => {
    enum Test {
      First, // 0
      Second = 'Second',
      Third = 3.14,
      Fourth = 'fourth',
      Fifth = 5,
      Sixth, // 6
    }

    it('should fallback to undefined by default', () => {
      const paramSerde = enumParam(Test);

      expect(paramSerde.serialize(Test.First));
    });

    it('should fallback to given string', () => {
      const paramSerde = enumParam(Test, Test.Fifth);
    });

    it('should fallback to produced string', () => {
      const paramSerde = enumParam(Test, () => Test.Fifth);
    });
  });
});

describe('helpers', () => {
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
