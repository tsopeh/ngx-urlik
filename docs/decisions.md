# Design decisions

Each entry here names a problem, the choice we made, and what that choice costs. The
[README](../README.md) and the [agent skill](../skills/ngx-urlik/SKILL.md) hold the exact rules;
this file holds the reasons. If you want to reopen a decision, read the alternatives it rejects
first. [Development history](development-history.md) shows how each choice was reached.

## Take Angular's route array, and name routes one at a time

An app that already has Angular routes should get typed routing without rewriting them, so
`defineAppRouter()` takes Angular's route array as it is. Angular's fields stay where they are, and
adding `routeName` to a route adds one entry to a flat `AppRouter.routes`. Unnamed routes, like
redirects, wildcards, matchers, and named outlets, behave exactly as in Angular and get no entry.

Angular still decides which route activates. A typed route only builds URLs and reads the Angular
route it came from. That's why a page shown at its parent's own URL, like an overview at
`/shows/tv_1`, is just an ordinary child with an empty path, and why two named routes can build the
same URL and be active together.

**Cost:** route order matters, as it does in Angular. We can't reject two named routes whose
patterns overlap, because Angular's order decides which one matches.

## Take route names from an enum

`defineAppRouter(RouteNames, …)` builds the keys of `AppRouter.routes` from the members of
`RouteNames`. Go to Definition on `routes.MOVIE_DETAIL` therefore opens the enum member, the same
one the route uses, and Find References and Rename on either one reach the route and every use.

The enum is private to the router file. Pages go through `AppRouter.routes`, so nothing else needs
to import it, and its only job is to give TypeScript one declaration per name.

That job is the whole reason for the enum. TypeScript keeps a property's declaration through a
mapped type only when the keys come from `keyof` a type written in source, and
`{ [K in keyof E]: … }` over the enum does exactly that. Keys taken from string values, as with
`routeName: 'MOVIE_DETAIL'`, have no declaration behind them, so Go to Definition finds nothing and
Rename at a use misses the route.

Writing each name as an object key on the route, like `{ MOVIE_DETAIL: { path: ':movieId' } }`,
gets navigation right and writes each name only once. But `AppRouter.routes` then has to intersect
one object per name, and in a prototype with 800 named routes, type checking took 20 s against
0.5 s for string names. It also changes the shape of Angular's route array.

Every member needs a route, or `defineAppRouter()` throws. A member without one would be
`undefined` in `AppRouter.routes`, and the first call on it would crash far from the cause.

**Cost:** each route name is written twice, once in the enum and once on the route, and you can't
add a name before its route exists.

## Declare named routes up front

TypeScript can infer a route's parameters only from literal paths, names, and `children` arrays
written right inside the `defineAppRouter()` call. An array typed as Angular's `Routes` gives no
typed routes. Components can still load lazily.

The route list is fixed once `defineAppRouter()` runs, so `Router.resetConfig()` isn't supported.
We don't check for it, because the check would walk the route config on every read to catch a call
almost no app makes.

Named routes and the routes above them can't use `loadChildren`, and types aren't the reason:
`typeof import('./feature')` would carry a lazy file's literal routes just fine. The runtime is. A
typed route has to build its URL right away, because `routerLink` takes a `UrlTree` immediately,
and building `/orders/4` needs that route's path and codec before the orders feature has loaded.
Startup checks need every route too. Lazy definitions would mean links that wait, or links that
fail until a chunk arrives. Definitions hold only paths, codecs, and guard references, so loading
them with the app is cheap, and pages stay lazy through `loadComponent`.

A `defineRoutes()` helper could keep the literal types of an array in another file, with a `const`
type parameter and the same checks. We leave it out on purpose. One route file shows every URL in
the app in one place, and apps adopt the library one feature at a time by moving each feature's
routes into that file.

**Cost:** a large route tree has to be written as one expression.

## Let the Angular path name its placeholders

The path `show/:showId/season/:season` already names its parameters, so `pathParams` only adds
codecs, as in `{ season: numberCodec() }`, and a placeholder without one is a string. Each entry is
the codec itself, which lets an app name its routes first and pick codecs later. Path and query
values live in separate objects, so a placeholder and a query field can share a name.

**Cost:** the library has to parse paths, both for the types and to build URLs. It also has to
reject a placeholder name that repeats in a route and its parents, because `params().path` holds
one value per name.

## Keep codecs separate from where the value sits in the URL

