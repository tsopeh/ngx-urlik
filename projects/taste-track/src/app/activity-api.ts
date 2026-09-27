import { inject, Injectable } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { delay, filter, map, type Observable } from 'rxjs';
import { TasteTrackRepository } from './database';
import type { CatalogItem, JournalEvent } from './domain';

export interface ActivityQuery {
  readonly search: string;
  readonly from?: string | null;
  readonly to?: string | null;
  readonly page: number;
  readonly pageSize: number;
  readonly sort: { readonly field: string; readonly direction: string };
}

export interface ActivityEntry {
  readonly event: JournalEvent;
  readonly item?: CatalogItem;
}

export interface ActivityResponse {
  readonly entries: readonly ActivityEntry[];
  readonly total: number;
}

@Injectable({ providedIn: 'root' })
export class ActivityApiService {
  private readonly repository = inject(TasteTrackRepository);
  private readonly dataVersion$ = toObservable(this.repository.dataVersion).pipe(
    filter(() => this.repository.ready()),
  );

  getActivity(query: ActivityQuery): Observable<ActivityResponse> {
    return this.dataVersion$.pipe(
      delay(0),
      map(() => {
        const itemMap = new Map(this.repository.items().map((item) => [item.id, item]));
        const matched = this.repository.events().filter((event) => {
          const item = itemMap.get(event.itemId);
          return (
            (!query.search || item?.title.toLowerCase().includes(query.search.toLowerCase())) &&
            (!query.from || event.occurredAt >= query.from) &&
            (!query.to || event.occurredAt <= `${query.to}T23:59:59.999Z`)
          );
        });

        matched.sort(
          (a, b) =>
            (query.sort.field === 'date'
              ? a.occurredAt.localeCompare(b.occurredAt)
              : (a.rating ?? 0) - (b.rating ?? 0)) * (query.sort.direction === 'asc' ? 1 : -1),
        );

        const start = (query.page - 1) * query.pageSize;
        const pageEvents = matched.slice(start, start + query.pageSize);
        return {
          total: matched.length,
          entries: pageEvents.map((event) => ({
            event,
            item: itemMap.get(event.itemId),
          })),
        };
      }),
    );
  }

  async logViewing(item: CatalogItem, date: string): Promise<void> {
    await this.repository.logViewing(item, date);
  }
}
