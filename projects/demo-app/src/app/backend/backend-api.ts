import { inject, Injectable, InjectionToken } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { filter, map, type Observable, switchMap, timer } from 'rxjs';
import { TasteTrackRepository } from './database';
import type {
  CatalogItem,
  LibraryStatus,
  Contributor,
  ExperienceCount,
  JournalEvent,
  LibraryItem,
  LibraryItemId,
  LibraryKind,
  PersonalState,
  Season,
} from './domain';

/** Filters and page for browsing the catalog. */
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

/** A catalog title with the user's library entry, if any. */
export interface CatalogItemCard {
  readonly item: CatalogItem;
  readonly state?: PersonalState;
}

/** One page of catalog cards, and how many titles match in total. */
export interface CatalogResponse {
  readonly items: readonly CatalogItemCard[];
  readonly total: number;
}

/** The route values that pick one title, season, or episode. */
export interface ItemDetailRequest {
  readonly route: 'episode' | 'season' | 'show' | 'movie';
  readonly movieId?: string;
  readonly showId?: string;
  readonly seasonNumber?: number;
  readonly episodeNumber?: number;
}

/** A viewing, and which episode it was when the page is a show or a season. */
export interface RecentViewing extends JournalEvent {
  readonly episode?: string;
}

/** A cast or crew credit, with the person or studio it names. */
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
  /** The three newest viewings of this title, newest first. */
  readonly recentViewings: readonly RecentViewing[];
  readonly credits: readonly ItemCredit[];
}

export interface LibraryQuery {
  readonly search: string;
  readonly media: readonly LibraryKind[];
  readonly statuses: readonly LibraryStatus[];
  readonly replayCount: ExperienceCount | null;
  readonly minRating: number | null;
  readonly page: number;
  readonly pageSize: number;
  readonly sort: { readonly field: string; readonly direction: string };
}

/** How many of a show's episodes have a logged viewing. */
export interface EpisodeProgress {
  readonly logged: number;
  readonly total: number;
}

/** A library title with the user's entry for it, and a show's episode progress once one is logged. */
export interface LibraryItemCard {
  readonly item: LibraryItem;
  readonly state: PersonalState;
  readonly episodes?: EpisodeProgress;
}

/** One page of library titles, and how many match in total. */
export interface LibraryResponse {
  readonly items: readonly LibraryItemCard[];
  readonly total: number;
}

export interface HistoryQuery {
  readonly search: string;
  readonly from?: string | null;
  readonly to?: string | null;
  readonly page: number;
  readonly pageSize: number;
  readonly sort: { readonly field: string; readonly direction: string };
}

/** A logged viewing, with the title that was watched. */
export interface HistoryEntry {
  readonly event: JournalEvent;
  readonly item?: CatalogItem;
}

/** One page of viewings, and how many match in total. */
export interface HistoryResponse {
  readonly entries: readonly HistoryEntry[];
  readonly total: number;
}

export interface ContributorQuery {
  readonly kind: 'person' | 'studio';
  readonly search: string;
}

/** A title someone worked on, and their roles in it. */
export interface ContributorCredit {
  readonly item: CatalogItem;
  readonly roles: readonly ('Actor' | 'Director' | 'Writer' | 'Production')[];
}

/** A person or studio, and every credit except single episodes. */
export interface ContributorProfile {
  readonly contributor: Contributor;
  readonly credits: readonly ContributorCredit[];
}

/** A network-like delay in milliseconds: four answers in five take 150 to 300 ms, the rest 300 to 500 ms. */
export const normalLatency = (): number =>
  Math.random() < 0.8 ? 150 + Math.random() * 150 : 300 + Math.random() * 200;

/** How long the fake backend takes to answer, in milliseconds. */
export const BACKEND_LATENCY = new InjectionToken<() => number>('BACKEND_LATENCY', {
  providedIn: 'root',
  factory: () => normalLatency,
});

/** Called each time the fake backend answers a query, with the query's name and its delay in ms. */
export const BACKEND_MONITOR = new InjectionToken<(query: string, latency: number) => void>(
  'BACKEND_MONITOR',
  { providedIn: 'root', factory: () => () => undefined },
);

