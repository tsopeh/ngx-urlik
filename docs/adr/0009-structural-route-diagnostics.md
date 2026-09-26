# 0009: Check relationships when the tree is defined

TypeScript checks local route shapes, parameter values, callback types, and reserved names.
`defineAppRouter()` checks relationships across the tree: duplicate sibling paths, shadowed
parameters, and wildcard placement. It reports all structural errors together, with full route names.

The distinction matters during generic inference. A recursive constraint can receive a widened
type instead of the literal paths and names it needs to compare. A tree may then pass a check
that would reject the same tree after inference. The runtime validator sees the complete values
and can apply the rule consistently, including for JavaScript callers.

A separate builder could freeze the tree earlier, but would add another step and complicate
contextual callback inference. Returning an error-shaped router type would move the failure away
from the definition. We keep the check where the problem is introduced.

Some invalid trees can pass `tsc` and then fail immediately at definition time. Any editor or lint
integration must use the same structural rules rather than create a competing contract.
