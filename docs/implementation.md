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

**Rule:** reading what was written gives back an equal value. A codec loses nothing. The table
lists every write and what it reads as.

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
to the same binding. The form holds a draft. The URL holds what's been written. The binding uses
only the public route: `params()` to read and `patchQuery()` to write.

The binding keeps a model: the values it compares with the URL. Signal Forms run `debounce()`
before their model, so the model is the form's value. In Reactive Forms, a field with a `debounce`
entry moves into the model when its delay ends. Every other field moves in right away.

| Variable    | Holds                                                        |
| ----------- | ------------------------------------------------------------ |
| `model`     | The values the binding compares with the URL                 |
| `shown`     | What the form showed after the last change the binding saw   |
| `lastUrl`   | The URL values the form last took in                         |
| `held`      | Fields `writeWhen: 'valid'` held back                        |
| `timers`    | Per field, the Reactive Forms debounce timer                 |
| `writes`    | How many writes the binding has started                      |
| `running`   | The newest write and the fields it carries, until it settles |
| `destroyed` | Whether the injection context was destroyed                  |

**Model to URL.** When the model changes, the binding writes every field that differs from the
URL, except the ones `writeWhen` holds back. The newest navigation wins, so a write that carries all
of them can't lose one to an older write. If the same write is already running, nothing happens.
If no field differs but an earlier write is running, the binding writes an empty patch.
`patchQuery()` then navigates to the URL as it is, and that cancels the earlier write. `beforeWrite`
runs only for a write with fields.

**URL to model.** When `params()` changes, a field takes the URL's value if three things hold: the
URL value changed since `lastUrl`, it differs from the model, and the field isn't held. That also
clears the field's debounce timer, as Signal Forms' `debounce()` does. A navigation that changes
other fields leaves a draft alone.

After a write resolves `true`, each field it carried takes the URL's value, unless the user changed
it since. So picking the sort that's already chosen, a new object with the same text, stops
differing from the URL. A write that resolves `false` is a decline only when it's the binding's
newest write and it carried fields. An older write was replaced by the form itself.

### States of one field

| State   | The model's value                         |
| ------- | ----------------------------------------- |
| Synced  | equals the URL value                      |
| Held    | differs, and `writeWhen` holds it back    |
| Sending | differs, and the running write carries it |
| Unsent  | differs, and no running write carries it  |

A Reactive Forms field can also be Waiting: its timer runs, and the input shows an edit the model
hasn't taken yet. Waiting sits before the model, so it combines with any state above.

A field is Unsent after a guard declines its write, another navigation cancels it, or `beforeWrite`
throws. The form keeps the draft, and its next write carries the field again.

### Transitions

| Event                         | From     | To                       | What else happens                                    |
| ----------------------------- | -------- | ------------------------ | ---------------------------------------------------- |
| Edit, no debounce             | any      | Synced, Sending, or Held | one write carries every field that differs           |
| Edit, with debounce           | any      | Waiting                  | timer restarts                                       |
| Timer fires                   | Waiting  | Synced, Sending, or Held | the model takes the edit                             |
| A held field becomes valid    | Held     | Sending                  |                                                      |
| Write resolves `true`         | Sending  | Synced                   | fields the user didn't change take the URL value     |
| Newest write resolves `false` | Sending  | Unsent                   | reports `declined`                                   |
| Older write settles           | Sending  | Sending                  | the newer write carries the field and reports itself |
| Write rejects                 | Sending  | Unsent                   | reports `error`                                      |
| `beforeWrite` throws          | any      | Unsent                   | error goes to `ErrorHandler`                         |
| URL changes the field         | not Held | Synced                   | timer cleared; the form shows the URL value          |
| URL changes the field         | Held     | Held                     | the form keeps the draft                             |
| URL changes other fields      | any      | same                     |                                                      |
| Route goes inactive           | any      | same                     | reads return nothing; the form keeps its values      |
| Injection context destroyed   | any      | gone                     | timers cleared; settling writes are ignored          |

### Rules that always hold

1. Each write carries every field whose model value differs from the URL, except held ones.
2. A field takes a value from the URL only when its URL value changes and the field isn't held.
3. `onWriteFailure` gets `declined` only for the binding's newest write, when it carried fields and
   resolved `false`. A write the URL already holds resolves `true`.
4. An edit that ends at the URL's value never runs `beforeWrite`. If an earlier write still runs,
   the binding navigates to the URL as it is. So typing `x` and deleting it on
   `?search=oak&page=3` keeps page 3, however fast the user is.
5. After destroy, nothing touches the form.

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

The demo has a few small state machines of its own.

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

- **A Signal Forms edit made between `NavigationEnd` and the binding's URL effect.** The binding
  could overwrite the edit with the old value. A test edits the model inside a `NavigationEnd`
  handler, and the edit stays.
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
  they start, so an older snapshot can't arrive after a newer one. There's no test, because the
  unit tests have no IndexedDB.
