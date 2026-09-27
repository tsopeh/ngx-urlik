import { Component, computed, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import type { RouteQueryPatch } from 'ngx-urlik';
import { switchMap } from 'rxjs';
import { AppRouter } from './app-router';
import { CatalogApiService, type CatalogItemCard, type CatalogQuery } from './catalog-api';
import { CatalogLinks } from './catalog-links';
import type { PageSize } from './codecs';
import type { CatalogItem } from './domain';
import { MediaCard } from './media-card';

@Component({
  imports: [MediaCard],
  template: `
    <section class="page-stack inset">
      <div class="section-heading">
        <div>
          <h2>{{ heading() }}</h2>
          <p>{{ response().total }} titles</p>
        </div>
      </div>
      <div class="filter-panel">
        <label
          >Search<input
            type="search"
            [value]="query().search"
            (input)="update({ search: $any($event.target).value, page: 1 })"
            placeholder="Search titles…"
        /></label>
        <label
          >Sort<select [value]="query().sort.field" (change)="sort($any($event.target).value)">
            <option value="title">Title</option>
            <option value="year">Year</option>
          </select></label
        >
        <label
          >Direction<select
            [value]="query().sort.direction"
            (change)="direction($any($event.target).value)"
          >
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select></label
        >
        <label
          >Page size<select
            [value]="query().pageSize"
            (change)="pageSize($any($event.target).value)"
          >
            <option>12</option>
            <option>24</option>
            <option>48</option>
          </select></label
        >
      </div>
      <div class="chip-row" aria-label="Quick genre filters">
        @for (genre of genres; track genre) {
          <button
            type="button"
            [class.selected]="query().genres.includes(genre)"
            [attr.aria-pressed]="query().genres.includes(genre)"
            (click)="toggleGenre(genre)"
          >
            {{ genre }}
          </button>
        }
      </div>
      <div class="media-grid">
        @for (card of response().items; track card.item.id) {
          <app-media-card
            [item]="card.item"
            [state]="card.state"
            [url]="links.item(card.item)"
            (favorite)="toggleFavorite(card.item.id)"
          />
        } @empty {
          <p class="empty">No titles match these filters.</p>
        }
      </div>
      <nav class="anchor-links" aria-label="Pagination">
        <button
          class="button"
          [disabled]="query().page <= 1"
          (click)="update({ page: query().page - 1 })"
        >
          Previous
        </button>
        <span>Page {{ query().page }}</span>
        <button
          class="button"
          [disabled]="query().page * query().pageSize >= response().total"
          (click)="update({ page: query().page + 1 })"
        >
          Next
        </button>
      </nav>
    </section>
  `,
})
export class CatalogPage {
  private readonly routes = inject(AppRouter);
  private readonly catalogApi = inject(CatalogApiService);
  protected readonly links = inject(CatalogLinks);
  private readonly route = this.routes.routes.SCREEN;
  private readonly active = this.routes.activeRoute({
    episodes: this.routes.routes.EPISODES,
    movies: this.routes.routes.MOVIES,
    shows: this.routes.routes.SHOWS,
  });
  protected readonly genres = ['Drama', 'Comedy', 'Science fiction', 'Mystery'];
  protected readonly query = computed(() => this.route.params().query);
  protected readonly heading = computed(
    () => ({ episodes: 'Episodes', movies: 'Movies', shows: 'TV shows' })[this.active().route],
  );

  private readonly request = computed<CatalogQuery>(() => {
    const active = this.active();
    return {
      route: active.route,
      showId: active.route === 'episodes' ? active.params.path.showId : undefined,
      seasonNumber: active.route === 'episodes' ? active.params.path.seasonNumber : undefined,
      ...this.query(),
    };
  });

  protected readonly response = toSignal(
    toObservable(this.request).pipe(switchMap((req) => this.catalogApi.getCatalog(req))),
    {
      initialValue: {
        items: [] as readonly CatalogItemCard[],
        total: 0,
      },
    },
  );

  protected update(patch: RouteQueryPatch<typeof this.route>) {
    void this.route.patchQuery(patch, { replaceUrl: true });
  }
  protected sort(field: 'title' | 'year') {
    this.update((query) => ({ sort: { ...query.sort, field }, page: 1 }));
  }
  protected direction(direction: 'asc' | 'desc') {
    this.update((query) => ({ sort: { ...query.sort, direction }, page: 1 }));
  }
  protected pageSize(value: string) {
    this.update({ pageSize: Number(value) as PageSize, page: 1 });
  }
  protected toggleGenre(genre: string) {
    this.update(({ genres }) => ({
      genres: genres.includes(genre)
        ? genres.filter((value) => value !== genre)
        : [...genres, genre],
      page: 1,
    }));
  }
  protected toggleFavorite(id: CatalogItem['id']) {
    void this.catalogApi.toggleFavorite(id);
  }
}
