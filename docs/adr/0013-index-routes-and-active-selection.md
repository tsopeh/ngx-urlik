# ADR 0013: Terminal index routes and deepest active selection

Status: index-route support superseded by [ADR 0014](0014-exact-match.md); deepest-candidate selection remains accepted. Revises ADR 0001's empty-child restriction and clarifies ADR 0007.

Allow one terminal empty-path index per parent, with full matching and no path parameter.
Indexes render landing content or redirect without component navigation effects or
child-activation flags. General empty-path layouts remain unsupported to keep the static
route model constrained. Existing parent URLs and identities are retained.

`activeRoute()` selects the deepest active candidate by route ancestry, including indexes.
Callers no longer need to place descendants before ancestors. This changes first-match
behavior for overlapping candidates; consumers wanting an ancestor should omit its
descendants from the candidate set. Multiple aliases of one node retain first-alias order.
The behavioral reference owns the complete contract and examples.
