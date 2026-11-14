# Design decisions

Each entry gives a problem, the choice, and what it costs. The [README](../README.md) has the exact
rules. Before you reopen a decision, read the alternatives it rejects.
[Development history](development-history.md) shows how each choice was reached.

## Take Angular's route array, and name routes one at a time

An app that already has Angular routes should get typed routing without rewriting them. So
`defineAppRouter()` takes Angular's route array as it is. Angular fields stay where they are. Adding
`routeName` to one route adds one entry to a flat `AppRouter.routes`. Unnamed routes, like
redirects, wildcards, matchers, and named outlets, behave as in Angular and get no entry.

Angular still decides which route activates. A typed route only builds URLs and reads the Angular
route it came from. A page shown at its parent's own URL, like an overview at `/shows/tv_1`, is an
ordinary child with an empty path. So two named routes can build the same URL and be active
together.

**Cost:** route order matters, as it does in Angular. We can't reject two named routes whose
patterns overlap. Angular's order decides which one matches.

## Take route names from an enum

`defineAppRouter(RouteNames, …)` builds the keys of `AppRouter.routes` from the members of
`RouteNames`. So Go to Definition on `routes.MOVIE_DETAIL` opens the enum member, the same one the
route uses. Without the enum it would stop at a generated type.

Every member needs a route, or `defineAppRouter()` throws. A member with no route would be
`undefined` in `AppRouter.routes`, and the first call on it would crash far from the cause.

**Cost:** every caller imports the enum. Each route name is written twice: once in the enum and once
on the route. You can't add a name before its route exists.

## Declare named routes up front

TypeScript can infer a route's parameters only from literal paths, names, and `children` arrays
written right inside the `defineAppRouter()` call. An array typed as Angular's `Routes` gives no
typed routes. Components can still load lazily.

The route list is fixed once `defineAppRouter()` runs, so `Router.resetConfig()` isn't supported.
We don't check for it. The check would walk the route config on every read to catch a call almost
no app makes.

Named routes and the routes above them can't use `loadChildren`. Types aren't the reason:
`typeof import('./feature')` would carry a lazy file's literal routes. The runtime is. A typed route
must build its URL right away, because `routerLink` takes a `UrlTree` immediately. Building
`/orders/4` needs that route's path and codec before the orders feature has loaded. Startup checks
need every route too. Lazy definitions would mean links that wait, or links that fail until a chunk
loads. Definitions hold only paths, codecs, and guard references, so loading them with the app is
cheap. Pages stay lazy through `loadComponent`.

A `defineRoutes()` helper could keep the literal types of an array in another file, with a `const`
type parameter and the same checks. We leave it out. One route file shows the whole app's URLs in
one place. Apps adopt the library one feature at a time, moving each feature's routes into that
file.

**Cost:** a large route tree has to be written as one expression.

## Let the Angular path name its placeholders

The path `show/:showId/season/:season` already names its parameters. So `pathParam` only adds
codecs, `{ season: numberCodec() }`, and a placeholder without one is a string. Each entry is the
codec itself. An app can name routes first and pick codecs later. Path and query values live in
separate objects, so a placeholder and a query field can share a name.

**Cost:** the library parses paths, for the types and to build URLs. It must also reject a
placeholder name that repeats in a route and its parents, because `params().path` holds one value
per name.

## Keep codecs separate from where the value sits in the URL

A codec turns one string into one non-null value and back. `pathParam` and `queryParam` decide
where that value sits in the URL. `queryParam` also owns defaults and `required`. So one
`numberCodec()` works for a path segment, a query field, and the items of a list. A helper for each
type and each placement would repeat the parsing and wouldn't combine into lists.

A missing value belongs to the field, not the codec. A field reads a missing value as `null`. That
matches Angular Signal Forms, where `undefined` means the field doesn't exist.

A list like `a,b` is one string, so it's a codec: `listCodec(item, ',')` on an ordinary
`queryParam`. A backslash escapes the separator inside an item, so `red, green` stays one item. It
writes an empty list as `?tags=`, so `[]` stays apart from a missing key, even when the default
isn't empty. A custom codec can define any other list format the same way.

**Cost:** a list field needs `defaultValue: []` to read a missing key as empty. An item that holds
the separator or a backslash gets a `%5C` in the URL. A URL from other code, like `?tag=a&tag=b`,
reads as `['b']`, because a repeated key gives its last value. A bad item fails the whole field.
Codecs and defaults can't use `inject()`. A fallback that depends on a service, like the user's
locale, goes in the page that reads the field. A default that could change would let the same URL
show different values, and it would pull services into the route file.

## Compare field values by their URL text

