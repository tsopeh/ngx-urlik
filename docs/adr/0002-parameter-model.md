# ADR 0002: Separate placement, presence, nullability, and serialization

Status: accepted.

## Decision

One generic `UrlParamSerializer<T>` contract underlies separate path/query adapters and built-in helpers. Nullability belongs to `T`; `undefined` is forbidden. Path construction is always required and non-null. Query construction properties are optional by default and may be marked required independently of nullable values.

Path and query definitions accumulate along a route chain and share a no-shadowing namespace.

## Rationale

Path segments are structurally required, while query properties have caller-controlled explicitness. Treating these as independent axes avoids conflating a nullable domain value with whether a construction property must be listed. Stable, defined reactive fields align with Angular Signal Forms.

## Consequences

Path helpers and query helpers are separate convenience families, but serialization logic remains extensible through the generic contract. Defaults apply to query values and are canonically omitted from URLs.
