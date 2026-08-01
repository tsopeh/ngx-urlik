# ADR 0002: Separate codecs, placement, presence, and cardinality

Status: accepted.

## Decision

Pure `UrlParamCodec<T>` values convert one decoded string to or from a non-null domain value. Codecs are reusable and do not support Angular injection. The built-ins are `stringCodec()`, `numberCodec()`, `booleanCodec()`, and `enumCodec()`.

Placement wrappers own URL policy:

- `pathParam({ name, codec })` defines a required dynamic segment.
- `queryParam({ codec, ... })` defines a scalar query property.
- `repeatedQueryParam({ codec, ... })` defines an array using repeated physical keys.
- `delimitedQueryParam({ codec, separator, ... })` defines an array using one delimited physical key.

`null` and `undefined` are forbidden in codec value types. Optional scalar query state introduces `null`; array state uses `[]` for absence. Required query input controls construction-property presence independently from physical URL presence. Defaults may be values or injection-aware synchronous factories and are canonically omitted.

## Rationale

The earlier path/query-specific helper families duplicated scalar parsing and prevented natural composition into collections. Orthogonal codecs and placement wrappers reduce the conceptual surface while making custom values reusable. Stable defined state aligns with Angular Signal Forms, where `undefined` means a field is absent.

Repeated and delimited arrays remain separate because they are materially different wire contracts. Delimited values URI-encode each item before joining so separator collisions are unambiguous.

## Consequences

The previous `stringPathParam`, `stringQueryParam`, and corresponding number, boolean, and enum families are removed. Array defaults resolve to `readonly T[]`; one malformed item invalidates the entire collection. Scalar duplicate keys use the last physical value. Delimited parameters reject repeated physical keys.
