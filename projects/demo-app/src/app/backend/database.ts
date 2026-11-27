import { computed, Injectable, signal } from '@angular/core';
import Dexie, { type EntityTable } from 'dexie';
import {
  type CatalogItem,
  type Contributor,
  isViewingDate,
  type JournalEvent,
  type LibraryItemId,
  type PersonalState,
  type Season,
} from './domain';
import { tasteTrackSeed } from './seed';

class TasteTrackDatabase extends Dexie {
  readonly items!: EntityTable<CatalogItem, 'id'>;
  readonly seasons!: EntityTable<Season, 'id'>;
  readonly contributors!: EntityTable<Contributor, 'id'>;
  readonly personalStates!: EntityTable<PersonalState, 'itemId'>;
  readonly events!: EntityTable<JournalEvent, 'id'>;

  constructor() {
    super('taste-track');
    const schema = {
      items: 'id, kind, year, showId, [showId+seasonNumber+episodeNumber], *genres',
      seasons: 'id, [showId+number]',
      contributors: 'id, kind, name',
      personalStates: 'itemId, status, favorite, rating',
      events: 'id, itemId, occurredAt, rating',
    };
    this.version(1).stores(schema);
    // Journals from version 1 can have Library entries for episodes.
    this.version(2)
      .stores(schema)
      .upgrade(async (transaction) => {
        const states = await transaction.table<StoredState>('personalStates').toArray();
        const items = await transaction.table<CatalogItem>('items').toArray();
        await transaction.table('personalStates').clear();
        await transaction.table('personalStates').bulkAdd(withoutEpisodeEntries(states, items));
      });
    this.on('populate', (transaction) =>
      Promise.all(
        Object.entries(tasteTrackSeed).map(([table, rows]) =>
          transaction.table(table).bulkAdd(rows),
        ),
      ),
    );
  }
}

/** A Library entry as a journal from version 1 stored it, possibly for an episode. */
export type StoredState = Omit<PersonalState, 'itemId'> & { readonly itemId: string };

/**
 * The Library entries of a version 1 journal, with each episode's entry moved to its show. A show
 * without its own entry gets one: Watching if any of its episodes was past the watchlist, or else
 * on the watchlist. Movie and show entries stay as they are.
 */
export function withoutEpisodeEntries(
  states: readonly StoredState[],
  items: readonly CatalogItem[],
): PersonalState[] {
  const showOf = new Map<string, LibraryItemId>(
    items.flatMap((item) => (item.kind === 'episode' ? [[item.id, item.showId] as const] : [])),
  );
  const kept = states.filter((state): state is PersonalState => !showOf.has(state.itemId));
  const started = new Map<LibraryItemId, boolean>();
  for (const state of states) {
    const showId = showOf.get(state.itemId);
    if (showId) {
      started.set(showId, (started.get(showId) ?? false) || state.status !== 'saved');
    }
  }
  const tracked = new Set(kept.map((state) => state.itemId));
  const added = [...started]
    .filter(([showId]) => !tracked.has(showId))
    .map(([showId, isStarted]): PersonalState => ({
      itemId: showId,
      status: isStarted ? 'in-progress' : 'saved',
      favorite: false,
      rating: null,
      count: { kind: 'exact', value: 0 },
    }));
  return [...kept, ...added];
}

@Injectable({ providedIn: 'root' })
export class TasteTrackRepository {
  private readonly database = new TasteTrackDatabase();
  private readonly itemState = signal<readonly CatalogItem[]>([]);
  private readonly seasonState = signal<readonly Season[]>([]);
  private readonly contributorState = signal<readonly Contributor[]>([]);
  private readonly personalState = signal<readonly PersonalState[]>([]);
  private readonly eventState = signal<readonly JournalEvent[]>([]);
  readonly items = this.itemState.asReadonly();
  readonly seasons = this.seasonState.asReadonly();
  readonly contributors = this.contributorState.asReadonly();
  readonly personalStates = this.personalState.asReadonly();
  readonly events = this.eventState.asReadonly();
  readonly ready = signal(false);
  readonly error = signal<string | null>(null);
  readonly dataVersion = signal(0);
  readonly failedToOpen = computed(() => !this.ready() && this.error() !== null);

  constructor() {
    void this.reload().catch(() =>
      this.error.set('Could not open your journal. Please reload and try again.'),
    );
  }

