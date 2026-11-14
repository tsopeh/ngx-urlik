import {
  defineAppRouter,
  enumCodec,
  listCodec,
  numberCodec,
  queryParam,
  stringCodec,
} from 'ngx-urlik';
import {
  experienceCountCodec,
  paginationParams,
  positiveIntegerCodec,
  prefixedIdCodec,
  sortCodec,
} from './codecs';

const statusCodec = enumCodec(['saved', 'in-progress', 'completed'] as const);

const mediaKindCodec = enumCodec(['movie', 'show', 'episode'] as const);

const catalogQueryParams = () => ({
  search: queryParam({ codec: stringCodec(), defaultValue: '' }),
  genres: queryParam({ codec: listCodec(stringCodec(), ','), defaultValue: [] }),
  ...paginationParams({ pageSizes: [12, 24, 48] }),
  sort: queryParam({
    codec: sortCodec(['title', 'year'] as const),
    defaultValue: { field: 'title', direction: 'asc' },
  }),
});

const loadShell = () => import('./shell').then((module) => module.Shell);
const loadBrowse = () => import('./browse-page').then((module) => module.BrowsePage);
const loadCatalog = () => import('./catalog-page').then((module) => module.CatalogPage);
const loadDetail = () => import('./detail-page').then((module) => module.DetailPage);

export enum RouteNames {
  BROWSE = 'BROWSE',
  MOVIES = 'MOVIES',
  MOVIE_DETAIL = 'MOVIE_DETAIL',
  SHOWS = 'SHOWS',
  SHOW_DETAIL = 'SHOW_DETAIL',
  SEASON = 'SEASON',
  SEASON_DETAIL = 'SEASON_DETAIL',
  EPISODES = 'EPISODES',
  EPISODE_DETAIL = 'EPISODE_DETAIL',
  PEOPLE = 'PEOPLE',
  PERSON_DETAIL = 'PERSON_DETAIL',
  STUDIOS = 'STUDIOS',
  STUDIO_DETAIL = 'STUDIO_DETAIL',
  LIBRARY = 'LIBRARY',
  HISTORY = 'HISTORY',
  SETTINGS = 'SETTINGS',
}

export const { AppRouter, provideAppRouter } = defineAppRouter(RouteNames, {
  routes: [
    {
      path: '',
      loadComponent: loadShell,
      children: [
        { path: '', pathMatch: 'full', redirectTo: 'movies' },
        {
          // Movies and TV share the catalog filters, without a segment of their own.
          path: '',
          routeName: RouteNames.BROWSE,
          queryParams: catalogQueryParams(),
          loadComponent: loadBrowse,
          children: [
            {
              path: 'movies',
              children: [
                {
                  path: '',
                  pathMatch: 'full',
                  routeName: RouteNames.MOVIES,
                  loadComponent: loadCatalog,
                },
                {
                  path: ':movieId',
                  routeName: RouteNames.MOVIE_DETAIL,
                  pathParam: { movieId: prefixedIdCodec('mov') },
                  loadComponent: loadDetail,
                },
              ],
            },
            {
              path: 'tv',
              children: [
                {
                  path: '',
                  pathMatch: 'full',
                  routeName: RouteNames.SHOWS,
                  loadComponent: loadCatalog,
                },
                {
                  path: ':showId',
                  pathParam: { showId: prefixedIdCodec('tv') },
                  children: [
                    {
                      path: '',
                      pathMatch: 'full',
                      routeName: RouteNames.SHOW_DETAIL,
                      loadComponent: loadDetail,
                    },
                    {
                      path: 's/:seasonNumber',
                      routeName: RouteNames.SEASON,
                      pathParam: { seasonNumber: positiveIntegerCodec() },
                      children: [
                        {
                          path: '',
                          pathMatch: 'full',
                          routeName: RouteNames.SEASON_DETAIL,
                          loadComponent: loadDetail,
                        },
                        {
                          path: 'e',
                          children: [
                            {
                              path: '',
                              pathMatch: 'full',
                              routeName: RouteNames.EPISODES,
                              loadComponent: loadCatalog,
                            },
                            {
                              path: ':episodeNumber',
                              routeName: RouteNames.EPISODE_DETAIL,
                              pathParam: { episodeNumber: positiveIntegerCodec() },
                              loadComponent: loadDetail,
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          path: 'people',
          children: [
            {
              path: '',
              pathMatch: 'full',
              routeName: RouteNames.PEOPLE,
              loadComponent: () => import('./contributors-page').then((m) => m.ContributorsPage),
            },
            {
              path: ':personId',
              routeName: RouteNames.PERSON_DETAIL,
              pathParam: { personId: prefixedIdCodec('per') },
              loadComponent: () => import('./contributor-page').then((m) => m.ContributorPage),
            },
          ],
        },
        {
          path: 'studios',
          children: [
            {
              path: '',
              pathMatch: 'full',
              routeName: RouteNames.STUDIOS,
              loadComponent: () => import('./contributors-page').then((m) => m.ContributorsPage),
            },
            {
              path: ':studioId',
              routeName: RouteNames.STUDIO_DETAIL,
              pathParam: { studioId: prefixedIdCodec('st') },
              loadComponent: () => import('./contributor-page').then((m) => m.ContributorPage),
            },
          ],
        },
        {
          path: 'library',
          routeName: RouteNames.LIBRARY,
          queryParams: {
            search: queryParam({ codec: stringCodec(), defaultValue: '' }),
            media: queryParam({ codec: listCodec(mediaKindCodec, ','), defaultValue: [] }),
            statuses: queryParam({ codec: listCodec(statusCodec, ','), defaultValue: [] }),
            replayCount: queryParam({ codec: experienceCountCodec() }),
            minRating: queryParam({ codec: numberCodec() }),
            ...paginationParams({ pageSizes: [12, 24, 48] }),
            sort: queryParam({
              codec: sortCodec(['title', 'rating'] as const),
              defaultValue: { field: 'title', direction: 'asc' },
            }),
          },
          loadComponent: () => import('./library-page').then((module) => module.LibraryPage),
        },
        {
          path: 'history',
          routeName: RouteNames.HISTORY,
          queryParams: {
            search: queryParam({ codec: stringCodec(), defaultValue: '' }),
            from: queryParam({ codec: stringCodec() }),
            to: queryParam({ codec: stringCodec() }),
            ...paginationParams({ pageSizes: [12, 24, 48] }),
            sort: queryParam({
              codec: sortCodec(['date', 'rating'] as const),
              defaultValue: { field: 'date', direction: 'desc' },
            }),
          },
          loadComponent: () => import('./history-page').then((module) => module.HistoryPage),
        },
        {
          path: 'settings',
          routeName: RouteNames.SETTINGS,
          loadComponent: () => import('./settings-page').then((module) => module.SettingsPage),
        },
        {
          path: '**',
          loadComponent: () => import('./not-found-page').then((module) => module.NotFoundPage),
        },
      ],
    },
  ],
});
