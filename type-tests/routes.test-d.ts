import type { Routes } from '@angular/router';
import { defineAppRouter, numberCodec, queryParam, stringCodec } from 'ngx-urlik';
import { describe, expectTypeOf, it } from 'vitest';
import { appRouter, Page, type TokenValue } from './fixtures';

describe('route names', () => {
  it("keys AppRouter.routes by the enum member's name, not its value", () => {
    enum Names {
      Movie = 'movie',
    }
    const { AppRouter } = defineAppRouter(Names, {
      routes: [{ path: 'movies', routeName: Names.Movie }],
    });
    const router = {} as TokenValue<typeof AppRouter>;
    expectTypeOf(router.routes).toHaveProperty('Movie');
    // @ts-expect-error the key is the member name, `Movie`
    void router.routes.movie;
  });

  it('gives unnamed routes and wildcards no entry', () => {
    // @ts-expect-error only named routes are in AppRouter.routes
    void appRouter.routes.WILDCARD;
  });

  it('needs a literal routeName', () => {
    enum Names {
      A = 'A',
    }
    const wide = 'A' as string;
    defineAppRouter(Names, {
      routes: [
        {
          path: 'a',
          // @ts-expect-error a wide string can't name a route
          routeName: wide,
        },
      ],
    });
    defineAppRouter(Names, {
      routes: [
        {
          path: 'a',
          // @ts-expect-error a routeName is a string
          routeName: { A: true },
        },
      ],
    });
  });

  it('gives an array typed as Routes no typed routes', () => {
    enum Names {}
    const routes = [] as Routes;
    const { AppRouter } = defineAppRouter(Names, { routes });
    const router = {} as TokenValue<typeof AppRouter>;
    // @ts-expect-error TypeScript can't read names from a Routes-typed array
    void router.routes.HOME;
  });
});

describe('what a named route can be', () => {
  enum Names {
    A = 'A',
  }

  it("can't be a redirect or a wildcard", () => {
    defineAppRouter(Names, {
      routes: [
        {
          path: 'old',
          redirectTo: '/new',
          // @ts-expect-error a redirect can't have a routeName
          routeName: Names.A,
        },
      ],
    });
    defineAppRouter(Names, {
      routes: [
        {
          path: '**',
          // @ts-expect-error a wildcard can't have a routeName
          routeName: Names.A,
        },
      ],
    });
  });

  it('needs a path unless it has a matcher', () => {
    defineAppRouter(Names, {
      routes: [
        { matcher: () => null, component: Page },
        // @ts-expect-error a route without a matcher needs a path
        { routeName: Names.A, component: Page },
      ],
    });
    defineAppRouter(Names, {
      routes: [
        {
          // @ts-expect-error a path is a string
          path: 5,
          component: Page,
        },
      ],
    });
  });

  it('accepts only known fields, with their Angular types', () => {
    defineAppRouter(Names, {
      routes: [
        {
          path: 'a',
          routeName: Names.A,
          // @ts-expect-error a misspelled Angular field
          compnent: Page,
        },
      ],
    });
    defineAppRouter(Names, {
      routes: [
        {
          path: 'a',
          routeName: Names.A,
          // @ts-expect-error children is a route array
          children: Page,
        },
      ],
    });
  });
});

