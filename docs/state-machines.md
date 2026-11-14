# State machines

This file lists every piece of code that moves between states, explicit or not. For each one it
gives the states, the rules that must always hold, and what each event does. The last sections list
the gaps we know of, the costs we accept, and the cases we checked.

Paths are relative to the repo root. "Library" means `projects/ngx-urlik`, "demo" means
`projects/taste-track`.

## Router signals

`routerSignal()` in `projects/ngx-urlik/src/lib/route-node.ts` backs `params`, `globalParams()`, and
`ifActive`. Each signal keeps a cached `computed()` and remembers `source`, the
`router.routerState` it last read.

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

## Query writes

`patchQuery()` in `route-node.ts` isn't a machine of its own. It reads the committed URL, merges the
patch, and makes one `navigateByUrl()` call. Angular's navigation decides the outcome, except when
the URL wouldn't change and nothing is navigating. Then it resolves `true` without navigating:

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

## Form binding

`bindQueryParams()` in `projects/ngx-urlik/forms/query-forms.ts` serves both form systems. Its state
is spread over a few variables:

| Variable    | Holds                                                                 |
| ----------- | --------------------------------------------------------------------- |
| `pending`   | Per field, the newest edit not yet settled. Each edit is a new object |
| `held`      | Fields `writeWhen: 'valid'` held back                                 |
| `sending`   | Per field, how many writes that carry it are still running            |
| `timers`    | Per field, the Reactive Forms debounce timer                          |
| `lastUrl`   | The URL values the form last took in                                  |
| `formValue` | What the form showed after the last change the binding saw            |
| `destroyed` | Whether the injection context was destroyed                           |

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

| Event                                           | From             | To        | What else happens                                                   |
| ----------------------------------------------- | ---------------- | --------- | ------------------------------------------------------------------- |
| Edit `===` to `formValue`                       | any              | same      | nothing                                                             |
| Edit, no debounce                               | any              | Sending   | new edit object; one write for all fields changed                   |
| Edit, with debounce                             | any              | Waiting   | new edit object; timer restarts                                     |
| Timer fires                                     | Waiting          | Sending   | `writeWhen` and `beforeWrite` run first                             |
| Write starts, field invalid under `writeWhen`   | Waiting, Sending | Held      | no navigation for that field                                        |
| Write starts, edit is the URL value, none sends | Waiting, Held    | Synced    | no navigation for that field; `beforeWrite` doesn't see it          |
| Validity changes                                | Held             | Sending   | only if now valid                                                   |
| `beforeWrite` throws                            | Sending          | Stranded  | error goes to `ErrorHandler`                                        |
| Write resolves `true`                           | Sending          | Synced    | `lastUrl` takes the URL value                                       |
| Write resolves `false`, same edit still pending | Sending          | Synced    | reports `declined`                                                  |
| Write settles, the field was edited again       | Sending          | unchanged | the newer edit stays pending; a decline isn't reported, an error is |
| Write rejects                                   | Sending          | Synced    | reports `error`                                                     |
| URL changes, field Synced, URL value is new     | Synced           | Synced    | the form takes the URL value                                        |
| URL changes, field has a pending edit           | not Synced       | same      | the form keeps the draft                                            |
| Route goes inactive                             | any              | same      | reads return nothing, the form keeps its values                     |
| Injection context destroyed                     | any              | gone      | timers cleared; settling writes are ignored                         |

### Rules that always hold

1. A field with a pending edit never takes a value from the URL.
2. A write clears only the edit objects it sent. A newer edit of the same field survives.
3. A field is in `held` only while it has a pending edit. A new edit takes it out.
4. A field has a timer only while it has a pending edit.
5. `onWriteFailure` gets `declined` only when the write resolved `false` and an edit it sent is
   still pending. A write the URL already holds resolves `true`.
6. After destroy, nothing touches the form.
7. An edit equal to its field's URL value writes only to cancel a running write of that field. So
   typing `x` and deleting it on `?search=oak&page=3` keeps page 3, even with a `beforeWrite` that
   resets the page.

## Demo: the journal database

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

## Demo: the detail page's save state

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

## Demo: the settings page's reset

`SettingsPage` has `resetting` and `error`.

| Event                      | `resetting` | `error`                         |
| -------------------------- | ----------- | ------------------------------- |
| Reset confirmed            | true        | cleared                         |
| Reset and navigation work  | false       | unchanged                       |
| Reset or navigation throws | false       | "Could not reset TasteTrack..." |

**Rule:** a reset that fails says so. Resetting twice ends in the same data, so trying again is
safe.

## Demo: list pages

The catalog, library, and history pages each turn their route's `params().query` into a backend
request, and `switchMap` keeps only the newest response. Until the first response arrives, the
list is busy: it shows no empty message, Next is off, and it keeps a screen's height.

**Rule:** the list shows what the URL says. A draft in a form, such as a search too short to write,
doesn't change the list.

## Known gaps

None known.

## By design

These are costs [Design decisions](decisions.md) or the README already accept:

- Two overlapping writes lose the first one's fields, and the form keeps that draft until the
  field's URL value changes. The same goes for a form write that Back cancels: the URL shows the
  Back entry, and the input keeps the draft.
- A held field keeps its draft through URL changes, Back included.
- A field whose `beforeWrite` threw is stranded until the user edits it again.
- A declined or cancelled write isn't retried.

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
