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
  defineAppRouter(RouteNames, {
    routes: [
      { path: '', routeName: RouteNames.HOME, component: Home },
      {
        path: 'items/:id',
        routeName: RouteNames.ITEM,
        pathParam: { codec: numberCodec() },
        queryParams: { tab: queryParam({ codec: stringCodec(), defaultValue: 'info' }) },
        component: Item,
        ...(resolve ? { resolve: { probe: resolve } } : {}),
      },
    ],
  });

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

  it('gives activeRoute() and global observers the committed state during activation', async () => {
    const definition = itemRouter();
    TestBed.configureTestingModule({
      providers: [
        definition.provideAppRouter(),
        { provide: RouteReuseStrategy, useClass: NoReuse },
        {
          provide: Reader,
          useFactory: () => {
            const appRouter = inject(definition.AppRouter);
            const active = appRouter.activeRoute({ item: appRouter.routes.ITEM });
            const global = appRouter.globalQueryParams({
              tab: queryParam({ codec: stringCodec() }),
            });
            return () => `${active().params.path.id}:${global().tab}`;
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

describe('paramsFrom()', () => {
  it('decodes the destination in a resolver and a guard', async () => {
    const reads: unknown[] = [];
    const definition = defineAppRouter(RouteNames, {
      routes: [
        { path: '', routeName: RouteNames.HOME, component: Home },
        {
          path: 'shows/:showId',
          routeName: RouteNames.SHOW,
          pathParam: { codec: numberCodec() },
          queryParams: { sort: queryParam({ codec: stringCodec(), defaultValue: 'new' }) },
          children: [
            {
              path: 'seasons/:season',
              routeName: RouteNames.SEASON,
              pathParam: { codec: numberCodec() },
              component: Home,
              canActivate: [
                (route) => {
                  reads.push(inject(definition.AppRouter).routes.SHOW.paramsFrom(route));
                  return true;
                },
              ],
              resolve: {
                probe: (route: ActivatedRouteSnapshot) => {
                  reads.push(inject(definition.AppRouter).routes.SEASON.paramsFrom(route));
                  return true;
                },
              },
            },
          ],
        },
      ],
    });
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
    const definition = defineAppRouter(RouteNames, {
      routes: [
        {
          path: '',
          routeName: RouteNames.HOME,
          component: Home,
          canActivate: [
            (route) => {
              try {
                inject(definition.AppRouter).routes.ITEM.paramsFrom(route);
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
          pathParam: { codec: numberCodec() },
          component: Home,
        },
      ],
    });
    TestBed.configureTestingModule({ providers: [definition.provideAppRouter()] });

    await TestBed.inject(Router).navigateByUrl('/');
    expect(error).toEqual(new Error("ITEM: the snapshot does not contain route 'items/:id'"));
  });
});
