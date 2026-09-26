# API reference

A route node brings together an address, its parameter types, and its current state. Angular
Router handles matching and navigation. ngx-urlik checks the definitions, converts parameter
values, builds destinations, and coordinates query writes.

The [README](../../README.md) shows a complete setup. This page gives the rules for each operation.

## Route tree and identity

Declare one named root with `defineAppRouter({ routes })`. Children are named object properties:

```ts
ROOT: {
  path: '',
  children: {
    USER: {
      path: 'users',
      pathParam: pathParam({ name: 'userId', codec: stringCodec() }),
    },
  },
}
```

`ROOT.USER` is the identity used in code. `/users/42` is one URL it can construct. Changing a
static segment does not require changing the identity.

Each route contributes one static segment and at most one dynamic segment after it. Use nested
routes for longer paths. Only the root may have `path: ''`; use `exactMatch` for landing content.
Paths cannot contain Angular path syntax such as inline `:params` or several `/`-separated segments.

Children inherit path and query definitions from their parents. Names share one namespace along
a route chain, so a child cannot reuse a parent's path or query name. Sibling URL patterns must
be distinct. Angular's generated `Routes` stay private. Components can load lazily; route
definitions must be available when the tree is declared.

Node members reserve the names `navigate`, `createUrlTree`, `params`, and `patchQuery`.
The root also reserves `escapeHatch`, `activeRoute`, and `globalQueryParams`.

## Route kinds

| Kind     | Declaration                                            | Available operations                         |
| -------- | ------------------------------------------------------ | -------------------------------------------- |
| Ordinary | A static `path`, with optional children and parameters | Construct, navigate, read state, patch query |
| Redirect | `redirectTo` callback                                  | Construct and navigate                       |
| Fallback | `path: '**'`                                           | Read state and patch query                   |

An ordinary route can have no component, including at a leaf.

A redirect callback receives the route's decoded `{ path, query }` and must return a definite
`UrlTree`. Since typed construction can return `null`, choose a fallback when needed. Redirects
accept only `canMatch`, `providers`, and `data` under `angular`. They are terminal routes and have
no children or active parameter state.

A fallback matches unknown paths in its branch. Put it last among siblings, with at most one
fallback per branch. It cannot be the root or have a path parameter, redirect, or children.
There is no single URL to construct for a wildcard.

### Exact-match behavior

Use `exactMatch` when a route needs content at its own URL as well as child destinations:

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

At `/account`, the layout's outlet shows the overview. At `/account/settings`, it shows settings.
Query parameters and fragments do not affect this choice. Without `exactMatch`, the outlet is
empty at the layout's own URL. On a componentless route, content uses the enclosing outlet.
The same rule works at the root and on leaves.

An exact match contains one `component`, `loadComponent`, or `redirectTo`. Content accepts the
usual `angular` options. A redirect receives accumulated state and returns a definite `UrlTree`;
its Angular options are limited to `canMatch`, `providers`, and `data`.

```ts
exactMatch: {
  redirectTo: ({ path, query }) => chooseDestination(path, query),
}
```

The callback above represents application code returning a `UrlTree`. Unlike a terminal redirect,
an exact-match redirect leaves deeper destinations accessible.

Parameters, equality, and navigation belong to the named route. `exactMatch` cannot declare its
own path, parameters, children, or state. Wildcards and terminal redirects cannot use it.

Angular receives a private empty child with full matching. Guards and providers on `exactMatch`
belong to that child. A guarded redirect adds another private child because Angular does not allow
`canMatch` directly on a redirect. If an exact-match guard rejects, Angular can try other children,
including a local wildcard.

## Angular options

Put component and activation options under `angular`:

```ts
angular: {
  loadComponent: () => import('./user-page').then(m => m.UserPage),
  canActivate: [requireSession],
  title: 'User',
}
```

Supported fields are `component`, `loadComponent`, `canMatch`, `canActivate`, `canActivateChild`,
`canDeactivate`, `resolve`, `data`, `title`, `providers`, and `runGuardsAndResolvers`.
Choose either `component` or `loadComponent`. ngx-urlik forwards these options to Angular.

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

The same codec can be used in different positions:

```ts
const id = stringCodec();
pathParam({ name: 'userId', codec: id });
queryParam({ codec: id });
repeatedQueryParam({ codec: id });
delimitedQueryParam({ codec: id, separator: ',' });
```

The wrapper sets URL policy. Path parameters name required segments. Query parameters can specify
`defaultValue` and `required`. Array wrappers choose how several values share a query key.

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
const user = inject(AppRouter).ROOT.USER;
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
const results = inject(AppRouter).ROOT.RESULTS;
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
not reappear after the user tries to leave the page. See [why writes share a queue](../adr/0011-shared-query-write-coordinator.md).

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
  movie: router.ROOT.MOVIE,
  episode: router.ROOT.EPISODE,
});

const current = detail();
if (current.route === 'episode') {
  // current.node and current.params have the episode route's types.
}
```

The result is a readonly signal containing `route`, `node`, and `params`. The alias narrows the
other two fields. The deepest active named candidate wins, regardless of declaration order.
Aliases for the same node use the first declared alias.

Candidates must be generated stateful nodes. Redirects and private exact-match children cannot
be selected. Reading while no candidate is active throws. This keeps a shared component's
contract limited to the routes it understands.

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
`PARAM_CODEC_THROWN`, and `INVALID_ARRAY_REPRESENTATION`. The route is the full identity, such as
`ROOT.ADMIN.DETAIL`. Global reads use `globalQueryParams` as their source.

Codec exceptions are caught and treated as invalid data. Errors from consumer callbacks, such
as default factories and redirects, propagate. Invalid active path values and inactive route
reads throw because there is no valid state to return.

`defineAppRouter()` also validates the tree and throws all structural errors together. TypeScript
checks local shapes and usage; runtime validation checks relationships such as shadowed names,
duplicate sibling paths, and wildcard placement. See the [validation decision](../adr/0009-structural-route-diagnostics.md).

## Angular runtime relationship

`provideAppRouter(...features)` returns `EnvironmentProviders` that register the routes and typed
token. Set router options on `defineAppRouter({ routerConfig })`. Parameter inheritance is always
`'always'`; passing `withRouterConfig()` to the provider is rejected.

For native addressing outside the typed tree, use `router.escapeHatch`:

| Methods                                      | Readonly observations                                                           |
| -------------------------------------------- | ------------------------------------------------------------------------------- |
| `createUrlTree`, `navigate`, `navigateByUrl` | `url`, `events`, `navigated`                                                    |
| `parseUrl`, `serializeUrl`, `isActive`       | `currentNavigation`, `lastSuccessfulNavigation`, `componentInputBindingEnabled` |

These keep Angular's types and behavior, including `browserUrl` for native navigation. The escape
hatch does not expose raw `routerState`, route configuration or mutation, lifecycle controls,
or deprecated mutable configuration properties. Angular's `Router` remains injectable because
it runs the application router.
