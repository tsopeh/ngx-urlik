import { Component, computed, inject } from '@angular/core';
import { createQueryParamsSignalForm } from 'ngx-urlik/forms';
import { AppRouter } from './app-router';
import { TasteTrackRepository } from './database';
import type { CatalogItem } from './domain';
import { MediaCard } from './media-card';

@Component({
  imports: [MediaCard],
  template: `
    <section class="page-stack">
      <header class="page-header">
        <div>
          <p class="eyebrow">Personal archive</p>
          <h1>Your collection</h1>
          <p>Every filter, sort, and page is restored from the typed URL.</p>
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
              <option [value]="rating">{{ rating }}+</option>
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
              <option [value]="size">{{ size }}</option>
            }
          </select></label
        >
      </section>
      <div class="section-heading">
        <div>
          <p class="eyebrow">URL-owned results</p>
          <h2>{{ filtered().length }} collected works</h2>
        </div>
        <code>page={{ binding.model().page }} · {{ sortLabel() }}</code>
      </div>
      <div id="favorites" class="media-grid">
        @for (item of visible(); track item.id) {
          <app-media-card
            [item]="item"
            [state]="stateFor(item.id)"
            [url]="urlFor(item)"
            (favorite)="toggleFavorite(item.id)"
          />
        } @empty {
          <p class="empty">No collection items match these filters.</p>
        }
      </div>
    </section>
  `,
})
export class CollectionPage {
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
    return this.repository.items().filter((item) => {
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
      return true;
    });
  });
  protected readonly visible = computed(() => {
    const query = this.binding.model();
    const start = (query.page - 1) * query.pageSize;
    return this.filtered().slice(start, start + query.pageSize);
  });
  protected readonly sortLabel = computed(
    () => `${this.binding.model().sort.field} ${this.binding.model().sort.direction}`,
  );
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
  protected urlFor(item: CatalogItem) {
    if (item.kind === 'movie')
      return this.routes.ROOT.SCREEN.MOVIES.DETAIL.createUrlTree({
        path: { movieId: item.id as `mov_${string}` },
      });
    if (item.kind === 'show')
      return this.routes.ROOT.SCREEN.SHOWS.DETAIL.createUrlTree({
        path: { showId: item.id as `tv_${string}` },
      });
    if (item.kind === 'album')
      return this.routes.ROOT.MUSIC.ALBUMS.DETAIL.createUrlTree({
        path: { albumId: item.id as `alb_${string}` },
      });
    if (item.kind === 'song')
      return this.routes.ROOT.MUSIC.SONGS.DETAIL.createUrlTree({
        path: { songId: item.id as `song_${string}` },
      });
    if (item.kind === 'theatre')
      return this.routes.ROOT.THEATRE.PRODUCTIONS.DETAIL.createUrlTree({
        path: { productionId: item.id as `prod_${string}` },
      });
    return null;
  }
}
