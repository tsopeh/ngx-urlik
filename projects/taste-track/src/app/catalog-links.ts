import { Injectable, inject } from '@angular/core';
import { AppRouter } from './app-router';
import type { CatalogItem, Contributor } from './domain';

@Injectable({ providedIn: 'root' })
export class CatalogLinks {
  private readonly routes = inject(AppRouter);
  item(item: CatalogItem) {
    switch (item.kind) {
      case 'movie':
        return this.routes.ROOT.SCREEN.MOVIES.DETAIL.createUrlTree({ path: { movieId: item.id } });
      case 'show':
        return this.routes.ROOT.SCREEN.SHOWS.DETAIL.createUrlTree({ path: { showId: item.id } });
      case 'episode':
        return this.routes.ROOT.SCREEN.SHOWS.DETAIL.SEASONS.DETAIL.EPISODES.DETAIL.createUrlTree({
          path: {
            showId: item.showId,
            seasonNumber: item.seasonNumber,
            episodeNumber: item.episodeNumber,
          },
        });
    }
  }
  contributor(contributor: Contributor) {
    return contributor.kind === 'person'
      ? this.routes.ROOT.PEOPLE.DETAIL.createUrlTree({ path: { personId: contributor.id } })
      : this.routes.ROOT.COMPANIES.DETAIL.createUrlTree({ path: { companyId: contributor.id } });
  }
}
