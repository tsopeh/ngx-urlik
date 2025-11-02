import { booleanParam, enumParam, numberParam, stringParam } from './url-params';

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

    it('should serialize value to `undefined` if equal to fallback value', () => {
      const paramSerde = stringParam(() => 'foo');
      expect(paramSerde.serialize('foo')).toBe(undefined);
    });
  });

  describe('booleanParam', () => {
    it('should fallback to undefined by default', () => {
      const paramSerde = booleanParam();
      expect(paramSerde.serialize(undefined)).toBe(undefined);
      expect(paramSerde.deserialize(undefined)).toBe(undefined);
    });

    it('should serialize and deserialize `true`', () => {
      const paramSerde = booleanParam();
      expect(paramSerde.serialize(true)).toBe('true');
      expect(paramSerde.deserialize('true')).toBe(true);
    });

    it('should serialize and deserialize `false`', () => {
      const paramSerde = booleanParam();
      expect(paramSerde.serialize(false)).toBe('false');
      expect(paramSerde.deserialize('false')).toBe(false);
    });

    it('should serialize `undefined` to `undefined`', () => {
      const paramSerde = booleanParam(true);
      expect(paramSerde.serialize(undefined)).toBe(undefined);
    });

    it('should deserialize invalid value to `undefined` if no fallback', () => {
      const paramSerde = booleanParam();
      expect(paramSerde.deserialize('not a bool')).toBe(undefined);
    });

    it('should deserialize invalid value to `true` fallback value', () => {
      const paramSerde = booleanParam(true);
      expect(paramSerde.deserialize('not a bool')).toBe(true);
    });

    it('should deserialize invalid value to `false` fallback value', () => {
      const paramSerde = booleanParam(false);
      expect(paramSerde.deserialize('not a bool')).toBe(false);
    });

    it('should deserialize `undefined` to `true` fallback function value', () => {
      const paramSerde = booleanParam(() => true);
      expect(paramSerde.deserialize(undefined)).toBe(true);
    });

    it('should deserialize `undefined` to `false` fallback function value', () => {
      const paramSerde = booleanParam(() => false);
      expect(paramSerde.deserialize(undefined)).toBe(false);
    });

    it('should serialize value to `undefined` if equal to `true` fallback value', () => {
      const paramSerde = booleanParam(() => true);
      expect(paramSerde.serialize(true)).toBe(undefined);
    });

    it('should serialize value to `undefined` if equal to `false` fallback value', () => {
      const paramSerde = booleanParam(() => false);
      expect(paramSerde.serialize(false)).toBe(undefined);
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

    it('should serialize value to `undefined` if equal to fallback value', () => {
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
