# Query update concurrency investigation

Status: historical investigation. Its recommendation to defer was subsequently replaced by the
accepted [ADR 0011](adr/0011-shared-query-write-coordinator.md). The runtime now implements shared
coordination; the original characterization tests were converted to regression tests for that
contract. Results and estimates below describe the pre-implementation spike.

## Reproduction

Run `npm run test:lib -- --include='**/query-update-concurrency.spec.ts'`.
The tests use the installed Angular Router through TestBed, without mocking navigation.
The current tests verify the accepted coordinator. The table below records the original
characterization and test-local queue experiment before implementation.

Starting at `/results?locale=en&search=old`:

| Scenario                                                   | Navigation results | Final query          |
| ---------------------------------------------------------- | ------------------ | -------------------- |
| Await search update, then locale update                    | true, true         | locale=fr&search=new |
| Start both updates in the same turn                        | false, true        | locale=fr&search=old |
| Child changes search while parent changes locale           | false, true        | locale=fr&search=old |
| Start locale update while search update waits on a guard   | false, true        | locale=fr&search=old |
| Put parent and child writes through a shared promise queue | true, true         | locale=fr&search=new |

The sequential control also verifies preservation of unknown query keys and the fragment.
External navigation currently supersedes pending query navigation successfully. With the naive
queue, canceling the first write releases the next queued write while external navigation is
still pending. That write supersedes navigation to `/other`, leaving the user on `/results`.
This is a demonstrated regression of the queue experiment, not of the current library.

These results establish a reproducible overlap condition, not its frequency in real applications.
Ordinary interactions separated by completed navigations do not reproduce it. The delayed guard
test deliberately uses `runGuardsAndResolvers: 'always'` to keep a query navigation pending.

## Why a small queue is insufficient

`route-node.ts` calls the updater against `value().query`, copies `router.url`, and starts navigation.
Overlapping callers can read the same committed URL. Even writes to different owned keys collide
because both submit a complete URL. A queue must therefore be shared across route nodes and refs,
not attached to each individual ref.

The existing forms coordinator handles writes within one binding. It identifies its navigation
by observing `NavigationStart` during the synchronous call to `updateQueryParams()`. Delaying that
call's navigation breaks this ownership mechanism. Forms also submit their whole desired query
object; serializing those writes alone does not merge independent stale form values.

## Proposed scope if implemented

Use one private coordination module per generated router tree, keeping the public method shape.
Its interface should hide ordering and cancellation mechanics from ordinary callers:

- Execute writes in submission order, evaluating each updater once against fresh committed state.
  Read fresh state independently of caller-supplied signal equality, which may retain older values.
- Track owned navigation IDs and an external-navigation generation. Invalidate waiting work at
  external navigation start, before canceled navigation promises release more work.
- Resolve canceled queued writes as false. Reject failed writes without poisoning the queue.
  Specify guard rejection, redirect chains, same-URL skips, reentrant calls, and router destruction.
- Check route activity at execution time. Do not replay work onto another route or another path
  instance just because an ancestor remains active.
- Preserve each write's history option, unknown keys, and fragment. Start with one navigation per
  write; batching introduces additional promise and browser-history semantics.
- Adapt forms to explicit internal ownership and writes that merge only intended changed fields.
  Preserve staged-write cancellation and pristine reset behavior on external navigation.

This changes the behavioral interface: queued updater callbacks execute later, callback failures
may become promise rejections, and competing calls no longer automatically supersede each other.
Those decisions need to be reflected in the design specification and tests.

## Complexity estimate

These are planning estimates from the reproduction and source inspection, not measured production
implementation sizes or a delivery commitment.

| Scope                                                 | Estimated effort and size                                                                                         | Assessment                                                          |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Document current behavior and await dependent updates | Small; documentation/examples                                                                                     | Adequate when overlap is rare and callers can coordinate            |
| Shared promise queue for the happy path               | Roughly 10–30 runtime lines                                                                                       | Demonstrably insufficient: can defeat navigation away               |
| Clean library support including forms                 | Roughly 150–300 new or substantially revised runtime lines, 15–25 focused integration cases, 2–4 engineering days | Moderate complexity; navigation ownership and cancellation dominate |

Expected work spans a new private coordinator, route-node integration, forms coordination, and
the design contract. No new public configuration is inherently necessary. Browser back/forward,
redirect ownership, two independent form bindings, guard rejection/errors, and teardown remain
unverified by this spike and must be covered before shipping coordination.

Recommendation: retain the reproduction and current behavior until there is a concrete need for
independent writers. If that need exists, implement the bounded coordinator as one coherent change;
the tiny promise queue is not a safe incremental runtime fix.
