# Development history

This file is for the people building ngx-urlik. It records what we explored, what we chose, why,
and where each topic stands. Read it before you reopen a question.

It's the only file about the past. The README and the other files in `docs/` describe the library
as it is. [Design decisions](decisions.md) gives the reasons for the current design. This file
gives the path to it. Commit hashes point to the code for each step.

## Timeline

| When            | What happened                                                                       |
| --------------- | ----------------------------------------------------------------------------------- |
| Oct–Nov 2025    | `initUrlik()`: a typed router keyed by path, with one serde per path param          |
| Apr 2026        | A second try: each page declared its own params and read `ActivatedRoute`           |
| Aug 1–9, 2026   | A written design with ADRs, built by an agent in 16 passes. TasteTrack starts       |
| Sep 2026        | A query-write queue, global query reads, `exactMatch`, signals, Plainspoken docs    |
| Sep 26–27, 2026 | The route model switches to Angular's own route array, with `routeName` and an enum |
| Oct 5–14, 2026  | A plan for a first release, on the `roadmap` branch. Package metadata on master     |
| Oct 14–15, 2026 | Form options get rebuilt. Browser-storage persistence gets built                    |
| Oct 30, 2026    | One route file, original demo data, all user docs in the README, the agent skill    |
| Nov 10–11, 2026 | The write queue goes. Persistence goes. `globalParams()` and snapshot reads arrive  |
| Nov 12, 2026    | Stricter startup checks. Comparison by URL text. Lists use `listCodec` only         |
| Nov 13, 2026    | Pages on several routes use `ifActive`. Docs describe only the present              |
| Nov 14, 2026    | The README is checked fact by fact against the code. This file starts               |
| Nov 14, 2026    | Big route trees type-check 17 times faster. Links build 12 times faster             |
| Nov 14, 2026    | Type tests move to Vitest. Library coverage reaches 99.5% of lines                  |
| Nov 14, 2026    | Form bindings compare one set of values with the URL                                |
| Nov 14, 2026    | The README is rewritten at 60% of its length. Finer rules move to the agent skill   |
| Nov 14, 2026    | `enumCodec()` takes numeric and mixed enums, and arrays of numbers                  |
| Nov 15, 2026    | Every doc is rewritten to open with the idea and read as connected prose            |
| Nov 15, 2026    | `pathParam` becomes `pathParams`, and the public types get new names                |
| Nov 18, 2026    | Patches add up. Reactive Forms `debounce` delays only typing, as in Signal Forms    |
| Nov 18, 2026    | The first GitHub issues: `writeWhen: 'submit'` and `ifActive(values)`; two declined |
| Nov 19, 2026    | The README has every fact. The skill keeps the workflow and points to the README    |
| Nov 19, 2026    | Tests run on a fake clock, so no result depends on how fast the machine is          |
| Nov 19, 2026    | The writing guide takes stricter rules, then shrinks from 142 lines to 47           |
| Nov 19, 2026    | Version 2.0.0, for the breaking changes in forms, `ifActive`, and patches           |
| Nov 19, 2026    | `writeWhen` becomes `writeOn: 'change' \| 'submit'`. Validators always apply        |
| Nov 19, 2026    | Version 2.1.0 needs Angular 22.2.6, the first release where Signal Forms work       |

The package version is `2.1.0`. In conversation we call the design after Nov 13 "API version 3".
The maintainer chose `1.0.0` for the first publish on Nov 15. Version `2.0.0` follows on Nov 19,
because the branch `feat/submit-writes-and-ifactive-values` broke the public API:
`createQueryParamsFormGroup()` returns `{ form, write }`, `ifActive` is a function instead of a
`Signal`, overlapping patches add up, Reactive Forms `debounce` delays only typing, and `writeWhen`
becomes `writeOn`.

## Step by step

The timeline in more detail, with what we kept from each design.

### 2025: a router keyed by path

`initUrlik({ routes })` (`2677519`, Oct 26, 2025) took routes shaped like Angular's. A route's one
path parameter was `pathParam: { paramName, serde }`, without Angular's `:name` syntax.

What we kept: a codec, then called a serde, owns the text conversion. Links take path and query
values in separate objects.

### April 2026: params per component

`url-params-v2.ts` (`421a936`) moved the declarations into each page, which read them from
`ActivatedRoute`. Every page repeated its route's params. There were no typed links.

What we kept: nothing. The next design moved the declarations back to the routes.

### August 2026: the strict design, 0.1.0

