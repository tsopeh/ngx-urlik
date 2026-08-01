# Typed App Router design

Status: accepted product design; implemented on a fresh Angular 22 workspace baseline.

## Vision

The library is intended to feel like a natural, signal-first improvement to Angular routing. It replaces Angular's `Routes` configuration as the application's routing source of truth and provides a fully typed application-specific router. Angular's router remains the runtime engine.

The complete route tree is declared statically at application startup. Components may be lazy-loaded, but route definitions may not be contributed or lazy-loaded later.

The definition produces:

- `AppRouter`, an application-specific injection token for the typed route tree;
- `provideAppRouter(...features)`, an Angular provider function;
- typed, absolute `navigate()` and `createUrlTree()` methods on route nodes;
- signal-based, accumulated path and query state;
- route-scoped query updates.

Angular 22 is the target. The implementation uses Angular 22's generated library build and Vitest workspace configuration with Node 24.15+ and TypeScript 6.

## Canonical example

```ts
const { AppRouter, provideAppRouter } = defineAppRouter({
  routes: {
    ROOT: {
      path: '',
      queryParams: {
        locale: stringQueryParam({ defaultValue: 'en' }),
      },
      children: {
        WORKSPACES: {
          path: 'workspaces',
          component: WorkspacesComponent,
          queryParams: {
            search: stringQueryParam(),
          },
          children: {
            WORKSPACE: {
              path: 'workspace',
              pathParam: stringPathParam({ name: 'workspaceId' }),
              loadComponent: () =>
                import('./workspace.component').then((m) => m.WorkspaceComponent),
              queryParams: {
                tab: enumQueryParam(WorkspaceTab, { required: true }),
              },
            },
          },
        },
        LEGACY_WORKSPACE: {
          path: 'legacy-workspace',
          pathParam: stringPathParam({ name: 'workspaceId' }),
          redirectTo: ({ path }) =>
            inject(AppRouter).ROOT.WORKSPACES.WORKSPACE.createUrlTree({
              path: { workspaceId: path.workspaceId },
              query: { tab: null },
            }),
        },
        NOT_FOUND: fallbackRoute({
          loadComponent: () => import('./not-found.component').then((m) => m.NotFoundComponent),
        }),
      },
    },
  },
});
```

```ts
bootstrapApplication(AppComponent, {
  providers: [provideAppRouter(withComponentInputBinding(), withViewTransitions())],
});
```

Ordinary routes are plain objects. `ROOT` and uppercase route identities are conventions, not enforced spellings.

## Route tree and identity

- `defineAppRouter()` accepts `{ routes: ... }`, leaving room for global options.
- There is exactly one root route with a non-empty string identity.
- The root path may be empty or one static segment. Only the root may use `path: ''`.
- The root may declare a path parameter.
- Children are keyed objects, not arrays. Keys are stable application identities and need not match URL segments.
- Identities must be non-empty strings. `navigate`, `createUrlTree`, and `urlParams` are reserved at every node.
- Each ordinary route contributes exactly one static segment and optionally one dynamic segment immediately after it.
- A static path may not contain `/`, `:`, `?`, `#`, `;`, `(`, `)`, or `*`. Multiple static segments require nested route definitions.
- Route definitions and the generated router API are immutable after definition.
- Generated Angular `Routes` remain private.

The route identity chain mirrors application hierarchy, while `path` controls URL representation:

```ts
router.ROOT.WORKSPACES.WORKSPACE;
```

## Supported route kinds

### Ordinary routes

Ordinary routes may use `component`, `loadComponent`, or neither. They may have children whether or not they render a component. Componentless leaf routes are valid. `component` and `loadComponent` are mutually exclusive.

The supported Angular-compatible hooks are:

- `canMatch`, `canActivate`, `canActivateChild`, and `canDeactivate`;
- `resolve`, `data`, `title`, `providers`, and `runGuardsAndResolvers`.

Guards and resolvers use Angular's functional contracts. Route definitions cannot use `loadChildren`.

### Redirect routes

