import { inject } from '@angular/core';
import { Router } from '@angular/router';
import {
  defineAppRouter,
  delimitedQueryParam,
  enumCodec,
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

const redirectToMovies = ({ queryParams }: { queryParams: Record<string, unknown> }) =>
  inject(Router).createUrlTree(['/screen/movies'], { queryParams });

export const { AppRouter, provideAppRouter } = defineAppRouter({
  routes: [
    {
      path: '',
      loadComponent: loadShell,
      children: [
        { path: '', pathMatch: 'full', redirectTo: redirectToMovies },
        {
          path: 'screen',
          identifier: 'SCREEN',
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
                  identifier: 'MOVIES',
                  loadComponent: loadCatalog,
                },
                {
                  path: 'movie/:movieId',
                  identifier: 'MOVIE_DETAIL',
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
                  identifier: 'SHOWS',
                  loadComponent: loadCatalog,
                },
                {
                  path: 'show/:showId',
                  pathParam: { codec: prefixedIdCodec('tv') },
                  children: [
                    {
                      path: '',
                      pathMatch: 'full',
                      identifier: 'SHOW_DETAIL',
                      loadComponent: loadDetail,
                    },
                    {
                      path: 'seasons',
                      identifier: 'SEASONS',
                      loadComponent: () =>
                        import('./seasons-page').then((module) => module.SeasonsPage),
                      children: [
                        {
                          path: 'season/:seasonNumber',
                          pathParam: { codec: positiveIntegerCodec() },
                          children: [
                            {
                              path: '',
                              pathMatch: 'full',
                              identifier: 'SEASON_DETAIL',
                              loadComponent: loadDetail,
                            },
                            {
                              path: 'episodes',
                              children: [
                                {
                                  path: '',
                                  pathMatch: 'full',
                                  identifier: 'EPISODES',
                                  loadComponent: loadCatalog,
                                },
                                {
                                  path: 'episode/:episodeNumber',
                                  identifier: 'EPISODE_DETAIL',
                                  pathParam: { codec: positiveIntegerCodec() },
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
          ],
        },
        {
          path: 'people',
          children: [
            {
              path: '',
              pathMatch: 'full',
              identifier: 'PEOPLE',
              loadComponent: () => import('./contributors-page').then((m) => m.ContributorsPage),
            },
            {
              path: 'profile/:personId',
              identifier: 'PERSON_DETAIL',
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
              identifier: 'COMPANIES',
              loadComponent: () => import('./contributors-page').then((m) => m.ContributorsPage),
            },
            {
              path: 'profile/:companyId',
              identifier: 'COMPANY_DETAIL',
              pathParam: { codec: prefixedIdCodec('co') },
              loadComponent: () => import('./contributor-page').then((m) => m.ContributorPage),
            },
          ],
        },
        {
          path: 'collection',
          identifier: 'COLLECTION',
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
          loadComponent: () => import('./collection-page').then((module) => module.CollectionPage),
        },
        {
          path: 'activity',
          identifier: 'ACTIVITY',
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
          identifier: 'SETTINGS',
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
