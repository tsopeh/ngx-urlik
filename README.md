<h1 align="center">ngx-urlik — URL Is King</h1>

<p align="center">
  <img src="docs/banner.gif" alt="A howling mouse with the Angular logo on its body" width="480">
</p>

<p align="center">
  <em>Type-safe path and query parameters, navigation, and helpers that keep forms in sync with the
  URL.</em>
</p>

A URL is just a string, and Angular's router exposes path and query parameters as `string | null`.
That isn't ergonomic because each page has to parse every value and check that it's valid. Angular
has no way to declare types for path or query parameters, so navigation isn't type-safe, and the
routes can't be refactored with confidence. Angular offers no first-party API for keeping a form's
values in sync with the URL's query parameters.

ngx-urlik allows you to name a route and then declare type-safe query and path parameters.
TypeScript checks every link and navigation against these declarations. This library offers helpers
for working with Reactive and Signal Forms.

## Get started

This walk-through builds two pages. The results page lists movies, filtered by a search term and a
minimum rating, and stores both filters in query parameters, like `/results?search=oak&minRating=4`.
The movie page shows the details about a single movie, with its ID in the path, like `/movies/7`.

**1. Install the package.** ngx-urlik needs Angular 22.2.6 or a later 22.x release.

```sh
npm install ngx-urlik
```

**2. Declare your routes in one file.** They're Angular routes with a `routeName` on each route your
code uses, and a codec for each path and query parameter. A codec converts string values into the
typed value and back.

```ts
// app-router.ts
import { defineAppRouter, numberCodec, queryParam, stringCodec } from 'ngx-urlik';

enum RouteNames {
  RESULTS = 'RESULTS',
  MOVIE = 'MOVIE',
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
    {
      path: 'movies/:movieId',
      routeName: RouteNames.MOVIE,
      pathParams: { movieId: numberCodec() },
      loadComponent: () => import('./movie-page').then((m) => m.MoviePage),
    },
  ],
});
```

The route names come from a private enum, so Go to Definition, Find References, and Rename work on
them. Keep the enum in this file. Pages read their routes from `inject(AppRouter).routes`.

**3. Provide the router.** Call `provideAppRouter()` where you'd call `provideRouter()`. It calls
`provideRouter()` with your routes, so guards, resolvers, and `routerLink` work unchanged.

```ts
// main.ts
import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app';
import { provideAppRouter } from './app-router';

bootstrapApplication(App, { providers: [provideAppRouter()] });
```

**4. Build the results page.** It binds a form to the query, loads the movies that match the query,
and links each result to its page. It injects `AppRouter` instead of `ActivatedRoute` and `Router`,
because those return strings and accept any link.

```ts
// results-page.ts
import { httpResource } from '@angular/common/http';
import { Component, inject } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { createQueryParamsFormGroup } from 'ngx-urlik/forms';
import { AppRouter } from './app-router';
import { Movie } from './movie';

@Component({
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <form [formGroup]="filters">
      <input [formControl]="filters.controls.search" />
      <input [formControl]="filters.controls.minRating" type="number" />
    </form>

    @for (movie of movies.value(); track movie.id) {
      <a [routerLink]="linkTo(movie)">{{ movie.title }}</a>
    }
  `,
})
export class ResultsPage {
  readonly #routes = inject(AppRouter).routes;

  readonly filters = createQueryParamsFormGroup(this.#routes.RESULTS, {
    debounce: { search: 300 },
  }).form;

  readonly movies = httpResource<Movie[]>(
    () => ({ url: '/api/movies', params: this.#routes.RESULTS.params().query }),
    { defaultValue: [] },
  );

  linkTo(movie: Movie) {
    return this.#routes.MOVIE.createUrlTree({ path: { movieId: movie.id } });
  }
}
```

Open `/results?search=oak&minRating=4`, and the form shows oak and 4. `params().query` is
`{ search: 'oak', minRating: 4 }`, with the rating already a number, so the request needs no
parsing. `params` is a signal, so `movies` loads again whenever the query changes.

Each change to the query starts a request, so the search field doesn't write every keystroke. It
waits 300 ms after the last one. Type elm and stop, and the URL becomes
`/results?search=elm&minRating=4`. The write replaces the current history entry, so Back doesn't
step through every search. Open a movie and press Back, and the form still shows elm and 4, because
they're in the URL.

`linkTo()` builds `/movies/7` for the movie with ID 7. `movieId` must be a number, so a string
doesn't compile.

**5. Build the movie page.** It reads its ID from the path, loads that movie, and opens a search for
similar movies.

```ts
// movie-page.ts
import { httpResource } from '@angular/common/http';
import { Component, computed, inject } from '@angular/core';
import { AppRouter } from './app-router';
import { Movie } from './movie';

@Component({
  template: `
    <h1>{{ movie.value()?.title }}</h1>
    <button (click)="findSimilar()">Find similar</button>
  `,
})
export class MoviePage {
  readonly #routes = inject(AppRouter).routes;

  readonly movieId = computed(() => this.#routes.MOVIE.params().path.movieId);

  readonly movie = httpResource<Movie>(() => `/api/movies/${this.movieId()}`);

  findSimilar() {
    const movie = this.movie.value();
    if (movie) {
      return this.#routes.RESULTS.navigate({
        query: { search: movie.genre, minRating: movie.rating },
      });
    }
  }
}
```

On `/movies/7`, `movieId()` is the number 7. `/movies/abc` doesn't match this route, because
`numberCodec()` can't read abc, so `movieId()` is always a number. Angular reuses the page from
`/movies/7` to `/movies/8`, and `movieId()` returns 8, so the movie reloads.

For a comedy rated 4, Find similar opens `/results?search=Comedy&minRating=4`. A misspelled query
parameter, or a rating passed as a string, doesn't compile.

**6. Change the query from code.** `patchQuery()` changes the query parameters you pass and leaves
the rest of the URL unchanged:

```ts
const results = inject(AppRouter).routes.RESULTS;

