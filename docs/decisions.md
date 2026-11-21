# Design decisions

Each entry names a problem, the choice we made, and its cost. The [README](../README.md) states the
exact rules. The [agent skill](../skills/ngx-urlik/SKILL.md) tells agents how to follow them. This
file gives the reasons. Before you reopen a decision, read the alternatives it rejects. [Development
history](development-history.md) shows how each choice was reached.

## Take Angular's route array, and name routes one at a time

An app with Angular routes should get typed routing without rewriting them. So `defineAppRouter()`
takes Angular's route array as it is. Angular's fields stay where they are. Adding `routeName` to a
route adds one entry to a flat `AppRouter.routes`. Unnamed routes, like redirects, wildcards,
matchers, and named outlets, behave exactly as in Angular and get no entry.

Angular still decides which route activates. A typed route only builds URLs and reads the Angular
route it came from. So a page at its parent's URL, like an overview at `/shows/tv_1`, is an ordinary
child with an empty path. Two named routes can build the same URL and be active together.

**Cost:** route order matters, as in Angular. We can't reject two named routes with overlapping
patterns, because Angular's order decides which one matches.

## Take route names from an enum

`defineAppRouter(RouteNames, …)` builds the keys of `AppRouter.routes` from the members of
`RouteNames`. Go to Definition on `routes.MOVIE_DETAIL` opens the enum member, the same one the
route uses. Find References and Rename on either one reach the route and every use.

The enum is private to the router file. Pages use `AppRouter.routes`, so nothing else imports it.
Its only job is to give TypeScript one declaration per name.

That job is the reason for the enum. A mapped type keeps a property's declaration only when its keys
come from `keyof` a type written in source. `{ [K in keyof E]: … }` over the enum does exactly that.
Keys from string values, as with `routeName: 'MOVIE_DETAIL'`, have no declaration behind them. Go to
Definition then finds nothing, and Rename at a use misses the route.

Each name could instead be an object key on the route, like `{ MOVIE_DETAIL: { path: ':movieId' }
}`. That gets navigation right and writes each name once. But `AppRouter.routes` would then
intersect one object per name. In a prototype with 800 named routes, type checking took 20 s,
against 0.5 s for string names. It also changes the shape of Angular's route array.

Every member needs a route, or `defineAppRouter()` throws. A member without one would be `undefined`
in `AppRouter.routes`, and the first call on it would crash far from the cause.

**Cost:** each route name is written twice, in the enum and on the route. You can't add a name
before its route exists.

## Declare named routes up front

TypeScript infers a route's parameters only from literal paths, names, and `children` arrays written
inside the `defineAppRouter()` call. An array typed as Angular's `Routes` gives no typed routes.
Components can still load lazily.

The route list is fixed after `defineAppRouter()` runs, so `Router.resetConfig()` isn't supported.
We don't check for it. The check would walk the route config on every read, to catch a call almost
no app makes.

Named routes and the routes above them can't use `loadChildren`. Types aren't the reason:
`typeof import('./feature')` would keep a lazy file's literal routes. The runtime is. `routerLink`
takes a `UrlTree` immediately, so a typed route must build its URL right away. Building `/orders/4`
needs that route's path and codec before the orders feature loads. Startup checks need every route
too. Lazy definitions would mean links that wait, or links that fail until a chunk arrives.
Definitions contain only paths, codecs, and guard references, so loading them with the app is cheap.
Pages stay lazy through `loadComponent`.

A `defineRoutes()` helper with a `const` type parameter could keep the literal types of an array in
another file, with the same checks. We leave it out on purpose. One route file shows every URL in
the app. Apps adopt the library one feature at a time by moving each feature's routes into that
file.

**Cost:** a large route tree must be one expression.

## Let the Angular path name its placeholders

The path `show/:showId/season/:season` already names its parameters. So `pathParams` only adds
codecs, as in `{ season: numberCodec() }`. A placeholder without one is a string. Each entry is the
codec itself, so an app can name its routes first and pick codecs later. Path and query parameters
live in separate objects, so a path parameter and a query parameter can share a name.

**Cost:** the library must parse paths, for the types and to build URLs. It must also reject a
placeholder name that repeats in a route and its parents, because `params().path` has one value
per name.

## Keep codecs separate from where the parameter sits in the URL

