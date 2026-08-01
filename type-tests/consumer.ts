import {
  defineAppRouter,
  fallbackRoute,
  booleanPathParam,
  enumQueryParam,
  numberQueryParam,
  pathParam,
  queryParam,
  stringPathParam,
  stringQueryParam,
} from 'ngx-urlik';
import { withRouterConfig } from '@angular/router';

// @ts-expect-error route compiler implementation types are not public API
import type { RouteDefinition } from 'ngx-urlik';
// @ts-expect-error generated-tree implementation types are not public API
import type { RouterTree } from 'ngx-urlik';

const definition = defineAppRouter({
  routes: {
    ROOT: {
      path: '',
      children: {
        ITEM: {
          path: 'items',
          pathParam: stringPathParam({ name: 'itemId' }),
          queryParams: {
            filter: stringQueryParam(),
            required: stringQueryParam({ required: true }),
          },
        },
        FALLBACK: fallbackRoute({}),
      },
    },
  },
});

const redirects = defineAppRouter({
  routes: {
    ROOT: {
      path: '',
      children: {
        REDIRECT: {
          path: 'old',
          pathParam: stringPathParam({ name: 'oldId' }),
          redirectTo: ({ path }) => {
            path.oldId satisfies string;
            return router.ROOT.ITEM.createUrlTree({
              path: { itemId: path.oldId },
              query: { required: null },
            });
          },
        },
      },
    },
  },
});

fallbackRoute({
  // @ts-expect-error fallback routes only expose the documented non-path capabilities
  outlet: 'aside',
});

defineAppRouter({
  routes: {
    ROOT: {
      path: '',
      children: {
        BAD_REDIRECT: {
          path: 'old',
          redirectTo: () => router.ROOT.createUrlTree(),
          // @ts-expect-error redirects cannot render components
          component: class {},
        },
      },
    },
  },
});

defineAppRouter({
  routes: {
    // @ts-expect-error redirects must be functional; explicit undefined is not accepted
    ROOT: {
      path: '',
      redirectTo: undefined,
    },
  },
});

defineAppRouter({
  routes: {
    ROOT: {
      path: '',
      // @ts-expect-error unsupported Angular route property
      loadChildren: () => [],
    },
  },
});

defineAppRouter({
  routes: {
    ROOT: {
      path: '',
      children: {
        // @ts-expect-error generated router method names are reserved identities
        navigate: { path: 'reserved' },
      },
    },
  },
});

type TokenValue<T> = T extends import('@angular/core').InjectionToken<infer V> ? V : never;
declare const router: TokenValue<typeof definition.AppRouter>;
declare const redirectRouter: TokenValue<typeof redirects.AppRouter>;
router.ROOT.ITEM.createUrlTree({ path: { itemId: '1' }, query: { required: null } });
router.ROOT.createUrlTree();
router.ROOT.ITEM.urlParams().value().query.filter satisfies string | null;
router.ROOT.ITEM.urlParams().value().path.itemId satisfies string;
router.ROOT.FALLBACK.urlParams();
// @ts-expect-error redirects do not expose reactive state
redirectRouter.ROOT.REDIRECT.urlParams();
// @ts-expect-error router configuration belongs on defineAppRouter
redirects.provideAppRouter(withRouterConfig({ onSameUrlNavigation: 'reload' }));
// @ts-expect-error path values are required
router.ROOT.ITEM.createUrlTree({ query: { required: null } });
// @ts-expect-error required query properties are required but nullable
router.ROOT.ITEM.createUrlTree({ path: { itemId: '1' } });
// @ts-expect-error fallbacks have no construction API
router.ROOT.FALLBACK.createUrlTree();

// @ts-expect-error serializer values may not contain undefined
queryParam<string | undefined>({ serializer: { serialize: String, deserialize: () => undefined } });
// @ts-expect-error path serializer values may not contain undefined
pathParam<string | undefined, 'bad'>({
  name: 'bad',
  serializer: { serialize: String, deserialize: () => undefined },
});

const defaults = defineAppRouter({
  routes: {
    ROOT: {
      path: '',
      queryParams: {
        count: numberQueryParam({ defaultValue: 0 }),
        optional: numberQueryParam(),
        requiredNullable: numberQueryParam({ required: true }),
      },
    },
  },
});
declare const defaultsRouter: TokenValue<typeof defaults.AppRouter>;
defaultsRouter.ROOT.urlParams().value().query.count satisfies number;
defaultsRouter.ROOT.urlParams().value().query.optional satisfies number | null;
defaultsRouter.ROOT.createUrlTree({ query: { requiredNullable: null } });
// @ts-expect-error required query remains required even though its value is nullable
defaultsRouter.ROOT.createUrlTree();

booleanPathParam({ name: 'enabled' }).serializer.serialize(true) satisfies string | null;
enumQueryParam({ A: 'a', B: 'b' } as const).serializer.deserialize('a') satisfies 'a' | 'b' | null;
// @ts-expect-error numeric enums and records are unsupported
enumQueryParam({ A: 0, B: 1 } as const);