The library compares values in three places. `params` and `globalParams()` fire only when a field
changes. A query value equal to its default stays out of the URL. A form edit writes only when it
changes a field. The URL holds text, and only the codec knows when two values mean the same thing.
So each place compares text, not decoded values:

- A signal keeps each field's value while its URL text stays the same. It fires when a value isn't
  `===` the one before.
- A query value stays out of the URL when it writes the same text as its default.
- A form binding compares with `Object.is`. Values from `params()` keep their identity, and form
  controls keep a value until the user edits it. An edit that ends `Object.is` to the URL's value
  doesn't write.

Take `?from=2026-11-01` read through a `PlainDate` codec. A deep comparison of two `PlainDate`
objects sees no keys, because the class keeps its state in private fields. So it would call every
two dates equal. Comparing the text `2026-11-01` needs no help from the app.

**Cost:** a codec must write one text for each value. Values from `params()` are shared between
reads, so code must not change them in place. A form edit that builds a new object equal to the old
one, like picking the sort that's already chosen, counts as an edit. Its write leaves the URL as it
is, but `beforeWrite` still runs and can add fields like `page: 1`.

## Build links only from the values you pass

`createUrlTree()` and `navigate()` never copy the current query, even when Angular's
`defaultQueryParamsHandling` would. So a link built in a component, a guard, or a service depends
only on what the caller passed. Changing the current URL is a separate call, `patchQuery()`.
A link that keeps the current filters spreads `params().query` into its values, so even then the
link shows what it uses.

Bad URL data shouldn't crash an app when there's a safe way to read it. A broken query value reads
as its default and reports a diagnostic. A path value that won't serialize has no honest
replacement, and it came from the caller, not the URL. So building the link throws instead of
making up a segment. Reading an inactive route throws, because there's nothing to read.

Returning `UrlTree | null` for a path value that won't serialize would push that check into every
link, redirect, and template. The `null` would almost always mean a bug.

**Cost:** an empty or invalid ID from data throws where the link is built, for example while a
template renders. Check those values before you build the link.

## Build typed links without Angular's command parsing

A typed link is always absolute, and the library already knows every segment. So `createUrlTree()`
builds Angular's `UrlTree` directly, from `UrlSegment` and `UrlSegmentGroup`. That's 0.9 µs a link,
where `router.createUrlTree()` takes about 10 µs. A list of 200 cards builds its links in a fifth
of a millisecond.

**Cost:** the tree has to match the one Angular would build, or `routerLinkActive` and URL
comparisons could disagree. A test in `app-router.spec.ts` compares the two, with fragments, query
values, and path values that need encoding.

## Let Angular run the router, with a small escape hatch

Reusing Angular Router keeps its directives, guards, resolvers, server rendering, history, and URL
parsing. The library adds types on top and doesn't run a second router. Most navigation should name
a declared route. Code that needs any URL, relative commands, or outlets uses
`AppRouter.escapeHatch`. It passes through a chosen set of Angular's own methods, with Angular's
types. It leaves out config changes, raw router state, and lifecycle controls.

Typed `navigate()` and `patchQuery()` reject `browserUrl`, because it could show an address the
typed route didn't build. There's no custom link directive: a typed `UrlTree` goes to Angular's
`RouterLink`. Router options go through Angular's `withRouterConfig()`, passed to
`provideAppRouter()`. Typed routes read parent values themselves, so they work with any
`paramsInheritanceStrategy`.

