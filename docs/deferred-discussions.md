# Open questions

These ideas are outside the implemented contract. Add one when a real use case justifies its cost
in concepts, types, and runtime behavior.

| Question                                                    | Current choice                                                                                        |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Support other Angular versions?                             | The library targets Angular 22.                                                                       |
| Name redirects and wildcards?                               | They stay unnamed Angular routes without typed nodes.                                                 |
| Accept route arrays split across files?                     | Literal routes must reach `defineAppRouter()` directly; there is no `defineRoutes()`.                 |
| Let global observers write?                                 | They return readonly signals. Route nodes own query writes.                                           |
| Validate custom domain values more deeply?                  | Codecs own conversion; the runtime checks their serialized output.                                    |
| Add date or structured codecs?                              | Applications supply custom codecs.                                                                    |
| Separate TypeScript query names from URL keys?              | Each property name is also its URL key.                                                               |
| Give native navigation observations a smaller interface?    | The escape hatch uses Angular's shapes.                                                               |
| Read fragments or support typed relative navigation?        | Fragments are construction-only; relative navigation uses the escape hatch.                           |
| Expose more write options?                                  | Query patches accept `replaceUrl`.                                                                    |
| Add tracing or editor diagnostics?                          | Runtime validation and parameter diagnostics are available.                                           |
| Warn about bypassing the typed router?                      | The docs give a core ESLint configuration; there is no plugin or runtime warning.                     |
| Infer accumulated state in route equality callbacks?        | Equality callbacks currently receive `unknown`; construction and state reads are inferred.            |
| Follow stored values changed in other tabs?                 | Storage is read only when a URL lacks a value; there is no `storage` event listener.                  |
| Forget one scope's stored value, such as one show's season? | `clearPersisted()` forgets a key for every scope. The app decides when a value that decodes is wrong. |
| Restore a path value after an earlier redirect?             | Angular turns redirects off at a level after a sibling redirect there, so nothing restores.           |

The [reference](design/app-router.md) describes what callers can rely on today.