Only functional redirects returning `UrlTree` are supported. The callback runs in an Angular injection context, may inject `AppRouter`, and receives typed accumulated `{ path, query }` source values. Raw redirect strings are unsupported.

Redirect nodes expose `navigate()` and `createUrlTree()`, but not `urlParams()`. They allow only `path`, `pathParam`, `queryParams`, `redirectTo`, `canMatch`, `providers`, and `data`. They cannot have a component, children, activation guards, resolvers, titles, equality configuration, or guard/resolver rerun policy. Redirect matching is exact (`pathMatch: 'full'`) and `pathMatch` is not public configuration.

### Fallback routes

`fallbackRoute()` represents Angular's `**`. It has no canonical path, so it exposes `urlParams()` but not navigation construction methods. It may use query parameters and the ordinary non-path capabilities. It cannot define `path`, `pathParam`, children, or a redirect.

There may be at most one fallback per sibling branch and it is compiled last. Fallbacks are branch-scoped: a fallback under a non-empty root only catches URLs after that root prefix matches.

## Parameter accumulation and ownership

Path and query definitions accumulate from root to the selected route. Construction and reactive state use the accumulated schema.

Parameter names form one namespace along a chain. A descendant may not shadow any ancestor parameter, including cross-kind path/query collisions. A route may not give its own path and query parameters the same name. Sibling branches may reuse names.

`defineAppRouter()` also rejects duplicate generated path patterns among siblings. Structural validation aggregates all discovered errors into one contextual exception, including unknown route properties and suggested fixes where possible.

## Serialization

```ts
interface UrlParamSerializer<T> {
  serialize(value: T): string | null;
  deserialize(value: unknown): T;
}
```

`null` means absent or unresolvable URL state. `undefined` is forbidden in serializer value types at the `pathParam()` and `queryParam()` boundaries. This gives reactive values a stable object shape compatible with Angular Signal Forms, where `undefined` means a field does not exist.

This distinction applies to reactive state, not to the separate construction-input type. Optional query construction properties may be omitted, but every key is present after deserialization in `urlParams.value().query` and in the complete state passed to `updateQueryParams()`.

Serializers operate on decoded values; Angular owns URL encoding. They are synchronous. Every serializer call and default-value factory runs inside the application `EnvironmentInjector`, so synchronous `inject()` is supported. Static validation never executes serializers.

Custom adapters are:

```ts
pathParam({ name: 'coordinates', serializer });
queryParam({ serializer, required: true });
```

Initial built-ins provide string, number, boolean, and readonly string-record enum families for both path and query placement. Dates and collections require custom serializers.

Built-in details:

- String query parameters distinguish absent (`null`) from present empty (`''`). Empty path strings are invalid.
- Numbers require whole-value parsing. Finite numbers, `Infinity`, and `-Infinity` are valid; `NaN`, empty strings, and partial forms such as `12px` are invalid.
- Booleans accept only lowercase `true` and `false`.
- Enums accept native string enums and readonly string-valued records; numeric and heterogeneous enums are invalid.
- Query reads use Angular `ParamMap.get()`. For repeated keys, the first value wins.
- Malformed built-in query values deserialize to `null` or their configured default.
- A thrown custom deserializer error is rethrown with route and parameter context.
- Broader runtime validation of custom serializer return types is deferred. Path construction must still reject `null` and empty output because no segment can be constructed.

### Defaults

Query helpers have overloads based on `defaultValue`:

```ts
stringQueryParam(); // string | null
stringQueryParam({ defaultValue: 'all' }); // string
```

A missing or malformed value resolves to the default. A value equal to the current default serializes to `null`, producing a compact canonical URL. Defaults may be values or synchronous factories. Factories are evaluated when needed, not once; signal reads inside them participate in reactive dependency tracking.

Path parameters do not use defaults. Their values are required for construction. When a route's path state is read, every accumulated path value must be present and deserialize non-null; otherwise the library throws an error showing the expected route pattern and attempted current path. An ancestor route is considered resolvable while one of its descendants is active. Invalid path deserialization is checked when typed state is read, not during Angular matching.

