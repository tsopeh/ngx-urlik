import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CanActivateFn, Router } from '@angular/router';
import { AppRouterDiagnostic, defineAppRouter } from './app-router';
import { numberCodec, queryParam, repeatedQueryParam, stringCodec } from './params';
import type { RouteDefinitions } from './route-definition';

@Component({ template: '' })
class Page {}

enum RouteNames {
  ITEMS = 'ITEMS',
  OTHER = 'OTHER',
  PLAIN = 'PLAIN',
  USER = 'USER',
}

const pageSize = () =>
  queryParam({
    codec: numberCodec(),
    defaultValue: 24,
    persist: { key: 'pageSize', storage: 'local' },
  });

function setup(
  options: { prefix?: string; guard?: CanActivateFn; runGuardsAndResolvers?: 'always' } = {},
) {
  const diagnostics: AppRouterDiagnostic[] = [];
  const definition = defineAppRouter(RouteNames, {
    diagnostics: { warn: (diagnostic) => diagnostics.push(diagnostic) },
    persistence: options.prefix === undefined ? undefined : { prefix: options.prefix },
    routes: [
      {
        path: 'items',
        routeName: RouteNames.ITEMS,
        queryParams: {
          search: queryParam({ codec: stringCodec(), defaultValue: '' }),
          pageSize: pageSize(),
        },
        component: Page,
        canActivate: [options.guard ?? (() => true)],
        ...(options.runGuardsAndResolvers
          ? { runGuardsAndResolvers: options.runGuardsAndResolvers }
          : {}),
      },
      {
        path: 'other',
        routeName: RouteNames.OTHER,
        queryParams: { pageSize: pageSize() },
        component: Page,
      },
      {
        path: 'users/:userId',
        routeName: RouteNames.USER,
        queryParams: {
          tab: queryParam({
            codec: stringCodec(),
            defaultValue: 'info',
            persist: { key: 'tab', storage: 'session', scope: ['userId'] },
          }),
        },
        component: Page,
      },
      { path: 'plain', routeName: RouteNames.PLAIN, component: Page },
    ],
  });
  TestBed.configureTestingModule({ providers: [definition.provideAppRouter()] });
  return {
    app: TestBed.inject(definition.AppRouter),
    router: TestBed.inject(Router),
    diagnostics,
    definition,
  };
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => vi.restoreAllMocks());

