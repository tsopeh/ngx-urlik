# Typed App Router design

Status: accepted product design for Angular 22.

## Vision

`ngx-urlik` is a signal-first typed layer over Angular Router. The application declares one complete static tree and receives an application-specific injectable router. Angular remains responsible for matching, activation, navigation, browser history, parsing, and encoding.

The library owns:

- static route identity and structural validation;
- deterministic absolute URL construction;
- pure reusable parameter codecs and placement policy;
- typed accumulated path/query state;
- route-scoped query updates;
- contextual equality and parameter diagnostics.

## Canonical example

```ts
const { AppRouter, provideAppRouter } = defineAppRouter({
  diagnostics: {
    warn: (diagnostic) => telemetry.record('router-warning', diagnostic),
  },
  routes: {
    ROOT: {
      path: '',
      queryParams: {
        locale: queryParam({
          codec: stringCodec(),
          defaultValue: () => inject(LocaleSettings).defaultLocale(),
        }),
      },
      children: {
        WORKSPACE: {
          path: 'workspace',
          pathParam: pathParam({
            name: 'workspaceId',
            codec: stringCodec(),
          }),
          queryParams: {
            tab: queryParam({
              codec: enumCodec(WorkspaceTab),
              required: true,
            }),
            members: repeatedQueryParam({ codec: stringCodec() }),
          },
          angular: {
            loadComponent: () =>
              import('./workspace.component').then((module) => module.WorkspaceComponent),
          },
        },
        LEGACY: {
          path: 'legacy',
          pathParam: pathParam({ name: 'workspaceId', codec: stringCodec() }),
          redirectTo: ({ path }) =>
            inject(AppRouter).ROOT.WORKSPACE.createUrlTree({
              path: { workspaceId: path.workspaceId },
              query: { tab: null },
            }) ?? inject(Router).parseUrl('/'),
        },
        NOT_FOUND: {
          path: '**',
          angular: {
            loadComponent: () =>
              import('./not-found.component').then((module) => module.NotFoundComponent),
          },
        },
      },
    },
  },
});
```

## Route tree and identity

- There is exactly one named root.
- Children are keyed objects; keys are stable application identities independent of URL segments.
- `navigate`, `createUrlTree`, and `urlParams` are reserved identities.
- `escapeHatch`, `activeRoute`, and `globalQueryParams` are additionally reserved at the application-router root.
- Only the application root may declare `path: ''`. Exact-path content or redirects belong in `exactMatch`.
- Ordinary routes contribute one static segment and optionally one dynamic segment immediately after it.
- Static paths may not contain Angular path syntax; multiple segments require nested definitions.
- Components may be lazy, but route definitions may not be lazy or contributed later.
- Generated Angular `Routes` remain private.

## Route kinds

Ordinary routes may have `pathParam`, `queryParams`, children, equality configuration, and an `angular` options object. Componentless leaves remain valid.

Redirect routes are discriminated by `redirectTo`. Their callback receives typed accumulated source state and must synchronously return a definite `UrlTree`. Because typed construction can return `null`, redirect code must choose an explicit fallback. Redirects support only `canMatch`, `providers`, and `data` under `angular`; they have construction methods but no `urlParams()`.

Fallback routes use the literal `path: '**'`. There may be at most one per sibling branch and it must be declared last. A fallback has state but no canonical construction/navigation methods. It cannot have a path parameter, redirect, or children.

### Exact-match behavior

An ordinary route may declare `exactMatch` for its own exact path. Query parameters and
fragments do not affect this selection. It contains exactly one component, lazy component
loader, or redirect callback:

```ts
ACCOUNT: {
  path: 'account',
  angular: { component: AccountLayout },
  exactMatch: { angular: { component: AccountOverview } },
  children: {
    SETTINGS: { path: 'settings', angular: { component: AccountSettings } },
  },
}
```

The containing route's component keeps Angular's normal layout behavior. Exact content
renders through its outlet, or through the enclosing outlet when the route has no component.
The same property works on the application root and on leaves. Without it, normal Angular
behavior is unchanged, including a layout with an empty outlet at its own URL.

Content supports the existing `angular` route options, including page-specific guards,
resolvers, providers, data and title. `component` and `loadComponent` are mutually exclusive.
A redirect uses `exactMatch: { redirectTo: ({ path, query }) => urlTree, angular? }` and supports
only the existing redirect subset (`canMatch`, `providers`, `data`). Its callback receives
accumulated decoded parameters and must return a definite `UrlTree`. Top-level `redirectTo`
remains a terminal redirect; `exactMatch.redirectTo` leaves deeper destinations accessible.
Wildcards and top-level redirect routes cannot declare `exactMatch`.

