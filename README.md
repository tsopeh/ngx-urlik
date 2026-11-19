<h1 align="center">ngx-urlik — URL Is King</h1>

<p align="center">
  <img src="docs/banner.gif" alt="A howling mouse with the Angular logo on its body" width="480">
</p>

<p align="center">
  <em>ngx-urlik makes Angular routing type-safe, from the route definitions to the path and query
  parameters to every link between pages.</em>
</p>

Angular's router gives you every path and query parameter as a string, or nothing when it's
missing, and accepts any link. So each page parses its own numbers and lists, picks its own
defaults, and handles text it can't parse. A misspelled parameter name reads as missing, with no
error. ngx-urlik declares each path and query parameter once, on its route, with a codec and a
default. Pages read typed values, and TypeScript checks every read and every link against the
declarations. That makes it practical to keep a page's filters, sort order, and selection in query
parameters, where a reload, a shared link, or Back restores them.

## Get started

```ts
// 1. Install ngx-urlik. It needs Angular 22.1 or a later 22.x release.
//
//      npm install ngx-urlik
//
// 2. Declare your routes in one file. They're ordinary Angular routes, plus a name for each route
//    your code uses and a codec for each path and query parameter. TypeScript checks every read,
//    link, and navigation against them. A misspelled parameter, or a string where a number
//    belongs, won't compile.

// app-router.ts
import { defineAppRouter, numberCodec, queryParam, stringCodec } from 'ngx-urlik';

// The names come from an enum, so Go to Definition, Find References, and Rename work on
// routes.RESULTS. Keep the enum in this file. Pages get their routes from AppRouter.
enum RouteNames {
  RESULTS = 'RESULTS',
  MOVIE = 'MOVIE',
}

export const { AppRouter, provideAppRouter } = defineAppRouter(RouteNames, {
  routes: [
    {
      // A search page that keeps its filters in the query.
      path: 'results',
      routeName: RouteNames.RESULTS,
      queryParams: {
        search: queryParam({ codec: stringCodec(), defaultValue: '' }),
        minRating: queryParam({ codec: numberCodec(), defaultValue: 0 }),
      },
      loadComponent: () => import('./results-page').then((m) => m.ResultsPage),
    },
    {
      // A page for each movie, with its ID in the path.
      path: 'movies/:movieId',
      routeName: RouteNames.MOVIE,
      pathParams: { movieId: numberCodec() },
      loadComponent: () => import('./movie-page').then((m) => m.MoviePage),
    },
  ],
});

// 3. Call provideAppRouter() where you'd call provideRouter(). Angular's router still runs
//    underneath, so guards, resolvers, and routerLink work unchanged.

// main.ts
bootstrapApplication(App, { providers: [provideAppRouter()] });

// 4. The search page keeps its filters in a form, loads the movies the URL asks for, and links
//    each result to its own page.

// results-page.ts
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
  // Use AppRouter instead of ActivatedRoute and Router. Those give you strings and accept any
  // link, so TypeScript can't catch mistakes.
  readonly #routes = inject(AppRouter).routes;

  // One control per query parameter, synced with the URL. Open /results?search=oak&minRating=4 and
  // the form shows oak and 4. Type elm, and 300 ms after the last keystroke the URL reads
  // /results?search=elm&minRating=4. Typing replaces the current history entry, so Back doesn't
  // replay every search. Come back from a movie and the form still shows elm and 4.
  readonly filters = createQueryParamsFormGroup(this.#routes.RESULTS, {
    debounce: { search: 300 },
  }).form;

  // params().query is { search: 'elm', minRating: 4 }. The rating is already a number. It's a
  // signal, so the request reruns whenever the query changes.
  readonly movies = httpResource<Movie[]>(
    () => ({ url: '/api/movies', params: this.#routes.RESULTS.params().query }),
    { defaultValue: [] },
  );

  // Builds /movies/7. movieId must be a number, so a string won't compile.
  linkTo(movie: Movie) {
    return this.#routes.MOVIE.createUrlTree({ path: { movieId: movie.id } });
  }
}

// 5. The movie page reads its ID from the path, loads that movie, and opens a search for similar
//    movies.

// movie-page.ts
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

  // On /movies/7 this is the number 7. /movies/abc doesn't match this route, because
  // numberCodec() can't read abc, so the page never gets an ID it can't use.
  readonly movieId = computed(() => this.#routes.MOVIE.params().path.movieId);

  // Angular reuses this page from /movies/7 to /movies/8. movieId() follows the URL, so the movie
  // reloads.
  readonly movie = httpResource<Movie>(() => `/api/movies/${this.movieId()}`);

  // Opens /results?search=Comedy&minRating=4. A misspelled query parameter, or a rating passed as
  // a string, won't compile.
  findSimilar() {
    const movie = this.movie.value();
    if (movie) {
      return this.#routes.RESULTS.navigate({
        query: { search: movie.genre, minRating: movie.rating },
      });
    }
  }
}

// 6. To change the query from code, call patchQuery(). The rest of this README calls the search
//    route results. A rating set back to its default, 0, leaves the URL.
const results = inject(AppRouter).routes.RESULTS;
await results.patchQuery({ minRating: 0 }); // /results?search=elm
```

