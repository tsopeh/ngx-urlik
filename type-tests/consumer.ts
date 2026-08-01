import { inject } from '@angular/core';
import { UrlTree, withRouterConfig } from '@angular/router';
import {
  booleanCodec,
  defineAppRouter,
  delimitedQueryParam,
  enumCodec,
  numberCodec,
  pathParam,
  queryParam,
  repeatedQueryParam,
  stringCodec,
} from 'ngx-urlik';

// @ts-expect-error route compiler implementation types are not public API
import type { RouteDefinition } from 'ngx-urlik';
// @ts-expect-error generated-tree implementation types are not public API
import type { RouterTree } from 'ngx-urlik';

const definition = defineAppRouter({
  routes: {
    ROOT: {
      path: '',
      queryParams: {
        locale: queryParam({ codec: stringCodec(), defaultValue: 'en' }),
      },
      children: {
        ITEM: {
          path: 'items',
          pathParam: pathParam({ name: 'itemId', codec: stringCodec() }),
          queryParams: {
            filter: queryParam({ codec: stringCodec() }),
            required: queryParam({ codec: stringCodec(), required: true }),
            tags: repeatedQueryParam({ codec: stringCodec(), required: true }),
            ids: delimitedQueryParam({ codec: numberCodec(), separator: ',' }),
          },
          angular: { loadComponent: async () => class {} },
        },
        FALLBACK: { path: '**' },
      },
    },
  },
});

type TokenValue<T> = T extends import('@angular/core').InjectionToken<infer Value> ? Value : never;
declare const router: TokenValue<typeof definition.AppRouter>;

router.ROOT.ITEM.createUrlTree({
  path: { itemId: '1' },
  query: { required: null, tags: [] },
}) satisfies UrlTree | null;
router.ROOT.ITEM.navigate({
  path: { itemId: '1' },
  query: { required: null, tags: [] },
});
router.ROOT.ITEM.urlParams().value().path.itemId satisfies string;
router.ROOT.ITEM.urlParams().value().query.locale satisfies string;
router.ROOT.ITEM.urlParams().value().query.filter satisfies string | null;
router.ROOT.ITEM.urlParams().value().query.tags satisfies readonly string[];
router.ROOT.ITEM.urlParams().value().query.ids satisfies readonly number[];

// @ts-expect-error path values are required
router.ROOT.ITEM.createUrlTree({ query: { required: null, tags: [] } });
// @ts-expect-error required scalar query properties must be explicit
router.ROOT.ITEM.createUrlTree({ path: { itemId: '1' }, query: { tags: [] } });
// @ts-expect-error required array query properties must be explicit
router.ROOT.ITEM.createUrlTree({ path: { itemId: '1' }, query: { required: null } });
// @ts-expect-error fallback routes have no construction API
router.ROOT.FALLBACK.createUrlTree();

defineAppRouter({
  routes: {
    ROOT: {
      path: '',
      // @ts-expect-error Angular-owned properties belong under angular
      component: class {},
    },
  },
});

defineAppRouter({
  routes: {
    ROOT: {
      path: '',
      children: {
        REDIRECT: {
          path: 'old',
          redirectTo: () => new UrlTree(),
        },
      },
    },
  },
});

declare const nullableTree: UrlTree | null;
defineAppRouter({
  routes: {
    // @ts-expect-error redirect callbacks must convert nullable construction to a definite tree
    ROOT: {
      path: '',
      children: {
        REDIRECT: {
          path: 'old',
          redirectTo: () => nullableTree,
        },
      },
    },
  },
});

// @ts-expect-error null is reserved outside codec value types
queryParam<string | null>({ codec: stringCodec() });
// @ts-expect-error undefined is reserved outside codec value types
pathParam<string | undefined, 'bad'>({ name: 'bad', codec: stringCodec() });

booleanCodec().serialize(true) satisfies string | null;
numberCodec().deserialize('1') satisfies number | null;
enumCodec({ A: 'a', B: 'b' } as const).deserialize('a') satisfies 'a' | 'b' | null;
// @ts-expect-error numeric enums and records are unsupported
enumCodec({ A: 0, B: 1 } as const);

// @ts-expect-error router configuration belongs on defineAppRouter
definition.provideAppRouter(withRouterConfig({ onSameUrlNavigation: 'reload' }));

const injectionAwareDefault = queryParam({
  codec: stringCodec(),
  defaultValue: () => inject(class Settings {}).toString(),
});
injectionAwareDefault satisfies unknown;