A codec turns one string into one non-null value and back, while `pathParams` and `queryParam`
decide where that value sits in the URL. `queryParam` also owns defaults and `required`. The split
is what lets one `numberCodec()` serve a path segment, a query field, and the items of a list. A
helper for each type and each placement would repeat the parsing and wouldn't combine into lists.

A missing value belongs to the field, not the codec, and a field reads a missing value as `null`.
That matches Angular Signal Forms, where `undefined` means the field doesn't exist.

A list like `a,b` is a single string, so it's a codec too: `listCodec(item, ',')` on an ordinary
`queryParam`. The separator is one character, and a backslash escapes it inside an item, so
`red, green` stays one item. A longer separator could run into the item before it: with `||`, the
lists `['a|', 'b']` and `['a', '|b']` would both write `a|||b`. An
empty list writes as `?tags=`, which keeps `[]` apart from a missing key even when the default
isn't empty. A custom codec can define any other list format the same way.

**Cost:** a list field needs `defaultValue: []` to read a missing key as empty, and an item that
holds the separator or a backslash gets a `%5C` in the URL. Codecs and defaults can't use
`inject()`, so a fallback that depends on a service, like the user's locale, goes in the page that
reads the field. A default that could change would let the same URL show different values, and it
would pull services into the route file.

## Compare field values by their URL text

The library compares values in three places. `params` and `globalParams()` fire only when a field
changes, a query value equal to its default stays out of the URL, and a form edit writes only when
it changes a field. The URL holds text, and only the codec knows when two values mean the same
thing, so every one of these compares text rather than decoded values:

- A signal keeps each field's value while its URL text stays the same, and fires when a value isn't
  `===` the one before.
- A query value stays out of the URL when it writes the same text as its default.
- A form binding compares with `Object.is`. Values from `params()` keep their identity, and form
  controls keep a value until the user edits it, so an edit that ends `Object.is` to the URL's value
  doesn't write.

Take `?from=2026-11-01` read through a `PlainDate` codec. A deep comparison of two `PlainDate`
objects sees no keys, because the class keeps its state in private fields, so it would call any two
dates equal. Comparing the text `2026-11-01` gets it right with no help from the app.

**Cost:** a codec must write one text for each value and lose nothing, so reading the text gives
back an equal value. Shorter text is fine. A trimmed value isn't, because the form would take the
trimmed value back while the user is still typing. Values from `params()` are shared between reads,
so code must not change them in place. And a form edit that builds a new object equal to the old
one, like picking the sort that's already chosen, still counts as an edit: its write leaves the URL
as it is, but `beforeWrite` runs and can add fields like `minRating: 0`.

## Write enum values, not member names

`enumCodec()` writes each value as its text, so `Status.Archived = 1` writes `?status=1` and
`Status.Open = 'open'` writes `?status=open`. String, numeric, and mixed enums all follow that one
rule, and so do arrays like `[10, 50, 'all']`.

A numeric enum's runtime object also holds reverse entries, like `Status[1] = 'Archived'`, and the
codec skips them. A key counts as a reverse entry when its value names a member whose number writes
as that key. TypeScript doesn't allow numeric member names, so no real member ever gets skipped.

Member names, like `?status=Archived`, would read better and survive reordering. But string enums
would then need a second rule, or a second codec, for the same job. Keeping an enum's values stable
is the job of whoever owns the enum.

At creation, the codec checks that each value has its own text. `1` and `'1'` both write `1`, so
`enumCodec([1, '1'])` throws, and `NaN` throws too, because no text reads back to it.

**Cost:** an auto-numbered member's URL changes when someone inserts a member before it, and a URL
holding `1` instead of a name is harder to read.

## Build links only from the values you pass

`createUrlTree()` and `navigate()` never copy the current query, even when Angular's
`defaultQueryParamsHandling` would. A link built in a component, a guard, or a service then depends
only on what the caller passed, and changing the current URL is a separate call, `patchQuery()`. A
link that should keep the current filters spreads `params().query` into its values, so even then
the link shows what it uses.

Bad URL data shouldn't crash an app when there's a safe way to read it, so a broken query value
reads as its default and reports a diagnostic. A path value that won't serialize is different: it
has no honest replacement, and it came from the caller, not the URL. Building the link throws
rather than making up a segment. Reading an inactive route throws too, because there's nothing to
read.

Returning `UrlTree | null` for a path value that won't serialize would push that check into every
link, redirect, and template, and the `null` would almost always mean a bug.

**Cost:** an empty or invalid ID from data throws where the link is built, for example while a
template renders, so those values need checking before they reach a link.

