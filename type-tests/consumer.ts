import { inject } from '@angular/core';
import { Router, UrlTree, withRouterConfig } from '@angular/router';
import { FormArray, FormControl, FormGroup } from '@angular/forms';
import { filter } from 'rxjs';
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
import {
  bindQueryParamsToFormGroup,
  createQueryParamsFormGroup,
  createQueryParamsSignalForm,
} from 'ngx-urlik/forms';

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

const itemQueryForm = createQueryParamsFormGroup(router.ROOT.ITEM);
itemQueryForm.controls.filter satisfies FormControl<string | null>;
itemQueryForm.controls.tags satisfies FormControl<readonly string[]>;

bindQueryParamsToFormGroup(
  router.ROOT.ITEM,
  new FormGroup({
    locale: new FormControl('en', { nonNullable: true }),
    filter: new FormControl<string | null>(null),
    required: new FormControl<string | null>(null),
    tags: new FormControl<readonly string[]>([], { nonNullable: true }),
    ids: new FormControl<readonly number[]>([], { nonNullable: true }),
  }),
  {
    transformWrites: (changes) =>
      changes.pipe(
        // @ts-expect-error query parameter names are typed
        filter((change) => change.param !== 'serach'),
      ),
  },
);

bindQueryParamsToFormGroup(
  router.ROOT.ITEM,
  // @ts-expect-error FormArray query controls are intentionally unsupported
  new FormGroup({
    locale: new FormControl('en', { nonNullable: true }),
    filter: new FormControl<string | null>(null),
    required: new FormControl<string | null>(null),
    tags: new FormArray([new FormControl('tag', { nonNullable: true })]),
    ids: new FormControl<readonly number[]>([], { nonNullable: true }),
  }),
);

createQueryParamsSignalForm(router.ROOT.ITEM, {
  schema: (query) => {
    query.filter;
    // @ts-expect-error path parameters are not part of the query form schema
    query.itemId;
  },
});

router.ROOT.ITEM.createUrlTree({
  path: { itemId: '1' },
  query: { required: null, tags: [] },
  fragment: 'section',
}) satisfies UrlTree | null;
router.ROOT.ITEM.createUrlTree({
  path: { itemId: '1' },
  query: { required: null, tags: [] },
  fragment: '',
});
router.ROOT.ITEM.navigate(
  {
    path: { itemId: '1' },
    query: { required: null, tags: [] },
    fragment: null,
  },
  {
    onSameUrlNavigation: 'reload',
    skipLocationChange: true,
    replaceUrl: true,
    state: { source: 'consumer' },
    info: { transition: 'forward' },
  },
);
router.ROOT.ITEM.urlParams().value().path.itemId satisfies string;
router.ROOT.ITEM.urlParams().value().query.locale satisfies string;
router.ROOT.ITEM.urlParams().value().query.filter satisfies string | null;
router.ROOT.ITEM.urlParams().value().query.tags satisfies readonly string[];
router.ROOT.ITEM.urlParams().value().query.ids satisfies readonly number[];
// @ts-expect-error fragments are construction-only URL state
router.ROOT.ITEM.urlParams().value().fragment;

const active = router
  .activeRoute({
    item: router.ROOT.ITEM,
    fallback: router.ROOT.FALLBACK,
  })
  .value();
if (active.route === 'item') {
  active.node satisfies typeof router.ROOT.ITEM;
  active.params.path.itemId satisfies string;
  active.params.query.required satisfies string | null;
} else {
  active.node satisfies typeof router.ROOT.FALLBACK;
  active.params.path satisfies Readonly<{}>;
  active.params.query.locale satisfies string;
  // @ts-expect-error fallback state does not contain item parameters
  active.params.path.itemId;
}
// @ts-expect-error candidates must be generated stateful route nodes
router.activeRoute({ invalid: {} });

router.ROOT.ITEM.createUrlTree({
  path: { itemId: '1' },
  query: { required: null, tags: [] },
  // @ts-expect-error fragments must be strings or null
  fragment: 1,
});
router.ROOT.ITEM.navigate(
  { path: { itemId: '1' }, query: { required: null, tags: [] } },
  {
    // @ts-expect-error browserUrl is excluded from typed route navigation
    browserUrl: '/display-only',
  },
);

