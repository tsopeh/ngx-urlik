# API reference

A route node brings together an address, its parameter types, and its current state. Angular
Router handles matching and navigation. ngx-urlik checks the definitions, converts parameter
values, builds destinations, and coordinates query writes.

The [README](../../README.md) shows a complete setup. This page gives the rules for each operation.

## Routes and names

Pass Angular's ordered route array to `defineAppRouter()`. Add `routeName` to each route that
should have a typed node:

```ts
const { AppRouter, provideAppRouter } = defineAppRouter({
  routes: [
    {
      path: 'users/:userId',
      routeName: 'USER',
      pathParam: { codec: stringCodec() },
      loadComponent: () => import('./user-page').then((m) => m.UserPage),
    },
  ],
});

const user = inject(AppRouter).routes.USER;
```

The route's Angular `path` is the source of its URL and placeholder names. `USER` is the name
used in code. `AppRouter.routes` is flat even when the Angular route is nested. A named descendant
inherits path and query definitions from its ancestors, including unnamed ancestors.

Angular route options stay at the top level. Routes without `routeName` remain Angular routes
and do not appear in `AppRouter.routes`. Unnamed branches can use Angular features such as
`loadChildren`; a branch used by a named descendant must have statically declared children.
Named routes need a statically known primary-outlet path and cannot use `loadChildren`.

### Fields added to Angular routes

The example above names a route and assigns a codec to its `:userId` placeholder. ngx-urlik adds
four optional fields to Angular's `Route` object:

| Field         | What it does                                                                                                                                                                                                                   |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `routeName`   | Adds a node under `AppRouter.routes` with this name. Names must be unique across the whole route array. `defineAppRouter()` throws when a name is repeated and identifies both declarations. The name does not change the URL. |
| `pathParam`   | Sets codecs for placeholders declared in this route's `path`. Without it, placeholders are strings. Use `{ codec }` for one placeholder or a map keyed by placeholder name for several.                                        |
| `queryParams` | Declares query fields this route owns. Named descendants inherit them, including fields on unnamed ancestors. Each key has one definition along a named route's chain.                                                         |
| `isEqual`     | Compares decoded `{ path, query }` state for the route's `params` signal. Descendants inherit it unless they provide their own. It controls signal updates, not which URL values a patch reads.                                |

All four fields are optional. Angular still handles routes that do not use them.

Paths can contain static segments and named placeholders, such as `shows/:showId/seasons/:season`.
Without `pathParam`, placeholder values are strings. Supply `{ codec }` for a single placeholder,
or a map with one `{ codec }` entry for every placeholder on that route. Path values are required
when constructing a destination. Names cannot repeat along a named route chain. A path and
query field may use the same name because state keeps them under separate `path` and `query`
objects. Query definitions cannot repeat along that chain.

## Route kinds

| Kind                  | Declaration                                        | Available operations                           |
| --------------------- | -------------------------------------------------- | ---------------------------------------------- |
| Named ordinary route  | A statically known primary `path` with `routeName` | Construct, navigate, read state, patch query   |
| Unnamed Angular route | Any route without `routeName`                      | Angular Router handles matching and navigation |

Named routes can have no component, including at a leaf. Angular-only redirects and
wildcards keep Angular's ordinary configuration; they have no generated nodes. Angular's route
order controls matching, so keep route ordering meaningful for overlapping patterns.

### Landing content

Use an empty-path child when a route needs landing content at its own URL as well as child pages:

```ts
{
  path: 'account/:accountId',
  routeName: 'ACCOUNT',
  pathParam: { codec: numberCodec() },
  component: AccountLayout,
  children: [
    { path: '', routeName: 'ACCOUNT_OVERVIEW', component: AccountOverview },
    { path: 'settings', routeName: 'ACCOUNT_SETTINGS', component: AccountSettings },
  ],
}
```

At `/account/7`, Angular activates the empty-path child and the account route. `ACCOUNT` and
`ACCOUNT_OVERVIEW` are both active; `activeRoute()` reports the deeper candidate. At
`/account/7/settings`, `ACCOUNT_SETTINGS` is deeper. The empty child constructs the same URL as its
parent.

## Angular options

Put Angular component and activation options directly on each route:

