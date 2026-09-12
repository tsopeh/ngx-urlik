# ADR 0011: Share ordered query writes across routes and forms

Status: accepted. Supersedes ADR 0008's binding-local coalescing decision.

## Decision

Each generated router tree owns one internal query-write coordinator. Direct
`updateQueryParams()` calls and both forms integrations submit to it automatically. Public method
signatures remain unchanged; there is no queue configuration or transaction interface.

Writes execute in submission order. Each updater executes once, when its turn starts, against fresh
committed state independent of signal equality. Later writes to the same field win. Every write
retains its own `replaceUrl` choice and native navigation result; writes are not batched. Updater
exceptions reject the returned promise rather than throwing synchronously.

Navigation outside the coordinator invalidates waiting work at navigation start, even if a guard
later blocks it. Waiting writes resolve false without invoking their updater. New submissions
while external navigation is pending are declined. A guard redirect from a coordinated write also
invalidates waiting work. The active write retains Angular's result for its redirect chain.
Ordinary guard rejection or an error settles only that write; remaining writes continue from the
committed URL. Same-URL skips retain Angular's false result and do not block the queue.

Forms retain their RxJS transformations and staged field values. Every transformed emission submits
only its changed field, merged into fresh state at execution time. Unrelated coordinated commits
update the form without clearing staged edits or interaction state. A debounced edit is ordered when
its transformation emits, not when the user first typed it. External navigation cancels staged edits
and resets a pristine, untouched baseline. Failed form writes retain entered values, report failure,
and are not automatically retried.

A destroyed binding cancels its waiting writes and stops observing changes. It does not abort an
already-started Angular navigation. Router-tree destruction settles pending caller promises and
releases subscriptions. The forms secondary entry point accesses the same coordinator through an
internal package bridge; it contains no second navigation queue.

## Rationale

Two callers constructing URLs from the same committed state can supersede each other, even when
changing disjoint query fields. Per-binding coordination cannot solve collisions between bindings
or parent and child route nodes. A simple promise chain solves ordering but can release stale work
when an external navigation cancels the active write, causing stale work to cancel navigation away.

Centralized ownership and cancellation address both problems. Forms keep responsibility for input
policy, while one module owns navigation policy. Explicit field writes prevent stale form snapshots
from overwriting unrelated changes.

## Consequences

Consumers must handle asynchronous callback failures and must not depend on synchronous updater
execution. High-frequency inputs should use RxJS debounce or throttle explicitly. This coordinator
preserves individual navigation history choices rather than inventing grouping semantics.

The `ɵgetQueryBinding` export is solely an internal bridge between the primary and forms entry
points, not a supported application interface. Forms require generated route nodes.
