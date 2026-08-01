import {
  defineAppRouter,
  fallbackRoute,
  queryParam,
  stringPathParam,
  stringQueryParam,
} from 'ngx-urlik';
import { withRouterConfig } from '@angular/router';

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

defineAppRouter({
  routes: {
    ROOT: {
      path: '',
      // @ts-expect-error unsupported Angular route property
      loadChildren: () => [],
    },
  },
});

type TokenValue<T> = T extends import('@angular/core').InjectionToken<infer V> ? V : never;
declare const router: TokenValue<typeof definition.AppRouter>;
declare const redirectRouter: TokenValue<typeof redirects.AppRouter>;
router.ROOT.ITEM.createUrlTree({ path: { itemId: '1' }, query: { required: null } });
router.ROOT.createUrlTree();
router.ROOT.ITEM.urlParams().value().query.filter satisfies string | null;
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