/**
 * The fake backend. Every page reads and changes data through it.
 *
 * Each query returns an Observable that emits after a `BACKEND_LATENCY` delay, as a network call
 * would, so pages show their loading states. After any change, open queries emit again. A change
 * that arrives while an answer is pending replaces that answer.
 */
@Injectable({ providedIn: 'root' })
export class BackendApi {
  private readonly repository = inject(TasteTrackRepository);
  private readonly latency = inject(BACKEND_LATENCY);
  private readonly monitor = inject(BACKEND_MONITOR);
  private readonly dataVersion$ = toObservable(this.repository.dataVersion).pipe(
    filter(() => this.repository.ready()),
  );

  /** Waits a fresh latency for each data version before the query reads the data. */
  private respond(query: string) {
    return switchMap((version: number) => {
      const latency = this.latency();
      return timer(latency).pipe(
        map(() => {
          this.monitor(query, latency);
          return version;
        }),
      );
    });
  }

  /** One page of catalog titles that match the search, genres, and sort order. */
  getCatalog(query: CatalogQuery): Observable<CatalogResponse> {
    return this.dataVersion$.pipe(
      this.respond('getCatalog'),
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
            const matchesSearch = `${item.title} ${item.subtitle}`
              .toLowerCase()
              .includes(query.search.toLowerCase());
            const matchesGenres =
              !query.genres.length || query.genres.some((genre) => item.genres.includes(genre));
            return inBranch && matchesSearch && matchesGenres;
          })
          .sort(
            (a, b) =>
              (query.sort.field === 'year' ? a.year - b.year : a.title.localeCompare(b.title)) *
              (query.sort.direction === 'asc' ? 1 : -1),
          );

        const start = (query.page - 1) * query.pageSize;
        const pageItems = matched.slice(start, start + query.pageSize);
        const stateMap = new Map<string, PersonalState>(personalStates.map((s) => [s.itemId, s]));

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

