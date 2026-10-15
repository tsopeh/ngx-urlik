import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { RouterTestingHarness } from '@angular/router/testing';
import {
  CanActivateFn,
  CanDeactivateFn,
  Event,
  NavigationCancel,
  NavigationEnd,
  NavigationStart,
  Router,
  RouterOutlet,
} from '@angular/router';
import { AppRouterDiagnostic, defineAppRouter } from './app-router';
import { numberCodec, queryParam, repeatedQueryParam, stringCodec } from './params';
import type { RouteDefinitions } from './route-definition';

@Component({ template: '' })
class Page {}

@Component({ imports: [RouterOutlet], template: '<router-outlet />' })
class Layout {}

enum RouteNames {
  BOOKS = 'BOOKS',
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
  options: {
    prefix?: string;
    guard?: CanActivateFn;
    leave?: CanDeactivateFn<unknown>;
    runGuardsAndResolvers?: 'always';
  } = {},
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
        canDeactivate: [options.leave ?? (() => true)],
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
      {
        path: 'library',
        queryParams: { pageSize: pageSize() },
        component: Layout,
        children: [
          { path: 'books', routeName: RouteNames.BOOKS, component: Page },
          { path: 'panel', outlet: 'side', component: Page },
        ],
      },
      { path: 'legacy', redirectTo: 'items' },
      { path: 'old', redirectTo: '/items' },
      { path: '**', component: Page },
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

  it("does not run the route's own guards again on a reused route", async () => {
    const runs: string[] = [];
    const { app, router } = setup({
      guard: () => runs.push('activate') > 0,
      leave: () => runs.push('deactivate') > 0,
    });
    // Angular runs canDeactivate only for a component that an outlet has activated.
    await RouterTestingHarness.create();

    await router.navigateByUrl('/items?pageSize=12');
    await app.routes.ITEMS.navigate({ query: { search: 'elm' } });
    expect(router.url).toBe('/items?search=elm&pageSize=12');
    expect(runs).toEqual(['activate']);
  });

  it('fills the fields of the route that is activated, not of an ancestor alone', async () => {
    const { router } = setup();

    await router.navigateByUrl('/library/bogus');
    expect(router.url).toBe('/library/bogus');
    await router.navigateByUrl('/library/books');
    expect(router.url).toBe('/library/books?pageSize=24');
  });

  it('keeps named outlets', async () => {
    const { router } = setup();

    await router.navigateByUrl('/library/(books//side:panel)#top');
    expect(router.url).toBe('/library/(books//side:panel)?pageSize=24#top');
  });

