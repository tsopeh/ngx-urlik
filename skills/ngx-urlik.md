---
name: ngx-urlik
description: Use for any task involving Angular routing, URL state management, or migrating from ActivatedRoute.
---

# ngx-urlik

**Philosophy: URL is King.**
The URL is a perfectly fine place for state management—it is the single source of truth. Relying on the URL for state ensures persistent results after a reload, enables deep linking, and delivers good UX. `ngx-urlik` enforces this by treating the URL as a strictly typed, reliable data store.

## 1. Migration & Daily Setup

Whether migrating an existing component from `ActivatedRoute` or building a new one, follow these steps to connect to `ngx-urlik`.

- **Schema:** Find the application's `defineAppRouter` catalog. Define path placeholders in `pathParam` and query strings in `queryParams`. Assign a `defaultValue` to optional parameters so the application never has to check for `undefined`.
- **Injections:** Ban native Angular Router tokens. Drop `ActivatedRoute` and `Router`, and inject `AppRouter` instead.

**Completion criterion**: Every parameter the component touches is defined in the schema with a codec, and zero `ActivatedRoute` or `Router` tokens remain injected in the file.

## 2. State & Writes

Interact with the URL exclusively through the typed `RouteNode`.

- **Read:** Transform RxJS parameter subscriptions into signal reads (e.g., `node.params().query.search`). Read parameters inside a `computed()` or template. Reading an inactive route throws, so only read when the route is active.
- **Write:** Call `node.patchQuery(patch)` to update the URL. Supply only the fields that changed. The write coordinator runs updates sequentially, so concurrent patches from different components never overwrite each other.
- **Build Links:** Call `node.createUrlTree(inputs)` for strict, deterministic link generation that ignores the current URL.

**Completion criterion**: All parameter reads are synchronous signals, and every URL update uses `patchQuery` or `navigate`.

## 3. Forms and Drafts

When a user edits a parameter through a text input or form, writing to the URL on every keystroke disrupts UX and clutters browser history.

- **Rule:** The URL holds the committed state; the form holds the draft state.
- **Binding:** Bind UI inputs to `createQueryParamsSignalForm(node)`. This safely isolates partially typed text or debounced inputs. External navigations (like the back button) automatically reset the form to the committed URL state.

**Completion criterion**: Rapid text inputs bind to a draft form, never directly to `patchQuery`.

## 4. Reference: Codecs & Niceties

Consult these when configuring a node in `defineAppRouter`.

**Codecs**
Codecs convert between strings and typed values.
- Built-in primitives: `stringCodec()`, `numberCodec()`, `booleanCodec()`.
- Enums: `enumCodec(values)` accepts readonly string arrays, tuples, or records.

**Cardinality**
- `queryParam`: A single value. Last occurrence wins.
- `repeatedQueryParam`: An array represented as repeated keys (`?a=1&a=2`).
- `delimitedQueryParam`: An array joined by a separator (`?a=1,2`).

**Comparators (`isEqual`)**
You can provide a custom `isEqual` function in the node configuration to override how the `params` signal detects changes for complex parameter shapes.

**Shared Components (`activeRoute`)**
If a component is shared across multiple routes, it cannot hardcode a single `RouteNode`. Use `activeRoute` to dynamically select the deepest active candidate:
```ts
const active = router.activeRoute({ A: routes.A, B: routes.B });
// active() returns { route, node, params, createUrlTree, patchQuery }
```

**Global Queries**
To read query parameters completely independent of the active route, use `router.globalQueryParams(schema)`. This returns a readonly signal and does not write to the URL.
