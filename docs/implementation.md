# Reading the code

Start with `projects/ngx-urlik/src/lib/app-router.ts`. `defineAppRouter()` checks the route array,
compiles it for Angular, and returns the `AppRouter` token and its provider. The public types are
in `app-router-types.ts`. They read route names and values from the literal route array, and use
the `RouteNames` members as the keys of `AppRouter.routes`.

`RouteArrayInput` types the `routes` option. It does two jobs in one walk of the literal: it lets
TypeScript infer each route, and it checks each field where it's written. The checks sit in
`NoInfer`, so they never change what TypeScript infers. Each route array is one mapped type, so
TypeScript compares the literal element by element. `RouteEntries` then collects one entry per
named route, as a union, and `NamedRoutes` turns the union into `AppRouter.routes`. Both recurse
only as deep as the routes nest, however many siblings each level has.

The sections below follow one job each: defining routes, reading, writing, round trips, and
forms. Where the code moves between states, a section lists the states, the rules that always hold,
and what each event does. TasteTrack's own states and the cases we checked come last.

## Define

`route-definition.ts` parses paths and checks every named route and every route above one, in one
walk down the tree. Each level passes on the path and query names the routes above it declared.
`compiled-route.ts` copies each route's Angular fields into a plain Angular route. It marks that
route with `compiledRouteKey`, which points back to the compiled route. It also builds
`namedRoutes`, a map from route name to compiled route. A compiled route holds the path and query
fields of every route above it, named or not. Building links and reading values both start from
it.

## Read and build links

`route-node.ts` builds `AppRouter.routes` and `globalParams()`. `createUrlTree` writes each value
the caller passed into the route's segments, and builds the `UrlTree` directly. A typed link is
absolute, so it needs none of Angular's command parsing. A test checks that the tree matches
Angular's `createUrlTree(['/', ...segments])`. `params` finds the active Angular snapshot by its
`compiledRouteKey` and decodes its values. `ifActive` looks for that snapshot the same way, and
returns the node or `null`. `compiled-route.ts` walks a router state's snapshot tree once, and every
signal that reads that state shares the result. `route-params-runtime.ts` runs codecs and defaults,
and handles broken input. `route-diagnostics.ts` turns failures into `AppRouterDiagnostic` values.

Each signal keeps a `ValueCache`: every field's last value and the URL text it came from. If the
text is the same on the next read, the field keeps its old value, so the signal compares fields
with `Object.is`. A query value leaves the URL when it serializes to the same text as its default.

Angular does the matching. For a route with `pathParam` codecs, `compiled-route.ts` adds a
`canMatch` check. A path value its codec rejects makes Angular try the next route.

Angular switches to the new router state, and creates the new page, before it emits
`NavigationEnd`. So each signal remembers which router state it read. When Angular has switched
to a newer one, the signal reads again. Guards and resolvers run before the switch, so
`paramsSnapshot()` and `globalParamsSnapshot()` read the snapshot they get instead.

### Router signal states

`routerSignal()` in `route-node.ts` backs `params`, `globalParams()`, and `ifActive`. Each signal
keeps a cached `computed()` and remembers `source`, the `router.routerState` it last read.

| State   | Meaning                                                                       |
| ------- | ----------------------------------------------------------------------------- |
| Current | `source === router.routerState`. A read returns the cached value.             |
| Lagging | Angular switched to a new router state, and `NavigationEnd` hasn't fired yet. |

**Rules that always hold:**

- A read returns values from the router state Angular has now, never an older one.
- Consumers are notified only on `NavigationEnd`, and only when a field's URL text changed.
  `ifActive` notifies only when its answer changes.
- A read of a route that isn't active throws. The cached error follows the same rules as a value.

| Event                                       | Router state                               | Signal goes to | A read returns           |
| ------------------------------------------- | ------------------------------------------ | -------------- | ------------------------ |
| `NavigationStart`, guards, resolvers        | unchanged                                  | stays          | cached value             |
| `BeforeActivateRoutes` (Angular commits)    | new                                        | Lagging        | a fresh read, not cached |
| `NavigationEnd`                             | unchanged                                  | Current        | recomputed value         |
| `NavigationCancel` or `NavigationError` (1) | Angular restores the state it had at start | Current        | cached value             |
| `NavigationSkipped`                         | unchanged                                  | stays          | cached value             |

(1) Angular's `resetInternalState()` puts back the very object the signal saw before, so `source`
matches again.

## Write

`patchQuery` in `route-node.ts` reads the current query and merges the patch in. It writes every
declared field into the current URL, then calls `router.navigateByUrl()` with the caller's options.
Angular's rule applies: the newest navigation cancels any that's still running. If the URL wouldn't
change and nothing is navigating, it resolves `true` without calling Angular, which would resolve
`false` as if a guard said no.