A codec converts one string to one non-null value and back. `pathParams` and `queryParam` decide
whether that value is a path parameter or a query parameter. `queryParam` also sets defaults and
`required`. With this split, one `numberCodec()` serves a path parameter, a query parameter, and the
items of a list. A helper per type and per placement would repeat the parsing and wouldn't combine
into lists.

A missing query parameter belongs to the parameter's definition, not the codec. A query parameter
without a default reads as `null` when it's missing. That matches Angular Signal Forms, where
`undefined` means the field doesn't exist.

A list like `a,b` is one string, so it's a codec too: `listCodec(item, ',')` on an ordinary
`queryParam`. The separator is one character. A backslash escapes it inside an item, so `red, green`
stays one item. A longer separator could run into the item before it: with `||`, `['a|', 'b']` and
`['a', '|b']` would both write `a|||b`. An empty list writes `?tags=`, which keeps `[]` apart from a
missing key even when the default isn't empty. A custom codec can define any other list format.

**Cost:** a list query parameter needs `defaultValue: []` to read a missing key as empty. An item
that contains the separator or a backslash gets a `%5C` in the URL. Codecs and defaults can't use
`inject()`. So a fallback that depends on a service, like the user's locale, goes in the page that
reads the query parameter. A default that could change would let one URL show different values, and
would pull services into the route file.

## Compare parameter values by their text in the URL

The library compares values in three places:

- `params` and `globalParams()` give a new value only when a path or query parameter changes.
- A query parameter equal to its default stays out of the URL.
- A form edit writes only when it changes a query parameter.

The URL is text, and only the codec knows when two values mean the same thing. So each place
compares text, not decoded values:

- A signal keeps each parameter's value while its text in the URL is unchanged. Code that reads
  it reruns only when a value isn't `===` the previous one.
- A query parameter stays out of the URL when its value writes its default's text.
- A form binding compares by canonical URL text through the route's codecs, with `Object.is` as a
  fast path. So picking a new object that writes the same text as the URL doesn't write or run
  `beforeWrite`. For a query parameter with a default, `null` counts as different from the default
  value even though both leave the key out of the URL, because an absent key reads back as the
  default rather than `null`.

Take `?from=2026-11-01` read through a `PlainDate` codec. `PlainDate` keeps its state in private
fields, so a deep comparison sees no keys and calls any two dates equal. Comparing the text
`2026-11-01` gets it right with no help from the app.

**Cost:** a codec must write one text per value and lose nothing, so reading the text gives back an
equal value. Shorter text is fine. A trimmed value isn't: the form would take the trimmed value back
while the user is still typing. Values from `params()` are shared between reads, so code must not
mutate them. Form comparisons encode values on every check that misses `Object.is`.

## Write enum values, not member names

`enumCodec()` writes each value as its text. `Status.Archived = 1` writes `?status=1`.
`Status.Open = 'open'` writes `?status=open`. String, numeric, and mixed enums follow this one rule,
and so do arrays like `[10, 50, 'all']`.

A numeric enum's runtime object also has reverse entries, like `Status[1] = 'Archived'`. The codec
skips them. A key is a reverse entry when its value names a member whose number writes as that key.
TypeScript doesn't allow numeric member names, so no real member is skipped.

Member names, like `?status=Archived`, would read better and survive reordering. But string enums
would then need a second rule, or a second codec, for the same job. Keeping enum values stable is
the enum owner's job.

At creation, the codec checks that each value has its own text. `1` and `'1'` both write `1`, so
`enumCodec([1, '1'])` throws. `NaN` throws too, because no text reads back to it.

**Cost:** an auto-numbered member's URL changes when someone inserts a member before it. A URL with
`1` instead of a name is harder to read.

## Build links only from the parameters you pass

`createUrlTree()` and `navigate()` never copy the current query, whatever Angular's
`defaultQueryParamsHandling` says. A link built in a component, a guard, or a service depends only
on the path and query parameters the caller passed. Changing the current URL is a separate call,
`patchQuery()`. A link that should keep the current query parameters spreads `params().query` into
its own. The link still shows what it uses.

A broken query parameter shouldn't crash an app when there's a safe way to read it. So it reads as
its default and logs a warning. A path parameter whose value can't be written is different. No
replacement value would be correct, and the value came from the caller, not the URL. So building the
link throws instead of inventing a segment. Reading an inactive route throws too, because the route
has no parameters to read.

Returning `UrlTree | null` for a path parameter that can't be written would push that check into
every link, redirect, and template. The `null` would almost always mean a bug.

