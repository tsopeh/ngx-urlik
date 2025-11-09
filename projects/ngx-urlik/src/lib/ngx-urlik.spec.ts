import { initUrlik } from './ngx-urlik';
import { createPathParam, numberParam } from './url-params';

xdescribe('ngx-urlik', () => {
  it('should create', () => {
    const { routes, urlik } = initUrlik({
      routes: [
        { path: 'user', pathParam: createPathParam('userId', numberParam()), queryParams: {} },
      ],
    });

    const { router, urlParams } = urlik();
    router.user.navigate({ userId: 123 });
  });
});