## Construction API

Each ordinary route node exposes absolute, deterministic construction:

```ts
createUrlTree(values): UrlTree
navigate(values, options?: NavigationBehaviorOptions): Promise<boolean>
```

The values argument has explicit `{ path, query }` groups and is conditionally optional:

- `path` is required if the accumulated route has any path parameters; every path key is required and non-null.
- Query helpers are optional construction inputs by default.
- `{ required: true }` makes that query property required in construction input, but the value may still be nullable. `null` explicitly omits the physical key.
- `query` is required if it contains a required property; otherwise it is optional.
- The entire argument is optional only when no construction input is required.

Construction never inherits current URL state. Omitted optional query inputs and unknown current query parameters are absent from the target. `navigate()` and `createUrlTree()` construct the same URL. Navigation accepts Angular's `NavigationBehaviorOptions`; fragments and relative navigation are unsupported.

Query output order is deterministic: ancestor declarations precede descendants, and keys retain declaration order within each level.

Angular's normal `[routerLink]` consumes generated `UrlTree` values; no custom link directive is planned initially.

## Reactive state and query updates

```ts
interface UrlParamsRef<Path, Query> {
  readonly value: Signal<{ path: Path; query: Query }>;

  updateQueryParams(
    updater: (previous: Readonly<Query>) => Query,
    options?: { replaceUrl?: boolean },
  ): Promise<boolean>;
}
```

The API is signal-only and readonly. Consumers may use Angular interop for observables. Direct writable Signal Forms integration is deferred.

`urlParams()` resolves the selected active branch. Unresolvable accumulated path state throws rather than returning a nullable whole object. The query object always contains every declared accumulated key after deserialization.

`updateQueryParams()`:

- accepts only the functional, complete-state form; there is no patch or direct-value overload;
- never changes the path;
- serializes the complete query schema owned by the selected node;
- merges owned results into the current URL;
- removes owned keys that serialize to `null`;
- preserves descendant-owned and unknown query keys;
- supports `{ replaceUrl?: boolean }`, defaulting to normal history insertion;
- reads previous state once and invokes the updater once;
- does not queue concurrent calls—callers must await when ordering matters.

## Equality

The exported deep `isEqual<T>(a, b)` compares the complete `{ path, query }` signal value and is the default equality function. It currently supports primitives (`Object.is`), arrays, dates, prototypes, and recursively enumerable object/symbol properties. Cycles and specialized collections such as `Map` and `Set` are not guaranteed.

Routes may define `isEqual`; it is inherited by descendants and may be overridden there. A consumer may override it again:

```ts
route.urlParams({ isEqual: customEquality });
```

Precedence is call-site, current route, nearest ancestor, then library default. Comparator-specific `UrlParamsRef` caching is deferred; callers passing options should retain the returned reference.

## Angular runtime relationship

`provideAppRouter(...features)` returns opaque `EnvironmentProviders`, registers the generated Angular routes, the typed token, and internal services, and forwards standard Angular router features. The native Angular `Router` remains normally injectable; the library neither hides nor replaces its DI token nor exposes it through `AppRouter`.

Router configuration is supplied as `routerConfig` to `defineAppRouter()`. The implementation creates one internal `withRouterConfig()` feature and always sets `paramsInheritanceStrategy: 'always'`. A caller cannot pass `withRouterConfig()` through `provideAppRouter()`, preventing that mandatory inheritance behavior from being disabled.

Angular remains responsible for matching, component activation, guards, resolvers, browser history, location strategy, directives, URL parsing, and encoding. The typed library owns static definition, construction, serialization, parameter state, and diagnostics.

## External design references

The `null`/`undefined` decision follows Angular Signal Forms' current model-shape guidance:

- [Form model design](https://angular.dev/guide/forms/signals/model-design)
- [Form models](https://angular.dev/guide/forms/signals/models)
- [Custom controls](https://angular.dev/guide/forms/signals/custom-controls)