**Cost:** an empty or invalid ID from data throws where the link is built, for example while a
template renders. Check those values before they reach a link.

## Build typed links without Angular's command parsing

A typed link is always absolute, and the library knows every segment. So `createUrlTree()` builds
Angular's `UrlTree` directly from `UrlSegment` and `UrlSegmentGroup`. That takes 0.9 µs a link,
against about 10 µs for `router.createUrlTree()`. A list of 200 cards builds its links in a fifth of
a millisecond.

**Cost:** the tree must match the one Angular would build, or `routerLinkActive` and URL comparisons
could disagree. A test in `app-router.spec.ts` compares the two, with fragments, query parameters,
and path parameters that need encoding.

## Let Angular run the router, with a small escape hatch

Reusing Angular Router keeps its directives, guards, resolvers, server rendering, history, and URL
parsing. The library adds types on top and never runs a second router.

Most navigation should name a declared route. Code that needs an arbitrary URL, relative commands,
or outlets uses `AppRouter.escapeHatch`. It passes through a chosen set of Angular's own methods,
with Angular's types. It leaves out `config` and `resetConfig()`, `routerState`, and
`initialNavigation()`, `setUpLocationChangeListener()`, and `dispose()`.

Typed `navigate()` and `patchQuery()` don't take `browserUrl`, because it could show an address the
typed route didn't build. There's no custom link directive: a typed `UrlTree` goes straight to
Angular's `RouterLink`. Router options go through Angular's `withRouterConfig()`, passed to
`provideAppRouter()`. Typed routes read parent path and query parameters themselves, so they work
with any `paramsInheritanceStrategy`.

