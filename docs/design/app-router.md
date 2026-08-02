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
- Only the root may use `path: ''`.
- Ordinary routes contribute one static segment and optionally one dynamic segment immediately after it.
- Static paths may not contain Angular path syntax; multiple segments require nested definitions.
- Components may be lazy, but route definitions may not be lazy or contributed later.
- Generated Angular `Routes` remain private.

## Route kinds

Ordinary routes may have `pathParam`, `queryParams`, children, equality configuration, and an `angular` options object. Componentless leaves remain valid.

Redirect routes are discriminated by `redirectTo`. Their callback receives typed accumulated source state and must synchronously return a definite `UrlTree`. Because typed construction can return `null`, redirect code must choose an explicit fallback. Redirects support only `canMatch`, `providers`, and `data` under `angular`; they have construction methods but no `urlParams()`.

Fallback routes use the literal `path: '**'`. There may be at most one per sibling branch and it must be declared last. A fallback has state but no canonical construction/navigation methods. It cannot have a path parameter, redirect, or children.

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

Updates preserve the current path, descendant-owned query keys, and unknown keys. The updater is invoked once with complete owned state. Calls are not queued.

## Equality

Exported `isEqual()` is the default complete-state comparator. It supports `Object.is` primitives, nested arrays, dates, matching prototypes, and recursively enumerable string/symbol properties. Cycles and specialized collections such as `Map`, `Set`, and typed arrays are outside its contract.

Routes inherit `isEqual` from ancestors and may override it. `urlParams({ isEqual })` has highest precedence. Default references are cached; comparator-specific references are not.

## Diagnostics and errors

Recoverable parameter failures emit structured `AppRouterDiagnostic` values through `diagnostics.warn`, which defaults to `console.warn`. Codes distinguish serialization, deserialization, thrown codecs, and invalid array representation. Diagnostics include complete route, parameter, operation, optional array index, and original cause.

Library-owned parameter handling throws only for inactive route state or invalid active path state. Structural definition validation also throws at startup and aggregates every detected invariant violation with complete contextual text.

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