## Build typed links without Angular's command parsing

A typed link is always absolute, and the library already knows every segment, so `createUrlTree()`
builds Angular's `UrlTree` directly from `UrlSegment` and `UrlSegmentGroup`. That takes 0.9 µs a
link, against about 10 µs for `router.createUrlTree()`, so a list of 200 cards builds its links in
a fifth of a millisecond.

**Cost:** the tree has to match the one Angular would build, or `routerLinkActive` and URL
comparisons could disagree. A test in `app-router.spec.ts` compares the two, with fragments, query
values, and path values that need encoding.

## Let Angular run the router, with a small escape hatch

Reusing Angular Router keeps its directives, guards, resolvers, server rendering, history, and URL
parsing. The library adds types on top and never runs a second router.

Most navigation should name a declared route. Code that needs an arbitrary URL, relative commands,
or outlets uses `AppRouter.escapeHatch`, which passes through a chosen set of Angular's own methods
with Angular's types. It leaves out config changes, raw router state, and lifecycle controls.

Typed `navigate()` and `patchQuery()` don't take `browserUrl`, because it could show an address the
typed route didn't build. There's no custom link directive, since a typed `UrlTree` goes straight
to Angular's `RouterLink`. Router options go through Angular's `withRouterConfig()`, passed to
`provideAppRouter()`. And because typed routes read parent values themselves, they work with any
`paramsInheritanceStrategy`.