describe('callbacks in routes', () => {
  enum Names {
    HOME = 'HOME',
    ITEM = 'ITEM',
  }

  it("keep Angular's parameter types, on named and unnamed routes", () => {
    const { AppRouter } = defineAppRouter(Names, {
      routes: [
        {
          path: '',
          pathMatch: 'full',
          redirectTo: ({ queryParams }) => {
            expectTypeOf(queryParams).toEqualTypeOf<import('@angular/router').Params>();
            return '/home';
          },
        },
        {
          matcher: (segments) => {
            expectTypeOf(segments).toEqualTypeOf<import('@angular/router').UrlSegment[]>();
            return null;
          },
          component: Page,
        },
        {
          path: 'home',
          routeName: Names.HOME,
          component: Page,
          canActivate: [
            (route) => {
              expectTypeOf(route).toEqualTypeOf<import('@angular/router').ActivatedRouteSnapshot>();
              return true;
            },
          ],
          canMatch: [(route, segments) => route.path !== undefined && segments.length > 0],
          canDeactivate: [(component) => component !== null],
          title: (route) => route.queryParamMap.get('q') ?? 'Home',
          data: { section: 'home' },
        },
        {
          path: 'items/:itemId',
          routeName: Names.ITEM,
          pathParam: { itemId: numberCodec() },
          loadComponent: () => import('./fixtures').then((m) => m.Page),
          canActivateChild: [(child) => child.url.length >= 0],
        },
      ],
    });
    const router = {} as TokenValue<typeof AppRouter>;
    expectTypeOf(router.routes.ITEM.params().path.itemId).toEqualTypeOf<number>();
  });

  it('report a wrong use where the callback is written', () => {
    defineAppRouter(Names, {
      routes: [
        {
          path: 'home',
          routeName: Names.HOME,
          // @ts-expect-error an ActivatedRouteSnapshot has no `foo`
          canActivate: [(route) => route.foo],
        },
      ],
    });
  });
});

describe('pathParam', () => {
  enum Names {
    SHOW = 'SHOW',
  }

  it('gives a placeholder without a codec the string type', () => {
    const { AppRouter } = defineAppRouter(Names, {
      routes: [
        {
          path: 'shows/:showId/season/:season',
          routeName: Names.SHOW,
          pathParam: { season: numberCodec() },
        },
      ],
    });
    const router = {} as TokenValue<typeof AppRouter>;
    expectTypeOf(router.routes.SHOW.params().path).toEqualTypeOf<
      Readonly<{ showId: string; season: number }>
    >();
  });

  it('is keyed by placeholder name, and each entry is a codec', () => {
    defineAppRouter(Names, {
      routes: [
        {
          path: 'shows/:showId',
          routeName: Names.SHOW,
          // @ts-expect-error `other` isn't a placeholder in the path
          pathParam: { other: stringCodec() },
        },
      ],
    });
    defineAppRouter(Names, {
      routes: [
        {
          path: 'shows/:showId',
          routeName: Names.SHOW,
          // @ts-expect-error keyed by placeholder name, even for one placeholder
          pathParam: { codec: numberCodec() },
        },
      ],
    });
    defineAppRouter(Names, {
      routes: [
        {
          path: 'shows/:showId',
          routeName: Names.SHOW,
          // @ts-expect-error each entry is the codec itself
          pathParam: { showId: { codec: numberCodec() } },
        },
      ],
    });
    defineAppRouter(Names, {
      routes: [
        {
          path: 'static',
          routeName: Names.SHOW,
          // @ts-expect-error a path without placeholders takes no pathParam
          pathParam: { codec: numberCodec() },
        },
      ],
    });
  });
});

describe('queryParams', () => {
  enum Names {
    ITEMS = 'ITEMS',
  }

  it("are inherited by child routes, and a child can't declare the same key", () => {
    defineAppRouter(Names, {
      routes: [
        {
          path: '',
          queryParams: { page: queryParam({ codec: numberCodec() }) },
          children: [
            {
              path: 'items',
              routeName: Names.ITEMS,
              // @ts-expect-error `page` is declared above
              queryParams: { page: queryParam({ codec: stringCodec() }) },
            },
          ],
        },
      ],
    });
  });

  it('take only fields from queryParam()', () => {
    defineAppRouter(Names, {
      routes: [
        {
          path: 'items',
          routeName: Names.ITEMS,
          // @ts-expect-error a codec isn't a query field; wrap it in queryParam()
          queryParams: { page: numberCodec() },
        },
      ],
    });
  });

  it('can share a name with a placeholder, because path and query live apart', () => {
    const { AppRouter } = defineAppRouter(Names, {
      routes: [
        {
          path: 'search/:term',
          routeName: Names.ITEMS,
          queryParams: { term: queryParam({ codec: stringCodec() }) },
        },
      ],
    });
    const router = {} as TokenValue<typeof AppRouter>;
    expectTypeOf(router.routes.ITEMS.params().path.term).toEqualTypeOf<string>();
    expectTypeOf(router.routes.ITEMS.params().query.term).toEqualTypeOf<string | null>();
  });
});
