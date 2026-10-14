import { Component, inject, InjectionToken } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AppRouterDiagnostic, defineAppRouter } from './app-router';
import {
  delimitedQueryParam,
  numberCodec,
  queryParam,
  repeatedQueryParam,
  stringCodec,
} from './params';

@Component({ template: '' })
class Page {}

enum RouteNames {
  A = 'A',
  ABOUT = 'ABOUT',
  B = 'B',
  CATALOG = 'CATALOG',
  CHILD = 'CHILD',
  HOME = 'HOME',
  ITEM = 'ITEM',
  ITEMS = 'ITEMS',
  MOVIES = 'MOVIES',
  RESULTS = 'RESULTS',
  ROOT = 'ROOT',
  SEASONS = 'SEASONS',
}

describe('parameter state', () => {
  it('reads repeated and delimited arrays using their declared forms', async () => {
    const definition = defineAppRouter(RouteNames, {
      routes: [
        {
          path: 'items',
          routeName: RouteNames.ITEMS,
          queryParams: {
            search: queryParam({ codec: stringCodec() }),
            tags: repeatedQueryParam({ codec: stringCodec() }),
            ids: delimitedQueryParam({ codec: numberCodec(), separator: ',' }),
          },
          component: Page,
        },
      ],
    });
    TestBed.configureTestingModule({ providers: [definition.provideAppRouter()] });
    const router = TestBed.inject(Router);
    const items = TestBed.inject(definition.AppRouter).routes.ITEMS;

    await router.navigateByUrl('/items?search=old&search=new&tags=a&tags=b&ids=3,4');
    expect(items.params().query).toEqual({ search: 'new', tags: ['a', 'b'], ids: [3, 4] });
    expect(
      router.serializeUrl(
        items.createUrlTree({ query: { search: 'next', tags: ['x', 'y'], ids: [5, 6] } }),
      ),
    ).toBe('/items?search=next&tags=x&tags=y&ids=5,6');
  });

  it('uses the fallback for a malformed array and reports the field', async () => {
    const diagnostics: AppRouterDiagnostic[] = [];
    const definition = defineAppRouter(RouteNames, {
      diagnostics: { warn: (diagnostic) => diagnostics.push(diagnostic) },
      routes: [
        {
          path: 'items',
          routeName: RouteNames.ITEMS,
          queryParams: { ids: delimitedQueryParam({ codec: numberCodec(), separator: ',' }) },
          component: Page,
        },
      ],
    });
    TestBed.configureTestingModule({ providers: [definition.provideAppRouter()] });
    const router = TestBed.inject(Router);
    const items = TestBed.inject(definition.AppRouter).routes.ITEMS;

    await router.navigateByUrl('/items?ids=1&ids=2');
    expect(items.params().query.ids).toEqual([]);
    expect(diagnostics).toEqual([
      expect.objectContaining({
        route: 'ITEMS',
        parameter: 'ids',
        code: 'INVALID_ARRAY_REPRESENTATION',
      }),
    ]);
  });

  it('reports a throwing codec as a failed conversion with its cause', async () => {
    const diagnostics: AppRouterDiagnostic[] = [];
    const failure = new Error('boom');
    const throwing = {
      serialize: (): string => {
        throw failure;
      },
      deserialize: (): string => {
        throw failure;
      },
    };
    const definition = defineAppRouter(RouteNames, {
      diagnostics: { warn: (diagnostic) => diagnostics.push(diagnostic) },
      routes: [
        {
          path: 'items',
          routeName: RouteNames.ITEMS,
          queryParams: { search: queryParam({ codec: throwing }) },
          component: Page,
        },
      ],
    });
    TestBed.configureTestingModule({ providers: [definition.provideAppRouter()] });
    const router = TestBed.inject(Router);
    const items = TestBed.inject(definition.AppRouter).routes.ITEMS;

    await router.navigateByUrl('/items?search=x');
    expect(items.params().query.search).toBeNull();
    expect(router.serializeUrl(items.createUrlTree({ query: { search: 'y' } }))).toBe('/items');
    expect(diagnostics).toEqual([
      expect.objectContaining({ code: 'PARAM_DESERIALIZE_FAILED', cause: failure }),
      expect.objectContaining({ code: 'PARAM_SERIALIZE_FAILED', cause: failure }),
    ]);
  });

  it('resolves injection-aware defaults and omits default values from URLs', async () => {
    const locale = new InjectionToken<string>('locale');
    const definition = defineAppRouter(RouteNames, {
      routes: [
        {
          path: 'items',
          routeName: RouteNames.ITEMS,
          queryParams: {
            locale: queryParam({ codec: stringCodec(), defaultValue: () => inject(locale) }),
          },
          component: Page,
        },
      ],
    });
    TestBed.configureTestingModule({
      providers: [definition.provideAppRouter(), { provide: locale, useValue: 'en' }],
    });
    const router = TestBed.inject(Router);
    const items = TestBed.inject(definition.AppRouter).routes.ITEMS;

    await router.navigateByUrl('/items');
    expect(items.params().query.locale).toBe('en');
    expect(router.serializeUrl(items.createUrlTree({ query: { locale: 'en' } }))).toBe('/items');
    await router.navigateByUrl('/items?locale=fr');
    expect(items.params().query.locale).toBe('fr');
  });
});