**Cost:** you can still inject Angular's `Router`, and calls through it skip the types. We
discourage that rather than block it. The README gives an
[ESLint config](../README.md#flag-direct-router-use) that warns on `Router` and `ActivatedRoute`
imports, but nothing enforces it at runtime.

## Check route literals in one walk, so big apps type-check fast

The route types infer each route from the literal and check it in the same walk. Each route array
is one mapped type, the checks sit in `NoInfer` next to each field, and named routes are collected
as a union of entries rather than by walking siblings one at a time. A 201-route app type-checks in
about a second, and the time grows in step with the number of routes.

Three other shapes fall short:

- **Separate types for inference and for checks, intersected.** TypeScript then compares the
  literal with the intersection as a whole, and checks the arrays' `map` and `flatMap` signatures
  with huge element types. A 161-route app took 5 seconds.
- **Walking sibling routes as `[head, ...rest]` and intersecting the results.** The recursion grows
  with the number of siblings, and TypeScript gives up at about 40 with TS2589, "excessively deep".
- **Dropping the inference type.** The checks still work, but callbacks in routes lose their
  parameter types, so a guard's `route` becomes an implicit `any`.

**Cost:** the inference type still walks every nested object in a route, like codecs and `data`.
`npm run typecheck` checks a generated 201-route app, so a change that slows this down shows up.

## Check how routes relate when the app starts, not in the types

TypeScript checks each route's shape, its literal names, its codec maps, and query keys that repeat
a parent's. The rules that compare routes with each other, like repeated names and repeated
placeholders, run in `defineAppRouter()`, which throws one error listing every problem.

Three ways of moving those rules into the types fall short:

- **A recursive type constraint on `defineAppRouter()`.** While TypeScript infers the generic, it
  can widen the route tree to the constraint and then accept a tree it would reject on its own. A
  check that works only some of the time is worse than a runtime check that always works.
- **Turning the router type into an error type.** The `defineAppRouter()` call compiles, and the
  error surfaces later, wherever `AppRouter` is used, with a vaguer message.
- **A separate route builder or `validateRoutes()` call.** It sees the whole tree early, but the
  callbacks passed to it lose their parameter types.

**Cost:** some bad trees pass `tsc` and throw as soon as `defineAppRouter()` runs. Any future editor
or lint check has to reuse the runtime rules rather than write a second set.

## Let query writes follow Angular's navigation rules

A query write is one `navigateByUrl()` call, built from the URL at the moment you call it. When two
writes overlap, the later one cancels the earlier one, just as with two `router.navigate()` calls.
Anyone who knows Angular's router already knows the rules, and a patch, a link, and the Back button
all behave the same way.

The one exception is a navigation the write didn't start. While a link, a typed `navigate()`, or
Back runs, a patch resolves `false` without navigating. Writes often start on their own, when a
form's debounce ends, and by then the user may have clicked a link to a page that's still loading.
Cancelling that navigation would keep them on the page they tried to leave. `patchQuery()` knows
its own navigations by the `UrlTree` it passes to Angular, which Angular keeps as the navigation's
`initialUrl`.

Say the page is on `?minRating=4`, and two patches start in the same tick: `{ search: 'elm' }`,
then `{ minRating: 2 }`. Both read `?minRating=4`. The second navigation cancels the first, so the
URL ends at `?minRating=2` without `search`. Written as one patch,
`{ search: 'elm', minRating: 2 }`, both fields reach the URL.

**Cost:** two writes started in the same tick lose the first write's fields, and so does a write
that starts while a slow guard or resolver runs. A write that starts while the user navigates
doesn't happen at all, and a form sends the field again with its next write. A debounced form field still writes after the user
presses Back, if Back left that field alone. Code that changes several fields together should do it
in one patch. A lost field is silent unless the app sets `diagnostics: { replacedPatches: true }`,
which reports each one and changes nothing else. It's off by default, because a patch that replaces
another on purpose is ordinary code, not a mistake.

## Let forms hold drafts, and the URL hold what's written

A typed character, or a field waiting for its debounce, isn't a URL value yet. Form bindings hold
these drafts and decide when each field writes, and every concern has one place to live. A codec
shapes the value, so links, patches, and forms write the same URL. Validators and
`writeWhen: 'valid'` hold back input that shouldn't be written, like a one-letter search. Timing
follows each form system: Signal Forms use Angular's `debounce()` rule, and since Reactive Forms
have no such rule, the binding takes a `debounce` option.

The page decides which fields reset when another one changes, in the binding's `beforeWrite`, for
example by setting `minRating: 0` whenever the search writes. Code that calls `patchQuery()` sets
the same fields in its patch. A reset rule on the route's query fields would apply to every writer
on the route, but resets differ from page to page, and a route-level rule would be hard to see from
the component whose edit set it off.

An RxJS stream of field changes could express any timing rule. But the common case would need a
`groupBy`/`mergeMap` pipeline, it would duplicate Signal Forms' debounce, and it still couldn't
reset another field the way the page can.

The binding compares the form's values with the URL, and each write carries every field that
differs. Since the newest navigation wins, a write that carries every changed field can't lose one
to an older write, and the binding never has to tell its own navigations apart from Back. A
Reactive Forms `debounce` delays a field's move into those values, as Signal Forms' `debounce()`
does, so Back drops a waiting edit in both form systems.

A field follows the URL only when the URL's value for that field changes, so a write to another
field never replaces what the user is typing. The binding uses only the public route, `params()` to
read and `patchQuery()` to write. A patch that wouldn't change the URL resolves `true` without
navigating, so `false` always means the write didn't happen. Writes replace the history entry by
default, because nobody wants to go Back through each keystroke.

**Cost:** forms bind only query fields, as flat controls, so nested groups and `FormArray` aren't
supported. Failed writes are reported, not retried. Debounce is set differently in the two form
systems. Rules beyond a delay and validity, like throttling, need code around the form, and each
page writes its own resets.

## Leave remembered values to the app

Apps often want to remember values outside the URL. Opening the site should land in the workspace
the user worked in last, and a new tab should show the date range they picked last, maybe one per
workspace. The library has no persistence, because each way to build it into the core costs more
than the use case is worth.

An app can do it with the public API. It saves path values from `globalParams()`, since a path value
is always in the URL. A remembered query field gets no default, so the URL holds it only when
someone set it. The app saves that from `globalParams()` too, and the page falls back to the saved
value where it reads the field: `query.view ?? saved ?? 'grid'`. A redirect at `/` picks the
workspace. TasteTrack's `preferences.ts` does all of this for the page size and each show's last
season.

The query field has no default for a reason. With `defaultValue: 'grid'`, the URL `/movies` can't
say whether the user chose the grid or never picked a view, so the app would have to save the view
in every control that changes it and pass it into every link. Without a default, a missing key
means "not chosen", and the fallback stays in the page, like a locale fallback.

Two ways of building it in fall short:

- **Restore an arriving URL.** A navigation without a stored value would redirect to the same URL
  with the value filled in. The library would have to act while Angular matches routes, and every
  place to do that either runs user guards twice or copies Angular's matching rules. Storage policy
  would also live in the route file, where nothing can be injected.
- **Fill remembered values into the links the app builds.** It needs no help from Angular's
  matching, and a URL still means what it says. But a URL typed by hand gets no remembered values,
  and a link built once in a class field goes out of date.

**Cost:** every app writes its own storage code. And the same URL, like `/movies`, can show a
different page size to different users, because the fallback isn't in the URL.

## Ask each route whether it's showing, and read through the answer

One component can serve routes with different parameters, like a movie detail and an episode
detail. A nav bar shows on every page and highlights the section that's showing. Both are asking
the same question: is this route showing? Reading several routes' `params` is awkward, because the
inactive ones throw, and guessing the route from the URL's shape would ignore the routes the app
already declared.

So every route node has `ifActive`, a signal that holds the node itself while the route or one of
its children shows, and `null` otherwise. The node then answers all three questions a page asks:
is it showing, what are its values, and how do I change its query. All three live in the same
place, `appRouter.routes.NAME`, and a page on a single route needs nothing extra.

Reading is an assertion. `params()` throws when the route isn't showing, because a page on one
route knows it's showing, and an optional read would only make it handle a `null` that never comes.
Asking is the optional step. A page on several routes reads through the node `ifActive()` returned,
as in `EPISODE.ifActive()?.params()`, so the read always goes to the route it checked. In a
template, `@if (EPISODE.ifActive(); as episode)` does the same.

Fields that several routes share live on a parent route. The parent is active while any child
shows, so `BROWSE.params()` and `BROWSE.patchQuery()` work on every catalog and detail page.

Four other designs fall short:

- **A `Signal<boolean>` per route.** It answers the question, but nothing ties the check to the
  read after it. Check `EPISODE`, read `MOVIE`, and the read throws at runtime.
- **One signal holding the current page, narrowed with `is(route)`.** TypeScript narrows a
  variable, not a call, so every read would need the value copied into a `const` first. It would
  also repeat `params`, `patchQuery`, and `createUrlTree` on a second kind of object.
- **`params()` returning `null` when inactive.** Multi-route reads get shorter, but every
  single-route page, which is most pages, has to handle a `null` that never comes.
- **Combining nodes, like `MOVIE.or(EPISODE)`.** Fields that share a name without a shared
  declaration would match by coincidence. A parent route models real sharing.

**Cost:** TypeScript doesn't know which routes a page handles, so a missed route isn't a compile
error. And a page has to check nested routes deepest first, because a parent's `ifActive()` returns
the parent too.

## Read values on every page, read-only

A service should be able to follow a convention like `?source=` on every page without owning a
route, or follow the workspace in `/w/:workspaceId/...` without knowing which page shows it.
`globalParams({ path, query })` reads both, with the same codecs and timing as route values.

A path value is read by placeholder name from the active route chain. That's well defined, because
a name appears only once in a route and its parents. A missing path value is `null`, so a service
never has to catch the error an inactive route throws. Each caller passes its own definitions, so
there's no registration order and nothing to conflict. It lives on the router rather than on
`escapeHatch`, because it's a library feature, not one of Angular's.

**Cost:** two callers with different definitions can read different values from the same URL, and
the same placeholder name on unrelated routes reads as the same field. There's no write method; the
README lists writing global fields under [Not supported](../README.md#not-supported).

## Read snapshots through the router, and name them snapshots

Guards and resolvers run before Angular commits, so they read the snapshot Angular passes in.
`paramsSnapshot(route, snapshot)` and `globalParamsSnapshot(definitions, snapshot)` live on the
router, next to `globalParams()`, which also takes its definitions as an argument. That leaves a
route node holding only what works on the current URL. The `Snapshot` suffix, borrowed from
Angular's `ActivatedRouteSnapshot`, says the result is plain values read once, not a signal.

**Cost:** a call names the router twice, as in
`appRouter.paramsSnapshot(appRouter.routes.SEASON, route)`. And nothing ties a guard to the route
it's attached to, so a wrong pairing throws at runtime.

## Keep imports between modules one-way

`app-router.ts` assembles the public API, and every other module owns one job: definitions and
their checks, compiled routes, reading and writing values, diagnostics, typed routes, or the escape
hatch. Lower modules never import `app-router.ts`, no two modules import each other in a loop, and
internal types stay private unless `public-api.ts` exports them.

**Cost:** loops are caught in review, not by a tool.

## Show every feature in TasteTrack

TasteTrack is a movie and TV journal that runs in the browser and uses only the public entry points.
Every router feature appears on at least one screen, and a product feature that only repeats an
existing example doesn't belong. There's no backend or outside API, so the demo runs offline from
fixed seed data.

**Cost:** TasteTrack shows how the pieces fit together, but it isn't a product. A library change
found while working on the demo still needs its own decision.