// On /results?search=elm&minRating=4
await results.patchQuery({ minRating: 0 }); // /results?search=elm
```

The rating's default is 0, so `patchQuery()` removes `minRating` from the URL and keeps
`search=elm`. The examples in the rest of this README use this `results` route.

Moving an existing app? You can
[switch one feature at a time](#adopt-it-one-feature-at-a-time).
[An ESLint rule](#flag-direct-router-use) flags the code that still uses `ActivatedRoute` or
`Router`.

### Coding agents

The package includes a skill with instructions for coding agents. Agents don't load it on their own,
so add a pointer to your `AGENTS.md` or `CLAUDE.md`:

```md
This app declares its routes, and their path and query parameters, with ngx-urlik's AppRouter.
Before you change routes, links, guards, resolvers, code that reads or writes path or query
parameters, forms bound to query parameters, or code that uses ActivatedRoute or Router, read
node_modules/ngx-urlik/skills/ngx-urlik/SKILL.md and follow it.
```

In Claude Code, you can link the skill into `.claude/skills` instead. Claude Code loads skills from
that folder, and the link points into `node_modules`, so it always reads your installed version:

```sh
mkdir -p .claude/skills
ln -s ../../node_modules/ngx-urlik/skills/ngx-urlik .claude/skills/ngx-urlik
```

## Ground rules

These rules explain most of the library's behavior:

- **You declare each parameter's name and type.** Each path or query parameter is declared on its
  route, with a codec that converts between its text in the URL and a typed value. Reads, links,
  patches, and forms all use that codec, so they all agree that `?minRating=4` is the number 4.
- **A bad value doesn't break the page.** On `?minRating=abc`, `params()` returns the default and
  the library reports a warning.
- **A link contains only what you pass.** Nothing is copied from the current URL.
- **A form edit is a draft until the binding writes it.** Depending on the form's options, the
  binding writes it right away, after its debounce, or on submit, and only once its validators
  pass.
- **The page decides how query parameters affect each other.** Whether a new search clears the
  rating filter is code in the page, not a setting on the route.
- **Angular's router still matches URLs to routes.** Guards, resolvers, `routerLink`, and server
  rendering work as they do without ngx-urlik.

## Routes

A route is an Angular route with up to three more fields:

| Field         | What it's used for                                                                                  |
| ------------- | --------------------------------------------------------------------------------------------------- |
| `routeName`   | Declares the route's name and adds the route to `AppRouter.routes`                                  |
| `pathParams`  | Assigns the codec for a `:someParam` placeholder in the path. Without one, it's a string            |
| `queryParams` | Declares the route's query parameters and their codecs. The routes below it read and write them too |

Put every route in the one `defineAppRouter()` call, and write `path` and `routeName` as literals
there, because TypeScript infers each route's types from those literals. An array typed as Angular's
`Routes` compiles, but `AppRouter.routes` has no typed entries for it. Spreading one in, as in
`[...named, ...routes]`, also compiles, but TypeScript can't check those routes, so you see their
mistakes only when `defineAppRouter()` throws at startup.

That one file lists every URL in your app, with its parameters, guards, and page. Each page is in
its own file, so a route entry is a few lines.

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
      pathParams: { season: numberCodec() },
      component: SeasonPage,
    },
  ],
}
```

`AppRouter.routes` is flat, with one entry per named route. Each entry reads the path and query
parameters of every route above it, named or not, so `routes.SEASON.params().path` has both `showId`
and `season`. Because they share one `params()` value, a parameter name can appear only once in a
route and the routes above it. A path
parameter and a query parameter can share a name, because you read one from `path` and the other
from `query`.

`SHOW` and its empty-path child `SHOW_OVERVIEW` build the same URL, `/shows/tv_1`. Both are active
there.

A path parameter's codec also decides whether its route matches. `/shows/tv_1/seasons/2` matches
`SEASON`. `/shows/tv_1/seasons/abc` doesn't, because `numberCodec()` can't parse `abc`, so Angular
tries the next route. This check runs before the route's own `canMatch` guards.

### Lazy loading

Load pages lazily with `loadComponent`. A named route, and every route above it, can't use
`loadChildren`, because the route definitions have to be in the app's main bundle.

The reason is `routerLink`, which builds its `UrlTree` as soon as it renders. To build `/orders/4`,
it needs the path `orders/:orderId` and the codec that writes `4`, before anyone opens the orders
feature.

If a lazy module has `providers`, move them to the route above the feature's pages. Angular creates
a route's providers on the first visit, as it does for a lazy module. `loadComponent` needs a
standalone component, and `ng generate @angular/core:standalone` converts one for you. An NgModule
component still works in `component`, but then it's in the main bundle.

Don't call `Router.resetConfig()`. The route list is fixed after `defineAppRouter()` runs, so typed
routes would keep building URLs for routes Angular no longer has.

### Adopt it one feature at a time

You can convert features that are lazy NgModules one at a time, and the app works after every step.

**1. Pass your routes to `defineAppRouter()` without naming any.** Replace
`RouterModule.forRoot(routes)` or `provideRouter(routes)` with `provideAppRouter()`. Keep importing
`RouterModule` for `routerLink` and `<router-outlet>`. The app works exactly as before.

```ts
enum RouteNames {}

export const { AppRouter, provideAppRouter } = defineAppRouter(RouteNames, { routes });

@NgModule({ imports: [RouterModule], exports: [RouterModule], providers: [provideAppRouter()] })
export class AppRoutingModule {}
```

**2. Convert one feature.** Move its routes into the router file, and name the ones your code uses.
Load its pages with `loadComponent`, move its providers up one route, and delete its NgModule.
Features you haven't converted still use `loadChildren`.

