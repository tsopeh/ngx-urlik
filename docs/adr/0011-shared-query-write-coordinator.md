# 0011: Put query writes through one queue

Two controls can read the same URL and change different fields. If each immediately navigates
to its own copy, the second can erase the first edit. Each generated router therefore owns one
query-write queue shared by route nodes and forms.

A write reads committed state when its turn starts. It keeps its own history option and navigation
result. A direct patch is one write; a form notification groups its synchronous outputs into one
write. Separate submissions stay separate. This preserves both independent edits and intentional
multi-field changes.

Cancellation is part of the queue's job. External navigation cancels waiting work at its start,
even if a guard later blocks it. Guard redirects also cancel waiting work. Ordinary rejection or
an error affects only that write. Without this distinction, finishing an old promise could release
a stale edit that navigates the user back to the page they left.

Forms own their drafts and transformation policy. The queue owns navigation order and cancellation.
The private package bridge lets both form adapters use that same queue. See the
[write rules](../design/app-router.md#reactive-state-and-updates) for promise results and cleanup.
