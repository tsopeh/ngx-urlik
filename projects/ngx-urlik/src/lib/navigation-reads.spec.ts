import { Component, computed, inject, Injectable, InjectionToken } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  BaseRouteReuseStrategy,
  CanActivateFn,
  ResolveFn,
  RouteReuseStrategy,
  Router,
} from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { defineAppRouter } from './app-router';
import { listCodec, numberCodec, queryParam, stringCodec } from './params';

enum RouteNames {
  HOME = 'HOME',
  ITEM = 'ITEM',
  SHOW = 'SHOW',
  SEASON = 'SEASON',
}

// Components read through this token so their classes can be declared before the router.
const Reader = new InjectionToken<() => unknown>('Reader');
const seen: unknown[] = [];

@Component({ template: '' })
class Home {}

@Component({ template: '{{ read() }}' })
class Item {
  protected readonly read = inject(Reader);
  constructor() {
    seen.push(this.read());
  }
}

@Injectable()
class NoReuse extends BaseRouteReuseStrategy {
  override shouldReuseRoute(): boolean {
    return false;
  }
}

const itemRouter = (resolve?: ResolveFn<unknown>) =>
  defineAppRouter(
    { HOME: RouteNames.HOME, ITEM: RouteNames.ITEM },
    {
      routes: [
        { path: '', routeName: RouteNames.HOME, component: Home },
        {
          path: 'items/:id',
          routeName: RouteNames.ITEM,
          pathParams: { id: numberCodec() },
          queryParams: { tab: queryParam({ codec: stringCodec(), defaultValue: 'info' }) },
          component: Item,
          ...(resolve ? { resolve: { probe: resolve } } : {}),
        },
      ],
    },
  );

beforeEach(() => {
  seen.length = 0;
});

