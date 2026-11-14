import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AppRouterDiagnostic, defineAppRouter } from './app-router';
import { listCodec, numberCodec, queryParam, stringCodec } from './params';

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
  it('warns on the console when defineAppRouter() gets no diagnostics option', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const definition = defineAppRouter(
      { RESULTS: RouteNames.RESULTS },
      {
        routes: [
          {
            path: 'results',
            routeName: RouteNames.RESULTS,
            queryParams: { page: queryParam({ codec: numberCodec(), defaultValue: 1 }) },
            component: Page,
          },
        ],
      },
    );
    TestBed.configureTestingModule({ providers: [definition.provideAppRouter()] });
    await TestBed.inject(Router).navigateByUrl('/results?page=abc');

    expect(TestBed.inject(definition.AppRouter).routes.RESULTS.params().query.page).toBe(1);
    expect(warn).toHaveBeenCalledWith(
      "RESULTS: can't read query parameter 'page': the codec returned null",
    );
    warn.mockRestore();
  });

  it('reads the last of a repeated key, and joined lists', async () => {
    const definition = defineAppRouter(
      { ITEMS: RouteNames.ITEMS },
      {
        routes: [
          {
            path: 'items',
            routeName: RouteNames.ITEMS,
            queryParams: {
              search: queryParam({ codec: stringCodec() }),
              ids: queryParam({ codec: listCodec(numberCodec(), ','), defaultValue: [] }),
            },
            component: Page,
          },
        ],
      },
    );
    TestBed.configureTestingModule({ providers: [definition.provideAppRouter()] });
    const router = TestBed.inject(Router);
    const items = TestBed.inject(definition.AppRouter).routes.ITEMS;

    await router.navigateByUrl('/items?search=old&search=new&ids=1&ids=3,4');
    expect(items.params().query).toEqual({ search: 'new', ids: [3, 4] });
    expect(
      router.serializeUrl(items.createUrlTree({ query: { search: 'next', ids: [5, 6] } })),
    ).toBe('/items?search=next&ids=5,6');
  });

  it('keeps an empty list apart from a missing key, and items with commas whole', async () => {
    const definition = defineAppRouter(
      { ITEMS: RouteNames.ITEMS },
      {
        routes: [
          {
            path: 'items',
            routeName: RouteNames.ITEMS,
            queryParams: {
              tags: queryParam({ codec: listCodec(stringCodec(), ','), defaultValue: ['new'] }),
            },
            component: Page,
          },
        ],
      },
    );
    TestBed.configureTestingModule({ providers: [definition.provideAppRouter()] });
    const router = TestBed.inject(Router);
    const items = TestBed.inject(definition.AppRouter).routes.ITEMS;
    await router.navigateByUrl('/items');
    expect(items.params().query.tags).toEqual(['new']);

    await items.patchQuery({ tags: [] });
    expect(router.url).toBe('/items?tags=');
    expect(items.params().query.tags).toEqual([]);

    await items.patchQuery({ tags: ['red, green', 'blue'] });
    expect(router.url).toBe('/items?tags=red%5C,%20green,blue');
    expect(items.params().query.tags).toEqual(['red, green', 'blue']);
  });

  it('uses the fallback for a malformed array and reports the field', async () => {
    const diagnostics: AppRouterDiagnostic[] = [];
    const definition = defineAppRouter(
      { ITEMS: RouteNames.ITEMS },
      {
        diagnostics: { warn: (diagnostic) => diagnostics.push(diagnostic) },
        routes: [
          {
            path: 'items',
            routeName: RouteNames.ITEMS,
            queryParams: {
              ids: queryParam({ codec: listCodec(numberCodec(), ','), defaultValue: [] }),
            },
            component: Page,
          },
        ],
      },
    );
    TestBed.configureTestingModule({ providers: [definition.provideAppRouter()] });
    const router = TestBed.inject(Router);
    const items = TestBed.inject(definition.AppRouter).routes.ITEMS;

    await router.navigateByUrl('/items?ids=1,x');
    expect(items.params().query.ids).toEqual([]);
    expect(diagnostics).toEqual([
      expect.objectContaining({
        route: 'ITEMS',
        parameter: 'ids',
        code: 'PARAM_DESERIALIZE_FAILED',
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
    const definition = defineAppRouter(
      { ITEMS: RouteNames.ITEMS },
      {
        diagnostics: { warn: (diagnostic) => diagnostics.push(diagnostic) },
        routes: [
          {
            path: 'items',
            routeName: RouteNames.ITEMS,
            queryParams: { search: queryParam({ codec: throwing }) },
            component: Page,
          },
        ],
      },
    );
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

  it('reads a missing value as its default and omits default values from URLs', async () => {
    const definition = defineAppRouter(
      { ITEMS: RouteNames.ITEMS },
      {
        routes: [
          {
            path: 'items',
            routeName: RouteNames.ITEMS,
            queryParams: {
              locale: queryParam({ codec: stringCodec(), defaultValue: 'en' }),
            },
            component: Page,
          },
        ],
      },
    );
    TestBed.configureTestingModule({
      providers: [definition.provideAppRouter()],
    });
    const router = TestBed.inject(Router);
    const items = TestBed.inject(definition.AppRouter).routes.ITEMS;

    await router.navigateByUrl('/items');
    expect(items.params().query.locale).toBe('en');
    expect(router.serializeUrl(items.createUrlTree({ query: { locale: 'en' } }))).toBe('/items');
    await router.navigateByUrl('/items?locale=fr');
    expect(items.params().query.locale).toBe('fr');
  });

  it('leaves out a query value passed as undefined, without a diagnostic', () => {
    const diagnostics: AppRouterDiagnostic[] = [];
    const definition = defineAppRouter(
      { ITEMS: RouteNames.ITEMS },
      {
        diagnostics: { warn: (diagnostic) => diagnostics.push(diagnostic) },
        routes: [
          {
            path: 'items',
            routeName: RouteNames.ITEMS,
            queryParams: { pageSize: queryParam({ codec: numberCodec(), defaultValue: 24 }) },
            component: Page,
          },
        ],
      },
    );
    TestBed.configureTestingModule({ providers: [definition.provideAppRouter()] });
    const router = TestBed.inject(Router);
    const items = TestBed.inject(definition.AppRouter).routes.ITEMS;
    const saved: number | undefined = undefined;

    expect(router.serializeUrl(items.createUrlTree({ query: { pageSize: saved } }))).toBe('/items');
    expect(diagnostics).toEqual([]);
  });

  it('compares field values by their URL text', async () => {
    class Day {
      readonly #iso: string;
      constructor(iso: string) {
        this.#iso = iso;
      }
      toString() {
        return this.#iso;
      }
    }
    const dayCodec = {
      serialize: (value: Day) => String(value),
      deserialize: (raw: string) => new Day(raw),
    };
    const definition = defineAppRouter(
      { ITEMS: RouteNames.ITEMS },
      {
        routes: [
          {
            path: 'items',
            routeName: RouteNames.ITEMS,
            queryParams: {
              from: queryParam({ codec: dayCodec, defaultValue: new Day('2026-01-01') }),
              search: queryParam({ codec: stringCodec() }),
            },
            component: Page,
          },
        ],
      },
    );
    TestBed.configureTestingModule({ providers: [definition.provideAppRouter()] });
    const router = TestBed.inject(Router);
    const items = TestBed.inject(definition.AppRouter).routes.ITEMS;

    const link = items.createUrlTree({ query: { from: new Day('2026-01-01') } });
    expect(router.serializeUrl(link)).toBe('/items');
    await router.navigateByUrl('/items?from=2026-02-01&search=elm');
    const first = items.params();
    await router.navigateByUrl('/items?search=elm&from=2026-02-01');
    expect(items.params()).toBe(first);
    await router.navigateByUrl('/items?from=2026-02-01&search=oak');
    expect(items.params().query.from).toBe(first.query.from);
    await router.navigateByUrl('/items?from=2026-03-01&search=elm');
    expect(String(items.params().query.from)).toBe('2026-03-01');
  });
});
