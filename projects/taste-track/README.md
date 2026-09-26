# TasteTrack

TasteTrack is a movie and TV journal that runs in your browser. It is also a working example
of ngx-urlik: filters live in the URL, episodes have nested typed addresses, and both Angular
form systems write query state.

## Run it

From the repository root, use the Node version in `.nvmrc` and run:

```sh
npm ci
npm start
```

The server builds the library first. The app imports only the public `ngx-urlik` and
`ngx-urlik/forms` entry points.

## Try a few paths

1. Change the movie genres, sort order, and page size. Reload. The URL restores the filters.
2. Open TV shows → Only Mergers in the Building → Browse seasons → Season 2 → Browse
   episodes → The Callback. The address supplies the show, season, and episode parameters.
3. Follow a credit to a person or company, then follow a title back to the catalog.
4. Change a rating and log a viewing. Reload to check that both were saved.
5. Filter Collection, then try Viewing history. Collection uses Signal Forms; history uses
   Reactive Forms with search debounce.
6. Reset TasteTrack in Settings. The seed returns and your theme stays.

## What to look at in the code

| Example                          | Feature                                                                     |
| -------------------------------- | --------------------------------------------------------------------------- |
| Movie and TV browsing            | Inherited query fields, repeated genres, sorting, and pagination            |
| Show → season → episode          | Accumulated path parameters and custom ID/integer codecs                    |
| Detail section links             | URL fragments                                                               |
| Credits and contributor profiles | Typed navigation across branches                                            |
| Collection                       | Signal Forms, repeated statuses, delimited media, structured viewing counts |
| Viewing history                  | Reactive Forms and per-field RxJS debounce                                  |
| Landing pages                    | Exact-match content and redirects                                           |
| Unknown URLs                     | Wildcard routes                                                             |

Shared pages use `activeRoute()` to select their route. `paginationParams()` shares definitions
across pages. Sort order is one structured codec value, so a field and direction travel together.
Normal navigation uses typed nodes throughout.

## Data and reset

Dexie stores the data in `taste-track-screen-v2`. The deterministic seed contains 30 movies,
4 shows, 8 seasons, 32 episodes, 4 people, and 2 production companies. Catalog data is readonly.
Ratings, statuses, favorites, counts, and viewing events survive reloads.

Initialization and reset use the same seed. Reset runs in a transaction and affects only the
TasteTrack database. Theme preference lives in separate storage.

## Check changes

From the repository root:

```sh
npm run build
npm test
npm run typecheck
npm run e2e
```

The [design note](../../docs/adr/0010-tastetrack-demo.md) explains why the demo has this scope.