**Cost:** you can still inject Angular's `Router`, and calls through it skip the types. We
discourage that instead of blocking it. The README gives an
[ESLint config](../README.md#flag-direct-router-use) that warns on `Router` and `ActivatedRoute`
imports. Nothing enforces it at runtime.

## Check route literals in one walk, so big apps type-check fast

The route types infer each route from the literal and check it, in one walk. Each route array is
one mapped type, and the checks sit in `NoInfer` next to each field. Named routes are collected as
a union of entries, not by walking siblings one at a time. A 201-route app type-checks in about a
second, and the time grows with the number of routes, not faster.

Rejected alternatives:

- **Separate types for inference and for checks, intersected.** TypeScript then compares the
  literal with the intersection as a whole, and checks the arrays' `map` and `flatMap` signatures
  with huge element types. A 161-route app took 5 seconds.
- **Walking sibling routes as `[head, ...rest]` and intersecting the results.** The recursion grows
  with the number of siblings, and TypeScript stops at about 40 with TS2589, "excessively deep".
- **Dropping the inference type.** Checks still work, but callbacks in routes lose their parameter
  types, so a guard's `route` becomes an implicit `any`.

**Cost:** the inference type still walks every nested object in a route, like codecs and `data`.
`npm run typecheck` checks a generated 201-route app, so a change that slows this down shows up.

## Check how routes relate when the app starts, not in the types

TypeScript checks each route's shape, literal names, codec maps, and query keys that repeat a
parent's. `defineAppRouter()` checks the rules that compare routes with each other, like repeated
names and repeated placeholders. It throws one error that lists every problem.

Rejected alternatives:

- **A recursive type constraint on `defineAppRouter()`.** While TypeScript infers the generic, it
  can widen the route tree to the constraint. Then it accepts a tree it would reject on its own. A
  check that works only sometimes is worse than a runtime check that always works.
- **Turning the router type into an error type.** The `defineAppRouter()` call compiles. The error
  shows up later, wherever `AppRouter` is used, with a vaguer message.
- **A separate route builder or `validateRoutes()` call.** It sees the whole tree early, but the
  callbacks passed to it lose their parameter types.

**Cost:** some bad trees pass `tsc` and throw as soon as `defineAppRouter()` runs. Any future editor
or lint check must reuse the runtime rules, not write a second set.

## Let query writes follow Angular's navigation rules

A query write is one `navigateByUrl()` call, built from the URL at the moment you call it. If two
writes overlap, the later one cancels the earlier one, as with two `router.navigate()` calls. Anyone
who knows Angular's router already knows the rules. A patch, a link, and the Back button all behave
the same way.

Say the page is on `?page=4`, and two patches start in the same tick: `{ search: 'elm' }`, then
`{ page: 2 }`. Both read `?page=4`. The second navigation cancels the first, so the URL ends at
`?page=2`, without `search`. Write `{ search: 'elm', page: 2 }` as one patch and both land.

**Cost:** two writes started in the same tick lose the first write's fields. So does a write that
starts while a slow guard or resolver runs. A debounced form field still writes after the user
presses Back, if Back left that field alone. Code that changes several fields together should do it
in one patch.

## Let forms hold drafts, and the URL hold what's written

A typed character, or a field waiting for its debounce, isn't a URL value yet. Form bindings hold
these drafts and decide when each field writes. Each concern has one place. A codec shapes the
value, so links, patches, and forms write the same URL. Validators and `writeWhen: 'valid'` hold
back input that shouldn't be written, like a one-letter search. Timing follows each form system.
Signal Forms use Angular's `debounce()` rule. Reactive Forms have no such rule, so the binding takes
a `debounce` option.

The page decides which fields reset when another one changes. It does that in the binding's
`beforeWrite`, for example setting `page: 1` whenever the search writes. Code that calls
`patchQuery()` sets the same fields in its patch. A reset rule on the route's query fields would
apply to every writer on the route. But resets differ from page to page, and the rule would be hard
to see from the component whose edit set it off.

An RxJS stream of field changes could express any timing rule. But the common case would need a
`groupBy`/`mergeMap` pipeline, it would duplicate Signal Forms' debounce, and it couldn't reset
another field, like the page.

A field follows the URL only when the URL's value for that field changes. So a write to another
field never replaces what the user is typing. The binding uses only the public route: `params()` to
read and `patchQuery()` to write. A patch that wouldn't change the URL resolves `true` without
navigating, so `false` always means the write didn't happen. Writes replace the history entry by
default, because nobody wants to go Back through each keystroke.

**Cost:** forms bind only query fields, as flat controls. Nested groups and `FormArray` aren't
supported. Failed writes are reported, not retried. You set debounce differently in the two form
systems. Rules beyond a delay and validity, like throttling, need code around the form. Each page
writes its own resets.

## Leave remembered values to the app

Apps want to remember values outside the URL. Opening the origin should land in the workspace the
user worked in last. A new tab should show the date range they picked last, maybe one per
workspace. The library has no persistence. Each way to build it into the core costs more than the
use case is worth.

An app does it with the public API. It saves path values from `globalParams()`, because a path
value is always in the URL. A remembered query field gets no default, so the URL holds it only when
someone set it. The app saves it from `globalParams()` too, and the page falls back to the saved
value where it reads the field: `query.pageSize ?? saved ?? 24`. Its redirect at `/` picks the
workspace. TasteTrack's `preferences.ts` does this for the page size and each show's last season.

Why the query field has no default: with `defaultValue: 24`, the URL `/movies` can't say whether
the user chose 24 or never picked a size. The app would have to save the size in every control that
changes it and pass it into every link. Without a default, a missing key means "not chosen", and
the fallback stays in the page, like a locale fallback.

Rejected alternatives:

- **Restore an arriving URL.** A navigation without a stored value would redirect to the same URL
  with the value filled in. The library would have to act while Angular matches routes. Every place
  to do that either runs user guards twice or copies Angular's matching rules. Storage policy would
  also live in the route file, where nothing can be injected.
- **Fill remembered values into the links the app builds.** It needs no help from Angular's
  matching, and a URL means what it says. But a URL typed by hand gets no remembered values, and a
  link built once in a class field goes out of date.

**Cost:** every app writes its own storage code. The same URL, like `/movies`, can show a different
page size to different users, because the fallback isn't in the URL.

## Ask each route whether it's showing, and read through the answer

One component can serve routes with different parameters, like a movie detail and an episode
detail. A nav bar shows on every page and highlights the section that's showing. Both ask the same
question: is this route showing? Reading several routes' `params` is awkward, because inactive ones
throw. Guessing the route from the URL's shape would ignore the routes the app already declared.

So every route node has `ifActive`, a signal that holds the node itself while the route or one of
its children shows, and `null` otherwise. The node then answers all three questions a page asks: is
it showing, what are its values, and change its query. Pages find all three in the same place,
`appRouter.routes.NAME`, and a page on one route needs nothing extra.

Reading is an assertion. `params()` throws when the route isn't showing, because a page on one
route knows it's showing, and an optional read would make it handle a `null` that never comes.
Asking is the optional step. A page on several routes reads through the node `ifActive()` returned,
as in `EPISODE.ifActive()?.params()`, so the read goes to the route it checked. In a template,
`@if (EPISODE.ifActive(); as episode)` does the same.

Fields that several routes share live on a parent route. The parent is active while any child
shows, so `BROWSE.params()` and `BROWSE.patchQuery()` work on every catalog and detail page.

Rejected alternatives:

- **A `Signal<boolean>` per route.** It answers the question, but nothing ties the check to the
  read after it. Check `EPISODE` and read `MOVIE`, and the read throws at runtime.
- **One signal holding the page, narrowed with `is(route)`.** TypeScript narrows a variable, not
  a call, so every read would need the value copied into a `const` first. It would also repeat
  `params`, `patchQuery`, and `createUrlTree` on a second kind of object.
- **`params()` returning `null` when inactive.** A multi-route read gets shorter, but every
  single-route page has to handle a `null` that never comes. Most pages are single-route pages.
- **Combining nodes, like `MOVIE.or(EPISODE)`.** Fields that share a name without a shared
  declaration would match by coincidence. A parent route models real sharing.

**Cost:** TypeScript doesn't know which routes a page handles, so a missed route isn't a compile
error. A page checks nested routes deepest first, because a parent's `ifActive()` returns the
parent too.

## Read values on every page, read-only

A service can follow a convention like `?source=` on every page without owning a route. It can also
follow the workspace in `/w/:workspaceId/...` without knowing which page shows it.
`globalParams({ path, query })` reads both, with the same codecs and timing as route values. A path
value is read by placeholder name from the active route chain. That's well defined, because a name
appears once in a route and its parents. A missing path value is `null`, so a service never has to
catch the error an inactive route throws. Each caller uses its own definitions, so there's no
registration order and nothing to conflict. It lives on the router, not on `escapeHatch`, because
it's a library feature, not one of Angular's.

**Cost:** two callers with different definitions can read different values from the same URL. The
same placeholder name on unrelated routes reads as the same field. There's no write method. The
README lists writing global fields under [Not supported](../README.md#not-supported).

## Read snapshots through the router, and name them snapshots

Guards and resolvers run before Angular commits, so they read the snapshot Angular passes in.
`paramsSnapshot(route, snapshot)` and `globalParamsSnapshot(definitions, snapshot)` live on the
router, next to `globalParams()`, which also takes definitions as an argument. A route node then
holds only what works on the current URL. The `Snapshot` suffix, like Angular's
`ActivatedRouteSnapshot`, says the result is plain values read once, not a signal.

**Cost:** a call names the router twice, as in
`appRouter.paramsSnapshot(appRouter.routes.SEASON, route)`. Nothing ties a guard to the route it's
attached to, so a wrong pairing throws at runtime.

## Keep imports between modules one-way

`app-router.ts` puts the public API together. Each other module owns one job: definitions and their
checks, compiled routes, reading and writing values, diagnostics, typed routes, and the escape
hatch. Lower modules don't import `app-router.ts`, and no two modules import each other in a loop.
Internal types stay private unless `public-api.ts` exports them.

**Cost:** we check for loops in review. No tool does it.

## Show every feature in TasteTrack

TasteTrack is a movie and TV journal that runs in the browser and uses only the public entry points.
Each router feature appears on at least one screen. A product feature that only repeats an example
doesn't belong. It has no backend or outside API, so the demo runs offline from fixed seed data.

**Cost:** TasteTrack shows how the pieces fit. It isn't a product. A library change found while
working on the demo still needs its own decision.
