import { inject } from '@angular/core';
import type { ActivatedRouteSnapshot } from '@angular/router';
import {
  defineAppRouter,
  enumCodec,
  listCodec,
  numberCodec,
  queryParam,
  stringCodec,
} from 'ngx-urlik';
import {
  dateCodec,
  experienceCountCodec,
  paginationParams,
  positiveIntegerCodec,
  prefixedIdCodec,
  sortCodec,
} from './codecs';
import { declinedMinRating, DemoLab } from './demo-lab';
import { catalogTitle, contributorsTitle, historyTitle, libraryTitle } from './page-titles';

const statusCodec = enumCodec(['saved', 'in-progress', 'completed'] as const);

const mediaKindCodec = enumCodec(['movie', 'show', 'episode'] as const);

const creditRoleCodec = enumCodec(['Actor', 'Director', 'Writer', 'Production'] as const);

const contributorQueryParams = () => ({
  search: queryParam({ codec: stringCodec(), defaultValue: '' }),
});

// A tab title or guard that reads the query must run again when only the query changes. By
// default, Angular runs them again only when the path changes.
const resolveOnQueryChange = 'paramsOrQueryParamsChange';

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

enum RouteNames {
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
      // Detail pages set their own title once their data loads.
      title: 'TasteTrack',
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
                  title: moviesTitle,
                  runGuardsAndResolvers: resolveOnQueryChange,
                  loadComponent: loadCatalog,
                },
                {
                  path: ':movieId',
                  routeName: RouteNames.MOVIE_DETAIL,
                  pathParams: { movieId: prefixedIdCodec('mov') },
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
                  title: showsTitle,
                  runGuardsAndResolvers: resolveOnQueryChange,
                  loadComponent: loadCatalog,
                },
                {
                  path: ':showId',
                  pathParams: { showId: prefixedIdCodec('tv') },
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
                      pathParams: { seasonNumber: positiveIntegerCodec() },
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
                              title: episodesTitle,
                              runGuardsAndResolvers: resolveOnQueryChange,
                              loadComponent: loadCatalog,
                            },
                            {
                              path: ':episodeNumber',
                              routeName: RouteNames.EPISODE_DETAIL,
                              pathParams: { episodeNumber: positiveIntegerCodec() },
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
              queryParams: contributorQueryParams(),
              title: peopleTitle,
              runGuardsAndResolvers: resolveOnQueryChange,
              loadComponent: () => import('./contributors-page').then((m) => m.ContributorsPage),
            },
            {
              path: ':personId',
              routeName: RouteNames.PERSON_DETAIL,
              pathParams: { personId: prefixedIdCodec('per') },
              queryParams: { role: queryParam({ codec: creditRoleCodec }) },
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
              queryParams: contributorQueryParams(),
              title: studiosTitle,
              runGuardsAndResolvers: resolveOnQueryChange,
              loadComponent: () => import('./contributors-page').then((m) => m.ContributorsPage),
            },
            {
              path: ':studioId',
              routeName: RouteNames.STUDIO_DETAIL,
              pathParams: { studioId: prefixedIdCodec('st') },
              loadComponent: () => import('./contributor-page').then((m) => m.ContributorPage),
            },
          ],
        },
        {
          path: 'library',
          routeName: RouteNames.LIBRARY,
          title: libraryPageTitle,
          canActivate: [libraryRatingGuard],
          runGuardsAndResolvers: resolveOnQueryChange,
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
          title: historyPageTitle,
          runGuardsAndResolvers: resolveOnQueryChange,
          queryParams: {
            search: queryParam({ codec: stringCodec(), defaultValue: '' }),
            from: queryParam({ codec: dateCodec() }),
            to: queryParam({ codec: dateCodec() }),
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
          title: 'Settings · TasteTrack',
          loadComponent: () => import('./settings-page').then((module) => module.SettingsPage),
        },
        {
          path: '**',
          title: 'Page not found · TasteTrack',
          loadComponent: () => import('./not-found-page').then((module) => module.NotFoundPage),
        },
      ],
    },
  ],
});

// A resolver or guard runs before the URL changes, so `params()` would still return the page the
// user is leaving. `paramsSnapshot()` reads the destination from the snapshot Angular passes in.
// Each function declares its types, because the type of AppRouter comes from the routes above.

function moviesTitle(route: ActivatedRouteSnapshot): string {
  const appRouter = inject(AppRouter);
  return catalogTitle('Movies', appRouter.paramsSnapshot(appRouter.routes.BROWSE, route).query);
}

function showsTitle(route: ActivatedRouteSnapshot): string {
  const appRouter = inject(AppRouter);
  return catalogTitle('TV shows', appRouter.paramsSnapshot(appRouter.routes.BROWSE, route).query);
}

function episodesTitle(route: ActivatedRouteSnapshot): string {
  const appRouter = inject(AppRouter);
  const { path, query } = appRouter.paramsSnapshot(appRouter.routes.EPISODES, route);
  return catalogTitle(`Season ${path.seasonNumber} episodes`, query);
}

function libraryPageTitle(route: ActivatedRouteSnapshot): string {
  const appRouter = inject(AppRouter);
  return libraryTitle(appRouter.paramsSnapshot(appRouter.routes.LIBRARY, route).query);
}

function historyPageTitle(route: ActivatedRouteSnapshot): string {
  const appRouter = inject(AppRouter);
  return historyTitle(appRouter.paramsSnapshot(appRouter.routes.HISTORY, route).query);
}

function peopleTitle(route: ActivatedRouteSnapshot): string {
  const appRouter = inject(AppRouter);
  const { query } = appRouter.paramsSnapshot(appRouter.routes.PEOPLE, route);
  return contributorsTitle('People', query);
}

function studiosTitle(route: ActivatedRouteSnapshot): string {
  const appRouter = inject(AppRouter);
  const { query } = appRouter.paramsSnapshot(appRouter.routes.STUDIOS, route);
  return contributorsTitle('Studios', query);
}

/** While the lab setting is on, declines a Library URL with a minimum rating of 9 or more. */
function libraryRatingGuard(route: ActivatedRouteSnapshot): boolean {
  if (!inject(DemoLab).declineTopRatings()) {
    return true;
  }
  const appRouter = inject(AppRouter);
  const { minRating } = appRouter.paramsSnapshot(appRouter.routes.LIBRARY, route).query;
  return minRating === null || minRating < declinedMinRating;
}
