# ngx-urlik

Type-safe URL parameters and navigation for Angular Router.

Say your search page is at `/results?search=oak&minRating=4`. Angular hands you `minRating` as the
string `'4'`, or `null` when it's missing. So you parse it and pick a default. To link to ratings of
5 and up, you copy `search` into the link yourself. Then you do it all again on the next page with
filters.

With ngx-urlik, you describe `minRating` once, on its route: a number that defaults to 0. You read
it as the number `4`, change it with one call, and build links that TypeScript checks.

## The idea

The URL is the page's state. When a page reads what it shows from the URL, reload, Back, and a
shared link all show the same page. ngx-urlik is built around that:

- You describe each value once, on the route that owns it.
- A codec turns URL text into a value and back. Reads, links, patches, and forms all use it.
- Bad URL data doesn't crash the page. `?minRating=abc` reads as the default and logs a warning.
- A link holds only what you pass. Nothing is copied from the current URL.
- A form holds what the user is typing. The URL holds what's been written.
- The page decides how fields affect each other, like clearing the rating filter on a new search.
- Angular Router still does the routing. ngx-urlik sits between your code and the URL.

## Get started

ngx-urlik needs Angular 22. It isn't on npm yet. The form helpers are in `ngx-urlik/forms` and need
`@angular/forms`.

Write normal Angular routes, and name the ones your code uses:

```ts
import { defineAppRouter, numberCodec, queryParam, stringCodec } from 'ngx-urlik';

enum RouteNames {
  RESULTS = 'RESULTS',
}

export const { AppRouter, provideAppRouter } = defineAppRouter(RouteNames, {
  routes: [
    {
      path: 'results',
      routeName: RouteNames.RESULTS,
      queryParams: {
        search: queryParam({ codec: stringCodec(), defaultValue: '' }),
        minRating: queryParam({ codec: numberCodec(), defaultValue: 0 }),
      },
      loadComponent: () => import('./results-page').then((m) => m.ResultsPage),
    },
  ],
});
```

```ts
bootstrapApplication(App, { providers: [provideAppRouter()] }); // instead of provideRouter()
```

Now the user is on `/results?search=oak&minRating=4`:

```ts
const results = inject(AppRouter).routes.RESULTS;

results.params().query; // { search: 'oak', minRating: 4 }

await results.patchQuery({ search: 'elm', minRating: 0 });
// The URL is now /results?search=elm

const link = results.createUrlTree({ query: { minRating: 2 } });
// /results?minRating=2
```

```html
<a [routerLink]="link">Rated 2 and up</a>
```

`params()` is a signal, so anything that reads it updates with the URL. `patchQuery()` changes the
fields you pass, in one navigation, and keeps the rest. Rating 0 is the default, so it left the URL.
The link has no `search`, because `createUrlTree()` uses only what you pass.

The key in `AppRouter.routes` is the enum member's name. Keep the enum in the router file, and don't
export it. It's there so Go to Definition, Find References, and Rename on `routes.RESULTS` reach the
route and every use. A plain string name can't do that.

