import { Component, inject, Injectable, InjectionToken } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  BaseRouteReuseStrategy,
  ResolveFn,
  RouteReuseStrategy,
  Router,
} from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { defineAppRouter } from './app-router';
import { numberCodec, queryParam, stringCodec } from './params';

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
          pathParam: { id: numberCodec() },
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
            pathParam: { showId: numberCodec() },
            queryParams: { sort: queryParam({ codec: stringCodec(), defaultValue: 'new' }) },
            children: [
              {
                path: 'seasons/:season',
                routeName: RouteNames.SEASON,
                pathParam: { season: numberCodec() },
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
            pathParam: { id: numberCodec() },
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
