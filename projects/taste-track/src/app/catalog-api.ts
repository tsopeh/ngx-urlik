import { inject, Injectable } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { delay, filter, map, type Observable } from 'rxjs';
import { TasteTrackRepository } from './database';
import type { CatalogItem, Contributor, PersonalState, Season } from './domain';

export interface CatalogQuery {
  readonly route: 'episodes' | 'movies' | 'shows';
  readonly showId?: string;
  readonly seasonNumber?: number;
  readonly search: string;
  readonly genres: readonly string[];
  readonly sort: { readonly field: string; readonly direction: string };
  readonly page: number;
  readonly pageSize: number;
}

export interface CatalogItemCard {
  readonly item: CatalogItem;
  readonly state?: PersonalState;
}

export interface CatalogResponse {
  readonly items: readonly CatalogItemCard[];
  readonly total: number;
}

export interface ItemDetailRequest {
  readonly route: 'episode' | 'season' | 'show' | 'movie';
  readonly movieId?: string;
  readonly showId?: string;
  readonly seasonNumber?: number;
  readonly episodeNumber?: number;
}

export interface ItemCredit {
  readonly person: Contributor;
  readonly role: 'Actor' | 'Director' | 'Writer' | 'Production';
}

export interface ItemDetail {
  readonly item: CatalogItem;
  readonly heading: string;
  readonly isSeason: boolean;
  readonly state?: PersonalState;
  readonly eventCount: number;
  readonly credits: readonly ItemCredit[];
}

@Injectable({ providedIn: 'root' })
export class CatalogApiService {
  private readonly repository = inject(TasteTrackRepository);
  private readonly dataVersion$ = toObservable(this.repository.dataVersion).pipe(
    filter(() => this.repository.ready()),
  );

  getCatalog(query: CatalogQuery): Observable<CatalogResponse> {
    return this.dataVersion$.pipe(
      delay(0),
      map(() => {
        const items = this.repository.items();
        const personalStates = this.repository.personalStates();
        const matched = items
          .filter((item) => {
            const inBranch =
              query.route === 'episodes'
                ? item.kind === 'episode' &&
                  item.showId === query.showId &&
                  item.seasonNumber === query.seasonNumber
                : item.kind === (query.route === 'movies' ? 'movie' : 'show');
            return (
              inBranch &&
              `${item.title} ${item.subtitle}`.toLowerCase().includes(query.search.toLowerCase()) &&
              (!query.genres.length || query.genres.some((genre) => item.genres.includes(genre)))
            );
          })
          .sort(
            (a, b) =>
              (query.sort.field === 'year' ? a.year - b.year : a.title.localeCompare(b.title)) *
              (query.sort.direction === 'asc' ? 1 : -1),
          );

        const start = (query.page - 1) * query.pageSize;
        const pageItems = matched.slice(start, start + query.pageSize);
        const stateMap = new Map(personalStates.map((s) => [s.itemId, s]));

        return {
          total: matched.length,
          items: pageItems.map((item) => ({
            item,
            state: stateMap.get(item.id),
          })),
        };
      }),
    );
  }

  getItemDetail(request: ItemDetailRequest): Observable<ItemDetail | null> {
    return this.dataVersion$.pipe(
      delay(0),
      map(() => {
        const items = this.repository.items();
        let item: CatalogItem | undefined;
        switch (request.route) {
          case 'movie':
            item = items.find((candidate) => candidate.id === request.movieId);
            break;
          case 'show':
            item = items.find((candidate) => candidate.id === request.showId);
            break;
          case 'season':
            item = this.repository
              .seasons()
              .some(
                (season) =>
                  season.showId === request.showId && season.number === request.seasonNumber,
              )
              ? items.find((candidate) => candidate.id === request.showId)
              : undefined;
            break;
          case 'episode':
            item = items.find(
              (candidate) =>
                candidate.kind === 'episode' &&
                candidate.showId === request.showId &&
                candidate.seasonNumber === request.seasonNumber &&
                candidate.episodeNumber === request.episodeNumber,
            );
            break;
        }

        if (!item) return null;

        const isSeason = request.route === 'season';
        const heading = isSeason ? `${item.title} · Season ${request.seasonNumber}` : item.title;
        const state = this.repository.personalStates().find((s) => s.itemId === item.id);
        const eventCount = this.repository.events().filter((e) => e.itemId === item.id).length;
        const contributors = this.repository.contributors();
        const contributorMap = new Map(contributors.map((c) => [c.id, c]));
        const credits = item.credits.flatMap((credit) => {
          const person = contributorMap.get(credit.contributorId);
          return person ? [{ person, role: credit.role }] : [];
        });

        return {
          item,
          heading,
          isSeason,
          state,
          eventCount,
          credits,
        };
      }),
    );
  }

  getSeasons(showId: string): Observable<readonly Season[]> {
    return this.dataVersion$.pipe(
      delay(0),
      map(() => this.repository.seasons().filter((season) => season.showId === showId)),
    );
  }

  async toggleFavorite(itemId: CatalogItem['id']): Promise<void> {
    await this.repository.toggleFavorite(itemId);
  }

  async updatePersonal(
    itemId: CatalogItem['id'],
    patch: Partial<Omit<PersonalState, 'itemId'>>,
  ): Promise<void> {
    await this.repository.updatePersonal(itemId, patch);
  }

  async logViewing(item: CatalogItem, date: string): Promise<void> {
    await this.repository.logViewing(item, date);
  }
}