  it('restores after a redirect route', async () => {
    localStorage.setItem('ngx-urlik:pageSize', '48');
    const { router } = setup();

    await router.navigateByUrl('/legacy?search=elm');
    expect(router.url).toBe('/items?search=elm&pageSize=48');
    await router.navigateByUrl('/old?search=elm');
    expect(router.url).toBe('/items?pageSize=48');
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

@Component({ template: 'not found' })
class NotFound {}

@Component({ template: 'pair start' })
class PairStart {}

enum PathRouteNames {
  LIST = 'LIST',
  SHOW = 'SHOW',
  SEASON = 'SEASON',
  PAIR = 'PAIR',
}

function setupPath() {
  const diagnostics: AppRouterDiagnostic[] = [];
  const persistedNumber = (key: string) => ({
    codec: numberCodec(),
    persist: { key, storage: 'local' as const },
  });
  const definition = defineAppRouter(PathRouteNames, {
    diagnostics: { warn: (diagnostic) => diagnostics.push(diagnostic) },
    routes: [
      {
        path: 'shows/:showId',
        routeName: PathRouteNames.SHOW,
        component: Layout,
        children: [
          {
            path: 'seasons/:season',
            routeName: PathRouteNames.SEASON,
            pathParam: {
              codec: numberCodec(),
              persist: { key: 'season', storage: 'session', scope: ['showId'] },
            },
            component: Page,
          },
          { path: 'panel', outlet: 'side', component: Page },
        ],
      },
      { path: 'pair/:a', component: PairStart },
      {
        path: 'pair/:a/:b',
        routeName: PathRouteNames.PAIR,
        pathParam: { a: persistedNumber('a'), b: persistedNumber('b') },
        component: Page,
      },
      {
        path: 'lists/:listId',
        routeName: PathRouteNames.LIST,
        pathParam: persistedNumber('list'),
        queryParams: {
          sort: queryParam({
            codec: stringCodec(),
            defaultValue: 'asc',
            persist: { key: 'sort', storage: 'local' },
          }),
        },
        component: Page,
      },
      { path: '**', component: NotFound },
    ],
  });
  TestBed.configureTestingModule({ providers: [definition.provideAppRouter()] });
  const router = TestBed.inject(Router);
  const leaf = () => getLeaf(router);
  return { app: TestBed.inject(definition.AppRouter), router, diagnostics, leaf };
}

function getLeaf(router: Router) {
  let snapshot = router.routerState.snapshot.root;
  while (snapshot.firstChild) snapshot = snapshot.firstChild;
  return snapshot.component;
}

describe('path persistence', () => {
  it('saves a persisted placeholder under its scoped key', async () => {
    const { router } = setupPath();

    await router.navigateByUrl('/shows/a%20b/seasons/2');
    expect(sessionStorage.getItem('ngx-urlik:season:a%20b')).toBe('2');
  });

  it('redirects a URL without the placeholder to the stored value', async () => {
    sessionStorage.setItem('ngx-urlik:season:x', '3');
    const { app, router } = setupPath();

    expect(await router.navigateByUrl('/shows/x/seasons?tab=cast#top')).toBe(true);
    expect(router.url).toBe('/shows/x/seasons/3?tab=cast#top');
    expect(app.routes.SEASON.params().path).toEqual({ showId: 'x', season: 3 });
  });

  it('restores in a single navigation', async () => {
    sessionStorage.setItem('ngx-urlik:season:x', '3');
    const { router } = setupPath();
    const events: Event[] = [];
    router.events.subscribe((event) => events.push(event));

    await router.navigateByUrl('/shows/x/seasons');
    expect(events.filter((event) => event instanceof NavigationStart)).toHaveLength(1);
    expect(events.some((event) => event instanceof NavigationCancel)).toBe(false);
    expect(events.find((event) => event instanceof NavigationEnd)?.urlAfterRedirects).toBe(
      '/shows/x/seasons/3',
    );
  });

  it('reads ancestor values from a URL with a named outlet', async () => {
    sessionStorage.setItem('ngx-urlik:season:x', '3');
    const { router } = setupPath();

    await router.navigateByUrl('/shows/x/(seasons//side:panel)');
    expect(router.url).toBe('/shows/x/(seasons/3//side:panel)');
  });

  it('lets Angular keep matching when nothing usable is stored', async () => {
    sessionStorage.setItem('ngx-urlik:season:x', '3');
    sessionStorage.setItem('ngx-urlik:season:y', 'first');
    const { router, leaf, diagnostics } = setupPath();

    await router.navigateByUrl('/shows/z/seasons');
    expect(router.url).toBe('/shows/z/seasons');
    expect(leaf()).toBe(NotFound);
    await router.navigateByUrl('/shows/y/seasons');
    expect(leaf()).toBe(NotFound);
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'STORED_VALUE_DESERIALIZE_FAILED',
        parameter: 'season',
        key: 'ngx-urlik:season:y',
      }),
    );
  });

  it('keeps matching when storage throws', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const { router, leaf } = setupPath();

    expect(await router.navigateByUrl('/shows/x/seasons')).toBe(true);
    expect(leaf()).toBe(NotFound);
  });

  it('restores each missing placeholder of a trailing run', async () => {
    localStorage.setItem('ngx-urlik:a', '1');
    localStorage.setItem('ngx-urlik:b', '2');
    const { router, leaf } = setupPath();

    await router.navigateByUrl('/pair');
    expect(router.url).toBe('/pair/1/2');
    await router.navigateByUrl('/pair/5/6');
    expect(localStorage.getItem('ngx-urlik:a')).toBe('5');
    // An app route declared earlier at the shorter path wins.
    await router.navigateByUrl('/pair/7');
    expect(router.url).toBe('/pair/7');
    expect(leaf()).toBe(PairStart);
  });