`exactMatch` declares no path, path parameter, query definitions, children, or equality.
Parameters belong to the named route. It has no public node, navigation methods, or state
reference. Navigate and observe through the named route, which remains active on descendants.
There is no new exact-page-active observation interface. Angular receives a private empty
child with full matching; guards/providers under `exactMatch.angular` belong to that child,
while the containing route's options retain their normal scope. Angular forbids `canMatch`
on a redirect itself, so guarded redirects use an additional anonymous full-match child
beneath the guard and its providers. Rejecting an exact-match guard leaves the named route
eligible; Angular can try its other children, including a local wildcard.

Migration: move a child's `INDEX: { path: '', angular, redirectTo }` to the containing route's
`exactMatch: { angular, redirectTo }` (choosing content or redirect). Move query definitions
and equality to the named route; those parameters are now inherited by its descendants.
Replace references to `.INDEX` with the named route. See [ADR 0014](../adr/0014-exact-match.md).

## Angular options

Framework-owned route fields live under `angular`:

```ts
angular: {
  component,
  loadComponent,
  canMatch,
  canActivate,
  canActivateChild,
  canDeactivate,
  resolve,
  data,
  title,
  providers,
  runGuardsAndResolvers,
}
```

`component` and `loadComponent` are mutually exclusive. ngx-urlik forwards these values without reproducing Angular runtime behavior.

## Codecs and placement

```ts
interface UrlParamCodec<T> {
  serialize(value: T): string | null;
  deserialize(raw: string): T | null;
}
```

Codecs handle one decoded scalar string. `T` cannot contain `null` or `undefined`; `null` means conversion failed. Codecs are pure and calling Angular `inject()` inside them is unsupported. Built-ins cover strings, numbers, booleans, and readonly string-valued enums/records.

Placement wrappers add URL policy:

```ts
pathParam({ name, codec });
queryParam({ codec, required, defaultValue });
repeatedQueryParam({ codec, required, defaultValue });
delimitedQueryParam({ codec, separator, required, defaultValue });
```

Codec calls are guarded by the library. A thrown codec error becomes a diagnostic and invalid data. Default factories are consumer callbacks, execute in the application injection context, and propagate their own exceptions.

### Built-in scalar semantics

- Strings preserve a present empty query value; empty path segments remain invalid.
- Numbers require whole-value parsing. Finite numbers and signed infinities are valid; `NaN`, empty strings, and partial forms are invalid.
- Booleans accept only lowercase `true` and `false`.
- Enums accept only declared string values; numeric and heterogeneous enums are invalid.

### Query cardinality

Scalar queries use the final value when a physical key repeats.

Repeated arrays map physical values directly:

```text
?tag=a&tag=b → ['a', 'b']
```

Delimited arrays require exactly one physical key:

```text
?tag=a,b → ['a', 'b']
```

Each delimited element is encoded with `encodeURIComponent` before joining. A comma inside an item therefore appears as `%252C` in the physical URL after Angular applies the outer query encoding. Separators must be exactly one character that `encodeURIComponent` always escapes. Repeated physical keys invalidate a delimited value; representations are never mixed.

Absent arrays resolve to `[]`. Empty elements are retained when their codec accepts the empty string. One invalid element invalidates the complete collection and selects its current default or `[]`.

## Defaults and required construction

Query defaults may be values or synchronous injection-aware factories. Missing and malformed reads resolve to the current default. A value deeply equal to the current default is omitted from canonical construction.

`required: true` requires the construction property to be present but does not demand a physical key. `null` remains a valid explicit scalar decision and `[]` remains a valid explicit array decision.

Path values are always required and non-null. Parameter names share one namespace along a route chain; descendants may not shadow ancestor path or query names.

## Deterministic construction

Ordinary and redirect nodes expose:

```ts
createUrlTree({ path, query, fragment }): UrlTree | null;
navigate(values, options?): Promise<boolean>;
```

Construction is absolute and never inherits current query state. Invalid query values are diagnosed and omitted while the remaining URL is constructed. Invalid path construction returns `null`; `navigate()` then resolves `false` without invoking Angular.

Construction accepts an optional `fragment?: string | null`. Fragments are not declared or codec-backed and do not appear in `urlParams()` state. First-party navigation supports Angular's navigation behavior options except `browserUrl`; an arbitrary display URL would contradict deterministic typed construction.

Query declaration order is deterministic: ancestors precede descendants, with source order retained at each level.

## Reactive state and updates

```ts
interface UrlParamsRef<Path, Query> {
  readonly value: Signal<Readonly<{ path: Path; query: Query }>>;
  updateQueryParams(
    updater: (previous: Readonly<Query>) => Query,
    options?: { replaceUrl?: boolean },
  ): Promise<boolean>;
}
```

