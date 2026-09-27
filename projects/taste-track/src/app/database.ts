import { Injectable, signal } from '@angular/core';
import Dexie, { type EntityTable } from 'dexie';
import type { CatalogItem, Contributor, JournalEvent, PersonalState, Season } from './domain';
import { tasteTrackSeed } from './seed';

class TasteTrackDatabase extends Dexie {
  readonly items!: EntityTable<CatalogItem, 'id'>;
  readonly seasons!: EntityTable<Season, 'id'>;
  readonly contributors!: EntityTable<Contributor, 'id'>;
  readonly personalStates!: EntityTable<PersonalState, 'itemId'>;
  readonly events!: EntityTable<JournalEvent, 'id'>;

  constructor() {
    super('taste-track');
    this.version(1).stores({
      items: 'id, kind, year, showId, [showId+seasonNumber+episodeNumber], *genres',
      seasons: 'id, [showId+number]',
      contributors: 'id, kind, name',
      personalStates: 'itemId, status, favorite, rating',
      events: 'id, itemId, occurredAt, rating',
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
  }

  async updatePersonal(
    itemId: CatalogItem['id'],
    patch: Partial<Omit<PersonalState, 'itemId'>>,
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
        ...patch,
      });
    });
    await this.reload();
  }

  async toggleFavorite(itemId: CatalogItem['id']): Promise<void> {
    await this.updatePersonal(itemId, {
      favorite: !this.personalStates().find((state) => state.itemId === itemId)?.favorite,
    });
  }

  async logViewing(item: CatalogItem, date: string): Promise<void> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date))) return;
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
    await this.reload();
  }

  async reset(): Promise<void> {
    await this.database.transaction('rw', this.database.tables, async () => {
      for (const [name, rows] of Object.entries(tasteTrackSeed)) {
        await this.database.table(name).clear();
        await this.database.table(name).bulkAdd(rows);
      }
    });
    await this.reload();
  }
}
