# ngx-urlik

ngx-urlik gives Angular routes names and typed parameters. Read the current URL through a
signal, change a filter with a patch, and build links from the same route object. Angular Router
still handles matching and navigation.

```ts
const results = inject(AppRouter).routes.RESULTS;

results.params().query.search;
await results.patchQuery({ search: 'elm', page: 1 });
```

The patch changes the search and resets the page in one navigation. Other query fields stay as
they are.

- [Get started](#get-started)
- [Routes](#routes)
- [Codecs and query fields](#codecs-and-query-fields)
- [Build destinations](#build-destinations)
- [Read state](#read-state)
- [Write the query](#write-the-query)
- [Bind a form](#bind-a-form)
- [Remember values in storage](#remember-values-in-storage)
- [Diagnostics and errors](#diagnostics-and-errors)
- [Work with Angular Router](#work-with-angular-router)
- [Types](#types)
- [Not supported](#not-supported)
- [TasteTrack demo](#tastetrack-demo)
- [Develop](#develop)

## Get started

The library targets Angular 22 and is not published to npm yet. The `ngx-urlik` entry point holds
the router; `ngx-urlik/forms` holds the form bindings and needs `@angular/forms`.

### Define the routes

Declare the route names, then pass them with Angular's ordered route array to `defineAppRouter()`.
Add `routeName` to each route that should get a typed node:

```ts
import { defineAppRouter, numberCodec, queryParam, stringCodec } from 'ngx-urlik';

export enum RouteNames {
  RESULTS = 'RESULTS',
}

export const { AppRouter, provideAppRouter } = defineAppRouter(RouteNames, {
  routes: [
    {
      path: 'results',
      routeName: RouteNames.RESULTS,
      queryParams: {
        search: queryParam({ codec: stringCodec(), defaultValue: '' }),
        page: queryParam({ codec: numberCodec(), defaultValue: 1 }),
      },
      loadComponent: () => import('./results-page').then((m) => m.ResultsPage),
    },
  ],
});
```

`RESULTS` is the name you use in code; `results` is the URL path. `AppRouter.routes` is typed from
the `RouteNames` members, so Go to Definition on `routes.RESULTS` opens the enum member that the
route declaration also uses.

Provide the router at bootstrap:

```ts
bootstrapApplication(App, { providers: [provideAppRouter()] });
```

### Read, write, and link

```ts
const results = inject(AppRouter).routes.RESULTS;

const search = computed(() => results.params().query.search);
await results.patchQuery((query) => ({ page: query.page + 1 }));

const link = results.createUrlTree({ query: { search: 'elm' } });
```

```html
<a [routerLink]="link">Search for elm</a>
```

`params` is a readonly signal of `{ path, query }` for the committed URL. `patchQuery` edits the
current URL. `createUrlTree` and `navigate` build a destination from the values you pass and do not
copy filters from the current URL.

## Routes

`AppRouter.routes` is flat even when the Angular routes are nested. A named descendant inherits the
path and query definitions of its ancestors, including unnamed ones.

Routes without `routeName` stay ordinary Angular routes and get no node. They can use any Angular
feature, such as redirects, wildcards, matchers, named outlets, and `loadChildren`. If no route uses
an ngx-urlik field, `defineAppRouter()` passes the array to Angular unchanged.

### Fields added to Angular routes

| Field         | What it does                                                                                                                                                                                          |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `routeName`   | Adds a node under `AppRouter.routes`. Names must be unique across the whole route array; `defineAppRouter()` throws and identifies both declarations. The name does not change the URL.               |
| `pathParam`   | Sets codecs for placeholders declared in this route's `path`, and optionally `persist`. Without it, placeholders are strings. Use `{ codec }` for one placeholder or a map keyed by placeholder name. |
| `queryParams` | Declares query fields this route owns. Named descendants inherit them, including fields on unnamed ancestors. Each key has one definition along a named route's chain.                                |
| `isEqual`     | Compares decoded `{ path, query }` state for the route's `params` signal. Descendants inherit it unless they provide their own. It controls signal updates, not which URL values a patch reads.       |

Angular fields such as `component`, `loadComponent`, and `canActivate` stay at the top level of the
route. A key that is neither an Angular `Route` field nor one of the four above is a type error.

Keep `path` and `routeName` literal so TypeScript can infer the nodes. A route array already
widened to Angular's `Routes` type type-checks, but its named routes produce no typed nodes.

### Named routes

A named route needs a statically known primary-outlet path. It and its ancestors cannot use
`loadChildren`, and its ancestors must declare their children statically. Components can still
load lazily with `loadComponent`. Named routes can have no component, including at a leaf.

The typed catalog is fixed when the router is defined. Replacing the named routes with
`Router.resetConfig()` is unsupported and not detected: stale nodes keep building URLs and reading
state against routes Angular no longer uses.

### Paths and placeholders

Paths contain static segments and Angular `:name` placeholders, such as
`shows/:showId/seasons/:season`. For one placeholder, `pathParam` can be `{ codec }` or
`{ showId: { codec } }`. For several, use a map with exactly one `{ codec }` entry per placeholder
on that route.

Path values are required when building a destination. Placeholder names cannot repeat along a named
route chain. A placeholder and a query field may share a name, because state keeps them under
separate `path` and `query` objects.

A `pathParam` codec also decides whether the route matches. ngx-urlik puts a `canMatch` check in
front of the route's own `canMatch` guards. With `numberCodec()` on `items/:id`, `/items/abc` does
not match, and Angular tries the next route. Add a route such as `items/:slug` or a wildcard if
those URLs should show a page.

### Landing content

Use an empty-path child when a route needs content at its own URL as well as child pages:

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

At `/account/7`, both `ACCOUNT` and `ACCOUNT_OVERVIEW` are active, and `activeRoute()` reports the
deeper one. At `/account/7/settings`, `ACCOUNT_SETTINGS` is deeper. The empty child builds the same
URL as its parent.

## Codecs and query fields

A codec converts one decoded string to a value and back:

```ts
interface UrlParamCodec<T> {
  serialize(value: T): string | null;
  deserialize(raw: string): T | null;
}
```

`null` means conversion failed. `T` cannot contain `null` or `undefined`. Codecs are pure; calling
`inject()` inside one is unsupported. The same codec can serve a placeholder or a query field:

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

Each query property name is also its URL key.

### Built-in codecs

| Codec                        | Accepted values                                                                                                                                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stringCodec()`              | Any string, including a present empty query value                                                                                                                                                       |
| `numberCodec()`              | A complete decimal number with optional sign, fraction, and exponent (`-1.5`, `.5`, `1e3`), or `Infinity` and `-Infinity`. Not `NaN`, hex, whitespace, empty strings, or partial numbers such as `12px` |
| `booleanCodec()`             | Exactly `true` and `false` in lowercase                                                                                                                                                                 |
| `enumCodec(values)`          | Values from a readonly string array, tuple, or string record. Throws at creation if any value is not a string                                                                                           |
| `listCodec(item, separator)` | A list of `item` values joined by `separator`. `''` is the empty list. Throws at creation if the separator is empty                                                                                     |

A numeric TypeScript enum fails `enumCodec`, because its reverse mapping adds number values. A path
segment cannot be empty, so building a URL whose path value serializes to `''` fails. Write a
custom codec for dates, structured values, or stricter rules such as positive integers.

### Single and repeated values

A scalar uses the last value if its key repeats: `?page=1&page=2` reads as `2`. An array can live in
the URL two ways:

| Definition                                                       | URL            | Decoded array |
| ---------------------------------------------------------------- | -------------- | ------------- |
| `repeatedQueryParam({ codec })`                                  | `?tag=a&tag=b` | `['a', 'b']`  |
| `queryParam({ codec: listCodec(codec, ','), defaultValue: [] })` | `?tag=a,b`     | `['a', 'b']`  |

A repeated field reads a missing key as its default or `[]`. Empty items are kept if their codec
accepts them, so `?tag=` reads as `['']` with `stringCodec()`. One invalid item rejects the whole
array, which then reads as the default or `[]`.

A list is an ordinary scalar field, so the scalar rules apply. Give it `defaultValue: []`, or a
missing key reads as `null`. If the key repeats, the last value wins: `?tag=a&tag=b,c` reads as
`['b', 'c']`. Angular encodes the whole joined value, not each item. An empty item, or an item whose
output contains the separator, fails conversion: `?tag=a,,b` reads as the default with a
diagnostic, and serializing `['a,b']` with `,` omits the field with a diagnostic.

### Defaults and required fields

```ts
queryParam({ codec: stringCodec(), defaultValue: 'en' });
queryParam({ codec: stringCodec(), defaultValue: () => inject(LocaleSettings).locale() });
```

A missing or malformed query value reads as its current default. A value deeply equal to the
default is left out of a built or patched URL, except for a
[persisted field](#remember-values-in-storage), which always appears.

A default factory is synchronous and runs in the injection context of the environment that
provided the router. It runs on every read and write, so a factory that reads a signal can change
the decoded state without a navigation. Its errors propagate; they are not treated as malformed URL
data.

Without a default, an optional scalar reads as `null` and an array as `[]`. Every declared field is
present in the decoded state, and a defaulted scalar keeps its non-null type.

`required: true` means a caller must supply the field when building a destination. TypeScript
enforces it; there is no runtime check. It does not require a key in the URL or change reads. Pass
`null` for a nullable scalar or `[]` for an array to choose "no value" explicitly. Path values are
always required and non-null.

## Build destinations

```ts
const user = inject(AppRouter).routes.USER;
const link = user.createUrlTree({ path: { userId: '42' }, fragment: 'profile' });
await user.navigate({ path: { userId: '42' } }, { replaceUrl: true });
```

Supply every path value along the chain, including those declared on ancestors. Query input can
leave out any field not marked `required`. The destination depends only on these inputs and the
declarations. It never copies the current query, even when Angular's `defaultQueryParamsHandling`
is set to merge or preserve, and there is no relative navigation. Ancestor query fields come before
child fields in the URL, in declaration order at each level.

`createUrlTree()` returns a `UrlTree`. If a path codec returns a non-string, throws, or produces an
empty segment, `createUrlTree()` throws and `navigate()` rejects without calling Angular. The error
names the route and placeholder, and a codec's exception is in `cause`. A query value that fails to
serialize is reported as a diagnostic and left out; the rest of the URL is still built.

`navigate()` takes the destination values first and navigation options second. A route without
required values can pass `{}` or `undefined` first: `navigate({}, { replaceUrl: true })`. It
accepts Angular's navigation options except `browserUrl`, which could show a different address
from the typed destination.

`fragment` accepts a string or `null`. It has no codec and does not appear in `params()`.

Pass the `UrlTree` to Angular's `RouterLink`. `RouterLinkActive` works too. There is no
library-specific link directive.

## Read state

```ts
const results = inject(AppRouter).routes.RESULTS;
const query = computed(() => results.params().query);
```

Each named route has one readonly `params` signal of `{ path, query }`, including inherited
parameters. It reads Angular's committed router state. Angular commits that state and creates the
routed components before it emits `NavigationEnd`, so a component constructor reads the
destination's values, not the page it replaced. Reading an inactive route throws.

### Guards and resolvers

A guard or resolver runs before Angular commits the destination, so `params()` still describes the
current page. Decode the destination from the snapshot Angular passes in:

```ts
export const seasonResolver: ResolveFn<Season> = (route) => {
  const { path } = inject(AppRouter).routes.SEASON.paramsFrom(route);
  return inject(SeasonApi).load(path.showId, path.season);
};
```

`paramsFrom(snapshot)` uses the same codecs and defaults as `params()`. The snapshot can be any
route snapshot from that navigation, so a child route's guard can read an ancestor's node. It
throws when the snapshot's tree does not contain the route.

### Components shared by several routes

A component shared by several routes names the routes it supports:

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

The result is a readonly signal of `{ route, node, params, createUrlTree, patchQuery }`. Checking
the `route` alias narrows the other fields. The deepest active candidate wins, whatever the order
of the candidates. If two aliases name the same node, the first is reported. Candidates must be
named nodes, and reading while none is active throws.

`patchQuery` is the selected node's `patchQuery`. `createUrlTree({ query, fragment })` differs from
a node's: it starts from the active route's current path values and query, then applies the
supplied query fields. Use it for links such as "next page" that keep the current filters. The
fragment comes only from the argument.

### Query fields that belong to no page

Declare fields a page owns on its route. A service that follows a convention across pages, such as
a campaign source, can read it independently:

```ts
const campaign = router.globalQueryParams({
  source: queryParam({ codec: stringCodec() }),
});
campaign().source;
```

The result is a readonly signal of the decoded query object, without a `query` wrapper. It uses the
same codecs, defaults, and timing as route state and does not need an active route. Before the
initial navigation finishes, it reads the current snapshot. Diagnostics name `globalQueryParams`
as their route.

Each observer applies its own definitions; share definition objects when observers should agree.
`required` and `persist` have no effect here. An observer does not register its fields with the
routes, keep them during navigation, or write them back. There is no write method.

An optional second argument, `{ isEqual }`, compares the whole decoded query. You can create an
observer outside an injection context once you have the router. The router owns the subscription,
so there is nothing to clean up.

### Equality

`isEqual()`, exported from `ngx-urlik`, is the default comparator. It compares primitives with
`Object.is`, requires matching prototypes, and compares dates by time. Maps compare by entries,
with keys matched by identity. Sets compare by members, each matched to one deeply equal member.
Arrays and other objects compare by their enumerable string and symbol keys, recursively. Cyclic
values compare by structure. Two invalid dates are not equal.

A route inherits its parent's `isEqual` unless it declares its own. The comparator only decides
when the signal notifies. Patches and forms read fresh committed state, so a retained signal value
cannot make a write use an old query.

## Write the query

```ts
await results.patchQuery({ search: 'elm', page: 1 });
await results.patchQuery((query) => ({ page: query.page + 1 }));
```

A patch changes only the fields you supply. Omitted and `undefined` fields stay unchanged. To
remove a field from the URL, set it to its default, `null` for a nullable scalar, or `[]` for an
array. The path, fragment, fields owned by descendant routes, and undeclared keys stay as they
are. `patchQuery` accepts `{ replaceUrl?: boolean }`.

A patch rewrites every query field the route declares from its decoded state, so malformed and
non-canonical values are cleaned up along the way. After any patch on a route with a
`numberCodec()` page and default `1`, `?page=abc` and `?page=1` both disappear, and `?page=02`
becomes `?page=2`.

### One write at a time

Every route and form shares one write queue. Each patch waits for the previous write to commit,
then applies to the URL it left. Two components that patch different fields at the same moment both
keep their edit. Two plain `router.navigate()` calls would each build from the snapshot they read,
and the second would drop the first one's change.

A function patch runs once, when its turn starts, against the latest committed query. It never runs
synchronously. Return only the fields to change; no spread is needed. Later writes to the same field
win. If the route is not active when the write's turn starts, the promise rejects.

The returned promise reports the navigation result:

| Event                                                 | Result                                                                                       |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Successful navigation                                 | Resolves `true`                                                                              |
| Guard rejects, or Angular skips the same URL          | Resolves `false`; later writes continue                                                      |
| Patch function or navigation throws                   | Rejects; later writes continue                                                               |
| External navigation starts                            | Waiting writes resolve `false` without running; new writes resolve `false` until it finishes |
| A guard or route redirect changes a coordinated write | Waiting writes resolve `false`; the active write resolves with Angular's result              |
| Router's environment is destroyed                     | Waiting and active writes resolve `false`                                                    |

External navigation is any navigation the queue did not start, such as a link, the Back button, or
a call through Angular's `Router`. It cancels waiting work even if a guard later rejects it, so a
stale edit cannot pull the user back to a page they tried to leave. The initial navigation counts
as external: writes submitted before it finishes resolve `false`.

## Bind a form

A form holds a draft while the URL holds the committed value. Both Angular form systems bind an
active route's query fields; path values are not form state. Import the bindings from
`ngx-urlik/forms`, and create or bind a form in an injection context while its route is active.
Cleanup uses `DestroyRef`.

### Reactive Forms

```ts
import { createQueryParamsFormGroup } from 'ngx-urlik/forms';

const filters = createQueryParamsFormGroup(results);
filters.patchValue({ search: 'elm', page: 1 });
```

The group has one non-nullable `FormControl` per query field. Arrays use array-valued controls;
nested groups and `FormArray` are not supported. The creator adds no validators. For validators or
control options, build the group yourself and call
`bindQueryParamsToFormGroup(results, group, options)`.

### Signal Forms

```ts
import { maxLength } from '@angular/forms/signals';
import { createQueryParamsSignalForm } from 'ngx-urlik/forms';

const { model, form } = createQueryParamsSignalForm(results, {
  schema: (fields) => maxLength(fields.search, 100),
});
model.update((query) => ({ ...query, search: 'elm' }));
```

This returns a writable model and an Angular `FieldTree`. To bind a field tree you already have,
call `bindQueryParamsToSignalForm(results, form, options)`.

### How a form writes

The form starts from the URL. A multi-field `patchValue` or `setValue` produces one write. Signal
Forms read the model in an effect, so model updates made before that effect runs share one write.
Writes replace the current history entry unless you pass `replaceUrl: false`.

Writes from other routes and forms update unrelated fields without touching drafts or interaction
state. After a write commits, a draft that encodes to the committed URL value stays as typed: with a
codec that trims, `'elm '` writes `?search=elm` and the input keeps its trailing space.

External navigation, such as the Back button, cancels pending edits when it starts and resets the
form to a pristine, untouched copy of the URL, even if the navigation is then blocked. The form
resets again when the navigation finishes.

### Delay a field

Signal Forms delay a field with Angular's own `debounce()` rule. The model updates when the delay
ends, and the binding writes then:

```ts
import { debounce } from '@angular/forms/signals';

const { form } = createQueryParamsSignalForm(results, {
  schema: (fields) => debounce(fields.search, 300),
});
```

The rule acts on input that goes through the `[formField]` directive. A direct `model.update(...)`
is not delayed.

Reactive Forms have no debounce of their own, so the Reactive Forms binding takes one:

```ts
const filters = createQueryParamsFormGroup(results, { debounce: { search: 300 } });
```

The search writes 300 ms after its last change. Other fields write at once, without flushing or
replacing the pending search. External navigation and destroying the binding drop the pending
write.

### Hold invalid input

By default every change writes. With `writeWhen: 'valid'`, a field writes only while its validators
pass:

```ts
import { debounce, minLength } from '@angular/forms/signals';

const { form } = createQueryParamsSignalForm(results, {
  schema: (fields) => {
    debounce(fields.search, 300);
    minLength(fields.search, 3);
  },
  writeWhen: 'valid',
});
```

Typing `el` writes nothing; `elm` writes. Clearing the field writes the empty search, because
Angular's length validators accept empty values. The rule applies per field: an invalid search does
not stop a valid page change. A field with a pending async validator waits and writes when the
validator passes. A held field keeps its draft until it becomes valid, the user changes it, or
external navigation resets the form. Reactive Forms take the same option; add the validators to the
controls.

### Change other fields before a write

A new search usually sends the user back to the first page. Which fields reset, and when, depends on
the page, so the binding asks through `beforeWrite`:

```ts
const filters = createQueryParamsFormGroup(results, {
  debounce: { search: 300 },
  beforeWrite: (patch) => ('search' in patch ? { page: 1, ...patch } : patch),
});
```

On `/results?page=4`, typing `elm` writes `?search=elm` in one navigation, and the page control then
shows 1. A page change on its own is written unchanged. Because `patch` is spread last,
`patchValue({ search: 'elm', page: 3 })` keeps page 3. Signal Forms take the same option. Outside a
form, set both fields in one patch: `patchQuery({ search, page: 1 })`.

`beforeWrite(patch, draft)` runs right before a write is queued: after `writeWhen` has held back
invalid fields, and after a delayed field's delay ends. `patch` holds only the fields about to be
written; `draft` is the whole form value. The binding writes the returned object, and an
`undefined` field keeps its URL value, as in `patchQuery()`.

Use `beforeWrite` to change other fields, and shape a field's own value in its codec. A field that
`beforeWrite` trims writes a URL value that differs from the draft, so the committed value replaces
the draft in the form. Fields that `beforeWrite` adds are not drafts; after the write commits, the
form reads them from the URL.

### Failed writes

Failed writes keep the entered values and are not retried. `onWriteFailure` receives
`{ kind: 'declined' }` or `{ kind: 'error', error }`. Without a callback, errors go to Angular's
`ErrorHandler` and declined writes are silent. If `beforeWrite` throws, the error goes to
`ErrorHandler`, not to `onWriteFailure`; nothing is written, and the edited fields keep their
drafts. Destroying a binding cancels its waiting writes but does not abort a navigation that
already started.

## Remember values in storage

A list page can remember the page size a user chose, so a plain link back to the list shows it
again:

```ts
pageSize: queryParam({
  codec: numberCodec(),
  defaultValue: 24,
  persist: { key: 'pageSize', storage: 'local' },
}),
```

After a navigation to `/results?pageSize=48`, `localStorage` holds `48` under
`ngx-urlik:pageSize`. A later navigation to `/results` arrives at `/results?pageSize=48`.

### Persist options

| Option    | Meaning                                                                                                             |
| --------- | ------------------------------------------------------------------------------------------------------------------- |
| `key`     | Names the stored value. Fields that use the same key share one value, even on different routes                      |
| `storage` | `'local'` for `localStorage`, which outlives the tab, or `'session'` for `sessionStorage`, which belongs to one tab |
| `scope`   | Optional. Path parameter names whose values narrow the key                                                          |

Only `queryParam` with a `defaultValue` accepts `persist`: a persisted field always has a value in
the URL, and `null` has no URL text. `repeatedQueryParam` does not accept it, because an empty array
has no URL keys. Persist an array as a list instead:
`queryParam({ codec: listCodec(stringCodec(), ','), defaultValue: [], persist })` writes the empty
list as `?tags=`. TypeScript rejects both cases, and `defineAppRouter()` checks them again at
runtime.

`scope` gives each path value its own stored value. On `users/:userId`, a tab field with
`scope: ['userId']` stores the tab of user 7 under `ngx-urlik:tab:7`. A query field's scope may name
any path parameter of its route chain.

The storage key is `${prefix}${key}`, or `${prefix}${key}:${values}` with a scope. Each scope value
is the parameter's raw path segment passed through `encodeURIComponent`, and the values are joined
with `:`. A key must not contain `:`, or `clearPersisted({ local: ['a'] })` could not tell the scopes
of `a` from a key named `a:b`. The prefix applies to the whole router and defaults to
`'ngx-urlik:'`:

```ts
defineAppRouter(RouteNames, { routes, persistence: { prefix: 'shop:' } });
```

### Read order

A valid URL value wins. Otherwise the stored value is used if it decodes with the field's codec,
and otherwise the default. A stored value that fails to decode is removed from storage, so it is
reported once. `params()`, `paramsFrom()`, `activeRoute()`, and form bindings all follow this
order. `globalQueryParams()` ignores `persist`.

### Restored values go into the URL

When a navigation arrives at a route chain with a persisted field that is missing from the URL or
fails to decode, ngx-urlik redirects to the same URL with that field filled in: from storage, or
with the default when nothing usable is stored. The path, the other query keys, and the fragment
stay. One redirect fills every persisted field of the chain.

The redirect adds no history entry of its own. A link click adds one entry, for the restored URL;
the first page load and the Back button replace the current entry. Angular reports the replaced
navigation with `NavigationCancel`.

The redirect comes from a `canMatch` check appended to the `canMatch` guards of each route in the
chain. Angular runs `canMatch` on every navigation, including when it reuses the route, so the
route's own guards and `runGuardsAndResolvers` stay as they are. Only the route that ends the match
redirects, so a layout route never redirects a URL that then fails to match below it.

Because the check runs during matching, `canActivate`, `canActivateChild`, resolvers, and the
`canDeactivate` of the page you leave run once, and only see the URL with the value filled in.
`canMatch` guards on the route and its ancestors run before the check, so they run twice when a
value is restored: first without it, then with it. Do not base a `canMatch` decision on a persisted
query value.

If the URL has named outlets, such as `/library/(books//side:panel)`, and an earlier redirect in
the same navigation changed the primary path, the check does not redirect; `params()` still reads
the stored value.

A persisted field always appears in the URL, even at its default: `patchQuery()`, form writes, and
`activeRoute().createUrlTree()` write `?pageSize=24` instead of leaving it out. `createUrlTree()`
and `navigate()` on a node leave out a persisted field you do not supply, and the arrival restores
it, so a missing key means "restore, else default". A supplied value equal to the default is
written.

### Remember a path value

A show page can reopen the season a user watched last:

```ts
{
  path: 'shows/:showId',
  routeName: RouteNames.SHOW,
  children: [
    {
      path: 'seasons/:season',
      routeName: RouteNames.SEASON,
      pathParam: {
        codec: numberCodec(),
        persist: { key: 'season', storage: 'session', scope: ['showId'] },
      },
    },
  ],
}
```

After a visit to `/shows/tv_1/seasons/2`, a navigation to `/shows/tv_1/seasons` arrives at
`/shows/tv_1/seasons/2`. The query and fragment stay. Without a stored season for that show, the
shorter URL matches whatever it would match otherwise: a route declared earlier at that path, the
next matching route, or the not-found page.

The shorter URL is always the route's own path without the persisted placeholders, so choose the
path with that URL in mind. Here `/shows/tv_1/seasons` means "the season I opened last". To open the
show page when nothing is stored, declare an ordinary redirect after the named route:
`{ path: 'seasons', pathMatch: 'full', redirectTo: '' }`.

Only a named route can persist a placeholder, and the persisted placeholders must end the route's
own `path`. In `shows/:showId/seasons/:season`, only `season` can persist. In `pair/:a/:b`, both can,
and then `/pair` and `/pair/5` are both restored. A placeholder's scope may name only placeholders
before it in the route chain, because the shorter URL must already contain them.

For this, `defineAppRouter()` adds unnamed Angular routes right after the named one, each with a
`matcher` that accepts the shorter path only when the missing values are stored and decode, and a
`redirectTo` with the full path. The restore is part of the same navigation: one
`NavigationStart`, no `NavigationCancel`, and `urlAfterRedirects` is the full URL. These routes do
not appear in `AppRouter.routes`.

Angular turns redirects off at a level after a sibling route there redirected, so a shorter URL
produced by an earlier redirect in the same navigation is not restored.

ngx-urlik saves any value that decodes; it cannot know whether season 9 exists. When the app finds
that a restored value is wrong, for example because the backend has no such season, the app decides
what to do, such as calling `clearPersisted()` and navigating to the show page.

### Save

After every committed navigation (`NavigationEnd`), whatever started it, ngx-urlik saves each
persisted field and placeholder of the active route chain. Form writes, `patchQuery()`, links, and
the Back button all count. It stores the URL text of the committed value and skips a value that
does not decode. Form drafts are never saved.

Storage is read only when the URL lacks a usable value. Changes made in another tab are not
observed; they apply at the next restore.

### Forget stored values

A reset button can forget what the router remembered:

```ts
router.clearPersisted();
router.clearPersisted({ session: true });
router.clearPersisted({ local: ['pageSize'] });
```

Without an argument, `clearPersisted()` removes every key with the router's prefix from both
`localStorage` and `sessionStorage`. With an object, it touches only the storages set to `true` or
to an array, so `{}` removes nothing. `true` removes every prefixed key in that storage. An array
removes each listed key with all of its scopes: `['tab']` removes `ngx-urlik:tab` and
`ngx-urlik:tab:7`, but not `ngx-urlik:tabs`. A listed key that no route declares is reported as
`UNKNOWN_PERSIST_KEY` and otherwise ignored.

Clearing does not change the current URL. The current page's values are saved again at its next
committed navigation.

### Without storage

On the server, and when browser storage is unavailable or throws (private browsing, a full quota,
blocked access), persistence does nothing: reads use the default, nothing is saved or cleared, and
nothing is redirected. With server rendering, the server renders the default and the browser
restores the stored value in its first navigation, so the page content can change after hydration.

## Diagnostics and errors

Bad query data falls back to the default and reports a diagnostic; the operation continues.
Configure the reporter with `diagnostics: { warn }` on `defineAppRouter`. The default calls
`console.warn` with the message.

| Code                              | When                                                                              |
| --------------------------------- | --------------------------------------------------------------------------------- |
| `PARAM_DESERIALIZE_FAILED`        | A codec returned `null` or threw                                                  |
| `PARAM_SERIALIZE_FAILED`          | A query codec returned a non-string or threw, or a repeated field got a non-array |
| `STORED_VALUE_DESERIALIZE_FAILED` | A stored value failed to decode; it is removed and the default applies            |
| `UNKNOWN_PERSIST_KEY`             | `clearPersisted()` received a key that no route declares                          |

`AppRouterDiagnostic` is a union; narrow it by `code`. A parameter diagnostic contains `code`,
`message`, `route`, `parameter`, and `operation` (`'serialize'` or `'deserialize'`), plus `index`,
`cause`, and the storage `key` when available. A codec's exception is in `cause`, and for a repeated
field `index` names the failed item. An `UNKNOWN_PERSIST_KEY` diagnostic contains only `code`,
`message`, and `key`.

`route` names the route that declares the parameter, which may be an ancestor of the route you
read. An unnamed ancestor is identified by position, such as `routes[0].children[1]`.

Some failures throw because there is no valid value to return: reading an inactive route, a path
value that fails to serialize, and errors from default factories. A path value that fails to decode
never reaches a read, because the route does not match.

`defineAppRouter()` validates the named route chains and throws one error that lists every problem:

- repeated or empty route names
- names on redirects, wildcards, or matchers
- `loadChildren` on a named route or its ancestors
- paths that are not statically known, or contain empty segments or reserved characters
- `pathParam` maps that do not match the placeholders
- repeated placeholder names or query keys along a chain
- `persist` options that are malformed, lack a default, sit on a repeated field, name an unknown
  scope, use a key containing `:`, or persist a placeholder that does not end a named route's path

TypeScript catches some of these earlier. Angular validates its own route configuration.

## Work with Angular Router

`provideAppRouter(...features)` returns `EnvironmentProviders` that register the routes and the
`AppRouter` token, and forwards other Angular router features. Put router options on
`defineAppRouter(RouteNames, { routerConfig })`; passing `withRouterConfig()` to
`provideAppRouter()` throws. ngx-urlik keeps the options you supply, including
`paramsInheritanceStrategy`.

Angular's route order, matching, guards, redirects, and outlets decide which route activates. Keep
the order meaningful for overlapping patterns.

### Escape hatch

`AppRouter.escapeHatch` exposes Angular's own addressing and navigation observations, for URLs
outside the typed routes:

| Methods                                      | Readonly observations                                                           |
| -------------------------------------------- | ------------------------------------------------------------------------------- |
| `createUrlTree`, `navigate`, `navigateByUrl` | `url`, `events`, `navigated`                                                    |
| `parseUrl`, `serializeUrl`, `isActive`       | `currentNavigation`, `lastSuccessfulNavigation`, `componentInputBindingEnabled` |

These keep Angular's types and behavior, including `browserUrl`.
`isActive(url, matchOptions?)` is Angular's `isActive()` function bound to the router and returns a
`Signal<boolean>`. The escape hatch does not expose `routerState`, route configuration, lifecycle
controls, or deprecated mutable properties.

Angular's `Router` stays injectable, because it runs the application. Calls through it bypass the
typed routes and the write queue.

### Flag direct router use

ESLint's core `no-restricted-imports` rule makes each import of `Router` or `ActivatedRoute`
visible:

```js
// eslint.config.js
export default [
  {
    files: ['src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'warn',
        {
          paths: [
            {
              name: '@angular/router',
              importNames: ['ActivatedRoute', 'Router'],
              message:
                'Read and write the URL through AppRouter routes. Use AppRouter.escapeHatch for native operations.',
            },
          ],
        },
      ],
    },
  },
];
```

The rule warns rather than fails, so a deliberate native call can stay with an
`eslint-disable-next-line` comment that explains it. `RouterLink`, `RouterOutlet`, `ResolveFn`,
`ActivatedRouteSnapshot`, and other router imports stay allowed, because templates and guards still
need them.

## Types

| Type                            | Meaning                                     |
| ------------------------------- | ------------------------------------------- |
| `RouteNode<P, Q, R>`            | A generated route node                      |
| `PathParamsOf<Node>`            | The node's accumulated path values          |
| `QueryParamsOf<Node>`           | The node's accumulated query values         |
| `RouteStateOf<Node>`            | The `{ path, query }` value of `params()`   |
| `RouteQueryPatch<Node>`         | The argument accepted by `patchQuery`       |
| `ActiveRoute<Candidates>`       | The value of an `activeRoute()` signal      |
| `GeneratedAppRouter`            | The value of the `AppRouter` token          |
| `UrlParamCodec<T>`              | A codec                                     |
| `AppRouterDiagnostic`           | One diagnostic passed to `diagnostics.warn` |
| `AppRouterParameterDiagnostic`  | A diagnostic about one parameter's value    |
| `AppRouterUnknownKeyDiagnostic` | An `UNKNOWN_PERSIST_KEY` diagnostic         |

## Not supported

| Not supported                                              | Current behavior                                                                |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Angular versions other than 22                             | The library targets Angular 22                                                  |
| Typed redirects, wildcards, matchers, and named outlets    | Declare them as unnamed Angular routes                                          |
| Route arrays split across files                            | Pass the literal routes to `defineAppRouter()` directly                         |
| Replacing routes with `Router.resetConfig()`               | Declare every named route up front; load components lazily with `loadComponent` |
| Query property names that differ from URL keys             | Each property name is its URL key                                               |
| One array field in both repeated-key and joined-list form  | Each field uses one form                                                        |
| Built-in date or structured codecs                         | Write a custom codec                                                            |
| Writing global query fields                                | Global observers are read-only; route nodes own query writes                    |
| Reading the fragment                                       | Fragments can be supplied when building a destination                           |
| Typed relative navigation                                  | Use the escape hatch                                                            |
| Write options other than `replaceUrl`                      | Patches accept `replaceUrl` only                                                |
| Inferred types in route `isEqual` callbacks                | The callback receives `unknown`                                                 |
| Following stored values that another tab changes           | The change applies at the next restore                                          |
| Forgetting the stored value of one scope, such as one show | `clearPersisted()` forgets a key for every scope                                |

## TasteTrack demo

TasteTrack is a movie and TV journal in [`projects/taste-track`](projects/taste-track). It uses only
the public `ngx-urlik` and `ngx-urlik/forms` entry points, and stores its data in the browser with
IndexedDB. Run it from the repository root with the Node version in `.nvmrc`:

```sh
npm ci
npm start
```

Things to try:

1. Change the movie genres, sort order, and page size. Reload. The URL restores the filters.
2. Open TV shows → Brambleworth Manor → Season 2 → Browse episodes → The Callback Nobody Returned.
   The address, `/tv/brambleworth-manor/s/2/e/1`, supplies the show, season, and episode
   parameters. The ID codec leaves the `tv_` prefix out of the URL and adds it back when reading.
   Then open `/tv/brambleworth-manor/s`. It arrives at `…/s/2`, the season you opened last in this
   tab. A show with no remembered season opens the show page, which lists its seasons.
3. Follow a credit to a person or studio, then follow a title back to the catalog.
4. Change a rating and log a viewing. Reload to check that both were saved.
5. Filter Library, then Viewing history. Library uses Signal Forms; history uses Reactive Forms
   with a debounced search. Both hold searches shorter than three letters.
6. Reset TasteTrack in Settings. The seed data returns and your theme stays.

| Page                             | Feature                                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Movie and TV browsing            | Query fields inherited from a parent route with no path segment, repeated genres, sorting, and pagination    |
| Show → season → episode          | Accumulated path parameters, an ID codec that leaves its prefix out of the URL, and an integer codec         |
| Page size and last season        | A persisted query field in `localStorage`, and a persisted path value scoped to the show in `sessionStorage` |
| Detail section links             | URL fragments                                                                                                |
| Credits and contributor profiles | Typed navigation across branches                                                                             |
| Library                          | Signal Forms, repeated statuses, joined media list, structured viewing counts                                |
| Viewing history                  | Reactive Forms with a debounced, validated search                                                            |
| Landing pages                    | Empty-path children and redirects                                                                            |
| Unknown URLs                     | Wildcard routes                                                                                              |

Shared pages use `activeRoute()` to select their route, and `paginationParams()` shares definitions
across pages. The form pages reset the page number in `beforeWrite`; the catalog resets it in the
same `patchQuery()` patch. Sort order is one structured codec value, so the field and direction
travel together.

The backend lives in `projects/taste-track/src/app/backend/`. `BackendApi` runs every query and
mutation, and each query returns an `Observable` that pages turn into signals with `toObservable`,
`switchMap`, and `toSignal`. `TasteTrackRepository` keeps the IndexedDB tables, through Dexie, in
signals; after a mutation it reloads them and bumps `dataVersion`, so open queries emit again. A
deterministic seed fills the database on first run and on reset: 30 movies, 30 shows, 66 seasons,
394 episodes, 8 people, and 4 studios. Catalog data is read-only; ratings, statuses, favorites,
counts, and viewing events survive reloads. Reset affects only the TasteTrack database, and the
theme lives in separate storage.

## Develop

Use the Node version in `.nvmrc`:

```sh
npm ci
npm run build      # library, then demo
npm test           # unit tests for both
npm run typecheck  # public type tests
npm run e2e        # Playwright against the demo
```

[Design decisions](docs/decisions.md) explains why the library looks this way and what each choice
costs. [Reading the code](docs/implementation.md) shows where behavior lives and how writes move
through it.

## License

[MIT](LICENSE)