router.escapeHatch.createUrlTree(['/items', '1']) satisfies UrlTree;
router.escapeHatch.navigate(['/items', '1'], {
  browserUrl: '/display-only',
}) satisfies Promise<boolean>;
router.escapeHatch.navigateByUrl('/items/1', {
  browserUrl: '/display-only',
}) satisfies Promise<boolean>;
router.escapeHatch.parseUrl('/items/1') satisfies UrlTree;
router.escapeHatch.serializeUrl(new UrlTree()) satisfies string;
router.escapeHatch.isActive('/items/1', true) satisfies boolean;
router.escapeHatch.isActive('/items/1', { paths: 'exact' }) satisfies boolean;
router.escapeHatch.url satisfies Router['url'];
router.escapeHatch.events satisfies Router['events'];
router.escapeHatch.currentNavigation satisfies Router['currentNavigation'];
router.escapeHatch.lastSuccessfulNavigation satisfies Router['lastSuccessfulNavigation'];
router.escapeHatch.navigated satisfies Router['navigated'];
router.escapeHatch.componentInputBindingEnabled satisfies Router['componentInputBindingEnabled'];
// @ts-expect-error escape-hatch observations are readonly
router.escapeHatch.navigated = false;
// @ts-expect-error raw router state is intentionally excluded
router.escapeHatch.routerState;
// @ts-expect-error route config is intentionally excluded
router.escapeHatch.config;
// @ts-expect-error route configuration mutation is intentionally excluded
router.escapeHatch.resetConfig;
// @ts-expect-error initial-navigation control is intentionally excluded
router.escapeHatch.initialNavigation;
// @ts-expect-error location-listener setup is intentionally excluded
router.escapeHatch.setUpLocationChangeListener;
// @ts-expect-error router disposal is intentionally excluded
router.escapeHatch.dispose;
// @ts-expect-error deprecated navigation observation is intentionally excluded
router.escapeHatch.getCurrentNavigation;
// @ts-expect-error deprecated mutable reuse strategy is intentionally excluded
router.escapeHatch.routeReuseStrategy;
// @ts-expect-error deprecated mutable same-URL setting is intentionally excluded
router.escapeHatch.onSameUrlNavigation;

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