Moving an existing app? You can
[switch one feature at a time](#adopt-it-one-feature-at-a-time).
[An ESLint rule](#flag-direct-router-use) flags the code that still uses `ActivatedRoute` or
`Router`.

### Coding agents

The package ships a skill that teaches coding agents to use ngx-urlik. Agents don't find it on their
own, so point to it from your `AGENTS.md` or `CLAUDE.md`:

```md
This app declares its routes, and their path and query parameters, with ngx-urlik's AppRouter.
Before you change routes, links, guards, resolvers, code that reads or writes path or query
parameters, forms bound to query parameters, or code that uses ActivatedRoute or Router, read
node_modules/ngx-urlik/skills/ngx-urlik/SKILL.md and follow it.
```

In Claude Code, you can link the skill into `.claude/skills` instead of adding the pointer. Claude
Code loads skills from that folder, and the link follows your installed version:

```sh
mkdir -p .claude/skills
ln -s ../../node_modules/ngx-urlik/skills/ngx-urlik .claude/skills/ngx-urlik
```

## Ground rules

Most of the library's behavior follows from six rules:

- **You declare each parameter once.** A path or query parameter lives on its route, with a codec
  that converts its text in the URL to a typed value and back. Reads, links, patches, and forms all
  use that codec. So they agree on what `?minRating=4` means.
- **A bad value doesn't break the page.** `?minRating=abc` reads as the default, with a warning.
- **A link contains only what you pass.** Nothing is copied from the current URL.
- **A form keeps drafts, and query parameters keep what's been written.** A draft is an edit the
  binding hasn't written yet. Depending on the form's options, it's written right away, after its
  debounce, or on submit, and only once its validators pass.
- **The page decides how query parameters affect each other.** Whether a new search clears the
  rating filter is the page's decision, not the route's.
- **Angular still routes.** Matching, guards, resolvers, `routerLink`, and server rendering work as
  they do without ngx-urlik.

## Routes

A route is an Angular route with up to three more fields:

| Field         | What it does                                                                      |
| ------------- | --------------------------------------------------------------------------------- |
| `routeName`   | Adds the route to `AppRouter.routes`                                              |
| `pathParams`  | Gives a codec to a `:placeholder` in the path. Without one, the value is a string |
| `queryParams` | Declares the query parameters the route owns. The routes below it get them too    |

Put every route in the one `defineAppRouter()` call. Write `path` and `routeName` as literals there,
because that's where TypeScript reads them. An array typed as Angular's `Routes` compiles, but gives
no typed routes. Spreading one in, as in `[...named, ...routes]`, also compiles. But TypeScript
can't check those routes, so you see their mistakes only when `defineAppRouter()` throws at startup.

The file shows every URL in your app, with its parameters, guards, and page. Each page lives in its
own file, so a route entry is a few lines.

Redirects, wildcards, matchers, named outlets, and `loadChildren` routes work as in Angular, but
they can't have a name. A named route doesn't need a component.

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

`AppRouter.routes` is flat. Each route gets the path and query parameters of every route above it,
named or not. So `routes.SEASON` has both `showId` and `season`. For the same reason, a name can
appear only once in a route and its parents. A path parameter and a query parameter may share a
name, because you read one from `path` and the other from `query`.

`SHOW` and its empty-path child `SHOW_OVERVIEW` build the same URL, `/shows/tv_1`. Both are active
there.

A codec also decides whether its route matches. `/shows/tv_1/seasons/2` matches `SEASON`.
`/shows/tv_1/seasons/abc` doesn't, because `numberCodec()` can't read `abc`, so Angular tries the
next route. This check runs before the route's own `canMatch` guards.

### Lazy loading

Load pages lazily with `loadComponent`. The route definitions load with the app, so a named route,
and every route above it, can't use `loadChildren`.

The reason is `routerLink`. It needs a `UrlTree` as soon as it renders. A link to `/orders/4` needs
the path `orders/:orderId` and the codec that writes `4`. Both must exist before anyone opens the
orders feature.

If a lazy module has `providers`, move them to the route above the feature's pages. Angular still
creates them on the first visit. `loadComponent` needs a standalone component.
`ng generate @angular/core:standalone` converts one for you. An NgModule component still works in
`component`, but it loads with the app.

Don't call `Router.resetConfig()`. The route list is fixed after `defineAppRouter()` runs. Typed
routes would keep building URLs for routes Angular no longer has.

### Adopt it one feature at a time

Say each feature in your app is a lazy NgModule. You can move them over one at a time, and the app
works after every step.

**1. Pass your routes to `defineAppRouter()` without naming any.** Replace
`RouterModule.forRoot(routes)` or `provideRouter(routes)` with `provideAppRouter()`. Keep importing
`RouterModule` for `routerLink` and `<router-outlet>`. The app behaves exactly as before.

```ts
enum RouteNames {}

export const { AppRouter, provideAppRouter } = defineAppRouter(RouteNames, { routes });

@NgModule({ imports: [RouterModule], exports: [RouterModule], providers: [provideAppRouter()] })
export class AppRoutingModule {}
```

**2. Convert one feature.** Move its routes into the router file, and name the ones your code uses.
Load its pages with `loadComponent`, move its providers up one route, and delete its NgModule.
Features you haven't converted keep their `loadChildren`.

**3. Update the pages when you get to them.** `ActivatedRoute` keeps working, because the router
underneath is the same. The [ESLint rule](#flag-direct-router-use) lists the remaining pages.

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
skips the reverse entries TypeScript adds to numeric enums. It writes each value as its text. It
throws at creation if a value is anything else, or if two values write the same text, as in
`enumCodec([1, '1'])`. A record with numeric keys, like `{ '1': 'one', one: 1 }`, reads like a
numeric enum, so `'1'` is skipped as a reverse entry. Pass an array of its values instead.

In the query, the property name is the URL key. If a key repeats, the last one wins:
`?minRating=1&minRating=4.5` reads as `4.5`.

A path parameter can't be written as `''`, `.`, or `..`. A path segment can't be empty, and
browsers drop `.` and `..` segments.

### Lists

```ts
tags: queryParam({ codec: listCodec(stringCodec(), ','), defaultValue: [] });
```

`?tags=a,b` reads as `['a', 'b']`. An empty list writes `?tags=`, which differs from a missing key.
That is what makes "select none" work when the default isn't empty, as with `defaultValue: ['new']`.
Without a default, a missing key reads as `null`.

An item can contain the separator. `['red, green', 'blue']` writes `?tags=red%5C,%20green,blue`.
The backslash keeps the first comma inside its item. A backslash in an item is escaped the same way.
An item can't be empty, so `['']` can't be written. The separator must be one character other than
a backslash, or `listCodec()` throws at creation. A longer separator could run into the item before
it.

### Write your own codec

Write a codec when a parameter has its own format. Your app writes the URL and reads it back, so a
codec only has to read the text it writes.

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

`2026-11-01..2026-11-15` reads back as `2026-11-01T00:00:00.000Z` to `2026-11-15T23:59:59.999Z`. A
range from 9:30 to 17:00 on 1 November writes `2026-11-01T09:30:00.000Z..2026-11-01T17:00:00.000Z`.
Both ends are in UTC.

A codec can also write a format your API already uses. Say the API takes paging as one value: the
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

The URL reads `?paging=3,24`. `pagingCodec.serialize()` writes the same text into the API request.
The total number of items comes back in the response, so it stays out of the URL.

Every codec follows three rules:

- **One text per value.** A value always writes the same text. The library compares that text to
  tell whether a value changed.
- **Lose nothing.** `deserialize(serialize(value))` returns a value equal to the one you wrote.
- **Same input, same output.** A codec reads nothing but its argument and changes nothing else.
  Don't call `inject()` in one, because codecs often run outside an injection context.

Return `null` for a value you can't write or text you can't read. The result depends on the
parameter. A query parameter is left out of the link, or reads as its default. A path parameter
makes the link throw, or the route not match.

### Defaults and required query parameters

A default does two things. With `defaultValue: 0`, `/results` reads `minRating` as 0. Writing 0
removes `minRating` from the URL, because a query parameter leaves the URL whenever its value writes
the default's text. Every declared query parameter is always in `params().query`. A query parameter
without a default reads as `null` when it's missing.

A default is a plain value, so `/results` shows the same page to everyone. If a fallback needs a
service, like the user's locale, put it in the page:

```ts
// In the route: locale: queryParam({ codec: stringCodec() })
const locale = computed(() => results.params().query.locale ?? settings.locale());
```

`required: true` makes TypeScript require the query parameter whenever you build a link. A URL can
still arrive without it. To pass "no value" for a query parameter without a default, pass `null`. A
query parameter with a default doesn't accept `null`, so pass the default, which leaves the URL.

## Build links

```ts
const season = inject(AppRouter).routes.SEASON;
const link = season.createUrlTree({ path: { showId: 'tv_1', season: 2 }, fragment: 'episodes' });
await season.navigate({ path: { showId: 'tv_1', season: 2 } }, { replaceUrl: true });
```

`link` is `/shows/tv_1/seasons/2#episodes`. Pass it to `routerLink`. `routerLinkActive` works with
it too.

A link contains exactly what you pass. It never copies the current query, whatever Angular's
`defaultQueryParamsHandling` says. So you pass every path parameter, including those from parent
routes. Query parameters are optional unless they're `required`. A query parameter passed as
`undefined` is left out. Parent query parameters come first, in declaration order. Links are always
absolute.

`navigate()` takes the parameters first and the options of Angular's `navigateByUrl()` second, like
`replaceUrl`, `state`, and `skipLocationChange`. So a route with no parameters to pass still needs
the first argument: `navigate({}, { replaceUrl: true })`. Every one of those options works except
`browserUrl`. It could show an address the route didn't build, so passing it is a type error. The
options that shape a link in Angular's `navigate()`, like `queryParamsHandling` and `relativeTo`,
don't exist here, because the link contains exactly what you pass.

A query parameter whose value can't be written is dropped with a warning, and the rest of the link
is still built. A path parameter has no fallback. If `showId` is `''`, `createUrlTree()` throws and
`navigate()` rejects. The same happens when a path codec throws or returns `null`, `.`, or `..`.
Check IDs from data before you build links with them.

To keep the current query parameters, spread them in. A "Top rated only" link on
`/results?search=oak&minRating=2` keeps the search and goes to `/results?search=oak&minRating=4`:

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
parameters, including those of the routes above it. It updates before Angular creates the new page,
so a page's constructor already sees its own URL. Only an active route can be read. Reading an
inactive route throws.

`params()` gives a new value only when a parameter's text in the URL changes. A parameter whose text
didn't change keeps the same value. Go from `?sort=title:asc&minRating=1` to
`?sort=title:asc&minRating=4.5`, and `sort` is `===` the object you read before. A `computed()` that
reads only `sort` returns the same value, so nothing that depends on it reruns. Every reader shares
these values, so don't mutate them.

You can set a fragment in a link, as a string or `null`, with no codec. `params()` doesn't include
it, and no typed route reads it. To read it once, parse the URL through the escape hatch:
`escapeHatch.parseUrl(escapeHatch.url).fragment`. That value isn't a signal, so a `computed()`
around it doesn't update when the fragment changes.

### In guards and resolvers

A guard runs before the URL changes, so `params()` still shows the page the user is leaving. Read
the destination from the snapshot Angular passes in:

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

Say one detail page shows both movies and episodes. Ask a route whether it's showing, and read
through what you get back:

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

`ifActive()` returns the route while it, or one of its children, is showing. Otherwise it returns
`null`. You read through the returned route, so you can't check one route and read another by
mistake. On a page with no named route, like a `**` fallback, every route's `ifActive()` is `null`.
The example reads `MOVIE` without asking, so it throws if the page ever shows on a third route.

In a template:

```html
@if (routes.EPISODE.ifActive(); as episode) {
<p>Episode {{ episode.params().path.episodeId }}</p>
}
```

A parent is active while one of its children shows, so check nested routes deepest first. The same
rule tells you which navigation link to highlight. With `BROWSE` above the movie and TV routes, this
link is active at `/movies`, `/tv`, and `/tv/brambleworth-manor/s/2`:

```html
<a [routerLink]="browseUrl" [class.active]="appRouter.routes.BROWSE.ifActive()">Browse</a>
```

Pass path and query parameters to check them too. Say a list of saved searches greys out the one
already showing. On `/results?search=oak&minRating=4`, `RESULTS.ifActive({ query: { search: 'oak' }
})` returns `RESULTS`. `{ search: 'elm' }` returns `null`:

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

- An omitted parameter matches any value. So `{ search: 'oak' }` matches any rating.
- Query parameters the route doesn't declare never count.
- A default is a value like any other. So `{ search: '' }` matches only an empty search.
- Values compare by their text in the URL. So a list matches item by item, and an old link that
  writes out a default still matches.
- A value its codec can't write never matches, and you get a warning.

So the check and the link can disagree on an omitted query parameter: the link writes its default,
and the check accepts any value.

`ifActive()` is a function that reads signals, so templates and `computed()` track it. Without
parameters, a `computed()` around it reruns only when its answer changes. With parameters, it also
reads `params()`. So a `computed()` around it reruns on every change to the route's path or query
parameters. Code that needs a signal object, like `toObservable()`, wraps it: `computed(() =>
RESULTS.ifActive())`.

Put query parameters that several routes share on their parent. If `BROWSE` declares `search` and
`minRating`, `BROWSE.params()` and `BROWSE.patchQuery()` work on every page under it.

### Parameters on every page

Some code needs a path or query parameter on any page. Examples: a service that tracks a campaign
tag in `?source=`, or one that follows the workspace in `/w/:workspaceId/...`. `globalParams()`
reads both:

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

A path parameter comes from the active route with that placeholder, named or not. It is `null` when
no active route has the placeholder or its codec can't read the value. Query parameters work as on
routes, except that `required` has no effect. Before the first navigation finishes, `globalParams()`
reads the current snapshot.

`globalParams()` only reads. It never throws, needs no cleanup, and works outside an injection
context. Two services that read one name with different codecs can disagree, so share the
definitions between them. In a guard, call `globalParamsSnapshot(definitions, route)`. It also
works on routes without a name. Warnings from either function use the function's name as their
route.

### Remember values yourself

ngx-urlik doesn't save path or query parameters between visits. Your app can, with `globalParams()`.
TasteTrack's `preferences.ts` remembers the page size and each show's last season this way.

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

A query parameter you want to remember shouldn't have a default. A query parameter at its default
leaves the URL. With `defaultValue: 'grid'`, `/movies` could mean "picked the grid view" or "never
picked one". Without a default, the key is in the URL only when someone set it. Save it the same
way. Fall back to the saved value where the page reads the query parameter:

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

Keep the `UrlTree` return type. The redirect sits inside the call that creates `AppRouter`. Without
the annotation, TypeScript can't infer the type of either one.

## Write the query

`patchQuery()` changes the query parameters you pass and leaves the rest of the URL alone. Start on
`/results?sort=new&search=oak&minRating=4`, where the route doesn't declare `sort`:

```ts
await results.patchQuery({ search: 'elm', minRating: 0 });
// /results?sort=new&search=elm
```

`minRating` went back to its default, so it left the URL. `sort` stayed, because a patch doesn't
touch keys the route didn't declare. Every query parameter you left out stayed too, and so did the
path and the fragment. A query parameter passed as `undefined` stays. So do query parameters
declared by child routes. To clear a query parameter, set it to its default or to `null`. A value
its codec can't write also removes the query parameter from the URL, with a warning. `patchQuery()` takes the same options as `navigate()`, like `replaceUrl` and `state`.

Patches add up. A patch made while another is running starts from that patch's destination. The
later patch wins on a shared query parameter:

```ts
void results.patchQuery({ search: 'elm' });
void results.patchQuery({ minRating: 4.5 }); // the URL gets search=elm and minRating=4.5
```

Each patch is one Angular navigation, so the second cancels the first. The second included
the first one's query parameters, so the first patch's promise resolves as the second does. If a
guard declines the second, both resolve `false`. If either patch adds a history entry, the second
navigation adds one, so the first patch's entry isn't lost. Its other options, like `state`, are the
second patch's. A patch that ends where a running patch is already going resolves as that one does,
and that patch's options stay. A patch that wouldn't change the URL resolves `true` without
navigating.

A patch cancels only other patches. While a link click, a `navigate()` call, or Back is
running, a patch resolves `false` and doesn't navigate. Forms are the reason. A form writes when its
debounce ends. By then the user may have clicked a link to a page that's still loading. If the write
cancelled that click, the user would be stuck on the page they tried to leave.

| What happened                                              | The promise      |
| ---------------------------------------------------------- | ---------------- |
| It worked, or the URL already matched                      | Resolves `true`  |
| A guard said no                                            | Resolves `false` |
| A link, `navigate()`, or Back cancelled it, or was running | Resolves `false` |
| The route wasn't active, or Angular threw                  | Rejects          |

## Bind a form

A binding connects a form to the route's query parameters. The form shows each query parameter's
value, and the binding writes the user's edits back to the URL. It works with Reactive Forms and
Signal Forms. It covers query parameters, not path parameters.

```ts
import { createQueryParamsFormGroup } from 'ngx-urlik/forms';

const { form } = createQueryParamsFormGroup(results);
form.patchValue({ search: 'elm', minRating: 0 });
```

You get a `FormGroup` with one non-nullable `FormControl` per query parameter and no validators.
Forms are flat. A list parameter gets an array-valued control. Nested groups and `FormArray` aren't
supported. Each control resets to its query parameter's default, or to `null` without one, so
`form.reset()` clears every filter. For validators, build the group yourself, put them on the
controls, and call `bindQueryParamsToFormGroup(results, group, options)`. A group you build resets
to the values its controls were created with.

```ts
import { createQueryParamsSignalForm } from 'ngx-urlik/forms';

const { model, form } = createQueryParamsSignalForm(results);
model.update((query) => ({ ...query, search: 'elm' }));
```

With Signal Forms you get a writable model and a `FieldTree`. To bind a form you built yourself,
call `bindQueryParamsToSignalForm(results, form, options)`.

All four functions also return `write()`. It does what submitting the form does, for submitting from
code. See [Write only when the user submits](#write-only-when-the-user-submits).

Create a form in an injection context while its route is active. The binding stops when that context
is destroyed. That drops unwritten edits and cancels their debounce timers. A navigation that
already started still runs. If the route stops showing first, the form keeps its values. The next
edit is reported as an error, because there's no active route to write to.

A bound form works like this:

- `form.patchValue({ search: 'elm', minRating: 0 })` is one navigation, not two.
- A write replaces the current history entry, so typing `elm` doesn't add three entries for Back.
- A field takes a new value only when its query parameter changes. So changing the rating doesn't
  wipe a half-typed search.
- Each write includes every field whose value differs from its query parameter. If a link click
  cancels one write, the next one still sends what the user typed.
- A field is written only once its validators pass. A field without validators always passes. See
  [Skip a too-short search](#skip-a-too-short-search).
- A write is a patch, so it adds up with the form's other writes and with `patchQuery()` calls.
- A value taken from a query parameter never marks a field touched or dirty.
- Values are written exactly as typed. If a request needs a trimmed search, trim it where you build
  the request.

| Option           | Default    | What it does                                                                                        |
| ---------------- | ---------- | --------------------------------------------------------------------------------------------------- |
| `replaceUrl`     | `true`     | Whether each write replaces the current history entry                                               |
| `writeOn`        | `'change'` | `'change'` writes each edit. `'submit'` writes every edit when the form is submitted without errors |
| `beforeWrite`    | none       | Changes a write right before it navigates                                                           |
| `onWriteFailure` | none       | Called when a guard declines a write or a write throws. Without it, errors go to `ErrorHandler`     |
| `debounce`       | none       | Reactive Forms only. How long typing waits, per field, in milliseconds                              |
| `schema`         | none       | Signal Forms only. Validators and `debounce()` rules                                                |

### Debounce a search

```ts
import { debounce, minLength } from '@angular/forms/signals';

// Signal Forms
createQueryParamsSignalForm(results, { schema: (fields) => debounce(fields.search, 300) });

// Reactive Forms
createQueryParamsFormGroup(results, { debounce: { search: 300 } });
```

The user types `elm` and stops. 300 ms later the search is written. Other fields still write
immediately. If the user presses Back to `?search=oak` while `elm` is waiting, the input shows `oak`
and `elm` is dropped. A navigation that changes only other query parameters leaves `elm` waiting.
When the delay ends, `elm` is written on top of the URL as it is then. Leaving the page drops it.

Only typing waits. A value your code sets, like `form.patchValue({ search: 'elm' })` or a
`model.update()`, is written immediately and replaces typing that's still waiting. Submitting ends
the wait too, so typing `elm` and pressing Enter writes it at once. That works for a
`<form [formGroup]>`, and for a Signal Form passed to Angular's `submit()`.

### Skip a too-short search

A field is written only once its validators pass, so a minimum length is enough:

```ts
createQueryParamsSignalForm(results, { schema: (fields) => minLength(fields.search, 3) });
```

Typing `el` leaves the URL as it is. Typing `elm` writes it. Clearing the box writes an empty
search, because Angular's length validators accept an empty value. Each field checks only its own
validators, so an invalid search doesn't stop a rating change from being written. The form keeps
an invalid field's value until the user edits it or the form is destroyed, even if a navigation
changes that query parameter. A field waiting on an async validator is written once it passes.

### Write only when the user submits

Every URL change starts a request, so some searches should run only when the user presses Search.
Pass `writeOn: 'submit'`:

```ts
// Reactive Forms, in a <form [formGroup]>
createQueryParamsFormGroup(results, { writeOn: 'submit' });

// Signal Forms, in a <form [formRoot]>
createQueryParamsSignalForm(results, { writeOn: 'submit' });
```

The form still changes on every keystroke, so the rest of the page can react. For example, switching
"search by" to ID can disable an "exact match" checkbox at once. The URL waits for the submit, and
so do values your code sets. The submit writes every edited field in one navigation. If the form has
errors, the URL doesn't change and the form keeps the edits. A pending async validator doesn't count
as an error, as in Angular's `submit()`. If a field's query parameter changes first, say after Back,
the form shows the new value and drops that field's edit. The other edits stay.

A Reactive form is submitted by its `<form [formGroup]>`. Angular reports the submit only to the
group passed to `<form [formGroup]>`, so bind that group. If you bind a group nested inside it, call
`write()` from `(ngSubmit)`. `createQueryParamsSignalForm()` makes the write the Signal Form's
submit action. So a `<form [formRoot]>` or a call to Angular's `submit()` writes it.

For a Signal Form you built yourself, make the binding's `write` the form's submit action. The form
and the binding refer to each other, so the binding needs a type annotation:

```ts
readonly filters = form(this.model, { submission: { action: () => this.binding.write() } });
readonly binding: QueryParamsBinding = bindQueryParamsToSignalForm(results, this.filters, {
  writeOn: 'submit',
});
```

To submit from code, like a Search button outside the form, call `write()`. It does what a submit by
the user does, in both form systems:

- It writes typing still waiting for its debounce.
- With `'change'`, it writes each field whose validators pass, even while other fields have errors.
- With `'submit'`, it writes nothing while the form has errors.

A field that isn't written stays in the form as a draft, and the next write includes it. A pending
async validator doesn't count as an error. `write()` resolves once the form's newest write
finishes, even one that was already running.

Inside Angular's `submit()`, the Signal Form's submission options decide whether errors stop the
write, like `ignoreValidators`. There, `write()` resolves as soon as the write starts. Angular
ignores a submit while the last one runs. Ending early lets a second Enter, pressed while a slow
page loads, still write the new search. It also means `submitting()` doesn't tell you the URL is
being written.

### Clear the rating filter on a new search

Only your page knows this rule, so it goes in `beforeWrite`:

```ts
createQueryParamsFormGroup(results, {
  debounce: { search: 300 },
  beforeWrite: (patch) => ('search' in patch ? { minRating: 0, ...patch } : patch),
});
```

On `/results?minRating=4`, typing `elm` makes one navigation, to `/results?search=elm`. Without a
form, put both query parameters in one patch: `patchQuery({ search, minRating: 0 })`.

`beforeWrite(patch, draft)` runs right before the navigation. It runs after any debounce, and only
with fields whose validators pass. `patch` has the query parameters about to be written. `draft` has
the value of every field in the form. What you return is what gets written. A query parameter you
set to `undefined` is left out of the write. Use `beforeWrite` to change other query parameters, not
the value the user typed.

The query parameters `beforeWrite` adds aren't drafts, so after the write the form reads them back
from the URL. An edit that ends at its query parameter's current value doesn't navigate, so
`beforeWrite` doesn't run for it. If `beforeWrite` throws, the error goes to `ErrorHandler`, the URL
doesn't change, and the drafts stay.

### When a write fails

A guard can decline a write, or the write can throw. Either way, the form keeps what the user
typed until that field's query parameter changes in the URL. Nothing retries automatically, but the
form's next write includes the field again. `onWriteFailure` gets `{ kind: 'declined' }` or `{ kind:
'error', error }`. Without it, declines are silent.

Picking the value that's already chosen isn't a decline. A write cancelled by the form's own next
write isn't reported either, because the next write reports for itself.

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

The binding follows the URL, and a Signal Form's edits, through effects. On the fake clock, Angular
doesn't run those effects by itself, so `elapse()` calls `TestBed.tick()`.

Only typing waits for the debounce, and in a test, `setValue('elm')` counts as code, so it writes at
once. To type, pass `{ emitModelToViewChange: false }` as above, which is how Angular's input
directives set a value, or dispatch an `input` event on the bound input. In a Signal Form, set
`form.search().controlValue`, which is what `[formField]` sets on each keystroke.

## Diagnostics and errors

When a codec can't read a query parameter, it reads as its default and you get a warning. On
`/results?minRating=abc`, `minRating` reads as 0, and the warning is:

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
error is in `cause`. By default, each warning's `message` goes to `console.warn`. To get the whole
object, pass `diagnostics: { warn }` to `defineAppRouter()`.

A warning's `route` is the route that declares the parameter, which can be a parent. A route without
a name is identified by its position, like `routes[0].children[1]`.

Two things throw instead, because there's no fallback: reading an inactive route, and building a
link with a path parameter whose value can't be written.

Route mistakes are caught at startup. `defineAppRouter()` checks every named route, every route
above one, and every route with `pathParams` or `queryParams`. It throws one error that lists every
problem:

- A route name that's empty or used twice.
- A `routeName` that isn't in your enum, or an enum member that no route uses.
- A name on a redirect, a wildcard, or a matcher.
- `loadChildren` on a named route, or on a route above one.
- A path that isn't a plain string in the primary outlet, or that has an empty segment or a reserved
  character.
- A `pathParams` key that isn't a placeholder in the path, or a `pathParams` value that isn't a
  codec.
- A `queryParams` value that `queryParam()` didn't make.
- `queryParams` on a route with no named route at or below it, because nothing could read them.
- A placeholder or a query key declared twice in a route and its parents.
- A route that isn't an object, or `children` that isn't an array.

TypeScript catches many of these before the app runs. Angular still checks its own route config.

## Work with Angular Router

`provideAppRouter(...features)` passes Angular's router features through, like `withRouterConfig({
paramsInheritanceStrategy: 'always' })`. Typed routes read their parents' path and query parameters
themselves, so any `paramsInheritanceStrategy` works. Angular still picks the route, so route order
matters as always.

Server rendering works, and `params()` reads the requested URL. Code that touches `localStorage`
needs a browser check there.

### Escape hatch

For a URL outside your typed routes, use `AppRouter.escapeHatch`. It has Angular's own
`createUrlTree`, `navigate`, `navigateByUrl`, `parseUrl`, `serializeUrl`, and `isActive`. It also
has read-only `url`, `events`, `navigated`, `currentNavigation`, `lastSuccessfulNavigation`, and
`componentInputBindingEnabled`. Its `isActive(url, matchOptions?)` returns a `Signal<boolean>`. The
escape hatch leaves out `routerState`, `config`, `resetConfig()`, `initialNavigation()`,
`setUpLocationChangeListener()`, `dispose()`, and the deprecated settable properties
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

`RouterLink`, `RouterOutlet`, `ResolveFn`, and `ActivatedRouteSnapshot` stay allowed. When you
mean to use `Router` or `ActivatedRoute`, keep the import and add an `eslint-disable-next-line`
comment that says why.

## Types

The helper types take the type of a route. Inside a component, that's `typeof results`. Anywhere
else, `RoutesOf` gets the routes from the `AppRouter` token:

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

| Not supported                                       | Instead                                               |
| --------------------------------------------------- | ----------------------------------------------------- |
| Angular versions outside `^22.1.0`                  | Use Angular 22.1 or a later 22.x release              |
| Named redirects, wildcards, matchers, named outlets | Leave them unnamed                                    |
| Route arrays split across files                     | One literal array in `defineAppRouter()`              |
| Named routes inside `loadChildren`                  | Keep definitions in the router file. Lazy-load pages  |
| Query property names that differ from URL keys      | The property name is the URL key                      |
| Built-in date or object codecs                      | Write your own codec                                  |
| Writing global parameters                           | Write them through a route                            |
| Reading the fragment as a signal                    | Parse `escapeHatch.url` once                          |
| Typed relative navigation                           | Use the escape hatch                                  |
| Remembering values across visits                    | [Remember values yourself](#remember-values-yourself) |

## TasteTrack demo

The [demo app](https://github.com/tsopeh/ngx-urlik/tree/master/projects/demo-app) is a small movie
and TV journal built with ngx-urlik. Try it at <https://tsopeh.github.io/ngx-urlik>, or run `npm ci`
and `npm start` from the repo root.

Change the movie genres, the sort, and the page size, then reload. The filters come back, because
they're in the URL. Then open Brambleworth Manor, season 2, episode 1. The URL is
`/tv/brambleworth-manor/s/2/e/1`, while the show's ID is `tv_brambleworth-manor`. Its codec drops
the `tv_` prefix when it writes and adds it back when it reads.

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
[Reading the code](https://github.com/tsopeh/ngx-urlik/blob/master/docs/implementation.md) shows
where everything lives.

## Why the howling mouse

"URL Is King" shortens to _urlik_, which means "howl" in Serbian. The mouse comes from
[this legendary video](https://www.youtube.com/watch?v=Bkq1PAyGuZY).

## License

[MIT](https://github.com/tsopeh/ngx-urlik/blob/master/LICENSE)