```ts
loadComponent: () => import('./user-page').then(m => m.UserPage),
canActivate: [requireSession],
title: 'User',
```

Angular's `Route` fields are forwarded to Router. The [fields above](#fields-added-to-angular-routes)
belong to ngx-urlik. Choose `component` or `loadComponent` as Angular requires. Redirects,
wildcards, matchers, and named outlets are supported only on unnamed routes.

## Codecs and placement

A codec converts one decoded string to a value and back:

```ts
interface UrlParamCodec<T> {
  serialize(value: T): string | null;
  deserialize(raw: string): T | null;
}
```

`null` means conversion failed. The value type `T` cannot contain `null` or `undefined`.
Codecs are pure; calling Angular `inject()` inside them is unsupported.

The same codec can configure a path placeholder or a query field:

```ts
const id = stringCodec();
const route = {
  path: 'users/:userId',
  routeName: 'USER',
  pathParam: { codec: id },
  queryParams: {
    search: queryParam({ codec: id }),
    tags: repeatedQueryParam({ codec: id }),
    ids: delimitedQueryParam({ codec: id, separator: ',' }),
  },
};
```

For one placeholder, `pathParam` can be `{ codec }` or `{ userId: { codec } }`. For several
placeholders, use a keyed map with exactly one codec entry per placeholder. The path supplies each
parameter name. Query definitions can specify `defaultValue` and `required`; array definitions
choose how several values share a query key.

### Built-in scalar semantics

| Codec               | Accepted values                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------ |
| `stringCodec()`     | Strings, including a present empty query value                                                   |
| `numberCodec()`     | Whole numeric strings, including signed infinities; not `NaN`, empty strings, or partial numbers |
| `booleanCodec()`    | Exactly `true` and `false` in lowercase                                                          |
| `enumCodec(values)` | String values from the supplied readonly enum or record                                          |

An empty path segment is invalid even with a string codec. Numeric and mixed-value enums are
not supported. Use a custom codec when the domain needs stricter rules, such as positive integers.

### Query cardinality

A scalar uses the last value if its key repeats: `?page=1&page=2` reads as `2`.

| Definition         | URL            | Decoded array |
| ------------------ | -------------- | ------------- |
| Repeated           | `?tag=a&tag=b` | `['a', 'b']`  |
| Delimited with `,` | `?tag=a,b`     | `['a', 'b']`  |

Delimited values require exactly one physical key. Repeating that key is invalid. Each item is
encoded with `encodeURIComponent` before joining, then Angular encodes the query. A comma inside
an item therefore appears as `%252C` in the URL. The separator must be one character that
`encodeURIComponent` escapes.

Missing arrays use their default or `[]`. Empty items are kept if their codec accepts them.
One invalid item rejects the whole array and uses the default or `[]`.

## Defaults and required construction

```ts
queryParam({ codec: stringCodec(), defaultValue: 'en' });
queryParam({ codec: stringCodec(), defaultValue: () => inject(LocaleSettings).locale() });
```

A missing or malformed query value reads as its current default. A value deeply equal to that
default is omitted from a constructed URL. Factories are synchronous and run in the application's
injection context. Their errors propagate; they are not treated as malformed URL data.

Without a default, optional scalars read as `null` and arrays as `[]`. Every declared field is
present in the decoded state.

`required: true` means a caller must supply the query property when constructing a destination.
It does not require a physical key in the URL or change read behavior. `null` is an explicit
choice for a nullable scalar; `[]` is an explicit choice for an array. A defaulted scalar keeps
its non-null value type. Path parameters are always required and non-null.

## Deterministic construction

```ts
const user = inject(AppRouter).routes.USER;
const link = user.createUrlTree({ path: { userId: '42' }, fragment: 'profile' });
await user.navigate({ path: { userId: '42' } }, { replaceUrl: true });
```

Supply all accumulated path values, including those declared on parents. Query input can omit
fields unless marked `required`. A destination depends only on these inputs and the declarations;
it never copies the current query. Ancestor query definitions are serialized before child
ones, preserving declaration order at each level.

Invalid path serialization returns `null`. `navigate()` then resolves `false` without invoking
Angular. Invalid query values produce diagnostics and are omitted while construction continues.

`fragment` accepts a string or `null`. It is construction-only and does not appear in `params()`.
Navigation accepts Angular's navigation behavior options except `browserUrl`, which could display
a different address from the typed destination.