const redirectDefinition = defineAppRouter({
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
declare const redirectRouter: TokenValue<typeof redirectDefinition.AppRouter>;
redirectRouter.ROOT.REDIRECT.createUrlTree({ fragment: 'legacy' });
redirectRouter.ROOT.REDIRECT.navigate({ fragment: null });
// @ts-expect-error redirects do not expose active parameter state
redirectRouter.activeRoute({ redirect: redirectRouter.ROOT.REDIRECT });

declare const nullableTree: UrlTree | null;
defineAppRouter({
  routes: {
    ROOT: {
      path: '',
      children: {
        REDIRECT: {
          path: 'old',
          // @ts-expect-error redirect callbacks must convert nullable construction to a definite tree
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

const globalQueries = inject(definition.AppRouter).globalQueryParams(
  {
    search: queryParam({ codec: stringCodec(), required: true }),
    count: queryParam({ codec: numberCodec(), defaultValue: 0 }),
    tags: repeatedQueryParam({ codec: stringCodec() }),
  },
  { isEqual: (previous, next) => previous.count === next.count },
);
const globalSearch: string | null = globalQueries.value().search;
const globalCount: number = globalQueries.value().count;
const globalTags: readonly string[] = globalQueries.value().tags;
const globalRef: import('ngx-urlik').GlobalQueryParamsRef<{ count: number }> = globalQueries;
// @ts-expect-error global references are read-only
globalQueries.updateQueryParams(() => ({}));
// @ts-expect-error decoded properties are readonly
globalQueries.value().count = 2;
// @ts-expect-error direct values have no query wrapper
globalQueries.value().query;
// @ts-expect-error only declared keys are readable
globalQueries.value().unknown;
inject(definition.AppRouter).globalQueryParams({
  // @ts-expect-error global definitions require query placement wrappers
  id: pathParam({ name: 'id', codec: stringCodec() }),
});
defineAppRouter({
  routes: {
    // @ts-expect-error globalQueryParams is reserved at the router root
    globalQueryParams: { path: '' },
  },
});

const exactDefinition = defineAppRouter({
  routes: {
    ROOT: {
      path: '',
      children: {
        ITEM: {
          path: 'item',
          pathParam: pathParam({ name: 'id', codec: numberCodec() }),
          queryParams: { search: queryParam({ codec: stringCodec() }) },
          exactMatch: {
            redirectTo: ({ path, query }): UrlTree => {
              path.id satisfies number;
              query.search satisfies string | null;
              // @ts-expect-error unknown path property
              path.noSuchKey;
              return new UrlTree();
            },
          },
          children: {
            DETAIL: { path: 'detail', exactMatch: { angular: { component: class {} } } },
          },
        },
      },
    },
  },
});
declare const exactRouter: TokenValue<typeof exactDefinition.AppRouter>;
exactRouter.ROOT.ITEM.createUrlTree({ path: { id: 1 } }) satisfies UrlTree | null;
exactRouter.ROOT.ITEM.urlParams().value().path.id satisfies number;
// @ts-expect-error exactMatch is not a generated public node
exactRouter.ROOT.ITEM.exactMatch;
// @ts-expect-error accumulated path is still required
exactRouter.ROOT.ITEM.createUrlTree();
defineAppRouter({
  routes: {
    ROOT: {
      path: '',
      children: {
        // @ts-expect-error empty child paths are forbidden
        BAD: { path: '' },
      },
    },
  },
});
defineAppRouter({
  routes: {
    // @ts-expect-error exactMatch must have an action
    ROOT: { path: '', exactMatch: {} },
  },
});
defineAppRouter({
  routes: {
    ROOT: {
      path: '',
      exactMatch: {
        angular: { component: class {} },
        // @ts-expect-error exactMatch cannot introduce query parameters
        queryParams: { q: queryParam({ codec: stringCodec() }) },
      },
    },
  },
});
defineAppRouter({
  routes: {
    ROOT: {
      path: '',
      // @ts-expect-error content and redirect are mutually exclusive
      exactMatch: { angular: { component: class {} }, redirectTo: () => new UrlTree() },
    },
  },
});
defineAppRouter({
  routes: {
    // @ts-expect-error exact redirects must return a definite UrlTree
    ROOT: { path: '', exactMatch: { redirectTo: () => nullableTree } },
  },
});

// Keep inference independent of callback/property order and annotation style.
const accumulatedDefinition = defineAppRouter({
  routes: {
    ROOT: {
      children: {
        ITEM: {
          exactMatch: {
            redirectTo: ({ path, query }) => {
              path.accountId satisfies string;
              path.id satisfies number;
              query.locale satisfies string;
              query.search satisfies string | null;
              // @ts-expect-error path properties are inferred, not any
              path.id satisfies string;
              // @ts-expect-error only declared queries are available
              query.missing;
              // @ts-expect-error decoded state is readonly
              path.id = 1;
              return new UrlTree();
            },
            angular: {
              canMatch: [(_route, segments) => segments.length === 0],
              data: { exact: true },
            },
          },
          path: 'item',
          pathParam: pathParam({ name: 'id', codec: numberCodec() }),
          queryParams: { search: queryParam({ codec: stringCodec() }) },
          children: {
            OLD: {
              path: 'old',
              redirectTo: ({ path, query }) => {
                path.accountId satisfies string;
                path.id satisfies number;
                query.locale satisfies string;
                query.search satisfies string | null;
                // @ts-expect-error ordinary redirect callbacks also reject unknown paths
                path.missing;
                // @ts-expect-error ordinary redirect callbacks also reject unknown queries
                query.missing;
                return new UrlTree();
              },
            },
          },
        },
      },
      path: 'account',
      pathParam: pathParam({ name: 'accountId', codec: stringCodec() }),
      queryParams: { locale: queryParam({ codec: stringCodec(), defaultValue: 'en' }) },
    },
  },
});
declare const accumulatedRouter: TokenValue<typeof accumulatedDefinition.AppRouter>;
accumulatedRouter.ROOT.ITEM.createUrlTree({ path: { accountId: 'a', id: 1 } });
// @ts-expect-error inherited path is required for construction
accumulatedRouter.ROOT.ITEM.createUrlTree({ path: { id: 1 } });
// @ts-expect-error terminal redirects remain stateless
accumulatedRouter.ROOT.ITEM.OLD.urlParams();

defineAppRouter({
  routes: {
    ROOT: {
      path: '',
      // @ts-expect-error both content loaders are forbidden
      exactMatch: {
        angular: { component: class {}, loadComponent: async () => class {} },
      },
    },
  },
});
defineAppRouter({
  routes: {
    ROOT: {
      path: '',
      // @ts-expect-error exact content must specify a component or loader
      exactMatch: {
        angular: { data: {} },
      },
    },
  },
});
defineAppRouter({
  routes: {
    ROOT: {
      path: '',
      exactMatch: {
        redirectTo: () => new UrlTree(),
        angular: {
          // @ts-expect-error exact redirects do not run activation guards
          canActivate: [() => true],
        },
      },
    },
  },
});
defineAppRouter({
  routes: {
    ROOT: {
      path: '',
      exactMatch: {
        angular: {
          component: class {},
          // @ts-expect-error Angular matching is owned by the compiler
          pathMatch: 'prefix',
        },
      },
    },
  },
});
defineAppRouter({
  routes: {
    ROOT: {
      path: '',
      exactMatch: {
        angular: { component: class {} },
        // @ts-expect-error exactMatch cannot introduce paths
        path: 'other',
      },
    },
  },
});
defineAppRouter({
  routes: {
    ROOT: {
      path: '',
      exactMatch: {
        angular: { component: class {} },
        // @ts-expect-error exactMatch cannot introduce path parameters
        pathParam: pathParam({ name: 'id', codec: numberCodec() }),
      },
    },
  },
});
defineAppRouter({
  routes: {
    ROOT: {
      path: '',
      exactMatch: {
        angular: { component: class {} },
        // @ts-expect-error exactMatch cannot introduce children
        children: { CHILD: { path: 'child' } },
      },
    },
  },
});
defineAppRouter({
  routes: {
    ROOT: {
      path: '',
      exactMatch: {
        angular: { component: class {} },
        // @ts-expect-error exactMatch cannot introduce equality options
        isEqual: () => true,
      },
    },
  },
});
defineAppRouter({
  routes: {
    ROOT: {
      path: '',
      redirectTo: () => new UrlTree(),
      // @ts-expect-error terminal redirects cannot have exactMatch
      exactMatch: { angular: { component: class {} } },
    },
  },
});
defineAppRouter({
  routes: {
    ROOT: {
      path: '',
      children: {
        FALLBACK: {
          path: '**',
          // @ts-expect-error wildcard routes cannot have exactMatch
          exactMatch: { angular: { component: class {} } },
        },
      },
    },
  },
});
defineAppRouter({
  routes: {
    ROOT: {
      path: '',
      exactMatch: {
        // @ts-expect-error invalid callback return types are rejected
        redirectTo: () => '/somewhere',
      },
    },
  },
});

// Route names must not change the inference algorithm.
const namedLikeOptions = defineAppRouter({
  routes: {
    angular: {
      path: '',
      children: {
        queryParams: {
          path: 'q',
          pathParam: pathParam({ name: 'id', codec: numberCodec() }),
          exactMatch: {
            redirectTo: ({ path }) => {
              path.id satisfies number;
              // @ts-expect-error no untyped index signature
              path.missing;
              return new UrlTree();
            },
          },
        },
      },
    },
  },
});
inject(namedLikeOptions.AppRouter).angular.queryParams.createUrlTree({ path: { id: 1 } });

defineAppRouter({
  routes: { ROOT: { path: '', isEqual: (previous, next) => Object.is(previous, next) } },
});
defineAppRouter({
  routes: {
    ROOT: {
      path: '',
      // @ts-expect-error children are named records, not arrays
      children: [],
    },
  },
});
defineAppRouter({
  routes: {
    ROOT: {
      path: '',
      // @ts-expect-error children cannot be null
      children: null,
    },
  },
});
defineAppRouter({
  routes: {
    ROOT: {
      path: '',
      // @ts-expect-error redirect callbacks must be functions
      redirectTo: '/other',
    },
  },
});
defineAppRouter({
  routes: {
    // @ts-expect-error every named route requires a path
    ROOT: { angular: { component: class {} } },
  },
});
