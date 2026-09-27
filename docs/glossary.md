# Glossary

- **Route Node**: The generated typed object for a named route, used to construct URLs, navigate, and read/patch parameters.
- **Unnamed Route**: An Angular route without `routeName`. Handled by Angular Router, but generates no typed node.
- **Path Placeholder**: A dynamic segment (`:name`) in an Angular path.
- **Codec**: A pure serializer and deserializer between a URL string and a typed value.
- **Accumulated Parameters**: The combined path and query definitions collected from a route and all its ancestors.
- **Default Value**: A static value or factory used when a query parameter is missing or invalid in the URL.
- **Query Patch**: A partial object or updater function that modifies query fields on the current URL.
- **Write Queue**: The sequential coordinator that prevents concurrent `patchQuery` calls from overwriting each other.
- **Draft State**: Uncommitted values held in a form binding before they are written to the URL.
- **Committed State**: The actual parameters present in the active URL.
- **Deterministic Construction**: Building an absolute URL strictly from explicit inputs, without copying state from the active URL.
- **Escape Hatch**: Safe access to untyped Angular Router operations via `AppRouter.escapeHatch`.