**3. Update the pages when you get to them.** Pages that still inject `ActivatedRoute` work, because
`provideAppRouter()` calls Angular's `provideRouter()`. The [ESLint rule](#flag-direct-router-use)
lists the pages left to convert.

```ts
const order = inject(AppRouter).routes.ORDER;
const orderId = computed(() => order.params().path.orderId); // a number, not a string
```

## Codecs

A codec converts a parameter's text in the URL to a typed value and back:

```ts
interface UrlParamCodec<T> {
  serialize(value: T): string | null;
  deserialize(raw: string): T | null;
}
```

A codec returns `null` when it can't convert, and the library treats `undefined` the same way. So
`T` can't include `null` or `undefined`. The same codec works in a path, in the query, and inside a
list.

| Codec                        | Accepts                                                                          |
| ---------------------------- | -------------------------------------------------------------------------------- |
| `stringCodec()`              | Any string, including `''`                                                       |
| `numberCodec()`              | Any number except `NaN`, like `4.5` or `-3`                                      |
| `booleanCodec()`             | `true` or `false`                                                                |
| `enumCodec(values)`          | One value from an array, a record, or any enum. `Status.Archived = 1` writes `1` |
| `listCodec(item, separator)` | `item` values joined by `separator`, one character like `,`                      |

`enumCodec()` takes strings and finite numbers, so string, numeric, and mixed enums all work. It
skips the reverse entries TypeScript adds to numeric enums, and writes each value with `String()`.
It throws at creation if a value is anything else, or if two values write the same text, as in
`enumCodec([1, '1'])`. A record with numeric keys, like `{ '1': 'one', one: 1 }`, looks like a
numeric enum, so `enumCodec()` skips `'1'` as a reverse entry. Pass an array of its values instead.

In the query, the property name is the URL key. If a key repeats, the last one wins: on
`?minRating=1&minRating=4.5`, `params().query.minRating` is 4.5.

A path parameter can't be written as `''`, `.`, or `..`, because a path segment can't be empty, and
browsers remove `.` and `..` segments.

### Lists

```ts
tags: queryParam({ codec: listCodec(stringCodec(), ','), defaultValue: [] });
```

On `?tags=a,b`, `tags` is `['a', 'b']`. An empty list writes `?tags=`, which differs from a missing
key. That lets the user select no tags when the default isn't empty, as with
`defaultValue: ['new']`. Without a default, a missing key reads as `null`.

An item can contain the separator. `['red, green', 'blue']` writes `?tags=red%5C,%20green,blue`. The
backslash before the first comma marks it as part of the item, and a backslash in an item is escaped
the same way. An item can't be empty, so `['']` can't be written. The separator must be one
character other than a backslash, or `listCodec()` throws at creation, because a longer separator
could overlap with the end of the item before it.

### Write your own codec

Write a codec when a parameter has its own format. Your app writes the URL and parses it back, so a
codec only has to parse the text it writes.

A date range can be short when it covers whole days. This codec writes `2026-11-01..2026-11-15` for
1 to 15 November, and full timestamps for any other range:

```ts
type Period = { readonly start: Date; readonly end: Date };

const day = /^\d{4}-\d{2}-\d{2}$/;

const periodCodec: UrlParamCodec<Period> = {
  serialize: ({ start, end }) => {
    const [from, to] = [start.toISOString(), end.toISOString()];
    const fullDays = from.endsWith('T00:00:00.000Z') && to.endsWith('T23:59:59.999Z');
    return fullDays ? `${from.slice(0, 10)}..${to.slice(0, 10)}` : `${from}..${to}`;
  },
  deserialize: (raw) => {
    const [from, to] = raw.split('..');
    const days = day.test(from) && day.test(to);
    const start = new Date(days ? `${from}T00:00:00.000Z` : from);
    const end = new Date(days ? `${to}T23:59:59.999Z` : to);
    return Number.isNaN(start.getTime() + end.getTime()) ? null : { start, end };
  },
};

period: queryParam({ codec: periodCodec });
```

`2026-11-01..2026-11-15` parses as `2026-11-01T00:00:00.000Z` to `2026-11-15T23:59:59.999Z`. A range
from 9:30 to 17:00 on 1 November writes `2026-11-01T09:30:00.000Z..2026-11-01T17:00:00.000Z`. Both
ends are in UTC.

A codec can also write a format your API already uses. Say the API takes paging as one value, the
page number and the page size, like `3,24`:

```ts
type Paging = { readonly pageNumber: number; readonly pageSize: number };

const pagingCodec: UrlParamCodec<Paging> = {
  serialize: ({ pageNumber, pageSize }) => `${pageNumber},${pageSize}`,
  deserialize: (raw) => {
    const parts = /^(\d+),(\d+)$/.exec(raw);
    return parts ? { pageNumber: Number(parts[1]), pageSize: Number(parts[2]) } : null;
  },
};

paging: queryParam({ codec: pagingCodec });
```

The URL is `?paging=3,24`, and `pagingCodec.serialize()` writes the same text into the API request.
The API response contains the total number of items, so the URL doesn't need it.

Every codec follows three rules:

- **One text per value.** A value always writes the same text, because the library compares that
  text to tell whether a value changed.
- **Lose nothing.** `deserialize(serialize(value))` returns a value equal to the one you wrote.
- **Same input, same output.** A codec reads nothing but its argument and changes nothing else.
  Don't call `inject()` in one, because codecs often run outside an injection context.

Return `null` for a value you can't write or text you can't parse. What happens next depends on the
parameter. A query parameter is left out of the link, or reads as its default. A path parameter
makes the link throw, or the route not match.

### Defaults and required query parameters

A default does two things. With `defaultValue: 0`, `params().query.minRating` is 0 on `/results`.
And writing 0 removes `minRating` from the URL, because the library removes a query parameter
whenever its codec writes the same text as its default. Every declared query parameter is always in
`params().query`, and one without a default reads as `null` when it's missing.