Every declared query property exists in state. Optional scalar values use `null`; arrays use `[]`. Reading an inactive node or an invalid accumulated active path throws a semantic error.

Updates preserve the current path, fragment, descendant-owned query keys, and unknown keys. All
route refs and forms share one coordinator per generated router tree. Writes execute in submission
order, each updater invoked once against fresh committed owned state, independently of signal
equality. Updaters execute asynchronously; exceptions reject the returned promise. Later same-field
writes win. Each write retains its own history option and Angular navigation result.

External navigation cancels waiting writes at navigation start, even if navigation is later blocked.
Canceled writes resolve false without running their updater; submissions during pending external
navigation are declined. Guard redirects also cancel waiting work. Ordinary guard rejection or an
error affects only its write; later writes continue. Same-URL skips resolve false and allow subsequent
writes. Router-tree destruction settles waiting and active callers as false. See ADR 0011.

### Global query observation

Status: implemented. See ADR 0012.

`router.globalQueryParams(definitions, options?)` is an advanced, read-only API for observing
query parameters independently of the active route. Prefer route declarations and `urlParams()`
for page-owned state. Global observation supports services that follow a convention such as
`timeRange` across pages, and ad hoc observers that do not own a route declaration.

```ts
const global = router.globalQueryParams(
  {
    timeRange: queryParam({ codec: stringCodec(), defaultValue: 'last-7-days' }),
    tags: repeatedQueryParam({ codec: stringCodec() }),
  },
  // Optional: { isEqual: (previous, next) => boolean }
);

global.value().timeRange;
global.value().tags;
```

The definitions object maps physical query keys to the existing `queryParam`,
`repeatedQueryParam`, or `delimitedQueryParam` definitions. Existing codecs, cardinality,
defaults, and malformed-value fallback rules apply. `required` is accepted for definition reuse
but has no effect on reads. Default factories execute in the application injection context,
as they do for route references.

The returned reference exposes only `value`, a signal of the readonly decoded query object,
without a `query` wrapper or path state. There is no update method in this version. Each
reference interprets its keys using its own definitions, including when a key is declared on
a route or by another global reference. Shared definition objects can provide consistent
interpretation; creating a reference does not register parameters in the static route tree.

Global and page references use the same router snapshot timing and decoding rules. Global
references refresh alongside page references on `NavigationEnd`; they do not observe attempted
navigation values separately. A global service can read before a page exists: the current
snapshot is used, and absent keys resolve to their defaults, `null`, or `[]`. There is no
separate loading state or requirement for a particular route to be active.

The optional second argument accepts `{ isEqual }`, comparing the complete decoded query object.
The default is the library's deep `isEqual()`. Changes to the page or unrelated query keys do
not notify consumers when the observed decoded values remain equal. Route-level equality
configuration does not choose the comparator for an independent global reference.

The method belongs directly to the injected router, alongside its other typed APIs. Once the
caller holds the router instance, it may call the method outside an injection context, including
from ordinary service methods. The router owns the navigation subscription and application
injector; individual computed references require no caller-specific cleanup.

Global observation does not make parameters persist across navigation or alter URL construction.
Applications may observe values for mapping or persistence, but this API does not restore them
to the URL. A future update API remains deferred; the reference object leaves room for extension.

### Query form bindings

The optional `ngx-urlik/forms` entry point binds the accumulated query state of one active stateful
route node to Angular Reactive Forms or Signal Forms. Path parameters are excluded. The entry point
provides bind and create helpers for both forms systems.

Reactive forms use an exact flat group with one `FormControl` for every query property. Optional
scalars retain `null`, and repeated or delimited arrays remain array-valued controls rather than
`FormArray` instances. The creator adds no validators; applications that need validators construct
the exact group and bind it. Signal forms bind an Angular `FieldTree`; their creator returns its
writable model and field tree and accepts an optional Angular schema.

Bindings require an injection context and clean themselves up with `DestroyRef`. The active URL
initializes the form synchronously. External navigation, including browser history navigation,
cancels pending writes and resets the form to the URL state as a pristine and untouched baseline.
Coordinated query writes preserve interaction state and unrelated staged field edits. Origin is
tracked by navigation identity rather than URL equality. External navigation cancels staged edits
at its start, even if subsequently blocked.

Form changes become typed per-parameter RxJS events containing the changed key and value, the full
raw query snapshot, and parameter/form validity and pending metadata. `transformWrites` may return a
mapped, filtered, grouped, debounced, or throttled stream. The library supplies no replacement
operator catalog; documentation demonstrates standard RxJS `groupBy` composition. Validation does
not gate writes unless the transformation filters events.

