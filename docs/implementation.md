# Reading the code

Start with `projects/ngx-urlik/src/lib/app-router.ts`. Its `defineAppRouter()` checks the route
array, compiles it for Angular, and returns the `AppRouter` token and its provider.

The public types live in `app-router-types.ts`. They read route names and values from the literal
route array. The `RouteNames` members become the keys of `AppRouter.routes`.

`RouteArrayInput` types the `routes` option. It infers each route and checks each field in one walk
of the literal. The checks are wrapped in `NoInfer`, so they never change what TypeScript infers.
Each route array is one mapped type, so TypeScript compares the literal element by element.

`RouteEntries` collects one entry per named route, as a union. `NamedRoutes` turns that union into
`AppRouter.routes`. Both recurse only as deep as the routes nest, whatever the number of siblings.

Each section below covers one job: defining routes, reading, writing, round trips, and forms. Where
code moves between states, the section lists the states, the invariants (rules that hold in every
state), and what each event does. TasteTrack's states and the cases already checked come last.

## Define

`route-definition.ts` defines the route types and `parseRoutePath()`.

`compiled-route.ts` checks and compiles the route tree in one top-down pass (after a linear
bottom-up scan for named routes and `pathParams`/`queryParams`), parsing each checked path once. It
copies each route's Angular fields into a plain Angular route, marks that route with
`compiledRouteKey`, and builds `namedRoutes`, a map from route name to compiled route.

A compiled route has the path and query parameters of every route above it, named or not. Links
and reads both start from it.

## Read and build links

`route-node.ts` builds `AppRouter.routes` and `globalParams()`.

`createUrlTree` writes each passed value into the route's segments and builds the `UrlTree`
directly. A typed link is absolute, so it needs none of Angular's command parsing. A test checks
that the tree matches Angular's `createUrlTree(['/', ...segments])`.

`params` finds the active Angular snapshot by its `compiledRouteKey` and decodes its values.
`ifActive()` looks for the same snapshot and returns the node or `null`. Given values, it also reads
`params()`. It compares each passed parameter by the text its codec writes in the URL, with defaults
left out, as a link writes them, and caches the current snapshot's canonical texts so repeated checks
encode each current parameter at most once.

`compiled-route.ts` walks a router state's snapshot tree once. Every signal that reads that state
shares the result.

`route-params-runtime.ts` runs codecs and defaults and handles broken input.
`route-diagnostics.ts` turns failures into `AppRouterDiagnostic` values.

Each signal keeps a `ValueCache` with every parameter's last value and its text in the URL. When the
text is unchanged on the next read, the parameter keeps its old value. That is what lets the signal
compare parameters with `Object.is`. A query parameter leaves the URL when its value writes its
default's text.

Angular does the matching. For a route with `pathParams` codecs, `compiled-route.ts` adds a
`canMatch` check. A path parameter its codec rejects makes Angular try the next route.

Angular switches to the new router state, and creates the new page, before it emits
`NavigationEnd`. In that gap, each signal still reads the current state: it remembers which router
state it read and reads again once Angular has a newer one. Guards and resolvers run before the
switch, so `paramsSnapshot()` and `globalParamsSnapshot()` read the snapshot they get.

### Router signal states

`routerSignal()` in `route-node.ts` provides `params`, `globalParams()`, and the route check inside
`ifActive()`. Each signal keeps a cached `computed()`. It also keeps `source`, the
`router.routerState` it last read.

| State   | Meaning                                                                       |
| ------- | ----------------------------------------------------------------------------- |
| Current | `source === router.routerState`. A read returns the cached value.             |
| Lagging | Angular switched to a new router state, and `NavigationEnd` hasn't fired yet. |

**Invariants:**

- A read returns values from Angular's current router state, never an older one.
- Code that reads a signal reruns only after `NavigationEnd`, and only when a parameter's text in
  the URL changed. A `computed()` that calls `ifActive()` without values reruns only when its
  answer changes.
- Reading an inactive route throws. The cached error follows the same rules as a cached value.

| Event                                       | Router state                               | Signal goes to | A read returns           |
| ------------------------------------------- | ------------------------------------------ | -------------- | ------------------------ |
| `NavigationStart`, guards, resolvers        | unchanged                                  | stays          | cached value             |
| `BeforeActivateRoutes` (Angular commits)    | new                                        | Lagging        | a fresh read, not cached |
| `NavigationEnd`                             | unchanged                                  | Current        | recomputed value         |
| `NavigationCancel` or `NavigationError` (1) | Angular restores the state it had at start | Current        | cached value             |
| `NavigationSkipped`                         | unchanged                                  | stays          | cached value             |

(1) Angular's `resetInternalState()` restores the same object the signal saw before, so `source`
matches again.

## Write

