# ngx-urlik

Type-safe URL parameters and navigation for Angular Router.

A page's state belongs in its URL. Whatever lives there survives a reload, works with Back and
Forward, and arrives intact when someone shares the link. Angular Router gets you most of the way
there, but it hands every value over as a string or `null`, so each page ends up parsing its own
numbers, picking its own defaults, and assembling its own links.

ngx-urlik adds the missing types. You declare each value once, on the route that owns it, and from
then on your code works with real values: it reads them as signals, changes them with one call, and
builds links that TypeScript checks. Angular still does the routing.

## Get started

ngx-urlik needs Angular 22, and it isn't on npm yet. The form helpers live in `ngx-urlik/forms` and
need `@angular/forms`.

Your routes stay ordinary Angular routes. Name the ones your code talks to, and declare the values
each one keeps in the URL:

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

Then provide the router in place of `provideRouter()`:

```ts
bootstrapApplication(App, { providers: [provideAppRouter()] });
```

Now say the user is on `/results?search=oak&minRating=4`:

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

`params()` is a signal, so templates and `computed()`s that read it follow the URL. `patchQuery()`
changes only the fields you pass, in a single navigation. Here `minRating` went back to its default
of 0, so it dropped out of the URL. The link has no `search`, because `createUrlTree()` builds from
what you give it and nothing else.

The keys of `AppRouter.routes` are the enum's member names. Keep the enum private to the router
file: pages reach their routes through `AppRouter.routes`, and the enum exists so that Go to
Definition, Find References, and Rename on `routes.RESULTS` reach both the route and every place
that uses it. A plain string name can't do that.