Pass a constructed `UrlTree | null` to Angular's `RouterLink`. `RouterLinkActive` also works;
there is no library-specific link directive.

## Reactive state and updates

```ts
const results = inject(AppRouter).routes.RESULTS;
const query = computed(() => results.params().query);

await results.patchQuery({ search: 'elm', page: 1 });
await results.patchQuery((q) => ({ page: q.page + 1 }));
```

Each stateful route owns a stable readonly `params` signal containing `{ path, query }`.
It includes inherited parameters. Reading an inactive route or an invalid active path throws.
Route signals read committed snapshots and refresh on `NavigationEnd`.

A patch changes only supplied fields. Omitted and `undefined` fields stay unchanged. Use `null`
for nullable scalars, `[]` for arrays, or a field's default to remove its URL representation.
The path, fragment, descendant-only query fields, and unknown fields are preserved.

Every patch is one queued write. A function runs once, when its turn starts, against fresh
committed state. It returns a partial query; no spread is needed. All routes and forms share
this queue, and later writes to the same field win. `patchQuery` accepts `{ replaceUrl?: boolean }`.

The returned promise reports the navigation result. Timing matters:

| Event                                       | Result                                                                                      |
| ------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Successful navigation                       | Resolves `true`                                                                             |
| Guard rejects or Angular skips the same URL | Resolves `false`; later writes continue                                                     |
| Patch callback or navigation throws         | Rejects; later writes continue                                                              |
| External navigation starts                  | Waiting writes resolve `false` without running; new writes are declined while it is pending |
| A coordinated guard redirects               | Waiting writes are canceled; the active write follows Angular's redirect result             |
| Router is destroyed                         | Waiting and active callers settle as `false`                                                |

External navigation cancels waiting work even if its guard later rejects. A canceled edit must
not reappear after the user tries to leave the page.

### Global query observation

Use route declarations for fields owned by a page. A service that follows a convention across
pages can read it independently:

```ts
const campaign = router.globalQueryParams({
  source: queryParam({ codec: stringCodec() }),
});
campaign().source;
```

The result is a readonly signal of the decoded query object, without a `query` wrapper. It uses
the same codecs, defaults, and `NavigationEnd` timing as route state. Before initial navigation,
it reads the current snapshot with normal absent-key behavior. It does not need an active route.

Each observer applies its own definitions; share definitions when observers should agree.
`required` has no effect on reads. Creating an observer does not register fields in the tree,
preserve them during navigation, or write stored values back to the URL.

An optional second argument, `{ isEqual }`, compares the whole decoded query. The default is
`isEqual()`. Route equality does not affect global observers. Default factories use the application
injector. Once you have the router, you can create an observer outside an injection context;
the router owns the subscription and callers need no cleanup.

### Query form bindings

Both form systems bind an active route's accumulated query fields. Path parameters are not editable
form state. Create or bind forms in an injection context; cleanup uses `DestroyRef`.

```ts
import { createQueryParamsFormGroup } from 'ngx-urlik/forms';

const filters = createQueryParamsFormGroup(results);
filters.patchValue({ search: 'elm', page: 1 });
```

The group has one `FormControl` for each query field. Arrays use array-valued controls; nested
groups and `FormArray` are not supported. The creator adds no validators. For validators or
control options, build the exact group and call `bindQueryParamsToFormGroup(results, group, options)`.

```ts
import { maxLength } from '@angular/forms/signals';
import { createQueryParamsSignalForm } from 'ngx-urlik/forms';

const { model, form } = createQueryParamsSignalForm(results, {
  schema: (fields) => maxLength(fields.search, 100),
});
```

This returns a writable model and Angular `FieldTree`. You can also bind an existing field tree
with `bindQueryParamsToSignalForm(results, form, options)`.

The form starts from fresh URL state. It then holds a draft while the URL holds committed values.
Writes replace history entries by default. Other coordinated writes preserve unrelated drafts
and interaction state. External navigation cancels pending edits at its start and resets the
form to a pristine, untouched URL baseline, even if navigation is blocked.

A multi-field `patchValue` or `setValue` produces one write. Signal Forms group changes observed
in one model notification. Separate notifications remain separate writes. A write includes only
fields emitted synchronously by its transformation; filtered or delayed fields are excluded.

