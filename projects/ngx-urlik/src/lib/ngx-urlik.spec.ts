import { initUrlik } from './ngx-urlik';

describe('ngx-urlik', () => {
  it('should create', () => {
    const { routes, urlik } = initUrlik({
      routes: [
        { path: 'user', pathParam: { name: 'userId', type: 'string' }, queryParams: {} },
        { path: 'workspace', pathParam: { name: 'workspaceId', type: 'string' }, queryParams: {} },
      ],
    });

    const { router, urlParams } = urlik();
    router;
  });
});
