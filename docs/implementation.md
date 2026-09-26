# Reading the code

Start with `projects/ngx-urlik/src/lib/app-router.ts`. It validates the definitions, compiles the
routes, and provides the router. The type inference lives in `app-router-types.ts`, so you can
follow the runtime without reading the recursive types first.

There are three paths through the implementation.

## Define

`route-definition.ts` checks the tree. `compiled-route.ts` turns it into Angular routes and
records each node's parents and parameters. A child inherits its parents' parameters during
this pass. The result is the shared input for URL construction and state reads.

## Read or construct

`route-node.ts` attaches operations to each route node. `createUrlTree` walks the route's ancestry
and encodes the values supplied by the caller. `params` finds the active Angular snapshot and
decodes its values. `route-params-runtime.ts` handles codecs, defaults, and malformed input.

Angular performs route matching. ngx-urlik uses the matched route to find the declared schema.

## Write

Suppose two controls change different filters before either navigation finishes. If both build
a URL from the same old snapshot, one can erase the other's edit.

`query-write-coordinator.ts` prevents this by running one write at a time. A patch reads the
committed query when its turn starts, merges its fields, and navigates. The next patch sees the
result. A rejected write leaves the queue free to continue.

Navigation away needs a separate rule. When an external navigation starts, the coordinator
cancels waiting work before a completed promise can release it. Otherwise a stale filter edit
could navigate the user back to the page they just left.

## Follow a form edit

`projects/ngx-urlik/forms/query-forms.ts` adapts both Angular form systems to the same binding.
The form holds a draft that may be waiting for a debounce or a guard. The URL holds committed state.

The binding remembers each edit as an object. On success, it clears the object that write
submitted. If the user has edited the same field again, the newer object stays. Incoming URL
values are combined with outstanding edits before the form is updated.

One form notification can change several fields. Synchronous outputs from its write transformation
share one queued write. Delayed outputs submit later. All of these writes use the router's queue.

External navigation clears the edits, resets the form, and reconnects the transformation stream.
Reconnecting also cancels its debounce timers. The private `ɵgetQueryBinding` bridge gives the
forms package access to fresh route state and the coordinator.

## Check a change

Library test paths below are relative to `projects/ngx-urlik`.

| Change                                     | Tests                                           |
| ------------------------------------------ | ----------------------------------------------- |
| Definitions, links, state, or redirects    | `src/lib/app-router.spec.ts`                    |
| Patches, ordering, guards, or cancellation | `src/lib/query-update-concurrency.spec.ts`      |
| Form drafts, batching, or debounce         | `src/lib/query-forms.spec.ts`                   |
| Global query reads                         | `src/lib/global-query-params.spec.ts`           |
| Consumer type inference                    | `type-tests/consumer.ts` at the repository root |

Build before testing: the forms package and consumers resolve the built library in `dist`.
Test what a caller observes so the checks survive changes to the internal structure.
