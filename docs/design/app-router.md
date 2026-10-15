# API reference

A route node brings together an address, its parameter types, and its current state. Angular
Router handles matching and navigation. ngx-urlik checks the definitions, converts parameter
values, builds destinations, and coordinates query writes.

The [README](../../README.md) shows a complete setup. This page gives the rules for each operation.

## Routes and names

Declare your route names, then pass them with Angular's ordered route array to
`defineAppRouter()`. Add `routeName` to each route that should have a typed node:

```ts
export enum RouteNames {
  USER = 'USER',
}

export const { AppRouter, provideAppRouter } = defineAppRouter(RouteNames, {
  routes: [
    {
      path: 'users/:userId',
      routeName: RouteNames.USER,
      pathParam: { codec: stringCodec() },
      loadComponent: () => import('./user-page').then((m) => m.UserPage),
    },
  ],
});

const user = inject(AppRouter).routes.USER;
```

The route's Angular `path` is the source of its URL and placeholder names. `USER` is the name
used in code. `AppRouter.routes` is typed from the `RouteNames` members, so Go to Definition on
`routes.USER` opens the enum member that the route declaration also uses.

`AppRouter.routes` is flat even when the Angular route is nested. A named descendant inherits path
and query definitions from its ancestors, including unnamed ancestors.

Angular route options stay at the top level. Routes without `routeName` remain Angular routes and
do not appear in `AppRouter.routes`. Unnamed branches can use Angular features such as
`loadChildren`; a branch used by a named descendant must have statically declared children.
Named routes need a statically known primary-outlet path and cannot use `loadChildren`. If no
route uses an ngx-urlik field, `defineAppRouter()` passes the route array to Angular unchanged.

### Fields added to Angular routes

ngx-urlik adds four optional fields to Angular's `Route` object:

| Field         | What it does                                                                                                                                                                                    |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `routeName`   | Adds a node under `AppRouter.routes`. Names must be unique across the whole route array; `defineAppRouter()` throws and identifies both declarations. The name does not change the URL.         |
| `pathParam`   | Sets codecs for placeholders declared in this route's `path`. Without it, placeholders are strings. Use `{ codec }` for one placeholder or a map keyed by placeholder name.                     |
| `queryParams` | Declares query fields this route owns. Named descendants inherit them, including fields on unnamed ancestors. Each key has one definition along a named route's chain.                          |
| `isEqual`     | Compares decoded `{ path, query }` state for the route's `params` signal. Descendants inherit it unless they provide their own. It controls signal updates, not which URL values a patch reads. |

Keep `path` and `routeName` literal so TypeScript can infer the nodes. A route array already
widened to Angular's `Routes` type type-checks, but its named routes produce no typed nodes. A key
that is neither an Angular `Route` field nor one of the four above is a type error.

Paths can contain static segments and named placeholders, such as `shows/:showId/seasons/:season`.
For a single placeholder, `pathParam` can be `{ codec }` or `{ showId: { codec } }`. For several
placeholders, use a map with exactly one `{ codec }` entry per placeholder on that route. Path
values are required when constructing a destination. Placeholder names cannot repeat along a named
route chain. A path and query field may use the same name, because state keeps them under
separate `path` and `query` objects.

A `pathParam` codec also decides whether the route matches. ngx-urlik puts a `canMatch` check in
front of the route's own `canMatch` guards. With `numberCodec()` on `items/:id`, `/items/abc` does
not match, and Angular tries the next route. Add a route such as `items/:slug` or a wildcard if
those URLs should show a page.

## Route kinds

| Kind                  | Declaration                                        | Available operations                           |
| --------------------- | -------------------------------------------------- | ---------------------------------------------- |
| Named ordinary route  | A statically known primary `path` with `routeName` | Construct, navigate, read state, patch query   |
| Unnamed Angular route | Any route without `routeName`                      | Angular Router handles matching and navigation |

Named routes can have no component, including at a leaf. Redirects, wildcards, matchers, and
named outlets are supported only on unnamed routes, with Angular's ordinary configuration.
Angular's route order controls matching, so keep the order meaningful for overlapping patterns.

### Landing content

Use an empty-path child when a route needs landing content at its own URL as well as child pages:

