import { inject, Injectable } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { delay, filter, map, type Observable } from 'rxjs';
import { TasteTrackRepository } from './database';
import type {
  CatalogItem,
  CollectionStatus,
  ExperienceCount,
  MediaKind,
  PersonalState,
} from './domain';

export interface CollectionQuery {
  readonly search: string;
  readonly media: readonly MediaKind[];
  readonly statuses: readonly CollectionStatus[];
  readonly replayCount: ExperienceCount | null;
  readonly minRating: number | null;
  readonly page: number;
  readonly pageSize: number;
  readonly sort: { readonly field: string; readonly direction: string };
}

export interface CollectionItemCard {
  readonly item: CatalogItem;
  readonly state: PersonalState;
}

export interface CollectionResponse {
  readonly items: readonly CollectionItemCard[];
  readonly total: number;
}

@Injectable({ providedIn: 'root' })
export class CollectionApiService {
  private readonly repository = inject(TasteTrackRepository);
  private readonly dataVersion$ = toObservable(this.repository.dataVersion).pipe(
    filter(() => this.repository.ready()),
  );

  getCollection(query: CollectionQuery): Observable<CollectionResponse> {
    return this.dataVersion$.pipe(
      delay(0),
      map(() => {
        const stateMap = new Map(
          this.repository.personalStates().map((state) => [state.itemId, state]),
        );
        const filtered = this.repository
          .items()
          .filter((item) => {
            const state = stateMap.get(item.id);
            if (!state) return false;
            if (
              query.search &&
              !`${item.title} ${item.subtitle}`.toLowerCase().includes(query.search.toLowerCase())
            )
              return false;
            if (query.media.length && !query.media.includes(item.kind)) return false;
            if (query.statuses.length && !query.statuses.includes(state.status)) return false;
            if (query.minRating !== null && (state.rating ?? 0) < query.minRating) return false;
            if (
              query.replayCount &&
              (query.replayCount.kind !== state.count.kind ||
                (query.replayCount.kind === 'exact' &&
                  state.count.kind === 'exact' &&
                  query.replayCount.value !== state.count.value))
            )
              return false;
            return true;
          })
          .sort(
            (a, b) =>
              (query.sort.field === 'title'
                ? a.title.localeCompare(b.title)
                : (stateMap.get(a.id)?.rating ?? 0) - (stateMap.get(b.id)?.rating ?? 0)) *
              (query.sort.direction === 'asc' ? 1 : -1),
          );

        const start = (query.page - 1) * query.pageSize;
        const pageItems = filtered.slice(start, start + query.pageSize);
        return {
          total: filtered.length,
          items: pageItems.map((item) => ({
            item,
            state: stateMap.get(item.id)!,
          })),
        };
      }),
    );
  }

  async toggleFavorite(itemId: CatalogItem['id']): Promise<void> {
    await this.repository.toggleFavorite(itemId);
  }
}
