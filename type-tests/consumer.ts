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