| What happened                             | Result           |
| ----------------------------------------- | ---------------- |
| It worked                                 | Resolves `true`  |
| The URL already held the patch            | Resolves `true`  |
| A guard said no                           | Resolves `false` |
| Something else navigated first            | Resolves `false` |
| The route wasn't active, or Angular threw | Rejects          |

**Rule:** a write starts from the committed URL, not from a navigation still running. So two
overlapping writes don't add up. [Design decisions](decisions.md) says why.

## Value round trips

Every field value moves between two states: a value in the app and text in the URL. Codecs and
defaults in `route-params-runtime.ts` do the moving. Writing builds a link, a patch, or a form
write. Reading is `params()`, `globalParams()`, or a snapshot read.

**Rule:** reading what was written gives back the value, after the codec's own cleanup. With a
trimming codec, `'elm '` reads back as `'elm'`. The table lists every write and what it reads as.

| Write                                     | URL             | Reads back as          |
| ----------------------------------------- | --------------- | ---------------------- |
| A query value that writes as its default  | key left out    | the default            |
| A field set to `null`                     | key left out    | the default, or `null` |
| A list field set to `[]`, default `['a']` | `?tag=`         | `[]`                   |
| A list item with the separator, `['a,b']` | `?tag=a%5C,b`   | `['a,b']`              |
| A query value the codec can't serialize   | key left out    | the default, or `null` |
| A path value the codec can't serialize    | the link throws |                        |
| A path value `''`, `.`, or `..`           | the link throws |                        |

## Follow a form edit

`bindQueryParams()` in `projects/ngx-urlik/forms/query-forms.ts` connects both Angular form systems
to the same binding. The form holds a draft that may be waiting for a debounce or a guard. The URL
holds what's been written. The binding uses only the public route: `params()` to read and
`patchQuery()` to write.

Its state is spread over a few variables:

| Variable    | Holds                                                                 |
| ----------- | --------------------------------------------------------------------- |
| `pending`   | Per field, the newest edit not yet settled. Each edit is a new object |
| `held`      | Fields `writeWhen: 'valid'` held back                                 |
| `sending`   | Per field, how many writes that carry it are still running            |
| `timers`    | Per field, the Reactive Forms debounce timer                          |
| `lastUrl`   | The URL values the form last took in                                  |
| `formValue` | What the form showed after the last change the binding saw            |
| `destroyed` | Whether the injection context was destroyed                           |

Each edit goes into `pending` as its own object, keyed by field. When a write settles, whatever the
result, the binding removes the objects that write sent. If the user edited the field again in the
meantime, the newer object stays. Either way, the form keeps showing what the user typed. A write
that resolves `false` reports a decline only if one of its objects is still pending.

`lastUrl` holds the URL values the form last took in. When `params()` changes, a field follows the
URL only if its URL value differs from `lastUrl` and the field has no pending edit. So a write to
one field never touches another field the user is typing in. The one exception is an edit still
waiting for its debounce. A new URL value for that field, as after Back, drops the edit and its
timer, unless a write of that field runs. When a write settles, `lastUrl` takes the URL value of
every field it carried, even one the user edited again. So the form's own write never looks like a
navigation from elsewhere.

One form change can touch several fields. The fields that write right away share one navigation. A
Reactive Forms field with a `debounce` entry waits on its own timer. With `writeWhen: 'valid'`, an
invalid field goes into `held`. The binding tries the held fields again whenever the form's
validity changes. That's how a field waits for an async validator.

Before a write navigates, the binding drops each edit that equals the URL's value, unless
`sending` shows a write of that field still running. If nothing is left, nothing writes. Then
`beforeWrite` can change the fields. Fields it adds aren't pending, so they come back into the form
from the URL. Destroying the binding clears its timers.

### States of one field

| State    | `pending` | Other                                  |
| -------- | --------- | -------------------------------------- |
| Synced   | no        |                                        |
| Waiting  | yes       | a timer runs                           |
| Held     | yes       | in `held`                              |
| Sending  | yes       | a write that sent this edit is running |
| Stranded | yes       | no timer, not held, no write running   |

Synced doesn't mean the form equals the URL. After a trimmed write, the form shows `'elm '` and the
URL has `elm`. After a declined write, the form keeps the draft.

Stranded happens when `beforeWrite` throws. The README promises the draft stays. The cost is that
the field ignores URL changes, Back included, until the user edits it again.

### Transitions

