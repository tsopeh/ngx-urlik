import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { BACKEND_LATENCY, BackendApi } from './backend-api';
import { TasteTrackRepository } from './database';
import type { CatalogItem, PersonalState } from './domain';
import { tasteTrackSeed } from './seed';

class MockTasteTrackRepository {
  readonly itemState = signal(tasteTrackSeed.items);
  readonly seasonState = signal(tasteTrackSeed.seasons);
  readonly contributorState = signal(tasteTrackSeed.contributors);
  readonly personalState = signal(tasteTrackSeed.personalStates);
  readonly eventState = signal(tasteTrackSeed.events);

  readonly items = this.itemState.asReadonly();
  readonly seasons = this.seasonState.asReadonly();
  readonly contributors = this.contributorState.asReadonly();
  readonly personalStates = this.personalState.asReadonly();
  readonly events = this.eventState.asReadonly();
  readonly ready = signal(true);
  readonly error = signal<string | null>(null);
  readonly dataVersion = signal(1);

  async toggleFavorite(itemId: CatalogItem['id']): Promise<void> {
    const states = this.personalStates();
    const existing = states.find((s) => s.itemId === itemId);
    const updated = states.map((s) => (s.itemId === itemId ? { ...s, favorite: !s.favorite } : s));
    if (!existing) {
      updated.push({
        itemId,
        status: 'saved',
        favorite: true,
        rating: null,
        count: { kind: 'exact', value: 0 },
      });
    }
    this.personalState.set(updated);
    this.dataVersion.update((v) => v + 1);
  }

  async updatePersonal(
    itemId: CatalogItem['id'],
    patch: Partial<Omit<PersonalState, 'itemId'>>,
  ): Promise<void> {
    const states = this.personalStates();
    const existing = states.find((s) => s.itemId === itemId);
    const updated = states.map((s) => (s.itemId === itemId ? { ...s, ...patch } : s));
    if (!existing) {
      updated.push({
        itemId,
        status: 'saved',
        favorite: false,
        rating: null,
        count: { kind: 'exact', value: 0 },
        ...patch,
      });
    }
    this.personalState.set(updated);
    this.dataVersion.update((v) => v + 1);
  }

  async logViewing(item: CatalogItem, date: string): Promise<void> {
    this.eventState.set([
      {
        id: `evt_${crypto.randomUUID()}`,
        itemId: item.id,
        kind: item.kind,
        occurredAt: `${date}T20:00:00.000Z`,
        rating: null,
      },
      ...this.eventState(),
    ]);
    this.dataVersion.update((v) => v + 1);
  }
}

