import { inject, Injectable } from '@angular/core';
import { AppRouter } from './app-router';
import type { CatalogItem, Contributor } from './domain';

@Injectable({ providedIn: 'root' })
export class CatalogLinks {
  private readonly routes = inject(AppRouter);
  item(item: CatalogItem) {
    switch (item.kind) {
      case 'movie':
        return this.routes.routes.MOVIE_DETAIL.createUrlTree({ path: { movieId: item.id } });
      case 'show':
        return this.routes.routes.SHOW_DETAIL.createUrlTree({ path: { showId: item.id } });
      case 'episode':
        return this.routes.routes.EPISODE_DETAIL.createUrlTree({
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
      ? this.routes.routes.PERSON_DETAIL.createUrlTree({ path: { personId: contributor.id } })
      : this.routes.routes.COMPANY_DETAIL.createUrlTree({ path: { companyId: contributor.id } });
  }
}
