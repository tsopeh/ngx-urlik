# TasteTrack

A browser-local movie and TV journal demonstrating `ngx-urlik`. Browse movies, follow a
show through its seasons and episodes, explore cast/crew and production-company credits,
and keep a personal collection and viewing history.

## Run

From the repository root, with Node 24.19.0:

```sh
npm start
```

The library builds before the application. The demo imports only the public `ngx-urlik`
and `ngx-urlik/forms` entry points.

## Try the demo

1. Browse movies; change genres, sorting, and page size, then reload the URL.
2. Open TV shows → Only Mergers in the Building → Browse seasons → Season 2 → Browse
   episodes → The Callback. The episode resolves using all three decoded path parameters.
3. Follow a credit to a person or production company and return through its filmography.
4. Change a title's status or rating and log a viewing. Reload to see persistence.
5. Filter Collection using Signal Forms, including multiple media kinds or viewing count.
6. Filter Viewing history using Reactive Forms; only search writes are debounced.
7. Use Settings → Reset TasteTrack to restore the seed while retaining your theme.

## Capability map

| Screen                  | Router examples                                                               |
| ----------------------- | ----------------------------------------------------------------------------- |
| Movies and TV           | Inherited query parameters, repeated genres, sorting, pagination              |
| Show → season → episode | Accumulated typed path state, custom ID and integer codecs                    |
| Title details           | Typed fragments, section links                                                |
| Credits and profiles    | Typed navigation across branches                                              |
| Collection              | Signal Forms, repeated statuses, delimited media, exact/countless count codec |
| Viewing history         | Reactive Forms, grouped RxJS search debounce, date filters                    |
| Exact-match behavior    | Landing redirects and page content at existing parent URLs                    |
| Unknown URL             | Branch-scoped wildcard                                                        |

Shared pages use `activeRoute()` to select the deepest supported named route.
The shared `paginationParams()` helper preserves inference. Atomic sort values demonstrate
structured custom codecs. All normal navigation uses typed route nodes, without the native
Router escape hatch. Developer explanations live here rather than in the application UI.

## Data

Dexie populates **`taste-track-screen-v2`** with deterministic fictional data: 30 movies,
4 shows, 8 seasons, 32 episodes, 4 people, and 2 production companies. Credits attach roles
to contributors per title. Personal ratings, statuses, favorites, viewing counts, and dated
viewings survive reloads. Catalog metadata is readonly.

This scope starts fresh. The previous `taste-track-demo` IndexedDB database is left untouched;
its data is neither imported nor deleted. Theme preference stays in its existing separate
storage. Initialization and transactional reset use the same seed.

## Checks

```sh
npm run build
npm test
npm run typecheck
npm run e2e
```

See [ADR 0010](../../docs/adr/0010-tastetrack-demo.md) for the scope and preservation decisions.

See the [simplification audit](AUDIT.md) for DevTools route, filter, and restart results.
