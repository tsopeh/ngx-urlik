import { initUrlik } from './ngx-urlik';
import { booleanParam, createPathParam, enumParam, numberParam, stringParam } from './url-params';

xdescribe('ngx-urlik', () => {
  it('should create', () => {
    const { router, urlParams } = initUrlik({
      routes: [
        {
          path: 'workspaces',
          pathParam: createPathParam('wsId', stringParam()),
          queryParams: {
            ...createPaginationQueryParams(),
            activeOnly: booleanParam(false),
          },
          children: [
            {
              path: 'workspaces',
              pathParam: createPathParam('wsId', stringParam()),
              queryParams: {
                ...createPaginationQueryParams(),
                activeOnly: booleanParam(false),
              },
              children: [
                {
                  path: 'workspace',
                  pathParam: createPathParam('wsId', stringParam()),
                  queryParams: {
                    ...createPaginationQueryParams(),
                    activeOnly: booleanParam(false),
                  },
                  children: [],
                },
              ],
            },
          ],
        },
      ],
    });

    router().workspaces.
    router().workspaces.createUrlTree({
      path: { wsId: 'ABCD' },
      query: {
        page: 123,
      },
    });

    const userUrlParams = urlParams.user();
    userUrlParams.updateQueryParams((prev) => {
      return {
        ...prev,
        page: 123,
      };
    });
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
