import { initUrlik } from './ngx-urlik';
import { booleanParam, createPathParam, enumParam, numberParam, stringParam } from './url-params';

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
        {
          path: 'workspace',
          pathParam: createPathParam('wsId', stringParam()),
          queryParams: {
            ...createPaginationQueryParams(),
            activeOnly: booleanParam(false),
          },
        },
      ],
    });

    const { router, urlParams } = urlik();
    router.workspace.createUrlTree({
      path: { wsId: 'ABCD' },
      query: {
        page: 123,
      },
    });
    router.user.navigate({ path: { userId: 123 } });
  });
});

enum SortDirection {
  Ascending = 'Ascending',
  'Descending' = 'Descending',
}

function createPaginationQueryParams() {
  return {
    page: numberParam(0),
    size: numberParam(10),
    sortKey: stringParam(),
    sortDirection: enumParam(SortDirection, SortDirection.Descending),
  };
}