On Aug 1 we wrote the design before the code (`d7f30d0`): a spec, a glossary, and four ADRs. An
agent built it in 16 passes, through Aug 9. Pass 14 (`91e484b`) added the type tests and the first
TasteTrack. Routes were a tree of named objects. Each had one static segment and at most one
parameter, so adopting it meant rewriting the app's routes.
[How the restrictions loosened](#how-the-restrictions-loosened) lists the rest.

What we kept, from the four ADRs: route definitions that load with the app, codecs kept apart from
where a value sits, links built only from passed values, and Angular doing the routing.

### September 2026: features, then a new route model

Each feature came with an ADR:

- a shared query-write queue (`0f08b77`);
- `globalQueryParams()` (`6f5b102`);
- `exactMatch` (`821b371`);
- one write for the fields a form changes together (`a3c50cb`);
- `params` signals with `patchQuery()` (`d928ecf`).

The docs adopted Plainspoken Engineering (`e897331`). TasteTrack shrank to movies and TV
(`785f876`).

On Sep 26–27 the route model switched to Angular's own array (`54aa1f8`, `3ec28c7`). The ADRs
described the old model, so we dropped them. See
[The route model](#the-route-model-angulars-array-plus-routename). The route names enum (`8408394`)
and the first agent skill (`3424356`) followed.

What we kept: `params` signals, `patchQuery()`, and one write per form change.

### October 2026: a release plan, forms, and persistence

From Oct 5 to 14, the `roadmap` branch planned a first release. It required three things: tests
passing on GitHub for the exact commit, two separate apps trying the package, and one person in
charge of releases. None of the three happened, and the branch never merged.

On master, Oct 14 brought Angular 22.2.2 (`9d0733e`), an MIT license and npm metadata (`02e5fac`),
and a GitHub Pages deploy for TasteTrack (`e365058`). Oct 14–15 rebuilt the form options and built
persistence. Oct 30 moved all user docs into the README and shipped the skill in the package
(`881bd28`).

### November 2026: simplify

Nov 10 to 13 removed every feature that only compensated for an earlier choice: the write queue,
function patches, default functions, persistence, the route memory hook, `isEqual`, repeated query
keys, and the route lists passed to `activeRoute`. Three code reviews and two rounds of bug finding
ran alongside. Nov 13 made every doc describe only the present. Nov 14 started this file to hold the
past.

## How the restrictions loosened

The August design listed what it wouldn't do compared with Angular. Most of it is gone:

| Aug 2026 restriction                                    | Today                                                       |
| ------------------------------------------------------- | ----------------------------------------------------------- |
| One root, children as named object properties           | Angular's route array, any number of top-level routes       |
| One static segment and one separate parameter per route | Any Angular path with `:name` placeholders                  |
| Empty paths only at the root                            | An empty-path child shows the page at its parent's URL      |
| No named outlets, matchers, or `loadChildren`           | All allowed on unnamed routes                               |
| Redirects only as typed functions                       | Plain Angular redirects; a function can return a typed link |
| Wildcards through `fallbackRoute()`                     | Plain `**` routes                                           |
| `pathMatch` chosen by the library                       | Yours to set                                                |
| Duplicate sibling paths rejected                        | Allowed; Angular's order decides                            |
| No URL fragments                                        | Set when building a link                                    |
| A repeated query key gives its first value              | It gives its last value                                     |
| No array query parameters                               | `listCodec`                                                 |
| No Signal Forms adapter                                 | Both form systems bind                                      |
| Writes only through a full updater function             | `patchQuery()` with the changed fields                      |
| No active-route checks on `AppRouter`                   | `ifActive` on every route                                   |

Still in place:

- definitions load with the app;
- links are absolute and built only from passed values;
- query keys are the property names;
- path and query names don't repeat along a route chain;
- there's no typed link directive;
- Angular's `Router` stays injectable.

## What guides the choices

The same principles decided topic after topic. They come from the maintainer's choices across these
discussions.

- **One way per concern.** Two ways to debounce, two ways to write a list, and two kinds of route
  object each got cut to one.
- **Page decisions stay in the page.** Resets (`resetWhen`), fallbacks (default functions), and
  storage policy (`persist`) all left the route file. A route-wide rule is hard to see from the
  component that triggers it.
- **Type safety when it's cheap.** When types get heavy, like the typed persistence scopes, a
  startup check with a clear error is better.
- **Angular's behavior over our own.** We dropped the write queue for Angular's navigation rules,
  and the strict route subset for Angular's own array. Readers who know Angular already know the
  rules.
- **The maintainer picks the API.** Designs come with options and a recommendation, often as a
  prototype on a branch. Many prototypes were built and declined on purpose.
- **Remove code that only compensates for an old choice.** Once a simpler design exists, that code
  goes. The three code reviews looked for exactly that.
- **Plain words, present tense.** Docs, comments, and messages follow Plainspoken Engineering and
  describe only what is. This file is the one place for the past.
- **Original demo data.** No real or parodied titles, people, or studios.
- **Small style rules.** Braces on every body, `appRouter` for an injected `AppRouter`, and
  `npm run lint:fix` instead of hand edits.

## The route model: Angular's array plus `routeName`

**What we chose.** On Sep 26–27, 2026 (`54aa1f8`, `3ec28c7`), the library started taking Angular's
route array as it is. A named route gets a flat entry in `AppRouter.routes`. Proposal ADR 0015
called the name `identifier`. It became `routeName`. An empty-path child shows the page at its
parent's URL, which replaced `exactMatch`. Redirects became plain unnamed Angular routes. Reads and
writes became `params` and `patchQuery()` (`d928ecf`).

**Why.** An app should get typed routing without rewriting its routes. It should be able to name one
route at a time.

**Route names come from an enum** (`8408394`). Go to Definition on `routes.MOVIE_DETAIL` opens the
enum member, not a generated type. Routes are keyed by member name (`6818d8f`). A member that no
route uses throws at startup (`55e2068`), because its `undefined` entry crashed far from the cause.

**The enum became private** (Nov 14). Nothing outside the router file needed it, so the docs, the
demo, and the skill stopped exporting it. We tested three ways to hide the names inside the routes,
using the TypeScript language service:

- A private enum keeps Go to Definition, Find References, and Rename.
- Plain string names (`routeName: 'MOVIE_DETAIL'`) keep autocomplete and type errors. But Go to
  Definition finds nothing and Rename misses the route, because a mapped type keyed by `as` drops
  declarations.
- Names as object keys on the route (`{ MOVIE_DETAIL: { path } }`) navigate fully, but need an
  intersection over every named route. A prototype with 800 named routes took 20–27 s to
  type-check, against 0.5 s for string names.

We kept the enum, private to the router file.

**One route file** (Oct 30). A `defineRoutes()` helper with a `const` type parameter worked in a
prototype and kept literal types across files. We declined it. The maintainer wants one file that
maps the whole app. Apps adopt the library one feature at a time instead. Unconverted features stay
on `loadChildren`. Lazy route definitions can't work at runtime: `routerLink` takes a `UrlTree`
right away, so a link needs its path and codec synchronously.

**Where it stands:** decided. Don't propose split route files unless the maintainer raises it.

## Path params, defaults, and router options

`pathParam` changed shape three times:

1. One placeholder could take `{ codec }` directly. Several needed a map of `{ codec }` entries.
2. `e840d12` (Nov 11) always keyed it by placeholder name, so the code no longer had to guess the
   shape.
3. `d5c9bf4` made each entry the bare codec and let a map omit placeholders. The `{ codec }` wrapper
   had existed to hold `persist`, which was being removed.

`e840d12` also made defaults plain values. Default functions could inject services. They made the
same URL mean different values and pulled services into the route file. A fallback like a locale
now goes in the page.

The same commit allowed `withRouterConfig()`. An early version forced
`paramsInheritanceStrategy: 'always'` and rejected router config. It read Angular's private `ɵkind`
to do that. Typed routes now read parent values themselves.

`2aef6e8` (Oct 14) dropped the `Router.resetConfig()` check, which walked the config on every read.
It also made `createUrlTree()` always return a `UrlTree`. The 0.1.0 design returned `null` for an
unserializable path parameter, so every link had to handle a `null` that meant a bug.

**Where it stands:** decided.

## Enum values

`enumCodec()` first took only strings, from an array or a string record. A numeric enum threw,
because TypeScript's runtime object for it also holds reverse entries, like `Status[0] = 'Active'`.

On Nov 14 the maintainer asked how far a simple codec could go. A prototype showed the reverse
entries can be skipped exactly: a key is one when its value names a member whose number writes as
that key, and TypeScript forbids numeric member names. So one codec takes strings and finite
numbers, from arrays, records, and string, numeric, or mixed enums. It throws at creation when two
values write the same text, like `1` and `'1'`.

Three questions came up:

- **Value or member name in the URL.** Names read better and survive reordering. But string enums
  write values, so names would need a second codec. The maintainer chose values. Keeping enum values
  stable is the enum owner's job.
- **Booleans.** The prototype also took them, for sets like `[true, false, 'auto']`. The maintainer
  dropped them. An enum can't hold a boolean, and `booleanCodec()` is the one way to read them.
- **Open unions, like any number or `'auto'`.** A `oneOf()` helper would be short. But it can't
  check up front that its codecs' texts don't overlap, and `stringCodec()` overlaps everything. We
  stopped at fixed sets of values. Open unions stay with custom codecs.

**Where it stands:** decided, and merged to master.

## Lists and arrays

- `delimitedQueryParam` was a placement with its own separator checks and a diagnostic code. A
  comma in an item came out as `%252C`. `1f5246c` (Oct 14) replaced it with `listCodec` on an
  ordinary `queryParam`.
- `repeatedQueryParam` read `?tag=a&tag=b`. `d51585a` (Nov 12) removed it. A repeated field with a
  non-empty default had no URL text for `[]`, so "select none" read back as the default. The
  maintainer wants "select none" to work, and wants one way to write a list.
- `de94157` (Nov 12) escapes the separator inside items. Angular decodes the URL before the codec
  runs, so a comma inside an item split it.
- On Nov 15 we found that a longer separator could still lose items. With `||`, `['a|', 'b']` and
  `['a', '|b']` both wrote `a|||b`. The maintainer chose to allow only one-character separators. The
  alternative, escaping the separator's first character, would have kept longer ones working.

**Where it stands:** decided. Bring back repeated keys only if the maintainer asks, for example to
read URLs that other code writes.

## Comparing values

1. The first `isEqual` compared decoded values deeply. `b1b8099` taught it `Map`, `Set`, and cycles.
2. `7922323` (Nov 11) added one app-wide `isEqual` on `defineAppRouter()`. The default compared
   class instances by identity, because `PlainDate` keeps its state in private fields and every two
   dates looked equal.
3. `54fc6f7` (Nov 12) compares URL text instead, and `isEqual` is gone. The URL is text, and only
   the codec knows when two values mean the same thing.

`a391683` then kept a value whose new text serializes to the same text. It was for lenient codecs
that read `2026-1-1` and `2026-01-01` as one date. We reverted it (`d041983`). The maintainer
considers a lenient codec a bug: a codec writes one text per value. The maintainer's real concern
was the write side, where an unchanged value shouldn't navigate. `18dc692` covers that.

**Where it stands:** decided. Don't use lenient-codec examples in docs.

## Query writes: from a queue to Angular's rules

**What we tried.** `0f08b77` (Sep 12) added a shared query-write queue (ADR 0011). Each write read
the URL when its turn came, so two edits to different fields both reached the URL. Outside
navigations cancelled waiting writes. Function patches existed so a patch could read the query at
its turn.

**What we chose.** `cb47e3e` removed the queue on Nov 10. It reached master on Nov 11, from
`experiment/native-navigation`. `patchQuery()` calls `navigateByUrl()` right away, and the newest
navigation wins. Then:

- `766481d`: forms read and write through the same public methods as any page, with nothing
  private.
- `57bb1b3`: function patches went away. They only repeated a spread of `params()`.
- `db0ebba`: `patchQuery()` takes `navigate()`'s options. While the queue used `info` to recognize
  its own navigations, only `replaceUrl` was allowed.
- `18dc692` (Nov 12): a patch the URL already matches resolves `true` without navigating. Angular
  resolves `false` for it, which looks like a guard decline.
- Nov 15: we found that a debounced form write cancelled the user's click on a link while the next
  page was still loading, so the user stayed put. The maintainer chose that a patch cancels only an
  earlier patch, and resolves `false` while any other navigation runs. Two alternatives fell short.
  Holding writes in the form bindings alone would still let a direct `patchQuery()` on a timer
  cancel a click. Skipping only navigations to another path would still cancel a link to the same
  page with other filters.

**Why.** The maintainer had used these building blocks in other projects for months with no
navigation problems. The queue cost more to explain than it gained.

- **Patches add up** (Nov 18, branch `feat/reactive-debounce-typing-only`). The maintainer set the
  rule: patches made together give the union of their fields, and the later one wins on a shared
  field. A patch that wipes another one's fields isn't a patch. A patch made while another patch
  runs now starts from that patch's destination. The cancelled patch resolves as the one that
  included its fields. This isn't the queue: nothing waits, and the newest navigation still cancels
  the older one. The form binding now sets back fields its running write set and the new one leaves
  out. It used to send an empty patch. Clicks, `navigate()`, and Back still win over patches.

**Where it stands:** decided. Don't bring back a queue or function patches unless the maintainer
asks.

## Forms

- **`transformWrites`** (ADR 0008) gave an RxJS stream of field changes. It could express any timing
  rule. But the common case needed `groupBy` and `mergeMap`, it repeated Signal Forms' debounce, and
  it couldn't reset another field.
- **`d8bf070`** (Oct 14) replaced it with `writeWhen: 'valid'` and a Reactive Forms `debounce`
  option. Signal Forms use Angular's `debounce()` rule.
- **A throwaway prototype** (branch `prototype/forms-write-api`, Oct 14) tried those options in
  TasteTrack's forms. It concluded that the page reset belonged on the route, which led to the next
  item.
- **`resetWhen`** (`7abef4d`, Oct 14) let a query parameter name the query parameters that reset it.
  We reverted it the next day (`267318b`). Which fields reset is the page's decision. A route-wide
  rule is hard to see from the component that triggered it.
- **`beforeWrite`** (`6bf5b1a`, Oct 15) replaced it. `b0efc0f` spreads the patch last, so an
  explicit value from the page wins over the reset.
- Fixes along the way: keep a draft that encodes to its query parameter's value (`30dc17f`), report
  a decline only when a write really failed (`d040827`, then `18dc692`), and don't write an edit
  that ends at the query parameter's value (`22e6d54`).
- **A waiting debounce gives way to Back** (Nov 14). A Reactive Forms edit waiting for its debounce
  wrote over a navigation that changed the same field. Typing `elm` and pressing Back to
  `?search=oak` ended at `?search=elm`. Now that navigation drops the edit, as Signal Forms'
  `debounce()` already did. A write that finishes also records its own query parameter value for a
  field edited again, so the form doesn't mistake that write for Back.
- **Forms compare a model with the URL** (Nov 14, branch `refactor/forms-model`). The binding had
  sent each edit on its own and counted running writes, to tell its own navigations from Back. Now
  it keeps a model, the values it compares with the URL, and each write includes every field that
  differs. Reactive Forms' `debounce` delays the move into the model, as Signal Forms' `debounce()`
  does. The running-write counts, the per-edit objects, and the special Back rule for debounced
  edits went away. One bug went with them: on `?search=oak&page=3`, typing `elm` and restoring `oak`
  before that write finished lost page 3.
- **Codecs lose nothing** (Nov 14). The maintainer set the rule: compressing is fine, but reading
  must restore the value. No trimming or shortening. The README had shown a trimming codec, and the
  form kept the trailing space the codec dropped. Both went.
- **`reset()` goes to the defaults** (Nov 15). We found that `createQueryParamsFormGroup()` created
  each control with its query parameter's value, so `form.reset()` on `?search=oak` restored `oak`.
  The maintainer chose to reset to the route's defaults instead of documenting it. The forms entry
  point reads them through `ɵqueryDefaults()`, a private export of `ngx-urlik`.
- **Reactive Forms `debounce` delays only typing** (Nov 18, branch
  `feat/reactive-debounce-typing-only`). It had delayed every change, including `patchValue()` from
  code. Signal Forms' `debounce()` delays only input from `[formField]`. The maintainer preferred
  the Signal Forms behavior for both. The binding listens with `registerOnChange()`, which Angular
  calls only for values set by code.
- **Submitting ends a Reactive Forms debounce** (Nov 18, same branch). Submitting a
  `<form [formGroup]>` didn't end a debounce. Now it writes waiting typing at once, as Signal Forms'
  `submit()` does.
- **One write per step, built and removed the same day** (Nov 18). Separate `setValue()` calls went
  out as separate navigations. So the binding waited for the synchronous step to end and wrote once.
  Review showed the cost. Reactive writes started later than the line that made them, and a
  `patchQuery()` in the same step lost to the earlier form edit. Patches that add up (below) gave
  the same URL without the wait, so the wait went.
- **The binding catches up with the URL before it writes** (Nov 18). A Signal Form edit made in the
  same step as `patchQuery({ page: 2 })` wrote `page: 1` back after the patch reached the URL. The
  form hadn't taken in page 2 yet. Now the binding takes in URL changes before it compares.
- **Differences left on purpose** (Nov 18):
  - Signal Forms write waiting typing when the input loses focus or leaves the page. Reactive Forms
    emit only the first time a control loses focus, and never when an input is removed. Matching
    that would mean replacing Angular's own methods.
  - Signal Forms' `debounce()` also takes `'blur'` or a custom function. The Reactive option takes
    milliseconds only.
  - `form().reset()` in Signal Forms doesn't change values. That's Angular's behavior, and the docs
    don't cover it.
- **`writeWhen: 'submit'`** (Nov 18, branch `feat/submit-writes-and-ifactive-values`, issue #1). A
  search form should write only when the user presses Search. Reactive Forms' `updateOn: 'submit'`
  already worked with the binding, which a test confirmed. Signal Forms had no way to wait for a
  submit: Angular ends every `debounce()` wait when a field loses focus. Neither covered a field
  that changes the form at once but reaches the URL on submit. Holding the write in the binding
  covers all three.

  The maintainer chose that values set by code wait too, and that a submit with errors writes
  nothing. They didn't want `updateOn: 'submit'` in the docs. They found an earlier proposal, with
  separate `writeOn` and `updateOn` options, over-built.

  A hand-built Signal Form gets its submit action at creation, so its bind function returned the
  write. The maintainer had both bind functions return `{ write }` instead: an object that can hold
  more later. The Reactive one can then submit from code too. The create functions followed.
  `createQueryParamsFormGroup()` returns `{ form, write }` instead of the `FormGroup`. That is a
  breaking change, which the maintainer accepted while the library is early.
  `createQueryParamsSignalForm()` adds `write`. A `write()` called from code doesn't change the URL
  while the form has errors, in both form systems.

- **A review of the submit writes** (Nov 18, same branch). Two bugs turned up in Signal Forms:
  - The submit action waited for the navigation. Angular's `submit()` ignores a submit while the
    last one runs, so pressing Enter again during a slow guard lost the new search. The action now
    resolves once the write starts. The form's `submitting()` no longer covers the navigation.
  - `write()` called from code skipped typing that `debounce()` still delayed, because that typing
    isn't in the model yet. It now calls `markAsTouched()` first, as `submit()` does.

  The review also found that the Reactive binding never removed its `registerOnChange()` listeners,
  because Angular has no public way to. A form that outlived its bindings collected one listener per
  binding. Each control now gets one listener for its life, and bindings add their handlers to that
  listener and remove them. `write()` had resolved before the write it started finished, and
  immediately when one was already running. It now waits for the form's newest write. Three tests
  that passed with their code removed were rewritten or deleted. `ifActive` became a `readonly`
  property, so assigning to it no longer compiles.

- **`write()` checks errors in every mode** (Nov 19, same branch). A doc review found that `write()`
  from code, with the default `writeWhen: 'always'`, still wrote debounced typing while the form had
  errors. The docs had claimed it didn't write. The maintainer chose to make the code match: with
  errors, `write()` now leaves the URL alone in every mode, and waiting typing stays in the model as
  an unsent draft. A user's submit still follows `writeWhen`, because Angular's `submit()` ends a
  Signal Form's `debounce()` before the binding can check errors.

- **A review of the whole branch** (Nov 19, same branch). It found eight things, and the maintainer
  approved every fix:
  - `ifActive()` on a route without path or query parameters accepted any keys, because a
    `Partial` of an empty type accepts any object. Each empty side is now typed `?: never`. Links
    had the same hole for query parameters, and `createUrlTree()` and `navigate()` got the same fix.
  - A passed value whose codec failed matched a current value whose codec failed too, such as a
    default its codec can't write. A value without text now never matches.
  - A patch that carried one asking for a history entry used only its own options, so a form's
    `replaceUrl: true` write dropped the entry. The carrying navigation now adds the entry. Its
    other options stay the later patch's.
  - An `onWriteFailure` that threw made `write()` reject. The error now goes to `ErrorHandler`.
  - A value set by code left the field's debounce timer running. It was harmless, because the timer
    writes the value code set, but the binding now clears it, as it does when a query parameter
    changes.
  - Two tests now pin that a user's submit with errors, under `writeWhen: 'always'`, still writes
    waiting typing.
  - The README now says that Angular reports a submit only to the group on `<form [formGroup]>`.

- **`writeWhen` becomes `writeOn`** (Nov 19, master, before 2.0.0 was published). The maintainer
  found that `writeWhen: 'always' | 'valid' | 'submit'` mixed two concepts. `'submit'` names what
  starts a write, and `'valid'` names a check on each field. `'always'` was also inaccurate, because
  `write()` from code doesn't write while the form has errors. We considered renaming the values
  to `'changed' | 'valid' | 'submitted'`, and splitting the option into a trigger and a validity
  flag. The flag would mean "per field" with one trigger and "whole form" with the other, and its
  fourth combination, a submit that writes despite errors, contradicts `write()`. The maintainer
  also rejected boolean flags in options.

  They chose `writeOn: 'change' | 'submit'`, with validators always applying. With `'change'`, a
  field is written once its validators pass. With `'submit'`, a submit writes only when the form
  has no errors. A field without validators always passes, so forms without validators behave as
  `'always'` did. What's gone is writing a value while its own validators fail. A user's submit with
  errors under `'change'` now writes the valid fields only, in both form systems.

  `write()` from code now follows the same rule, which reverses "`write()` checks errors in every
  mode" above. With `'change'` it writes the valid fields, and with `'submit'` it writes nothing
  while the form has errors. The maintainer set the rule that both form systems behave the same,
  and that what one of them can't do sets the rule for both. Signal Forms can't stop a user's
  submit from writing valid typing under `'change'`, so checking each field is the rule. The
  submit handler's `fromCode` flag went away with it.

**Where it stands:** open. The maintainer considered dropping the Reactive Forms `debounce` option
for Angular's experimental `debounced()`, which delays reading a value instead of writing it. They
deferred it on Nov 13: "leave out debouncing for now." On Nov 14 we compared the two again. Delaying
reads makes every keystroke a navigation, with its router events, analytics, and Safari's limit of
100 `replaceState()` calls in 30 seconds. A page that delays only the search also reads a mix of two
URLs, because `beforeWrite` resets the page right away. The Back problem above was the main case for
delaying reads, and it's fixed.

## Remembering values outside the URL

The maintainer had two cases in mind. Opening the site's root should land in the last workspace,
which is a path parameter. A new tab should show the last date range, maybe one per workspace, which
is a query parameter.

**Design 1: fill in the URL as it arrives** (Oct 15, branch `improvements-2`). A field declared
`persist: { key, storage, scope }`. A navigation without the value redirected to the same URL with
the stored value filled in. It needed:

- a `canMatch` check on every route above a persisted field (`d479ccb`);
- hidden routes with a `matcher` and `redirectTo` for path parameters at the end of the URL, so a
  restore took one navigation (`65902e5`);
- a platform check, because matchers can't inject `PLATFORM_ID`;
- persisted fields always in the URL, even at their default;
- `clearPersisted()` (`07d3594`), and forgetting stored text that fails to decode (`688bfd4`).

`canMatch` guards ran twice on a restore. The alternatives were worse:

- A `canActivate` guard (`9d6b5d4`) ran even more of the app's own guards twice.
- A `UrlHandlingStrategy.extract()` prototype (branch `prototype/extract-restore`) needed a copy of
  Angular's matching rules.

The maintainer wouldn't accept code that sees a URL that a restore later completes. They also
wouldn't maintain a copy of Angular's matcher.

**Design 2: fill values into typed links** (Nov 11, `d5c9bf4`, branch `prototype/route-memory`). The
core had one hook, `RouteMemory { remember, recall }`, for an app to plug storage into.
`ngx-urlik/memory` kept values in `sessionStorage`, then `localStorage`. A URL meant what it said.
But a hand-typed URL got nothing, links built once in a class field went stale, and a missing field
couldn't say "never chosen".

**What we chose.** `561de2b` (Nov 11) removed both. Apps remember values with `globalParams()`. The
prototype's simplifications stayed: `pathParam` entries are plain codecs, a map may omit
placeholders, and the startup check walks the routes once. `cc631a2` (Nov 12) moved TasteTrack's
page size to a fallback in the page, `query.pageSize ?? saved ?? 24`, with no default on the field.

**Where it stands:** persistence stays out of the library. If it comes back, start from `d5c9bf4`.

## Reading values on every page, and in guards

- `6f5b102` (Sep 13) added `globalQueryParams()` (ADR 0012), for query parameters only.
- `f9e88fc` (Nov 11) replaced it with `globalParams({ path, query })`. Path parameters are read by
  placeholder name and are `null` when absent.
- `b1b8099` (Oct 14) added `routes.NAME.paramsFrom(snapshot)` for guards. `a847dae` (Nov 11) moved
  it to the router as `paramsSnapshot(route, snapshot)`, next to a new `globalParamsSnapshot()`.
  The maintainer wanted the name to say "not a signal", and wasn't sure about `paramsSnapshot`.
- A typed guard helper, `routes.NAME.guard(...)`, was judged not worth it.
- Keeping `params()` readable after its route leaves, like `ActivatedRoute`, was proposed and
  dropped. A service would then silently read values from a page that's gone. An error is better.
- **`globalParamsNow()`** (issue #4, declined Nov 18). An HTTP interceptor wanted a plain read of
  global values, without a signal or a snapshot. A root service that creates the `globalParams()`
  signal once and reads it on each request does that today. Creating a signal costs one
  `computed()`. A plain read wouldn't close the real gap either: a resolver's requests run before
  the router switches pages, so they see the old page's values. The reply shows passing the value
  from `globalParamsSnapshot()` through `HttpContext`.

**Where it stands:** decided, apart from the name `paramsSnapshot`, which the maintainer isn't sure
about.

## Pages on several routes

This changed six times in two months:

1. `activeRoute({ movie: MOVIE, episode: EPISODE })` (ADR 0007) returned a signal narrowed by the
   key. It threw when no candidate was active.
2. `c5e5a86` (Nov 13): `{ optional: true }` held `null` instead, for nav bars.
3. `0385833`: an array of routes, narrowed by `routeName`. The map's keys had named every route
   twice.
4. `c28757c`: `router.activeRoute`, one signal holding the page, with `is(route)` to narrow. No
   candidate list.
5. `8debcbc`: `routes.NAME.isActive`, a `Signal<boolean>` on every route. Each read uses its own
   route's `params()`, so nothing needs narrowing.
6. `e09fb62`: `ifActive` holds the node itself, or `null`. The check and the read can't name
   different routes: `EPISODE.ifActive()?.params()`.
7. Nov 18, issue #2: `ifActive(values)` also checks the passed values, for a table that greys out
   the link to the current page. The app had used the escape hatch's `isActive()` with `'exact'`.
   That compares text, so a default written out didn't match. We first proposed a new
   `isCurrent(values)`, which matched only when clicking the link would change nothing. The
   maintainer asked what happens to values the route doesn't know, and whether the existing API
   could take this. That led to Angular's `'subset'` rule, done with codecs, on `ifActive()` itself.
   `ifActive` stopped being a `Signal`, because signals take no arguments. The maintainer accepted
   that small break, since 1.0.0 is still early.

Considered and set aside on the way: a `router.page(...)` handle, a static `routes` import for
links, static navigation (it breaks SSR and multiple apps), `params()` returning `null`,
`MOVIE.or(EPISODE)`, and match callbacks. The maintainer declined an exact-match `ifPage()`. The
maintainer confirmed that every page starts from `inject(AppRouter)` and finds its routes by typing
`appRouter.routes.` and reading the autocomplete.

**Where it stands:** decided on `ifActive()`, with optional values.

## Running code after each navigation

Issue #3 (declined Nov 18) asked for a `navigationCount()` signal, to close a drawer on every
navigation without the escape hatch. Most navigations here are query writes, so a counter would
close the drawer while the user types a search. Angular also skips a click on a link to the current
URL, so the counter wouldn't move there. The maintainer chose to point to the escape hatch, where
the app listens for the router events it cares about.

**Where it stands:** decided. No navigation counter.

## Packing state into one `?state=` value

Branch `experiment/compressed-state` (Nov 11) compared ordinary query parameters with JSON
compressed by deflate-raw and written as base64url. On typical filter pages, packing made the URL 7%
to 86% longer. It won on big selections, like 300 ids at 39% shorter, and on non-ASCII text, like a
Cyrillic search at 46% shorter. It always beat raw JSON, which escapes badly.

**Where it stands:** nothing built. The findings are in `docs/compressed-state-experiment.md` on
that branch.

## Signals during navigation

Angular switches to the new router state, and creates the new page, before `NavigationEnd`.
`b1b8099` (Oct 14) made each signal remember the state it read and read again when Angular has a
newer one. A component created during activation then sees its destination. The same commit added
the `canMatch` codec check, so a path parameter its codec rejects falls through to the next route.
It also added `escapeHatch.isActive()`, because Angular deprecated `Router.isActive` in 21.1.

A later review judged this `routerSignal` worth keeping. It compensates for Angular's ordering, not
for a choice of ours.

## Speed

On Nov 14 we measured before changing anything. The runtime was already fast. A navigation took
about 0.43 ms, with or without 167 signals reading the router. Two things weren't fast.

**Type checking.** A route literal like a real app's, with 161 named routes, took 5.2 seconds to
type-check, then failed with TS2589, "excessively deep". 321 routes took 19.5 seconds. Plain Angular
`Routes` with the same shape took 0.03 seconds. Two types caused it:

- Named routes were collected by walking siblings as `[head, ...rest]`, so recursion grew with the
  number of siblings. That caused TS2589. Collecting a union of entries fixed it, but the time
  stayed at 5 seconds.
- The `routes` option was `InferDefinition<R> & ContextualRouteArray<NoInfer<R>>`. A trace showed
  TypeScript comparing the literal with that whole intersection, including the `map` and `flatMap`
  signatures of every route array. One type that infers and checks in the same walk brought 161
  routes to 0.30 seconds.

We tried dropping `InferDefinition`. The type tests passed, but every callback in a route, like a
guard's `route`, became an implicit `any`. The type tests had no callbacks. So
`generate-large-app.mjs` now writes a 201-route app with a guard in every section. Against the old
types it takes 16.7 seconds and fails. Against the new ones it takes about a second.

| Named routes | Before         | After  |
| ------------ | -------------- | ------ |
| 41           | 0.56 s         | 0.15 s |
| 161          | 5.2 s, TS2589  | 0.30 s |
| 321          | 19.5 s, TS2589 | 0.47 s |
| 801          | not measured   | 1.0 s  |

Error messages and their lines stayed the same, except one false `loadComponent` error that went
away.

**Links.** `createUrlTree()` took 11.6 µs, and Angular's own `router.createUrlTree()` took 10 µs of
that. Building the `UrlTree` directly takes 0.93 µs. A test checks that the tree is the one Angular
would build.

**Reads after a navigation.** 160 `ifActive` signals each walked the router's snapshot tree. Walking
it once per router state and sharing the result cut reading 167 signals from 70 µs to 40 µs. The
rest is Angular's own signal work.

## Tests

On Nov 14 the library tests reached 92.8% of lines and 88.9% of branches. The escape hatch was 23%
covered, and most startup checks had no test. The type tests were statements with `satisfies`,
which only checks that a type fits. So `number | undefined` still passed when a type became
`number`. They also had no callbacks in routes. That's how dropping `InferDefinition` passed them
while breaking every guard's types.

The maintainer chose to move every type test to Vitest's typecheck mode: `*.test-d.ts` files with
`describe` and `it`, exact `expectTypeOf` checks, and `@ts-expect-error` for code that must not
compile. The alternative was plain compiler statements plus a second test style. One way to write a
type test won.

New unit specs cover the startup checks, path parameters and their failures, and the escape hatch.
The forms gained tests for failures and for a destroyed binding. Library tests went from 100 to 142.
Coverage reached 99.5% of lines, 98.1% of branches, and every function. The tests also found one
line of dead code: a `NaN` check in `numberCodec()` that its pattern made unreachable.

The maintainer wants tests for the library, not for TasteTrack. The end-to-end tests cover its
pages.

On Nov 19 one forms test failed during a full run and passed when run again. The forms spec waited
on the real clock. It slept 80 ms to let a 40 ms debounce end, and polled with `vi.waitFor()` until
a write reached the URL, so a busy machine could make a test fail. The maintainer wants every test
to be perfectly predictable. So the spec now runs on Vitest's fake clock, and `elapse(ms)` moves it
by an exact amount, runs effects, and lets the navigations they start finish. The debounce tests
check the URL 1 ms before the delay ends and again when it ends, so they also catch a debounce that
fires early. AGENTS.md has the rules for writing tests this way.

The same day, the `writeWhen: 'valid'` case of a `write()` test turned out to pass without the fix
it covered. The test put the error on the field being written, and `'valid'` already holds back an
invalid field. The error now sits on another field, so only the fix can stop the write.

## Startup checks

Nov 12 tightened what `defineAppRouter()` rejects:

- an enum member no route uses (`55e2068`);
- `pathParam` or `queryParams` on routes with no named route below (`94a1906`), because a misspelled
  key there was ignored;
- query parameters that `queryParam()` didn't make (`35e495a`).

Nov 11 refused `.` and `..` as path parameter values (`a534f90`). Angular's router navigates to
`/items/..` as written, but a browser resolves it to `/`.

## Code reviews

Three rounds on Nov 11–12 looked for code that only compensated for earlier choices:

- **Round 1** made defaults plain values, keyed `pathParam` by placeholder, and let router options
  go through `withRouterConfig()`. Two more ideas, both about persistence, stopped mattering when
  persistence was removed.
- **Round 2** moved the page size to a fallback in the page, added one app-wide `isEqual`, and
  compiled every route array the same way (`8329179`). Keeping `params()` after its route leaves
  was dropped, as above.
- **Round 3** compared URL text instead of `isEqual`, and made `patchQuery()` resolve `true` when
  the URL already matches the patch.
- **Round 4** (Nov 20, branch `audit/compensating-code`) replaced `QueryParamDefinition`'s phantom
  `Defaulted` type parameter with a discriminated union, returned tagged `{ ok, text }` outcomes
  from `queryText()` and `pathText()`, cached canonical URL text per `RuntimeState` for repeated
  `ifActive(values)` checks, kept `routerSignal()`'s Lagging reads from mutating `ValueCache`,
  replaced `patchQuery()`'s three `UrlTree` Weak collections and re-decoding with a single
  `pendingWrite` record that writes only supplied keys, replaced `ɵqueryDefaults` and
  `takeWrittenValues()` with `ɵqueryRouteSupport()` so form bindings compare by canonical URL text
  and read active routes without a broad `try/catch`, split `query-forms.ts` around a shared
  `createQuerySync()` reconciler with per-system adapters (deleting the `registerOnChange()` WeakMap
  and `shown` shadow so Reactive Forms debounces all `valueChanges` and immediate code writes use
  `patchQuery()` or `write()`), separated Signal Forms' `submitAction()` from `write()` so `write()`
  no longer sniffs `submitting()`, merged route validation and compilation into a single pass in
  `compileRoutes()`, and removed caller-side workarounds in TasteTrack (`HistoryPage` date clearing,
  `DetailPage` route union and `FormControl` selects, and `Preferences` initialization via
  `provideEnvironmentInitializer()`).

We left these as they are, because a redesign wouldn't make them simpler: `routerSignal`, the
`canMatch` codec check, the form binding's `pending`, `lastUrl`, and `held` (now `invalid`), the
enum reverse lookup, and `escapeHatch`.

On Nov 13 we went through the repo for leftovers (`46a58b8`): an unread
`CompiledRoute.angularRoute`, an `equal` alias in the forms, and type aliases with two names. Every
variable holding `inject(AppRouter)` became `appRouter` (`be52126`).

## Bugs we found

On Nov 11 we listed every piece of code in the library and the demo that moves between states, then
looked for bugs in each. We fixed five:

| Bug                                                       | Fix                                         |
| --------------------------------------------------------- | ------------------------------------------- |
| A double-clicked favorite stayed on                       | Read the entry inside the write (`a60ff0b`) |
| The library list followed form drafts, not the URL        | Read `params()` (`10da355`)                 |
| `onWriteFailure` reported declines for writes that worked | `d040827`                                   |
| "Viewing saved." for a date the journal rejects           | `7877785`                                   |
| `.` and `..` built links a browser rewrites               | `a534f90`                                   |

Three more were possible but not fixed that day. We fixed them on Nov 13:

- One `saving` flag let Log viewing turn back on while a log still ran (`530799b`).
- Lists said "No titles match" while loading (`7ab2edd`), and stayed busy forever when the journal
  failed to open (`8580262`).
- A failed reset showed nothing (`2c1ca5d`). A committed write whose reload failed asked the user to
  retry (`b43d854`).

## TasteTrack

- `785f876` (Sep 9) cut the demo to movies, shows, seasons, episodes, people, and studios. Music,
  theatre, tags, and the dashboard went.
- `58e185e` (Oct 30) shortened the URLs: `/tv/brambleworth-manor/s/2/e/1`. The ID codec hides the
  `tv_` prefix.
- `9e43e47` (Oct 30) replaced parodies of real titles with 30 original movies and 30 shows. The
  maintainer wants no legal ambiguity. Every new title, person, and studio gets a web search first.
- `e365058` (Oct 14) deploys the demo to GitHub Pages from master.
- On Nov 14 the Angular project and its folder became `demo-app` (`projects/demo-app`), so the
  workspace names the demo plainly. The app is still called TasteTrack.

## Docs and style

- `e897331` (Sep 26) added Plainspoken Engineering. `7fd29e0` (Nov 11) sharpened it and applied it
  to docs, comments, and error messages. The maintainer wants it in chat replies too.
- `f7032a7` (Oct 14) moved the ADRs into `decisions.md`. `4e39249` (Oct 30) put all user docs in
  the README, which the package ships through a symlink.
- `c2570be` (Nov 13) deleted the earlier `history.md`. The maintainer wants every reader-facing doc,
  comment, and message to describe only the present. This file records the past instead.
- On Nov 14 the state-machine tables moved from `state-machines.md` into `implementation.md`, next
  to the prose about the same code. Each change to the form binding had touched both files.
- On Nov 14 the maintainer asked for a much shorter README that is pleasant to read and very useful.
  It was rewritten from scratch, from 7,100 words to about 4,300, with a section on the idea behind
  the library. Easy-to-miss rules moved to a new section of the agent skill. Examples stopped using
  a `page` field, because a reader can't tell a `page` parameter from a web page. They use `search`
  and `minRating` instead.
- On Nov 15 the docs stopped covering hand-edited URLs. The maintainer expects the app to write
  every URL it reads, so a value it didn't write is just invalid. The docs no longer say how a patch
  rewrites text like `?minRating=02`, or which odd input `numberCodec()` rejects. The custom codec
  section shows compact formats instead: a date range that writes whole days as
  `2026-11-01..2026-11-15`, and an API's paging value, `3,24,130`. That example's field is `paging`,
  not `page`.
- On Nov 15 the maintainer read the README's opening, a walk through
  `/results?search=oak&minRating=4` before any idea, and found it stiff: nobody would write it that
  way or enjoy reading it. The cause was the style guide itself. Its rule of short sentences with
  one idea each had turned every paragraph into a string of clipped statements. The opening went.
  Plainspoken Engineering now asks for the idea first and for prose that connects its sentences,
  with the same plain words. The README, the agent skill, `decisions.md`, and `implementation.md`
  were rewritten to match, with no change to what they claim. The rewrite also restored the skill's
  YAML frontmatter, which `dab2610` had collapsed onto one line.
- On Nov 19 the README got a short opening on the problem the library solves, and its prose was
  tightened. The maintainer then wanted a developer to learn everything from the README, while the
  skill kept what an agent needs. Copying every fact into both files would mean two matching edits
  per behavior change. A skill that only points to the README gets skipped, because an agent assumes
  it already knows enough. So the facts that lived only in the skill's "Details that are easy to
  miss" section moved into the README, which grew from about 6,200 words to 6,900. The skill shrank
  from about 2,500 words to 1,000. It keeps the steps, their checks, and the rules as instructions.
  It names the README sections each step needs, and tells the agent to read a section before using
  an API new to the task.
- On Nov 19 the paging example dropped its total item count: `?paging=3,24,130` became
  `?paging=3,24`. The total comes from the server, so it doesn't belong in the URL. The same review
  replaced contrived examples, like `'7' + 1` giving `'71'` and a "Next movie" button that added 1
  to the ID, with gains a real page has: a path parameter its codec rejects doesn't match the
  route, and a link that keeps the search while it changes the rating.
- On Nov 19 the maintainer tried stricter writing rules on every doc and comment. The rules asked
  for the mechanism instead of the benefit, one idea per sentence, and no word that carries no
  meaning. Comments explain only what the code can't show, and each rewrite ends with a list of
  ambiguities. The maintainer judged the result better than before, but not perfect. So the rules
  were merged into Plainspoken Engineering, with what still helped from the old guide. The one-idea
  rule now comes with a second rule, to link related sentences with “because”, “so”, or “but”. That
  pairing guards against the clipped tone of Nov 15. The maintainer then had the guide cut from 142
  lines to 47, because a guide about short, clear writing has to be short and clear itself. Each
  rule is now one line with a small example. AGENTS.md also points to the guide for code comments
  and error messages, not only docs.
- ESLint requires braces on every body (`3011517`, `d117a48`). Fix style with `npm run lint:fix`,
  not by hand.

## Names, and a report for lost patches

On Nov 15 we went through the repo asking what would help Angular developers adopt the library. The
maintainer took three of the findings, all cheaper to change before a first release, and kept two:

- **`pathParam` became `pathParams`.** It has been a map of codecs since `e840d12`, and it sits next
  to `queryParams`. The singular name dated from 2025, when a route took one path parameter.
- **Public types got names that say what they are.**
  - `GeneratedAppRouter` became `TypedAppRouter`, because nothing is generated.
  - `RouteStateOf` became `ParamsOf`, after `params()`.
  - `RouteQueryPatch` became `QueryPatchOf`, so every helper that takes a route ends in `Of`.
  - `UrlParamsState` stopped being exported, because `ParamsOf` names the same thing.
  - `RoutesOf<typeof AppRouter>` is new. A route's types could only be named from an injected
    variable, so TasteTrack's catalog page wrote `Partial<ReturnType<typeof this.binding.model>>`.
- **A report for lost patches was built and removed the same day** (`64c4263` has the code). Two
  patches in one tick lose the first one's fields. `diagnostics: { replacedPatches: true }`, off by
  default, reported those fields as `PATCH_REPLACED`. The maintainer had asked for a setting, not a
  development-mode warning: one that works in production and never changes execution order. It went
  because the app can already see a lost patch, whose promise resolves `false`. It also cost too
  much for that. `AppRouterDiagnostic` became a union of two shapes. The form binding needed extra
  code so that typing `x` and deleting it didn't trigger the report.

Set aside for now: CI for the tests, a wider Angular peer range, an integer codec, a default
separator for `listCodec`, and README sections on testing and on how the library compares with input
binding.

**Where it stands:** decided. Don't bring the report back unless the maintainer asks.

## First publish

Later on Nov 15 we prepared the first publish. The README's install section became
`npm install ngx-urlik`. Its links to `docs/`, the demo's source, and the license became full GitHub
URLs, because the package ships the same README and npmjs.com can't follow relative paths. The
maintainer set the version to `1.0.0`. `npm run release:check` runs formatting, lint, unit tests,
type tests, the Playwright suite, the library build, and `npm pack --dry-run`. `npm run release`
runs that check, then publishes `dist/ngx-urlik` publicly.

On Nov 19 a review of the whole branch for the first GitHub issues proposed the next version. The
branch changed the public API in ways that break code written for `1.0.0`, so semver calls for a
major version, and the maintainer chose `2.0.0`.

Later on Nov 19, while preparing `2.1.0`, the maintainer asked for a peer range of any Angular 22
release. The library's tests, run against several Angular releases, showed that the `^22.1.0` range
`2.0.0` declared was already too wide. On 22.0.8, 22.1.0, 22.1.8, and every 22.2 patch through
22.2.5, six Signal Forms tests fail: submits, and typing still waiting for `debounce()` when the form
writes. 22.2.6 and 22.3.0 pass all 197. Up to 22.2.5, a form's `markAsTouched()`, which `submit()`
also calls, ends only the form's own wait. From 22.2.6 it ends the `debounce()` wait of every field,
and `bindQueryParamsToSignalForm()` relies on that. Everything else, Reactive Forms included,
passes on 22.0.8. npm can't give one entry point a different range, so the maintainer chose
`^22.2.6` for every Angular peer. Apps on an older 22.x update Angular before they install `2.1.0`,
even when they don't use Signal Forms.

**Where it stands:** `2.0.0` is published, and `2.1.0` declares `^22.2.6`. CI for the tests, which
could run them on the lowest supported Angular, is still set aside.

## Branches

Experiments stay as branches, so you can read the code of an idea we set aside:

| Branch                         | Holds                                               |
| ------------------------------ | --------------------------------------------------- |
| `improvements-2`               | Browser-storage persistence with `canMatch` restore |
| `prototype/extract-restore`    | The `UrlHandlingStrategy.extract()` restore         |
| `prototype/route-memory`       | The `RouteMemory` hook and `ngx-urlik/memory`       |
| `refactor/no-route-memory`     | Persistence removed, simplifications kept           |
| `experiment/native-navigation` | The write queue removed                             |
| `explore/v3-api`               | The `isActive` and `ifActive` designs               |
| `exact-match-handling`         | The 0.1.0 `exactMatch` work                         |
| `prototype/forms-write-api`    | The forms options prototype, with a route reset     |
| `experiment/compressed-state`  | URL length measurements for a packed `?state=`      |
| `roadmap`                      | The plan for a first release, and fixes made for it |
