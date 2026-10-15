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

| Field         | What it does                                                                                                                                                                                          |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `routeName`   | Adds a node under `AppRouter.routes`. Names must be unique across the whole route array; `defineAppRouter()` throws and identifies both declarations. The name does not change the URL.               |
| `pathParam`   | Sets codecs for placeholders declared in this route's `path`, and optionally `persist`. Without it, placeholders are strings. Use `{ codec }` for one placeholder or a map keyed by placeholder name. |
| `queryParams` | Declares query fields this route owns. Named descendants inherit them, including fields on unnamed ancestors. Each key has one definition along a named route's chain.                                |
| `isEqual`     | Compares decoded `{ path, query }` state for the route's `params` signal. Descendants inherit it unless they provide their own. It controls signal updates, not which URL values a patch reads.       |

Keep `path` and `routeName` literal so TypeScript can infer the nodes. A route array already
widened to Angular's `Routes` type type-checks, but its named routes produce no typed nodes. A key
that is neither an Angular `Route` field nor one of the four above is a type error.

Paths can contain static segments and named placeholders, such as `shows/:showId/seasons/:season`.
For a single placeholder, `pathParam` can be `{ codec }` or `{ showId: { codec } }`. For several
placeholders, use a map with exactly one `{ codec }` entry per placeholder on that route. An entry
can also [persist](#remember-a-path-value) its value. Path
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

Query definitions can specify `defaultValue` and `required`; a scalar with a default can also
[persist](#remember-values-in-storage) its value in browser storage. `repeatedQueryParam` puts each item
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
default is omitted from a constructed or patched URL, except for a
[persisted field](#remember-values-in-storage), which always appears. Factories are synchronous and run in the
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
update unrelated fields without touching drafts or interaction state. After a write commits, a
draft that encodes to the committed URL value stays as typed: with a codec that trims, `'elm '`
writes `?search=elm` and the input keeps its trailing space. External navigation cancels pending
edits when it starts and resets the form to a pristine, untouched URL baseline, even if navigation
is then blocked. It resets again when that navigation finishes.

A multi-field `patchValue` or `setValue` produces one write. Signal Forms read the model in an
effect, so model updates made before that effect runs share one write.

#### Delay a field

Signal Forms delay a field with Angular's own `debounce()` rule. The model updates when the delay
ends, and the binding writes then:

```ts
import { debounce } from '@angular/forms/signals';

const { form } = createQueryParamsSignalForm(results, {
  schema: (fields) => debounce(fields.search, 300),
});
```

The rule acts on input that goes through the `[formField]` directive. A direct
`model.update(...)` is not delayed.

Reactive Forms have no debounce of their own, so the Reactive Forms binding takes one:

```ts
const filters = createQueryParamsFormGroup(results, { debounce: { search: 300 } });
```

The search writes 300 ms after its last change. Other fields write at once, without flushing or
replacing the pending search. External navigation and destroying the binding drop the pending
write. The Signal Forms options have no `debounce`, so each form system has one way to delay a
field.

#### Hold invalid input

By default every change writes. With `writeWhen: 'valid'`, a field writes only while its
validators pass:

```ts
import { minLength } from '@angular/forms/signals';

const { form } = createQueryParamsSignalForm(results, {
  schema: (fields) => {
    debounce(fields.search, 300);
    minLength(fields.search, 3);
  },
  writeWhen: 'valid',
});
```

Typing `el` writes nothing; `elm` writes. Clearing the field writes the empty search, because
Angular's length validators accept empty values. The rule applies per field: an invalid search
does not stop a valid page change. A field whose async validator is still pending waits and writes
when the validator passes. A held field keeps its draft until it becomes valid, the user changes
it, or external navigation resets the form. Reactive Forms take the same option; add validators to
the controls.

#### Change other fields before a write

A new search usually sends the user back to the first page. Which fields reset, and when, depends
on the page, so the binding asks the component through `beforeWrite`:

```ts
const filters = createQueryParamsFormGroup(results, {
  debounce: { search: 300 },
  beforeWrite: (patch) => ('search' in patch ? { page: 1, ...patch } : patch),
});
```

On `/results?page=4`, typing `elm` writes `?search=elm` in one navigation, and the page control
then shows 1. A page change on its own is written unchanged. Because `patch` is spread last, a
`patchValue({ search: 'elm', page: 3 })` keeps page 3. Signal Forms take the same option:

```ts
const { model, form } = createQueryParamsSignalForm(results, {
  beforeWrite: (patch) => ('search' in patch ? { page: 1, ...patch } : patch),
});
```

`beforeWrite(patch, draft)` runs right before a write is queued: after `writeWhen` has held back
invalid fields and after a debounced field's delay ends. `patch` holds only the fields about to be
written; `draft` is the whole form value. The returned object is what the binding writes, and an
`undefined` field keeps its URL value, as in `patchQuery()`.

Use `beforeWrite` to change other fields. Shape a field's own value in its codec instead: a field
that `beforeWrite` trims writes a URL value that differs from the draft, so the committed value
replaces the draft in the form. Fields that `beforeWrite` adds are not drafts; after the write
commits, the form reads them from the URL.

#### Failures

Failed writes keep the entered values and are not retried. `onWriteFailure` receives
`{ kind: 'declined' }` or `{ kind: 'error', error }`. Without a callback, errors go to Angular's
`ErrorHandler` and declined writes are silent. If `beforeWrite` throws, the error goes to
`ErrorHandler`, not to `onWriteFailure`; nothing is written, and the edited fields keep their
drafts. Destroying a binding cancels its waiting writes; it does not abort a navigation that
already started.

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

After a navigation to `/results?pageSize=48`, `localStorage` holds `48` under `ngx-urlik:pageSize`.
A later navigation to `/results` arrives at `/results?pageSize=48`.

### Declare a persisted field

| Option    | Meaning                                                                                                             |
| --------- | ------------------------------------------------------------------------------------------------------------------- |
| `key`     | Names the stored value. Fields that use the same key share one value, even on different routes                      |
| `storage` | `'local'` for `localStorage`, which outlives the tab, or `'session'` for `sessionStorage`, which belongs to one tab |
| `scope`   | Optional. Path parameter names whose values narrow the key                                                          |

Only `queryParam` with a `defaultValue` accepts `persist`. A persisted field always has a value in
the URL, and `null` has no URL text. `repeatedQueryParam` does not accept it, because an empty
array has no URL keys. Persist an array with a list instead:
`queryParam({ codec: listCodec(stringCodec(), ','), defaultValue: [], persist })` writes the empty
list as `?tags=`. TypeScript rejects both cases, and `defineAppRouter()` checks them again at
runtime.

`scope` gives each path value its own stored value. On `users/:userId`, a tab field with
`scope: ['userId']` stores the tab of user 7 under `ngx-urlik:tab:7`. A query field's scope may
name any path parameter of its route chain. TypeScript checks literal names; `defineAppRouter()`
checks all of them.

The storage key is `${prefix}${key}`, or `${prefix}${key}:${values}` with a scope. Each scope value
is the parameter's raw path segment passed through `encodeURIComponent`, and the values are joined
with `:`. A key must not contain `:` itself, or `clearPersisted({ local: ['a'] })` could not tell
the scopes of `a` from a key named `a:b`. TypeScript rejects a literal key with `:`, and
`defineAppRouter()` rejects any such key at runtime. The prefix applies to the whole router and defaults to `'ngx-urlik:'`:

```ts
defineAppRouter(RouteNames, { routes, persistence: { prefix: 'shop:' } });
```

### Read

A valid URL value wins. Otherwise the stored value is used if it decodes with the field's codec,
and otherwise the default. A URL value that fails to decode falls back the same way. `params()`,
`paramsFrom()`, `activeRoute()`, and form bindings all follow this order. `globalQueryParams()`
ignores `persist`.

### Restored values go into the URL

When a navigation arrives at a route chain with a persisted field that is missing from the URL or
fails to decode, ngx-urlik redirects to the same URL with that field filled in: from storage, or
with the default when nothing usable is stored. The path, the other query keys, and the fragment
stay. One redirect fills every persisted field of the chain.

The redirect adds no history entry of its own. A link click adds one entry, for the restored URL;
the first page load and the Back button replace the current entry. This is how Angular treats a
redirect from a guard: the redirected navigation inherits the original's history behavior.

The redirect comes from a `canMatch` check that ngx-urlik appends to the `canMatch` guards of each
route in a chain with a persisted query field. Angular runs `canMatch` on every navigation, also
when it reuses the route, such as the list page itself when only its query changes, so the
route's own guards and `runGuardsAndResolvers` stay as they are. Only the route that ends the match
redirects: the route that consumes the rest of the URL and has no child with an empty or `**`
path to continue. An ancestor's check runs before Angular knows whether its children match, so a
layout route never redirects a URL that then fails to match below it. The redirect replaces the
original navigation, which Angular reports with `NavigationCancel`.

Because the check runs during matching, the guard phase of the original navigation never starts.
`canActivate`, `canActivateChild`, resolvers, and the `canDeactivate` of the page you leave run
once, and only see the URL with the value filled in. `canMatch` guards are the exception: the
route's own `canMatch` guards and those of its ancestors run before the check, so they run twice
when a value is restored, first without it and then with it. Do not make a `canMatch` decision
depend on a persisted query value. A path value restored by its redirect is not affected: the
route that declares it is matched only once, with the full path.

When an earlier redirect in the same navigation changed the path, the check builds the redirect
from the path Angular actually matched. If the URL also has named outlets, such as
`/library/(books//side:panel)`, the check keeps them only when the primary path is unchanged, and
otherwise does not redirect; `params()` still reads the stored value.

A persisted field always appears in the URL, including at its default. `patchQuery()`, form
writes, and `activeRoute().createUrlTree()` write `?pageSize=24` instead of omitting it.
`createUrlTree()` and `navigate()` on a node leave out a persisted field you do not supply, and the
arrival restores it, so a missing key always means "restore, else default". A supplied value equal
to the default is written.

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
shorter URL matches what it matched before: an app route declared earlier at that path, the next
matching route, or the not-found page.

Only a named route can persist a placeholder, and the persisted placeholders must end the route's
own `path`: no static segment or unpersisted placeholder may follow them. In
`shows/:showId/seasons/:season`, only `season` can persist. In `pair/:a/:b`, both can; then `/pair`
and `/pair/5` are both restored. A placeholder's scope may name only placeholders before it in the
route chain, because the shorter URL must already contain them.

For each persisted placeholder, `defineAppRouter()` adds an unnamed Angular route right after the
named one, with a `matcher` and a `redirectTo` of the named route's own path. The matcher accepts
exactly the own path without the missing placeholders, and only when each missing value is stored
and decodes. It hands the stored values to `redirectTo`, so Angular rewrites the URL while it
matches routes: the restore is part of the same navigation, with one `NavigationStart` and no
`NavigationCancel`, and `urlAfterRedirects` is the full URL. When a value is missing, the route
does not match, and Angular continues with the next route. These routes do not appear in
`AppRouter.routes`.

The matcher reads ancestor path values, such as `showId` for a scope, from the segments that the
ancestor routes consumed. A redirect from a sibling route earlier in the same navigation turns
Angular's redirects off at that level, so the shorter URL it produces is not restored.

### Save

After every committed navigation (`NavigationEnd`), whatever started it, ngx-urlik saves each
persisted field and placeholder of the active route chain. A form write, `patchQuery()`, a link, and the Back
button all count. It stores the URL text of the committed value, and skips a value that does not
decode. Form drafts are never saved.

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
to an array; an omitted or `false` storage is left alone, so `{}` removes nothing. `true` removes
every prefixed key in that storage. An array removes each listed key with all of its scopes:
`['tab']` removes `ngx-urlik:tab` and `ngx-urlik:tab:7`, but not `ngx-urlik:tabs`. A listed key
that no route declares is reported as `UNKNOWN_PERSIST_KEY` and otherwise ignored.

Clearing does not change the current URL. The current page's values are saved again at its next
committed navigation.

### Without storage

On the server, and when browser storage is unavailable or throws (private browsing, a full quota,
blocked access), persistence does nothing: reads use the default, nothing is saved or cleared, and
nothing is redirected. With server rendering, the server renders the default and the browser restores the
stored value in its first navigation, so the page content can change after hydration.

## Diagnostics and errors

Bad query data uses the default or absence behavior and emits a warning. Configure the reporter on
`defineAppRouter` with `diagnostics: { warn }`. The default calls `console.warn` with the message.

`AppRouterDiagnostic` is a union; narrow it by `code`. A parameter diagnostic contains `code`,
`message`, `route`, `parameter`, and `operation` (`'serialize'` or `'deserialize'`), plus `index`,
`cause`, and the storage `key` when available. An `UNKNOWN_PERSIST_KEY` diagnostic concerns no
parameter and contains only `code`, `message`, and `key`.

| Code                              | When                                                                              |
| --------------------------------- | --------------------------------------------------------------------------------- |
| `PARAM_DESERIALIZE_FAILED`        | A codec returned `null` or threw                                                  |
| `PARAM_SERIALIZE_FAILED`          | A query codec returned a non-string or threw, or a repeated field got a non-array |
| `STORED_VALUE_DESERIALIZE_FAILED` | A stored value failed to decode; it is ignored and the default applies            |
| `UNKNOWN_PERSIST_KEY`             | `clearPersisted()` received a key that no route declares                          |

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
names, repeated query keys, and `persist` options that are malformed, lack a default, sit on a
repeated field, name an unknown scope, or persist a placeholder that is not at the end of a named
route's path. Some of these are also type errors.
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

| Type                            | Meaning                                     |
| ------------------------------- | ------------------------------------------- |
| `RouteNode<P, Q, R>`            | A generated route node                      |
| `PathParamsOf<Node>`            | The node's accumulated path values          |
| `QueryParamsOf<Node>`           | The node's accumulated query values         |
| `RouteStateOf<Node>`            | The `{ path, query }` value of `params()`   |
| `RouteQueryPatch<Node>`         | The argument accepted by `patchQuery`       |
| `ActiveRoute<Candidates>`       | The value of an `activeRoute()` signal      |
| `GeneratedAppRouter`            | The value of the `AppRouter` token          |
| `AppRouterDiagnostic`           | One diagnostic passed to `diagnostics.warn` |
| `AppRouterParameterDiagnostic`  | A diagnostic about one parameter's value    |
| `AppRouterUnknownKeyDiagnostic` | An `UNKNOWN_PERSIST_KEY` diagnostic         |