A default is a plain value, so `/results` renders the same page for everyone. If a fallback needs a
service, like the user's locale, put it in the page:

```ts
// In the route: locale: queryParam({ codec: stringCodec() })
const locale = computed(() => results.params().query.locale ?? settings.locale());
```

`required: true` makes TypeScript require the query parameter whenever you build a link, but a URL
can still lack it. To pass "no value" for a query parameter without a default, pass `null`. A query
parameter with a default doesn't accept `null`, so pass the default, which removes it from the URL.

## Build links

```ts
const season = inject(AppRouter).routes.SEASON;
const link = season.createUrlTree({ path: { showId: 'tv_1', season: 2 }, fragment: 'episodes' });
await season.navigate({ path: { showId: 'tv_1', season: 2 } }, { replaceUrl: true });
```

`link` is `/shows/tv_1/seasons/2#episodes`. Pass it to `routerLink`, and `routerLinkActive` works
with it too.

A link contains exactly what you pass. It never copies the current query, whatever Angular's
`defaultQueryParamsHandling` says. So you pass every path parameter, including those of parent
routes. Query parameters are optional unless they're `required`, and one passed as `undefined` is
left out. Parent query parameters come first, in declaration order. Links are always absolute.

`navigate()` takes the parameters first and the options of Angular's `navigateByUrl()` second, like
`replaceUrl`, `state`, and `skipLocationChange`. So a route with no parameters to pass still needs
the first argument: `navigate({}, { replaceUrl: true })`. Every one of those options works except
`browserUrl`, which could put a URL in the address bar that the route didn't build, so passing it is
a type error. The options that build a link in Angular's `navigate()`, like `queryParamsHandling`
and `relativeTo`, don't exist here, because the link contains exactly what you pass.

A query parameter whose value can't be written is left out of the link, with a warning, and the rest
of the link is still built. A path parameter has no fallback. If `showId` is `''`, `createUrlTree()`
throws and `navigate()` rejects. The same happens when a path codec throws or returns `null`, `.`,
or `..`. Check IDs from data before you build links with them.

To copy the current query parameters into a link, spread them in. On
`/results?search=oak&minRating=2`, this "Top rated only" link is `/results?search=oak&minRating=4`:

```ts
const topRated = computed(() =>
  results.createUrlTree({ query: { ...results.params().query, minRating: 4 } }),
);
```

For a link to a section of the current page, use Angular's own form:

```html
<a [routerLink]="[]" fragment="credits" queryParamsHandling="preserve">Credits</a>
```

## Read the URL

Every named route has a `params` signal that returns `{ path, query }`: its path and query
parameters, including those of the routes above it. It returns the new URL's values before Angular
creates the new page, so a page's constructor already reads its own URL. Calling `params()` on an
inactive route throws.

`params()` returns a new value for a parameter only when its text in the URL changes. Otherwise it
returns the same value as before. Go from `?sort=title:asc&minRating=1` to
`?sort=title:asc&minRating=4.5`, and `sort` is `===` the object you read before. A `computed()` that
reads only `sort` returns the same value, so nothing that depends on it reruns. Every caller gets
the same objects, so don't mutate them.

You can set a fragment in a link, as a string or `null`, with no codec. `params()` doesn't include
it, and no typed route reads it. To read it once, parse the URL through the escape hatch:
`escapeHatch.parseUrl(escapeHatch.url).fragment`. That value isn't a signal, so a `computed()`
around it doesn't rerun when the fragment changes.

### In guards and resolvers

A guard runs before the URL changes, so `params()` still returns the values of the page the user is
leaving. Read the destination from the snapshot Angular passes in:

```ts
export const seasonResolver: ResolveFn<Season> = (route) => {
  const appRouter = inject(AppRouter);
  const { path } = appRouter.paramsSnapshot(appRouter.routes.SEASON, route);
  return inject(SeasonApi).load(path.showId, path.season);
};
```

Any snapshot from the same navigation works, so a child's guard can read its parent's path and query
parameters. `paramsSnapshot()` throws if the snapshot doesn't contain the route.

### One page on several routes

Say one detail page renders both movies and episodes. Call `ifActive()` on a route, and read the
parameters from the route it returns:

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

`ifActive()` returns the route while it, or one of its children, is active, and `null` otherwise.
You read from the route it returns, so you can't check one route and read another by mistake. On a
page with no named route, like a `**` fallback, every route's `ifActive()` returns `null`. The
example reads `MOVIE` without calling `ifActive()`, so it throws if the page ever renders on a third
route.

In a template:

```html
@if (routes.EPISODE.ifActive(); as episode) {
<p>Episode {{ episode.params().path.episodeId }}</p>
}
```

A parent is active while one of its children is, so check nested routes deepest first. The same rule
decides which navigation link to highlight. With `BROWSE` above the movie and TV routes, this link
is active at `/movies`, `/tv`, and `/tv/brambleworth-manor/s/2`:

```html
<a [routerLink]="browseUrl" [class.active]="appRouter.routes.BROWSE.ifActive()">Browse</a>
```

Pass path and query parameters to check them too. Say a list of saved searches greys out the active
one. On `/results?search=oak&minRating=4`, `RESULTS.ifActive({ query: { search: 'oak' } })` returns
`RESULTS`, and `{ search: 'elm' }` returns `null`:

```html
@for (saved of savedSearches; track saved.name) {
<a
  [routerLink]="results.createUrlTree(saved.values)"
  [class.current]="results.ifActive(saved.values)"
>
  {{ saved.name }}
</a>
}
```

`saved.values` is `{ query: { search: 'oak' } }`, the same parameters the link is built from.

Only the parameters you pass count:

