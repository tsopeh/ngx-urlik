# ngx-urlik

A signal-first, typed application router for Angular 22. Angular Router remains the runtime engine; `ngx-urlik` owns route definition, typed URL construction (including fragments), parameter codecs, reactive parameter state, and diagnostics. A bounded escape hatch covers native addressing needs outside the typed route tree.

The repository also contains [TasteTrack](projects/taste-track/README.md), a browser-local media
movie and TV journal demonstrating deeply nested typed routes, custom codecs, URL-bound Reactive and Signal
Forms, deterministic IndexedDB persistence, and system/light/dark themes.

## Install

```sh
npm install ngx-urlik
```

Development requires Node 24.19.0, recorded in `.nvmrc`.

## Define and provide the router

```ts
import { defineAppRouter, pathParam, queryParam, repeatedQueryParam, stringCodec } from 'ngx-urlik';

export const { AppRouter, provideAppRouter } = defineAppRouter({
  routes: {
    ROOT: {
      path: '',
      queryParams: {
        locale: queryParam({
          codec: stringCodec(),
          defaultValue: 'en',
        }),
      },
      children: {
        USER: {
          path: 'users',
          pathParam: pathParam({
            name: 'userId',
            codec: stringCodec(),
          }),
          queryParams: {
            search: queryParam({ codec: stringCodec() }),
            roles: repeatedQueryParam({ codec: stringCodec() }),
          },
          angular: {
            loadComponent: () => import('./user.component').then((module) => module.UserComponent),
          },
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
  routerConfig: { onSameUrlNavigation: 'reload' },
});
```

```ts
bootstrapApplication(AppComponent, {
  providers: [provideAppRouter(withComponentInputBinding())],
});
```

`paramsInheritanceStrategy` is always `always`. Configure other Router options on `defineAppRouter`; `withRouterConfig()` is intentionally rejected by `provideAppRouter`.

## Exact-path content and redirects

Use `exactMatch` for content at a named route’s own URL, with descendants rendered separately:

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

The layout persists; its outlet shows the overview only at `/account`. Without `exactMatch`,
its outlet is empty at that URL. Componentless routes and leaves support the same property.
For a landing redirect, use `exactMatch: { redirectTo: ({ path, query }) => urlTree }` with a
definite `UrlTree` return. Callback parameters include the named route’s accumulated state.

