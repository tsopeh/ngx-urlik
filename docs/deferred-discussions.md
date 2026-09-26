# Open questions

These ideas are outside the implemented contract. Add one when a real use case justifies its
cost in concepts, types, and runtime behavior.

| Question                                                                           | Current choice                                                                             |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Support other Angular versions?                                                    | The library targets Angular 22.                                                            |
| Let global observers write?                                                        | They return readonly signals. Route nodes own query writes.                                |
| Compare cycles, maps, sets, and other collections?                                 | `isEqual` covers ordinary values, arrays, dates, and objects.                              |
| Validate custom domain values more deeply?                                         | Codecs own conversion; the runtime checks their serialized output.                         |
| Add date or structured codecs?                                                     | Applications supply custom codecs.                                                         |
| Separate TypeScript query names from URL keys?                                     | Each property name is also its URL key.                                                    |
| Give native navigation observations a smaller interface?                           | The escape hatch uses Angular's shapes.                                                    |
| Read fragments or support typed relative navigation?                               | Fragments are construction-only; relative navigation uses the escape hatch.                |
| Support outlets, matchers, matrix parameters, empty children, or lazy route trees? | Typed routes use one static tree and the primary outlet.                                   |
| Expose more write options?                                                         | Query patches accept `replaceUrl`.                                                         |
| Add tracing or editor diagnostics?                                                 | Runtime validation and parameter diagnostics are available.                                |
| Warn about bypassing the typed router?                                             | There is no library ESLint rule.                                                           |
| Infer accumulated state in route equality callbacks?                               | Equality callbacks currently receive `unknown`; construction and state reads are inferred. |

The [reference](design/app-router.md) describes what callers can rely on today.