describe('reads during navigation', () => {
  it('gives a new component the destination state after a resolver read the old one', async () => {
    const definition = itemRouter(() => {
      try {
        return inject(definition.AppRouter).routes.ITEM.params().path.id;
      } catch {
        return null;
      }
    });
    TestBed.configureTestingModule({
      providers: [
        definition.provideAppRouter(),
        {
          provide: Reader,
          useFactory: () => {
            const item = inject(definition.AppRouter).routes.ITEM;
            return () => item.params().path.id;
          },
        },
      ],
    });
    const harness = await RouterTestingHarness.create();

    await harness.navigateByUrl('/items/1');
    await harness.navigateByUrl('/');
    await harness.navigateByUrl('/items/2');
    expect(seen).toEqual([1, 2]);
  });

  it('gives a recreated component its new path value', async () => {
    const definition = itemRouter();
    TestBed.configureTestingModule({
      providers: [
        definition.provideAppRouter(),
        { provide: RouteReuseStrategy, useClass: NoReuse },
        {
          provide: Reader,
          useFactory: () => {
            const item = inject(definition.AppRouter).routes.ITEM;
            return () => item.params().path.id;
          },
        },
      ],
    });
    const harness = await RouterTestingHarness.create();

    await harness.navigateByUrl('/items/1');
    await harness.navigateByUrl('/items/2');
    expect(seen).toEqual([1, 2]);
    expect(harness.routeNativeElement?.textContent).toBe('2');
  });

  it('gives ifActive() and global observers the committed state during activation', async () => {
    const definition = itemRouter();
    TestBed.configureTestingModule({
      providers: [
        definition.provideAppRouter(),
        { provide: RouteReuseStrategy, useClass: NoReuse },
        {
          provide: Reader,
          useFactory: () => {
            const appRouter = inject(definition.AppRouter);
            const global = appRouter.globalParams({
              query: { tab: queryParam({ codec: stringCodec() }) },
            });
            return () => {
              const id = appRouter.routes.ITEM.ifActive()?.params().path.id ?? null;
              return `${id}:${global().query.tab}`;
            };
          },
        },
      ],
    });
    const harness = await RouterTestingHarness.create();

    await harness.navigateByUrl('/items/1?tab=a');
    await harness.navigateByUrl('/items/2?tab=b');
    expect(seen).toEqual(['1:a', '2:b']);
  });

  it('keeps params an Angular signal', async () => {
    const { isSignal } = await import('@angular/core');
    const definition = itemRouter();
    TestBed.configureTestingModule({ providers: [definition.provideAppRouter()] });
    const appRouter = TestBed.inject(definition.AppRouter);
    expect(isSignal(appRouter.routes.ITEM.params)).toBe(true);
  });

  async function setupLaggingItem(options: {
    read: (item: {
      params: () => { path: { id: number }; query: { tags: readonly string[]; page: number } };
    }) => unknown;
    canActivate?: CanActivateFn;
    diagnostics?: string[];
  }) {
    const definition = defineAppRouter(
      { ITEM: RouteNames.ITEM },
      {
        routes: [
          {
            path: 'items/:id',
            routeName: RouteNames.ITEM,
            pathParams: { id: numberCodec() },
            queryParams: {
              tags: queryParam({ codec: listCodec(stringCodec(), ','), defaultValue: [] }),
              page: queryParam({ codec: numberCodec(), defaultValue: 1 }),
            },
            ...(options.canActivate ? { canActivate: [options.canActivate] } : {}),
            component: Item,
          },
        ],
        ...(options.diagnostics
          ? { diagnostics: { warn: (d) => options.diagnostics!.push(d.code) } }
          : {}),
      },
    );
    TestBed.configureTestingModule({
      providers: [
        definition.provideAppRouter(),
        { provide: RouteReuseStrategy, useClass: NoReuse },
        {
          provide: Reader,
          useFactory: () => {
            const item = inject(definition.AppRouter).routes.ITEM;
            return () => options.read(item);
          },
        },
      ],
    });
    const harness = await RouterTestingHarness.create();
    const item = TestBed.inject(definition.AppRouter).routes.ITEM;
    return { harness, item };
  }

  it('reuses cached values and reports decode failures once across lagging reads', async () => {
    const diagnostics: string[] = [];
    const { harness, item } = await setupLaggingItem({
      diagnostics,
      read: (route) => {
        const first = route.params().query;
        const second = route.params().query;
        return { first: first.tags, second: second.tags };
      },
    });

    await harness.navigateByUrl('/items/1?tags=x,y');
    const beforeNav = item.params().query.tags;
    seen.length = 0;

    await harness.navigateByUrl('/items/2?tags=x,y&page=bad');
    const duringLag = seen[0] as { first: readonly string[]; second: readonly string[] };
    expect(duringLag.first).toBe(beforeNav);
    expect(duringLag.second).toBe(beforeNav);
    expect(item.params().query.tags).toBe(beforeNav);
    expect(diagnostics).toEqual(['PARAM_DESERIALIZE_FAILED']);
  });

  it('preserves value identity when a lagging navigation rolls back', async () => {
    let failNext = false;
    const { harness, item } = await setupLaggingItem({
      read: (route) => {
        const tags = route.params().query.tags;
        if (failNext) {
          throw new Error('activation failed');
        }
        return tags;
      },
    });

    await harness.navigateByUrl('/items/1?tags=a,b');
    const beforeRollback = item.params().query.tags;

    failNext = true;
    await expect(harness.navigateByUrl('/items/2?tags=c,d')).rejects.toThrow('activation failed');
    failNext = false;

    expect(item.params().query.tags).toBe(beforeRollback);
    // Navigating again with the same tags reads from ValueCache, confirming rollback didn't overwrite it.
    await harness.navigateByUrl('/items/3?tags=a,b');
    expect(item.params().query.tags).toBe(beforeRollback);
  });

  it('preserves value identity when a lagging navigation rolls back after an unread NavigationEnd', async () => {
    let readInConstructor = false;
    let failInConstructor = false;
    const { harness, item } = await setupLaggingItem({
      read: (route) => {
        const tags = readInConstructor ? route.params().query.tags : null;
        if (failInConstructor) {
          throw new Error('activation failed');
        }
        return tags;
      },
    });

    await harness.navigateByUrl('/items/1?tags=a,b');
    const beforeNav = item.params().query.tags;

    // Move to /items/2 with the same tags without reading item.params() after NavigationEnd.
    await harness.navigateByUrl('/items/2?tags=a,b');

    // Start /items/3 whose component reads item.params() in its constructor and throws,
    // rolling Angular back to /items/2.
    readInConstructor = true;
    failInConstructor = true;
    await expect(harness.navigateByUrl('/items/3?tags=c,d')).rejects.toThrow('activation failed');
    failInConstructor = false;

    expect(item.params().query.tags).toBe(beforeNav);
  });

  it('keeps values read during activation when a later navigation is cancelled', async () => {
    let allow = true;
    let readInConstructor = false;
    const { harness, item } = await setupLaggingItem({
      canActivate: () => allow,
      read: (route) => (readInConstructor ? route.params().query.tags : null),
    });

    await harness.navigateByUrl('/items/0?tags=x');
    expect(item.params().query.tags).toEqual(['x']);
    seen.length = 0;

    readInConstructor = true;
    await harness.navigateByUrl('/items/1?tags=a,b');
    const duringActivation = seen[0] as readonly string[];

    // Do not read item.params() after NavigationEnd; cancel a later navigation instead.
    allow = false;
    await harness.navigateByUrl('/items/2?tags=z');

    expect(item.params().query.tags).toBe(duringActivation);
  });

  it("doesn't rerun a computed or replace params() after NavigationEnd when URL text didn't change", async () => {
    let runs = 0;
    let readCurrent: () => unknown = () => null;
    const { harness, item } = await setupLaggingItem({
      read: () => readCurrent(),
    });

    await harness.navigateByUrl('/items/1?tags=a,b');
    const derived = computed(() => {
      runs++;
      return item.params();
    });
    readCurrent = derived;
    const before = derived();
    expect(runs).toBe(1);

    // Changing only an undeclared query param activates a fresh component without changing any
    // declared parameter's URL text.
    await harness.navigateByUrl('/items/1?tags=a,b&other=1');
    const after = derived();
    expect(after).toBe(before);
    expect(runs).toBe(1);
  });
});

