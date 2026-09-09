# ADR 0010: Demonstrate the router through a browser-local movie and TV journal

Status: accepted; scope simplified September 2026.

## Decision

TasteTrack is a client-only Angular demonstration of the public `ngx-urlik` and
`ngx-urlik/forms` entry points. Preserve each distinct router capability, while removing
product features that duplicate examples. The app opens on movie browsing.

The scope is movies, TV shows, seasons, and episodes, with people and production companies
linked through credits. A credit assigns a role to a person or company on a particular title;
there is no separate crew or team entity. Seasons have explicit records, and each episode
has a show ID, season number, and episode number matching its typed route.

The application has browsing, nested details, people/company profiles, collection, viewing
history, and settings. Music, theatre, generic groups, standalone tags, and the dashboard
are removed. Seeded catalog metadata stays readonly. Personal status, rating, and favorites
are editable; logging a dated viewing appends history and updates the viewing count.

## Router coverage

| Capability                              | Demonstration                                                              |
| --------------------------------------- | -------------------------------------------------------------------------- |
| Static typed routes and lazy components | All screens use public route nodes                                         |
| Accumulated decoded path parameters     | Show → season → episode                                                    |
| Inherited query state                   | Screen filters inherited by movie/show descendants                         |
| Explicit active-route selection         | Catalog, detail, and contributor pages                                     |
| Typed cross-branch navigation           | Credits → person/company → filmography → title                             |
| Construction-only fragments             | Overview, credits, and history section links                               |
| Scalar/default query parameters         | Search, rating thresholds, page and page size                              |
| Repeated arrays                         | Catalog genres and collection statuses                                     |
| Delimited arrays                        | Collection media kinds                                                     |
| Custom scalar and structured codecs     | Prefixed IDs, positive numbers, atomic sort, exact/countless viewing count |
| Reusable query definitions              | `paginationParams()` across browsing, collection, and history              |
| Signal Forms                            | Collection filters                                                         |
| Reactive Forms and grouped debounce     | Viewing-history search and date filters                                    |
| Fallback routes                         | Root-scoped wildcard with empty-path guard                                 |

Shareable filter, sort, and page state belongs in the URL. Transient presentation state and
unsaved edits stay local. The application does not use `AppRouter.escapeHatch`.

## Persistence and mock data

Dexie wraps IndexedDB. The simplified dataset uses **`taste-track-screen-v2`**, starting at
schema version 1. The old **`taste-track-demo`** database remains untouched and is not read
or migrated. Existing personal data is not carried into the simplified demo.

A deterministic seed contains 30 movies, 4 shows, 8 seasons, 32 episodes, 4 people, and
2 companies, plus personal state and viewing events. This is enough data for pagination
and connected browsing without a large catalog generator. Credits and parent references
resolve to real seed records. Initial population and reset use the same seed; reset runs
transactionally. Theme preference is stored separately and survives reset.

## Validation

Seed integrity tests verify references, unique episode addresses, and plausible event dates.
Browser tests cover typed navigation, exact nested episode resolution, credit cross-links,
URL filters/sorting/pagination, both form integrations, persisted edits, transactional reset,
theme preservation, and isolation from the legacy database. Existing library tests continue
to validate the router contract independently of the demo.

## Consequences

TasteTrack is a living integration example, not a production media service. Library changes
discovered during demo work still require a separate design decision. There is no backend,
authentication, external catalog API, or migration framework. Angular standalone components,
zoneless change detection, and the existing system/light/dark themes remain in use.
