import { Injectable, computed, signal } from '@angular/core';
import Dexie, { type EntityTable } from 'dexie';
import type { CatalogItem, Contributor, JournalEvent, PersonalState, PersonalTag } from './domain';
import { tasteTrackSeed } from './seed';

class TasteTrackDatabase extends Dexie {
  readonly items!: EntityTable<CatalogItem, 'id'>;
  readonly contributors!: EntityTable<Contributor, 'id'>;
  readonly tags!: EntityTable<PersonalTag, 'id'>;
  readonly personalStates!: EntityTable<PersonalState, 'itemId'>;
  readonly events!: EntityTable<JournalEvent, 'id'>;

  constructor() {
    super('taste-track-demo');
    this.version(1).stores({
      items: 'id, kind, year, featured, parentId, *genres, *contributorIds',
      contributors: 'id, kind, name, *roles',
      tags: 'id, name',
      personalStates: 'itemId, status, favorite, rating, *tagIds',
      events: 'id, itemId, kind, occurredAt, rating',
    });
    this.on('populate', (transaction) =>
      Promise.all([
        transaction.table('items').bulkAdd(tasteTrackSeed.items),
        transaction.table('contributors').bulkAdd(tasteTrackSeed.contributors),
        transaction.table('tags').bulkAdd(tasteTrackSeed.tags),
        transaction.table('personalStates').bulkAdd(tasteTrackSeed.personalStates),
        transaction.table('events').bulkAdd(tasteTrackSeed.events),
      ]),
    );
  }
}

@Injectable({ providedIn: 'root' })
export class TasteTrackRepository {
  private readonly database = new TasteTrackDatabase();
  private readonly itemState = signal<readonly CatalogItem[]>([]);
  private readonly contributorState = signal<readonly Contributor[]>([]);
  private readonly tagState = signal<readonly PersonalTag[]>([]);
  private readonly personalState = signal<readonly PersonalState[]>([]);
  private readonly eventState = signal<readonly JournalEvent[]>([]);

  readonly items = this.itemState.asReadonly();
  readonly contributors = this.contributorState.asReadonly();
  readonly tags = this.tagState.asReadonly();
  readonly personalStates = this.personalState.asReadonly();
  readonly events = this.eventState.asReadonly();
  readonly ready = signal(false);
  readonly favorites = computed(() => {
    const favoriteIds = new Set(
      this.personalStates()
        .filter((state) => state.favorite)
        .map((state) => state.itemId),
    );
    return this.items().filter((item) => favoriteIds.has(item.id));
  });

  constructor() {
    void this.reload();
  }

  async reload(): Promise<void> {
    const [items, contributors, tags, personalStates, events] = await Promise.all([
      this.database.items.toArray(),
      this.database.contributors.toArray(),
      this.database.tags.toArray(),
      this.database.personalStates.toArray(),
      this.database.events.orderBy('occurredAt').reverse().toArray(),
    ]);
    this.itemState.set(items);
    this.contributorState.set(contributors);
    this.tagState.set(tags);
    this.personalState.set(personalStates);
    this.eventState.set(events);
    this.ready.set(true);
  }

  async toggleFavorite(itemId: CatalogItem['id']): Promise<void> {
    const existing = await this.database.personalStates.get(itemId);
    const next: PersonalState = existing
      ? { ...existing, favorite: !existing.favorite }
      : {
          itemId,
          status: 'saved',
          favorite: true,
          rating: null,
          count: { kind: 'exact', value: 0 },
          notes: '',
          tagIds: [],
        };
    await this.database.personalStates.put(next);
    await this.reload();
  }

  async reset(): Promise<void> {
    await this.database.transaction('rw', this.database.tables, async () => {
      await Promise.all(this.database.tables.map((table) => table.clear()));
      await this.database.items.bulkAdd(tasteTrackSeed.items);
      await this.database.contributors.bulkAdd(tasteTrackSeed.contributors);
      await this.database.tags.bulkAdd(tasteTrackSeed.tags);
      await this.database.personalStates.bulkAdd(tasteTrackSeed.personalStates);
      await this.database.events.bulkAdd(tasteTrackSeed.events);
    });
    await this.reload();
  }
}