| Event                                                    | From             | To        | What else happens                                                                                  |
| -------------------------------------------------------- | ---------------- | --------- | -------------------------------------------------------------------------------------------------- |
| Edit `===` to `formValue`                                | any              | same      | nothing                                                                                            |
| Edit, no debounce                                        | any              | Sending   | new edit object; one write for all fields changed                                                  |
| Edit, with debounce                                      | any              | Waiting   | new edit object; timer restarts                                                                    |
| Timer fires                                              | Waiting          | Sending   | `writeWhen` and `beforeWrite` run first                                                            |
| Write starts, field invalid under `writeWhen`            | Waiting, Sending | Held      | no navigation for that field                                                                       |
| Write starts, edit is the URL value, none sends          | Waiting, Held    | Synced    | no navigation for that field; `beforeWrite` doesn't see it                                         |
| Validity changes                                         | Held             | Sending   | only if now valid                                                                                  |
| `beforeWrite` throws                                     | Sending          | Stranded  | error goes to `ErrorHandler`                                                                       |
| Write resolves `true`                                    | Sending          | Synced    | `lastUrl` takes the URL value                                                                      |
| Write resolves `false`, same edit still pending          | Sending          | Synced    | reports `declined`                                                                                 |
| Write settles, the field was edited again                | Sending          | unchanged | the newer edit stays pending; `lastUrl` takes the URL value; a decline isn't reported, an error is |
| Write rejects                                            | Sending          | Synced    | reports `error`                                                                                    |
| URL changes, field Synced, URL value is new              | Synced           | Synced    | the form takes the URL value                                                                       |
| URL changes, field Waiting, URL value is new, none sends | Waiting          | Synced    | timer cleared; the form takes the URL value                                                        |
| URL changes, any other pending edit                      | not Synced       | same      | the form keeps the draft                                                                           |
| Route goes inactive                                      | any              | same      | reads return nothing, the form keeps its values                                                    |
| Injection context destroyed                              | any              | gone      | timers cleared; settling writes are ignored                                                        |

### Rules that always hold

1. A field with a pending edit takes a value from the URL only while the edit waits for its
   debounce, the URL value is new, and no write of that field runs. The edit is dropped then.
2. A write clears only the edit objects it sent. A newer edit of the same field survives.
3. A field is in `held` only while it has a pending edit. A new edit takes it out.
4. A field has a timer only while it has a pending edit.
5. `onWriteFailure` gets `declined` only when the write resolved `false` and an edit it sent is
   still pending. A write the URL already holds resolves `true`.
6. After destroy, nothing touches the form.
7. An edit equal to its field's URL value writes only to cancel a running write of that field. So
   typing `x` and deleting it on `?search=oak&page=3` keeps page 3, even with a `beforeWrite` that
   resets the page.

## Check a change

Library test paths below are relative to `projects/ngx-urlik`.

| Change                     | Tests                                     |
| -------------------------- | ----------------------------------------- |
| Definitions, links, values | `src/lib/app-router.spec.ts`              |
| Startup checks             | `src/lib/route-checks.spec.ts`            |
| Path values and failures   | `src/lib/path-values.spec.ts`             |
| Escape hatch               | `src/lib/escape-hatch.spec.ts`            |
| Moving an existing app     | `src/lib/migration-cookbook.spec.ts`      |
| Codecs                     | `src/lib/params.spec.ts`                  |
| Decoding values            | `src/lib/parameter-state.spec.ts`         |
| Reads during navigation    | `src/lib/navigation-reads.spec.ts`        |
| Server rendering           | `src/lib/server-rendering.spec.ts`        |
| Query writes               | `src/lib/query-updates.spec.ts`           |
| Form bindings              | `src/lib/query-forms.spec.ts`             |
| Global reads               | `src/lib/global-params.spec.ts`           |
| Public types               | `type-tests/*.test-d.ts` at the repo root |
| Type-check speed           | `type-tests/generate-large-app.mjs`       |

Build before you run the type tests. `type-tests` and the demo load `ngx-urlik` from `dist`. Test
what a caller can see, so the tests keep passing when the internals change. Each spec reads as a
reference for its part of the library: a test name says what happens, and its body shows it.

Type tests run in Vitest's typecheck mode. The compiler checks each `*.test-d.ts` file, and Vitest
reports each `it()` as a test, but never runs the code. `expectTypeOf(x).toEqualTypeOf<T>()` checks
the exact type, so a type that quietly widens or narrows fails. A line marked `@ts-expect-error` is
code that must not compile, and the test fails if it starts compiling. `fixtures.ts` holds the
routers the type tests share.

To see which library lines no test reaches, run `npx ng test ngx-urlik --watch=false --coverage`.