  async reload(): Promise<void> {
    const [items, seasons, contributors, personalStates, events] = await Promise.all([
      this.database.items.toArray(),
      this.database.seasons.toArray(),
      this.database.contributors.toArray(),
      this.database.personalStates.toArray(),
      this.database.events.orderBy('occurredAt').reverse().toArray(),
    ]);
    this.itemState.set(items);
    this.seasonState.set(seasons);
    this.contributorState.set(contributors);
    this.personalState.set(personalStates);
    this.eventState.set(events);
    this.ready.set(true);
    this.error.set(null);
    this.dataVersion.update((v) => v + 1);
  }

  // A write that committed must resolve, or the page would ask the user to repeat it, and a
  // repeated log would count a viewing twice. So a failed reload after it only sets `error`.
  private async refresh(): Promise<void> {
    try {
      await this.reload();
    } catch {
      this.error.set("Your changes are saved, but the journal couldn't show them. Please reload.");
    }
  }

  async updatePersonal(
    itemId: LibraryItemId,
    patch: Partial<Omit<PersonalState, 'itemId'>>,
  ): Promise<void> {
    await this.writePersonal(itemId, () => patch);
  }

  async toggleFavorite(itemId: LibraryItemId): Promise<void> {
    await this.writePersonal(itemId, (existing) => ({ favorite: !existing?.favorite }));
  }

  // Reads the entry inside the transaction. A double click starts two toggles before the first
  // reload, so a toggle that read the signals would see the same old value twice.
  private async writePersonal(
    itemId: LibraryItemId,
    change: (existing?: PersonalState) => Partial<Omit<PersonalState, 'itemId'>>,
  ): Promise<void> {
    await this.database.transaction('rw', this.database.personalStates, async () => {
      const existing = await this.database.personalStates.get(itemId);
      await this.database.personalStates.put({
        itemId,
        status: 'saved',
        favorite: false,
        rating: null,
        count: { kind: 'exact', value: 0 },
        ...existing,
        ...change(existing),
      });
    });
    await this.refresh();
  }

  /**
   * Logs a viewing on `date`. A movie or show becomes Watched, and its count goes up by one. An
   * episode counts toward its show, which joins the Library as Watching unless it's already
   * Watching or Watched.
   */
  async logViewing(item: CatalogItem, date: string): Promise<void> {
    if (!isViewingDate(date)) {
      throw new RangeError(`Can't log a viewing on '${date}'. Use a date like 2026-11-11.`);
    }
    if (item.kind === 'episode') {
      await this.logEpisode(item, date);
      return;
    }
    await this.database.transaction(
      'rw',
      this.database.events,
      this.database.personalStates,
      async () => {
        const existing = await this.database.personalStates.get(item.id);
        const count = existing?.count;
        const nextCount =
          count?.kind === 'countless'
            ? count
            : { kind: 'exact' as const, value: (count?.value ?? 0) + 1 };
        await this.database.events.add({
          id: `evt_${crypto.randomUUID()}`,
          itemId: item.id,
          kind: item.kind,
          occurredAt: `${date}T20:00:00.000Z`,
          rating: existing?.rating ?? null,
        });
        await this.database.personalStates.put({
          itemId: item.id,
          favorite: false,
          rating: null,
          ...existing,
          status: 'completed',
          count: nextCount,
        });
      },
    );
    await this.refresh();
  }

  private async logEpisode(
    episode: Extract<CatalogItem, { kind: 'episode' }>,
    date: string,
  ): Promise<void> {
    await this.database.transaction(
      'rw',
      this.database.events,
      this.database.personalStates,
      async () => {
        await this.database.events.add({
          id: `evt_${crypto.randomUUID()}`,
          itemId: episode.id,
          kind: 'episode',
          occurredAt: `${date}T20:00:00.000Z`,
          rating: null,
        });
        const show = await this.database.personalStates.get(episode.showId);
        const started = show?.status === 'in-progress' || show?.status === 'completed';
        if (!started) {
          await this.database.personalStates.put({
            itemId: episode.showId,
            favorite: false,
            rating: null,
            count: { kind: 'exact', value: 0 },
            ...show,
            status: 'in-progress',
          });
        }
      },
    );
    await this.refresh();
  }

  async reset(): Promise<void> {
    await this.database.transaction('rw', this.database.tables, async () => {
      for (const [name, rows] of Object.entries(tasteTrackSeed)) {
        await this.database.table(name).clear();
        await this.database.table(name).bulkAdd(rows);
      }
    });
    await this.refresh();
  }
}