`patchQuery` in `route-node.ts` parses the starting URL, writes only the declared query parameters
passed in the patch, and leaves untouched parameters as they are. It then calls
`router.navigateByUrl()` with the caller's options. The starting URL depends on what's running:

- **Nothing.** It starts from the current URL. If the URL wouldn't change, it resolves `true`
  without calling Angular. Angular would resolve `false`, which looks like a guard decline.
- **Another patch.** It starts from that patch's destination URL, so patches add up. If the result
  equals that destination, it returns that patch's promise. Otherwise the new navigation cancels the
  running one, and the cancelled patch resolves as the new one does. If the cancelled patch adds a
  history entry, the new navigation passes `replaceUrl: false`, so the entry isn't lost. If the
  result is the current URL, it navigates with `onSameUrlNavigation: 'reload'`, so Angular doesn't
  skip it and resolve `false`.
- **A link, `navigate()`, or Back.** It resolves `false` without calling Angular.

`patchQuery` tracks the running patch in a single `pendingWrite` record holding its target
`UrlTree`, serialized URL, history flag, result promise, and overtake callback. Angular keeps that
tree as the running navigation's `initialUrl`, so a running navigation matches `pendingWrite.tree`
only when a patch started it.

| What happened                                              | Result                      |
| ---------------------------------------------------------- | --------------------------- |
| It worked                                                  | Resolves `true`             |
| The URL already matched the patch                          | Resolves `true`             |
| A guard said no                                            | Resolves `false`            |
| A link, `navigate()`, or Back cancelled it, or was running | Resolves `false`            |
| A later patch cancelled it                                 | Resolves as the later patch |
| The route wasn't active, or Angular threw                  | Rejects                     |

**Invariant:** a patch changes only the query parameters it names, so overlapping patches add up.
[Design decisions](decisions.md) explains why.

## Value round trips

Every path and query parameter exists in two forms: a typed value in the app and text in the URL.
The codecs and defaults in `route-params-runtime.ts` convert between them. A write is a link, a
patch, or a form write. A read is `params()`, `globalParams()`, or a snapshot read.

**Invariant:** reading what was written gives back an equal value, because a codec loses nothing.

| Write                                     | URL             | Reads back as          |
| ----------------------------------------- | --------------- | ---------------------- |
| A query parameter at its default          | key left out    | the default            |
| A query parameter set to `null`           | key left out    | the default, or `null` |
| A list set to `[]`, default `['a']`       | `?tag=`         | `[]`                   |
| A list item with the separator, `['a,b']` | `?tag=a%5C,b`   | `['a,b']`              |
| A query parameter the codec can't write   | key left out    | the default, or `null` |
| A path parameter the codec can't write    | the link throws |                        |
| A path parameter `''`, `.`, or `..`       | the link throws |                        |

## Follow a form edit

`createQuerySync()` in `projects/ngx-urlik/forms/query-forms.ts` reconciles a form's model with the
route's query parameters. The form keeps the draft, and the query parameters keep what's been
written. The binding reads through `params()`, writes through `patchQuery()`, and gets defaults,
URL-text equality, and active-route reads through the internal `ɵqueryRouteSupport()` helper.

Each form system wraps `createQuerySync()` with its own adapter:

- **Reactive Forms** (`bindQueryParamsToFormGroup()`) keeps per-field debounce `timers` and a
  `lastSeen` snapshot. A change on a debounced field moves into the model when its timer ends or
  when the form submits or `write()` runs. Fields without a delay move in right away.
- **Signal Forms** (`bindQueryParamsToSignalForm()`) runs `debounce()` inside Angular before the
  model, so it needs no timers. It exposes `submitAction()` (resolves as soon as the write starts,
  for Angular's `submit()`) and `write()` (calls `markAsTouched()` to flush waiting typing, checks
  errors under `writeOn: 'submit'`, and awaits `newestWrite`).

`write()` called from code runs the same submit rules as a submit by the user. It ends every
debounce wait. With `writeOn: 'change'`, the binding writes each field whose validators pass. With
`writeOn: 'submit'`, it writes the whole draft, and only when the form has no errors.

| Variable      | Contents                                                           |
| ------------- | ------------------------------------------------------------------ |
| `model`       | The values the binding compares with the URL                       |
| `lastUrl`     | The query parameter values the form last took in                   |
| `invalid`     | Fields whose validators failed when the binding wrote              |
| `timers`      | Per field, the Reactive Forms debounce timer                       |
| `writes`      | How many writes the binding has started                            |
| `running`     | The newest write and the fields it includes, until it finishes     |
| `newestWrite` | Resolves after the newest write finishes, for `write()` to wait on |
| `destroyed`   | Whether the injection context was destroyed                        |

**Model to URL.** When the model changes, the binding writes. With `writeOn: 'submit'`, the edit
waits in the model until a submit without errors. A Signal Form's submit action runs before the
binding's effect sees the form's value, so the action reads the value first.