`npm run typecheck` also writes and checks a 201-route app, as one literal. It takes about a second.
If a type change makes it slow, or it fails with TS2589, "excessively deep", that change made big
route trees cost more than they should.

## TasteTrack's states

The demo has a few small machines of its own.

### The journal database

`TasteTrackRepository` in `projects/taste-track/src/app/backend/database.ts` keeps IndexedDB data in
signals.

| State   | `ready` | `error` |
| ------- | ------- | ------- |
| Loading | false   | null    |
| Ready   | true    | null    |
| Failed  | false   | set     |
| Stale   | true    | set     |

| Event                                 | From    | To     | What else happens                   |
| ------------------------------------- | ------- | ------ | ----------------------------------- |
| First `reload()` succeeds             | Loading | Ready  | `dataVersion` goes up, queries emit |
| First `reload()` fails                | Loading | Failed | the shell shows only the error      |
| A write, then its `reload()` succeeds | Ready   | Ready  | `dataVersion` goes up               |
| A write fails                         | Ready   | Ready  | the caller's promise rejects        |
| A write commits, its `reload()` fails | Ready   | Stale  | the caller's promise resolves       |
| A later `reload()` succeeds           | Stale   | Ready  | `error` clears                      |

**Rules:**

- Each entry's new value is computed from what the database holds inside the write's transaction,
  never from the signals.
- The signals always hold one snapshot of every table.
- In Failed, no page shows. A page would wait for a response that never comes, so the shell shows
  the error in place of the router outlet. Reloading the browser is the only way out.
- A write's promise rejects only when the write didn't commit. So "Please try again" is always safe
  to follow. If a committed log viewing rejected, a retry would count the viewing twice.

### The detail page's save state

`DetailPage` in `projects/taste-track/src/app/detail-page.ts` has `writes`, `saved`, and `error`.
`writes` counts running writes, and `saving` is `writes > 0`. Log viewing is off while `saving`.

| Event                     | `writes` | `saved`   | `error`                          |
| ------------------------- | -------- | --------- | -------------------------------- |
| Log viewing, date invalid | same     | false     | "Enter a date like 2026-11-11."  |
| Log viewing, date valid   | +1       | false     | cleared                          |
| Status or rating change   | +1       | unchanged | cleared                          |
| Write succeeds            | −1       | true (2)  | unchanged                        |
| Write fails               | −1       | unchanged | "Could not save your changes..." |

(2) Only for Log viewing.

**Rules:**

- Log viewing stays off until every running write finishes. Start a log, change the rating, and
  the rating finishing first leaves the button off. One flag would turn it back on, and a second
  click would log twice.
- A select shows the stored value. When a status or rating write fails, the page puts the select
  back, because its `[value]` binding didn't change and Angular wouldn't.

### The settings page's reset

`SettingsPage` has `resetting` and `error`.

| Event                      | `resetting` | `error`                         |
| -------------------------- | ----------- | ------------------------------- |
| Reset confirmed            | true        | cleared                         |
| Reset and navigation work  | false       | unchanged                       |
| Reset or navigation throws | false       | "Could not reset TasteTrack..." |

**Rule:** a reset that fails says so. Resetting twice ends in the same data, so trying again is
safe.

### List pages

The catalog, library, and history pages each turn their route's `params().query` into a backend
request, and `switchMap` keeps only the newest response. Until the first response arrives, the
list is busy: it shows no empty message, Next is off, and it keeps a screen's height.

**Rule:** the list shows what the URL says. A draft in a form, such as a search too short to write,
doesn't change the list.

## Checked, and fine

- **A Signal Forms edit landing between `NavigationEnd` and the binding's URL effect.** The binding
  could overwrite the edit with the old value. A test that edits the model inside a
  `NavigationEnd` handler keeps the edit.
- **Two form writes one macrotask apart, with no guards or resolvers.** They don't overlap: a
  query-only navigation finishes first.
- **A computed that read a value Angular later took back.** During the Lagging state, a computed
  that reads `params()` keeps the fresh value. If Angular then rolls the commit back, as it does
  when activating the new page throws, no `NavigationEnd` comes. The computed keeps values from the
  discarded state until the next navigation. Angular's own `ActivatedRoute` is just as stale in that
  case, so we leave it.
- **Path values with `/`, `?`, `#`, `;`, `(`, `%`, or spaces.** Angular encodes them in one
  segment, like `/items/a%2Fb`, and they read back unchanged.
- **Out-of-order `reload()` results in the demo.** IndexedDB runs read transactions in the order
  they start, so an older snapshot can't land after a newer one. Not tested, because the unit tests
  have no IndexedDB.
