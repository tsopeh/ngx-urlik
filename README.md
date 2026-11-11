# ngx-urlik

Typed URL state for Angular Router.

Say you have a search page at `/results?search=oak&page=4`. In plain Angular, `page` reaches you as
the string `'4'`, or `null` when it's missing. So you parse it and pick a default. When the user
clicks "next page", you have to remember to keep `search` in the URL. Then you do it all again on
the next page that has filters.

With ngx-urlik you describe `page` once, on the route: it's a number, and it defaults to 1. After
that you read `4` as a number, change it with one call, and build links that TypeScript checks.
Angular Router still does the routing. ngx-urlik only sits between your code and the URL.

- [Get started](#get-started)
- [Routes](#routes)
- [Codecs and query fields](#codecs-and-query-fields)
- [Build links](#build-links)
- [Read the URL](#read-the-url)
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

ngx-urlik is built for Angular 22. It isn't on npm yet. The form helpers live in `ngx-urlik/forms`
and need `@angular/forms`.

Name your routes in an enum, then pass it to `defineAppRouter()` along with an ordinary Angular
route array:

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

`RESULTS` is how your code refers to the route. `results` is what shows in the address bar.

Use `provideAppRouter()` where you'd normally use `provideRouter()`:

```ts
bootstrapApplication(App, { providers: [provideAppRouter()] });
```

Now, with the user on `/results?search=oak&page=4`:

```ts
const results = inject(AppRouter).routes.RESULTS;

results.params().query; // { search: 'oak', page: 4 }

await results.patchQuery({ search: 'elm', page: 1 });
// The URL is now /results?search=elm

const link = results.createUrlTree({ query: { page: 2 } });
// /results?page=2
```

```html
<a [routerLink]="link">Page 2</a>
```

`params()` is a signal, so anything that reads it updates when the URL changes.

`patchQuery()` changes the fields you pass and leaves the rest alone. Both fields changed in one
navigation. Page 1 is the default, so it drops out of the URL instead of showing up as `page=1`.

`createUrlTree()` works differently. It builds a URL from scratch, from only what you pass. That's
why the link doesn't drag `search=elm` along.

Already have an app? You can [move it over one feature at a time](#adopt-it-one-feature-at-a-time).

### Coding agents

The package includes a skill that teaches coding agents how to use ngx-urlik and how to move pages
off `ActivatedRoute`. It's at `node_modules/ngx-urlik/skills/ngx-urlik/SKILL.md`.

Agents won't find it on their own. Add something like this to your `AGENTS.md` or `CLAUDE.md`:

```md
This app uses ngx-urlik for routing and URL state. Before you change routes, links, guards,
resolvers, or code that reads or writes the URL, read
node_modules/ngx-urlik/skills/ngx-urlik/SKILL.md and follow it. Read and write the URL through
AppRouter, not ActivatedRoute or Router. Declare new routes in the defineAppRouter() file.
```

For Claude Code, you can link the skill into your project. The link follows whatever version is
installed, so it never goes stale:

```sh
mkdir -p .claude/skills
ln -s ../../node_modules/ngx-urlik/skills/ngx-urlik .claude/skills/ngx-urlik
```

## Routes

You write normal Angular routes and add up to four fields:

| Field         | What it does                                                                                                                   |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `routeName`   | Gives the route an entry in `AppRouter.routes`. Names must be unique, or `defineAppRouter()` throws.                           |
| `pathParam`   | Sets codecs (and optionally `persist`) for the `:placeholders` in this route's path. Without it, they're strings.              |
| `queryParams` | The query fields this route owns. Child routes inherit them. Each key can be declared only once among a route and its parents. |
| `isEqual`     | Decides when the route's `params` signal counts as changed. Children inherit it.                                               |

Everything else, like `component`, `loadComponent`, or `canActivate`, works as usual. A typo in a
field name is a type error.

Write `path` and `routeName` as literals, right in the array. TypeScript reads the routes from them.
If you annotate the array as Angular's `Routes`, it still compiles, but you lose the typed routes.

Nested routes show up flat in `AppRouter.routes`. A child inherits the path and query fields of
everything above it, so `routes.SEASON` under `shows/:showId` knows about both `showId` and
`season`. This includes parents that have no name.

A route without `routeName` is just an Angular route. Redirects, wildcards, matchers, named outlets,
and `loadChildren` all work there. If you don't use any ngx-urlik fields, Angular gets your array
exactly as you wrote it.

### What named routes can't do

A named route needs a path that's known when the app starts. So neither it nor any route above it
can use `loadChildren`. Pages can still load lazily with `loadComponent`, which is the usual way.
A named route doesn't need a component at all.

Once `defineAppRouter()` has run, the route list is fixed. Don't swap routes with
`Router.resetConfig()`. Nothing will stop you, but your typed routes would keep building URLs for
routes Angular no longer knows.

Why not load route definitions lazily too? Say your results page links to `/orders/4`. That link has
to exist before anyone opens the orders feature. So the `orders/:orderId` path and the codec that
writes `4` have to be loaded already. `routerLink` needs its `UrlTree` immediately and can't wait
for a chunk. Startup checks, [remembered path values](#remember-a-path-value), and
`clearPersisted()` also need every route up front. So definitions load with the app, and pages load
when they're visited.

Here's how common lazy-loading setups fit:

| You use                                    | With ngx-urlik                                                                              |
| ------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `loadComponent`                            | Works anywhere                                                                              |
| `loadChildren` on an unnamed route         | Works as before. The routes it loads are plain Angular routes                               |
| `loadChildren` on or above a named route   | `defineAppRouter()` throws                                                                  |
| `providers` from a lazy feature module     | Move them to the route above the feature's pages. Angular still creates them on first visit |
| `loadComponent` with an NgModule component | Angular refuses. Make the component standalone (`ng generate @angular/core:standalone`)     |

An NgModule component still works in `component`. It just loads with the app.

### One file for the whole app

We recommend putting every route in one `defineAppRouter()` call, in one file. You end up with a map
of your app: every URL, its parameters, its guards, and the page it loads. TypeScript also checks
each route against its parents, so if a child declares a query key its parent already has, you get
an error on that line.

The file stays small, because the pages themselves live elsewhere and load lazily.

### Adopt it one feature at a time

You don't have to move a big app in one go. Say each feature is a lazy NgModule, loaded with
`loadChildren` from `app-routing.module.ts`.

**1. Hand your existing routes to `defineAppRouter()`, naming nothing.** Swap
`RouterModule.forRoot(routes)` for `provideAppRouter()`, or `provideRouter(routes)` in a standalone
app. Keep importing plain `RouterModule` so components still get `routerLink` and
`<router-outlet>`:

```ts
export enum RouteNames {}

export const { AppRouter, provideAppRouter } = defineAppRouter(RouteNames, { routes });

@NgModule({ imports: [RouterModule], exports: [RouterModule], providers: [provideAppRouter()] })
export class AppRoutingModule {}
```

Nothing is named yet, so the app behaves exactly as before.

**2. Convert one feature.** Move its routes into the router file and name the ones you use from
code. Make its pages standalone and load them with `loadComponent`. Move the module's providers to
the route above the pages. Then delete the feature's NgModule and routing module:

```ts
{
  path: 'orders',
  providers: [OrdersApi],
  children: [
    {
      path: '',
      routeName: RouteNames.ORDERS,
      queryParams: { page: queryParam({ codec: numberCodec(), defaultValue: 1 }) },
      loadComponent: () => import('./orders/order-list.page').then((m) => m.OrderListPage),
    },
    {
      path: ':orderId',
      routeName: RouteNames.ORDER,
      pathParam: { codec: numberCodec() },
      canActivate: [orderExists],
      loadComponent: () => import('./orders/order-detail.page').then((m) => m.OrderDetailPage),
    },
  ],
},
```

Features you haven't converted keep their `loadChildren` and stay untyped.

**3. Update pages whenever you get to them.** Old pages that use `ActivatedRoute` keep working,
because everything goes through the same Angular router:

```ts
// Before
const orderId = toSignal(
  inject(ActivatedRoute).paramMap.pipe(map((params) => Number(params.get('orderId')))),
);

// After
const order = inject(AppRouter).routes.ORDER;
const orderId = computed(() => order.params().path.orderId); // already a number
```

The [ESLint rule](#flag-direct-router-use) finds the ones you haven't done yet. When the last
feature is in, the router file is the whole map.

If your routes are already one `Routes` array, you can also name routes in front of it:
`[{ path: 'results', routeName: RouteNames.RESULTS, component: ResultsPage }, ...routes]`. Anything
named after the spread is invisible to TypeScript, and the named routes lose their compile-time
checks. A mistake like a `pathParam` key that isn't in the path only shows up when
`defineAppRouter()` runs. Use it as a stopgap.

### Paths and placeholders

Placeholders use Angular's `:name` syntax, like `shows/:showId/seasons/:season`. For a single
placeholder, `pathParam` can be `{ codec }` or `{ season: { codec } }`. For several, give each one
its own `{ codec }`.

When you build a link, you pass every path value, parents' included. A placeholder name can appear
only once among a route and its parents. It can share a name with a query field, though, since the
two live apart under `path` and `query`.

The codec also decides whether the route matches at all. If `season` uses `numberCodec()`,
`/shows/tv_1/seasons/2` matches and `/shows/tv_1/seasons/abc` doesn't, so Angular moves on to the
next route. This happens before the route's own `canMatch` guards run.

### A page with child pages

To give a route both its own page and child pages, add a child with an empty path:

```ts
{
  path: 'shows/:showId',
  routeName: RouteNames.SHOW,
  component: ShowLayout,
  children: [
    { path: '', routeName: RouteNames.SHOW_OVERVIEW, component: ShowOverview },
    {
      path: 'seasons/:season',
      routeName: RouteNames.SEASON,
      pathParam: { codec: numberCodec() },
      component: SeasonPage,
    },
  ],
}
```

At `/shows/tv_1`, both `SHOW` and `SHOW_OVERVIEW` are active, and `activeRoute()` reports the deeper
one, `SHOW_OVERVIEW`. The empty child builds the same URL as its parent.

## Codecs and query fields

A codec converts between a URL string and a value:

```ts
interface UrlParamCodec<T> {
  serialize(value: T): string | null;
  deserialize(raw: string): T | null;
}
```

Returning `null` means "I can't convert this", which is why `T` itself can't include `null` or
`undefined`. Keep codecs pure, and don't call `inject()` in one.

The same codec works for placeholders and query fields. The property name is the URL key, so
`search` below lives at `?search=`:

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

### Built-in codecs

| Codec                        | Accepts                                                                                                                                  |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `stringCodec()`              | Any string, including an empty one like `?search=`                                                                                       |
| `numberCodec()`              | Decimal numbers: `-1.5`, `.5`, `1e3`, `Infinity`, `-Infinity`. Not `NaN`, hex, whitespace, an empty string, or a partial one like `12px` |
| `booleanCodec()`             | Exactly `true` or `false`, lowercase                                                                                                     |
| `enumCodec(values)`          | One of the strings in an array, tuple, or string record. Throws on creation if any value isn't a string                                  |
| `listCodec(item, separator)` | `item` values joined by `separator`. `''` is the empty list. Throws on creation if the separator is empty                                |

Numeric TypeScript enums don't work with `enumCodec`, because their reverse mapping adds numbers to
the values. A path segment can't be empty, so building a URL where a path value becomes `''` fails.
For dates, objects, or stricter rules like "positive integers only", write your own codec.

### Arrays

If a key shows up twice, a single field takes the last one: `?page=1&page=2` reads as `2`.

An array can live in the URL in two ways:

| Definition                                                       | URL            | Reads as     |
| ---------------------------------------------------------------- | -------------- | ------------ |
| `repeatedQueryParam({ codec })`                                  | `?tag=a&tag=b` | `['a', 'b']` |
| `queryParam({ codec: listCodec(codec, ','), defaultValue: [] })` | `?tag=a,b`     | `['a', 'b']` |

A repeated field reads as its default, or `[]`, when the key is missing. One bad item spoils the
whole array, with the same result. Empty items stay if the codec accepts them, so `?tag=` reads as
`['']` with `stringCodec()`.

A list is one field holding one string, so it behaves like any single field. Give it
`defaultValue: []`, or a missing key reads as `null`. If the key repeats, the last one wins:
`?tag=a&tag=b,c` reads as `['b', 'c']`. Empty items fail, so `?tag=a,,b` reads as the default and
reports a diagnostic. Writing an item that contains the separator, like `['a,b']` with `,`, drops the
field and reports a diagnostic too.

### Defaults

```ts
queryParam({ codec: stringCodec(), defaultValue: 'en' });
queryParam({ codec: stringCodec(), defaultValue: () => inject(LocaleSettings).locale() });
```

A missing or broken value reads as the default. With `page` defaulting to 1, `/results` and
`/results?page=abc` both give you 1.

A value equal to the default stays out of the URL. Set `page` to 1 and `page=` disappears. The
exception is a [persisted field](#remember-values-in-storage), which always shows.

A default can be a function. It runs synchronously on every read and write, in the injection context
of whatever provided the router. If it reads a signal, the value can change without a navigation. If
it throws, the error reaches you. It doesn't get treated as a bad URL.

Without a default, a single field reads as `null` and an array as `[]`. Every declared field is
always present in what you read.

### Required fields

`required: true` means callers have to pass the field when they build a link. Only TypeScript checks
this. The URL can still lack the key, and reading works the same. To pass "no value" on purpose, use
`null`, or `[]` for an array. Path values are always required and never `null`.

## Build links

```ts
const season = inject(AppRouter).routes.SEASON;
const link = season.createUrlTree({ path: { showId: 'tv_1', season: 2 }, fragment: 'episodes' });
await season.navigate({ path: { showId: 'tv_1', season: 2 } }, { replaceUrl: true });
```

`link` is `/shows/tv_1/seasons/2#episodes`. Pass it to Angular's `routerLink`. `routerLinkActive`
works too.

You get exactly what you pass. The current query is never copied over, whatever Angular's
`defaultQueryParamsHandling` says. Query fields are optional unless they're `required`. Parent query
fields come first, in the order you declared them. There's no relative navigation.

`navigate()` takes the values first and Angular's navigation options second. With nothing required,
pass `{}`: `navigate({}, { replaceUrl: true })`. Every option works except `browserUrl`, since that
could show an address other than the typed one.

The fragment is a string or `null`. It has no codec, and you can't read it back from `params()`.

Path values have no fallback. If a path codec throws, returns a non-string, or produces an empty
segment, `createUrlTree()` throws and `navigate()` rejects before Angular is involved. The error
names the route and placeholder, with the codec's error in `cause`. A query value that won't
serialize is less serious: it's dropped, reported, and the rest of the URL is built anyway.

## Read the URL

```ts
const results = inject(AppRouter).routes.RESULTS;
const query = computed(() => results.params().query);
```

Each named route has one `params` signal holding `{ path, query }`, inherited fields included. It
shows the URL Angular has committed to. Angular commits before it creates the new page, so a page's
constructor already sees its own URL, not the one it replaced.

Reading a route that isn't active throws.

### In guards and resolvers

Guards run before Angular commits, so `params()` still shows the page you're leaving. Read the
destination from the snapshot Angular gives you instead:

```ts
export const seasonResolver: ResolveFn<Season> = (route) => {
  const { path } = inject(AppRouter).routes.SEASON.paramsFrom(route);
  return inject(SeasonApi).load(path.showId, path.season);
};
```

`paramsFrom()` uses the same codecs and defaults as `params()`. Any snapshot from that navigation
works, so a child's guard can read its parent. It throws if the snapshot doesn't contain the route.

### One component on several routes

Say one detail page shows both movies and episodes. Tell it which routes it handles:

```ts
const detail = router.activeRoute({
  movie: router.routes.MOVIE,
  episode: router.routes.EPISODE,
});

const current = detail();
if (current.route === 'episode') {
  // current.node and current.params now have the episode route's types.
}
```

The signal holds `{ route, node, params, createUrlTree, patchQuery }`, and checking `route` narrows
the rest. If several are active, the deepest wins, whatever order you listed them in. If two names
point at the same route, the first name wins. Reading when none is active throws.

`patchQuery` is just the active route's. `createUrlTree({ query, fragment })` is the odd one out: it
starts from the current URL and changes only what you pass. On `/results?search=oak&page=4`,
`createUrlTree({ query: { page: 5 } })` gives `/results?search=oak&page=5`, which is exactly what a
"next page" link needs. The fragment still comes only from what you pass.

### Query fields that follow you everywhere

Some fields don't belong to any page, like a campaign tag. A service can read them directly:

```ts
const campaign = router.globalQueryParams({
  source: queryParam({ codec: stringCodec() }),
});
```

On `/results?source=newsletter`, `campaign().source` is `'newsletter'`.

Codecs, defaults, and timing work as on routes, and no route needs to be active. Before the first
navigation finishes, it reads the current snapshot. Diagnostics name the route `globalQueryParams`.

This is read-only. The fields aren't registered with any route, so navigation won't keep them and
`required` and `persist` do nothing. If two services should agree, share the definition objects.

You can create one anywhere once you have the router, not just in an injection context. The router
owns the subscription, so there's nothing to clean up. A second argument, `{ isEqual }`, compares the
whole query.

### When the signal fires

By default, `params` fires only when the value actually changes, by deep comparison. That's
`isEqual()`, which you can import:

- Primitives compare with `Object.is`, and prototypes must match.
- Dates compare by time. Two invalid dates aren't equal.
- Maps compare by entries (keys by identity), and sets by members.
- Arrays and objects compare by their own enumerable keys, strings and symbols, all the way down.
- Objects that refer to themselves compare by structure.

A route uses its parent's `isEqual` unless it sets its own. It only affects when the signal fires.
Patches always merge into the latest URL, never into an old signal value. Forms follow the signal.

## Write the query

Start on `/results?sort=new&search=oak&page=4`, where `sort` isn't declared on the route:

```ts
await results.patchQuery({ search: 'elm', page: 1 });
// /results?sort=new&search=elm

await results.patchQuery({ page: results.params().query.page + 1 });
// /results?sort=new&search=elm&page=2
```

`search` changed, and `page` went back to its default, so it left the URL. `sort` stayed, because a
patch never touches keys it doesn't know about.

In short: a patch changes only what you give it. Leave a field out, or pass `undefined`, and it stays.
To clear a field, set it to its default, `null`, or `[]`. The path, the fragment, unknown keys, and
fields owned by child routes are left alone. `patchQuery` takes the same options as `navigate()`,
like `replaceUrl` or `state`.

A patch also rewrites every field the route declares, so it tidies up as it goes. After any patch,
`?page=abc` and `?page=1` both disappear, and `?page=02` becomes `?page=2`.

### Each write is a navigation

A patch reads the current URL, merges your fields in, and calls `navigateByUrl()` straight away. If
the route isn't active, it rejects.

Angular runs one navigation at a time, and a new one cancels whatever is running. So two patches in a
row don't add up:

```ts
void results.patchQuery({ search: 'elm' });
void results.patchQuery({ page: 2 }); // built from the URL before search=elm
```

The second cancels the first, and you end up with only `page=2`. If fields change together, put them
in one patch.

In practice this rarely bites. A query-only navigation takes a few milliseconds, so things the user
does at different moments don't collide. They can, though, if a guard or resolver runs on query
changes, as with `runGuardsAndResolvers: 'paramsOrQueryParamsChange'`.

The promise resolves the way Angular's does:

| What happened                             | Result           |
| ----------------------------------------- | ---------------- |
| It worked                                 | Resolves `true`  |
| A guard said no, or the URL was the same  | Resolves `false` |
| Something else navigated first            | Resolves `false` |
| The route wasn't active, or Angular threw | Rejects          |

"Something else" can be another patch, a link click, the Back button, or a call to Angular's
`Router`.

## Bind a form

A form holds what the user is typing, and the URL holds what's been written. ngx-urlik keeps the two
in step for both Reactive Forms and Signal Forms. Forms cover the active route's query fields, not
its path. Create or bind them in an injection context while the route is active. They clean up on
their own when destroyed.

### Reactive Forms

```ts
import { createQueryParamsFormGroup } from 'ngx-urlik/forms';

const filters = createQueryParamsFormGroup(results);
filters.patchValue({ search: 'elm', page: 1 });
```

You get one non-nullable `FormControl` per field. Array fields get array-valued controls. Nested
groups and `FormArray` aren't supported. No validators are added, so if you want validators or other
control options, build the group yourself and call `bindQueryParamsToFormGroup(results, group,
options)`.

### Signal Forms

```ts
import { maxLength } from '@angular/forms/signals';
import { createQueryParamsSignalForm } from 'ngx-urlik/forms';

const { model, form } = createQueryParamsSignalForm(results, {
  schema: (fields) => maxLength(fields.search, 100),
});
model.update((query) => ({ ...query, search: 'elm' }));
```

You get a writable model and a `FieldTree`. If you already have a field tree, call
`bindQueryParamsToSignalForm(results, form, options)`.

### How writing works

The form starts out with the URL's values. `patchValue({ search: 'elm', page: 1 })` is one write, not
two. Signal Forms read the model in an effect, so any updates before that effect runs go out
together.

Form writes replace the current history entry, so typing `elm` doesn't leave three stops for the Back
button. Pass `replaceUrl: false` if you want them.

A field only follows the URL when the URL's value for that field changes. So when `page` changes,
whatever the user is halfway through typing in `search` stays put. URL changes never mark fields
touched or dirty.

After its own write, the form keeps exactly what the user typed. If the codec trims and the user
types `'elm '`, the URL gets `?search=elm` and the input keeps its trailing space.

### Debouncing

In Signal Forms, use Angular's `debounce()` rule. The model, and the URL with it, update when the
delay ends:

```ts
import { debounce } from '@angular/forms/signals';

const { form } = createQueryParamsSignalForm(results, {
  schema: (fields) => debounce(fields.search, 300),
});
```

This applies to input through `[formField]`. A direct `model.update(...)` isn't delayed.

Reactive Forms have no debounce of their own, so the binding provides one:

```ts
const filters = createQueryParamsFormGroup(results, { debounce: { search: 300 } });
```

The user types `elm` and stops, and the search writes 300 ms later. Other fields write immediately
without disturbing the pending search. Even a navigation in between doesn't drop it: it writes on
top of whatever the URL is when the delay ends. Leaving the page does drop it.

### Holding back invalid input

Normally every change writes. With `writeWhen: 'valid'`, a field writes only while its validators
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

Typing `el` writes nothing, and `elm` writes. Clearing the box writes an empty search, because
Angular's length validators accept empty values.

Each field is judged on its own, so a bad search doesn't hold up a good page change. A field waiting
on an async validator writes once it passes. A held field keeps its draft until it becomes valid,
the user edits it, or the form is destroyed. Reactive Forms take the same option, with the
validators on the controls.

### Resetting the page on a new search

A new search should usually go back to page 1. Only your page knows that, so the binding lets you
adjust each write in `beforeWrite`:

```ts
const filters = createQueryParamsFormGroup(results, {
  debounce: { search: 300 },
  beforeWrite: (patch) => ('search' in patch ? { page: 1, ...patch } : patch),
});
```

On `/results?page=4`, typing `elm` makes one navigation to `/results?search=elm`, and the page
control shows 1. Changing only the page writes it as is. And since `patch` is spread last,
`patchValue({ search: 'elm', page: 3 })` keeps page 3. Signal Forms take the same option. Without a
form, just pass both: `patchQuery({ search, page: 1 })`.

`beforeWrite(patch, draft)` runs right before the navigation, after any delay and after `writeWhen`
has held back invalid fields. `patch` has only the fields about to be written, and `draft` has the
whole form. Whatever you return gets written. An `undefined` field keeps its URL value.

Use it for changing other fields. To shape a field's own value, use its codec instead, so links and
patches write it the same way. Fields added by `beforeWrite` aren't drafts. The form reads them back
from the URL after the write.

### When a write fails

A write can be declined by a guard, cancelled by another navigation, or fail with an error. In every
case the form keeps what the user typed until that field's URL value changes, and nothing is
retried.

`onWriteFailure` gets `{ kind: 'declined' }` or `{ kind: 'error', error }`. Without it, errors go to
Angular's `ErrorHandler` and declines are silent. If `beforeWrite` itself throws, the error goes to
`ErrorHandler`, nothing is written, and the drafts stay.

Destroying the form drops pending edits and delays. A navigation that already started still runs.

## Remember values in storage

The user picks 48 results per page. Later they click a plain link to `/results`. They'd expect 48
again, not the default 24:

```ts
pageSize: queryParam({
  codec: numberCodec(),
  defaultValue: 24,
  persist: { key: 'pageSize', storage: 'local' },
}),
```

After a visit to `/results?pageSize=48`, `localStorage` holds `48` under `ngx-urlik:pageSize`. Next
time they open `/results`, they land on `/results?pageSize=48`.

| Option    | Meaning                                                                                   |
| --------- | ----------------------------------------------------------------------------------------- |
| `key`     | The name of the stored value. Fields with the same key share it, even on different routes |
| `storage` | `'local'` (`localStorage`, outlives the tab) or `'session'` (`sessionStorage`, one tab)   |
| `scope`   | Optional. Path parameters that get their own stored value each                            |

Only a `queryParam` with a `defaultValue` can persist, because a persisted field always needs
something to put in the URL. `repeatedQueryParam` can't persist either, since an empty array has no
URL keys at all. Use a list: `queryParam({ codec: listCodec(stringCodec(), ','), defaultValue: [],
persist })`, which writes an empty list as `?tags=`. TypeScript rejects both mistakes, and
`defineAppRouter()` checks again at runtime.

`scope` keeps one value per path value. On `users/:userId`, a `tab` field with `scope: ['userId']`
stores user 7's tab under `ngx-urlik:tab:7` and user 8's under `ngx-urlik:tab:8`. A query field can
scope by any path parameter on its route or above it.

Exactly: the storage key is `${prefix}${key}`, plus `:` and the scope values when there's a scope.
Each value is the raw path segment, passed through `encodeURIComponent` and joined with `:`. That's
also why keys can't contain `:`. Otherwise `clearPersisted()` couldn't tell `a`'s scopes from a key
named `a:b`.

The prefix defaults to `'ngx-urlik:'` and applies to the whole router:

```ts
defineAppRouter(RouteNames, { routes, persistence: { prefix: 'shop:' } });
```

### Which value wins

A valid value in the URL wins. Otherwise the stored value, if it still decodes. Otherwise the
default. A stored value that no longer decodes is deleted, so you only hear about it once.
`params()`, `paramsFrom()`, `activeRoute()`, and forms all follow this order. `globalQueryParams()`
ignores storage.

### Restored values go into the URL

Landing on `/results` with `48` stored redirects to `/results?pageSize=48`. With nothing usable
stored, it redirects to `/results?pageSize=24`. A broken value in the URL gets replaced the same way.
Everything else in the URL stays, and one redirect fills in every persisted field the route and its
parents have.

The redirect doesn't add its own history entry. A link click adds one entry, for the filled-in URL.
A first page load or the Back button replaces the current entry. Angular reports the replaced
navigation as `NavigationCancel`.

Under the hood, this is a `canMatch` check that runs after the route's own `canMatch` guards. Angular
runs `canMatch` on every navigation, even when it reuses the route, so you don't need to change your
guards or `runGuardsAndResolvers`. Only the deepest matched route redirects. A layout route never
redirects a URL that fails to match below it.

Because it happens during matching, `canActivate`, `canActivateChild`, resolvers, and the old page's
`canDeactivate` run once and see only the filled-in URL. `canMatch` guards run before it, though, so
they run twice when a value is restored. Don't make `canMatch` decisions based on a persisted query
value.

One edge case: with named outlets, as in `/library/(books//side:panel)`, nothing is redirected if an
earlier redirect in the same navigation changed the main path. `params()` still reads the stored
value.

A persisted field always shows in the URL, even at its default. `patchQuery()`, forms, and
`activeRoute().createUrlTree()` write `?pageSize=24` rather than dropping it. `createUrlTree()` and
`navigate()` on a route do the opposite: if you don't pass `pageSize`, they leave it out, and arrival
restores it. So leaving it out means "whatever's stored, or else the default". Passing 24 means 24.

### Remember a path value

The user was watching season 2 of a show. Next time they open that show's seasons, they should land
on season 2:

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

After a visit to `/shows/tv_1/seasons/2`, opening `/shows/tv_1/seasons` takes them to
`/shows/tv_1/seasons/2`, query and fragment included.

With nothing stored for that show, the short URL goes wherever it would have gone anyway: an earlier
route, a later one, or the not-found page. To send it to the show page instead, add a plain redirect
after the named route: `{ path: 'seasons', pathMatch: 'full', redirectTo: '' }`.

The short URL is always the route's path minus the remembered placeholders, so pick the path with
that in mind. A few rules:

- Only named routes can remember placeholders.
- Remembered placeholders have to come at the end of the route's own `path`. In
  `shows/:showId/seasons/:season`, only `season` can be remembered. In `pair/:a/:b`, both can, and
  then `/pair` and `/pair/5` both get restored.
- A placeholder can only be scoped by placeholders before it, since the short URL has to contain
  them.

How it works: `defineAppRouter()` adds hidden routes right after the named one. Each matches the
short path only when the missing values are stored and still decode, and redirects to the full path.
It all happens inside one navigation: one `NavigationStart`, no `NavigationCancel`, and
`urlAfterRedirects` is the full URL. These routes don't show up in `AppRouter.routes`.

Angular stops redirecting at a level once a sibling route there has redirected. So if an earlier
redirect in the same navigation produced the short URL, it isn't restored.

ngx-urlik stores any value that decodes. It can't know whether season 9 exists. If your backend says
it doesn't, you decide what to do, like calling `clearPersisted()` and going to the show page.

### When values are saved and read

After every finished navigation, ngx-urlik saves the persisted fields and placeholders of the active
route and its parents. It doesn't matter what caused the navigation, whether forms, `patchQuery()`,
links, or the Back button. It saves the URL text, skips values that don't decode, and never saves
form drafts.

Storage is only read when the URL doesn't have a usable value. Changes from other tabs aren't
watched. They show up the next time a value is restored.

### Forget stored values

For a "reset" button:

```ts
router.clearPersisted(); // everything with the router's prefix, in both storages
router.clearPersisted({ session: true }); // everything in sessionStorage
router.clearPersisted({ local: ['pageSize'] }); // just pageSize in localStorage
```

A storage you leave out of the object isn't touched, so `{}` clears nothing. A listed key goes with
all its scopes: `['tab']` removes `ngx-urlik:tab` and `ngx-urlik:tab:7`, but not `ngx-urlik:tabs`. A
key no route declares is reported as `UNKNOWN_PERSIST_KEY` and ignored.

Clearing doesn't change the current URL, and the current page's values are saved again on its next
navigation.

### Without storage

On the server, or when storage is missing or throws (private browsing, a full quota, blocked
access), persistence does nothing. You get defaults, and nothing is saved, cleared, or redirected.

With server rendering, the server renders the default and the browser restores the stored value on
its first navigation. So the page may change right after hydration.

## Diagnostics and errors

Bad URL data doesn't crash anything. It falls back to the default and reports a diagnostic. On
`/results?page=abc`, `page` reads as 1 and you get `PARAM_DESERIALIZE_FAILED` for `route`
`'RESULTS'`, `parameter` `'page'`. Diagnostics go to `console.warn` unless you pass your own
`diagnostics: { warn }` to `defineAppRouter`.

| Code                              | When                                                                              |
| --------------------------------- | --------------------------------------------------------------------------------- |
| `PARAM_DESERIALIZE_FAILED`        | A codec returned `null` or threw                                                  |
| `PARAM_SERIALIZE_FAILED`          | A query codec returned a non-string or threw, or a repeated field got a non-array |
| `STORED_VALUE_DESERIALIZE_FAILED` | A stored value didn't decode. It's deleted and the default applies                |
| `UNKNOWN_PERSIST_KEY`             | `clearPersisted()` got a key no route declares                                    |

`AppRouterDiagnostic` is a union you narrow by `code`. A parameter diagnostic has `code`, `message`,
`route`, `parameter`, `operation` (`'serialize'` or `'deserialize'`), and, where they apply, `index`
(which array item failed), `cause` (the codec's error), and the storage `key`. `UNKNOWN_PERSIST_KEY`
has only `code`, `message`, and `key`.

`route` is the route that declares the field, which may be a parent of the one you read. Unnamed
parents are named by position, like `routes[0].children[1]`.

A few things throw, because there's no sensible value to fall back to: reading an inactive route, a
path value that won't serialize, and an error inside a default function. A path value that won't
decode never gets that far. The route just doesn't match.

`defineAppRouter()` checks your named routes at startup and throws one error listing every problem:

- Repeated or empty route names.
- Names on redirects, wildcards, or matchers.
- `loadChildren` on or above a named route.
- Paths that aren't known up front, or have empty segments or reserved characters.
- `pathParam` maps that don't match the placeholders.
- A placeholder or query key declared twice among a route and its parents.
- Bad `persist` options: malformed, without a default, on a repeated field, scoped by an unknown
  parameter, with `:` in the key, or remembering a placeholder that doesn't end the path.

TypeScript catches many of these first. Angular still checks its own route config.

## Work with Angular Router

`provideAppRouter(...features)` registers your routes and the `AppRouter` token, and passes other
Angular router features through. Router options go on `defineAppRouter(RouteNames, {
routerConfig })` instead. Passing `withRouterConfig()` to `provideAppRouter()` throws. Your options,
`paramsInheritanceStrategy` included, are used as they are.

Angular still decides which route wins, through route order, matching, guards, redirects, and
outlets. So keep overlapping patterns in a sensible order.

### Escape hatch

For URLs outside your typed routes, `AppRouter.escapeHatch` gives you Angular's own tools, with
Angular's types and behavior, `browserUrl` included:

- Methods: `createUrlTree`, `navigate`, `navigateByUrl`, `parseUrl`, `serializeUrl`, `isActive`.
- Read-only values: `url`, `events`, `navigated`, `currentNavigation`, `lastSuccessfulNavigation`,
  `componentInputBindingEnabled`.

`isActive(url, matchOptions?)` is Angular's `isActive()` bound to the router, and returns a
`Signal<boolean>`. The escape hatch leaves out `routerState`, route config, lifecycle controls, and
deprecated mutable properties.

You can still inject Angular's `Router`. It runs the app, so it has to stay. Calls through it just
skip the typed routes.

### Flag direct router use

ESLint's built-in `no-restricted-imports` rule can warn on every import of `Router` or
`ActivatedRoute`:

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

It's a warning, not an error, so a deliberate use can stay with an `eslint-disable-next-line` comment
saying why. `RouterLink`, `RouterOutlet`, `ResolveFn`, `ActivatedRouteSnapshot`, and the rest stay
allowed, since templates and guards still need them.

## Types

| Type                            | What it is                                  |
| ------------------------------- | ------------------------------------------- |
| `RouteNode<P, Q, R>`            | A typed route                               |
| `PathParamsOf<Node>`            | Its path values, inherited ones included    |
| `QueryParamsOf<Node>`           | Its query values, inherited ones included   |
| `RouteStateOf<Node>`            | What `params()` returns: `{ path, query }`  |
| `RouteQueryPatch<Node>`         | What `patchQuery` accepts                   |
| `ActiveRoute<Candidates>`       | What an `activeRoute()` signal holds        |
| `GeneratedAppRouter`            | What the `AppRouter` token gives you        |
| `UrlParamCodec<T>`              | A codec                                     |
| `AppRouterDiagnostic`           | Any diagnostic passed to `diagnostics.warn` |
| `AppRouterParameterDiagnostic`  | A diagnostic about one parameter            |
| `AppRouterUnknownKeyDiagnostic` | An `UNKNOWN_PERSIST_KEY` diagnostic         |

## Not supported

| Not supported                                        | Instead                                                     |
| ---------------------------------------------------- | ----------------------------------------------------------- |
| Angular versions other than 22                       | Use Angular 22                                              |
| Typed redirects, wildcards, matchers, named outlets  | Declare them as unnamed routes                              |
| Route arrays split across files                      | Pass the routes to `defineAppRouter()` as one literal array |
| Named routes inside `loadChildren`                   | Keep definitions in the router file; lazy-load pages        |
| Swapping routes with `Router.resetConfig()`          | Declare every named route up front                          |
| Query property names that differ from URL keys       | The property name is the URL key                            |
| One array field as both repeated keys and a list     | Pick one per field                                          |
| Built-in date or object codecs                       | Write your own codec                                        |
| Writing global query fields                          | Global fields are read-only. Write them through a route     |
| Reading the fragment                                 | You can only set it when building a link                    |
| Typed relative navigation                            | Use the escape hatch                                        |
| Typed state in a route's `isEqual`                   | The callback gets `unknown`                                 |
| Noticing storage changes from another tab            | They apply at the next restore                              |
| Forgetting one scope's value, like one show's season | `clearPersisted()` forgets a key for every scope            |

## TasteTrack demo

[`projects/taste-track`](projects/taste-track) is a small movie and TV journal built with ngx-urlik.
It uses only the public entry points and keeps its data in your browser, in IndexedDB. From the repo
root, with the Node version from `.nvmrc`:

```sh
npm ci
npm start
```

Things to try:

1. Change the movie genres, sort order, and page size, then reload. The filters come back, because
   they're in the URL.
2. Open TV shows → Brambleworth Manor → Season 2 → Browse episodes → The Callback Nobody Returned.
   The URL is `/tv/brambleworth-manor/s/2/e/1`. The ID codec drops the `tv_` prefix from the URL
   and adds it back when reading.
3. Now open `/tv/brambleworth-manor/s`. You land on `…/s/2`, the season you last opened in this tab.
   A show with no remembered season opens the show page instead.
4. Follow a credit to a person or studio, then a title back to the catalog.
5. Change a rating and log a viewing, then reload. Both stick.
6. Filter Library (Signal Forms) and Viewing history (Reactive Forms with a delayed search). Both
   ignore searches shorter than three letters.
7. Reset TasteTrack in Settings. The starting data comes back, and your theme stays.

Where to look for each feature:

| Page                             | Shows                                                                                        |
| -------------------------------- | -------------------------------------------------------------------------------------------- |
| Movie and TV browsing            | Query fields from a parent with no path segment, repeated genres, sorting, pagination        |
| Show → season → episode          | Inherited path parameters, an ID codec that hides its prefix, an integer codec               |
| Page size and last season        | A remembered query field in `localStorage`, a remembered season per show in `sessionStorage` |
| Detail section links             | URL fragments                                                                                |
| Credits and contributor profiles | Typed links across branches                                                                  |
| Library                          | Signal Forms, repeated statuses, a joined media list, structured viewing counts              |
| Viewing history                  | Reactive Forms with a delayed, validated search                                              |
| Landing pages                    | Empty-path children and redirects                                                            |
| Unknown URLs                     | Wildcard routes                                                                              |

Shared pages pick their route with `activeRoute()`, and `paginationParams()` shares field
definitions between pages. The form pages reset the page number in `beforeWrite`, while the catalog
does it in the same `patchQuery()` call. Sort field and direction are one codec value, so they
always travel together.

The fake backend lives in `projects/taste-track/src/app/backend/`. `BackendApi` handles every query
and change, and each query returns an `Observable` that pages turn into a signal with
`toObservable`, `switchMap`, and `toSignal`. `TasteTrackRepository` keeps the IndexedDB tables in
signals through Dexie. After a change it reloads them and bumps `dataVersion`, which makes open
queries emit again.

A fixed seed fills the database on first run and on reset: 30 movies, 30 shows, 66 seasons, 394
episodes, 8 people, and 4 studios. The catalog is read-only. Ratings, statuses, favorites, counts,
and viewings survive reloads. Reset clears only the TasteTrack database, and the theme is stored
separately.

## Develop

With the Node version from `.nvmrc`:

```sh
npm ci
npm run build      # library, then demo
npm test           # unit tests for both
npm run typecheck  # public type tests
npm run e2e        # Playwright against the demo
```

[Design decisions](docs/decisions.md) explains why the library works the way it does, and what each
choice costs. [Reading the code](docs/implementation.md) shows where things live and how a write
moves through.

## License

[MIT](LICENSE)