A write follows these steps:

1. Take in any query parameter change the effect hasn't seen yet. Otherwise a field nobody edited
   would be written back over a patch that just reached the URL.
2. Collect every field that differs from its query parameter. With `writeOn: 'change'`, leave out
   each field whose validators fail and add it to `invalid`. With `writeOn: 'submit'`, the submit
   already checked the whole form.
3. Run `beforeWrite` if any fields were collected.
4. If a write is running, set back each field the running write set and this one leaves out,
   including query parameters `beforeWrite` added, to its value in the URL. That is how typing `x`
   and deleting it ends where it started.
5. Send the patch, unless it matches the running write, or nothing is running and the patch is
   empty.

`write()` waits for `newestWrite`, which resolves after the newest write finishes. An older write
resolves as the newer one that included it.

**URL to model.** When `params()` changes, a field takes its query parameter's value only if three
things hold: the query parameter changed since `lastUrl`, it differs from the model by canonical URL
text, and the field isn't Invalid. Taking the value also clears the field's debounce timer, as
Signal Forms' `debounce()` does. A navigation that changes other query parameters leaves the draft
alone.

Because the binding compares field values by canonical URL text, picking a new object that writes
the same text as the URL doesn't differ from the URL and never starts a write or runs `beforeWrite`.
A write that resolves `false` is a decline only when it's the binding's newest write and it included
fields. An older write was replaced by the form itself.

### States of one field

| State   | The model's value                          |
| ------- | ------------------------------------------ |
| Synced  | equals the query parameter's value         |
| Invalid | differs, and its validators fail           |
| Sending | differs, and the running write includes it |
| Unsent  | differs, and no running write includes it  |

A Reactive Forms field can also be Waiting: its timer runs, and the input shows an edit the model
hasn't taken yet. Waiting comes before the model takes the edit, so a field can be Waiting and in
any state above at once.

A field becomes Unsent in these cases:

- a guard declines its write;
- a link, `navigate()`, or Back cancels its write, or was running when the write started;
- `beforeWrite` throws.

The form keeps the draft, and its next write includes the field again. With `writeOn: 'submit'`,
every edit stays Unsent until a submit without errors.

### Transitions

| Event                              | From              | To                          | What else happens                                               |
| ---------------------------------- | ----------------- | --------------------------- | --------------------------------------------------------------- |
| Edit by code, or no debounce       | any               | Synced, Sending, or Invalid | one write includes every field that differs                     |
| Typing, with debounce              | any               | Waiting                     | timer restarts                                                  |
| Submitted or `write()`, `'change'` | Waiting           | Synced, Sending, or Invalid | timer cleared; the model takes the edit                         |
| Submitted or `write()`, `'submit'` | Waiting or Unsent | Synced or Sending           | timer cleared; one write includes every field; none with errors |
| Timer fires                        | Waiting           | Synced, Sending, or Invalid | the model takes the edit                                        |
| Its validators pass                | Invalid           | Sending                     |                                                                 |
| Write resolves `true`              | Sending           | Synced                      |                                                                 |
| Newest write resolves `false`      | Sending           | Unsent                      | reports `declined`                                              |
| Older write finishes               | Sending           | Sending                     | the newer write includes the field and reports its own result   |
| Write rejects                      | Sending           | Unsent                      | reports `error`                                                 |
| `beforeWrite` throws               | any               | Unsent                      | error goes to `ErrorHandler`                                    |
| Its query parameter changes        | not Invalid       | Synced                      | timer cleared; the form shows the new value                     |
| Its query parameter changes        | Invalid           | Invalid                     | the form keeps the draft                                        |
| Other query parameters change      | any               | same                        |                                                                 |
| Route goes inactive                | any               | same                        | reads return nothing; the form keeps its values                 |
| Injection context destroyed        | any               | gone                        | timers cleared; writes that finish later are ignored            |

### Invariants

1. Each write includes every field whose model value differs from its query parameter, except
   Invalid fields.
2. A field takes a value from its query parameter only when that parameter changes and the field
   isn't Invalid.
3. `onWriteFailure` gets `declined` only for the binding's newest write, when it included fields and
   resolved `false`. A write the URL already matches resolves `true`.
4. An edit that ends at its query parameter's value never runs `beforeWrite`. If an earlier write is
   still running, the binding navigates to the current URL. So typing `x` and deleting it on
   `?search=oak&minRating=3` keeps rating 3, however fast the user types.
5. After the binding is destroyed, it never changes the form or reports a failure.

## Check a change

Library test paths below are relative to `projects/ngx-urlik`.

| Change                     | Tests                                     |
| -------------------------- | ----------------------------------------- |
| Definitions, links, values | `src/lib/app-router.spec.ts`              |
| Startup checks             | `src/lib/route-checks.spec.ts`            |
| Path parameters, failures  | `src/lib/path-values.spec.ts`             |
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

