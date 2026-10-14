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
- **Write:** Call `node.patchQuery(patch)`. Provide only the fields that actually changed. The write coordinator queues updates sequentially, ensuring concurrent patches never clobber each other.
- **Build Links:** Call `node.createUrlTree(inputs)` for deterministic link generation that ignores current URL context.

**Completion criterion**: All parameter reads are synchronous signals. Every URL update is a `patchQuery` or `navigate` call.

## 3. Forms and Drafts

There is a fundamental difference between draft state (what the user is typing right now) and committed state (what the URL holds).

- **Rule:** Never bind rapid text inputs directly to the URL. Doing so destroys UX and pollutes browser history.
- **Binding:** Use `createQueryParamsSignalForm(node)` to isolate the draft state. The form holds the user's unfinished edits; the URL holds the committed truth. If an external navigation occurs (like a back button press), the form automatically resets to match the URL.

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