describe('paramsSnapshot()', () => {
  it('decodes the destination in a resolver and a guard', async () => {
    const reads: unknown[] = [];
    const definition = defineAppRouter(
      { HOME: RouteNames.HOME, SHOW: RouteNames.SHOW, SEASON: RouteNames.SEASON },
      {
        routes: [
          { path: '', routeName: RouteNames.HOME, component: Home },
          {
            path: 'shows/:showId',
            routeName: RouteNames.SHOW,
            pathParams: { showId: numberCodec() },
            queryParams: { sort: queryParam({ codec: stringCodec(), defaultValue: 'new' }) },
            children: [
              {
                path: 'seasons/:season',
                routeName: RouteNames.SEASON,
                pathParams: { season: numberCodec() },
                component: Home,
                canActivate: [
                  (route) => {
                    const appRouter = inject(definition.AppRouter);
                    reads.push(appRouter.paramsSnapshot(appRouter.routes.SHOW, route));
                    return true;
                  },
                ],
                resolve: {
                  probe: (route: ActivatedRouteSnapshot) => {
                    const appRouter = inject(definition.AppRouter);
                    reads.push(appRouter.paramsSnapshot(appRouter.routes.SEASON, route));
                    return true;
                  },
                },
              },
            ],
          },
        ],
      },
    );
    TestBed.configureTestingModule({ providers: [definition.provideAppRouter()] });
    const router = TestBed.inject(Router);

    await router.navigateByUrl('/shows/7/seasons/2?sort=old');
    expect(reads).toEqual([
      { path: { showId: 7 }, query: { sort: 'old' } },
      { path: { showId: 7, season: 2 }, query: { sort: 'old' } },
    ]);
  });

  it('throws when the snapshot does not contain the route', async () => {
    let error: unknown;
    const definition = defineAppRouter(
      { HOME: RouteNames.HOME, ITEM: RouteNames.ITEM },
      {
        routes: [
          {
            path: '',
            routeName: RouteNames.HOME,
            component: Home,
            canActivate: [
              (route) => {
                try {
                  const appRouter = inject(definition.AppRouter);
                  appRouter.paramsSnapshot(appRouter.routes.ITEM, route);
                } catch (caught) {
                  error = caught;
                }
                return true;
              },
            ],
          },
          {
            path: 'items/:id',
            routeName: RouteNames.ITEM,
            pathParams: { id: numberCodec() },
            component: Home,
          },
        ],
      },
    );
    TestBed.configureTestingModule({ providers: [definition.provideAppRouter()] });

    await TestBed.inject(Router).navigateByUrl('/');
    expect(error).toEqual(
      new Error(
        "paramsSnapshot(): the snapshot doesn't contain route ITEM ('items/:id'). Pass the snapshot of a guard or resolver on that route or a route below it.",
      ),
    );
  });

  it('rejects an object that is not a route from AppRouter.routes', async () => {
    const definition = itemRouter();
    TestBed.configureTestingModule({ providers: [definition.provideAppRouter()] });
    const appRouter = TestBed.inject(definition.AppRouter);
    await TestBed.inject(Router).navigateByUrl('/items/1');
    const root = TestBed.inject(Router).routerState.snapshot.root;
    expect(() => appRouter.paramsSnapshot({ ...appRouter.routes.ITEM }, root)).toThrow(
      "paramsSnapshot(): that isn't a route from AppRouter.routes. Pass appRouter.routes.NAME.",
    );
  });
});
