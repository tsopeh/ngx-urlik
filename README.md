# ngx-urlik

Typed URL state for Angular Router.

Say your search page is at `/results?search=oak&page=4`. Plain Angular gives you `page` as the
string `'4'`, or `null` when it's missing. So you parse it and pick a default. When the user clicks
"next page", you have to keep `search` in the URL yourself. Then you do it all again on the next
page with filters.

With ngx-urlik you describe `page` once, on the route: it's a number, and it defaults to 1. Then
you read `4` as a number, change it with one call, and build links that TypeScript checks. Angular
Router still does the routing. ngx-urlik sits between your code and the URL.

- [Get started](#get-started)
- [Routes](#routes)
- [Codecs and query fields](#codecs-and-query-fields)
- [Build links](#build-links)
- [Read the URL](#read-the-url)
- [Write the query](#write-the-query)
- [Bind a form](#bind-a-form)
- [Diagnostics and errors](#diagnostics-and-errors)
- [Work with Angular Router](#work-with-angular-router)
- [Types](#types)
- [Not supported](#not-supported)
- [TasteTrack demo](#tastetrack-demo)
- [Develop](#develop)

## Get started

ngx-urlik needs Angular 22. It isn't on npm yet. The form helpers are in `ngx-urlik/forms` and need
`@angular/forms`.

Name your routes in an enum. Pass it to `defineAppRouter()` with a normal Angular route array:

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

Your code calls the route `RESULTS`. The address bar shows `results`. The key in
`AppRouter.routes` is the enum member's name, so with `Results = 'results'` you'd write
`routes.Results`.

Use `provideAppRouter()` where you'd use `provideRouter()`:

```ts
bootstrapApplication(App, { providers: [provideAppRouter()] });
```

Now say the user is on `/results?search=oak&page=4`:

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

`params()` is a signal. Anything that reads it updates when the URL changes.

`patchQuery()` changes the fields you pass and keeps the rest. Both fields changed in one
navigation. Page 1 is the default, so it left the URL instead of showing as `page=1`.

`createUrlTree()` builds a URL from only what you pass. That's why the link has no `search=elm`.

Already have an app? You can [move it over one feature at a time](#adopt-it-one-feature-at-a-time).

### Coding agents

The package ships a skill that teaches coding agents to use ngx-urlik and to move pages off
`ActivatedRoute`. It's at `node_modules/ngx-urlik/skills/ngx-urlik/SKILL.md`.

Agents won't find it on their own. Add something like this to your `AGENTS.md` or `CLAUDE.md`:

```md
This app uses ngx-urlik for routing and URL state. Before you change routes, links, guards,
resolvers, or code that reads or writes the URL, read
node_modules/ngx-urlik/skills/ngx-urlik/SKILL.md and follow it. Read and write the URL through
AppRouter, not ActivatedRoute or Router. Declare new routes in the defineAppRouter() file.
```

For Claude Code, you can link the skill into your project. The link points at the installed
version, so it stays current:

```sh
mkdir -p .claude/skills
ln -s ../../node_modules/ngx-urlik/skills/ngx-urlik .claude/skills/ngx-urlik
```

## Routes

You write normal Angular routes and add up to three fields:

| Field         | What it does                                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------------------- |
| `routeName`   | Adds the route to `AppRouter.routes`. Each name must be unique, or `defineAppRouter()` throws.                      |
| `pathParam`   | A codec for each `:placeholder` in this route's path. A placeholder without one is a string.                        |
| `queryParams` | The query fields this route owns. Child routes inherit them. A key can appear only once in a route and its parents. |

Everything else, like `component`, `loadComponent`, or `canActivate`, works as usual. A typo in a
field name is a type error.

Write `path` and `routeName` as literals, right in the array. TypeScript reads your routes from
them. If you type the array as Angular's `Routes`, it still compiles, but you lose the typed routes.

Nested routes appear flat in `AppRouter.routes`. A child inherits the path and query fields of every
route above it, named or not. So `routes.SEASON`, under `shows/:showId`, has both `showId` and
`season`.

A route without `routeName` is a plain Angular route. Redirects, wildcards, matchers, named outlets,
and `loadChildren` all work there. Angular gets a copy of every route with its Angular fields.
ngx-urlik adds one thing: a `canMatch` check on routes whose `pathParam` has codecs.

### What named routes can't do

A named route needs a path that's known when the app starts. So neither it nor any route above it
can use `loadChildren`. Pages can still load lazily with `loadComponent`, which is the usual way. A
named route doesn't need a component at all.

After `defineAppRouter()` runs, the route list is fixed. Don't swap routes with
`Router.resetConfig()`. Nothing stops you, but your typed routes would keep building URLs for
routes Angular no longer has.

Why not load route definitions lazily too? Say your results page links to `/orders/4`. That link
has to exist before anyone opens the orders feature. So the `orders/:orderId` path, and the codec
that writes `4`, must already be loaded. `routerLink` needs its `UrlTree` right away. It can't wait
for a chunk to download. Startup checks need every route up front too. So definitions load with the
app, and pages load when someone visits them.

Here's how common lazy-loading setups fit:

| You use                                    | With ngx-urlik                                                                              |
| ------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `loadComponent`                            | Works anywhere                                                                              |
| `loadChildren` on an unnamed route         | Works as in Angular. The routes it loads are plain Angular routes                           |
| `loadChildren` on or above a named route   | `defineAppRouter()` throws                                                                  |
| `providers` from a lazy feature module     | Move them to the route above the feature's pages. Angular still creates them on first visit |
| `loadComponent` with an NgModule component | Angular refuses. Make the component standalone (`ng generate @angular/core:standalone`)     |

An NgModule component still works in `component`. It just loads with the app.

### One file for the whole app

Put every route in one `defineAppRouter()` call, in one file. You get a map of your app: every URL,
its parameters, its guards, and the page it loads. TypeScript also checks each route against its
parents. If a child declares a query key its parent already has, the error points at that line.

The file stays small, because the pages live elsewhere and load lazily.

### Adopt it one feature at a time

You don't have to move a big app at once. Say each feature is a lazy NgModule, loaded with
`loadChildren` from `app-routing.module.ts`.

**1. Pass your existing routes to `defineAppRouter()`, and name nothing.** Replace
`RouterModule.forRoot(routes)` with `provideAppRouter()`. In a standalone app, replace
`provideRouter(routes)`. Keep importing plain `RouterModule`, so components still get `routerLink`
and `<router-outlet>`:

```ts
export enum RouteNames {}

export const { AppRouter, provideAppRouter } = defineAppRouter(RouteNames, { routes });

@NgModule({ imports: [RouterModule], exports: [RouterModule], providers: [provideAppRouter()] })
export class AppRoutingModule {}
```

Nothing is named yet, so every route behaves as it does in plain Angular.

**2. Convert one feature.** Move its routes into the router file, and name the ones your code uses.
Make its pages standalone and load them with `loadComponent`. Move the module's providers to the
route above its pages. Then delete the feature's NgModule and routing module:

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
      pathParam: { orderId: numberCodec() },
      canActivate: [orderExists],
      loadComponent: () => import('./orders/order-detail.page').then((m) => m.OrderDetailPage),
    },
  ],
},
```

Features you haven't converted keep `loadChildren` and stay untyped.

**3. Update pages as you get to them.** A page you haven't converted keeps working with
`ActivatedRoute`, because it's the same Angular router underneath:

```ts
// With ActivatedRoute
const orderId = toSignal(
  inject(ActivatedRoute).paramMap.pipe(map((params) => Number(params.get('orderId')))),
);

// With ngx-urlik
const order = inject(AppRouter).routes.ORDER;
const orderId = computed(() => order.params().path.orderId); // already a number
```

The [ESLint rule](#flag-direct-router-use) finds the pages you haven't done yet. When the last
feature moves in, the router file is the whole map.

If your routes are already one `Routes` array, you can also put named routes in front of it:
`[{ path: 'results', routeName: RouteNames.RESULTS, component: ResultsPage }, ...routes]`.
TypeScript can't see names after the spread, and the named routes lose their compile-time checks.
A mistake like a `pathParam` key that isn't in the path shows up only when `defineAppRouter()`
runs. Use this as a stopgap.

### Paths and placeholders

Placeholders use Angular's `:name` syntax, like `shows/:showId/seasons/:season`. `pathParam` gives
a placeholder its codec, by name: `{ showId: stringCodec(), season: numberCodec() }`. A placeholder
without a codec is a string.

When you build a link, you pass every path value, the parents' too. A placeholder name can appear
only once in a route and its parents. It can share a name with a query field, because the two live
apart, under `path` and `query`.

The codec also decides whether the route matches. Say `season` uses `numberCodec()`. Then
`/shows/tv_1/seasons/2` matches, and `/shows/tv_1/seasons/abc` doesn't, so Angular tries the next
route. This check runs before the route's own `canMatch` guards.

### A page with child pages

To give a route its own page and child pages, add a child with an empty path:

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
      pathParam: { season: numberCodec() },
      component: SeasonPage,
    },
  ],
}
```

At `/shows/tv_1`, both `SHOW` and `SHOW_OVERVIEW` are active, so `ifActive()` returns each of
them. The empty child builds the same URL as its parent.

## Codecs and query fields

A codec turns a URL string into a value and back:

```ts
interface UrlParamCodec<T> {
  serialize(value: T): string | null;
  deserialize(raw: string): T | null;
}
```

`null` means "I can't convert this". That's why `T` can't include `null` or `undefined`.

One codec works for placeholders and query fields. The property name is the URL key, so `search`
below is `?search=`. If a key appears twice, the field takes the last one: `?page=1&page=2` reads as
`2`.

```ts
const id = stringCodec();
const route = {
  path: 'users/:userId',
  routeName: RouteNames.USER,
  pathParam: { userId: id },
  queryParams: {
    search: queryParam({ codec: id }),
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
| `enumCodec(values)`          | One of the strings in an array, tuple, or string record. Throws when created if a value isn't a string                                   |
| `listCodec(item, separator)` | `item` values joined by `separator`. `''` is the empty list. Throws when created if the separator is empty or has a backslash            |

Numeric TypeScript enums don't work with `enumCodec`, because their reverse mapping adds numbers to
the values. A path segment can't be `''`, `.`, or `..`, so building a URL where a path value becomes
one of those fails. Browsers drop `.` and `..` segments, so `/items/..` would reload as `/`.

### Write your own codec

For dates, objects, or stricter rules like "positive integers only", write a codec. It's an object
with two functions:

```ts
import type { UrlParamCodec } from 'ngx-urlik';

const positiveInteger: UrlParamCodec<number> = {
  serialize: (value) => (Number.isSafeInteger(value) && value > 0 ? String(value) : null),
  deserialize: (raw) => {
    if (!/^\d+$/.test(raw)) {
      return null;
    }
    const value = Number(raw);
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  },
};

page: queryParam({ codec: positiveInteger, defaultValue: 1 });
```

`?page=3` reads as `3`. `?page=0`, `?page=2.5`, and `?page=abc` read as the default, 1, and report a
diagnostic. On a path placeholder, the same codec makes `/items/0` not match. Writing `0` to the
query drops the field and reports it. Writing `0` to a path makes the link throw.

A codec follows three rules:

- Write one text for each value. The library compares text to tell whether a value changed, or
  sits at its default.
- Read back what you wrote: `deserialize(serialize(value))` gives an equal value.
- Stay pure, and don't call `inject()`. A codec runs wherever a value is read or a link is built,
  often outside an injection context.

A codec can also clean up input, like trimming spaces. Then `' elm'` reads as `'elm'`, and writes
as `elm`.

### Arrays

An array is one field holding one string, with its items joined by a separator:

```ts
tags: queryParam({ codec: listCodec(stringCodec(), ','), defaultValue: [] });
```

`?tags=a,b` reads as `['a', 'b']`. A list acts like any other field. Give it `defaultValue: []`, or
a missing key reads as `null`.

An empty list writes as `?tags=`, so it stays apart from a missing key. With
`defaultValue: ['new']`, deselecting everything writes `?tags=` and reads back as `[]`. A missing
key reads as `['new']`.

An item can hold any text, the separator included. A backslash in front of the separator keeps it
inside the item, and a backslash in front of a backslash means one backslash. So
`['red, green', 'blue']` writes `?tags=red%5C,%20green,blue`. Angular encodes the backslash as
`%5C`, and the space as `%20`.

Empty items fail: `?tags=a,,b` reads as the default and reports a diagnostic. So does a backslash
in front of anything else, like `?tags=a%5Cb`. Writing `['']` drops the field and reports a
diagnostic, because `?tags=` already means `[]`.

### Defaults

```ts
queryParam({ codec: stringCodec(), defaultValue: 'en' });
```

A missing or broken value reads as the default. With `page` defaulting to 1, `/results` and
`/results?page=abc` both give you 1.

A value that writes the same text as the default stays out of the URL. Set `page` to 1 and
`page=` disappears.

A default is a plain value, so `/results` means the same page every time. A fallback that depends
on a service, like the user's locale, belongs in the page. Declare the field without a default and
fill in the gap where you read it:

```ts
// In the route: locale: queryParam({ codec: stringCodec() })
const results = inject(AppRouter).routes.RESULTS;
const settings = inject(LocaleSettings);
const locale = computed(() => results.params().query.locale ?? settings.locale());
```

Without a default, a field reads as `null`. Every declared field is always in what you read.

### Required fields

`required: true` means callers must pass the field when they build a link. Only TypeScript checks
this. The URL can still lack the key, and reading works the same. To pass "no value" on purpose,
use `null`, or `[]` for an array. Path values are always required and never `null`.

## Build links

```ts
const season = inject(AppRouter).routes.SEASON;
const link = season.createUrlTree({ path: { showId: 'tv_1', season: 2 }, fragment: 'episodes' });
await season.navigate({ path: { showId: 'tv_1', season: 2 } }, { replaceUrl: true });
```

`link` is `/shows/tv_1/seasons/2#episodes`. Pass it to Angular's `routerLink`. `routerLinkActive`
works too.

You get exactly what you pass. The current query is never copied, whatever Angular's
`defaultQueryParamsHandling` says. Query fields are optional unless they're `required`. Parent query
fields come first, in the order you declared them. There's no relative navigation.

`navigate()` takes the values first and Angular's navigation options second. If nothing is
required, pass `{}`: `navigate({}, { replaceUrl: true })`. Every option works except `browserUrl`,
because it could show an address other than the typed one.

The fragment is a string or `null`. It has no codec, and `params()` doesn't return it.

Path values have no fallback. If a path codec throws, returns a non-string, or returns `''`, `.`,
or `..`, `createUrlTree()` throws and `navigate()` rejects before Angular sees it. The error names
the route and placeholder, with the codec's error in `cause`. A query value that won't serialize is
less serious. It's dropped and reported, and the rest of the URL is built anyway.

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
destination from the snapshot Angular passes in:

```ts
export const seasonResolver: ResolveFn<Season> = (route) => {
  const appRouter = inject(AppRouter);
  const { path } = appRouter.paramsSnapshot(appRouter.routes.SEASON, route);
  return inject(SeasonApi).load(path.showId, path.season);
};
```

`paramsSnapshot()` reads once and returns plain values, not a signal. It uses the same codecs and
defaults as `params()`. Any snapshot from that navigation works, so a child's guard can read its
parent. It throws if the snapshot doesn't contain the route.

### One component on several routes

Say one detail page shows both movies and episodes. Ask each route whether it's showing, and read
through what it gives back:

```ts
const { MOVIE, EPISODE } = inject(AppRouter).routes;
const request = computed(() => {
  const episode = EPISODE.ifActive();
  if (episode) {
    return { episode: episode.params().path.episodeId };
  }
  return { movie: MOVIE.params().path.movieId };
});
```

`ifActive` is a signal on every named route. It holds the route itself while that route or one of
its children shows, and `null` otherwise. On a page with no named route, like a `**` fallback, it's
`null` for every route. It notifies only when the answer changes, so a page change from `?page=1`
to `?page=2` doesn't run its readers again.

The read goes through the value the check returned, so it can't go to another route. A single value
fits in one line: `EPISODE.ifActive()?.params().path.episodeId ?? null`. In a template, `@if` names
the route it found:

```html
@if (routes.EPISODE.ifActive(); as episode) {
<p>Episode {{ episode.params().path.episodeId }}</p>
}
```

A page that must be on one of its routes can read the last one directly, as `MOVIE` above. That
read throws if the page ever shows on a route it doesn't handle.

Fields the routes share through a parent belong to the parent. If `MOVIE` and `EPISODE` both sit
under `BROWSE`, which declares `search` and `page`, read them with `BROWSE.params()` and change them
with `BROWSE.patchQuery({ page: 1 })`. That works on either page, because a parent is active while
its child shows.

A link that keeps the current filters spreads them in:

```ts
const results = inject(AppRouter).routes.RESULTS;
const nextPage = computed(() => {
  const { query } = results.params();
  return results.createUrlTree({ query: { ...query, page: query.page + 1 } });
});
```

On `/results?search=oak&page=4`, that gives `/results?search=oak&page=5`. A link to a section of
the page you're on needs no typed values. Use Angular's own form, which keeps the path and query:

```html
<a [routerLink]="[]" fragment="credits" queryParamsHandling="preserve">Credits</a>
```

### Highlight the current page

```html
<a [routerLink]="browseUrl" [class.active]="appRouter.routes.BROWSE.ifActive()">Browse</a>
```

If `BROWSE` is the parent of the movie and TV routes, the link is highlighted at `/movies`, `/tv`,
and `/tv/brambleworth-manor/s/2`. A nav can highlight a section and a page inside it at the same
time.

### Values on every page

A service sometimes needs a value on every page, whichever route shows it. It might be a campaign
tag like `?source=`, or the workspace in `/w/:workspaceId/...`. `globalParams()` reads both:

```ts
const current = appRouter.globalParams({
  path: { workspaceId: stringCodec() },
  query: { source: queryParam({ codec: stringCodec() }) },
});
```

| URL                                 | `current()`                                                          |
| ----------------------------------- | -------------------------------------------------------------------- |
| `/w/acme/reports?source=newsletter` | `{ path: { workspaceId: 'acme' }, query: { source: 'newsletter' } }` |
| `/settings`                         | `{ path: { workspaceId: null }, query: { source: null } }`           |

A path value comes from whichever active route has a placeholder with that name, named or not. It's
`null` when no active route has one, or when the value doesn't decode with the codec you pass. A
placeholder name appears once in a route and its parents, so there's one value to read. Query
fields work as on routes, with defaults. Nothing throws, and no route needs to be active.

Codecs and timing work as on routes. Before the first navigation finishes, it reads the current
snapshot. Diagnostics name the route `globalParams`. It's read-only, and `required` does nothing.
Two services that read the same name with different codecs can disagree, so share the definitions.

You can call it anywhere you have the router, not only in an injection context. The router owns the
subscription, so there's nothing to clean up.

In a guard or resolver, `globalParamsSnapshot()` reads the destination once. It also works on a
route without a `routeName`, such as a workspace layout:

```ts
export const workspaceGuard: CanActivateFn = (route) => {
  const { path } = inject(AppRouter).globalParamsSnapshot(
    { path: { workspaceId: stringCodec() } },
    route,
  );
  return inject(Workspaces).canOpen(path.workspaceId);
};
```

Its diagnostics name the route `globalParamsSnapshot`.

### Remember values yourself

ngx-urlik doesn't save values between visits. An app does it with three pieces. TasteTrack's
`preferences.ts` remembers the page size and the last season of each show this way.

**Save path values from the URL.** A path value is always in the URL, so watching `globalParams()`
is exact:

```ts
const current = appRouter.globalParams({ path: { workspaceId: stringCodec() } });
effect(() => {
  const { workspaceId } = current().path;
  if (workspaceId) {
    localStorage.setItem('lastWorkspace', workspaceId);
  }
});
```

**Leave the default off a remembered query field.** A value at its default leaves the URL, so the
URL can't tell "picked 24 per page" from "never picked". Without a default, the URL holds the field
only when someone set it. Save it from `globalParams()` like a path value, and fall back to the
saved value where the page reads the field:

```ts
// In the route: pageSize: queryParam({ codec: pageSizeCodec })
const current = appRouter.globalParams({
  query: { pageSize: queryParam({ codec: pageSizeCodec }) },
});
effect(() => {
  const { pageSize } = current().query;
  if (pageSize !== null) {
    localStorage.setItem('pageSize', String(pageSize));
  }
});

// In the page:
const pageSize = computed(() => results.params().query.pageSize ?? saved.pageSize() ?? 24);
```

Links then need no saved values, and `/movies` opens at the size picked last. A URL with
`?pageSize=48` still shows 48, and 48 becomes the saved size.

**Pick the workspace in the redirect at `/`.** A redirect function can build a typed link to the
last workspace:

```ts
export const { AppRouter, provideAppRouter } = defineAppRouter(RouteNames, {
  routes: [
    {
      path: '',
      pathMatch: 'full',
      redirectTo: (): UrlTree => {
        const { routes } = inject(AppRouter);
        const last = localStorage.getItem('lastWorkspace');
        return last
          ? routes.REPORTS.createUrlTree({ path: { workspaceId: last } })
          : routes.WORKSPACES.createUrlTree();
      },
    },
    { path: 'w', routeName: RouteNames.WORKSPACES },
    {
      path: 'w/:workspaceId/reports',
      routeName: RouteNames.REPORTS,
      pathParam: { workspaceId: stringCodec() },
    },
  ],
});
```

The `UrlTree` return type matters. `AppRouter` comes out of the same `defineAppRouter()` call, so
without it TypeScript can't work out either type.

### When the signal fires

`params` fires only when a field's text in the URL changes. `globalParams()` works the same way.
Going from `?search=elm&page=2` to `?page=2&search=elm` doesn't fire.

A field whose text didn't change keeps the same value object. Going from `?sort=title:asc&page=1`
to `?sort=title:asc&page=2` gives a new `page`, but `sort` stays `===` to the one you read before.
So a `computed()` that returns `sort` keeps its value, and nothing that reads it runs again. Don't
change these objects in place.

A field whose text changed is decoded again, and `params` fires. Codecs, dates, and classes need
nothing extra, because only the text is compared. A write that would leave the URL as it is
doesn't navigate, so nothing fires.

Patches always merge into the latest URL, never into an old signal value. Forms follow the
signal.

## Write the query

Start on `/results?sort=new&search=oak&page=4`, where the route doesn't declare `sort`:

```ts
await results.patchQuery({ search: 'elm', page: 1 });
// /results?sort=new&search=elm

await results.patchQuery({ page: results.params().query.page + 1 });
// /results?sort=new&search=elm&page=2
```

`search` changed. `page` went back to its default, so it left the URL. `sort` stayed, because a
patch never touches keys it doesn't know.

A patch changes only what you give it. Leave a field out, or pass `undefined`, and it stays. To
clear a field, set it to its default or `null`. The path, the fragment, unknown keys, and
fields owned by child routes stay as they are. `patchQuery` takes the same options as `navigate()`,
like `replaceUrl` or `state`.

A patch also rewrites every field the route declares, so it cleans up as it goes. After any patch,
`?page=abc` and `?page=1` both disappear, and `?page=02` becomes `?page=2`.

### Each write is a navigation

A patch reads the current URL, merges your fields in, and calls `navigateByUrl()` right away. If the
route isn't active, it rejects.

Angular runs one navigation at a time, and a new one cancels whatever is running. So two patches in
a row don't add up:

```ts
void results.patchQuery({ search: 'elm' });
void results.patchQuery({ page: 2 }); // built from the URL before search=elm
```

The second cancels the first, and you end up with only `page=2`. If fields change together, put
them in one patch.

This rarely causes trouble. A query-only navigation takes a few milliseconds, so clicks at
different moments don't collide. They can collide if a guard or resolver runs on query changes, as
with `runGuardsAndResolvers: 'paramsOrQueryParamsChange'`.

The promise settles the way Angular's does:

| What happened                             | Result           |
| ----------------------------------------- | ---------------- |
| It worked                                 | Resolves `true`  |
| The URL already held the patch            | Resolves `true`  |
| A guard said no                           | Resolves `false` |
| Something else navigated first            | Resolves `false` |
| The route wasn't active, or Angular threw | Rejects          |

"Something else" can be another patch, a link click, the Back button, or a call to Angular's
`Router`.

When the patch wouldn't change the URL, `patchQuery()` doesn't navigate. Angular would skip that
navigation and resolve `false`, which looks like a guard saying no. If another navigation is
running, the patch still navigates, so it cancels that one.

## Bind a form

A form holds what the user is typing. The URL holds what's been written. ngx-urlik keeps the two in
step, for both Reactive Forms and Signal Forms. Forms cover the active route's query fields, not its
path. Create or bind a form in an injection context while the route is active. It cleans up when
it's destroyed. If the route stops showing while the form still exists, the form keeps its values.
An edit made then fails as an error, because there's no active route to write to.

Both form systems take these options:

| Option           | Default    | What it does                                                             |
| ---------------- | ---------- | ------------------------------------------------------------------------ |
| `replaceUrl`     | `true`     | Whether each write replaces the current history entry                    |
| `writeWhen`      | `'always'` | `'valid'` holds a field back until its validators pass                   |
| `beforeWrite`    | none       | Changes a write right before it navigates, such as adding `page: 1`      |
| `onWriteFailure` | none       | Gets declined and failed writes. Without it, errors go to `ErrorHandler` |

`createQueryParamsFormGroup()` and `bindQueryParamsToFormGroup()` also take `debounce`.
`createQueryParamsSignalForm()` also takes `schema`, for validators and `debounce()` rules. The
sections below show each one.

### Reactive Forms

```ts
import { createQueryParamsFormGroup } from 'ngx-urlik/forms';

const filters = createQueryParamsFormGroup(results);
filters.patchValue({ search: 'elm', page: 1 });
```

You get one non-nullable `FormControl` per field. Array fields get array-valued controls. Nested
groups and `FormArray` aren't supported. No validators are added. For validators or other control
options, build the group yourself and call `bindQueryParamsToFormGroup(results, group, options)`.

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

The form starts with the URL's values. `patchValue({ search: 'elm', page: 1 })` is one write, not
two. Signal Forms read the model in an effect, so updates made before that effect runs go out
together.

Form writes replace the current history entry. Typing `elm` doesn't leave three stops for the Back
button. Pass `replaceUrl: false` if you want them.

A field follows the URL only when the URL's value for that field changes. So when `page` changes, a
half-typed `search` stays put. URL changes never mark fields touched or dirty.

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

Reactive Forms have no debounce of their own, so the binding has one:

```ts
const filters = createQueryParamsFormGroup(results, { debounce: { search: 300 } });
```

The user types `elm` and stops. The search writes 300 ms later. Other fields write right away and
don't disturb the waiting search. A navigation that changes only other fields doesn't drop it
either: it writes on top of whatever the URL is when the delay ends. A navigation that changes the
search drops it. Press Back to `?search=oak` while `elm` waits, and the input shows `oak`. Signal
Forms' `debounce()` does the same. Leaving the page drops it too.

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
change each write in `beforeWrite`:

```ts
const filters = createQueryParamsFormGroup(results, {
  debounce: { search: 300 },
  beforeWrite: (patch) => ('search' in patch ? { page: 1, ...patch } : patch),
});
```

On `/results?page=4`, typing `elm` makes one navigation to `/results?search=elm`, and the page
control shows 1. Changing only the page writes it as is. `patch` is spread last, so
`patchValue({ search: 'elm', page: 3 })` keeps page 3. Signal Forms take the same option. Without a
form, pass both: `patchQuery({ search, page: 1 })`.

`beforeWrite(patch, draft)` runs right before the navigation, after any delay, and after
`writeWhen` has held back invalid fields. `patch` has only the fields about to be written. `draft`
has the whole form. Whatever you return gets written. A field set to `undefined` keeps its URL
value.

Use it to change other fields. To shape a field's own value, use its codec, so links and patches
write it the same way. Fields that `beforeWrite` adds aren't drafts. The form reads them back from
the URL after the write.

An edit that ends at the URL's value doesn't write, so `beforeWrite` doesn't run. On
`/results?search=oak&page=3` with a 300 ms debounce, typing `x` and deleting it keeps page 3. The
one exception is an edit made while that field's last write still runs. Typing `elm` and going back
to `oak` before the `elm` write finishes writes `oak`, so the `elm` write is cancelled.

### When a write fails

A guard can decline a write, another navigation can cancel it, or it can throw. In every case the
form keeps what the user typed until that field's URL value changes. Nothing is retried.

`onWriteFailure` gets `{ kind: 'declined' }` or `{ kind: 'error', error }`. Without it, errors go to
Angular's `ErrorHandler`, and declines are silent. Typing `elm ` on `?search=elm` with a trimming
codec isn't a decline: the URL wouldn't change, so `patchQuery()` resolves `true`. Typing `e` then
`el` quickly isn't either: the `el` write cancels the `e` write and reports for itself. If
`beforeWrite` throws, the error goes to `ErrorHandler`, nothing is written, and the drafts stay.

Destroying the form drops edits that haven't been written, and their delays. A navigation that
already started still runs.

## Diagnostics and errors

Bad URL data doesn't crash anything. It falls back to the default and reports a diagnostic. On
`/results?page=abc`, `page` reads as 1, and you get `PARAM_DESERIALIZE_FAILED` with `route`
`'RESULTS'` and `parameter` `'page'`. Diagnostics go to `console.warn`, unless you pass your own
`diagnostics: { warn }` to `defineAppRouter`.

| Code                       | When                                         |
| -------------------------- | -------------------------------------------- |
| `PARAM_DESERIALIZE_FAILED` | A codec returned `null` or threw             |
| `PARAM_SERIALIZE_FAILED`   | A query codec returned a non-string or threw |

A diagnostic has `code`, `message`, `route`, `parameter`, and `operation` (`'serialize'` or
`'deserialize'`). When a codec threw, it also has `cause`, the codec's error.

`route` is the route that declares the field, which can be a parent of the one you read. Unnamed
parents are named by position, like `routes[0].children[1]`.

Two things throw, because there's no sensible value to fall back to: reading an inactive route, and
a path value that won't serialize. A path value that won't decode never gets that far. The route
just doesn't match.

`defineAppRouter()` checks your routes at startup: every named route, every route above one, and
every route with `pathParam` or `queryParams`. It throws one error that lists every problem:

- Repeated or empty route names.
- A member of your route names enum that no route uses.
- Names on redirects, wildcards, or matchers.
- `loadChildren` on or above a named route.
- Paths that aren't known up front, or have empty segments or reserved characters.
- `pathParam` maps that don't match the placeholders.
- `queryParams` values that `queryParam()` didn't make.
- `queryParams` on a route with no named route at or below it, because nothing reads them.
- A placeholder or query key declared twice in a route and its parents.

TypeScript catches many of these first. Angular still checks its own route config.

## Work with Angular Router

`provideAppRouter(...features)` registers your routes and the `AppRouter` token, and passes Angular
router features through, like `withRouterConfig({ paramsInheritanceStrategy: 'always' })`. ngx-urlik
reads parent path values itself, so typed routes work with any `paramsInheritanceStrategy`.

Angular still decides which route matches, through route order, matching, guards, redirects, and
outlets. So keep overlapping patterns in a sensible order.

Server rendering works the same way. On the server, `params()` reads the requested URL, so the
first HTML already shows the right page. Code that touches `localStorage`, like the examples in
[Remember values yourself](#remember-values-yourself), needs a browser check there.

### Escape hatch

For URLs outside your typed routes, `AppRouter.escapeHatch` gives you Angular's own tools, with
Angular's types and behavior, `browserUrl` included:

- Methods: `createUrlTree`, `navigate`, `navigateByUrl`, `parseUrl`, `serializeUrl`, `isActive`.
- Read-only values: `url`, `events`, `navigated`, `currentNavigation`, `lastSuccessfulNavigation`,
  `componentInputBindingEnabled`.

`isActive(url, matchOptions?)` is Angular's `isActive()` bound to the router. It returns a
`Signal<boolean>`. For typed routes, use `routes.NAME.ifActive()` instead. The escape hatch
leaves out `routerState`, the route config, lifecycle controls, and the mutable properties Angular
has deprecated.

You can still inject Angular's `Router`. It runs the app, so it has to stay. Calls through it skip
the typed routes.

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
                'Read and write the URL through AppRouter routes. Use AppRouter.escapeHatch for anything else.',
            },
          ],
        },
      ],
    },
  },
];
```

It's a warning, not an error. A deliberate use can stay, with an `eslint-disable-next-line` comment
that says why. `RouterLink`, `RouterOutlet`, `ResolveFn`, `ActivatedRouteSnapshot`, and the rest
stay allowed, since templates and guards need them.

## Types

| Type                      | What it is                                 |
| ------------------------- | ------------------------------------------ |
| `RouteNode<P, Q, R>`      | A typed route                              |
| `PathParamsOf<Node>`      | Its path values, inherited ones included   |
| `QueryParamsOf<Node>`     | Its query values, inherited ones included  |
| `RouteStateOf<Node>`      | What `params()` returns: `{ path, query }` |
| `RouteQueryPatch<Node>`   | What `patchQuery` accepts                  |
| `UrlParamsState<P, Q>`    | `{ path, query }` with those value types   |
| `GeneratedAppRouter`      | What the `AppRouter` token gives you       |
| `RouteDefinition`         | One route: Angular's fields plus ours      |
| `RouteDefinitions`        | A route array                              |
| `UrlParamCodec<T>`        | A codec                                    |
| `AppRouterDiagnostic`     | A diagnostic passed to `diagnostics.warn`  |
| `AppRouterDiagnosticCode` | `diagnostic.code`                          |
| `AppRouterDiagnostics`    | The `diagnostics` option: `{ warn }`       |

The node types take a route's type, which `typeof` gives you:

```ts
const results = inject(AppRouter).routes.RESULTS;

type ResultsQuery = QueryParamsOf<typeof results>; // { search: string; page: number }

function update(patch: RouteQueryPatch<typeof results>) {
  return results.patchQuery(patch, { replaceUrl: true });
}
```

`ngx-urlik/forms` exports the option types, `QueryParamsBindingOptions`,
`QueryParamsFormGroupOptions`, and `CreateQueryParamsSignalFormOptions`. It also exports
`QueryParamsFormControls`, the controls of a form group, and `QueryWriteFailure`, what
`onWriteFailure` gets.

## Not supported

| Not supported                                       | Instead                                                     |
| --------------------------------------------------- | ----------------------------------------------------------- |
| Angular versions other than 22                      | Use Angular 22                                              |
| Typed redirects, wildcards, matchers, named outlets | Declare them as unnamed routes                              |
| Route arrays split across files                     | Pass the routes to `defineAppRouter()` as one literal array |
| Named routes inside `loadChildren`                  | Keep definitions in the router file. Lazy-load pages        |
| Swapping routes with `Router.resetConfig()`         | Declare every named route up front                          |
| Query property names that differ from URL keys      | The property name is the URL key                            |
| Built-in date or object codecs                      | Write your own codec                                        |
| Writing global query fields                         | Global fields are read-only. Write them through a route     |
| Reading the fragment                                | You can only set it when building a link                    |
| Typed relative navigation                           | Use the escape hatch                                        |
| Remembering values across visits, like a page size  | [Remember values yourself](#remember-values-yourself)       |

## TasteTrack demo

[`projects/taste-track`](projects/taste-track) is a small movie and TV journal built with
ngx-urlik. It uses only the public entry points and keeps its data in your browser, in IndexedDB.
From the repo root, with the Node version from `.nvmrc`:

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
3. Follow a credit to a person or studio, then a title back to the catalog.
4. Change a rating and log a viewing, then reload. Both stick.
5. Filter Library (Signal Forms) and Viewing history (Reactive Forms with a delayed search). Both
   ignore searches shorter than three letters.
6. Reset TasteTrack in Settings. The starting data comes back, and your theme stays.

Where to look for each feature:

| Page                             | Shows                                                                              |
| -------------------------------- | ---------------------------------------------------------------------------------- |
| Movie and TV browsing            | Query fields from a parent with no path segment, a genre list, sorting, pagination |
| Show → season → episode          | Inherited path parameters, an ID codec that hides its prefix, an integer codec     |
| Detail section links             | URL fragments                                                                      |
| Credits and contributor profiles | Typed links across branches                                                        |
| Library                          | Signal Forms, status and media lists, structured viewing counts                    |
| Viewing history                  | Reactive Forms with a delayed, validated search                                    |
| Movies, TV, People, Studios      | Empty-path children and redirects                                                  |
| Unknown URLs                     | Wildcard routes                                                                    |

Shared pages check their route with `ifActive()`. `paginationParams()` shares field definitions
between pages. The form pages reset the page number in `beforeWrite`. The catalog does it in the
same `patchQuery()` call. Sort field and direction are one codec value, so they always travel
together.

The fake backend is in `projects/taste-track/src/app/backend/`. `BackendApi` answers every query and
change. Each query returns an `Observable`, which pages turn into a signal with `toObservable`,
`switchMap`, and `toSignal`. `TasteTrackRepository` keeps the IndexedDB tables in signals through
Dexie. After a change it reloads them and bumps `dataVersion`, so open queries emit again.

A fixed seed fills the database on first run and on reset: 30 movies, 30 shows, 66 seasons, 394
episodes, 8 people, and 4 studios. The catalog is read-only. Ratings, statuses, favorites, counts,
and viewings survive reloads. Reset clears only the TasteTrack database. The theme is stored
separately.

## Develop

With the Node version from `.nvmrc`:

```sh
npm ci
npm run build      # library, then demo
npm test           # unit tests for both
npm run typecheck  # public type tests, and a 201-route app
npm run e2e        # Playwright against the demo
```

[Design decisions](docs/decisions.md) explains why the library works the way it does, and what each
choice costs. [Reading the code](docs/implementation.md) shows where things live, how a write
moves through, and every state the code moves between.
[Development history](docs/development-history.md) records the designs we explored and where each
topic stands.

## License

[MIT](LICENSE)