Moving an existing app over? You can [do it one feature at a time](#adopt-it-one-feature-at-a-time).

### Coding agents

The package ships a skill that teaches coding agents how to use ngx-urlik. Agents won't find it on
their own, so point them to it from your `AGENTS.md` or `CLAUDE.md`:

```md
This app uses ngx-urlik for routing and URL state. Before you change routes, links, guards,
resolvers, or code that reads or writes the URL, read
node_modules/ngx-urlik/skills/ngx-urlik/SKILL.md and follow it. Read and write the URL through
AppRouter, not ActivatedRoute or Router. Declare new routes in the defineAppRouter() file.
```

In Claude Code, link the skill into your project. The link follows whichever version is installed:

```sh
mkdir -p .claude/skills
ln -s ../../node_modules/ngx-urlik/skills/ngx-urlik .claude/skills/ngx-urlik
```

## Ground rules

A handful of rules shape everything else in the library:

- **Each value is declared once.** A field lives on the route that owns it, with a codec that turns
  URL text into a value and back. Reads, links, patches, and forms all go through that one codec,
  so they can't disagree about what `?minRating=4` means.
- **Bad input doesn't take the page down.** `?minRating=abc` reads as the default and logs a
  warning.
- **A link holds what you put in it.** Nothing is copied from the current URL behind your back.
- **Forms hold drafts, and the URL holds what's been written.** What the user is typing stays in
  the form until it's ready to go to the URL.
- **The page decides how fields affect each other.** Clearing the rating filter on a new search is
  a rule for the page to state, not the route.
- **Angular still routes.** Matching, guards, resolvers, `routerLink`, and server rendering are all
  Angular's. ngx-urlik sits between your code and the URL, and that's all it does.

## Routes

A route is an Angular route with up to three extra fields:

| Field         | What it does                                                                               |
| ------------- | ------------------------------------------------------------------------------------------ |
| `routeName`   | Adds the route to `AppRouter.routes`                                                       |
| `pathParam`   | A codec for each `:placeholder` in the route's path. A placeholder without one is a string |
| `queryParams` | The query fields the route owns. Its children inherit them                                 |

Everything else works as it does in Angular. Write `path` and `routeName` as literals inside the
`defineAppRouter()` call, because that's where TypeScript reads your routes from. An array typed as
Angular's `Routes` still compiles, but it gives you no typed routes.

A route without a `routeName` is a plain Angular route. Redirects, wildcards, matchers, named
outlets, and `loadChildren` all work there, though none of them can take a name. A named route, for
its part, doesn't need a component.

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

Named routes show up flat in `AppRouter.routes`, and each one inherits the path and query fields of
every route above it, so `routes.SEASON` has both `showId` and `season`. A name can appear only once
in a route and its parents. A placeholder and a query field may share a name, though, since they
live apart, under `path` and `query`.

At `/shows/tv_1`, both `SHOW` and its empty-path child `SHOW_OVERVIEW` are active.

Codecs take part in matching, too. `/shows/tv_1/seasons/2` matches `SEASON`, but
`/shows/tv_1/seasons/abc` doesn't, so Angular moves on to the next route. This check runs before
the route's own `canMatch` guards.

### Lazy loading

Pages load lazily with `loadComponent`. Route definitions load with the app, which means a named
route, and every route above it, can't use `loadChildren`. The reason is `routerLink`: it needs a
`UrlTree` the moment it renders. A link to `/orders/4` needs the `orders/:orderId` path, and the
codec that writes `4`, long before anyone opens the orders feature.

If a lazy module has `providers`, move them to the route above the feature's pages, and Angular
will still create them on the first visit. `loadComponent` needs a standalone component, which
Angular's `ng generate @angular/core:standalone` can convert for you.

The route list is fixed once `defineAppRouter()` runs. Don't call `Router.resetConfig()`, or typed
routes will keep building URLs for routes Angular no longer has.

### One file for the whole app

Put every route in a single `defineAppRouter()` call. That file becomes a map of your app, with
every URL, its parameters, its guards, and the page it loads. It stays small, because the pages
themselves live elsewhere.

### Adopt it one feature at a time

Say each feature in your app is a lazy NgModule. You can move them over one at a time, and the app
keeps working at every step.

**1. Hand your routes to `defineAppRouter()`, and don't name anything yet.** Replace
`RouterModule.forRoot(routes)` or `provideRouter(routes)` with `provideAppRouter()`, and keep
importing `RouterModule` for `routerLink` and `<router-outlet>`:

```ts
enum RouteNames {}

export const { AppRouter, provideAppRouter } = defineAppRouter(RouteNames, { routes });

@NgModule({ imports: [RouterModule], exports: [RouterModule], providers: [provideAppRouter()] })
export class AppRoutingModule {}
```

The app behaves exactly as it did.

**2. Convert one feature.** Move its routes into the router file, and name the ones your code uses.
Load its pages with `loadComponent`, move its providers up a level, and delete its NgModule.
Features you haven't reached yet keep their `loadChildren`.

**3. Update pages as you go.** `ActivatedRoute` keeps working, since it's the same router
underneath, and the [ESLint rule](#flag-direct-router-use) tells you which pages are left:

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

Returning `null` means "I can't convert this", which is why `T` itself can't include `null`. The
same codec works in a path, in the query, and inside a list. In the query, the property name is the
URL key, and when a key repeats, the last one wins: `?minRating=1&minRating=4.5` reads as `4.5`.

| Codec                        | Accepts                                                                          |
| ---------------------------- | -------------------------------------------------------------------------------- |
| `stringCodec()`              | Any string, including `''`                                                       |
| `numberCodec()`              | Any number except `NaN`, like `4.5` or `-Infinity`                               |
| `booleanCodec()`             | `true` or `false`                                                                |
| `enumCodec(values)`          | One value from an array, a record, or any enum. `Status.Archived = 1` writes `1` |
| `listCodec(item, separator)` | `item` values joined by `separator`                                              |

`enumCodec()` takes strings and finite numbers, so string, numeric, and mixed enums all work, and
each value is written as its text. Two values can't share a text, so `enumCodec([1, '1'])` throws.

A path value can't be written as `''`, `.`, or `..`, because a path segment can't be empty and
browsers drop `.` and `..`.

### Lists

```ts
tags: queryParam({ codec: listCodec(stringCodec(), ','), defaultValue: [] });
```

`?tags=a,b` reads as `['a', 'b']`. An empty list writes `?tags=`, which keeps it apart from a
missing key, and that's what makes "select none" work even with `defaultValue: ['new']`. Without a
default, a missing key reads as `null`.

A backslash keeps a comma inside an item, so `['red, green', 'blue']` writes
`?tags=red%5C,%20green,blue`. Items can't be empty, which means `['']` can't be written.

### Write your own codec

Write a codec when a value has a format of its own. Your app writes the URL and reads it back, so a
codec only has to read the text it writes.

A date range, for example, can be short when it covers whole days. This codec writes
`2026-11-01..2026-11-15` for 1 to 15 November, and full timestamps for anything else:

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

`2026-11-01..2026-11-15` reads back as `2026-11-01T00:00:00.000Z` to `2026-11-15T23:59:59.999Z`,
and a range from 9:30 to 17:00 writes `2026-11-01T09:30:00.000Z..2026-11-01T17:00:00.000Z`. Both
ends are in UTC.

A codec can also match a format your API already speaks. Say the API takes paging as one value
made of the page number, the page size, and the total number of items, like `3,24,130`:

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

The URL holds `?paging=3,24,130`, and the same `pagingCodec.serialize()` writes that text into the
API request.

Every codec follows three rules:

- **One text per value.** The library compares text to tell whether a value changed.
- **Lose nothing.** `deserialize(serialize(value))` gives back a value equal to the one you wrote.
- **Stay pure, and don't call `inject()`.** Codecs often run outside an injection context.

Return `null` for a value you can't write, or for text you can't read. A query field is then left
out of the link, or reads as its default. A path value makes the link throw, or the route not match.

### Defaults and required fields

With `defaultValue: 0`, `/results` reads `minRating` as 0, and writing 0 takes it out of the URL.
Without a default, a missing field reads as `null`.

A default is a plain value, so `/results` shows the same page to everyone. When a fallback needs a
service, like the user's locale, it goes in the page:

```ts
// In the route: locale: queryParam({ codec: stringCodec() })
const locale = computed(() => results.params().query.locale ?? settings.locale());
```

`required: true` makes TypeScript insist on the field when you build a link, though a URL can still
arrive without it. To pass "no value", pass `null`, or `[]` for a list.

## Build links

```ts
const season = inject(AppRouter).routes.SEASON;
const link = season.createUrlTree({ path: { showId: 'tv_1', season: 2 }, fragment: 'episodes' });
await season.navigate({ path: { showId: 'tv_1', season: 2 } }, { replaceUrl: true });
```

`link` is `/shows/tv_1/seasons/2#episodes`, ready for `routerLink`, and `routerLinkActive` works
with it too.

You get exactly what you pass. The current query is never copied in, whatever Angular's
`defaultQueryParamsHandling` says. Every path value is required, the parents' included, while query
fields are optional unless they're `required`, and `undefined` ones are left out. There's no
relative navigation.

`navigate()` takes values first and Angular's navigation options second, so when nothing is
required you write `navigate({}, { replaceUrl: true })`. Every option works except `browserUrl`,
because it could show an address the route didn't build.

A query value that won't serialize is dropped with a warning. A path value has no fallback: if
`showId` is `''`, `createUrlTree()` throws and `navigate()` rejects. So check IDs that come from
data before you build links with them.

To keep the current filters, spread them in. On `/results?search=oak&minRating=4`, this link goes
to `/results?search=oak&minRating=5`:

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

Every named route has a `params` signal holding `{ path, query }`, inherited fields included. It
updates before Angular creates the new page, so a page's constructor already sees its own URL.
Reading a route that isn't active throws.

`params` fires only when a field's text changes, and a field whose text stayed the same keeps the
same object. Go from `?sort=title:asc&minRating=1` to `?sort=title:asc&minRating=4.5`, and `sort`
is still `===` the value you read before, so a `computed()` over `sort` returns the same value and
nothing that reads it runs again. For the same reason, don't change these objects in place.

The fragment isn't part of `params()`. You can set it in a link, but you can't read it back.

### In guards and resolvers

Guards run before the URL changes, so inside one, `params()` still shows the page you're leaving.
Read the destination from the snapshot Angular passes in:

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

`ifActive()` returns the route itself while it or one of its children is showing, and `null`
otherwise. On a page with no named route, like a `**` fallback, it's `null` for every route.
Because you read through the value it returned, you can't check one route and then read another by
mistake. In a template:

```html
@if (routes.EPISODE.ifActive(); as episode) {
<p>Episode {{ episode.params().path.episodeId }}</p>
}
```

Check nested routes deepest first, because a parent counts as active while its child shows. That
same rule is what makes nav highlighting work. With `BROWSE` above the movie and TV routes, this
link is active at `/movies`, `/tv`, and `/tv/brambleworth-manor/s/2`:

```html
<a [routerLink]="browseUrl" [class.active]="appRouter.routes.BROWSE.ifActive()">Browse</a>
```

Fields that several routes share belong on their parent. If `BROWSE` declares `search` and
`minRating`, then `BROWSE.params()` and `BROWSE.patchQuery()` work on every page under it.

### Values on every page

Some code needs a value on whatever page is showing: a service that tracks a campaign tag like
`?source=`, say, or one that follows the workspace in `/w/:workspaceId/...`. `globalParams()` reads
both:

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

A path value comes from whichever active route has that placeholder, named or not, and is `null`
when none does. Query fields work as they do on routes. Nothing here throws, the result is
read-only, and it works outside an injection context. In a guard, use
`globalParamsSnapshot(definitions, route)`, which works on routes without a name too.

### Remember values yourself

ngx-urlik doesn't save values between visits, but your app can, with `globalParams()`. TasteTrack's
`preferences.ts` remembers the page size and each show's last season this way.

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

Give a remembered query field no default. A value at its default leaves the URL, so with a default,
`/movies` can't tell "picked the grid view" from "never picked one". Without a default, the key is
there only when someone set it. Save it the same way, and fall back where the page reads it:

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

Keep the `UrlTree` return type. This route sits inside the call that creates `AppRouter`, and
without the annotation TypeScript can't work out either type.

## Write the query

Start on `/results?sort=new&search=oak&minRating=4`, where the route doesn't declare `sort`:

```ts
await results.patchQuery({ search: 'elm', minRating: 0 });
// /results?sort=new&search=elm
```

`minRating` went back to its default, so it left the URL. `sort` stayed, because a patch never
touches keys it doesn't know, and so did the fields you left out, the path, and the fragment. To
clear a field, set it to its default or to `null`.

Each patch is one Angular navigation, built from the URL at the moment you call it. A new
navigation cancels the one in progress, so two patches in a row don't add up:

```ts
void results.patchQuery({ search: 'elm' });
void results.patchQuery({ minRating: 4.5 }); // cancels the first: only minRating=4.5 is left
```

Put fields that change together in one patch. The promise tells you how it went:

| What happened                             | The promise      |
| ----------------------------------------- | ---------------- |
| It worked, or the URL already matched     | Resolves `true`  |
| A guard said no                           | Resolves `false` |
| Something else navigated first            | Resolves `false` |
| The route wasn't active, or Angular threw | Rejects          |

## Bind a form

A form holds what the user is typing, and the URL holds what's been written. ngx-urlik keeps the
two in step, for both Reactive Forms and Signal Forms. Forms cover query fields, not the path.

```ts
import { createQueryParamsFormGroup } from 'ngx-urlik/forms';

const filters = createQueryParamsFormGroup(results);
filters.patchValue({ search: 'elm', minRating: 0 });
```

You get one non-nullable `FormControl` per field, with no validators. If you need validators,
build the group yourself and call `bindQueryParamsToFormGroup(results, group, options)`.

```ts
import { createQueryParamsSignalForm } from 'ngx-urlik/forms';

const { model, form } = createQueryParamsSignalForm(results);
model.update((query) => ({ ...query, search: 'elm' }));
```

The Signal Forms version gives you a writable model and a `FieldTree`. To bind a form you built
yourself, call `bindQueryParamsToSignalForm(results, form, options)`.

Create a form in an injection context while its route is active, and it cleans up when that
context is destroyed. If the route stops showing first, the form keeps its values, and the next
edit fails as an error, because there's no active route to write to.

The binding behaves the way you'd want a search box to:

- `patchValue({ search: 'elm', minRating: 0 })` is one navigation, not two.
- Writes replace the current history entry, so typing `elm` doesn't leave three stops for Back.
- A field takes a value from the URL only when the URL's value for that field changes, so a rating
  change leaves a half-typed search alone.
- Every write carries all the fields where the form differs from the URL. If a link click cancels
  one write, the next write still sends what the user typed.

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

The user types `elm` and pauses, and the search writes 300 ms later. Other fields still write right
away. If the user presses Back to `?search=oak` while `elm` is waiting, the input shows `oak` and
`elm` is dropped.

### Skip a too-short search

```ts
createQueryParamsSignalForm(results, {
  schema: (fields) => minLength(fields.search, 3),
  writeWhen: 'valid',
});
```

Typing `el` writes nothing, and `elm` writes. Clearing the box writes an empty search, because
Angular's length validators accept empty values. Each field is judged on its own, so a bad search
never holds up a rating change.

### Clear the rating filter on a new search

Only your page knows this rule, so it goes in `beforeWrite`:

```ts
createQueryParamsFormGroup(results, {
  debounce: { search: 300 },
  beforeWrite: (patch) => ('search' in patch ? { minRating: 0, ...patch } : patch),
});
```

On `/results?minRating=4`, typing `elm` makes a single navigation, to `/results?search=elm`.
Without a form, put both fields in one patch: `patchQuery({ search, minRating: 0 })`.

`beforeWrite(patch, draft)` runs right before the navigation, after any debounce and after
`writeWhen` has held back invalid fields. `patch` holds only the fields about to be written, and
`draft` holds the whole form. Whatever you return is what gets written, and a field set to
`undefined` keeps its URL value. Use it to change other fields, not the value the user typed.

### When a write fails

A guard can decline a write, or something can throw. Either way the form keeps what the user typed
until that field's URL value changes. Nothing retries on its own, but the form's next write carries
the field again. `onWriteFailure` receives `{ kind: 'declined' }` or `{ kind: 'error', error }`.

## Diagnostics and errors

A value the codec can't read falls back to the default and logs a warning. On
`/results?minRating=abc`, `minRating` reads as 0, and you get:

```ts
{
  code: 'PARAM_DESERIALIZE_FAILED',
  route: 'RESULTS',
  parameter: 'minRating',
  operation: 'deserialize',
  message: '…',
}
```

A codec that fails to write reports `PARAM_SERIALIZE_FAILED`, and when a codec throws, its error is
in `cause`. Warnings go to `console.warn` unless you pass `diagnostics: { warn }` to
`defineAppRouter()`.

Only two things throw, because neither has a sensible fallback: reading an inactive route, and
building a link with a bad path value.

When the app starts, `defineAppRouter()` checks every named route, every route above one, and every
route with `pathParam` or `queryParams`. It then throws one error that lists every problem it
found:

- Repeated or empty route names.
- A `routeName` that isn't in your route names enum, or a member that no route uses.
- Names on redirects, wildcards, or matchers.
- `loadChildren` on or above a named route.
- Paths that aren't plain strings in the primary outlet, or that have empty segments or reserved
  characters.
- `pathParam` maps that don't match the placeholders.
- `queryParams` values that `queryParam()` didn't make.
- `queryParams` on a route with no named route at or below it, because nothing could read them.
- A placeholder or query key declared twice in a route and its parents.

TypeScript catches many of these before the app ever runs, and Angular still checks its own route
config on top.

## Work with Angular Router

`provideAppRouter(...features)` passes Angular's router features through, like
`withRouterConfig({ paramsInheritanceStrategy: 'always' })`. Typed routes read parent values
themselves, so any `paramsInheritanceStrategy` works. Angular still picks the route, so route order
matters as usual. Server rendering works too, with `params()` reading the requested URL, though
code that touches `localStorage` needs a browser check there.

### Escape hatch

For URLs outside your typed routes, `AppRouter.escapeHatch` gives you Angular's own
`createUrlTree`, `navigate`, `navigateByUrl`, `parseUrl`, `serializeUrl`, and `isActive`, along
with read-only `url`, `events`, `navigated`, `currentNavigation`, `lastSuccessfulNavigation`, and
`componentInputBindingEnabled`.

You can still inject Angular's `Router`, but calls through it skip the typed routes.

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

When a use is deliberate, keep it with an `eslint-disable-next-line` comment that says why.

## Types

The helper types take a route's type:

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

Change the movie genres, the sort, and the page size, then reload. The filters come back, because
they live in the URL. Then open Brambleworth Manor, season 2, episode 1. The URL reads
`/tv/brambleworth-manor/s/2/e/1`, because the ID codec drops the `tv_` prefix when it writes and
adds it back when it reads.

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

[Design decisions](docs/decisions.md) explains why the library works the way it does, and what each
choice costs. [Reading the code](docs/implementation.md) shows where everything lives.

## License

[MIT](LICENSE)