  it('restores a path value and a query value together', async () => {
    localStorage.setItem('ngx-urlik:list', '5');
    const { router } = setupPath();

    await router.navigateByUrl('/lists?q=1#top');
    expect(router.url).toBe('/lists/5?q=1&sort=asc#top');
  });

  it('keeps generated routes out of AppRouter.routes', () => {
    const { app } = setupPath();

    expect(Object.keys(app.routes).sort()).toEqual(['LIST', 'PAIR', 'SEASON', 'SHOW']);
  });

  it('rejects persist on unnamed routes, before the trailing run, and with a later scope', () => {
    const codec = stringCodec();
    const persist = (key: string, scope?: string[]) => ({
      codec,
      persist: { key, storage: 'local', scope },
    });
    const invalid = [
      {
        path: 'u/:unnamed',
        pathParam: persist('u'),
        children: [{ path: 'named', routeName: PathRouteNames.SHOW }],
      },
      {
        path: 'a/:first/b/:second',
        routeName: PathRouteNames.SEASON,
        pathParam: { first: persist('f'), second: persist('s', ['third']) },
        children: [{ path: ':third', routeName: PathRouteNames.PAIR }],
      },
    ] as unknown as RouteDefinitions;

    expect(() => defineAppRouter(PathRouteNames, { routes: invalid as never })).toThrowError(
      /'unnamed' can persist only on a named route[\s\S]*'first' can persist only in the trailing placeholders[\s\S]*scope names 'third'/,
    );
  });
});

describe('clearPersisted', () => {
  const fill = () => {
    localStorage.setItem('ngx-urlik:pageSize', '12');
    localStorage.setItem('ngx-urlik:tab:7', 'bio');
    localStorage.setItem('theme', 'dark');
    sessionStorage.setItem('ngx-urlik:tab:7', 'cast');
    sessionStorage.setItem('ngx-urlik:tab', 'info');
    sessionStorage.setItem('ngx-urlik:tabs', 'other');
  };
  const keys = (storage: Storage) =>
    Array.from({ length: storage.length }, (_, i) => storage.key(i)).sort();

  it('removes every prefixed key from both storages without an argument', () => {
    const { app } = setup();
    fill();

    app.clearPersisted();
    expect(keys(localStorage)).toEqual(['theme']);
    expect(keys(sessionStorage)).toEqual([]);
  });

  it('touches only the storages it names', () => {
    const { app } = setup();
    fill();

    app.clearPersisted({});
    expect(keys(localStorage)).toHaveLength(3);
    app.clearPersisted({ local: true, session: false });
    expect(keys(localStorage)).toEqual(['theme']);
    expect(keys(sessionStorage)).toHaveLength(3);
  });

  it('removes a key with all of its scopes', () => {
    const { app } = setup();
    fill();

    app.clearPersisted({ session: ['tab'] });
    expect(keys(sessionStorage)).toEqual(['ngx-urlik:tabs']);
    expect(keys(localStorage)).toHaveLength(3);
  });

  it('reports a key that no route declares', () => {
    const { app, diagnostics } = setup();
    fill();

    app.clearPersisted({ local: ['pageSise'] });
    expect(keys(localStorage)).toHaveLength(3);
    expect(diagnostics).toEqual([
      expect.objectContaining({ code: 'UNKNOWN_PERSIST_KEY', key: 'pageSise' }),
    ]);
  });

  it('keeps the current URL and saves it again at the next navigation', async () => {
    const { app, router } = setup({ prefix: 'app.' });
    await router.navigateByUrl('/items?pageSize=12');

    app.clearPersisted();
    expect(router.url).toBe('/items?pageSize=12');
    expect(localStorage.getItem('app.pageSize')).toBeNull();
    await app.routes.ITEMS.patchQuery({ search: 'elm' });
    expect(localStorage.getItem('app.pageSize')).toBe('12');
  });

  it('does nothing when storage throws', () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const { app } = setup();
    fill();

    expect(() => app.clearPersisted()).not.toThrow();
  });
});
