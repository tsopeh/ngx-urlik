import { initUrlik } from './ngx-urlik';
import { createPathParam, numberParam } from './url-params';

xdescribe('ngx-urlik', () => {
  it('should create', () => {
    const { routes, urlik } = initUrlik({
      routes: [
        {
          path: 'user',
          pathParam: createPathParam('userId', numberParam()),
          queryParams: {
            page: numberParam(0),
          },
        },
      ],
    });

    const { router, urlParams } = urlik();
    router.user.navigate({ path: { userId: 1 }, query: { page: 1 } });
  });
});