describe('query persistence', () => {
  it('writes the stored value into the URL when the key is missing', async () => {
    localStorage.setItem('ngx-urlik:pageSize', '48');
    const { app, router } = setup();

    expect(await router.navigateByUrl('/items?search=elm#top')).toBe(true);
    expect(router.url).toBe('/items?search=elm&pageSize=48#top');
    expect(app.routes.ITEMS.params().query.pageSize).toBe(48);
  });

  it('writes the default when nothing usable is stored', async () => {
    const { router } = setup();

    await router.navigateByUrl('/items');
    expect(router.url).toBe('/items?pageSize=24');
  });

  it('replaces a URL value that fails to decode', async () => {
    localStorage.setItem('ngx-urlik:pageSize', '12');
    const { router } = setup();

    await router.navigateByUrl('/items?pageSize=abc');
    expect(router.url).toBe('/items?pageSize=12');
  });

  it('keeps a valid URL value and saves it', async () => {
    localStorage.setItem('ngx-urlik:pageSize', '12');
    const { router } = setup();

    await router.navigateByUrl('/items?pageSize=48');
    expect(router.url).toBe('/items?pageSize=48');
    expect(localStorage.getItem('ngx-urlik:pageSize')).toBe('48');
  });

  it('reads the stored value before the URL is restored', async () => {
    localStorage.setItem('ngx-urlik:pageSize', '48');
    const seen: number[] = [];
    const { router, app } = setup({
      guard: (route) => {
        seen.push(app.routes.ITEMS.paramsFrom(route).query.pageSize);
        return true;
      },
    });

    await router.navigateByUrl('/items');
    expect(seen[0]).toBe(48);
  });

  it('shares one stored value between routes that use the same key', async () => {
    const { app, router } = setup();

    await router.navigateByUrl('/items?pageSize=12');
    await app.routes.OTHER.navigate();
    expect(router.url).toBe('/other?pageSize=12');
  });

  it('restores a missing key when the route is reused', async () => {
    const { app, router } = setup();

    await router.navigateByUrl('/items?pageSize=12');
    await app.routes.ITEMS.navigate({ query: { search: 'elm' } });
    expect(router.url).toBe('/items?search=elm&pageSize=12');
  });

  it("keeps the route's own runGuardsAndResolvers rule", async () => {
    let runs = 0;
    const { router } = setup({
      guard: () => {
        runs++;
        return true;
      },
      runGuardsAndResolvers: 'always',
    });

    await router.navigateByUrl('/items?pageSize=12');
    await router.navigateByUrl('/items?pageSize=12&search=a');
    expect(runs).toBe(2);
  });

  it('saves values written by patchQuery and keeps a default in the URL', async () => {
    const { app, router } = setup();

    await router.navigateByUrl('/items?pageSize=12');
    await app.routes.ITEMS.patchQuery({ pageSize: 24, search: '' });
    expect(router.url).toBe('/items?pageSize=24');
    expect(localStorage.getItem('ngx-urlik:pageSize')).toBe('24');
  });

  it('writes a supplied default and leaves out a missing field when constructing', () => {
    const { app, router } = setup();

    expect(router.serializeUrl(app.routes.ITEMS.createUrlTree({ query: { pageSize: 24 } }))).toBe(
      '/items?pageSize=24',
    );
    expect(router.serializeUrl(app.routes.ITEMS.createUrlTree())).toBe('/items');
  });

  it('ignores a stored value that fails to decode and reports it', async () => {
    localStorage.setItem('ngx-urlik:pageSize', 'many');
    const { router, diagnostics } = setup();

    await router.navigateByUrl('/items');
    expect(router.url).toBe('/items?pageSize=24');
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'STORED_VALUE_DESERIALIZE_FAILED',
        route: RouteNames.ITEMS,
        parameter: 'pageSize',
        operation: 'deserialize',
        key: 'ngx-urlik:pageSize',
      }),
    );
  });

  it('narrows the key by scope and uses session storage', async () => {
    sessionStorage.setItem('ngx-urlik:tab:a%2Fb', 'cast');
    const { router } = setup();

    await router.navigateByUrl('/users/a%2Fb');
    expect(router.url).toBe('/users/a%2Fb?tab=cast');
    await router.navigateByUrl('/users/7?tab=bio');
    expect(sessionStorage.getItem('ngx-urlik:tab:7')).toBe('bio');
    expect(sessionStorage.getItem('ngx-urlik:tab:a%2Fb')).toBe('cast');
    expect(localStorage.length).toBe(0);
  });

  it('uses the router-wide prefix', async () => {
    const { router } = setup({ prefix: 'app.' });

    await router.navigateByUrl('/items?pageSize=12');
    expect(localStorage.getItem('app.pageSize')).toBe('12');
  });

  it('does nothing when storage throws', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const { app, router } = setup();

    expect(await router.navigateByUrl('/items')).toBe(true);
    expect(router.url).toBe('/items');
    expect(app.routes.ITEMS.params().query.pageSize).toBe(24);
    await router.navigateByUrl('/items?pageSize=12');
    expect(router.url).toBe('/items?pageSize=12');
  });

  it('does not touch routes without persisted fields', async () => {
    const { router } = setup();

    await router.navigateByUrl('/plain');
    expect(router.url).toBe('/plain');
  });

  it('rejects persist without a default, on repeated fields, and with an unknown scope', () => {
    const codec = stringCodec();
    const invalid = [
      {
        path: 'a/:id',
        routeName: RouteNames.ITEMS,
        queryParams: {
          noDefault: { ...queryParam({ codec }), persist: { key: 'a', storage: 'local' } },
          repeated: {
            ...repeatedQueryParam({ codec }),
            persist: { key: 'b', storage: 'local' },
          },
          scoped: queryParam({
            codec,
            defaultValue: '',
            persist: { key: 'c', storage: 'local', scope: ['other'] },
          }),
          storage: { ...queryParam({ codec, defaultValue: '' }), persist: { key: 'd' } },
        },
      },
    ] as unknown as RouteDefinitions;

    expect(() => defineAppRouter(RouteNames, { routes: invalid as never })).toThrowError(
      /noDefault' persists.*defaultValue[\s\S]*repeated' cannot persist[\s\S]*scope names 'other'[\s\S]*storage/,
    );
  });

  it('ignores persist in globalQueryParams', async () => {
    localStorage.setItem('ngx-urlik:pageSize', '48');
    const { app, router } = setup();
    const observed = TestBed.runInInjectionContext(() =>
      app.globalQueryParams({ pageSize: pageSize() }),
    );

    await router.navigateByUrl('/plain');
    expect(observed().pageSize).toBe(24);
  });
});
