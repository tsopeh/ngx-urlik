# TasteTrack

TasteTrack is the browser-local demonstration application for `ngx-urlik`. It is a fictional
personal media journal spanning movies, TV shows, albums, songs, theatre, people, groups, personal
collections, and chronological activity.

## Run it

From the repository root:

```sh
npm start
```

The library is consumed exclusively through `ngx-urlik` and `ngx-urlik/forms`. The workspace build
script builds the library before the application so those package entry points resolve exactly as
they do for an external consumer.

TasteTrack stores its deterministic demo database in browser IndexedDB through Dexie. Personal
ratings, favorites, collection states, tags, exact or “More than I can count” experience counts,
and dated journal events survive reloads. Use **Settings → Reset TasteTrack** to restore the bundled
seed. Theme preference is stored separately and survives a reset.

## Router capabilities by screen

- Screen, music, and theatre demonstrate accumulated query parameters and nested typed route trees.
- Show → season → episode demonstrates accumulated decoded path state.
- Collection binds typed query parameters to Signal Forms.
- Activity binds typed query parameters to Reactive Forms and delays only its search field through a
  grouped RxJS write transformation.
- Detail-page section links demonstrate construction-only typed fragments.
- Custom prefixed-ID, positive-integer, experience-count, and generic sort codecs demonstrate
  consumer-defined scalar domains.
- `paginationParams()` demonstrates reusable route-definition fragments with preserved inference.
- The fallback page demonstrates a branch-scoped `**` definition.

The demo deliberately does not use `AppRouter.escapeHatch`; ordinary application navigation remains
on typed route nodes.
