# ADR 0010: Demonstrate the router through a browser-local media journal

Status: accepted.

## Decision

The repository includes TasteTrack, a client-only Angular demo application for a fictional personal
media journal. It covers screen, music, and theatre through separate first-class domain entities,
with shared projections for dashboards, collection views, activity, people, groups, and personal
tags.

TasteTrack is generated as the `taste-track` application in the existing Angular workspace. It may
import only the public `ngx-urlik` and `ngx-urlik/forms` entry points. Its static typed route tree is
grouped under screen, music, and theatre branches and uses accumulated parameters, typed
construction fragments, custom codecs, reusable query-definition fragments, explicit active-route
selection, Reactive Forms bindings, and Signal Forms bindings. It does not demonstrate the native
Router escape hatch.

All shareable dashboard state is URL-owned, including filters, sorting, pagination, and chart
ranges. Transient presentation state and unsaved edits remain local. Pagination uses separate
one-based `page` and constrained `pageSize` query parameters produced by a typed
`paginationParams()` helper. Sorting remains one atomic query field. Experience counts use a
type-safe codec for exact non-negative counts or the explicit `countless` value rendered as “More
than I can count.”

The application is a single anonymous browser-local profile. Dexie wraps IndexedDB behind
application repository interfaces. A deterministic bundled seed combines curated parody content
with generated supporting records. Personal state and journal events persist across reloads and can
be transactionally reset without resetting the separately persisted theme preference.

TasteTrack uses Angular 22 defaults: standalone components, zoneless change detection, OnPush
change detection, the concise filename convention, CSS, and no server rendering. Its light, dark,
and system themes use complete semantic CSS custom-property sets without fallback values. Focused
CSS/SVG visualizations provide accessible textual equivalents. Featured records use original local
artwork; supporting records use deterministic CSS covers.

## Rationale

A media journal creates deep, understandable route structure without pretending to be a production
service. Movies, shows, seasons, episodes, albums, songs, theatre works, productions, performances,
venues, people, and groups provide both nested and cross-branch navigation. Collection filters and
chronological activity provide credible query-state complexity, while local editing makes browser
persistence and reset behavior visible.

Keeping the demo in the library workspace makes API changes and integration examples evolve in one
change. The public-entry-point boundary prevents the demo from succeeding through internal access.
Browser-local persistence removes backend setup and keeps the application deterministic and fully
resettable.

## Consequences

- TasteTrack is an integration consumer and living example, not a publishable part of the library.
- Seeded catalog metadata is readonly; personal ratings, statuses, favorites, tags, counts, notes,
  and dated events are editable.
- Catalog routes browse all seed content; collection and activity routes project browser-local
  personal state.
- Movies, shows, albums, songs, theatre entities, people, and groups remain distinct domain models.
- A current overall rating and historical per-event ratings may coexist.
- Exact experience totals need not equal remembered dated events; `countless` is reversible.
- Library changes discovered during demo work require a separate design decision rather than a
  TasteTrack-specific widening.