Have an existing app? [Move it over one feature at a time](#adopt-it-one-feature-at-a-time).

### Coding agents

The package ships a skill that teaches coding agents to use ngx-urlik. Agents won't find it on their
own, so point to it from your `AGENTS.md` or `CLAUDE.md`:

```md
This app uses ngx-urlik for routing and URL state. Before you change routes, links, guards,
resolvers, or code that reads or writes the URL, read
node_modules/ngx-urlik/skills/ngx-urlik/SKILL.md and follow it. Read and write the URL through
AppRouter, not ActivatedRoute or Router. Declare new routes in the defineAppRouter() file.
```

For Claude Code, link it into your project. The link follows the installed version:

```sh
mkdir -p .claude/skills
ln -s ../../node_modules/ngx-urlik/skills/ngx-urlik .claude/skills/ngx-urlik
```

## Routes

A route is an Angular route with up to three more fields:

| Field         | What it does                                                                               |
| ------------- | ------------------------------------------------------------------------------------------ |
| `routeName`   | Adds the route to `AppRouter.routes`                                                       |
| `pathParam`   | A codec for each `:placeholder` in the route's path. A placeholder without one is a string |
| `queryParams` | The query fields the route owns. Its children inherit them                                 |

Everything else works as in Angular. Write `path` and `routeName` as literals, inside the
`defineAppRouter()` call, because TypeScript reads your routes from them. An array typed as
Angular's `Routes` compiles, but gives you no typed routes.

A route without `routeName` is a plain Angular route. Redirects, wildcards, matchers, named outlets,
and `loadChildren` work there, but can't take a name. A named route doesn't need a component.

### Nested routes

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

Named routes appear flat in `AppRouter.routes`. Each inherits the path and query fields of every
route above it, so `routes.SEASON` has `showId` and `season`. A name can appear only once in a route
and its parents. A placeholder and a query field can share one, because they live apart, under
`path` and `query`.

At `/shows/tv_1`, `SHOW` and its empty-path child `SHOW_OVERVIEW` are both active.

The codec also decides whether a route matches. `/shows/tv_1/seasons/2` matches `SEASON`.
`/shows/tv_1/seasons/abc` doesn't, so Angular tries the next route. This check runs before the
route's own `canMatch` guards.

### Lazy loading

Pages load lazily with `loadComponent`. Route definitions load with the app, so a named route, and
every route above it, can't use `loadChildren`. Here's why. `routerLink` needs a `UrlTree` right
away. A link to `/orders/4` needs the `orders/:orderId` path, and the codec that writes `4`, before
anyone opens the orders feature.

Move a lazy module's `providers` to the route above the feature's pages. Angular still creates them
on first visit. `loadComponent` needs a standalone component. Angular's
`ng generate @angular/core:standalone` converts one.

The route list is fixed once `defineAppRouter()` runs. Don't call `Router.resetConfig()`, or typed
routes would build URLs for routes Angular no longer has.

### One file for the whole app

Put every route in one `defineAppRouter()` call. That file is a map of your app: every URL, its
parameters, its guards, and the page it loads. It stays small, because pages live elsewhere.

### Adopt it one feature at a time

Say each feature is a lazy NgModule.

**1. Pass your routes to `defineAppRouter()`, and name nothing.** Replace
`RouterModule.forRoot(routes)` or `provideRouter(routes)` with `provideAppRouter()`. Keep importing
`RouterModule` for `routerLink` and `<router-outlet>`:

```ts
enum RouteNames {}

export const { AppRouter, provideAppRouter } = defineAppRouter(RouteNames, { routes });

@NgModule({ imports: [RouterModule], exports: [RouterModule], providers: [provideAppRouter()] })
export class AppRoutingModule {}
```

The app behaves as before.

**2. Convert one feature.** Move its routes into the router file, and name the ones your code uses.
Load its pages with `loadComponent`, and move its providers up. Delete its NgModule. The other
features keep `loadChildren` until you get to them.

**3. Update pages as you go.** `ActivatedRoute` keeps working, because it's the same router
underneath. The [ESLint rule](#flag-direct-router-use) finds the pages left to do:

```ts
const order = inject(AppRouter).routes.ORDER;
const orderId = computed(() => order.params().path.orderId); // a number, not a string
```

## Codecs

A codec turns URL text into a value and back:

```ts
interface UrlParamCodec<T> {
  serialize(value: T): string | null;
  deserialize(raw: string): T | null;
}
```

`null` means "I can't convert this", so `T` can't include `null`. One codec works in a path, in the
query, and inside a list. In the query, the property name is the URL key. When a key repeats, the
last one wins: `?minRating=1&minRating=2` reads as `2`.

| Codec                        | Accepts                                                                                        |
| ---------------------------- | ---------------------------------------------------------------------------------------------- |
| `stringCodec()`              | Any string, including `''`                                                                     |
| `numberCodec()`              | Decimals like `-1.5`, `.5`, `1e3`, and `Infinity`. Not `NaN`, hex, whitespace, `''`, or `12px` |
| `booleanCodec()`             | Exactly `true` or `false`                                                                      |
| `enumCodec(values)`          | One value from an array, a record, or any enum. `Status.Archived = 1` writes `1`               |
| `listCodec(item, separator)` | `item` values joined by `separator`                                                            |

`enumCodec()` takes strings and finite numbers, so string, numeric, and mixed enums all
work. Each value writes as its text. Two values can't share one, so `enumCodec([1, '1'])` throws.

A path value can't write as `''`, `.`, or `..`. A path segment can't be empty, and browsers drop `.`
and `..`.

### Write your own codec

For dates, objects, or stricter rules, write the two functions:

```ts
const rating: UrlParamCodec<number> = {
  serialize: (value) =>
    Number.isInteger(value) && value >= 0 && value <= 5 ? String(value) : null,
  deserialize: (raw) => (/^[0-5]$/.test(raw) ? Number(raw) : null),
};

minRating: queryParam({ codec: rating, defaultValue: 0 });
```

`?minRating=3` reads as `3`. `?minRating=9` reads as 0 and logs a warning. Writing `9` drops the
field. On a path, `/ratings/9` doesn't match, and building a link with `9` throws.

A codec follows three rules:

- One text per value. The library compares text to tell whether a value changed.
- Lose nothing: `deserialize(serialize(value))` gives back an equal value. Shorter text is fine,
  like `t:a` for `{ field: 'title', direction: 'asc' }`. Trimming isn't.
- Stay pure, and don't call `inject()`. Codecs often run outside an injection context.

### Lists

```ts
tags: queryParam({ codec: listCodec(stringCodec(), ','), defaultValue: [] });
```

`?tags=a,b` reads as `['a', 'b']`. An empty list writes `?tags=`, so it stays apart from a missing
key. That's why "select none" works even with `defaultValue: ['new']`. Without a default, a missing
key reads as `null`.

A backslash keeps a comma inside an item: `['red, green', 'blue']` writes
`?tags=red%5C,%20green,blue`. Empty items, like `?tags=a,,b`, fail and read as the default.

### Defaults and required fields

With `defaultValue: 0`, `/results` and `/results?minRating=abc` both read `minRating` as 0. Writing
0 takes `minRating` out of the URL. Without a default, a missing field reads as `null`.

A default is a plain value, so `/results` shows the same page for everyone. A fallback that needs a
service goes in the page:

```ts
// In the route: locale: queryParam({ codec: stringCodec() })
const locale = computed(() => results.params().query.locale ?? settings.locale());
```

`required: true` makes TypeScript insist on the field when you build a link. The URL can still lack
it. To pass "no value", pass `null`, or `[]` for a list.

## Build links

```ts
const season = inject(AppRouter).routes.SEASON;
const link = season.createUrlTree({ path: { showId: 'tv_1', season: 2 }, fragment: 'episodes' });
await season.navigate({ path: { showId: 'tv_1', season: 2 } }, { replaceUrl: true });
```

`link` is `/shows/tv_1/seasons/2#episodes`. Give it to `routerLink`. `routerLinkActive` works too.

You get exactly what you pass. The current query is never copied, whatever Angular's
`defaultQueryParamsHandling` says. Every path value is required, the parents' too. Query fields are
optional unless `required`, and `undefined` ones are left out. There's no relative navigation.

`navigate()` takes values first and Angular's options second. When nothing is required, write
`navigate({}, { replaceUrl: true })`. Every option works except `browserUrl`, because it could show
an address the route didn't build.

A query value that won't serialize is dropped with a warning. A path value has no fallback. If
`showId` is `''`, `createUrlTree()` throws, and `navigate()` rejects. So check IDs from data before
you build links with them.

To keep the current filters, spread them in. On `/results?search=oak&minRating=4`, this gives
`/results?search=oak&minRating=5`:

```ts
const higherRating = computed(() => {
  const { query } = results.params();
  return results.createUrlTree({ query: { ...query, minRating: query.minRating + 1 } });
});
```

A link to a section of the current page uses Angular's own form:

```html
<a [routerLink]="[]" fragment="credits" queryParamsHandling="preserve">Credits</a>
```

## Read the URL

Each named route has a `params` signal holding `{ path, query }`, inherited fields included. It
updates before Angular creates the new page, so a page's constructor sees its own URL. Reading a
route that isn't active throws.

`params` fires only when a field's text changes. A field whose text stayed the same keeps the same
object. Go from `?sort=title:asc&minRating=1` to `?minRating=2&sort=title:asc`, and `sort` is still
`===` the one you read before. So a `computed()` over `sort` doesn't rerun its readers. Don't change
these objects in place.

The fragment isn't in `params()`. You can set it in links, but not read it.

### In guards and resolvers

Guards run before the URL changes, so `params()` still shows the page you're leaving. Read the
destination from the snapshot Angular passes in:

```ts
export const seasonResolver: ResolveFn<Season> = (route) => {
  const appRouter = inject(AppRouter);
  const { path } = appRouter.paramsSnapshot(appRouter.routes.SEASON, route);
  return inject(SeasonApi).load(path.showId, path.season);
};
```

Any snapshot from that navigation works, so a child's guard can read its parent.

### One page on several routes

Say one detail page shows movies and episodes. Ask a route if it's showing, and read through what it
returns:

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

`ifActive()` returns the route while it or one of its children shows, and `null` otherwise. On a
page with no named route, like a `**` fallback, it's `null` for every route. You read through what
it returned, so you can't check one route and read another by mistake. In a template:

```html
@if (routes.EPISODE.ifActive(); as episode) {
<p>Episode {{ episode.params().path.episodeId }}</p>
}
```

Check nested routes deepest first, because a parent counts as active while its child shows. That's
also what makes nav highlighting work. With `BROWSE` above the movie and TV routes, this link is
active at `/movies`, `/tv`, and `/tv/brambleworth-manor/s/2`:

```html
<a [routerLink]="browseUrl" [class.active]="appRouter.routes.BROWSE.ifActive()">Browse</a>
```

Fields that several routes share belong on their parent. If `BROWSE` declares `search` and
`minRating`, `BROWSE.params()` and `BROWSE.patchQuery()` work on every page under it.

### Values on every page

A service might need a campaign tag like `?source=`, or the workspace in `/w/:workspaceId/...`, on
whatever page is showing. `globalParams()` reads both:

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

A path value comes from whichever active route has that placeholder, named or not, or is `null`.
Query fields work as on routes. Nothing throws. It's read-only, and it works outside an injection
context. In a guard, use `globalParamsSnapshot(definitions, route)`. It works on routes without a
name too.

### Remember values yourself

ngx-urlik doesn't save values between visits. Your app can, with `globalParams()`. TasteTrack's
`preferences.ts` remembers the page size and each show's last season.

Save path values whenever they change:

```ts
const current = appRouter.globalParams({ path: { workspaceId: stringCodec() } });
effect(() => {
  const { workspaceId } = current().path;
  if (workspaceId) {
    localStorage.setItem('lastWorkspace', workspaceId);
  }
});
```

Give a remembered query field no default. A value at its default leaves the URL, so `/movies` can't
tell "picked the grid view" from "never picked". Without a default, the key is there only when
someone set it. Save it the same way, and fall back where the page reads it:

```ts
// In the route: view: queryParam({ codec: enumCodec(['grid', 'list']) })
const view = computed(() => results.params().query.view ?? saved.view() ?? 'grid');
```

To open the last workspace from `/`, build the link in a redirect:

```ts
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
```

Keep the `UrlTree` return type. This route is inside the call that creates `AppRouter`, so without
it TypeScript can't work out either type.

## Write the query

Start on `/results?sort=new&search=oak&minRating=4`. The route doesn't declare `sort`:

```ts
await results.patchQuery({ search: 'elm', minRating: 0 });
// /results?sort=new&search=elm
```

`minRating` went back to its default, so it left the URL. `sort` stayed, because a patch never
touches keys it doesn't know. Fields you leave out stay too, and so do the path and the fragment. To
clear a field, set it to its default or `null`. A patch also cleans up: `?minRating=02` becomes
`?minRating=2`.

Each patch is one Angular navigation, built from the URL when you call it. A new navigation cancels
the one running, so two patches in a row don't add up:

```ts
void results.patchQuery({ search: 'elm' });
void results.patchQuery({ minRating: 2 }); // cancels the first: only minRating=2 is left
```

Put fields that change together in one patch.

| What happened                             | The promise      |
| ----------------------------------------- | ---------------- |
| It worked, or the URL already matched     | Resolves `true`  |
| A guard said no                           | Resolves `false` |
| Something else navigated first            | Resolves `false` |
| The route wasn't active, or Angular threw | Rejects          |

## Bind a form

A form holds what the user is typing. The URL holds what's been written. ngx-urlik keeps the two in
step, for Reactive Forms and Signal Forms. Forms cover query fields, not the path.

```ts
import { createQueryParamsFormGroup } from 'ngx-urlik/forms';

const filters = createQueryParamsFormGroup(results);
filters.patchValue({ search: 'elm', minRating: 0 });
```

You get one non-nullable `FormControl` per field, with no validators. To add validators, build the
group yourself and call `bindQueryParamsToFormGroup(results, group, options)`.

```ts
import { createQueryParamsSignalForm } from 'ngx-urlik/forms';

const { model, form } = createQueryParamsSignalForm(results);
model.update((query) => ({ ...query, search: 'elm' }));
```

You get a writable model and a `FieldTree`. To bind your own, call
`bindQueryParamsToSignalForm(results, form, options)`.

Create a form in an injection context while its route is active. It cleans up when it's destroyed.
If the route stops showing first, the form keeps its values, and an edit then fails as an error,
because there's no active route to write to.

How the binding behaves:

- `patchValue({ search: 'elm', minRating: 0 })` is one navigation, not two.
- Writes replace the history entry, so typing `elm` doesn't leave three stops for Back.
- A field follows the URL only when the URL's value for that field changes. So when `minRating`
  changes, a half-typed `search` stays put.
- Each write carries every field where the form differs from the URL. So if a link click cancels a
  write, the next write still sends what the user typed.

| Option           | Default    | What it does                                                            |
| ---------------- | ---------- | ----------------------------------------------------------------------- |
| `replaceUrl`     | `true`     | Whether each write replaces the current history entry                   |
| `writeWhen`      | `'always'` | `'valid'` holds a field back until its validators pass                  |
| `beforeWrite`    | none       | Changes a write right before it navigates                               |
| `onWriteFailure` | none       | Gets declined and failed writes. Errors go to `ErrorHandler` without it |
| `debounce`       | none       | Reactive Forms only. Delay per field, in milliseconds                   |
| `schema`         | none       | Signal Forms only. Validators and `debounce()` rules                    |

### Debounce a search

```ts
import { debounce, minLength } from '@angular/forms/signals';

// Signal Forms
createQueryParamsSignalForm(results, { schema: (fields) => debounce(fields.search, 300) });

// Reactive Forms
createQueryParamsFormGroup(results, { debounce: { search: 300 } });
```

The user types `elm` and stops. The search writes 300 ms later. Other fields write right away. If
the user presses Back to `?search=oak` while `elm` waits, the input shows `oak`, and `elm` is
dropped.

### Skip a too-short search

```ts
createQueryParamsSignalForm(results, {
  schema: (fields) => minLength(fields.search, 3),
  writeWhen: 'valid',
});
```

Typing `el` writes nothing. `elm` writes. Clearing the box writes an empty search, because Angular's
length validators accept empty values. Each field is judged alone, so a bad search doesn't hold up a
rating change.

### Clear the rating filter on a new search

Only your page knows that rule, so it goes in `beforeWrite`:

```ts
createQueryParamsFormGroup(results, {
  debounce: { search: 300 },
  beforeWrite: (patch) => ('search' in patch ? { minRating: 0, ...patch } : patch),
});
```

On `/results?minRating=4`, typing `elm` makes one navigation, to `/results?search=elm`. Without a
form, put both in one patch: `patchQuery({ search, minRating: 0 })`.

`beforeWrite(patch, draft)` runs right before the navigation, after any delay, and after
`writeWhen` holds back invalid fields. `patch` has only the fields about to be written. `draft` has
the whole form. Whatever you return gets written, and a field set to `undefined` keeps its URL
value. Use it to change other fields, not the field's own value.

### When a write fails

A guard can decline a write, or something can throw. Either way the form keeps what the user typed,
until that field's URL value changes. Nothing retries on its own, but the form's next write carries
the field again. `onWriteFailure` gets `{ kind: 'declined' }` or `{ kind: 'error', error }`.

## Diagnostics and errors

Bad URL data falls back to the default and logs a warning. On `/results?minRating=abc`, `minRating`
reads as 1, and you get:

```ts
{
  code: 'PARAM_DESERIALIZE_FAILED',
  route: 'RESULTS',
  parameter: 'minRating',
  operation: 'deserialize',
  message: '…',
}
```

A codec that fails to write gives `PARAM_SERIALIZE_FAILED`. When a codec throws, its error is in
`cause`. Warnings go to `console.warn`, unless you pass `diagnostics: { warn }` to
`defineAppRouter()`.

Two things throw, because there's nothing sensible to fall back to: reading an inactive route, and
building a link with a bad path value.

When the app starts, `defineAppRouter()` checks every named route, every route above one, and every
route with `pathParam` or `queryParams`. It throws one error that lists every problem:

- Repeated or empty route names.
- A `routeName` that isn't in your route names enum, or a member that no route uses.
- Names on redirects, wildcards, or matchers.
- `loadChildren` on or above a named route.
- Paths that aren't plain strings in the primary outlet, or have empty segments or reserved
  characters.
- `pathParam` maps that don't match the placeholders.
- `queryParams` values that `queryParam()` didn't make.
- `queryParams` on a route with no named route at or below it, because nothing reads them.
- A placeholder or query key declared twice in a route and its parents.

TypeScript catches many of these first. Angular still checks its own route config.

## Work with Angular Router

`provideAppRouter(...features)` passes Angular router features through, like `withRouterConfig({
paramsInheritanceStrategy: 'always' })`. Typed routes read parent values themselves, so they work
with any `paramsInheritanceStrategy`. Angular still picks the route, so route order matters as
usual. Server rendering works: `params()` reads the requested URL. Code that touches `localStorage`
needs a browser check there.

### Escape hatch

For URLs outside your typed routes, `AppRouter.escapeHatch` gives you Angular's own `createUrlTree`,
`navigate`, `navigateByUrl`, `parseUrl`, `serializeUrl`, and `isActive`, plus read-only `url`,
`events`, `navigated`, `currentNavigation`, `lastSuccessfulNavigation`, and
`componentInputBindingEnabled`.

You can still inject Angular's `Router`. Calls through it skip the typed routes.

### Flag direct router use

ESLint's `no-restricted-imports` rule warns on every import of `Router` or `ActivatedRoute`:

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

Keep a deliberate use with an `eslint-disable-next-line` comment that says why.

## Types

The node types take a route's type:

```ts
type ResultsQuery = QueryParamsOf<typeof results>; // { search: string; minRating: number }
```

| Type                      | What it is                                 |
| ------------------------- | ------------------------------------------ |
| `RouteNode<P, Q, R>`      | A typed route                              |
| `PathParamsOf<Node>`      | Its path values, inherited ones included   |
| `QueryParamsOf<Node>`     | Its query values, inherited ones included  |
| `RouteStateOf<Node>`      | What `params()` returns: `{ path, query }` |
| `RouteQueryPatch<Node>`   | What `patchQuery()` accepts                |
| `UrlParamsState<P, Q>`    | `{ path, query }` with those value types   |
| `GeneratedAppRouter`      | What the `AppRouter` token gives you       |
| `RouteDefinition`         | One route: Angular's fields plus ours      |
| `RouteDefinitions`        | A route array                              |
| `UrlParamCodec<T>`        | A codec                                    |
| `AppRouterDiagnostic`     | A diagnostic passed to `diagnostics.warn`  |
| `AppRouterDiagnosticCode` | `diagnostic.code`                          |
| `AppRouterDiagnostics`    | The `diagnostics` option: `{ warn }`       |

`ngx-urlik/forms` exports the option types, `QueryParamsFormControls`, and `QueryWriteFailure`.

## Not supported

| Not supported                                       | Instead                                               |
| --------------------------------------------------- | ----------------------------------------------------- |
| Angular versions other than 22                      | Use Angular 22                                        |
| Named redirects, wildcards, matchers, named outlets | Leave them unnamed                                    |
| Route arrays split across files                     | One literal array in `defineAppRouter()`              |
| Named routes inside `loadChildren`                  | Keep definitions in the router file. Lazy-load pages  |
| Query property names that differ from URL keys      | The property name is the URL key                      |
| Built-in date or object codecs                      | Write your own codec                                  |
| Writing global values                               | Write them through a route                            |
| Reading the fragment                                | Set it when building a link                           |
| Typed relative navigation                           | Use the escape hatch                                  |
| Remembering values across visits                    | [Remember values yourself](#remember-values-yourself) |

## TasteTrack demo

[`projects/demo-app`](projects/demo-app) is a small movie and TV journal built with ngx-urlik. Try
it at <https://tsopeh.github.io/ngx-urlik>, or run `npm ci` and `npm start` from the repo root.

Change the movie genres, sort, and page size, then reload. The filters come back, because they're in
the URL. Then open Brambleworth Manor, season 2, episode 1. The URL is
`/tv/brambleworth-manor/s/2/e/1`, because the ID codec drops the `tv_` prefix and adds it back when
reading.

| Page                    | Shows                                                       |
| ----------------------- | ----------------------------------------------------------- |
| Movie and TV browsing   | Query fields on a parent, a genre list, sorting, pagination |
| Show → season → episode | Inherited path values, custom codecs                        |
| Detail pages            | One page on several routes, fragments                       |
| Library                 | Signal Forms with validation                                |
| Viewing history         | Reactive Forms with a debounced, validated search           |

## Develop

```sh
npm ci
npm run build      # library, then demo
npm test           # unit tests for both
npm run typecheck  # builds the library, then public type tests and a 201-route app
npm run e2e        # Playwright against the demo
```

[Design decisions](docs/decisions.md) explains why the library works this way, and what each choice
costs. [Reading the code](docs/implementation.md) shows where things live.

## License

[MIT](LICENSE)
