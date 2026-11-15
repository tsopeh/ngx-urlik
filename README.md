# ngx-urlik — URL Is King

![A howling mouse with the Angular logo on its body](docs/banner.gif)

ngx-urlik is an Angular library that makes routing fully type-safe: the route definitions,
path and query parameters, and the navigation between pages.

You keep writing Angular routes the way you do now, with three additions: a name for the route, a
type for each path parameter, and a name and type for each query parameter. That's enough for
TypeScript to check everything else. ngx-urlik turns those definitions into `AppRouter`, which has
an entry for every named route. Through it you read parameters as typed signals, change the query,
and build links. If you misspell a parameter or pass a string where a number goes, the code doesn't
compile.

You use `AppRouter` instead of Angular's `Router` and `ActivatedRoute`, because those two can't be
made type-safe. `ActivatedRoute` gives you every parameter as a string or `null`, whatever it's
supposed to be, and `Router` accepts any string or array as a link. TypeScript can't tell whether
either one matches your routes, so you find out when the page runs. An
[ESLint rule](#flag-direct-router-use) flags any code that still imports them. Angular's router
still does the routing underneath, so guards, resolvers, and `routerLink` work the same.

## Get started

ngx-urlik needs Angular 22.

```sh
npm install ngx-urlik
```

Your routes stay ordinary Angular routes. Give a name to each route your code uses, and declare the
values that route keeps in the URL:

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

Provide the router where you would call `provideRouter()`:

```ts
bootstrapApplication(App, { providers: [provideAppRouter()] });
```

Now a page can read the URL, change it, and link to it. Say the user is on
`/results?search=oak&minRating=4`:

```ts
const results = inject(AppRouter).routes.RESULTS;

results.params().query; // { search: 'oak', minRating: 4 }

await results.patchQuery({ search: 'elm', minRating: 0 });
// The URL is now /results?search=elm

const link = results.createUrlTree({ query: { minRating: 4.5 } });
// /results?minRating=4.5
```

```html
<a [routerLink]="link">Rated 4.5 and up</a>
```

- `params()` is a signal, so a template or a `computed()` that reads it updates when the URL
  changes.
- `patchQuery()` changed both fields in one navigation. `minRating` went back to its default, 0, so
  it left the URL.
- The link has `minRating` and no `search`, because a link holds only what you pass to it.

Route names come from an enum so that your editor can follow them. Go to Definition, Find
References, and Rename on `routes.RESULTS` all reach the route and every place that uses it, which
they can't do for a name written as a string. `AppRouter.routes` has one entry per enum member,
under the member's name. Don't export the enum, because pages get their routes from
`AppRouter.routes`.

The form helpers live in `ngx-urlik/forms`, which needs `@angular/forms`.

If you're moving an existing app over, you can
[do it one feature at a time](#adopt-it-one-feature-at-a-time).

### Coding agents

The package ships a skill that teaches coding agents how to use ngx-urlik. Agents won't find it on
their own, so point them to it from your `AGENTS.md` or `CLAUDE.md`:

```md
This app uses ngx-urlik for routing and URL state. Before you change routes, links, guards,
resolvers, or code that reads or writes the URL, read
node_modules/ngx-urlik/skills/ngx-urlik/SKILL.md and follow it. Read and write the URL through
AppRouter, not ActivatedRoute or Router. Declare new routes in the defineAppRouter() file.
```

In Claude Code, link the skill into your project instead. The link always points at the version you
have installed:

```sh
mkdir -p .claude/skills
ln -s ../../node_modules/ngx-urlik/skills/ngx-urlik .claude/skills/ngx-urlik
```

## Ground rules

Six rules explain most of what the library does:

- **You declare each value once.** A field lives on its route, with a codec that turns URL text
  into a value and back. Reads, links, patches, and forms all use that codec, so they can't
  disagree about what `?minRating=4` means.
- **A bad value doesn't break the page.** `?minRating=abc` reads as the default, and you get a
  warning.
- **A link holds what you put in it.** Nothing is copied from the current URL.
- **A form holds drafts, and the URL holds what's been written.** What the user is typing stays in
  the form until it's ready for the URL.
- **The page decides how fields affect each other.** Whether a new search clears the rating filter
  is up to the page, not the route.
- **Angular still routes.** Matching, guards, resolvers, `routerLink`, and server rendering all
  work as they do without ngx-urlik.

## Routes

A route is an Angular route with up to three more fields:

| Field         | What it does                                                                      |
| ------------- | --------------------------------------------------------------------------------- |
| `routeName`   | Adds the route to `AppRouter.routes`                                              |
| `pathParams`  | Gives a codec to a `:placeholder` in the path. Without one, the value is a string |
| `queryParams` | Declares the query fields the route owns. The routes below it get them too        |

Write `path` and `routeName` as literals inside the `defineAppRouter()` call, because that's where
TypeScript reads your routes. If you pass an array typed as Angular's `Routes`, it compiles, but
you get no typed routes.

Redirects, wildcards, matchers, named outlets, and `loadChildren` routes work as they do in
Angular, but they can't have a name. A named route doesn't need a component.

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

`AppRouter.routes` is flat, and each route gets the path and query fields of the routes above it.
So `routes.SEASON` has both `showId` and `season`. That's also why a name can appear only once in a
route and its parents. A placeholder and a query field may share a name, because you read one from
`path` and the other from `query`.

At `/shows/tv_1`, `SHOW` and its empty-path child `SHOW_OVERVIEW` are both active.

A codec also decides whether its route matches. `/shows/tv_1/seasons/2` matches `SEASON`.
`/shows/tv_1/seasons/abc` doesn't, because `numberCodec()` can't read `abc`, so Angular tries the
next route. This check runs before the route's own `canMatch` guards.

### Lazy loading

Load pages lazily with `loadComponent`. The route definitions themselves load with the app, so a
named route, and every route above it, can't use `loadChildren`.

`routerLink` is the reason. It needs a `UrlTree` the moment it renders, and a link to `/orders/4`
can't be built without the path `orders/:orderId` and the codec that writes `4`. Both have to be
there before anyone opens the orders feature.

If a lazy module has `providers`, move them to the route above the feature's pages. Angular still
creates them on the first visit. `loadComponent` needs a standalone component, and
`ng generate @angular/core:standalone` converts one for you.

Don't call `Router.resetConfig()`. The route list is fixed once `defineAppRouter()` runs, so typed
routes would go on building URLs for routes Angular no longer has.

### One file for the whole app

Put every route in the one `defineAppRouter()` call. That file then shows every URL in your app,
along with its parameters, its guards, and the page it loads. It stays small, because the pages
live in their own files.

### Adopt it one feature at a time

Say each feature in your app is a lazy NgModule. You can move them over one by one, and the app
works after every step.

**1. Pass your routes to `defineAppRouter()` without naming any.** Replace
`RouterModule.forRoot(routes)` or `provideRouter(routes)` with `provideAppRouter()`. Keep importing
`RouterModule` for `routerLink` and `<router-outlet>`:

```ts
enum RouteNames {}

export const { AppRouter, provideAppRouter } = defineAppRouter(RouteNames, { routes });

@NgModule({ imports: [RouterModule], exports: [RouterModule], providers: [provideAppRouter()] })
export class AppRoutingModule {}
```

Nothing about the app changes yet.

**2. Convert one feature.** Move its routes into the router file and name the ones your code uses.
Load its pages with `loadComponent`, move its providers up one route, and delete its NgModule. The
features you haven't reached keep their `loadChildren`.

**3. Update the pages when you get to them.** `ActivatedRoute` still works, because the router
underneath is the same one. The [ESLint rule](#flag-direct-router-use) lists the pages that are
left.

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

`null` means "I can't convert this", which is why `T` can't include `null`. One codec works in a
path, in the query, and inside a list.

| Codec                        | Accepts                                                                          |
| ---------------------------- | -------------------------------------------------------------------------------- |
| `stringCodec()`              | Any string, including `''`                                                       |
| `numberCodec()`              | Any number except `NaN`, like `4.5` or `-Infinity`                               |
| `booleanCodec()`             | `true` or `false`                                                                |
| `enumCodec(values)`          | One value from an array, a record, or any enum. `Status.Archived = 1` writes `1` |
| `listCodec(item, separator)` | `item` values joined by `separator`, one character like `,`                      |

`enumCodec()` takes strings and finite numbers, so string, numeric, and mixed enums all work. It
writes each value as its text. Two values can't write the same text, so `enumCodec([1, '1'])`
throws.

In the query, the property name is the URL key. If a key repeats, the last one wins:
`?minRating=1&minRating=4.5` reads as `4.5`.

In a path, a value can't be written as `''`, `.`, or `..`. A path segment can't be empty, and
browsers drop `.` and `..`.

### Lists

```ts
tags: queryParam({ codec: listCodec(stringCodec(), ','), defaultValue: [] });
```

`?tags=a,b` reads as `['a', 'b']`. An empty list writes `?tags=`, so it's different from a missing
key. That's what lets "select none" work when the default isn't empty, as with
`defaultValue: ['new']`. Without a default, a missing key reads as `null`.

An item can contain the separator. `['red, green', 'blue']` writes `?tags=red%5C,%20green,blue`,
where the backslash keeps the first comma inside its item. An item can't be empty, so `['']` can't
be written.

### Write your own codec

Write a codec when a value has a format of its own. Your app writes the URL and reads it back, so a
codec only has to read the text it writes.

Take a date range. It can be short when it covers whole days. This codec writes
`2026-11-01..2026-11-15` for 1 to 15 November, and full timestamps for any other range:

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
page number, the page size, and the total number of items, like `3,24,130`.

```ts
type Paging = {
  readonly pageNumber: number;
  readonly pageSize: number;
  readonly totalItems: number;
};

const pagingCodec: UrlParamCodec<Paging> = {
  serialize: ({ pageNumber, pageSize, totalItems }) => `${pageNumber},${pageSize},${totalItems}`,
  deserialize: (raw) => {
    const parts = /^(\d+),(\d+),(\d+)$/.exec(raw);
    return parts
      ? { pageNumber: Number(parts[1]), pageSize: Number(parts[2]), totalItems: Number(parts[3]) }
      : null;
  },
};

paging: queryParam({ codec: pagingCodec });
```

The URL holds `?paging=3,24,130`, and you can call `pagingCodec.serialize()` to write the same text
into the API request.

Every codec has to follow three rules:

- **One text per value.** The library compares text to tell whether a value changed.
- **Lose nothing.** `deserialize(serialize(value))` gives back a value equal to the one you wrote.
- **Stay pure, and don't call `inject()`.** Codecs often run outside an injection context.

Return `null` for a value you can't write, or for text you can't read. What happens next depends on
where the value sits. A query field is left out of the link, or reads as its default. A path value
makes the link throw, or the route not match.

### Defaults and required fields

A default does two things. With `defaultValue: 0`, `/results` reads `minRating` as 0, and writing 0
takes `minRating` out of the URL. A field without a default reads as `null` when it's missing.

A default is a plain value, so `/results` shows the same page to everyone. If a fallback needs a
service, like the user's locale, put it in the page:

```ts
// In the route: locale: queryParam({ codec: stringCodec() })
const locale = computed(() => results.params().query.locale ?? settings.locale());
```

`required: true` makes TypeScript ask for the field whenever you build a link. A URL can still
arrive without it. To pass "no value", pass `null`, or `[]` for a list.

## Build links

```ts
const season = inject(AppRouter).routes.SEASON;
const link = season.createUrlTree({ path: { showId: 'tv_1', season: 2 }, fragment: 'episodes' });
await season.navigate({ path: { showId: 'tv_1', season: 2 } }, { replaceUrl: true });
```

`link` is `/shows/tv_1/seasons/2#episodes`. Give it to `routerLink`, and `routerLinkActive` works
with it too.

A link holds exactly what you pass. The current query is never copied in, whatever Angular's
`defaultQueryParamsHandling` says. You have to pass every path value, including the ones that come
from parent routes. Query fields are optional unless they're `required`, and a field you pass as
`undefined` is left out. Links are always absolute.

`navigate()` takes the values first and Angular's navigation options second. A route with nothing
to pass still needs the first argument: `navigate({}, { replaceUrl: true })`. Every option works
except `browserUrl`, which could show an address the route didn't build.

A query value that can't be written is dropped, and you get a warning. A path value has nothing to
fall back on. If `showId` is `''`, `createUrlTree()` throws and `navigate()` rejects, so check IDs
that come from data before you build links with them.

To keep the current filters in a link, spread them in. On `/results?search=oak&minRating=4`, this
link goes to `/results?search=oak&minRating=5`:

```ts
const higherRating = computed(() => {
  const { query } = results.params();
  return results.createUrlTree({ query: { ...query, minRating: query.minRating + 1 } });
});
```

For a link to a section of the current page, use Angular's own form:

```html
<a [routerLink]="[]" fragment="credits" queryParamsHandling="preserve">Credits</a>
```

## Read the URL

Every named route has a `params` signal. It holds `{ path, query }`, with the fields of the routes
above included. It updates before Angular creates the new page, so a page's constructor already
sees its own URL.

You can only read a route that's active. Reading one that isn't throws.

`params` fires only when the text of a field changes, and a field whose text didn't change keeps
the same value. Go from `?sort=title:asc&minRating=1` to `?sort=title:asc&minRating=4.5`, and `sort`
is `===` the object you read before. A `computed()` that reads only `sort` returns the same value,
so nothing that depends on it runs again. Don't change these values in place, because every reader
shares them.

You can set a fragment in a link, but `params()` doesn't hold it, and there's no way to read it
back.

### In guards and resolvers

A guard runs before the URL changes, so `params()` still shows the page the user is leaving. Read
the page they're going to from the snapshot Angular gives you:

```ts
export const seasonResolver: ResolveFn<Season> = (route) => {
  const appRouter = inject(AppRouter);
  const { path } = appRouter.paramsSnapshot(appRouter.routes.SEASON, route);
  return inject(SeasonApi).load(path.showId, path.season);
};
```

Any snapshot from the same navigation works, so a child's guard can read its parent's values.

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
`null`. You read through the route it returned, so you can't check one route and read another by
mistake. On a page with no named route, like a `**` fallback, every route's `ifActive()` is `null`.

In a template:

```html
@if (routes.EPISODE.ifActive(); as episode) {
<p>Episode {{ episode.params().path.episodeId }}</p>
}
```

A parent counts as active while one of its children shows, so check nested routes deepest first.
The same rule gives you nav highlighting. With `BROWSE` above the movie and TV routes, this link is
active at `/movies`, `/tv`, and `/tv/brambleworth-manor/s/2`:

```html
<a [routerLink]="browseUrl" [class.active]="appRouter.routes.BROWSE.ifActive()">Browse</a>
```

Put the fields that several routes share on their parent. If `BROWSE` declares `search` and
`minRating`, then `BROWSE.params()` and `BROWSE.patchQuery()` work on every page under it.

### Values on every page

Some code needs a value whatever page is showing. One service tracks a campaign tag like
`?source=`. Another follows the workspace in `/w/:workspaceId/...`. `globalParams()` reads both:

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

A path value comes from whichever active route has that placeholder, named or not. If none has it,
the value is `null`. Query fields work as they do on routes.

`globalParams()` never throws, and you can call it outside an injection context. It only reads. In
a guard, call `globalParamsSnapshot(definitions, route)`, which also works on routes without a
name.

### Remember values yourself

ngx-urlik doesn't save values between visits. Your app can, with `globalParams()`. TasteTrack's
`preferences.ts` remembers the page size and each show's last season this way.

A path value is always in the URL, so save it whenever it changes:

```ts
const current = appRouter.globalParams({ path: { workspaceId: stringCodec() } });
effect(() => {
  const { workspaceId } = current().path;
  if (workspaceId) {
    localStorage.setItem('lastWorkspace', workspaceId);
  }
});
```

A query field you want to remember shouldn't have a default. A value at its default leaves the URL,
so with `defaultValue: 'grid'`, `/movies` could mean "picked the grid view" or "never picked one".
Without a default, the key is in the URL only when someone set it. Save it the same way, and fall
back to the saved value where the page reads the field:

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

Keep the `UrlTree` return type. The redirect sits inside the call that creates `AppRouter`, and
without the annotation TypeScript can't work out the type of either one.

## Write the query

`patchQuery()` changes the fields you pass and leaves the rest of the URL alone. Start on
`/results?sort=new&search=oak&minRating=4`, where the route doesn't declare `sort`:

```ts
await results.patchQuery({ search: 'elm', minRating: 0 });
// /results?sort=new&search=elm
```

`minRating` went back to its default, so it left the URL. `sort` stayed, because a patch doesn't
touch keys the route didn't declare. The fields you leave out stay too, and so do the path and the
fragment. To clear a field, set it to its default or to `null`.

Each patch is one Angular navigation, built from the URL as it is when you call it. A second patch
cancels a first one that's still running, so two patches in a row don't add up:

```ts
void results.patchQuery({ search: 'elm' });
void results.patchQuery({ minRating: 4.5 }); // cancels the first: the URL gets only minRating=4.5
```

Put fields that change together in one patch.

A patch cancels only other patches. While a link click, a `navigate()` call, or Back is running, a
patch resolves `false` and doesn't navigate. Here's why. A form writes when its debounce ends, and
by then the user may have clicked a link to a page that's still loading. If the write cancelled
that click, they'd stay on the page they tried to leave.

The promise tells you how the patch went:

| What happened                             | The promise      |
| ----------------------------------------- | ---------------- |
| It worked, or the URL already matched     | Resolves `true`  |
| A guard said no                           | Resolves `false` |
| Another navigation won, or was running    | Resolves `false` |
| The route wasn't active, or Angular threw | Rejects          |

## Bind a form

A form holds what the user is typing, and the URL holds what's been written. A binding keeps the
two in step. It works with Reactive Forms and with Signal Forms, and it covers query fields, not
the path.

```ts
import { createQueryParamsFormGroup } from 'ngx-urlik/forms';

const filters = createQueryParamsFormGroup(results);
filters.patchValue({ search: 'elm', minRating: 0 });
```

You get one non-nullable `FormControl` per query field, with no validators. Each control resets to
its field's default, or to `null` if the field has none, so `filters.reset()` clears every filter.
If you need validators, build the group yourself and call
`bindQueryParamsToFormGroup(results, group, options)`.

```ts
import { createQueryParamsSignalForm } from 'ngx-urlik/forms';

const { model, form } = createQueryParamsSignalForm(results);
model.update((query) => ({ ...query, search: 'elm' }));
```

With Signal Forms you get a writable model and a `FieldTree`. To bind a form you built yourself,
call `bindQueryParamsToSignalForm(results, form, options)`.

Create a form in an injection context, while its route is active. The binding stops when that
context is destroyed. If the route stops showing first, the form keeps its values, and the next
edit is reported as an error, because there's no active route to write to.

A bound form does what you'd expect from a search box with filters:

- `patchValue({ search: 'elm', minRating: 0 })` is one navigation, not two.
- A write replaces the current history entry. Typing `elm` doesn't add three stops for Back.
- A field takes a value from the URL only when the URL's value for that field changes. Changing the
  rating doesn't wipe a half-typed search.
- Each write carries every field where the form differs from the URL. If a link click cancels one
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

The user types `elm` and stops, and 300 ms later the search is written. The other fields are still
written right away. If the user presses Back to `?search=oak` while `elm` is waiting, the input
shows `oak` and `elm` is dropped.

### Skip a too-short search

```ts
createQueryParamsSignalForm(results, {
  schema: (fields) => minLength(fields.search, 3),
  writeWhen: 'valid',
});
```

Typing `el` writes nothing, and `elm` is written. Clearing the box writes an empty search, because
Angular's length validators accept an empty value. Each field is checked on its own, so an invalid
search doesn't hold back a rating change.

### Clear the rating filter on a new search

Only your page knows this rule, so it goes in `beforeWrite`:

```ts
createQueryParamsFormGroup(results, {
  debounce: { search: 300 },
  beforeWrite: (patch) => ('search' in patch ? { minRating: 0, ...patch } : patch),
});
```

On `/results?minRating=4`, typing `elm` makes one navigation, to `/results?search=elm`. Without a
form, put both fields in one patch: `patchQuery({ search, minRating: 0 })`.

`beforeWrite(patch, draft)` runs right before the navigation, after any debounce, and after
`writeWhen` has held back the invalid fields. `patch` holds the fields about to be written, and
`draft` holds the whole form. What you return is what gets written. A field you set to `undefined`
keeps its URL value. Use `beforeWrite` to change other fields, not the value the user typed.

### When a write fails

A guard can decline a write, or something can throw. In both cases the form keeps what the user
typed, until the URL's value for that field changes. Nothing retries on its own, but the form's
next write carries the field again. `onWriteFailure` gets `{ kind: 'declined' }` or
`{ kind: 'error', error }`.

## Diagnostics and errors

When a codec can't read a value, the field reads as its default and you get a warning. On
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
error is in `cause`.

Warnings go to `console.warn`. To send them somewhere else, pass `diagnostics: { warn }` to
`defineAppRouter()`.

Two things throw instead of warning, because there's nothing to fall back on: reading a route that
isn't active, and building a link with a path value that can't be written.

Route mistakes are caught when the app starts. `defineAppRouter()` checks every named route, every
route above one, and every route that has `pathParams` or `queryParams`. It throws one error that
lists everything it found:

- A route name that's empty or used twice.
- A `routeName` that isn't in your enum, or an enum member that no route uses.
- A name on a redirect, a wildcard, or a matcher.
- `loadChildren` on a named route, or on a route above one.
- A path that isn't a plain string in the primary outlet, or that has an empty segment or a
  reserved character.
- A `pathParams` key that isn't a placeholder in the path.
- A `queryParams` value that `queryParam()` didn't make.
- `queryParams` on a route with no named route at or below it, because nothing could read them.
- A placeholder or a query key declared twice in a route and its parents.

TypeScript catches many of these before the app runs. Angular still checks its own route config as
well.

## Work with Angular Router

`provideAppRouter(...features)` passes Angular's router features through, like
`withRouterConfig({ paramsInheritanceStrategy: 'always' })`. Typed routes read their parents'
values themselves, so any `paramsInheritanceStrategy` works. Angular still picks the route, so the
order of your routes matters as it always did.

Server rendering works, and `params()` reads the URL that was requested. Code that touches
`localStorage` needs a browser check there.

### Escape hatch

For a URL outside your typed routes, use `AppRouter.escapeHatch`. It has Angular's own
`createUrlTree`, `navigate`, `navigateByUrl`, `parseUrl`, `serializeUrl`, and `isActive`. It also
has read-only `url`, `events`, `navigated`, `currentNavigation`, `lastSuccessfulNavigation`, and
`componentInputBindingEnabled`.

You can still inject Angular's `Router`, but what you do through it isn't checked against your
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

When you mean to use one of them, keep the import and add an `eslint-disable-next-line` comment
that says why.

## Types

The helper types take the type of a route. Inside a component that's `typeof results`. Anywhere
else, `RoutesOf` gets the routes from the `AppRouter` token:

```ts
type ResultsQuery = QueryParamsOf<typeof results>; // { search: string; minRating: number }

type Routes = RoutesOf<typeof AppRouter>;
type SameQuery = QueryParamsOf<Routes['RESULTS']>;
```

| Type                      | What it is                                         |
| ------------------------- | -------------------------------------------------- |
| `RoutesOf<Token>`         | The type of `AppRouter.routes`, from the token     |
| `PathParamsOf<Node>`      | A route's path values, with its parents' included  |
| `QueryParamsOf<Node>`     | A route's query values, with its parents' included |
| `ParamsOf<Node>`          | What `params()` returns: `{ path, query }`         |
| `QueryPatchOf<Node>`      | What `patchQuery()` accepts                        |
| `RouteNode<P, Q, R>`      | A typed route                                      |
| `TypedAppRouter`          | What the `AppRouter` token gives you               |
| `RouteDefinition`         | One route: Angular's fields plus ours              |
| `RouteDefinitions`        | A route array                                      |
| `UrlParamCodec<T>`        | A codec                                            |
| `AppRouterDiagnostic`     | A warning passed to `diagnostics.warn`             |
| `AppRouterDiagnosticCode` | `diagnostic.code`                                  |
| `AppRouterDiagnostics`    | The `diagnostics` option: `{ warn }`               |

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

The [demo app](https://github.com/tsopeh/ngx-urlik/tree/master/projects/demo-app) is a small movie
and TV journal built with ngx-urlik. Try it at <https://tsopeh.github.io/ngx-urlik>, or run
`npm ci` and `npm start` from the repo root.

Change the movie genres, the sort, and the page size, then reload. The filters come back, because
they're in the URL. Then open Brambleworth Manor, season 2, episode 1. The URL is
`/tv/brambleworth-manor/s/2/e/1`. The show's ID is `tv_brambleworth-manor`, and its codec drops the
`tv_` prefix when it writes and adds it back when it reads.

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
npm run build          # library, then demo
npm test               # unit tests for both
npm run typecheck      # builds the library, then public type tests and a 201-route app
npm run e2e            # Playwright against the demo
npm run release:check  # delete build outputs, then format, lint, build, test, and pack
npm run release        # on a clean tree: npm ci, run release:check, then publish to npm
```

[Design decisions](https://github.com/tsopeh/ngx-urlik/blob/master/docs/decisions.md) explains why
the library works the way it does, and what each choice costs.
[Reading the code](https://github.com/tsopeh/ngx-urlik/blob/master/docs/implementation.md) shows
where everything lives.

## Why the howling mouse

"URL Is King" shortens to _urlik_, which means "howl" in Serbian. The mouse comes from
[this legendary video](https://www.youtube.com/watch?v=Bkq1PAyGuZY).

## License

[MIT](https://github.com/tsopeh/ngx-urlik/blob/master/LICENSE)