  /** The detail page for a movie, show, season, or episode, or `null` if there's no such title. */
  getItemDetail(request: ItemDetailRequest): Observable<ItemDetail | null> {
    return this.dataVersion$.pipe(
      this.respond('getItemDetail'),
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

        if (!item) {
          return null;
        }

        const isSeason = request.route === 'season';
        const heading = isSeason ? `${item.title} · Season ${request.seasonNumber}` : item.title;
        const state = this.repository.personalStates().find((s) => s.itemId === item.id);
        // A show counts its own viewings and its episodes'. A season counts its episodes'.
        const itemMap = new Map(items.map((candidate) => [candidate.id, candidate]));
        const viewings: RecentViewing[] = this.repository
          .events()
          .flatMap((event) => {
            const watched = itemMap.get(event.itemId);
            if (watched?.kind !== 'episode' || watched.id === item.id) {
              return event.itemId === item.id && !isSeason ? [event] : [];
            }
            const inShow = watched.showId === item.id;
            const inPage = !isSeason || watched.seasonNumber === request.seasonNumber;
            return inShow && inPage
              ? [
                  {
                    ...event,
                    episode: `Season ${watched.seasonNumber}, episode ${watched.episodeNumber}`,
                  },
                ]
              : [];
          })
          .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
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
          eventCount: viewings.length,
          recentViewings: viewings.slice(0, 3),
          credits,
        };
      }),
    );
  }

  getSeasons(showId: string): Observable<readonly Season[]> {
    return this.dataVersion$.pipe(
      this.respond('getSeasons'),
      map(() => this.repository.seasons().filter((season) => season.showId === showId)),
    );
  }

  /**
   * One page of library movies and shows, filtered by search, kind, status, viewing count, and
   * rating. Episodes aren't entries: each show counts its logged episodes instead.
   */
  getLibrary(query: LibraryQuery): Observable<LibraryResponse> {
    return this.dataVersion$.pipe(
      this.respond('getLibrary'),
      map(() => {
        const stateMap = new Map<string, PersonalState>(
          this.repository.personalStates().map((state) => [state.itemId, state]),
        );
        const episodes = this.episodeProgress();
        const filtered = this.repository
          .items()
          .filter((item): item is LibraryItem => {
            const state = stateMap.get(item.id);
            if (!state || item.kind === 'episode') {
              return false;
            }
            const matchesSearch =
              !query.search ||
              `${item.title} ${item.subtitle}`.toLowerCase().includes(query.search.toLowerCase());
            const matchesMedia = !query.media.length || query.media.includes(item.kind);
            const matchesStatus = !query.statuses.length || query.statuses.includes(state.status);
            const matchesRating =
              query.minRating === null || (state.rating ?? 0) >= query.minRating;
            const matchesCount = !query.replayCount || sameCount(query.replayCount, state.count);
            return matchesSearch && matchesMedia && matchesStatus && matchesRating && matchesCount;
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
          items: pageItems.map((item) => {
            const progress = episodes.get(item.id);
            return {
              item,
              state: stateMap.get(item.id)!,
              ...(progress?.logged ? { episodes: progress } : {}),
            };
          }),
        };
      }),
    );
  }

  /** Each show's episode count, and how many of its episodes have a logged viewing. */
  private episodeProgress(): ReadonlyMap<string, EpisodeProgress> {
    const loggedEpisodes = new Set(
      this.repository
        .events()
        .filter((event) => event.kind === 'episode')
        .map((event) => event.itemId),
    );
    const progress = new Map<string, EpisodeProgress>();
    for (const item of this.repository.items()) {
      if (item.kind === 'episode') {
        const { logged, total } = progress.get(item.showId) ?? { logged: 0, total: 0 };
        const isLogged = loggedEpisodes.has(item.id);
        progress.set(item.showId, { logged: logged + (isLogged ? 1 : 0), total: total + 1 });
      }
    }
    return progress;
  }

  /** One page of viewings, filtered by title and date range. */
  getHistory(query: HistoryQuery): Observable<HistoryResponse> {
    return this.dataVersion$.pipe(
      this.respond('getHistory'),
      map(() => {
        const itemMap = new Map(this.repository.items().map((item) => [item.id, item]));
        const matched = this.repository.events().filter((event) => {
          const item = itemMap.get(event.itemId);
          const matchesSearch =
            !query.search ||
            // The subtitle names an episode's show, so a show's search finds its episodes.
            (item !== undefined &&
              `${item.title} ${item.subtitle}`.toLowerCase().includes(query.search.toLowerCase()));
          const afterFrom = !query.from || event.occurredAt >= query.from;
          const beforeTo = !query.to || event.occurredAt <= `${query.to}T23:59:59.999Z`;
          return matchesSearch && afterFrom && beforeTo;
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

  /** People or studios whose name contains the search, ignoring case. */
  getContributors(query: ContributorQuery): Observable<readonly Contributor[]> {
    const search = query.search.toLowerCase();
    return this.dataVersion$.pipe(
      this.respond('getContributors'),
      map(() =>
        this.repository
          .contributors()
          .filter((c) => c.kind === query.kind && c.name.toLowerCase().includes(search)),
      ),
    );
  }

  /** A person or studio with their credits, or `null` if the ID is unknown. */
  getContributorProfile(id: string): Observable<ContributorProfile | null> {
    return this.dataVersion$.pipe(
      this.respond('getContributorProfile'),
      map(() => {
        const contributor = this.repository.contributors().find((c) => c.id === id);
        if (!contributor) {
          return null;
        }

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

  async toggleFavorite(itemId: LibraryItemId): Promise<void> {
    await this.repository.toggleFavorite(itemId);
  }

  /** Changes a title's status, rating, or favorite mark. */
  async updatePersonal(
    itemId: LibraryItemId,
    patch: Partial<Omit<PersonalState, 'itemId'>>,
  ): Promise<void> {
    await this.repository.updatePersonal(itemId, patch);
  }

  async logViewing(item: CatalogItem, date: string): Promise<void> {
    await this.repository.logViewing(item, date);
  }
}

/** Whether two viewing counts are the same: both countless, or the same exact number. */
function sameCount(a: ExperienceCount, b: ExperienceCount): boolean {
  const bothExact = a.kind === 'exact' && b.kind === 'exact';
  if (bothExact) {
    return a.value === b.value;
  }
  return a.kind === b.kind;
}