Only the root may have an empty path. `exactMatch` adds no public node or parameters;
navigate and observe state through the named route, including on descendants.
`activeRoute()` selects the deepest active candidate regardless of candidate order.
See the [exact-match reference](docs/design/app-router.md#exact-match-behavior) for allowed options.

## Navigate and link

```ts
const routes = inject(AppRouter);

await routes.ROOT.USER.navigate({
  path: { userId: '42' },
  query: { search: 'active', roles: ['admin', 'editor'] },
  fragment: 'permissions',
});

const userLink = routes.ROOT.USER.createUrlTree({
  path: { userId: '42' },
  fragment: 'profile',
});
```

`fragment` accepts a string or `null` for URL construction and navigation. It is construction-only: fragments never appear in `urlParams()` state. First-party `navigate()` accepts Angular navigation behavior options except `browserUrl`, which could make the displayed URL disagree with typed construction.

`createUrlTree()` returns `null` when a path value cannot be serialized. `navigate()` then resolves `false` without invoking Angular navigation. Invalid query values are diagnosed and omitted while navigation continues. A generated tree works directly with Angular's existing directive; no custom link abstraction is needed:

```html
<a [routerLink]="userLink">View user</a>
```

## Bounded native escape hatch

Use `routes.escapeHatch` when an integration needs native URL commands, matrix parameters, outlets, parsing, or active checks. It forwards Angular's native `createUrlTree`, `navigate`, `navigateByUrl`, `parseUrl`, `serializeUrl`, and `isActive` methods with their native types. Escape-hatch navigation retains `browserUrl` support.

The escape hatch also provides readonly, live access to `url`, `events`, `currentNavigation`, `lastSuccessfulNavigation`, `navigated`, and `componentInputBindingEnabled`. It intentionally excludes router configuration, raw `routerState`, lifecycle controls, disposal, and deprecated mutable or navigation-observation members. Application code should continue to use typed route nodes for normal construction and navigation.

## Reactive URL state

```ts
const params = inject(AppRouter).ROOT.USER.urlParams();
const userId = computed(() => params.value().path.userId);

await params.updateQueryParams((query) => ({ ...query, search: null }), { replaceUrl: true });
```

Query updates across routes and forms execute in submission order against the latest committed
state. Callbacks run asynchronously; handle errors through the returned promise. External navigation
cancels waiting updates at navigation start, even if a guard later blocks it. Canceled writes resolve
`false`; a failed write does not stop later writes. Guard redirects cancel waiting work.

Every declared query property is present: optional scalars use `null`, while absent arrays use `[]`. Reading an inactive route or an invalid active path parameter throws a contextual semantic error. Query decoding failures recover through defaults and structured diagnostics.

## Global query observation (advanced)

Prefer route declarations and `urlParams()` for page-owned state. A service that observes a query
convention across pages can use the read-only `globalQueryParams()` API without declaring those
keys in the route tree:

```ts
const router = inject(AppRouter);
const global = router.globalQueryParams({
  timeRange: queryParam({ codec: stringCodec(), defaultValue: 'last-7-days' }),
  tags: repeatedQueryParam({ codec: stringCodec() }),
});
const timeRange = computed(() => global.value().timeRange);
```

The reference exposes only `value`, containing the decoded query fields directly. It follows page
references' navigation timing and decoding rules. Before initial navigation, reads use the current
snapshot and normal absent-key defaults. Each reference uses its own definitions; share definitions
with routes when you want consistent interpretation. `required` is accepted but has no effect on reads.

Deep equality suppresses unchanged values. Pass `{ isEqual: (previous, next) => ... }` as a second
argument to customize comparison of the complete query object. Once you hold the router instance,
this method is callable outside an injection context; default factories still use the application
injector. No caller-specific cleanup is needed. Observation does not preserve keys across navigation
or write persisted values back to the URL. Parameter diagnostics identify their source as
`globalQueryParams`.

## Reusable codecs and arrays

```ts
const coordinatesCodec = (): UrlParamCodec<{ x: number; y: number }> => ({
  serialize: ({ x, y }) => `${x},${y}`,
  deserialize: (raw) => {
    const [x, y] = raw.split(',').map(Number);
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  },
});

pathParam({ name: 'coordinates', codec: coordinatesCodec() });
queryParam({ codec: coordinatesCodec() });
repeatedQueryParam({ codec: coordinatesCodec() });
delimitedQueryParam({ codec: coordinatesCodec(), separator: ',' });
```

Codecs are pure scalar converters; calling Angular `inject()` inside them is unsupported. Injection-aware defaults belong on query wrappers:

```ts
queryParam({
  codec: stringCodec(),
  defaultValue: () => inject(LocaleSettings).defaultLocale(),
});
```

Repeated arrays use `?role=admin&role=editor`. Delimited arrays use one physical key such as `?role=admin,editor`; each element is URI-encoded before joining, so embedded separators are represented with nested percent encoding.

## Query forms

The optional `ngx-urlik/forms` entry point synchronizes an active route's accumulated query
parameters with Angular Reactive Forms or Signal Forms. Path parameters are intentionally excluded.

```ts
import { createQueryParamsFormGroup } from 'ngx-urlik/forms';

const filters = createQueryParamsFormGroup(routes.ROOT.RESULTS);
```

Reactive forms are exact and flat: every query property has one `FormControl`, including one
array-valued control for repeated or delimited parameters. `FormArray` and nested control shapes are
not supported. Build an exact group yourself and use `bindQueryParamsToFormGroup()` when adding
validators or other control options.

Signal Forms creation returns its URL-initialized model and field tree:

```ts
import { maxLength } from '@angular/forms/signals';
import { createQueryParamsSignalForm } from 'ngx-urlik/forms';

const { model, form } = createQueryParamsSignalForm(routes.ROOT.RESULTS, {
  schema: (query) => maxLength(query.search, 100),
});
```

Both integrations accept a typed RxJS write transformation. Group by parameter before delaying one
field so an immediate field cannot flush its staged value:

```ts
import { debounceTime, groupBy, mergeMap } from 'rxjs';

const filters = createQueryParamsFormGroup(routes.ROOT.RESULTS, {
  transformWrites: (changes) =>
    changes.pipe(
      groupBy((change) => change.param),
      mergeMap((group) => (group.key === 'search' ? group.pipe(debounceTime(300)) : group)),
    ),
});
```

Write events include field and whole-form validity metadata, but validation does not block URL
writes automatically; filter the stream when that policy is desired. Writes replace the current
history entry by default. Forms submit only changed fields through the same queue as direct query
updates. Other coordinated writes preserve unrelated staged edits; later submitted writes to the
same field win. Debounced edits are submitted when their transformation emits. Browser history and
other external navigation cancel staged writes at navigation start and reset the form to a pristine
URL baseline. Signal bindings observe the model value, so native Signal
Forms debounce runs before `transformWrites`; avoid unintentionally delaying the same field twice.

See the accepted [App Router design](docs/design/app-router.md), [Angular restrictions](docs/angular-restrictions.md), and [deferred topics](docs/deferred-discussions.md).
