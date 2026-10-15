import { inject } from '@angular/core';
import { Router } from '@angular/router';
import {
  defineAppRouter,
  enumCodec,
  listCodec,
  numberCodec,
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

const statusCodec = enumCodec(['saved', 'in-progress', 'completed'] as const);

const mediaKindCodec = enumCodec(['movie', 'show', 'episode'] as const);

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

const redirectToMovies = ({ queryParams }: { queryParams: Record<string, unknown> }) =>
  inject(Router).createUrlTree(['/screen/movies'], { queryParams });

export enum RouteNames {
  SCREEN = 'SCREEN',
  MOVIES = 'MOVIES',
  MOVIE_DETAIL = 'MOVIE_DETAIL',
  SHOWS = 'SHOWS',
  SHOW_DETAIL = 'SHOW_DETAIL',
  SEASONS = 'SEASONS',
  SEASON = 'SEASON',
  SEASON_DETAIL = 'SEASON_DETAIL',
  EPISODES = 'EPISODES',
  EPISODE_DETAIL = 'EPISODE_DETAIL',
  PEOPLE = 'PEOPLE',
  PERSON_DETAIL = 'PERSON_DETAIL',
  COMPANIES = 'COMPANIES',
  COMPANY_DETAIL = 'COMPANY_DETAIL',
  COLLECTION = 'COLLECTION',
  ACTIVITY = 'ACTIVITY',
  SETTINGS = 'SETTINGS',
}

export const { AppRouter, provideAppRouter } = defineAppRouter(RouteNames, {
  routes: [
    {
      path: '',
      loadComponent: loadShell,
      children: [
        { path: '', pathMatch: 'full', redirectTo: redirectToMovies },
        {
          path: 'screen',
          routeName: RouteNames.SCREEN,
          queryParams: catalogQueryParams(),
          loadComponent: loadSection,
          children: [
            { path: '', pathMatch: 'full', redirectTo: redirectToMovies },
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
                  path: 'movie/:movieId',
                  routeName: RouteNames.MOVIE_DETAIL,
                  pathParam: { codec: prefixedIdCodec('mov') },
                  loadComponent: loadDetail,
                },
              ],
            },
            {
              path: 'shows',
              children: [
                {
                  path: '',
                  pathMatch: 'full',
                  routeName: RouteNames.SHOWS,
                  loadComponent: loadCatalog,
                },
                {
                  path: 'show/:showId',
                  pathParam: { codec: prefixedIdCodec('tv') },
                  children: [
                    {
                      path: '',
                      pathMatch: 'full',
                      routeName: RouteNames.SHOW_DETAIL,
                      loadComponent: loadDetail,
                    },
                    {
                      // The season links stay above the seasons list, a season, and its episodes.
                      path: '',
                      loadComponent: () =>
                        import('./seasons-page').then((module) => module.SeasonsPage),
                      children: [
                        { path: 'seasons', routeName: RouteNames.SEASONS, children: [] },
                        {
                          path: 'season/:seasonNumber',
                          routeName: RouteNames.SEASON,
                          // Each show remembers its last season for this tab, so
                          // `show/:showId/season` opens it again.
                          pathParam: {
                            codec: positiveIntegerCodec(),
                            persist: { key: 'season', storage: 'session', scope: ['showId'] },
                          },
                          children: [
                            {
                              path: '',
                              pathMatch: 'full',
                              routeName: RouteNames.SEASON_DETAIL,
                              loadComponent: loadDetail,
                            },
                            {
                              path: 'episodes',
                              children: [
                                {
                                  path: '',
                                  pathMatch: 'full',
                                  routeName: RouteNames.EPISODES,
                                  loadComponent: loadCatalog,
                                },
                                {
                                  path: 'episode/:episodeNumber',
                                  routeName: RouteNames.EPISODE_DETAIL,
                                  pathParam: { codec: positiveIntegerCodec() },
                                  loadComponent: loadDetail,
                                },
                              ],
                            },
                          ],
                        },
                        // Without a remembered season, `season` opens the list instead.
                        { path: 'season', pathMatch: 'full', redirectTo: 'seasons' },
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
              path: 'profile/:personId',
              routeName: RouteNames.PERSON_DETAIL,
              pathParam: { codec: prefixedIdCodec('per') },
              loadComponent: () => import('./contributor-page').then((m) => m.ContributorPage),
            },
          ],
        },
        {
          path: 'companies',
          children: [
            {
              path: '',
              pathMatch: 'full',
              routeName: RouteNames.COMPANIES,
              loadComponent: () => import('./contributors-page').then((m) => m.ContributorsPage),
            },
            {
              path: 'profile/:companyId',
              routeName: RouteNames.COMPANY_DETAIL,
              pathParam: { codec: prefixedIdCodec('co') },
              loadComponent: () => import('./contributor-page').then((m) => m.ContributorPage),
            },
          ],
        },
        {
          path: 'collection',
          routeName: RouteNames.COLLECTION,
          queryParams: {
            search: queryParam({ codec: stringCodec(), defaultValue: '' }),
            media: queryParam({ codec: listCodec(mediaKindCodec, ','), defaultValue: [] }),
            statuses: repeatedQueryParam({ codec: statusCodec }),
            replayCount: queryParam({ codec: experienceCountCodec() }),
            minRating: queryParam({ codec: numberCodec() }),
            ...paginationParams({ defaultPageSize: 24, pageSizes: [12, 24, 48] }),
            sort: queryParam({
              codec: sortCodec(['title', 'rating'] as const),
              defaultValue: { field: 'title', direction: 'asc' },
            }),
          },
          loadComponent: () => import('./collection-page').then((module) => module.CollectionPage),
        },
        {
          path: 'activity',
          routeName: RouteNames.ACTIVITY,
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
          loadComponent: () => import('./activity-page').then((module) => module.ActivityPage),
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
