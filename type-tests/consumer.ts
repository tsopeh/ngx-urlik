import { inject } from '@angular/core';
import { FormArray, FormControl, FormGroup } from '@angular/forms';
import { Router, UrlTree, withRouterConfig } from '@angular/router';
// @ts-expect-error route compiler implementation types are not public API
type InternalRouteDefinition = import('ngx-urlik').RouteDefinition;
// @ts-expect-error generated-tree implementation types are not public API
type InternalRouterTree = import('ngx-urlik').RouterTree;
import {
  booleanCodec,
  defineAppRouter,
  delimitedQueryParam,
  enumCodec,
  numberCodec,
  queryParam,
  repeatedQueryParam,
  stringCodec,
} from 'ngx-urlik';
import {
  bindQueryParamsToFormGroup,
  createQueryParamsFormGroup,
  createQueryParamsSignalForm,
} from 'ngx-urlik/forms';
import { filter } from 'rxjs';

const definition = defineAppRouter({
  routes: [
    {
      path: '',
      queryParams: { locale: queryParam({ codec: stringCodec(), defaultValue: 'en' }) },
      children: [
        {
          path: 'items/:itemId',
          identifier: 'ITEM',
          pathParam: { codec: stringCodec() },
          queryParams: {
            filter: queryParam({ codec: stringCodec() }),
            required: queryParam({ codec: stringCodec(), required: true }),
            tags: repeatedQueryParam({ codec: stringCodec(), required: true }),
            ids: delimitedQueryParam({ codec: numberCodec(), separator: ',' }),
          },
          loadComponent: async () => class {},
        },
        { path: '', identifier: 'HOME', component: class {} },
        { path: '**', component: class {} },
      ],
    },
  ],
});

type TokenValue<T> = T extends import('@angular/core').InjectionToken<infer Value> ? Value : never;
declare const router: TokenValue<typeof definition.AppRouter>;

const itemQueryForm = createQueryParamsFormGroup(router.routes.ITEM);
itemQueryForm.controls.filter satisfies FormControl<string | null>;
itemQueryForm.controls.tags satisfies FormControl<readonly string[]>;
bindQueryParamsToFormGroup(
  router.routes.ITEM,
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
  router.routes.ITEM,
  // @ts-expect-error FormArray query controls are intentionally unsupported
  new FormGroup({
    locale: new FormControl('en', { nonNullable: true }),
    filter: new FormControl<string | null>(null),
    required: new FormControl<string | null>(null),
    tags: new FormArray([new FormControl('tag', { nonNullable: true })]),
    ids: new FormControl<readonly number[]>([], { nonNullable: true }),
  }),
);
createQueryParamsSignalForm(router.routes.ITEM, {
  schema: (query) => {
    query.filter;
    // @ts-expect-error path parameters are not query form fields
    query.itemId;
  },
});

router.routes.ITEM.createUrlTree({
  path: { itemId: '1' },
  query: { required: null, tags: [] },
  fragment: 'section',
}) satisfies UrlTree | null;
router.routes.ITEM.navigate(
  { path: { itemId: '1' }, query: { required: null, tags: [] }, fragment: null },
  {
    onSameUrlNavigation: 'reload',
    skipLocationChange: true,
    replaceUrl: true,
    state: { source: 'consumer' },
    info: { transition: 'forward' },
  },
);
router.routes.ITEM.params().path.itemId satisfies string;
router.routes.ITEM.params().query.locale satisfies string;
router.routes.ITEM.params().query.filter satisfies string | null;
router.routes.ITEM.params().query.tags satisfies readonly string[];
router.routes.ITEM.params().query.ids satisfies readonly number[];
router.routes.ITEM.patchQuery({ filter: 'active' }) satisfies Promise<boolean>;
router.routes.ITEM.patchQuery((query) => ({ tags: [...query.tags, 'admin'] }));
// @ts-expect-error patches only accept declared query keys
router.routes.ITEM.patchQuery({ itemId: '1' });
// @ts-expect-error patch values retain codec types
router.routes.ITEM.patchQuery({ tags: 'admin' });
// @ts-expect-error functional patches retain codec types
router.routes.ITEM.patchQuery(() => ({ filter: 123 }));
// @ts-expect-error committed route state is readonly
router.routes.ITEM.params().query.filter = 'changed';
// @ts-expect-error route state has no fragment
router.routes.ITEM.params().fragment;
// @ts-expect-error routes without identifiers have no generated node
router.routes.FALLBACK;
// @ts-expect-error path values are required
router.routes.ITEM.createUrlTree({ query: { required: null, tags: [] } });
// @ts-expect-error required scalar query properties must be explicit
router.routes.ITEM.createUrlTree({ path: { itemId: '1' }, query: { tags: [] } });
// @ts-expect-error required array query properties must be explicit
router.routes.ITEM.createUrlTree({ path: { itemId: '1' }, query: { required: null } });
router.routes.ITEM.createUrlTree({
  path: { itemId: '1' },
  query: { required: null, tags: [] },
  // @ts-expect-error fragments must be strings or null
  fragment: 1,
});
router.routes.ITEM.navigate(
  { path: { itemId: '1' }, query: { required: null, tags: [] } },
  {
    // @ts-expect-error browserUrl is excluded from typed route navigation
    browserUrl: '/display-only',
  },
);

