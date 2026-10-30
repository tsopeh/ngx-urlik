import { inject, Injectable } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { delay, filter, map, type Observable } from 'rxjs';
import { TasteTrackRepository } from './database';
import type {
  CatalogItem,
  LibraryStatus,
  Contributor,
  ExperienceCount,
  JournalEvent,
  MediaKind,
  PersonalState,
  Season,
} from './domain';

/**
 * Filter and pagination parameters for browsing titles in the catalog.
 */
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

/**
 * A catalog item paired with the user's library state.
 */
export interface CatalogItemCard {
  readonly item: CatalogItem;
  readonly state?: PersonalState;
}

/**
 * Paginated catalog result containing matching item cards and the total matching count.
 */
export interface CatalogResponse {
  readonly items: readonly CatalogItemCard[];
  readonly total: number;
}

/**
 * Route parameters identifying a single title, season, or episode for detail viewing.
 */
export interface ItemDetailRequest {
  readonly route: 'episode' | 'season' | 'show' | 'movie';
  readonly movieId?: string;
  readonly showId?: string;
  readonly seasonNumber?: number;
  readonly episodeNumber?: number;
}

/**
 * A cast or crew credit linked to the contributor's full profile record.
 */
export interface ItemCredit {
  readonly person: Contributor;
  readonly role: 'Actor' | 'Director' | 'Writer' | 'Production';
}

/**
 * Complete presentation model for an item detail page.
 */
export interface ItemDetail {
  readonly item: CatalogItem;
  readonly heading: string;
  readonly isSeason: boolean;
  readonly state?: PersonalState;
  readonly eventCount: number;
  readonly credits: readonly ItemCredit[];
}

/**
 * Query parameters for filtering the user's library.
 */
export interface LibraryQuery {
  readonly search: string;
  readonly media: readonly MediaKind[];
  readonly statuses: readonly LibraryStatus[];
  readonly replayCount: ExperienceCount | null;
  readonly minRating: number | null;
  readonly page: number;
  readonly pageSize: number;
  readonly sort: { readonly field: string; readonly direction: string };
}

/**
 * A library item paired with its guaranteed personal state.
 */
export interface LibraryItemCard {
  readonly item: CatalogItem;
  readonly state: PersonalState;
}

/**
 * Paginated library result containing library items and the total matching count.
 */
export interface LibraryResponse {
  readonly items: readonly LibraryItemCard[];
  readonly total: number;
}

/**
 * Filter parameters for searching personal viewing history.
 */
export interface HistoryQuery {
  readonly search: string;
  readonly from?: string | null;
  readonly to?: string | null;
  readonly page: number;
  readonly pageSize: number;
  readonly sort: { readonly field: string; readonly direction: string };
}

/**
 * A journal viewing event joined with its referenced catalog title.
 */
export interface HistoryEntry {
  readonly event: JournalEvent;
  readonly item?: CatalogItem;
}

/**
 * Paginated viewing history containing journal entries and the total matching count.
 */
export interface HistoryResponse {
  readonly entries: readonly HistoryEntry[];
  readonly total: number;
}

/**
 * A filmography entry linking an item to the roles a contributor performed.
 */
export interface ContributorCredit {
  readonly item: CatalogItem;
  readonly roles: readonly ('Actor' | 'Director' | 'Writer' | 'Production')[];
}

/**
 * Contributor profile data along with all non-episode credits.
 */
export interface ContributorProfile {
  readonly contributor: Contributor;
  readonly credits: readonly ContributorCredit[];
}

/**
 * Central API service that encapsulates all querying, filtering, and mutation logic.
 *
 * Query methods return an RxJS Observable that resolves asynchronously on the next event-loop tick.
 * This delays emissions to mock network latency and prevents synchronous data coupling in components.
 * Active subscriptions automatically re-emit when database mutations change the data version.
 */
@Injectable({ providedIn: 'root' })
export class BackendApi {
  private readonly repository = inject(TasteTrackRepository);
  private readonly dataVersion$ = toObservable(this.repository.dataVersion).pipe(
    filter(() => this.repository.ready()),
  );

  /**
   * Queries the catalog by branch, search text, genre, sort order, and page size.
   *
   * Slices the matching titles to the requested page window and joins each item with its
   * personal state record. Returns an empty items array if no titles match.
   */
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

  /**
   * Resolves the full detail model for a movie, show, season, or episode.
   *
   * Returns `null` if the requested route parameters do not match an entity in the catalog.
   */
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

  /**
   * Returns all seasons associated with the given show ID.
   */
  getSeasons(showId: string): Observable<readonly Season[]> {
    return this.dataVersion$.pipe(
      delay(0),
      map(() => this.repository.seasons().filter((season) => season.showId === showId)),
    );
  }

  /**
   * Queries library items filtered by search, media kind, status, replay count,
   * and minimum rating.
   */
  getLibrary(query: LibraryQuery): Observable<LibraryResponse> {
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

  /**
   * Queries viewing events filtered by title search and date boundaries.
   * Joins each journal event with its matching catalog item title.
   */
  getHistory(query: HistoryQuery): Observable<HistoryResponse> {
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

  /**
   * Lists all contributors matching the given kind ('person' or 'studio').
   */
  getContributors(kind: 'person' | 'studio'): Observable<readonly Contributor[]> {
    return this.dataVersion$.pipe(
      delay(0),
      map(() => this.repository.contributors().filter((c) => c.kind === kind)),
    );
  }

  /**
   * Returns a contributor's profile along with all non-episode credits.
   * Returns `null` if no contributor matches the ID.
   */
  getContributorProfile(id: string): Observable<ContributorProfile | null> {
    return this.dataVersion$.pipe(
      delay(0),
      map(() => {
        const contributor = this.repository.contributors().find((c) => c.id === id);
        if (!contributor) return null;

        const credits = this.repository
          .items()
          .filter((item) => item.kind !== 'episode')
          .flatMap((item) => {
            const roles = item.credits
              .filter((credit) => credit.contributorId === id)
              .map((credit) => credit.role);
            return roles.length ? [{ item, roles }] : [];
          });

        return {
          contributor,
          credits,
        };
      }),
    );
  }

  /**
   * Toggles the favorite flag on an item in the user's library.
   */
  async toggleFavorite(itemId: CatalogItem['id']): Promise<void> {
    await this.repository.toggleFavorite(itemId);
  }

  /**
   * Updates library properties (status, rating, favorite) on a title.
   */
  async updatePersonal(
    itemId: CatalogItem['id'],
    patch: Partial<Omit<PersonalState, 'itemId'>>,
  ): Promise<void> {
    await this.repository.updatePersonal(itemId, patch);
  }

  /**
   * Records a viewing event for the title on the specified date.
   */
  async logViewing(item: CatalogItem, date: string): Promise<void> {
    await this.repository.logViewing(item, date);
  }
}

/**
 * Alias for BackendApi to match service naming conventions.
 */
export { BackendApi as BackendApiService };
