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
2. Open TV shows → Brambleworth Manor → Season 2 → Browse episodes → The Callback Nobody Returned.
   The address, `/tv/brambleworth-manor/s/2/e/1`, supplies the show, season, and episode parameters.
   The ID codec leaves the `tv_` prefix out of the URL and adds it back when reading.
   Then open `/tv/brambleworth-manor/s`. It arrives at `…/s/2`, the season you opened last in this
   tab. A show with no remembered season opens the show page, which lists its seasons.
3. Follow a credit to a person or studio, then follow a title back to the catalog.
4. Change a rating and log a viewing. Reload to check that both were saved.
5. Filter Library, then try Viewing history. Library uses Signal Forms; history uses
   Reactive Forms with search debounce. Both hold searches shorter than three letters.
6. Reset TasteTrack in Settings. The seed returns and your theme stays.

## What to look at in the code

| Example                          | Feature                                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Movie and TV browsing            | Query fields inherited from a parent route with no path segment, repeated genres, sorting, and pagination    |
| Show → season → episode          | Accumulated path parameters, an ID codec that leaves its prefix out of the URL, and an integer codec         |
| Page size and last season        | A persisted query field in `localStorage`, and a persisted path value scoped to the show in `sessionStorage` |
| Detail section links             | URL fragments                                                                                                |
| Credits and contributor profiles | Typed navigation across branches                                                                             |
| Library                          | Signal Forms, repeated statuses, joined media list, structured viewing counts                                |
| Viewing history                  | Reactive Forms with a debounced, validated search                                                            |
| Landing pages                    | Empty-path children and redirects                                                                            |
| Unknown URLs                     | Wildcard routes                                                                                              |

Shared pages use `activeRoute()` to select their route. `paginationParams()` shares definitions
across pages. Each page resets its own page number: the form pages in `beforeWrite`, the catalog
in the same `patchQuery()` patch. Sort order is one structured codec value, so a field and
direction travel together. Normal navigation uses typed nodes throughout.

## Backend

All backend files and concepts live in `projects/taste-track/src/app/backend/` and export through `backend/index.ts`:

- `BackendApi` (`backend-api.ts`): Encapsulates all querying, filtering, data joins, and mutations. Components do not wrangle data or read from the database directly.
- `TasteTrackRepository` (`database.ts`): Manages IndexedDB tables with Dexie and publishes table contents as Angular signals.
- Domain types (`domain.ts`): Entity schemas, identifier types, and state interfaces.
- Seed data (`seed.ts`): Deterministic dataset used for initial database population and reset.

### Querying and asynchronous timing

Every query method (`getCatalog`, `getItemDetail`, `getSeasons`, `getLibrary`, `getHistory`,
`getContributors`, `getContributorProfile`) returns an `Observable<T>`.

Even though filtering evaluates against in-memory repository arrays, queries enforce an
asynchronous boundary using `delay(0)`. Components handle asynchronous streams through
RxJS pipes and Angular signal interop (`toObservable` → `switchMap` → `toSignal`).

```ts
protected readonly response = toSignal(
  toObservable(this.request).pipe(switchMap((query) => this.backendApi.getCatalog(query))),
  { initialValue: { items: [], total: 0 } },
);
```

When database mutations happen (`toggleFavorite`, `updatePersonal`, `logViewing`),
`TasteTrackRepository` reloads its tables and increments its `dataVersion` signal.
Active query subscriptions observe `dataVersion` and re-emit automatically with updated data.

## Data and reset

Dexie stores the data in `taste-track`. The deterministic seed contains 30 movies,
30 shows, 66 seasons, 394 episodes, 8 people, and 4 studios. Catalog data is readonly.
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
