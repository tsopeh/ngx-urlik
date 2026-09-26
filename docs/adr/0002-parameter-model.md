# 0002: Reuse codecs across parameter kinds

A number means the same thing in a path, a query field, or an array. A codec handles that conversion
once: one string to one value, and back. It returns `null` when conversion fails. Its value type
cannot contain `null` or `undefined`.

The parameter definition decides where the value goes and what absence means. `pathParam` names
a required segment. `queryParam` describes one value. `repeatedQueryParam` and
`delimitedQueryParam` describe arrays with different URL representations.

This separation lets a custom codec work in each position. Codecs stay pure; query defaults can
use Angular injection. Defaults and `required` belong to the parameter definition because they
describe URL policy, not string conversion.

Repeated and delimited arrays remain separate choices. `?tag=a&tag=b` and `?tag=a,b` need different
encoding rules. A malformed element rejects the whole array, so callers never receive a silently
shortened result. See [parameter rules](../design/app-router.md#codecs-and-placement).
