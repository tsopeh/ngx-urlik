# 0001: Declare one static route tree

A destination's parameters depend on its parents. To infer those parameters, TypeScript needs
the whole route tree when `defineAppRouter()` is called. The library therefore takes one named
root with named children. A route's object key is its identity in code; its `path` is its URL segment.

Components can load lazily. Route definitions cannot. This also rules out multiple root arrays
and same-path alternatives chosen by order. Generated Angular routes stay private so the declared
tree and the runtime tree cannot drift through configuration changes.