```ts
{
  path: 'account/:accountId',
  routeName: RouteNames.ACCOUNT,
  pathParam: { codec: numberCodec() },
  component: AccountLayout,
  children: [
    { path: '', routeName: RouteNames.ACCOUNT_OVERVIEW, component: AccountOverview },
    { path: 'settings', routeName: RouteNames.ACCOUNT_SETTINGS, component: AccountSettings },
  ],
}
```

At `/account/7`, Angular activates the empty-path child and the account route. `ACCOUNT` and
`ACCOUNT_OVERVIEW` are both active; `activeRoute()` reports the deeper candidate. At
`/account/7/settings`, `ACCOUNT_SETTINGS` is deeper. The empty child constructs the same URL as its
parent.

## Codecs and placement

A codec converts one decoded string to a value and back:

```ts
interface UrlParamCodec<T> {
  serialize(value: T): string | null;
  deserialize(raw: string): T | null;
}
```

`null` means conversion failed. The value type `T` cannot contain `null` or `undefined`. Codecs are
pure; calling Angular `inject()` inside them is unsupported. The same codec can configure a path
placeholder or a query field:

```ts
const id = stringCodec();
const route = {
  path: 'users/:userId',
  routeName: RouteNames.USER,
  pathParam: { codec: id },
  queryParams: {
    search: queryParam({ codec: id }),
    tags: repeatedQueryParam({ codec: id }),
    ids: queryParam({ codec: listCodec(id, '|'), defaultValue: [] }),
  },
};
```

Query definitions can specify `defaultValue` and `required`. `repeatedQueryParam` puts each item
under its own key; `listCodec` joins items into one value. Each query property name is also its URL key.

### Built-in scalar codecs

| Codec                        | Accepted values                                                                                                                                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stringCodec()`              | Any string, including a present empty query value                                                                                                                                                       |
| `numberCodec()`              | A complete decimal number with optional sign, fraction, and exponent (`-1.5`, `.5`, `1e3`), or `Infinity` and `-Infinity`. Not `NaN`, hex, whitespace, empty strings, or partial numbers such as `12px` |
| `booleanCodec()`             | Exactly `true` and `false` in lowercase                                                                                                                                                                 |
| `enumCodec(values)`          | Values from a readonly string array, tuple, or string record. Throws at creation if any value is not a string                                                                                           |
| `listCodec(item, separator)` | A list of `item` values joined by `separator`. `''` is the empty list. Throws at creation if the separator is empty                                                                                     |

A numeric TypeScript enum fails `enumCodec`, because its reverse mapping adds number values. A
path segment cannot be empty: construction that serializes a path value to `''` fails. Use a
custom codec when the domain needs stricter rules, such as positive integers.

### Query cardinality

A scalar uses the last value if its key repeats: `?page=1&page=2` reads as `2`.

| Definition                                                       | URL            | Decoded array |
| ---------------------------------------------------------------- | -------------- | ------------- |
| `repeatedQueryParam({ codec })`                                  | `?tag=a&tag=b` | `['a', 'b']`  |
| `queryParam({ codec: listCodec(codec, ','), defaultValue: [] })` | `?tag=a,b`     | `['a', 'b']`  |

A repeated field reads a missing key as its default or `[]`. Empty items are kept if their codec
accepts them, so `?tag=` reads as `['']` with `stringCodec()`. One invalid item rejects the whole
array and uses the default or `[]`.

A list is an ordinary scalar field, so the scalar rules apply. Give it `defaultValue: []`, or a
missing key reads as `null`. If the key repeats, the last value wins: `?tag=a&tag=b,c` reads as
`['b', 'c']`. Items are not encoded separately; Angular encodes the whole value. An empty item, or
an item whose output contains the separator, fails conversion: `?tag=a,,b` reads as the default
with a diagnostic, and serializing `['a,b']` with `,` omits the field with a diagnostic.

## Defaults and required construction

```ts
queryParam({ codec: stringCodec(), defaultValue: 'en' });
queryParam({ codec: stringCodec(), defaultValue: () => inject(LocaleSettings).locale() });
```

A missing or malformed query value reads as its current default. A value deeply equal to that
default is omitted from a constructed or patched URL. Factories are synchronous and run in the
injection context of the environment that provided the router. They run on every read and write,
so a factory that reads a signal can change the decoded state without a navigation. Their errors
propagate; they are not treated as malformed URL data.

Without a default, optional scalars read as `null` and arrays as `[]`. Every declared field is
present in the decoded state. A defaulted scalar keeps its non-null value type.

`required: true` means a caller must supply the query property when constructing a destination.
TypeScript enforces it; there is no runtime check. It does not require a physical key in the URL
or change read behavior. `null` is an explicit choice for a nullable scalar, and `[]` for an
array. Path parameters are always required and non-null.

## Deterministic construction

```ts
const user = inject(AppRouter).routes.USER;
const link = user.createUrlTree({ path: { userId: '42' }, fragment: 'profile' });
await user.navigate({ path: { userId: '42' } }, { replaceUrl: true });
```

Supply all accumulated path values, including those declared on ancestors. Query input can omit
fields unless they are marked `required`. A destination depends only on these inputs and the
declarations; it never copies the current query, even when Angular's `defaultQueryParamsHandling`
is set to merge or preserve. Ancestor query fields are serialized before child fields, in
declaration order at each level.

`createUrlTree()` always returns a `UrlTree`. A path value has no fallback, so if its codec
returns a non-string, throws, or produces an empty segment, `createUrlTree()` throws and
`navigate()` rejects without calling Angular. The error names the route and placeholder, and a
codec's exception is in `cause`. A query value that fails to serialize is reported as a diagnostic
and omitted; construction continues.

`navigate()` takes construction values first and navigation options second. A route without
required values can pass `{}` or `undefined` before its options: `navigate({}, { replaceUrl: true })`.

`fragment` accepts a string or `null`. It is construction-only and does not appear in `params()`.
Navigation accepts Angular's navigation behavior options except `browserUrl`, which could display
a different address from the typed destination.

Pass the constructed `UrlTree` to Angular's `RouterLink`. `RouterLinkActive` also works. There is no library-specific link directive.

## Reactive state and updates

```ts
const results = inject(AppRouter).routes.RESULTS;
const query = computed(() => results.params().query);

