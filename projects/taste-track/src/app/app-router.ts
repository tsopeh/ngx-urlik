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
  PAUSED: 'paused',
  ABANDONED: 'abandoned',
} as const);

const mediaKindCodec = enumCodec({
  MOVIE: 'movie',
  SHOW: 'show',
  EPISODE: 'episode',
  ALBUM: 'album',
  SONG: 'song',
  THEATRE: 'theatre',
} as const);

const catalogQueryParams = () => ({
  search: queryParam({ codec: stringCodec(), defaultValue: '' }),
  genres: repeatedQueryParam({ codec: stringCodec() }),
  tags: repeatedQueryParam({ codec: stringCodec() }),
  replayCount: queryParam({ codec: experienceCountCodec() }),
  ...paginationParams({ defaultPageSize: 24, pageSizes: [12, 24, 48] }),
  sort: queryParam({
    codec: sortCodec(['title', 'year', 'rating', 'lastActivity'] as const),
    defaultValue: { field: 'lastActivity', direction: 'desc' },
  }),
});

const loadShell = () => import('./shell').then((module) => module.Shell);
const loadSection = () => import('./section-page').then((module) => module.SectionPage);
const loadCatalog = () => import('./catalog-page').then((module) => module.CatalogPage);
const loadDetail = () => import('./detail-page').then((module) => module.DetailPage);

export const { AppRouter, provideAppRouter } = defineAppRouter({
  routes: {
    ROOT: {
      path: '',
      angular: { loadComponent: loadShell },
      children: {
        DASHBOARD: {
          path: 'dashboard',
          angular: {
            loadComponent: () => import('./dashboard-page').then((module) => module.DashboardPage),
          },
        },
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
                      angular: { loadComponent: loadSection },
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
        MUSIC: {
          path: 'music',
          queryParams: catalogQueryParams(),
          angular: { loadComponent: loadSection },
          children: {
            ALBUMS: {
              path: 'albums',
              angular: { loadComponent: loadCatalog },
              children: {
                DETAIL: {
                  path: 'album',
                  pathParam: pathParam({ name: 'albumId', codec: prefixedIdCodec('alb') }),
                  angular: { loadComponent: loadDetail },
                },
              },
            },
            SONGS: {
              path: 'songs',
              angular: { loadComponent: loadCatalog },
              children: {
                DETAIL: {
                  path: 'song',
                  pathParam: pathParam({ name: 'songId', codec: prefixedIdCodec('song') }),
                  angular: { loadComponent: loadDetail },
                },
              },
            },
          },
        },
        THEATRE: {
          path: 'theatre',
          queryParams: catalogQueryParams(),
          angular: { loadComponent: loadSection },
          children: {
            WORKS: { path: 'works', angular: { loadComponent: loadCatalog } },
            PRODUCTIONS: {
              path: 'productions',
              angular: { loadComponent: loadCatalog },
              children: {
                DETAIL: {
                  path: 'production',
                  pathParam: pathParam({ name: 'productionId', codec: prefixedIdCodec('prod') }),
                  angular: { loadComponent: loadDetail },
                  children: {
                    PERFORMANCES: { path: 'performances', angular: { loadComponent: loadCatalog } },
                  },
                },
              },
            },
            VENUES: { path: 'venues', angular: { loadComponent: loadCatalog } },
          },
        },
        PEOPLE: {
          path: 'people',
          angular: { loadComponent: loadCatalog },
          children: {
            DETAIL: {
              path: 'profile',
              pathParam: pathParam({ name: 'personId', codec: prefixedIdCodec('per') }),
              angular: { loadComponent: loadDetail },
            },
          },
        },
        GROUPS: {
          path: 'groups',
          angular: { loadComponent: loadCatalog },
          children: {
            DETAIL: {
              path: 'profile',
              pathParam: pathParam({ name: 'groupId', codec: prefixedIdCodec('grp') }),
              angular: { loadComponent: loadDetail },
            },
          },
        },
        TAGS: {
          path: 'tags',
          angular: { loadComponent: loadCatalog },
          children: {
            DETAIL: {
              path: 'tag',
              pathParam: pathParam({ name: 'tagId', codec: prefixedIdCodec('tag') }),
              angular: { loadComponent: loadDetail },
            },
          },
        },
        COLLECTION: {
          path: 'collection',
          queryParams: {
            search: queryParam({ codec: stringCodec(), defaultValue: '' }),
            media: delimitedQueryParam({ codec: mediaKindCodec, separator: ',' }),
            statuses: repeatedQueryParam({ codec: statusCodec }),
            genres: repeatedQueryParam({ codec: stringCodec() }),
            tags: repeatedQueryParam({ codec: stringCodec() }),
            minRating: queryParam({ codec: numberCodec() }),
            replayCount: queryParam({ codec: experienceCountCodec() }),
            ...paginationParams({ defaultPageSize: 24, pageSizes: [12, 24, 48] }),
            sort: queryParam({
              codec: sortCodec(['title', 'rating', 'lastActivity'] as const),
              defaultValue: { field: 'lastActivity', direction: 'desc' },
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
            media: delimitedQueryParam({ codec: mediaKindCodec, separator: ',' }),
            from: queryParam({ codec: stringCodec() }),
            to: queryParam({ codec: stringCodec() }),
            minRating: queryParam({ codec: numberCodec() }),
            ...paginationParams({ defaultPageSize: 24, pageSizes: [12, 24, 48] }),
            sort: queryParam({
              codec: sortCodec(['date', 'rating', 'title'] as const),
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
            loadComponent: () => import('./not-found-page').then((module) => module.NotFoundPage),
          },
        },
      },
    },
  },
});