describe('BackendApi', () => {
  function setup() {
    TestBed.configureTestingModule({
      providers: [
        { provide: TasteTrackRepository, useClass: MockTasteTrackRepository },
        { provide: BACKEND_LATENCY, useValue: () => 0 },
      ],
    });

    const repository = TestBed.inject(TasteTrackRepository) as unknown as MockTasteTrackRepository;
    const api = TestBed.inject(BackendApi);

    return { repository, api };
  }

  describe('catalog queries', () => {
    it('returns an observable that resolves asynchronously', async () => {
      const { api } = setup();
      let resolvedSynchronously = false;

      const obs$ = api.getCatalog({
        route: 'movies',
        search: '',
        genres: [],
        sort: { field: 'title', direction: 'asc' },
        page: 1,
        pageSize: 12,
      });

      obs$.subscribe(() => {
        resolvedSynchronously = true;
      });

      // Even with no latency, the timer holds the value until the next tick.
      expect(resolvedSynchronously).toBe(false);

      const response = await firstValueFrom(obs$);
      expect(response.total).toBeGreaterThan(0);
      expect(response.items.length).toBeLessThanOrEqual(12);
    });

    it('filters movies by search and genres, and sorts them', async () => {
      const { api } = setup();

      const response = await firstValueFrom(
        api.getCatalog({
          route: 'movies',
          search: 'Inference',
          genres: [],
          sort: { field: 'title', direction: 'asc' },
          page: 1,
          pageSize: 12,
        }),
      );

      expect(response.total).toBe(1);
      expect(response.items[0].item.title).toBe("Quillon's Last Inference");
      expect(response.items[0].state).toBeDefined();
    });

    it('resolves item details including joined credits and season headings', async () => {
      const { api } = setup();

      const movieDetail = await firstValueFrom(
        api.getItemDetail({
          route: 'movie',
          movieId: 'mov_quillons-last-inference',
        }),
      );

      expect(movieDetail).not.toBeNull();
      expect(movieDetail?.heading).toBe("Quillon's Last Inference");
      expect(movieDetail?.credits.length).toBeGreaterThan(0);
      expect(movieDetail?.credits[0].person.name).toBeDefined();

      const showDetail = await firstValueFrom(
        api.getItemDetail({
          route: 'season',
          showId: 'tv_brambleworth-manor',
          seasonNumber: 2,
        }),
      );

      expect(showDetail).not.toBeNull();
      expect(showDetail?.heading).toBe('Brambleworth Manor · Season 2');
      expect(showDetail?.isSeason).toBe(true);
    });

    it('retrieves seasons for a show', async () => {
      const { api } = setup();

      const seasons = await firstValueFrom(api.getSeasons('tv_brambleworth-manor'));
      expect(seasons.length).toBeGreaterThanOrEqual(2);
      expect(seasons[0].showId).toBe('tv_brambleworth-manor');
    });
  });

  describe('library queries', () => {
    it('returns an observable that resolves asynchronously and filters library items', async () => {
      const { api } = setup();
      let resolvedSynchronously = false;

      const obs$ = api.getLibrary({
        search: '',
        media: [],
        statuses: [],
        replayCount: null,
        minRating: null,
        page: 1,
        pageSize: 12,
        sort: { field: 'title', direction: 'asc' },
      });

      obs$.subscribe(() => {
        resolvedSynchronously = true;
      });

      expect(resolvedSynchronously).toBe(false);

      const response = await firstValueFrom(obs$);
      expect(response.total).toBeGreaterThan(0);
      expect(response.items[0].state.status).toBeDefined();
    });

    it('filters by status and min rating', async () => {
      const { api } = setup();

      const response = await firstValueFrom(
        api.getLibrary({
          search: '',
          media: [],
          statuses: ['completed'],
          replayCount: null,
          minRating: 9,
          page: 1,
          pageSize: 24,
          sort: { field: 'rating', direction: 'desc' },
        }),
      );

      expect(response.total).toBeGreaterThan(0);
      expect(response.items.every((card) => card.state.status === 'completed')).toBe(true);
      expect(response.items.every((card) => (card.state.rating ?? 0) >= 9)).toBe(true);
    });
  });

  describe('history queries', () => {
    it('returns an observable that resolves asynchronously and joins catalog items', async () => {
      const { api } = setup();
      let resolvedSynchronously = false;

      const obs$ = api.getHistory({
        search: '',
        from: null,
        to: null,
        page: 1,
        pageSize: 12,
        sort: { field: 'date', direction: 'desc' },
      });

      obs$.subscribe(() => {
        resolvedSynchronously = true;
      });

      expect(resolvedSynchronously).toBe(false);

      const response = await firstValueFrom(obs$);
      expect(response.total).toBeGreaterThan(0);
      expect(response.entries[0].item?.title).toBeDefined();
    });

    it('filters viewing history by title search', async () => {
      const { api } = setup();

      const response = await firstValueFrom(
        api.getHistory({
          search: "Quillon's Last Inference",
          from: null,
          to: null,
          page: 1,
          pageSize: 12,
          sort: { field: 'date', direction: 'desc' },
        }),
      );

      expect(response.total).toBeGreaterThan(0);
      expect(
        response.entries.every((entry) => entry.item?.title.includes("Quillon's Last Inference")),
      ).toBe(true);
    });
  });

  describe('contributor queries', () => {
    it('returns an observable that resolves asynchronously and filters by kind', async () => {
      const { api } = setup();
      let resolvedSynchronously = false;

      const obs$ = api.getContributors('person');
      obs$.subscribe(() => {
        resolvedSynchronously = true;
      });

      expect(resolvedSynchronously).toBe(false);

      const people = await firstValueFrom(obs$);
      expect(people.length).toBeGreaterThan(0);
      expect(people.every((p) => p.kind === 'person')).toBe(true);
    });

    it('resolves contributor profile and filmography', async () => {
      const { api } = setup();

      const profile = await firstValueFrom(api.getContributorProfile('per_wendell'));

      expect(profile).not.toBeNull();
      expect(profile?.contributor.name).toBe('Wendell Marchbank');
      expect(profile?.credits.length).toBeGreaterThan(0);
      expect(profile?.credits[0].item.title).toBeDefined();
    });
  });
});
