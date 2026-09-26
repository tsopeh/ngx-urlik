# 0010: Teach routing through a working application

TasteTrack is a movie and TV journal that runs in the browser. Its pages give routing features
something useful to do: a show leads to a season and episode, credits cross to contributor profiles,
and filters survive reloads because they live in the URL.

The demo imports the public `ngx-urlik` and `ngx-urlik/forms` entry points. Collection uses Signal
Forms; viewing history uses Reactive Forms with a debounced search. Shared pages use `activeRoute`.
IDs, sort values, and viewing counts exercise custom codecs. The [demo guide](../../projects/taste-track/README.md)
shows where to try each feature.

A deterministic seed makes navigation and persistence reproducible. Dexie stores it with personal
ratings, favorites, statuses, and viewing history in `taste-track-screen-v2`. Reset uses the same
seed in a transaction. Theme preference is stored separately and survives reset.

The app has no backend or external catalog service. That keeps the example focused and lets tests
check route behavior without a network dependency. Library tests check the contracts; browser tests
check that the public packages work together in an application.