Automatic writes use `replaceUrl: true` by default. Each transformed emission submits only its
changed field to the shared coordinator, merged into fresh query state at execution time. Debounced
edits take their place in submission order when the transformation emits. Bindings do not batch
writes or maintain a second navigation queue. Destroying a binding cancels its waiting writes but
does not abort an already-started navigation. Failed writes retain entered form values and are not
retried automatically.

Signal bindings observe the form model value, so native Signal Forms debounce precedes any debounce
inside `transformWrites`. Applying both to one field intentionally delays twice.

## Typed activation context

A component shared by several route nodes can select the finite set of activation contexts it supports:

```ts
const detail = router.activeRoute({
  left: router.ROOT.LEFT.DETAIL,
  right: router.ROOT.RIGHT.DETAIL,
});
```

`detail.value` is a signal whose value is a discriminated union keyed by the supplied aliases. Each member contains `route`, the exact generated `node`, and that node's typed accumulated `params`. Navigation between candidates updates the signal. When ancestors and descendants are both candidates, the deepest active node wins, regardless of candidate declaration order. Selection considers only named route candidates; the private exact-match child has no public identity. Aliases of the same node tie; the first declared alias wins. Reading it while none of the candidates is active throws a semantic state error.

Candidates must be stateful generated nodes; redirects are excluded. The explicit candidate set keeps shared-component contracts local and avoids an application-wide union. Angular remains the matching and activation engine; ngx-urlik maps the active Angular snapshot back to the selected static route identity.

## Equality

Exported `isEqual()` is the default complete-state comparator. It supports `Object.is` primitives, nested arrays, dates, matching prototypes, and recursively enumerable string/symbol properties. Cycles and specialized collections such as `Map`, `Set`, and typed arrays are outside its contract.

Routes inherit `isEqual` from ancestors and may override it. `urlParams({ isEqual })` has highest precedence. Default references are cached; comparator-specific references are not.

## Diagnostics and errors

Recoverable parameter failures emit structured `AppRouterDiagnostic` values through `diagnostics.warn`, which defaults to `console.warn`. Codes distinguish serialization, deserialization, thrown codecs, and invalid array representation. The diagnostic `route` is the dot-separated complete route identity from the generated router root to the parameter owner, such as `ROOT.ADMIN.DETAIL`; it is not a URL path or a sibling-local leaf identity. Global query diagnostics use `globalQueryParams` as the `route` source because they have no owning route. Diagnostics also include parameter, operation, optional array index, and original cause.

Implementation files are organized as private model-oriented modules with acyclic imports, as recorded by [ADR 0006](../adr/0006-acyclic-model-modules.md). `app-router.ts` is the composition root rather than the owner of every runtime concern.

Library-owned parameter handling throws only for inactive route state or invalid active path state. Structural definition validation also throws at startup and aggregates every detected invariant violation with complete contextual text. Cross-route relationships such as parameter shadowing, duplicate sibling URL patterns, and fallback placement remain definition-time runtime checks rather than TypeScript constraints. Local route shape and generated router usage remain statically typed. See ADR 0009.

## Angular runtime relationship

`provideAppRouter(...features)` returns opaque `EnvironmentProviders`, registers generated routes and the typed token, and forwards Angular router features. `paramsInheritanceStrategy` is forced to `always`; other configuration belongs to `defineAppRouter({ routerConfig })`. The native Angular `Router` remains the underlying injectable runtime service, but it is not the supported application escape-hatch API.

Application code should use `AppRouter`; a future ESLint rule may forbid direct native `Router` injection. Every generated router provides a bounded `escapeHatch` for native route-addressing operations:

```ts
router.escapeHatch.createUrlTree(commands, options);
router.escapeHatch.navigate(commands, options);
router.escapeHatch.navigateByUrl(url, options);
router.escapeHatch.parseUrl(url);
router.escapeHatch.serializeUrl(tree);
router.escapeHatch.isActive(url, matchOptions);
```

These methods preserve Angular's native types and semantics. The object also provides readonly `url`, `events`, `currentNavigation`, `lastSuccessfulNavigation`, `navigated`, and `componentInputBindingEnabled`. This observational subset must be revisited in a later design review.

The escape hatch does not expose raw `routerState`, route configuration or mutation, router lifecycle controls, or deprecated mutable configuration properties. Typed `navigate()` excludes `browserUrl`, while escape-hatch navigation retains it. Query updates remain limited to `replaceUrl`.

No custom declarative-link API is supplied. A `UrlTree | null` returned by typed construction can be passed to Angular's `RouterLink`, and `RouterLinkActive` continues to provide declarative active-link behavior.
