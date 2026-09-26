# 0006: Keep runtime assembly easy to read

`app-router.ts` assembles the library: validate, compile, and provide. `app-router-types.ts`
holds the recursive type inference. Reading how the router starts should not require tracing
the type system at the same time.

Each private module owns a responsibility such as parameter conversion, route compilation, or
write coordination. Dependencies point toward those modules. They do not import the assembly
module, and imports must not form cycles.

This gives changes a home. A codec fix belongs in the parameter runtime; a cancellation fix
belongs in the coordinator. A separate file earns its place when it owns rules or a lifecycle,
not just because a function has grown long. See the [implementation guide](../implementation.md)
for the code paths.