`type-tests` and the demo load `ngx-urlik` from `dist`. `npm run typecheck` builds the library
first. Before you run the demo tests, build the library yourself.

Test what a caller can see, so tests keep passing when internals change. Each spec is also the
reference for its part of the library. A test's name says what happens, and its body shows it.

Type tests run in Vitest's typecheck mode. The compiler checks each `*.test-d.ts` file, and Vitest
reports each `it()` as a test without running the code. `expectTypeOf(x).toEqualTypeOf<T>()` checks
the exact type, so a type that widens or narrows fails. A line marked `@ts-expect-error` must not
compile. The test fails if it starts compiling. `fixtures.ts` has the routers the type tests share.

To find library lines no test reaches, run `npx ng test ngx-urlik --watch=false --coverage`.

`npm run typecheck` also generates and checks a 201-route app, as one literal, in about a second.
If a type change makes it slow, or it fails with TS2589, "excessively deep", that change made big
route trees too expensive.

## TasteTrack's states

The demo has a few small state machines of its own.

### The journal database

`TasteTrackRepository` in `projects/demo-app/src/app/backend/database.ts` keeps IndexedDB data in
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

**Invariants:**

- Each entry's new value comes from what the database contains inside the write's transaction, never
  from the signals.
- The signals always contain one snapshot of every table.
- In Failed, no page shows. A page would wait forever for a response, so the shell shows the error
  in place of the router outlet. Reloading the browser is the only way out.
- A write's promise rejects only when the write didn't commit, so "Please try again" is always safe.
  If a committed Log viewing write rejected, a retry would count the viewing twice.

### The detail page's save state

`DetailPage` in `projects/demo-app/src/app/detail-page.ts` has `writes`, `saved`, and `error`.
`writes` counts running writes. `saving` is `writes > 0`. Log viewing is disabled while `saving`.

| Event                     | `writes` | `saved`   | `error`                          |
| ------------------------- | -------- | --------- | -------------------------------- |
| Log viewing, date invalid | same     | false     | "Enter a date like 2026-11-11."  |
| Log viewing, date valid   | +1       | false     | cleared                          |
| Status or rating change   | +1       | unchanged | cleared                          |
| Write succeeds            | −1       | true (2)  | unchanged                        |
| Write fails               | −1       | unchanged | "Could not save your changes..." |

(2) Only for Log viewing.

**Invariants:**

- Log viewing stays disabled until every running write finishes. Start a log, then change the
  rating. The button stays disabled even if the rating write finishes first. A single flag would
  re-enable it, and a second click would log the viewing twice.
- A select shows the stored value. When a status or rating write fails, the page resets the select.
  Its `[value]` binding didn't change, so Angular wouldn't reset it.

### The settings page's reset

`SettingsPage` has `resetting` and `error`.

| Event                      | `resetting` | `error`                         |
| -------------------------- | ----------- | ------------------------------- |
| Reset confirmed            | true        | cleared                         |
| Reset and navigation work  | false       | unchanged                       |
| Reset or navigation throws | false       | "Could not reset TasteTrack..." |

**Invariant:** a failed reset says so. Resetting twice gives the same data, so a retry is safe.

### List pages

The catalog, library, and history pages each turn their route's `params().query` into a backend
request. `switchMap` keeps only the newest response. Until the first response arrives, the list is
busy: it shows no empty message, Next is disabled, and it keeps a screen's height.

**Invariant:** the list shows what the URL says. A form draft, such as a search too short to write,
doesn't change the list.

## Checked, and fine

These cases look like bugs. Each has been checked and is fine:

- **A Signal Forms edit made between `NavigationEnd` and the binding's URL effect.** The binding
  could overwrite the edit with the old value. A test edits the model inside a `NavigationEnd`
  handler, and the edit survives.
- **Two form writes one macrotask apart, like two `setTimeout` callbacks, with no guards or
  resolvers.** They don't overlap. A query-only navigation finishes first.
- **A computed that read a value Angular later took back.** In the Lagging state, a computed that
  reads `params()` keeps the fresh value. Angular rolls the commit back when activating the new page
  throws. Then no `NavigationEnd` comes, and the computed keeps values from the discarded state
  until the next navigation. Angular's own `ActivatedRoute` shows the same discarded values there,
  so we leave it.
- **Path parameters with `/`, `?`, `#`, `;`, `(`, `%`, or spaces.** Angular encodes them inside one
  segment, like `/items/a%2Fb`, and they read back unchanged.
- **Out-of-order `reload()` results in the demo.** IndexedDB runs read transactions in start order,
  so an older snapshot can't arrive after a newer one. There's no test, because the unit tests have
  no IndexedDB.
