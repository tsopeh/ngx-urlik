import { stringParam } from './url-params';

describe('url params', () => {
  describe('stringParam', () => {
    it('should fallback to undefined by default', () => {
      const param = stringParam();
    });

    it('should fallback to given string', () => {
      const param = stringParam('foo');
    });

    it('should fallback to produced string', () => {
      const param = stringParam(() => 'foo');
    });
  });
});