**Cost:** you can still inject Angular's `Router`, and calls through it skip the types. We
discourage that instead of blocking it. The README gives an
[ESLint config](../README.md#flag-direct-router-use) that warns on `Router` and `ActivatedRoute`
imports. Nothing enforces it at runtime.

## Check route literals in one walk, so big apps type-check fast

The route types infer each route from the literal and check it in the same walk. Each route array
is one mapped type. The checks sit in `NoInfer` next to each field. Named routes are collected as a
union of entries, not by walking siblings one at a time. A 201-route app type-checks in about a
second, and the time grows linearly with the number of routes.

Three other shapes fall short:

- **Separate types for inference and checks, intersected.** TypeScript compares the literal with
  the whole intersection. It also checks the arrays' `map` and `flatMap` signatures with huge
  element types. A 161-route app took 5 seconds.
- **Walking sibling routes as `[head, ...rest]` and intersecting the results.** Recursion grows with
  the number of siblings. TypeScript gives up at about 40 with TS2589, "excessively deep".
- **Dropping the inference type.** The checks still work, but callbacks in routes lose their
  parameter types. A guard's `route` becomes an implicit `any`.

**Cost:** the inference type still walks every nested object in a route, like codecs and `data`.
`npm run typecheck` checks a generated 201-route app, so a change that slows type checking makes
that command slower.

## Check how routes relate at startup, not in the types

TypeScript checks each route's shape, its literal names, its codec maps, and query keys that repeat
a parent's. Rules that compare routes with each other, like repeated names and repeated
placeholders, run in `defineAppRouter()`. It throws one error that lists every problem.

Three ways to move those rules into the types fall short:

- **A recursive type constraint on `defineAppRouter()`.** While inferring the generic, TypeScript
  can widen the route tree to the constraint. It then accepts a tree it would reject on its own. A
  check that works only sometimes is worse than a runtime check that always works.
- **Turning the router type into an error type.** The `defineAppRouter()` call compiles. The error
  appears later, wherever `AppRouter` is used, with a vaguer message.
- **A separate route builder or `validateRoutes()` call.** It sees the whole tree early, but the
  callbacks passed to it lose their parameter types.

**Cost:** some bad trees pass `tsc` and throw as soon as `defineAppRouter()` runs. A future editor
or lint check must reuse the runtime rules instead of writing a second set.

## Let query writes follow Angular's navigation rules, and let patches add up

A query write is one `navigateByUrl()` call. When two writes overlap, the later navigation cancels
the earlier one, as with two `router.navigate()` calls. Only one runs at a time. A patch, a link,
and the Back button all behave the same way here.

A patch also promises to change only the query parameters it names. It parses the starting URL and
updates only the keys passed in the patch, leaving untouched keys—including declared query
parameters with invalid text like `?page=bad`—as they are in the URL. A patch made while another
patch runs starts from that patch's destination, not from the current URL. Patches add up, and the
later one wins on a shared query parameter. Without this, `patchQuery({ search })` followed by
`patchQuery({ minRating })` would drop the search. A form edit and a page's patch made together
would undo each other. The cancelled patch resolves with the result of the patch that included its
query parameters.

The one exception is a navigation the write didn't start. While a link, a typed `navigate()`, or
Back runs, a patch resolves `false` without navigating. A form's writes often start with no user
action, when a debounce ends. By then the user may have clicked a link to a page that's still
loading. Cancelling that navigation would keep them on the page they tried to leave. `patchQuery()`
recognizes its own navigations by the `UrlTree` it passes to Angular. Angular keeps that tree as the
navigation's `initialUrl`.

Say the page is on `?minRating=4`, and two patches start in the same tick: `{ search: 'elm' }`, then
`{ minRating: 2 }`. The second starts from the first one's destination, so the URL ends at
`?search=elm&minRating=2`.

**Cost:** this is stricter than Angular's `queryParamsHandling: 'merge'`, which merges with the
current URL. An untouched query parameter with invalid text stays in the URL until something patches
it or navigates away, rather than being cleaned up as a side effect of an unrelated patch. A guard
sees the query parameters of every patch the latest one includes. So a patch it would accept alone
can be declined along with one it wouldn't. A write that starts while the user navigates doesn't
happen at all. The form sends the query parameter again with its next write. A debounced form field
still writes after the user presses Back, if Back left its query parameter alone.

## Keep drafts in the form, and what's written in the URL

A typed character, or a field waiting for its debounce, isn't in its query parameter yet. Form
bindings keep these drafts and decide when each field writes. Each concern has one place:

- A codec turns the value into text, so links, patches, and forms write the same query parameter
  text.
- Validators keep input that shouldn't be written, like a one-letter search, out of the URL. A
  field is written only once its validators pass, so this needs no option. The cost: a validator
  can't only show a hint, like "type at least 3 letters", while the URL still takes the value.
- Signal Forms delay typing with Angular's `debounce()` rule. Reactive Forms have no such rule, so
  the binding takes a `debounce` option that works the same way.

The page decides which query parameters reset when another changes, in the binding's `beforeWrite`.
For example, it sets `minRating: 0` whenever the search writes. Code that calls `patchQuery()` sets
the same query parameters in its patch. A reset rule on the route's query parameters would apply to
every writer on the route. But resets differ from page to page, and a route-level rule is hard to
see from the component whose edit triggered it.

An RxJS stream of field changes could express any timing rule. But the common case would need a
`groupBy`/`mergeMap` pipeline. It would duplicate Signal Forms' debounce, and it still couldn't
reset another query parameter the way the page can.

The binding compares the form's values with the query parameters. Each write includes every field
that differs from its query parameter. Before comparing, it takes in any query parameter change it
hasn't seen. Otherwise a field nobody edited would be written back over a patch that just reached
the URL. Because a write includes every changed field, the binding never has to tell its own
navigations from Back.

A Reactive Forms `debounce` delays a field's move into those values, as Signal Forms' `debounce()`
does. So Back drops a waiting edit in both form systems. In both, only typing waits. A value set by
code is final. Delaying it would only make the page lag, and code that reads the form right after
setting it would see the old value. The cost: Angular has no public way to remove a
`registerOnChange` listener, so each control keeps one forwarding listener for its life; and tests
that simulate typing must pass `{ emitModelToViewChange: false }`.

Some forms should change the URL only on submit, because each URL change starts a request. `writeOn:
'submit'` keeps every edit in the binding, not in the form. The form's values still change on each
keystroke, so switching "search by" to ID can disable an "exact match" checkbox at once, while the
URL waits. Reactive Forms' `updateOn: 'submit'` doesn't update the control's value until the submit,
so nothing else in the form can react to the edit. Signal Forms have no such setting.

Values set by code wait too. The point is one request per submit: a value sent early would start a
search the user never asked for. A submit with errors doesn't change the URL, as Signal Forms'
`submit()` runs its action only without errors.

`write()` called from code does what a submit by the user does, and both form systems follow the
same rule. Where one system can't do something, that sets the rule for both. Angular's `submit()`
ends a Signal Form's `debounce()` before the binding sees the submit, so with `'change'` each valid
field in that typing writes, and the binding can't stop it. So with `'change'`, a submit and
`write()` check each field on its own. With `'submit'`, both form systems can check the whole form
first, so they do. A field that isn't written stays in the draft, and the next write includes it.
The cost: with `'change'`, code can't use `write()` to write all fields or none.

The binding detects the submit itself. A `<form [formGroup]>` emits it as an event.
`createQueryParamsSignalForm()` makes the write the form's submit action. A hand-built Signal Form
takes its submit action at creation, so its bind function returns `{ write }` for the app to pass
in. All four form functions return `write`, in an object that leaves room to return more later.
Calling it from code submits the same way in both form systems.

As a Signal Form's submit action, `write()` resolves once the write starts, not when the navigation
finishes. Angular ignores a submit while the last one runs. Waiting would drop the user's next Enter
while a guard or resolver is slow. The cost: the form's `submitting()` doesn't cover the navigation,
so a page that wants a spinner reads the router instead.

A field follows its query parameter only when that parameter changes in the URL. So a write to
another field never replaces what the user is typing. The binding reads through `params()`, writes
through `patchQuery()`, and reads defaults, URL-text equality, and active-route state from the route
through an internal helper. A patch that wouldn't change the URL resolves `true` without navigating,
so `false` always means the write didn't happen. Writes replace the history entry by default, so
Back doesn't step through each keystroke.

**Cost:** forms bind only query parameters, as flat controls. Nested groups and `FormArray` aren't
supported. Failed writes are reported, not retried. Debounce is set differently in the two form
systems. Rules beyond a delay and validity, like throttling, need code around the form. Each page
writes its own resets.

## Leave remembered parameters to the app

Apps often want to remember path and query parameters outside the URL. Opening the site should land
in the user's last workspace. A new tab should show the last date range, maybe one per workspace.
The library doesn't store them, because each way to build storage into the library costs more than
it's worth.

An app can do it with the public API:

- It saves path parameters from `globalParams()`. A path parameter is always in the URL.
- A remembered query parameter has no default, so it's in the URL only when someone set it. The app
  saves it from `globalParams()` too.
- The page falls back to the saved value where it reads the query parameter:
  `query.view ?? saved ?? 'grid'`.
- A redirect at `/` picks the workspace.

TasteTrack's `preferences.ts` does this for the page size and each show's last season.

The query parameter has no default for a reason. With `defaultValue: 'grid'`, the URL `/movies`
can't say whether the user chose the grid or never picked a view. The app would then have to save
the view in every control that changes it and pass it into every link. Without a default, a missing
key means "not chosen". The fallback stays in the page, like a locale fallback.

Two ways to build it in fall short:

- **Restore an arriving URL.** A navigation without a stored value would redirect to the same URL
  with the value filled in. The library would have to act while Angular matches routes. Every place
  to do that either runs user guards twice or copies Angular's matching rules. Storage policy would
  also live in the route file, where nothing can be injected.
- **Fill remembered values into the links the app builds.** It needs no help from Angular's
  matching, and a URL still means what it says. But a hand-typed URL gets no remembered values, and
  a link built once in a class field keeps the values from when it was built.

**Cost:** every app writes its own storage code. The same URL, like `/movies`, can show a different
page size to different users, because the fallback isn't in the URL.

## Ask each route whether it's showing, and read through the answer

One component can serve routes with different parameters, like a movie detail and an episode
detail. A navigation bar shows on every page and highlights the current section. Both ask the same
question: is this route showing? Reading several routes' `params` is awkward, because the inactive
ones throw. Guessing the route from the URL's shape would ignore the routes the app already
declared.

So every route node has `ifActive()`. It returns the node while the route or one of its children
shows, and `null` otherwise. The node then answers all three questions a page asks: is it showing,
what are its values, and how do I change its query. All three live in one place,
`appRouter.routes.NAME`. A page on a single route needs nothing extra.

A read expects the route to be showing, and `params()` throws when it isn't. A page on one route
knows it's showing, and an optional read would only make it handle a `null` that never comes. Asking
is the optional step. A page on several routes reads through the node `ifActive()` returned, as in
`EPISODE.ifActive()?.params()`. The read always goes to the route it checked. In a template, `@if
(EPISODE.ifActive(); as episode)` does the same.

Query parameters that several routes share live on a parent route. The parent is active while any
child shows, so `BROWSE.params()` and `BROWSE.patchQuery()` work on every catalog and detail page.

`ifActive(values)` also checks values, for a table that greys out the link to the current page. Only
passed parameters count. An omitted parameter matches any value. That is Angular's `'subset'` match,
done with the route's codecs. Angular compares the text in the URL, so a link that leaves `search`
at its default says nothing about `search` and matches every search. Here a default is a value, so
`search: ''` matches only an empty search.

Query parameters the route doesn't declare never count. So a tracking parameter or a child route's
query parameter can't make the page look different. A stricter mode that rejected extra query
parameters would have to decide what they mean. Passing more parameters already makes the check
stricter.

Angular signals take no arguments, so `ifActive` is a function that reads signals. Without values it
reads only whether the route shows, so code that calls it reruns only when that answer changes.

Five other designs fall short:

- **A `Signal<boolean>` per route.** It answers the question, but nothing ties the check to the
  next read. Check `EPISODE`, read `MOVIE`, and the read throws at runtime.
- **One signal with the current page, narrowed with `is(route)`.** TypeScript narrows a variable,
  not a call, so every read would need the value copied into a `const` first. It would also repeat
  `params`, `patchQuery`, and `createUrlTree` on a second kind of object.
- **`params()` returning `null` when inactive.** Multi-route reads get shorter. But every
  single-route page, which is most pages, must handle a `null` that never comes.
- **Combining nodes, like `MOVIE.or(EPISODE)`.** Parameters that share a name without a shared
  declaration would match by coincidence. A parent route models real sharing.
- **A separate `isCurrent(values)`.** It would be a second member asking whether a route shows. So
  `ifActive()` takes the values instead.

**Cost:** TypeScript doesn't know which routes a page handles, so a missed route isn't a compile
error. A page must check nested routes deepest first, because a parent's `ifActive()` also returns
the parent. Code that needs a `Signal` object, like `toObservable()`, wraps `ifActive()` in a
`computed()`. A link and a check with the same values can disagree on a query parameter the values
omit: the link writes its default, and the check accepts any value.

## Read path and query parameters on every page, read-only

A service should be able to follow a convention like `?source=` on every page without declaring it
on a route. It should follow the workspace in `/w/:workspaceId/...` without knowing which page shows
it. `globalParams({ path, query })` reads both, with the same codecs and timing as route parameters.

A path parameter is read by placeholder name from the active route chain. That always gives one
answer, because a name appears only once in a route and its parents. A missing path parameter is
`null`, so a service never has to catch the error an inactive route throws. Each caller passes its
own definitions, so there's no registration order and nothing to conflict. It lives on the router,
not on `escapeHatch`, because it's a library feature, not one of Angular's.

**Cost:** two callers with different definitions can read different values from one URL. The same
placeholder name on unrelated routes reads as the same parameter. There's no write method. The
README lists writing global parameters under [Not supported](../README.md#not-supported).

## Read snapshots through the router, and name them snapshots

Guards and resolvers run before Angular commits, so they read the snapshot Angular passes in.
`paramsSnapshot(route, snapshot)` and `globalParamsSnapshot(definitions, snapshot)` live on the
router, next to `globalParams()`, which also takes its definitions as an argument. A route node then
has only members that work on the current URL. The `Snapshot` suffix comes from Angular's
`ActivatedRouteSnapshot`. It says the result is plain values read once, not a signal.

**Cost:** a call names the router twice, as in
`appRouter.paramsSnapshot(appRouter.routes.SEASON, route)`. Nothing ties a guard to the route it's
attached to, so a wrong pairing throws at runtime.

## Keep imports between modules one-way

`app-router.ts` assembles the public API. Every other module has one job: definitions and their
checks, compiled routes, reading and writing values, diagnostics, typed routes, or the escape
hatch. Lower modules never import `app-router.ts`. No two modules import each other in a cycle.
Internal types stay private unless `public-api.ts` exports them.

**Cost:** no tool checks for cycles, so code review has to catch them.

## Show every feature in TasteTrack

TasteTrack is a movie and TV journal that runs in the browser and uses only the public entry points.
Every router feature appears on at least one screen. A product feature that only repeats an
existing example doesn't belong. There's no backend or outside API, so the demo runs offline from
fixed seed data.

**Cost:** TasteTrack shows how the pieces fit together, but it isn't a product. A library change
found while working on the demo still needs its own decision.
