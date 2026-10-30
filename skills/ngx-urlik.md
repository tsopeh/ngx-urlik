---
name: ngx-urlik
description: Use for any task involving Angular routing, URL state management, or migrating from ActivatedRoute.
---

# ngx-urlik

**Philosophy: The URL is the Source of Truth.**
Most front-end complexity comes from trying to reinvent state management. But the web already has a foundational state store: the URL. It is the only state that survives a page reload, the only state a user can bookmark, and the only state you can safely share. If state isn't in the URL, it doesn't really exist. `ngx-urlik` enforces this reality by turning the URL into a strictly typed, declarative data store.

## 1. Declarative Setup & Migration

When moving a component from the native `ActivatedRoute` to `ngx-urlik`, the goal is to eliminate implicit state and untyped reads.

- **Schema:** Find the `defineAppRouter` catalog. Declare path placeholders in `pathParam` and query fields in `queryParams`. Define explicit `defaultValue`s for optional parameters. If a parameter isn't typed here, it shouldn't be read.
- **Injections:** Purge native routing tokens. Remove `ActivatedRoute` and `Router`. Inject `AppRouter`.

**Completion criterion**: Every parameter the component touches is defined in the schema with a codec. Zero `ActivatedRoute` or `Router` tokens remain in the file.

## 2. State & Writes

Interact with the URL exclusively through the typed `RouteNode`.

- **Read:** Convert RxJS subscriptions into synchronous signal reads (`node.params().query.search`). Read parameters within a `computed()` or template. If the route is inactive, reading it throws—only read active routes.
- **Guards and resolvers:** Read the destination with `node.paramsFrom(route)`, passing the snapshot Angular gives the guard or resolver. `params()` still describes the previous page there.
- **Write:** Call `node.patchQuery(patch)`. Provide only the fields that actually changed. The write coordinator queues updates sequentially, ensuring concurrent patches never clobber each other.
- **Build Links:** Call `node.createUrlTree(inputs)` for deterministic link generation that ignores current URL context.

**Completion criterion**: All parameter reads are synchronous signals. Every URL update is a `patchQuery` or `navigate` call.

## 3. Forms and Drafts

There is a fundamental difference between draft state (what the user is typing right now) and committed state (what the URL holds).

- **Rule:** Never bind rapid text inputs directly to the URL. Doing so destroys UX and pollutes browser history.
- **Binding:** Use `createQueryParamsSignalForm(node)` to isolate the draft state. The form holds the user's unfinished edits; the URL holds the committed truth. If an external navigation occurs (like a back button press), the form automatically resets to match the URL.

- **Timing and validity:** Delay Signal Forms fields with Angular's `debounce()` schema rule and Reactive Forms fields with the binding's `debounce` option. Pass `writeWhen: 'valid'` to hold invalid input back. Put value shaping, such as trimming, in the codec.
- **Dependent fields:** Reset fields such as `page` in the binding's `beforeWrite` (`(patch) => ('search' in patch ? { page: 1, ...patch } : patch)`), or set them in the same `patchQuery()` patch (`patchQuery({ search, page: 1 })`).

**Completion criterion**: Text inputs and debounced controls bind to a draft form, never directly to `patchQuery`.

## 4. Primitives & Reference

Consult these primitives when configuring a node in `defineAppRouter`.

**Codecs**
Codecs strictly translate between strings and types.

- Primitives: `stringCodec()`, `numberCodec()`, `booleanCodec()`.
- Enums: `enumCodec(values)` accepts readonly string arrays, tuples, or records.
- Lists: `listCodec(item, separator)` joins items into one value (`?a=1,2`). Use it with `queryParam` and `defaultValue: []`.

**Cardinality**

- `queryParam`: A single deterministic value.
- `repeatedQueryParam`: An array represented as repeated keys (`?a=1&a=2`).

**Persistence**

- `queryParam({ codec, defaultValue, persist: { key, storage: 'local' | 'session', scope? } })` saves the committed value and writes it back into a URL that lacks it. Keys cannot contain `:`. Persisted fields always appear in the URL; repeated fields and fields without a default cannot persist. A named route's trailing placeholders can persist too (`pathParam: { codec, persist }`): the URL without them redirects to the stored values. That shorter URL is always the route's own path minus those placeholders, so choose the path with it in mind (`tv/:showId/s/:seasonNumber` restores at `tv/:showId/s`), and add an ordinary redirect after the route for when nothing is stored. A stored value that fails to decode is removed. A value that decodes but the backend rejects is the app's to handle. `router.clearPersisted()` forgets stored values, for example on a reset button or after such a rejection.

**Comparators (`isEqual`)**
You can provide a custom `isEqual` function in the node configuration to override how the `params` signal evaluates equality for complex objects.

**Shared Components (`activeRoute`)**
If a component exists across multiple routes, it cannot depend on a single hardcoded `RouteNode`. Use `activeRoute` to dynamically resolve the deepest active candidate:

```ts
const active = router.activeRoute({ A: routes.A, B: routes.B });
// active() returns { route, node, params, createUrlTree, patchQuery }
```

**Global Queries**
To read query parameters that exist independently of the active route hierarchy, use `router.globalQueryParams(schema)`. This yields a readonly signal without affecting URL writes.