await results.patchQuery({ search: 'elm', page: 1 });
await results.patchQuery((q) => ({ page: q.page + 1 }));
```

Each named route owns a stable readonly `params` signal containing `{ path, query }`, including
inherited parameters. It reads Angular's committed router state. Angular commits that state and
creates routed components before it emits `NavigationEnd`, so a component constructor reads the
destination's values, not the page it replaced. Reading an inactive route throws.

A patch changes only supplied fields. Omitted and `undefined` fields stay unchanged. Use `null` for
nullable scalars, `[]` for arrays, or a field's default to remove its URL representation. The
path, fragment, query fields owned by descendants, and undeclared keys are preserved.

A patch rewrites every query field the route declares from its decoded state. Fields that were
malformed or non-canonical in the URL are normalized as a side effect: after any patch on a route
with a `numberCodec()` page and default `1`, `?page=abc` and `?page=1` both disappear, and
`?page=02` becomes `?page=2`.

Every patch is one queued write. All routes and forms share this queue. A function patch runs
once, when its turn starts, against fresh committed state. It never runs synchronously. It returns
a partial query; no spread is needed. Later writes to the same field win. `patchQuery` accepts
`{ replaceUrl?: boolean }`. If the route is not active when the write's turn starts, the returned
promise rejects.

The returned promise reports the navigation result:

| Event                                                 | Result                                                                                       |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Successful navigation                                 | Resolves `true`                                                                              |
| Guard rejects, or Angular skips the same URL          | Resolves `false`; later writes continue                                                      |
| Patch function or navigation throws                   | Rejects; later writes continue                                                               |
| External navigation starts                            | Waiting writes resolve `false` without running; new writes resolve `false` until it finishes |
| A guard or route redirect changes a coordinated write | Waiting writes resolve `false`; the active write resolves with Angular's result              |
| Router's environment is destroyed                     | Waiting and active writes resolve `false`                                                    |

External navigation cancels waiting work even if a guard later rejects it, so a stale edit cannot
pull the user back to a page they tried to leave. Initial navigation counts as external: writes
submitted before it finishes resolve `false`.

### Guards and resolvers

A guard or resolver runs before Angular commits the destination, so `params()` still describes
the current page. Decode the destination from the snapshot Angular passes in:

```ts
export const seasonResolver: ResolveFn<Season> = (route) => {
  const { path } = inject(AppRouter).routes.SEASON.paramsFrom(route);
  return inject(SeasonApi).load(path.showId, path.season);
};
```

`paramsFrom(snapshot)` uses the same codecs and defaults as `params()`. The snapshot can be any
route snapshot from that navigation, so a child route's guard can read an ancestor's node. It
throws when the snapshot's tree does not contain the route.

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
the same codecs, defaults, and timing as route state. It does not need an active
route. Before initial navigation finishes, it reads the current snapshot with normal absent-key
behavior. Diagnostics name `globalQueryParams` as their route.

Each observer applies its own definitions; share definition objects when observers should agree.
`required` has no effect on reads. Creating an observer does not register fields in the tree,
preserve them during navigation, or write them back to the URL. There is no write method.

An optional second argument, `{ isEqual }`, compares the whole decoded query; the default is
`isEqual()`. Route equality does not affect global observers. Once you have the router, you can
create an observer outside an injection context. The router owns the subscription, so callers
need no cleanup.

### Query form bindings

Both form systems bind an active route's accumulated query fields. Path parameters are not
editable form state. Create or bind a form in an injection context while the route is active;
cleanup uses `DestroyRef`.

```ts
import { createQueryParamsFormGroup } from 'ngx-urlik/forms';

