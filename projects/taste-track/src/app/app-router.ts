import {
  delimitedQueryParam,
  defineAppRouter,
  enumCodec,
  numberCodec,
  pathParam,
  queryParam,
  repeatedQueryParam,
  stringCodec,
} from 'ngx-urlik';
import type { CanMatchFn } from '@angular/router';
import {
  experienceCountCodec,
  paginationParams,
  positiveIntegerCodec,
  prefixedIdCodec,
  sortCodec,
} from './codecs';

const statusCodec = enumCodec({
  SAVED: 'saved',
  IN_PROGRESS: 'in-progress',
  COMPLETED: 'completed',
} as const);

const mediaKindCodec = enumCodec({
  MOVIE: 'movie',
  SHOW: 'show',
  EPISODE: 'episode',
} as const);

const catalogQueryParams = () => ({
  search: queryParam({ codec: stringCodec(), defaultValue: '' }),
  genres: repeatedQueryParam({ codec: stringCodec() }),
  ...paginationParams({ defaultPageSize: 24, pageSizes: [12, 24, 48] }),
  sort: queryParam({
    codec: sortCodec(['title', 'year'] as const),
    defaultValue: { field: 'title', direction: 'asc' },
  }),
});

const loadShell = () => import('./shell').then((module) => module.Shell);
const loadSection = () => import('./section-page').then((module) => module.SectionPage);
const loadCatalog = () => import('./catalog-page').then((module) => module.CatalogPage);
const loadDetail = () => import('./detail-page').then((module) => module.DetailPage);
const hasUnmatchedSegments: CanMatchFn = (_route, segments) => segments.length > 0;

export const { AppRouter, provideAppRouter } = defineAppRouter({
  routes: {
    ROOT: {
      path: '',
      angular: { loadComponent: loadShell },
      children: {
        SCREEN: {
          path: 'screen',
          queryParams: catalogQueryParams(),
          angular: { loadComponent: loadSection },
          children: {
            MOVIES: {
              path: 'movies',
              angular: { loadComponent: loadCatalog },
              children: {
                DETAIL: {
                  path: 'movie',
                  pathParam: pathParam({ name: 'movieId', codec: prefixedIdCodec('mov') }),
                  angular: { loadComponent: loadDetail },
                },
              },
            },
            SHOWS: {
              path: 'shows',
              angular: { loadComponent: loadCatalog },
              children: {
                DETAIL: {
                  path: 'show',
                  pathParam: pathParam({ name: 'showId', codec: prefixedIdCodec('tv') }),
                  angular: { loadComponent: loadDetail },
                  children: {
                    SEASONS: {
                      path: 'seasons',
                      angular: {
                        loadComponent: () =>
                          import('./seasons-page').then((module) => module.SeasonsPage),
                      },
                      children: {
                        DETAIL: {
                          path: 'season',
                          pathParam: pathParam({
                            name: 'seasonNumber',
                            codec: positiveIntegerCodec(),
                          }),
                          angular: { loadComponent: loadDetail },
                          children: {
                            EPISODES: {
                              path: 'episodes',
                              angular: { loadComponent: loadCatalog },
                              children: {
                                DETAIL: {
                                  path: 'episode',
                                  pathParam: pathParam({
                                    name: 'episodeNumber',
                                    codec: positiveIntegerCodec(),
                                  }),
                                  angular: { loadComponent: loadDetail },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        PEOPLE: {
          path: 'people',
          angular: {
            loadComponent: () => import('./contributors-page').then((m) => m.ContributorsPage),
          },
          children: {
            DETAIL: {
              path: 'profile',
              pathParam: pathParam({ name: 'personId', codec: prefixedIdCodec('per') }),
              angular: {
                loadComponent: () => import('./contributor-page').then((m) => m.ContributorPage),
              },
            },
          },
        },
        COMPANIES: {
          path: 'companies',
          angular: {
            loadComponent: () => import('./contributors-page').then((m) => m.ContributorsPage),
          },
          children: {
            DETAIL: {
              path: 'profile',
              pathParam: pathParam({ name: 'companyId', codec: prefixedIdCodec('co') }),
              angular: {
                loadComponent: () => import('./contributor-page').then((m) => m.ContributorPage),
              },
            },
          },
        },
        COLLECTION: {
          path: 'collection',
          queryParams: {
            search: queryParam({ codec: stringCodec(), defaultValue: '' }),
            media: delimitedQueryParam({ codec: mediaKindCodec, separator: ',' }),
            statuses: repeatedQueryParam({ codec: statusCodec }),
            replayCount: queryParam({ codec: experienceCountCodec() }),
            minRating: queryParam({ codec: numberCodec() }),
            ...paginationParams({ defaultPageSize: 24, pageSizes: [12, 24, 48] }),
            sort: queryParam({
              codec: sortCodec(['title', 'rating'] as const),
              defaultValue: { field: 'title', direction: 'asc' },
            }),
          },
          angular: {
            loadComponent: () =>
              import('./collection-page').then((module) => module.CollectionPage),
          },
        },
        ACTIVITY: {
          path: 'activity',
          queryParams: {
            search: queryParam({ codec: stringCodec(), defaultValue: '' }),
            from: queryParam({ codec: stringCodec() }),
            to: queryParam({ codec: stringCodec() }),
            ...paginationParams({ defaultPageSize: 24, pageSizes: [12, 24, 48] }),
            sort: queryParam({
              codec: sortCodec(['date', 'rating'] as const),
              defaultValue: { field: 'date', direction: 'desc' },
            }),
          },
          angular: {
            loadComponent: () => import('./activity-page').then((module) => module.ActivityPage),
          },
        },
        SETTINGS: {
          path: 'settings',
          angular: {
            loadComponent: () => import('./settings-page').then((module) => module.SettingsPage),
          },
        },
        NOT_FOUND: {
          path: '**',
          angular: {
            canMatch: [hasUnmatchedSegments],
            loadComponent: () => import('./not-found-page').then((module) => module.NotFoundPage),
          },
        },
      },
    },
  },
});
