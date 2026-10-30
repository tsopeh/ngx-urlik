# ngx-urlik

ngx-urlik gives your Angular routes names and typed parameters. You read the URL through a signal.
You change it with a patch. You build links from the same object. Angular Router still does the
matching and the navigating.

This README follows one page the whole way through: a search results page at `/results`.

- [Get started](#get-started)
- [Routes](#routes)
- [Codecs and query fields](#codecs-and-query-fields)
- [Build links](#build-links)
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

The library targets Angular 22. It is not on npm yet. The router comes from `ngx-urlik`. The form
bindings come from `ngx-urlik/forms`, which needs `@angular/forms`.

### Define the routes

List your route names in an enum. Pass the enum and Angular's usual route array to
`defineAppRouter()`. Give `routeName` to each route you want to use from code:

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

`RESULTS` is the name in your code. `results` is the URL path. Go to Definition on `routes.RESULTS`
jumps to the enum member. The route declaration uses the same member, so you land next to it.

Provide the router when you bootstrap:

```ts
bootstrapApplication(App, { providers: [provideAppRouter()] });
```

### Read, write, and link

Say the user is on `/results?search=oak&page=4`.

```ts
const results = inject(AppRouter).routes.RESULTS;

results.params().query; // { search: 'oak', page: 4 }

await results.patchQuery({ search: 'elm', page: 1 });
// URL is now /results?search=elm

const link = results.createUrlTree({ query: { page: 2 } });
// link points to /results?page=2
```

```html
<a [routerLink]="link">Page 2</a>
```

`params` is a readonly signal of the current URL. It holds `{ path, query }`.

`patchQuery` edits the URL you are on. It changed two fields in one navigation. `page=1` left the
URL because 1 is the default.

`createUrlTree` builds a fresh URL from only what you pass. The link has no `search=elm`. It never
copies the current filters.

Have an existing app? [Adopt it one feature at a time](#adopt-it-one-feature-at-a-time).

### Coding agents

The package ships an agent skill at `node_modules/ngx-urlik/skills/ngx-urlik/SKILL.md`. It tells a
coding agent how to read, write, and link with ngx-urlik, and how to move a page off
`ActivatedRoute`.

An agent only uses the skill if it knows about it. Paste this into your agent's project
instructions, such as `AGENTS.md` or `CLAUDE.md`:

```md
This app uses ngx-urlik for routing and URL state. Before you change routes, links, guards,
resolvers, or code that reads or writes the URL, read
node_modules/ngx-urlik/skills/ngx-urlik/SKILL.md and follow it. Read and write the URL through
AppRouter, not ActivatedRoute or Router. Declare new routes in the defineAppRouter() file.
```

Agents that load skills from a folder can use it directly. For Claude Code, link it into the
project:

```sh
mkdir -p .claude/skills
ln -s ../../node_modules/ngx-urlik/skills/ngx-urlik .claude/skills/ngx-urlik
```

The link follows the installed version, so the skill always matches the library you run.

## Routes

`AppRouter.routes` is flat, even when your routes are nested. A named child gets the path and query
fields of every route above it. That includes routes without a name.

A route without `routeName` is a plain Angular route. It gets no entry in `AppRouter.routes`. It can
use anything Angular offers: redirects, wildcards, matchers, named outlets, `loadChildren`. If no
route uses an ngx-urlik field, Angular gets your array untouched.

### Fields added to Angular routes

| Field         | What it does                                                                                                                                           |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `routeName`   | Adds an entry to `AppRouter.routes`. Each name must be unique. A duplicate makes `defineAppRouter()` throw and name both routes. The URL is unchanged. |
| `pathParam`   | Sets codecs for the placeholders in this route's `path`. It can also set `persist`. Without it, placeholders are strings.                              |
| `queryParams` | Declares the query fields this route owns. Children inherit them. A key can be declared only once along a chain.                                       |
| `isEqual`     | Decides when the route's `params` signal counts as changed. Children inherit it. It does not affect what a patch reads.                                |

Angular fields like `component`, `loadComponent`, and `canActivate` stay where they always are. Any
other unknown key is a type error.

Write `path` and `routeName` as literals. TypeScript needs the literals to infer the routes. If you
first type the array as Angular's `Routes`, it still compiles. You just get no typed routes.

### Named routes

A named route needs a path that is known when the app starts. It cannot use `loadChildren`, and
neither can the routes above it. Those routes must list their children directly. Components can
still load lazily with `loadComponent`. A named route does not need a component.

The route list is fixed once you call `defineAppRouter()`. Don't swap routes with
`Router.resetConfig()`. Nothing catches it. The old typed routes would keep building URLs for routes
Angular no longer has.

### One file for the whole app

We recommend declaring every route in one `defineAppRouter()` call, in one file. That file becomes
the map of your app: each URL, its parameters, its guards, and the page it loads. TypeScript checks
each named route against the routes above it. A child that declares a query key its parent already
owns is a type error right there.

The file stays small, because it doesn't hold your pages. Each page loads lazily with
`loadComponent`, so its code stays in its own chunk.

Moving a large app into one file at once is a lot of work. You don't have to.
[Adopt it one feature at a time](#adopt-it-one-feature-at-a-time) shows how to get there in steps.

### Lazy loading

| What you use                                      | With ngx-urlik                                                                            |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `loadComponent`                                   | Works on any route. This is how a typed page loads lazily                                 |
| `loadChildren` on an unnamed route                | Works as in Angular. The routes it loads are plain Angular routes, with no typed entries  |
| `loadChildren` on a named route, or above one     | `defineAppRouter()` throws                                                                |
| `providers` of a lazy feature module              | Move them to the route above the feature's pages. Angular creates them on first visit too |
| `loadComponent` with a component from an NgModule | Angular rejects it: the component must be standalone                                      |

A component declared in an NgModule can still go in `component`. It then loads with the app. To keep
it lazy, make it standalone first. Angular's `ng generate @angular/core:standalone` schematic does
that.

Why can't route definitions load lazily? The types could follow a lazy import: TypeScript reads the
imported file either way. The runtime can't. A link to `/orders/4` has to be built before anyone has
opened the orders feature, so the path and the codec for `4` must already be loaded. `routerLink`
takes the `UrlTree` right away; it can't wait for a chunk. Startup checks, the
[restore routes for remembered path values](#remember-a-path-value), and `clearPersisted()` also need
every route up front. So the definitions load with the app, and the pages load lazily.

### Adopt it one feature at a time

Say you have this app. Each feature is a lazy NgModule with its own routing module:

```ts
// app-routing.module.ts
const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'orders' },
  {
    path: 'orders',
    loadChildren: () => import('./orders/orders.module').then((m) => m.OrdersModule),
  },
  {
    path: 'settings',
    loadChildren: () => import('./settings/settings.module').then((m) => m.SettingsModule),
  },
  { path: '**', component: NotFoundPage },
];

@NgModule({ imports: [RouterModule.forRoot(routes)], exports: [RouterModule] })
export class AppRoutingModule {}

// orders/orders-routing.module.ts
const routes: Routes = [
  { path: '', component: OrderListPage },
  { path: ':orderId', canActivate: [orderExists], component: OrderDetailPage },
];

@NgModule({ imports: [RouterModule.forChild(routes)], exports: [RouterModule] })
export class OrdersRoutingModule {}

// orders/orders.module.ts
@NgModule({
  declarations: [OrderListPage, OrderDetailPage],
  imports: [CommonModule, OrdersRoutingModule],
  providers: [OrdersApi],
})
export class OrdersModule {}
```

**1. Hand the routes to `defineAppRouter()`, naming nothing.**

```ts
// app-routing.module.ts
export enum RouteNames {}

export const { AppRouter, provideAppRouter } = defineAppRouter(RouteNames, { routes });

@NgModule({ imports: [RouterModule], exports: [RouterModule], providers: [provideAppRouter()] })
export class AppRoutingModule {}
```

`provideAppRouter()` replaces `RouterModule.forRoot()`. It sets up Angular's router, so don't keep
both. Importing `RouterModule` without `forRoot()` still gives declared components `routerLink` and
`<router-outlet>`. In a standalone app, swap `provideRouter(routes)` for `provideAppRouter()` the
same way.

No route uses an ngx-urlik field yet, so Angular gets your array untouched. The app works as before.

**2. Convert one feature.** Move its routes into the router file. Name the routes you want to use
from code. Load each page with `loadComponent`. Move the feature module's providers to the route
above its pages:

```ts
export enum RouteNames {
  ORDERS = 'ORDERS',
  ORDER = 'ORDER',
}

export const { AppRouter, provideAppRouter } = defineAppRouter(RouteNames, {
  routes: [
    { path: '', pathMatch: 'full', redirectTo: 'orders' },
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
    // Not converted yet. It stays lazy and untyped.
    {
      path: 'settings',
      loadChildren: () => import('./settings/settings.module').then((m) => m.SettingsModule),
    },
    { path: '**', component: NotFoundPage },
  ],
});
```

`orders.module.ts` and `orders-routing.module.ts` go away. `OrderListPage` and `OrderDetailPage`
became standalone, so they can load lazily.

**3. Move the pages over.** A page that still reads `ActivatedRoute` keeps working. It reads the same
URL as the typed routes. Change pages one at a time:

```ts
// Before
const orderId = toSignal(
  inject(ActivatedRoute).paramMap.pipe(map((params) => Number(params.get('orderId')))),
);

// After
const order = inject(AppRouter).routes.ORDER;
const orderId = computed(() => order.params().path.orderId); // number
```

One thing to watch while both styles live side by side: a call through Angular's `Router` skips the
write queue. It also cancels writes still waiting in it, as any outside navigation does. See
[One write at a time](#one-write-at-a-time). The [ESLint rule](#flag-direct-router-use) lists the
places still left to change.

**4. Repeat for each feature.** When the last one is in, the router file is the whole map.

#### Routes that already live in a `Routes` array

If your routes sit in one array typed as Angular's `Routes`, you can name routes in front of it
before you move anything:

```ts
defineAppRouter(RouteNames, {
  routes: [{ path: 'results', routeName: RouteNames.RESULTS, component: ResultsPage }, ...routes],
});
```

`routes.RESULTS` is typed. Named routes have to come before the spread. After it, TypeScript can't
see them. The spread also costs you the compile-time checks on the named routes. A mistake such as a
`pathParam` key that isn't in the path is caught when `defineAppRouter()` runs instead. Treat this as
a stopgap and move routes into the literal array as you convert them.

### Paths and placeholders

Placeholders use Angular's `:name` syntax, as in `shows/:showId/seasons/:season`. With one
placeholder, `pathParam` can be `{ codec }` or `{ showId: { codec } }`. With several, give a map with
one `{ codec }` per placeholder.

You must supply every path value when you build a link. A placeholder name can appear only once
along a chain. A placeholder and a query field can share a name. State keeps them apart under `path`
and `query`.

A path codec also decides whether the route matches. Take `items/:id` with `numberCodec()`.
`/items/42` matches. `/items/abc` does not, so Angular tries the next route. Add `items/:slug` or a
wildcard if `/items/abc` should show something. This check runs before the route's own `canMatch`
guards.

### Landing content

Sometimes a route needs its own page and child pages. Give it an empty-path child:

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

At `/account/7`, both `ACCOUNT` and `ACCOUNT_OVERVIEW` are active. `activeRoute()` reports the
deeper one, `ACCOUNT_OVERVIEW`. At `/account/7/settings`, it reports `ACCOUNT_SETTINGS`. The empty
child builds the same URL as its parent.

## Codecs and query fields

A codec turns one URL string into a value, and back:

```ts
interface UrlParamCodec<T> {
  serialize(value: T): string | null;
  deserialize(raw: string): T | null;
}
```

Returning `null` means "this didn't convert". So `T` itself can't include `null` or `undefined`.
Keep codecs pure. Don't call `inject()` inside one.

One codec works for a placeholder and a query field alike:

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

The property name is the URL key. `search` above lives at `?search=`.

### Built-in codecs

| Codec                        | Accepts                                                                                                                                         |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `stringCodec()`              | Any string. That includes an empty value that is present, like `?search=`                                                                       |
| `numberCodec()`              | A whole decimal number: `-1.5`, `.5`, `1e3`, `Infinity`, `-Infinity`. Not `NaN`, hex, whitespace, an empty string, or a partial one like `12px` |
| `booleanCodec()`             | Exactly `true` or `false`, lowercase                                                                                                            |
| `enumCodec(values)`          | A value from a readonly string array, tuple, or string record. Throws on creation if any value isn't a string                                   |
| `listCodec(item, separator)` | `item` values joined by `separator`. `''` is the empty list. Throws on creation if the separator is empty                                       |

A numeric TypeScript enum fails `enumCodec`. Its reverse mapping adds numbers to the values.

A path segment can't be empty. Building a URL whose path value turns into `''` fails.

For dates, objects, or stricter rules like "positive integers only", write your own codec.

### Single and repeated values

When a key appears twice, a single field takes the last one. `?page=1&page=2` reads as `2`.

An array can sit in the URL two ways:

| Definition                                                       | URL            | Reads as     |
| ---------------------------------------------------------------- | -------------- | ------------ |
| `repeatedQueryParam({ codec })`                                  | `?tag=a&tag=b` | `['a', 'b']` |
| `queryParam({ codec: listCodec(codec, ','), defaultValue: [] })` | `?tag=a,b`     | `['a', 'b']` |

With repeated keys:

- No key reads as the default, or `[]`.
- Empty items stay if the codec accepts them. `?tag=` reads as `['']` with `stringCodec()`.
- One bad item spoils the whole array. It reads as the default, or `[]`.

With a list, the field is a single field, so single-field rules apply:

- Give it `defaultValue: []`. Without one, no key reads as `null`.
- A repeated key keeps the last one. `?tag=a&tag=b,c` reads as `['b', 'c']`.
- Angular encodes the joined string as a whole, not item by item.
- An empty item fails. `?tag=a,,b` reads as the default and reports a diagnostic.
- An item containing the separator fails too. Writing `['a,b']` with `,` drops the field and
  reports a diagnostic.

### Defaults and required fields

```ts
queryParam({ codec: stringCodec(), defaultValue: 'en' });
queryParam({ codec: stringCodec(), defaultValue: () => inject(LocaleSettings).locale() });
```

A missing or broken value reads as the default. With `page` defaulting to 1, `/results` and
`/results?page=abc` both read `page` as 1.

A value equal to the default stays out of the URL. Patch `page` to 1 and `page` leaves the URL. The
one exception is a [persisted field](#remember-values-in-storage), which always shows.

A default can be a function. It runs synchronously, in the injection context of the environment
that provided the router. It runs on every read and every write. So if it reads a signal, the state
can change without any navigation. If it throws, the error goes up to you. It is not treated as a
bad URL.

With no default, a single field reads as `null` and an array as `[]`. Every declared field is always
in the state. A field with a default never reads as `null`.

`required: true` means callers must pass the field when they build a link. TypeScript checks this.
Nothing checks at runtime. The URL doesn't need the key, and reading works the same. To say "no
value" on purpose, pass `null` for a single field or `[]` for an array. Path values are always
required and never `null`.

## Build links

```ts
const user = inject(AppRouter).routes.USER;
const link = user.createUrlTree({ path: { userId: '42' }, fragment: 'profile' });
await user.navigate({ path: { userId: '42' } }, { replaceUrl: true });
```

`link` is `/users/42#profile`.

You pass every path value along the chain, including ones from parent routes. Query fields are
optional unless marked `required`. The result depends only on what you pass. It never copies the
current query. Angular's `defaultQueryParamsHandling` doesn't change that. There is no relative
navigation. Parent query fields come before child ones, in the order you declared them.

`createUrlTree()` returns a `UrlTree`. Path values have no fallback. If a path codec returns a
non-string, throws, or gives an empty segment, `createUrlTree()` throws. `navigate()` rejects and
never calls Angular. The error names the route and the placeholder. The codec's own error is in
`cause`. A query value that won't serialize is different. It is dropped and reported, and the rest
of the URL is built.

`navigate()` takes the URL values first and the options second. With nothing required, pass `{}` or
`undefined` first: `navigate({}, { replaceUrl: true })`. It takes Angular's navigation options,
except `browserUrl`. That one could show an address other than the typed one.

`fragment` takes a string or `null`. It has no codec. It doesn't show up in `params()`.

Hand the `UrlTree` to Angular's `RouterLink`. `RouterLinkActive` works too. There is no special link
directive.

## Read state

```ts
const results = inject(AppRouter).routes.RESULTS;
const query = computed(() => results.params().query);
```

Each named route has one `params` signal. It holds `{ path, query }`, inherited fields included. It
reads the state Angular has committed.

Angular commits the new state and creates the new components before it emits `NavigationEnd`. So
when a page's constructor reads `params()`, it sees its own URL, not the page it replaced.

Reading a route that isn't active throws.

### Guards and resolvers

A guard runs before Angular commits the new URL. There, `params()` still shows the page you are
leaving. Read the destination from the snapshot Angular hands you:

```ts
export const seasonResolver: ResolveFn<Season> = (route) => {
  const { path } = inject(AppRouter).routes.SEASON.paramsFrom(route);
  return inject(SeasonApi).load(path.showId, path.season);
};
```

`paramsFrom(snapshot)` uses the same codecs and defaults as `params()`. Any snapshot from that
navigation works, so a child's guard can read its parent. It throws if the snapshot's tree doesn't
contain the route.

### One component, several routes

Say one detail page serves both movies and episodes. Name the routes it handles:

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

You get a readonly signal of `{ route, node, params, createUrlTree, patchQuery }`. Checking `route`
narrows the rest. The deepest active route wins, whatever order you list them in. If two names point
at the same route, the first name is used. Only named routes can be listed. Reading while none is
active throws.

`patchQuery` is the active route's `patchQuery`.

`createUrlTree({ query, fragment })` works differently from the one on a route. It starts from the
current path and query, then applies your fields. On `/results?search=oak&page=4`,
`createUrlTree({ query: { page: 5 } })` gives `/results?search=oak&page=5`. That's what you want for
a "next page" link. The fragment comes only from what you pass.

### Query fields no single page owns

Fields a page owns go on its route. Some fields follow you across every page, like a campaign tag.
A service can read those on its own:

```ts
const campaign = router.globalQueryParams({
  source: queryParam({ codec: stringCodec() }),
});
campaign().source;
```

On `/results?source=newsletter`, `campaign().source` is `'newsletter'`.

You get a readonly signal of the query object. There is no `query` wrapper. Codecs, defaults, and
timing work as they do on routes. No route needs to be active. Before the first navigation ends, it
reads the current snapshot. Diagnostics name `globalQueryParams` as the route.

Each observer uses its own definitions. Share the definition objects if two observers should agree.
`required` and `persist` do nothing here. An observer doesn't register its fields with any route.
Navigation won't keep them, and nothing writes them back. There is no write method.

A second argument, `{ isEqual }`, compares the whole query. Once you have the router, you can create
an observer anywhere, not just in an injection context. The router owns the subscription. You don't
clean anything up.

### Equality

`isEqual()` is the default comparator. You can import it from `ngx-urlik`.

- Primitives compare with `Object.is`.
- Prototypes must match.
- Dates compare by time. Two invalid dates are not equal.
- Maps compare by entries. Keys match by identity.
- Sets compare by members. Each member matches one deeply equal member.
- Arrays and other objects compare by their own enumerable keys, strings and symbols, all the way
  down.
- Objects that point to themselves compare by structure.

A route uses its parent's `isEqual` unless it sets its own. It only decides when the signal fires.
Patches and forms always read the latest URL, so an old signal value never leaks into a write.

## Write the query

```ts
await results.patchQuery({ search: 'elm', page: 1 });
await results.patchQuery((query) => ({ page: query.page + 1 }));
```

Start on `/results?sort=new&search=oak&page=4`. `sort` isn't declared on the route.

The first patch gives `/results?sort=new&search=elm`. `search` changed. `page` hit its default, so
it left. `sort` stayed, because a patch never drops keys it doesn't know.

The second patch reads `page` as 1 and gives `/results?sort=new&search=elm&page=2`.

The rules:

- A patch changes only the fields you give it.
- A field you leave out, or set to `undefined`, stays as it is.
- To clear a field, set it to its default. Use `null` for a field without one, or `[]` for an array.
- The path, the fragment, fields owned by child routes, and unknown keys stay.
- `patchQuery` takes `{ replaceUrl?: boolean }`.

A patch also rewrites every field the route declares. So it cleans up the rest of the URL as it
goes. After any patch, `?page=abc` and `?page=1` both disappear, and `?page=02` becomes `?page=2`.

### One write at a time

Every route and every form shares one write queue. Each write waits for the one before it to
finish. Then it applies to the URL that write left behind.

Say a search box and a sort menu both write in the same moment. The search box sets `search=elm`.
The sort menu sets `order=price`. The URL ends up with both. With two plain `router.navigate()`
calls, each would build from the URL it saw first. The second would wipe out the first.

A function patch runs once, when its turn comes. It gets the latest URL. It never runs right away.
Return only what changes; you don't need to spread the old query. If two writes set the same field,
the later one wins. If the route isn't active when the turn comes, the promise rejects.

The promise tells you how the navigation went:

| What happened                                 | Result                                                                             |
| --------------------------------------------- | ---------------------------------------------------------------------------------- |
| It worked                                     | Resolves `true`                                                                    |
| A guard said no, or the URL was the same      | Resolves `false`. Later writes still run                                           |
| The patch function or the navigation threw    | Rejects. Later writes still run                                                    |
| Some other navigation started                 | Waiting writes resolve `false` without running. New ones do too, until it finishes |
| A guard or redirect changed one of our writes | Waiting writes resolve `false`. The running write gets Angular's result            |
| The router's environment was destroyed        | Waiting and running writes resolve `false`                                         |

"Some other navigation" means anything the queue didn't start. A link click. The Back button. A call
through Angular's `Router`. It cancels waiting writes the moment it starts, even if a guard blocks it
later. Why: the user is trying to leave. A stale edit shouldn't pull them back. The app's first
navigation counts too. Writes sent before it ends resolve `false`.

## Bind a form

The form holds what the user is typing. The URL holds what was saved. Both Angular form systems
work. A form binds the active route's query fields. Path values aren't part of the form. Import from
`ngx-urlik/forms`. Create or bind the form in an injection context while its route is active. It
cleans up through `DestroyRef`.

### Reactive Forms

```ts
import { createQueryParamsFormGroup } from 'ngx-urlik/forms';

const filters = createQueryParamsFormGroup(results);
filters.patchValue({ search: 'elm', page: 1 });
```

You get one non-nullable `FormControl` per query field. Arrays get array-valued controls. Nested
groups and `FormArray` aren't supported. No validators are added. To add validators or control
options, build the group yourself. Then call `bindQueryParamsToFormGroup(results, group, options)`.

### Signal Forms

```ts
import { maxLength } from '@angular/forms/signals';
import { createQueryParamsSignalForm } from 'ngx-urlik/forms';

const { model, form } = createQueryParamsSignalForm(results, {
  schema: (fields) => maxLength(fields.search, 100),
});
model.update((query) => ({ ...query, search: 'elm' }));
```

You get a writable model and an Angular `FieldTree`. Already have a field tree? Call
`bindQueryParamsToSignalForm(results, form, options)`.

### How a form writes

The form starts with the URL's values.

`patchValue({ search: 'elm', page: 1 })` is one write, not two. Signal Forms read the model in an
effect. Model updates made before that effect runs go out as one write.

Form writes replace the current history entry. So typing `elm` doesn't leave three Back-button
stops. Pass `replaceUrl: false` if you want them.

Writes from elsewhere update other fields. They don't touch what the user is typing, or whether a
field is touched or dirty.

After a write, the form keeps what the user typed if it means the same URL value. Say the codec
trims. The user types `'elm '`. The URL gets `?search=elm`. The input keeps its trailing space.

The Back button, or any other outside navigation, cancels pending edits as soon as it starts. The
form resets to the URL's values, pristine and untouched. That happens even if a guard then blocks the
navigation. When the navigation finishes, the form resets again.

### Delay a field

In Signal Forms, use Angular's own `debounce()` rule. The model updates when the delay ends. The URL
updates then too:

```ts
import { debounce } from '@angular/forms/signals';

const { form } = createQueryParamsSignalForm(results, {
  schema: (fields) => debounce(fields.search, 300),
});
```

The rule applies to input through the `[formField]` directive. A direct `model.update(...)` isn't
delayed.

Reactive Forms have no debounce, so the binding gives you one:

```ts
const filters = createQueryParamsFormGroup(results, { debounce: { search: 300 } });
```

The user types `elm` and stops. 300 ms later, the search writes. Other fields write right away. They
don't flush or replace the pending search. Outside navigation drops the pending write. So does
destroying the binding.

### Hold invalid input

By default, every change writes. With `writeWhen: 'valid'`, a field writes only while its validators
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

Typing `el` writes nothing. Typing `elm` writes. Clearing the box writes an empty search, because
Angular's length validators accept empty values.

Each field is judged alone. A bad search doesn't block a good page change. A field waiting on an
async validator writes once it passes. A held field keeps its draft until it becomes valid, the user
edits it, or an outside navigation resets the form. Reactive Forms take the same option. Put the
validators on the controls.

### Change other fields before a write

A new search should usually go back to page 1. Only your page knows that. So the binding asks you,
through `beforeWrite`:

```ts
const filters = createQueryParamsFormGroup(results, {
  debounce: { search: 300 },
  beforeWrite: (patch) => ('search' in patch ? { page: 1, ...patch } : patch),
});
```

The user is on `/results?page=4` and types `elm`. One navigation goes to `/results?search=elm`. The
page control shows 1.

Changing just the page writes the page as is. `patch` is spread last, so
`patchValue({ search: 'elm', page: 3 })` keeps page 3. Signal Forms take the same option. Without a
form, set both in one patch: `patchQuery({ search, page: 1 })`.

`beforeWrite(patch, draft)` runs right before the write is queued. That's after `writeWhen` has held
back invalid fields, and after any delay has ended. `patch` has only the fields about to be written.
`draft` is the whole form. Whatever you return is written. An `undefined` field keeps its URL value,
as in `patchQuery()`.

Use `beforeWrite` for other fields. Shape a field's own value in its codec. Here's why. Say
`beforeWrite` trims `search`. The URL value then differs from what the user typed. The URL value
wins and replaces the draft. Fields that `beforeWrite` adds aren't drafts either. After the write,
the form reads them from the URL.

### Failed writes

A failed write keeps what the user typed. It isn't retried. `onWriteFailure` gets
`{ kind: 'declined' }` or `{ kind: 'error', error }`. Without that callback, errors go to Angular's
`ErrorHandler`, and declines are silent.

If `beforeWrite` throws, the error goes to `ErrorHandler`, not `onWriteFailure`. Nothing is written.
The edited fields keep their drafts.

Destroying a binding cancels its waiting writes. It doesn't stop a navigation that already started.

## Remember values in storage

Say the user sets the page size to 48. Later they follow a plain link to `/results`. You want 48
again, not the default 24.

```ts
pageSize: queryParam({
  codec: numberCodec(),
  defaultValue: 24,
  persist: { key: 'pageSize', storage: 'local' },
}),
```

The user visits `/results?pageSize=48`. `localStorage` now holds `48` under `ngx-urlik:pageSize`.
Next time they go to `/results`, they land on `/results?pageSize=48`.

### Persist options

| Option    | Meaning                                                                                         |
| --------- | ----------------------------------------------------------------------------------------------- |
| `key`     | Names the stored value. Fields with the same key share one value, even on different routes      |
| `storage` | `'local'` for `localStorage`, which outlives the tab. `'session'` for `sessionStorage`, one tab |
| `scope`   | Optional. Path parameter names whose values make the key more specific                          |

Only `queryParam` with a `defaultValue` can persist. A persisted field always has a value in the URL,
and `null` has no URL text.

`repeatedQueryParam` can't persist. An empty array has no URL keys. Use a list instead:
`queryParam({ codec: listCodec(stringCodec(), ','), defaultValue: [], persist })`. The empty list is
written as `?tags=`. TypeScript rejects both mistakes, and `defineAppRouter()` checks again at
runtime.

`scope` stores one value per path value. On `users/:userId`, a `tab` field with `scope: ['userId']`
stores user 7's tab under `ngx-urlik:tab:7`. User 8 gets `ngx-urlik:tab:8`. A query field's scope can
name any path parameter in its chain.

The storage key is `${prefix}${key}`. With a scope, it's `${prefix}${key}:${values}`. Each scope
value is the raw path segment through `encodeURIComponent`. The values are joined with `:`.

So a key can't contain `:`. Otherwise `clearPersisted({ local: ['a'] })` couldn't tell `a`'s scopes
from a key named `a:b`.

The prefix covers the whole router. It defaults to `'ngx-urlik:'`:

```ts
defineAppRouter(RouteNames, { routes, persistence: { prefix: 'shop:' } });
```

### Which value wins

1. A valid value in the URL.
2. Otherwise, the stored value, if it decodes.
3. Otherwise, the default.

A stored value that fails to decode is deleted. So you hear about it once. `params()`,
`paramsFrom()`, `activeRoute()`, and forms all follow this order. `globalQueryParams()` ignores
`persist`.

### Restored values go into the URL

The user lands on `/results` with `48` stored. ngx-urlik redirects to `/results?pageSize=48`. If
nothing usable is stored, it redirects to `/results?pageSize=24`. A broken value in the URL is
replaced the same way. The path, other query keys, and the fragment stay. One redirect fills in every
persisted field on the route chain.

The redirect adds no history entry of its own. A link click adds one entry, for the filled-in URL.
The first page load and the Back button replace the current entry. Angular reports the replaced
navigation with `NavigationCancel`.

Under the hood, this is a `canMatch` check added after the route's own `canMatch` guards. Angular
runs `canMatch` on every navigation, even when the route is reused. So your guards and
`runGuardsAndResolvers` stay as they are. Only the route that ends the match redirects. A layout
route never redirects a URL that fails to match below it.

The check runs while Angular matches routes. So `canActivate`, `canActivateChild`, resolvers, and
the old page's `canDeactivate` run once, and only see the filled-in URL. `canMatch` guards are
different. They run before the check, so they run twice when a value is restored: once without it,
once with it. Don't base a `canMatch` decision on a persisted query value.

One edge case: a URL with named outlets, like `/library/(books//side:panel)`. If an earlier redirect
in the same navigation changed the main path, nothing is redirected. `params()` still reads the
stored value.

A persisted field always shows in the URL, even at its default. `patchQuery()`, forms, and
`activeRoute().createUrlTree()` write `?pageSize=24` instead of dropping it.

`createUrlTree()` and `navigate()` on a route are the opposite. If you don't pass `pageSize`, they
leave it out. Arrival then restores it. So a missing key means "use what's stored, else the default".
If you pass 24, they write 24.

### Remember a path value

Say the user was watching season 2 of a show. Next time they open that show's seasons, you want
season 2 again.

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

The user visits `/shows/tv_1/seasons/2`. Later they go to `/shows/tv_1/seasons`. They land on
`/shows/tv_1/seasons/2`. The query and fragment come along.

With nothing stored for that show, the short URL matches whatever it would match anyway. That could
be a route declared earlier, the next matching route, or the not-found page.

The short URL is always the route's own path minus the remembered placeholders. Pick the path with
that in mind. Here `/shows/tv_1/seasons` means "the season I watched last". To show the show page
when nothing is stored, add a plain redirect after the named route:
`{ path: 'seasons', pathMatch: 'full', redirectTo: '' }`.

Rules:

- Only a named route can remember a placeholder.
- The remembered placeholders must end the route's own `path`. In `shows/:showId/seasons/:season`,
  only `season` qualifies.
- In `pair/:a/:b`, both qualify. Then `/pair` and `/pair/5` are both restored.
- A placeholder's scope can only name placeholders before it. The short URL has to contain them.

How it works: `defineAppRouter()` adds unnamed routes right after the named one. Each has a
`matcher` that accepts the short path only when the missing values are stored and decode. Each
redirects to the full path. The restore happens inside the same navigation. You get one
`NavigationStart`, no `NavigationCancel`, and `urlAfterRedirects` is the full URL. These routes don't
appear in `AppRouter.routes`.

Angular turns off redirects on a level after a sibling route there has redirected. So if an earlier
redirect in the same navigation produced the short URL, it isn't restored.

ngx-urlik saves any value that decodes. It can't know whether season 9 exists. If your backend says
it doesn't, that's your call. You might call `clearPersisted()` and go to the show page.

### Save

After every finished navigation (`NavigationEnd`), ngx-urlik saves each persisted field and
placeholder on the active route chain. It doesn't matter what started the navigation. Forms,
`patchQuery()`, links, and the Back button all count. It saves the URL text. It skips values that
don't decode. Form drafts are never saved.

Storage is read only when the URL lacks a usable value. Changes from another tab aren't watched.
They apply the next time a value is restored.

### Forget stored values

A reset button can wipe what the router remembers:

```ts
router.clearPersisted();
router.clearPersisted({ session: true });
router.clearPersisted({ local: ['pageSize'] });
```

With no argument, it removes every key with the router's prefix, from both storages.

With an object, it touches only storages set to `true` or to an array. So `{}` removes nothing.

- `true` removes every prefixed key in that storage.
- An array removes each listed key with all its scopes. `['tab']` removes `ngx-urlik:tab` and
  `ngx-urlik:tab:7`. It leaves `ngx-urlik:tabs` alone.
- A listed key no route declares is reported as `UNKNOWN_PERSIST_KEY`, then ignored.

Clearing doesn't change the current URL. The current page's values are saved again on its next
navigation.

### Without storage

On the server, persistence does nothing. Same when storage is missing or throws: private browsing,
a full quota, blocked access. Reads use the default. Nothing is saved, cleared, or redirected.

With server rendering, the server renders the default. The browser then restores the stored value
on its first navigation. So the page can change right after hydration.

## Diagnostics and errors

Bad query data falls back to the default. You get a diagnostic, and things carry on. Set the
reporter with `diagnostics: { warn }` on `defineAppRouter`. By default it calls `console.warn` with
the message.

| Code                              | When                                                                              |
| --------------------------------- | --------------------------------------------------------------------------------- |
| `PARAM_DESERIALIZE_FAILED`        | A codec returned `null` or threw                                                  |
| `PARAM_SERIALIZE_FAILED`          | A query codec returned a non-string or threw, or a repeated field got a non-array |
| `STORED_VALUE_DESERIALIZE_FAILED` | A stored value didn't decode. It's deleted and the default applies                |
| `UNKNOWN_PERSIST_KEY`             | `clearPersisted()` got a key no route declares                                    |

Take `/results?page=abc`. `page` reads as 1, and you get `PARAM_DESERIALIZE_FAILED` with `route`
`'RESULTS'` and `parameter` `'page'`.

`AppRouterDiagnostic` is a union. Narrow it by `code`. A parameter diagnostic has `code`, `message`,
`route`, `parameter`, and `operation` (`'serialize'` or `'deserialize'`). When they apply, it also
has `index`, `cause`, and the storage `key`. A codec's thrown error is in `cause`. For a repeated
field, `index` says which item failed. An `UNKNOWN_PERSIST_KEY` diagnostic has only `code`,
`message`, and `key`.

`route` names the route that declares the field. That may be a parent of the route you read. An
unnamed parent is named by position, like `routes[0].children[1]`.

Some things throw, because there is no sensible value to return:

- Reading a route that isn't active.
- A path value that won't serialize.
- An error inside a default function.

A path value that won't decode never reaches a read. The route just doesn't match.

`defineAppRouter()` checks the named route chains. It throws one error listing every problem:

- Repeated or empty route names.
- Names on redirects, wildcards, or matchers.
- `loadChildren` on a named route or anything above it.
- Paths that aren't known up front, or have empty segments or reserved characters.
- `pathParam` maps that don't match the placeholders.
- A placeholder name or query key repeated along a chain.
- `persist` options that are malformed, lack a default, sit on a repeated field, name an unknown
  scope, use a key with `:`, or remember a placeholder that doesn't end a named route's path.

TypeScript catches some of these first. Angular checks its own route config.

## Work with Angular Router

`provideAppRouter(...features)` returns `EnvironmentProviders`. They register the routes and the
`AppRouter` token. Other Angular router features pass through.

Put router options on `defineAppRouter(RouteNames, { routerConfig })`. Passing `withRouterConfig()`
to `provideAppRouter()` throws. Your options are kept as they are, including
`paramsInheritanceStrategy`.

Angular still decides which route wins: route order, matching, guards, redirects, outlets. Keep the
order sensible when patterns overlap.

### Escape hatch

`AppRouter.escapeHatch` gives you Angular's own tools, for URLs outside your typed routes:

| Methods                                      | Readonly values                                                                 |
| -------------------------------------------- | ------------------------------------------------------------------------------- |
| `createUrlTree`, `navigate`, `navigateByUrl` | `url`, `events`, `navigated`                                                    |
| `parseUrl`, `serializeUrl`, `isActive`       | `currentNavigation`, `lastSuccessfulNavigation`, `componentInputBindingEnabled` |

They keep Angular's types and behavior, `browserUrl` included. `isActive(url, matchOptions?)` is
Angular's `isActive()` function bound to the router. It returns a `Signal<boolean>`. The escape hatch
doesn't expose `routerState`, route config, lifecycle controls, or deprecated mutable properties.

You can still inject Angular's `Router`. It runs the app, so it has to stay. Calls through it skip
the typed routes and the write queue.

### Flag direct router use

ESLint's built-in `no-restricted-imports` rule can flag every import of `Router` or
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

It warns instead of failing. A deliberate call can stay, with an `eslint-disable-next-line` comment
that says why. `RouterLink`, `RouterOutlet`, `ResolveFn`, `ActivatedRouteSnapshot`, and other router
imports stay allowed. Templates and guards still need them.

## Types

| Type                            | Meaning                                      |
| ------------------------------- | -------------------------------------------- |
| `RouteNode<P, Q, R>`            | A typed route                                |
| `PathParamsOf<Node>`            | The route's path values, inherited included  |
| `QueryParamsOf<Node>`           | The route's query values, inherited included |
| `RouteStateOf<Node>`            | What `params()` returns: `{ path, query }`   |
| `RouteQueryPatch<Node>`         | What `patchQuery` accepts                    |
| `ActiveRoute<Candidates>`       | What an `activeRoute()` signal holds         |
| `GeneratedAppRouter`            | What the `AppRouter` token gives you         |
| `UrlParamCodec<T>`              | A codec                                      |
| `AppRouterDiagnostic`           | One diagnostic passed to `diagnostics.warn`  |
| `AppRouterParameterDiagnostic`  | A diagnostic about one parameter             |
| `AppRouterUnknownKeyDiagnostic` | An `UNKNOWN_PERSIST_KEY` diagnostic          |

## Not supported

| Not supported                                        | What happens today                                                         |
| ---------------------------------------------------- | -------------------------------------------------------------------------- |
| Angular versions other than 22                       | The library targets Angular 22                                             |
| Typed redirects, wildcards, matchers, named outlets  | Declare them as unnamed Angular routes                                     |
| Route arrays split across files                      | Pass the literal routes straight to `defineAppRouter()`                    |
| Named routes inside `loadChildren`                   | Keep route definitions in the router file. Load pages with `loadComponent` |
| Swapping routes with `Router.resetConfig()`          | Declare every named route up front. Load components with `loadComponent`   |
| Query property names that differ from URL keys       | The property name is the URL key                                           |
| One array field as both repeated keys and a list     | Each field uses one form                                                   |
| Built-in date or object codecs                       | Write your own codec                                                       |
| Writing global query fields                          | Global observers only read. Routes own writes                              |
| Reading the fragment                                 | You can only pass a fragment when building a link                          |
| Typed relative navigation                            | Use the escape hatch                                                       |
| Write options besides `replaceUrl`                   | Patches take only `replaceUrl`                                             |
| Typed state in a route's `isEqual`                   | The callback gets `unknown`                                                |
| Noticing storage changes from another tab            | The change applies at the next restore                                     |
| Forgetting one scope's value, like one show's season | `clearPersisted()` forgets a key for every scope                           |

## TasteTrack demo

TasteTrack is a movie and TV journal in [`projects/taste-track`](projects/taste-track). It uses only
the public `ngx-urlik` and `ngx-urlik/forms` entry points. It keeps its data in the browser, in
IndexedDB. Run it from the repo root, with the Node version in `.nvmrc`:

```sh
npm ci
npm start
```

Things to try:

1. Change the movie genres, sort order, and page size. Reload. The filters come back from the URL.
2. Open TV shows → Brambleworth Manor → Season 2 → Browse episodes → The Callback Nobody Returned.
   The URL is `/tv/brambleworth-manor/s/2/e/1`. It carries the show, season, and episode. The ID
   codec drops the `tv_` prefix from the URL and adds it back when reading.
3. Now open `/tv/brambleworth-manor/s`. You land on `…/s/2`, the season you opened last in this tab.
   A show with no remembered season opens the show page, which lists its seasons.
4. Follow a credit to a person or studio. Then follow a title back to the catalog.
5. Change a rating and log a viewing. Reload. Both are still there.
6. Filter Library, then Viewing history. Library uses Signal Forms. History uses Reactive Forms with
   a delayed search. Both ignore searches shorter than three letters.
7. Reset TasteTrack in Settings. The starting data comes back. Your theme stays.

| Page                             | Shows                                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------------------ |
| Movie and TV browsing            | Query fields from a parent route with no path segment, repeated genres, sorting, pagination      |
| Show → season → episode          | Inherited path parameters, an ID codec that hides its prefix, an integer codec                   |
| Page size and last season        | A remembered query field in `localStorage`, a remembered path value per show in `sessionStorage` |
| Detail section links             | URL fragments                                                                                    |
| Credits and contributor profiles | Typed links across branches                                                                      |
| Library                          | Signal Forms, repeated statuses, a joined media list, structured viewing counts                  |
| Viewing history                  | Reactive Forms with a delayed, validated search                                                  |
| Landing pages                    | Empty-path children and redirects                                                                |
| Unknown URLs                     | Wildcard routes                                                                                  |

Shared pages pick their route with `activeRoute()`. `paginationParams()` shares field definitions
across pages. The form pages reset the page number in `beforeWrite`. The catalog resets it in the
same `patchQuery()` call. Sort order is one codec value, so field and direction always travel
together.

The backend is in `projects/taste-track/src/app/backend/`. `BackendApi` runs every query and
change. Each query returns an `Observable`. Pages turn it into a signal with `toObservable`,
`switchMap`, and `toSignal`. `TasteTrackRepository` holds the IndexedDB tables in signals, through
Dexie. After a change, it reloads them and bumps `dataVersion`. Open queries then emit again.

A fixed seed fills the database on first run and on reset: 30 movies, 30 shows, 66 seasons, 394
episodes, 8 people, and 4 studios. Catalog data is read-only. Ratings, statuses, favorites, counts,
and viewings survive reloads. Reset clears only the TasteTrack database. The theme is stored
elsewhere.

## Develop

Use the Node version in `.nvmrc`:

```sh
npm ci
npm run build      # library, then demo
npm test           # unit tests for both
npm run typecheck  # public type tests
npm run e2e        # Playwright against the demo
```

[Design decisions](docs/decisions.md) explains why the library works this way, and what each choice
costs. [Reading the code](docs/implementation.md) shows where things live and how a write moves
through.

## License

[MIT](LICENSE)