const filters = createQueryParamsFormGroup(results);
filters.patchValue({ search: 'elm', page: 1 });
```

The group has one non-nullable `FormControl` for each query field. Arrays use array-valued
controls; nested groups and `FormArray` are not supported. The creator adds no validators. For
validators or control options, build the exact group and call
`bindQueryParamsToFormGroup(results, group, options)`.

```ts
import { maxLength } from '@angular/forms/signals';
import { createQueryParamsSignalForm } from 'ngx-urlik/forms';

const { model, form } = createQueryParamsSignalForm(results, {
  schema: (fields) => maxLength(fields.search, 100),
});
```

This returns a writable model and an Angular `FieldTree`. You can also bind an existing field tree
with `bindQueryParamsToSignalForm(results, form, options)`.

The form starts from the URL. It then holds a draft while the URL holds committed values. Writes
replace the current history entry unless you pass `replaceUrl: false`. Other coordinated writes
update unrelated fields without touching drafts or interaction state. After a write commits, a draft that
encodes to the committed URL value stays as typed: with a codec that trims, `'elm '` writes
`?search=elm` and the input keeps its trailing space. External navigation cancels
pending edits when it starts and resets the form to a pristine, untouched URL baseline, even if
navigation is then blocked. It resets again when that navigation finishes.

A multi-field `patchValue` or `setValue` produces one write. Signal Forms read the model in an
effect, so model updates made before that effect runs share one write. A write includes only the
fields that `transformWrites` emits synchronously for that change; filtered or delayed fields are
excluded.

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
joins the queue when its transformation emits, not when the user typed. External navigation
resubscribes the transformation, which drops pending timers. Native Signal Forms debounce runs
before this transformation, so enabling both delays twice.

Change events contain `param`, `value`, the full `query` snapshot, and `valid`, `pending`,
`formValid`, and `formPending`. Validation does not block writes; filter events when that is the
policy you want.

Failed writes keep the entered values and are not retried. `onWriteFailure` receives
`{ kind: 'declined' }` or `{ kind: 'error', error }`. Without a callback, errors go to Angular's
`ErrorHandler` and declined writes are silent. Errors thrown inside `transformWrites` also go to
`ErrorHandler`. Destroying a binding cancels its waiting writes; it does not abort a navigation
that already started.

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

The result is a readonly signal of `{ route, node, params, createUrlTree, patchQuery }`. The
`route` alias narrows the other fields. The deepest active candidate wins, regardless of the order
of the candidates. If two aliases name the same node, the first one is reported.

`patchQuery` is the selected node's `patchQuery`. `createUrlTree({ query, fragment })` is different
from a node's: it starts from the active route's current path values and query, then applies the
supplied query fields. It suits links such as "next page" that keep the current filters. The
fragment comes only from the argument.

Candidates must be generated named nodes. Reading while no candidate is active throws. This keeps
a shared component's contract limited to the routes it understands.

## Equality

`isEqual()` is the default comparator. It compares primitives with `Object.is`, requires matching
prototypes, and compares dates by time. Maps compare by entries, with keys matched by identity.
Sets compare by members, each member matched to one deeply equal member. Arrays and other objects
compare by their enumerable string and symbol keys, recursively.

Cyclic values compare by structure: two objects that each point to themselves are equal when
their other fields are. Two invalid dates are not equal.

A route inherits its parent's `isEqual` unless it declares its own. The comparator controls signal
notifications. Patches and form initialization read fresh committed state, so a retained signal
value cannot make a write use an old query.

## Diagnostics and errors

Bad query data uses the default or absence behavior and emits a warning. Configure the reporter on
`defineAppRouter` with `diagnostics: { warn }`. The default calls `console.warn` with the message.

`AppRouterDiagnostic` contains `code`, `message`, `route`, `parameter`, and `operation`
(`'serialize'` or `'deserialize'`), plus `index` and `cause` when available.

| Code                       | When                                                                              |
| -------------------------- | --------------------------------------------------------------------------------- |
| `PARAM_DESERIALIZE_FAILED` | A codec returned `null` or threw                                                  |
| `PARAM_SERIALIZE_FAILED`   | A query codec returned a non-string or threw, or a repeated field got a non-array |

When a codec throws, the error is in `cause`. For a repeated field, `index` names the failed item.

`route` names the route that declares the parameter, which may be an ancestor of the route you
read. An unnamed ancestor is identified by position, such as `routes[0].children[1]`. Global
observers use `globalQueryParams`.

Codec exceptions in query fields are caught and treated as invalid data. Errors from default
factories propagate. Path values that fail to serialize and inactive route reads throw, because
there is no valid value to return. A path value that fails to decode never reaches a read: the
route does not match.

`defineAppRouter()` validates named route chains and throws one error listing every problem:
repeated or empty route names, names on redirects, wildcards, or matchers, `loadChildren` on a
named route or its ancestors, paths that are not statically known or contain empty segments or
reserved characters, `pathParam` maps that do not match the placeholders, repeated placeholder
names, and repeated query keys. Some of these are also type errors.
Angular validates its own route configuration.

The typed catalog is fixed when the router is defined. Replacing the named routes with
`Router.resetConfig()` is unsupported; the library does not detect it, and stale nodes build URLs
and read state against routes Angular no longer uses.

## Angular runtime relationship

`provideAppRouter(...features)` returns `EnvironmentProviders` that register the routes and the
`AppRouter` token, and forwards other Angular router features. Set router options on
`defineAppRouter(RouteNames, { routerConfig })`. The library keeps Angular's configuration,
including `paramsInheritanceStrategy`, and reads ancestor path values from the activated route
chain. Passing `withRouterConfig()` to the provider throws.

For native addressing outside the typed tree, use `router.escapeHatch`:

| Methods                                      | Readonly observations                                                           |
| -------------------------------------------- | ------------------------------------------------------------------------------- |
| `createUrlTree`, `navigate`, `navigateByUrl` | `url`, `events`, `navigated`                                                    |
| `parseUrl`, `serializeUrl`, `isActive`       | `currentNavigation`, `lastSuccessfulNavigation`, `componentInputBindingEnabled` |

These keep Angular's types and behavior, including `browserUrl` for native navigation.
`isActive(url, matchOptions?)` is Angular's `isActive()` function bound to the router and returns
a `Signal<boolean>`; Angular deprecated `Router.isActive` in 21.1. The escape
hatch does not expose `routerState`, route configuration or its mutation, lifecycle controls, or
deprecated mutable properties. Angular's `Router` remains injectable because it runs the
application router, but calls through it bypass the typed contract and the write queue.

## Types

| Type                      | Meaning                                     |
| ------------------------- | ------------------------------------------- |
| `RouteNode<P, Q, R>`      | A generated route node                      |
| `PathParamsOf<Node>`      | The node's accumulated path values          |
| `QueryParamsOf<Node>`     | The node's accumulated query values         |
| `RouteStateOf<Node>`      | The `{ path, query }` value of `params()`   |
| `RouteQueryPatch<Node>`   | The argument accepted by `patchQuery`       |
| `ActiveRoute<Candidates>` | The value of an `activeRoute()` signal      |
| `GeneratedAppRouter`      | The value of the `AppRouter` token          |
| `AppRouterDiagnostic`     | One diagnostic passed to `diagnostics.warn` |
