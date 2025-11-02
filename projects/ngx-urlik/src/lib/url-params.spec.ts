import { enumParam, stringParam } from './url-params';

describe('url params', () => {
  describe('stringParam', () => {
    it('should fallback to undefined by default', () => {
      const paramSerde = stringParam();
    });

    it('should fallback to given string', () => {
      const paramSerde = stringParam('foo');
    });

    it('should fallback to produced string', () => {
      const paramSerde = stringParam(() => 'foo');
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
    // TODO
  });

  describe('initIsEnumValue', () => {
    // TODO
  });
});
