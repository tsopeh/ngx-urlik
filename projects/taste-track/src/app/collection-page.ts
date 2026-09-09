import { Component, computed, inject } from '@angular/core';
import { createQueryParamsSignalForm } from 'ngx-urlik/forms';
import { AppRouter } from './app-router';
import { TasteTrackRepository } from './database';
import type { CatalogItem } from './domain';
import { MediaCard } from './media-card';
import { CatalogLinks } from './catalog-links';
import { experienceCountCodec } from './codecs';
import type { CollectionStatus, MediaKind } from './domain';

@Component({
  imports: [MediaCard],
  template: `
    <section class="page-stack">
      <header class="page-header">
        <div>
          <p class="eyebrow">Personal archive</p>
          <h1>Your collection</h1>
          <p>Your watchlist, ratings, and watched titles.</p>
        </div>
      </header>
      <section class="filter-panel" aria-label="Collection filters">
        <label class="search"
          ><span>Search collection</span
          ><input
            type="search"
            [value]="binding.model().search"
            (input)="setSearch($any($event.target).value)"
            placeholder="Try “algorithm”…"
        /></label>
        <label
          ><span>Minimum rating</span
          ><select
            [value]="binding.model().minRating ?? ''"
            (change)="setRating($any($event.target).value)"
          >
            <option value="">Any rating</option>
            @for (rating of ratings; track rating) {
              <option [value]="rating" [selected]="binding.model().minRating === rating">
                {{ rating }}+
              </option>
            }
          </select></label
        >
        <label
          ><span>Page size</span
          ><select
            [value]="binding.model().pageSize"
            (change)="setPageSize($any($event.target).value)"
          >
            @for (size of pageSizes; track size) {
              <option [value]="size" [selected]="binding.model().pageSize === size">
                {{ size }}
              </option>
            }
          </select></label
        >
        <label
          >Sort<select
            [value]="binding.model().sort.field"
            (change)="setSort($any($event.target).value)"
          >
            <option value="title">Title</option>
            <option value="rating">Rating</option>
          </select></label
        >
        <label
          >Direction<select
            [value]="binding.model().sort.direction"
            (change)="setDirection($any($event.target).value)"
          >
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select></label
        >
        <label
          >Viewing count<select
            [value]="countValue()"
            (change)="setCount($any($event.target).value)"
          >
            <option value="">Any count</option>
            <option value="0">Not watched</option>
            <option value="1">Once</option>
            <option value="countless">More than I can count</option>
          </select></label
        >
      </section>
      <div class="chip-row" aria-label="Media filters">
        @for (kind of kinds; track kind) {
          <button
            [class.selected]="binding.model().media.includes(kind)"
            [attr.aria-pressed]="binding.model().media.includes(kind)"
            (click)="toggleMedia(kind)"
          >
            {{ kind }}
          </button>
        }
      </div>
      <div class="chip-row" aria-label="Status filters">
        @for (status of statuses; track status) {
          <button
            [class.selected]="binding.model().statuses.includes(status)"
            [attr.aria-pressed]="binding.model().statuses.includes(status)"
            (click)="toggleStatus(status)"
          >
            {{
              status === 'saved' ? 'Watchlist' : status === 'in-progress' ? 'Watching' : 'Watched'
            }}
          </button>
        }
      </div>
      <div class="section-heading">
        <div>
          <p class="eyebrow">Your titles</p>
          <h2>{{ filtered().length }} collected titles</h2>
        </div>
      </div>
      <div id="favorites" class="media-grid">
        @for (item of visible(); track item.id) {
          <app-media-card
            [item]="item"
            [state]="stateFor(item.id)"
            [url]="links.item(item)"
            (favorite)="toggleFavorite(item.id)"
          />
        } @empty {
          <p class="empty">No collection items match these filters.</p>
        }
      </div>
      <nav class="anchor-links" aria-label="Pagination">
        <button
          class="button"
          [disabled]="binding.model().page <= 1"
          (click)="setPage(binding.model().page - 1)"
        >
          Previous</button
        ><span>Page {{ binding.model().page }}</span
        ><button
          class="button"
          [disabled]="binding.model().page * binding.model().pageSize >= filtered().length"
          (click)="setPage(binding.model().page + 1)"
        >
          Next
        </button>
      </nav>
    </section>
  `,
})
export class CollectionPage {
  protected readonly links = inject(CatalogLinks);
  protected readonly kinds: readonly MediaKind[] = ['movie', 'show', 'episode'];
  protected readonly statuses: readonly CollectionStatus[] = ['saved', 'in-progress', 'completed'];
  protected readonly routes = inject(AppRouter);
  private readonly repository = inject(TasteTrackRepository);
  protected readonly binding = createQueryParamsSignalForm(this.routes.ROOT.COLLECTION);
  protected readonly ratings = [6, 7, 8, 9, 10];
  protected readonly pageSizes = [12, 24, 48] as const;
  private readonly stateMap = computed(
    () => new Map(this.repository.personalStates().map((state) => [state.itemId, state])),
  );
  protected readonly filtered = computed(() => {
    const query = this.binding.model();
    return this.repository
      .items()
      .filter((item) => {
        const state = this.stateMap().get(item.id);
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
            : (this.stateMap().get(a.id)?.rating ?? 0) - (this.stateMap().get(b.id)?.rating ?? 0)) *
          (query.sort.direction === 'asc' ? 1 : -1),
      );
  });
  protected readonly visible = computed(() => {
    const query = this.binding.model();
    const start = (query.page - 1) * query.pageSize;
    return this.filtered().slice(start, start + query.pageSize);
  });
  protected countValue() {
    const count = this.binding.model().replayCount;
    return count ? experienceCountCodec().serialize(count) : '';
  }
  protected setCount(value: string) {
    this.binding.model.update((query) => ({
      ...query,
      replayCount: experienceCountCodec().deserialize(value),
      page: 1,
    }));
  }
  protected setSort(field: 'title' | 'rating') {
    this.binding.model.update((query) => ({ ...query, sort: { ...query.sort, field }, page: 1 }));
  }
  protected setDirection(direction: 'asc' | 'desc') {
    this.binding.model.update((query) => ({
      ...query,
      sort: { ...query.sort, direction },
      page: 1,
    }));
  }
  protected setPage(page: number) {
    this.binding.model.update((query) => ({ ...query, page }));
  }
  protected toggleMedia(kind: MediaKind) {
    this.binding.model.update((query) => ({
      ...query,
      page: 1,
      media: query.media.includes(kind)
        ? query.media.filter((value) => value !== kind)
        : [...query.media, kind],
    }));
  }
  protected toggleStatus(status: CollectionStatus) {
    this.binding.model.update((query) => ({
      ...query,
      page: 1,
      statuses: query.statuses.includes(status)
        ? query.statuses.filter((value) => value !== status)
        : [...query.statuses, status],
    }));
  }
  protected setSearch(search: string) {
    this.binding.model.update((query) => ({ ...query, search, page: 1 }));
  }
  protected setRating(value: string) {
    this.binding.model.update((query) => ({
      ...query,
      minRating: value ? Number(value) : null,
      page: 1,
    }));
  }
  protected setPageSize(value: string) {
    this.binding.model.update((query) => ({
      ...query,
      pageSize: Number(value) as 12 | 24 | 48,
      page: 1,
    }));
  }
  protected stateFor(id: string) {
    return this.stateMap().get(id as CatalogItem['id']);
  }
  protected toggleFavorite(id: CatalogItem['id']) {
    void this.repository.toggleFavorite(id);
  }
}