const active = router.activeRoute({ item: router.routes.ITEM, home: router.routes.HOME })();
if (active.route === 'item') {
  active.node satisfies typeof router.routes.ITEM;
  active.params.path.itemId satisfies string;
  active.params.query.required satisfies string | null;
} else {
  active.node satisfies typeof router.routes.HOME;
  active.params.path satisfies Readonly<{}>;
  active.params.query.locale satisfies string;
  // @ts-expect-error HOME has no item path parameter
  active.params.path.itemId;
}
// @ts-expect-error candidates must be generated stateful route nodes
router.activeRoute({ invalid: {} });

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
router.escapeHatch.url satisfies Router['url'];
router.escapeHatch.events satisfies Router['events'];
router.escapeHatch.currentNavigation satisfies Router['currentNavigation'];
router.escapeHatch.lastSuccessfulNavigation satisfies Router['lastSuccessfulNavigation'];
router.escapeHatch.navigated satisfies Router['navigated'];
// @ts-expect-error escape-hatch observations are readonly
router.escapeHatch.navigated = false;
// @ts-expect-error raw router state is intentionally excluded
router.escapeHatch.routerState;
// @ts-expect-error route configuration mutation is intentionally excluded
router.escapeHatch.resetConfig;

// @ts-expect-error Angular route options are direct fields
defineAppRouter({ routes: [{ path: '', angular: { component: class {} } }] });
defineAppRouter({ routes: [{ path: '', component: class {} }] });
defineAppRouter({ routes: [{ matcher: () => null, component: class {} }] });
defineAppRouter({
  routes: [
    { path: 'old', redirectTo: '/new' },
    { path: 'new', identifier: 'NEW' },
  ],
});
defineAppRouter({
  routes: [
    {
      path: 'old',
      redirectTo: '/new',
      // @ts-expect-error redirects cannot receive an identifier
      identifier: 'OLD',
    },
  ],
});
defineAppRouter({
  routes: [
    {
      path: '**',
      // @ts-expect-error wildcard routes cannot receive an identifier
      identifier: 'FALLBACK',
    },
  ],
});

// @ts-expect-error null is reserved outside codec value types
queryParam<string | null>({ codec: stringCodec() });
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
const globalSearch: string | null = globalQueries().search;
const globalCount: number = globalQueries().count;
const globalTags: readonly string[] = globalQueries().tags;
const globalRef: import('@angular/core').Signal<{ readonly count: number }> = globalQueries;
// @ts-expect-error global references are read-only
globalQueries.patchQuery(() => ({}));
// @ts-expect-error decoded properties are readonly
globalQueries().count = 2;
// @ts-expect-error direct values have no query wrapper
globalQueries().query;
// @ts-expect-error only declared keys are readable
globalQueries().unknown;
inject(definition.AppRouter).globalQueryParams({
  // @ts-expect-error global definitions require query placement wrappers
  id: { codec: stringCodec() },
});

const accumulated = defineAppRouter({
  routes: [
    {
      path: 'account/:accountId',
      pathParam: { codec: stringCodec() },
      queryParams: { locale: queryParam({ codec: stringCodec(), defaultValue: 'en' }) },
      children: [
        {
          path: 'item/:id',
          identifier: 'DETAIL',
          pathParam: { codec: numberCodec() },
          queryParams: { search: queryParam({ codec: stringCodec() }) },
          children: [{ path: '', identifier: 'LANDING', component: class {} }],
        },
      ],
    },
  ],
});
const detail = inject(accumulated.AppRouter).routes.DETAIL;
detail.createUrlTree({ path: { accountId: 'a', id: 1 } });
detail.params().path.accountId satisfies string;
detail.params().path.id satisfies number;
detail.params().query.locale satisfies string;
detail.params().query.search satisfies string | null;
// @ts-expect-error inherited path is required for construction
detail.createUrlTree({ path: { id: 1 } });
inject(accumulated.AppRouter).routes.LANDING.createUrlTree({ path: { accountId: 'a', id: 1 } });

defineAppRouter({
  routes: [
    {
      path: 'shows/:showId/season/:season',
      identifier: 'SHOW',
      // @ts-expect-error multiple placeholders need a complete keyed codec map
      pathParam: { showId: { codec: stringCodec() } },
    },
  ],
});
defineAppRouter({
  routes: [
    {
      path: 'static',
      identifier: 'STATIC',
      // @ts-expect-error pathParam needs a placeholder
      pathParam: { codec: numberCodec() },
    },
  ],
});
