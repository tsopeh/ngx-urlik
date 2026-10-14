import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { defineAppRouter } from './app-router';
import { numberCodec, queryParam, repeatedQueryParam, stringCodec } from './params';

@Component({ template: '' })
class Page {}

enum RouteNames {
  LIST = 'LIST',
  DETAIL = 'DETAIL',
}

function setup() {
  const definition = defineAppRouter(RouteNames, {
    routes: [
      {
        path: 'list',
        routeName: RouteNames.LIST,
        queryParams: {
          search: queryParam({ codec: stringCodec(), defaultValue: '' }),
          view: queryParam({ codec: stringCodec(), defaultValue: 'grid' }),
          page: queryParam({ codec: numberCodec(), defaultValue: 1, resetWhen: ['search'] }),
        },
        component: Page,
        children: [
          {
            path: 'detail',
            routeName: RouteNames.DETAIL,
            queryParams: {
              tags: repeatedQueryParam({ codec: stringCodec(), resetWhen: ['search'] }),
              tagPage: queryParam({ codec: numberCodec(), defaultValue: 1, resetWhen: ['tags'] }),
            },
            component: Page,
          },
        ],
      },
    ],
  });
  TestBed.configureTestingModule({ providers: [definition.provideAppRouter()] });
  return { app: TestBed.inject(definition.AppRouter), router: TestBed.inject(Router) };
}

describe('resetWhen', () => {
  it('resets a field when a listed field changes', async () => {
    const { app, router } = setup();
    await router.navigateByUrl('/list?search=elm&page=3');

    await app.routes.LIST.patchQuery({ search: 'oak' });
    expect(router.url).toBe('/list?search=oak');
  });

  it('keeps the field when the write sets it, when the listed value is unchanged, or when another field changes', async () => {
    const { app, router } = setup();
    await router.navigateByUrl('/list?search=elm&page=3');

    await app.routes.LIST.patchQuery({ search: 'oak', page: 2 });
    expect(router.url).toBe('/list?search=oak&page=2');
    await app.routes.LIST.patchQuery({ search: 'oak' });
    expect(router.url).toBe('/list?search=oak&page=2');
    await app.routes.LIST.patchQuery({ view: 'table' });
    expect(router.url).toBe('/list?search=oak&page=2&view=table');
  });

  it('cascades through ancestor and descendant rules in the same write', async () => {
    const { app, router } = setup();
    await router.navigateByUrl('/list/detail?search=elm&page=3&tags=a&tagPage=2');

    await app.routes.DETAIL.patchQuery({ search: 'oak' });
    expect(router.url).toBe('/list/detail?search=oak');
  });

  it('does not cascade from a field that was already at its default', async () => {
    const { app, router } = setup();
    await router.navigateByUrl('/list/detail?search=elm&tagPage=2');

    await app.routes.DETAIL.patchQuery({ search: 'oak' });
    expect(router.url).toBe('/list/detail?search=oak&tagPage=2');
  });

  it('resets in activeRoute() links that change a listed field', async () => {
    const { app, router } = setup();
    await router.navigateByUrl('/list?search=elm&page=3');
    const active = TestBed.runInInjectionContext(() => app.activeRoute({ list: app.routes.LIST }));

    expect(router.serializeUrl(active().createUrlTree({ query: { search: 'oak' } }))).toBe(
      '/list?search=oak',
    );
    expect(router.serializeUrl(active().createUrlTree({ query: { page: 4 } }))).toBe(
      '/list?search=elm&page=4',
    );
  });

  it('rejects names that are not query fields of the route chain', () => {
    const wide: readonly string[] = ['serch'];
    expect(() =>
      defineAppRouter(RouteNames, {
        routes: [
          {
            path: 'list',
            routeName: RouteNames.LIST,
            queryParams: {
              search: queryParam({ codec: stringCodec(), defaultValue: '' }),
              page: queryParam({ codec: numberCodec(), defaultValue: 1, resetWhen: wide }),
            },
          },
        ],
      }),
    ).toThrow(
      "LIST: query parameter 'page' resets when 'serch' changes, but the route chain does not declare 'serch'",
    );
  });
});