- An omitted parameter matches any value, so `{ search: 'oak' }` matches any rating.
- Query parameters the route doesn't declare never count.
- A default is a value like any other, so `{ search: '' }` matches only an empty search.
- `ifActive()` compares each value's text in the URL. So a list matches item by item, and an old
  link that writes out a default still matches.
- A value its codec can't write never matches, and the library reports a warning.

So the check and the link can disagree on an omitted query parameter: the link writes its default,
and the check accepts any value.

`ifActive()` is a function that reads signals, so templates and `computed()` track it. Without
parameters, a `computed()` around it reruns only when its result changes. With parameters, it also
reads `params()`, so a `computed()` around it reruns on every change to the route's path or query
parameters. Code that needs a signal object, like `toObservable()`, wraps it:
`computed(() => RESULTS.ifActive())`.

Put a query parameter that several routes share on their parent. If `BROWSE` declares `search`,
`BROWSE.params()` and `BROWSE.patchQuery()` work on every page under it.

### Parameters on every page

Some code needs a path or query parameter on any page, like a service that reads a campaign tag from
`?source=`, or the workspace ID from `/w/:workspaceId/...`. `globalParams()` reads both:

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

`globalParams()` reads a path parameter from the active route with that placeholder, named or not.
It returns `null` when no active route has the placeholder, or its codec can't parse the value.
Query parameters work as on routes, except that `required` has no effect. Before the first
navigation finishes, `globalParams()` reads the current snapshot.

`globalParams()` only reads. It never throws, needs no cleanup, and works outside an injection
context. Two services that read one name with different codecs can return different values, so share
the definitions between them. In a guard, call `globalParamsSnapshot(definitions, route)`, which
also works on routes without a name. Warnings from either function use the function's name as their
route.

### Remember values yourself

ngx-urlik doesn't save path or query parameters between visits, but your app can, with
`globalParams()`. TasteTrack's `preferences.ts` saves the page size and each show's last season this
way.

A path parameter is always in the URL, so save it whenever it changes:

```ts
const current = appRouter.globalParams({ path: { workspaceId: stringCodec() } });
effect(() => {
  const { workspaceId } = current().path;
  if (workspaceId) {
    localStorage.setItem('lastWorkspace', workspaceId);
  }
});
```

A query parameter you want to remember shouldn't have a default, because the library removes a
query parameter at its default from the URL. With `defaultValue: 'grid'`, `/movies` could mean
"picked the grid view" or "never picked one". Without a default, the key is in the URL only when
someone set it. Save it the same way, and fall back to the saved value where the page reads the
query parameter:

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

Keep the `UrlTree` return type. The redirect is inside the `defineAppRouter()` call that creates
`AppRouter`, so without the annotation, TypeScript can't infer the type of either one.

## Write the query

`patchQuery()` changes the query parameters you pass and leaves the rest of the URL unchanged. Start
on `/results?sort=new&search=oak&minRating=4`, where the route doesn't declare `sort`:

```ts
await results.patchQuery({ search: 'elm', minRating: 0 });
// /results?sort=new&search=elm
```

`minRating` is back at its default, so `patchQuery()` removed it from the URL. `sort` is still
there, because a patch doesn't change keys the route doesn't declare. The query parameters you left
out, the path, and the fragment don't change either. Neither does a query parameter passed as
`undefined`, or one declared by a child route. To clear a query parameter, set it to its default or
to `null`. A value its codec can't write also removes the query parameter from the URL, with a
warning. `patchQuery()` takes the same options as `navigate()`, like `replaceUrl` and `state`.

Patches add up. A patch made while another is running starts from that patch's destination, and the
later patch wins on a query parameter both set:

```ts
void results.patchQuery({ search: 'elm' });
void results.patchQuery({ minRating: 4.5 }); // the URL gets search=elm and minRating=4.5
```

Each patch is one Angular navigation, so the second cancels the first. The second navigation
includes the first patch's query parameters, so the first patch's promise resolves with the second
one's result. If a guard declines the second, both resolve `false`. If either patch adds a history
entry, the second navigation adds one, so the first patch's entry isn't lost. The navigation uses
the second patch's other options, like `state`. A patch that ends at the URL a running patch is
already navigating to resolves with that patch's result, and doesn't change its options. A patch
that wouldn't change the URL resolves `true` without navigating.

A patch cancels only other patches. While a link click, a `navigate()` call, or Back is running, a
patch resolves `false` and doesn't navigate. Forms are the reason. A form writes when its debounce
ends, and by then the user may have clicked a link to a page that's still loading. If the write
cancelled that click, the user would be stuck on the page they tried to leave.

| What happened                                              | The promise      |
| ---------------------------------------------------------- | ---------------- |
| It worked, or the URL already matched                      | Resolves `true`  |
| A guard said no                                            | Resolves `false` |
| A link, `navigate()`, or Back cancelled it, or was running | Resolves `false` |
| The route wasn't active, or Angular threw                  | Rejects          |

## Bind a form

A binding sets each form field to its query parameter's value, and writes the user's edits to the
URL. It works with Reactive Forms and Signal Forms, and binds only query parameters, not path
parameters.

```ts
import { createQueryParamsFormGroup } from 'ngx-urlik/forms';

const { form } = createQueryParamsFormGroup(results);
form.patchValue({ search: 'elm', minRating: 0 });
```

`createQueryParamsFormGroup()` returns a `FormGroup` with one non-nullable `FormControl` per query
parameter and no validators. Forms are flat: a list parameter gets an array-valued control, and
nested groups and `FormArray` aren't supported. Each control resets to its query parameter's
default, or to `null` without one, so `form.reset()` clears every filter. For validators, build the
group yourself, put them on the controls, and call
`bindQueryParamsToFormGroup(results, group, options)`. A group you build resets to the values its
controls were created with.

```ts
import { createQueryParamsSignalForm } from 'ngx-urlik/forms';

const { model, form } = createQueryParamsSignalForm(results);
model.update((query) => ({ ...query, search: 'elm' }));
```