For example, debounce search without delaying other fields:

```ts
import { debounceTime, groupBy, mergeMap } from 'rxjs';

const filters = createQueryParamsFormGroup(results, {
  transformWrites: (changes) =>
    changes.pipe(
      groupBy((change) => change.param),
      mergeMap((group) => (group.key === 'search' ? group.pipe(debounceTime(300)) : group)),
    ),
});
```

Grouping keeps an immediate field from flushing or replacing a pending search. A delayed field
joins the queue when its transformation emits. Native Signal Forms debounce runs before this
transformation, so enabling both delays twice.

Write events contain `param`, `value`, the full `query` snapshot, and `valid`, `pending`,
`formValid`, and `formPending`. Validation does not block writes automatically; filter events
when that is the policy you want.

Failed writes retain entered values and are not retried. `onWriteFailure` receives
`{ kind: 'declined' }` or `{ kind: 'error', error }`. Without a callback, thrown write errors go
to Angular's `ErrorHandler`. Destroying a binding cancels its waiting writes; it does not abort
an already-started navigation.

## Typed activation context

A component shared by several routes can name the routes it supports:

```ts
const detail = router.activeRoute({
  movie: router.routes.MOVIE,
  episode: router.routes.EPISODE,
});

const current = detail();
if (current.route === 'episode') {
  // current.node and current.params have the episode route's types.
}
```

The result is a readonly signal containing `route`, `node`, and `params`. The alias narrows the
other two fields. The deepest active named candidate wins, regardless of declaration order.
Aliases for the same node use the first declared alias.

Candidates must be generated named nodes. Unnamed Angular routes cannot be selected.
Reading while no candidate is active throws. This keeps a shared component's contract limited to
the routes it understands.

## Equality

`isEqual()` is the default comparator. It compares primitives with `Object.is`, and supports
nested arrays, dates, matching prototypes, and enumerable string and symbol properties.
It does not support cycles or specialized collections such as `Map`, `Set`, and typed arrays.

A route inherits its parent's `isEqual` unless it declares its own. The comparator controls
signal notifications. Patches and form initialization read fresh committed state independently,
so retaining a signal value cannot make a write use an old query.

## Diagnostics and errors

Bad query data uses defaults or absence behavior and emits a warning. Configure the reporter
on `defineAppRouter` with `diagnostics: { warn }`; the default uses `console.warn`.

`AppRouterDiagnostic` contains `code`, `message`, `route`, `parameter`, and `operation`, plus
`index` and `cause` when available. Codes are `PARAM_DESERIALIZE_FAILED`, `PARAM_SERIALIZE_FAILED`,
`PARAM_CODEC_THROWN`, and `INVALID_ARRAY_REPRESENTATION`. The route field contains the route name,
such as `ADMIN_DETAIL`. Global reads use `globalQueryParams` as their source.

Codec exceptions are caught and treated as invalid data. Errors from default factories propagate.
Invalid active path values and inactive route reads throw because there is no valid state to return.

`defineAppRouter()` validates named route chains and throws structural errors together.
Runtime validation checks unique route names, known paths, path codec maps, repeated parameter
names, and duplicate query definitions along those chains. Angular validates and matches its route
configuration.

## Angular runtime relationship

`provideAppRouter(...features)` returns `EnvironmentProviders` that register the routes and typed
token. Set router options on `defineAppRouter({ routerConfig })`; this preserves Angular's router
configuration, including its parameter inheritance strategy. Passing `withRouterConfig()` to the
provider is rejected.

For native addressing outside the typed tree, use `router.escapeHatch`:

| Methods                                      | Readonly observations                                                           |
| -------------------------------------------- | ------------------------------------------------------------------------------- |
| `createUrlTree`, `navigate`, `navigateByUrl` | `url`, `events`, `navigated`                                                    |
| `parseUrl`, `serializeUrl`, `isActive`       | `currentNavigation`, `lastSuccessfulNavigation`, `componentInputBindingEnabled` |

These keep Angular's types and behavior, including `browserUrl` for native navigation. The escape
hatch does not expose raw `routerState`, route configuration or mutation, lifecycle controls,
or deprecated mutable configuration properties. Angular's `Router` remains injectable because
it runs the application router.