`createQueryParamsSignalForm()` returns a writable model and a `FieldTree`. To bind a Signal Form
you built yourself, call `bindQueryParamsToSignalForm(results, form, options)`.

All four functions also return `write()`, which does what submitting the form does, for submitting
from code. See [Write only when the user submits](#write-only-when-the-user-submits).

Create a form in an injection context while its route is active. The binding stops when that context
is destroyed, which drops unwritten edits and cancels their debounce timers. A navigation that
already started still runs. If the route becomes inactive first, the binding doesn't change the
form's values, and reports the next edit as an error, because there's no active route to write to.

A bound form works like this:

- `form.patchValue({ search: 'elm', minRating: 0 })` is one navigation, not two.
- A write replaces the current history entry, so typing `elm` doesn't add three entries for Back.
- The binding sets a field only when its query parameter changes, so changing the rating doesn't
  wipe a half-typed search.
- Each write includes every field whose value differs from its query parameter. If a link click
  cancels one write, the next write includes what the user typed.
- The binding writes a field only once its validators pass, and a field without validators always
  passes. See [Skip a too-short search](#skip-a-too-short-search).
- A write is a patch, so it adds up with the form's other writes and with `patchQuery()` calls.
- Setting a field from a query parameter never marks it touched or dirty.
- After a write succeeds, a field takes the URL's value if its value differs from the URL and both
  its model and form draft still match the written value. This happens when `beforeWrite` changes a
  field or sets it to `undefined`, when the codec can't write the value, or when a defaulted field
  is set to `null`. Clearing a number input with a default restores the default right away, so add a
  `debounce` if users clear the input before typing a new number.
- The binding writes values exactly as typed. If a request needs a trimmed search, trim it where you
  build the request.

| Option           | Default    | What it does                                                                                                    |
| ---------------- | ---------- | --------------------------------------------------------------------------------------------------------------- |
| `replaceUrl`     | `true`     | Whether each write replaces the current history entry                                                           |
| `writeOn`        | `'change'` | `'change'` writes each edit. `'submit'` writes every edit when the form is submitted without errors             |
| `beforeWrite`    | none       | Changes a write right before it navigates                                                                       |
| `onWriteFailure` | none       | Called when a guard declines a write or a write throws. Without it, the binding passes errors to `ErrorHandler` |
| `debounce`       | none       | Reactive Forms only. Milliseconds to wait after the last keystroke, per field                                   |
| `schema`         | none       | Signal Forms only. Validators and `debounce()` rules                                                            |

### Debounce a search

```ts
import { debounce, minLength } from '@angular/forms/signals';

// Signal Forms
createQueryParamsSignalForm(results, { schema: (fields) => debounce(fields.search, 300) });

// Reactive Forms
createQueryParamsFormGroup(results, { debounce: { search: 300 } });
```

The user types `elm` and stops, and 300 ms later the binding writes the search. It writes other
fields at once. If the user presses Back to `?search=oak` while `elm` is waiting, the binding sets
the input to `oak` and drops `elm`. A navigation that changes only other query parameters doesn't
cancel the wait. When the delay ends, the binding writes `elm` into the URL as it is at that moment.
Leaving the page drops `elm`.

Only typing waits. A value your code sets, like `form.patchValue({ search: 'elm' })` or a
`model.update()`, is written at once and replaces typing that's still waiting. Submitting ends the
wait too, so typing `elm` and pressing Enter writes it at once. That works for a
`<form [formGroup]>`, and for a Signal Form passed to Angular's `submit()`.

### Skip a too-short search

The binding writes a field only once its validators pass, so a minimum length is enough:

```ts
createQueryParamsSignalForm(results, { schema: (fields) => minLength(fields.search, 3) });
```

Typing `el` doesn't change the URL, and typing `elm` writes it. Clearing the box writes an empty
search, because Angular's length validators accept an empty value. Each field checks only its own
validators, so an invalid search doesn't stop the binding from writing a rating change. The binding
doesn't change an invalid field, even when a navigation changes its query parameter, until the user
edits it or the form is destroyed. A field waiting on an async validator is written once it passes.

### Write only when the user submits

When every URL change starts a request, you may want the search to run only when the user presses
Search. Pass `writeOn: 'submit'`:

```ts
// Reactive Forms, in a <form [formGroup]>
createQueryParamsFormGroup(results, { writeOn: 'submit' });

// Signal Forms, in a <form [formRoot]>
createQueryParamsSignalForm(results, { writeOn: 'submit' });
```

The form still changes on every keystroke, so the rest of the page can react. For example, switching
"search by" to ID can disable an "exact match" checkbox at once. The binding writes nothing until
the submit, including values your code sets, and then writes every edited field in one navigation.
If the form has errors, the URL doesn't change, and the edits remain in the form. A pending async
validator doesn't count as an error, as in Angular's `submit()`. If a field's query parameter
changes first, say after Back, the binding sets the field to the new value and drops its edit. The
other edits remain.

A `<form [formGroup]>` submits a Reactive form, and Angular reports the submit only to the group
passed to `<form [formGroup]>`, so bind that group. If you bind a group nested inside it, call
`write()` from `(ngSubmit)`. `createQueryParamsSignalForm()` makes the write the Signal Form's
submit action, so a `<form [formRoot]>` or a call to Angular's `submit()` writes it.

For a Signal Form you built yourself, make the binding's `write` the form's submit action. The form
and the binding refer to each other, so the binding needs a type annotation:

```ts
readonly filters = form(this.model, { submission: { action: () => this.binding.write() } });
readonly binding: QueryParamsBinding = bindQueryParamsToSignalForm(results, this.filters, {
  writeOn: 'submit',
});
```

To submit from code, like from a Search button outside the form, call `write()`. It does what a
submit by the user does, in both form systems:

- It writes typing still waiting for its debounce.
- With `'change'`, it writes each field whose validators pass, even while other fields have errors.
- With `'submit'`, it writes nothing while the form has errors.

A field that isn't written remains a draft, and the next write includes it. A pending async
validator doesn't count as an error. `write()` resolves once the form's newest write finishes, even
one that was already running.

Inside Angular's `submit()`, the Signal Form's submission options, like `ignoreValidators`, decide
whether errors stop the write. There, `write()` resolves as soon as the write starts, because
Angular ignores a submit while the last one runs. Resolving early lets a second Enter, pressed while
a slow page loads, still write the new search. It also means `submitting()` doesn't tell you whether
the URL is being written.

### Clear the rating filter on a new search

The route can't know this rule, so the page sets it in `beforeWrite`:

```ts
createQueryParamsFormGroup(results, {
  debounce: { search: 300 },
  beforeWrite: (patch) => ('search' in patch ? { minRating: 0, ...patch } : patch),
});
```

On `/results?minRating=4`, typing `elm` makes one navigation, to `/results?search=elm`. Without a
form, put both query parameters in one patch: `patchQuery({ search, minRating: 0 })`.

`beforeWrite(patch, draft)` runs right before the navigation, after any debounce, and only with
fields whose validators pass. `patch` contains the query parameters about to be written, and `draft`
contains the value of every field in the form. The binding writes what you return. A query parameter
you set to `undefined` is left out of the write. Use `beforeWrite` to change other query parameters,
not the value the user typed.

The query parameters `beforeWrite` adds aren't drafts, so after the write the binding sets their
fields from the URL. An edit that ends at its query parameter's current value doesn't navigate, so
`beforeWrite` doesn't run for it. If `beforeWrite` throws, the binding passes the error to
`ErrorHandler`, the URL doesn't change, and the drafts remain.

### When a write fails

A guard can decline a write, or the write can throw. Either way, the binding doesn't change what the
user typed until that field's query parameter changes in the URL. Nothing retries automatically, but
the form's next write includes the field again. `onWriteFailure` receives `{ kind: 'declined' }` or
`{ kind: 'error', error }`. Without it, declines are silent.

Picking the value that's already chosen doesn't write, so it's never a decline. A write cancelled by
the form's own next write isn't reported either, because the next write reports its own result.

### Test a bound form

A debounce runs on a timer, so a test that sleeps or polls passes or fails depending on how busy the
machine is. Run the test on Vitest's fake clock and move it by the exact delay:

```ts
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

// Moves the fake clock, runs effects, and lets the navigations they start finish.
const elapse = async (ms = 0) => {
  await vi.advanceTimersByTimeAsync(ms);
  TestBed.tick();
  await vi.advanceTimersByTimeAsync(0);
};

it('writes the search 300 ms after the last keystroke', async () => {
  const { form } = TestBed.runInInjectionContext(() =>
    createQueryParamsFormGroup(results, { debounce: { search: 300 } }),
  );

  form.controls.search.setValue('elm', { emitModelToViewChange: false });
  await elapse(299);
  expect(router.url).toBe('/results');
  await elapse(1);
  expect(router.url).toBe('/results?search=elm');
});
```

The binding reads the URL, and a Signal Form's edits, in effects. On the fake clock, Angular doesn't
run those effects by itself, so `elapse()` calls `TestBed.tick()`.

Only typing waits for the debounce, and in a test, `setValue('elm')` counts as code, so the binding
writes it at once. To type, pass `{ emitModelToViewChange: false }` as above, which is how Angular's
input directives set a value, or dispatch an `input` event on the bound input. In a Signal Form, set
`form.search().controlValue`, which is what `[formField]` sets on each keystroke.

## Diagnostics and errors

When a codec can't parse a query parameter, `params()` returns its default and the library reports a
warning. On `/results?minRating=abc`, `minRating` is 0, and the warning is:

```ts
{
  code: 'PARAM_DESERIALIZE_FAILED',
  route: 'RESULTS',
  parameter: 'minRating',
  operation: 'deserialize',
  message: '…',
}
```

When a codec can't write a value, the code is `PARAM_SERIALIZE_FAILED`. If the codec threw, its
error is in `cause`. By default, the library passes each warning's `message` to `console.warn`. To
receive the whole object, pass `diagnostics: { warn }` to `defineAppRouter()`.

A warning's `route` is the route that declares the parameter, which can be a parent. A route without
a name appears by its position, like `routes[0].children[1]`.

Two things throw instead, because there's no fallback: reading an inactive route, and building a
link with a path parameter whose value can't be written.

`defineAppRouter()` checks routes at startup: every named route, every route above one, and every
route with `pathParams` or `queryParams`. It throws one error that lists every problem:

- A route name that's empty or used twice.
- A `routeName` that isn't in your enum, or an enum member that no route uses.
- A name on a redirect, a wildcard, or a matcher.
- `loadChildren` on a named route, or on a route above one.
- A path that isn't a plain string in the primary outlet, or that has an empty segment or a reserved
  character. This also applies to every route above a named route.
- A `pathParams` key that isn't a placeholder in the path, or a `pathParams` value that isn't a
  codec.
- A `queryParams` value that `queryParam()` didn't make.
- `queryParams` on a route with no named route at or below it, because nothing could read them.
- A placeholder or a query key declared twice in a route and its parents.
- A route that isn't an object, or `children` that isn't an array.

TypeScript catches many of these before the app runs, and Angular still runs its own route checks.

## Work with Angular Router

`provideAppRouter(...features)` passes Angular's router features to `provideRouter()`, like
`withRouterConfig({ paramsInheritanceStrategy: 'always' })`. Typed routes read their parents' path
and query parameters themselves, so any `paramsInheritanceStrategy` works. Angular still matches the
URL to a route, so route order matters as always.

Server rendering works, and `params()` returns the requested URL's values. Code that touches
`localStorage` needs a browser check there.

### Escape hatch

For a URL outside your typed routes, use `AppRouter.escapeHatch`. It exposes Angular's own
`createUrlTree`, `navigate`, `navigateByUrl`, `parseUrl`, `serializeUrl`, and `isActive`, and the
read-only `url`, `events`, `navigated`, `currentNavigation`, `lastSuccessfulNavigation`, and
`componentInputBindingEnabled`. Its `isActive(url, matchOptions?)` returns a `Signal<boolean>`. It
doesn't expose `routerState`, `config`, `resetConfig()`, `initialNavigation()`,
`setUpLocationChangeListener()`, `dispose()`, or the deprecated settable properties
`onSameUrlNavigation` and `routeReuseStrategy`.

You can still inject Angular's `Router`, but nothing you do through it is checked against your
routes.

### Flag direct router use

ESLint's `no-restricted-imports` rule can warn on every import of `Router` or `ActivatedRoute`:

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

The rule allows `RouterLink`, `RouterOutlet`, `ResolveFn`, and `ActivatedRouteSnapshot`. When you
mean to use `Router` or `ActivatedRoute`, keep the import and add an `eslint-disable-next-line`
comment that says why.

## Types

The helper types take the type of a route. Inside a component, that's `typeof results`. Anywhere
else, `RoutesOf<typeof AppRouter>` returns the type of the routes:

```ts
type ResultsQuery = QueryParamsOf<typeof results>; // { search: string; minRating: number }

type Routes = RoutesOf<typeof AppRouter>;
type SameQuery = QueryParamsOf<Routes['RESULTS']>;
```

| Type                      | What it is                                     |
| ------------------------- | ---------------------------------------------- |
| `RoutesOf<Token>`         | The type of `AppRouter.routes`, from the token |
| `PathParamsOf<Node>`      | A route's path parameters, with its parents'   |
| `QueryParamsOf<Node>`     | A route's query parameters, with its parents'  |
| `ParamsOf<Node>`          | What `params()` returns: `{ path, query }`     |
| `QueryPatchOf<Node>`      | What `patchQuery()` accepts                    |
| `RouteNode<P, Q, R>`      | A typed route                                  |
| `TypedAppRouter`          | The value of the `AppRouter` token             |
| `RouteDefinition`         | One route: Angular's fields plus ours          |
| `RouteDefinitions`        | A route array                                  |
| `UrlParamCodec<T>`        | A codec                                        |
| `AppRouterDiagnostic`     | A warning passed to `diagnostics.warn`         |
| `AppRouterDiagnosticCode` | `diagnostic.code`                              |
| `AppRouterDiagnostics`    | The `diagnostics` option: `{ warn }`           |

`ngx-urlik/forms` exports the option types, `QueryParamsBinding`, `QueryParamsFormControls`, and
`QueryWriteFailure`.

## Not supported

| Not supported                                                            | Instead                                                   |
| ------------------------------------------------------------------------ | --------------------------------------------------------- |
| Angular versions outside `^22.2.6`                                       | Use Angular 22.2.6 or a later 22.x release                |
| A named route on or under a redirect, wildcard, matcher, or named outlet | Give named routes, and the routes above them, plain paths |
| Route arrays split across files                                          | One literal array in `defineAppRouter()`                  |
| Named routes inside `loadChildren`                                       | Keep definitions in the router file. Lazy-load pages      |
| Query property names that differ from URL keys                           | The property name is the URL key                          |
| Built-in date or object codecs                                           | Write your own codec                                      |
| Writing global parameters                                                | Write them through a route                                |
| Reading the fragment as a signal                                         | Parse `escapeHatch.url` once                              |
| Typed relative navigation                                                | Use the escape hatch                                      |
| Remembering values across visits                                         | [Remember values yourself](#remember-values-yourself)     |

## TasteTrack demo

The [demo app](https://github.com/tsopeh/ngx-urlik/tree/master/projects/demo-app) is a small movie
and TV journal built with ngx-urlik. Try it at <https://tsopeh.github.io/ngx-urlik>, or run `npm ci`
and `npm start` from the repo root.

Change the movie genres, the sort, and the page size, then reload. The page shows the same filters,
because they're in the URL. Then open Brambleworth Manor, season 2, episode 1. The URL is
`/tv/brambleworth-manor/s/2/e/1`, while the show's ID is `tv_brambleworth-manor`, because its codec
removes the `tv_` prefix when it writes and adds it back when it parses.

| Page                    | Shows                                                           |
| ----------------------- | --------------------------------------------------------------- |
| Movie and TV browsing   | Query parameters on a parent, a genre list, sorting, pagination |
| Show → season → episode | Inherited path parameters, custom codecs                        |
| Detail pages            | One page on several routes, fragments                           |
| Library                 | Signal Forms with validation                                    |
| Viewing history         | Reactive Forms with a debounced, validated search               |

## Develop

```sh
npm ci
npm run build          # library, then demo
npm test               # unit tests for both
npm run typecheck      # builds the library, then public type tests and a 201-route app
npm run e2e            # Playwright against the demo
npm run release:check  # clean, then format check, lint, build, every test suite, and pack
npm run release        # on a clean tree: npm ci, run release:check, then publish to npm
```

[Design decisions](https://github.com/tsopeh/ngx-urlik/blob/master/docs/decisions.md) explains why
the library works this way, and what each choice costs.
[Reading the code](https://github.com/tsopeh/ngx-urlik/blob/master/docs/implementation.md) says
where each part of the code is.

## Why the howling mouse

"URL Is King" shortens to _urlik_, which means "howl" in Serbian. The mouse comes from
[this legendary video](https://www.youtube.com/watch?v=Bkq1PAyGuZY).

## License

[MIT](https://github.com/tsopeh/ngx-urlik/blob/master/LICENSE)
