import { Component, computed, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import type { RouteQueryPatch } from 'ngx-urlik';
import { switchMap } from 'rxjs';
import { AppRouter } from './app-router';
import { Preferences } from './preferences';
import { BackendApi, type CatalogItem, type CatalogQuery } from './backend';
import { CatalogLinks } from './catalog-links';
import type { PageSize } from './codecs';
import { MediaCard } from './media-card';

const headings = { episodes: 'Episodes', movies: 'Movies', shows: 'TV shows' } as const;

@Component({
  imports: [MediaCard],
  template: `
    <section class="page-stack inset">
      <div class="section-heading">
        <div>
          <h2>{{ heading() }}</h2>
          <p>
            @if (response(); as loaded) {
              {{ loaded.total }} titles
            } @else {
              &nbsp;
            }
          </p>
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
          >Page size<select [value]="pageSize()" (change)="setPageSize($any($event.target).value)">
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
      <div class="media-grid" [attr.aria-busy]="!response()">
        @if (response(); as loaded) {
          @for (card of loaded.items; track card.item.id) {
            <app-media-card
              [item]="card.item"
              [state]="card.state"
              [url]="links.item(card.item)"
              (favorite)="toggleFavorite(card.item.id)"
            />
          } @empty {
            <p class="empty">No titles match these filters.</p>
          }
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
          [disabled]="query().page * pageSize() >= (response()?.total ?? 0)"
          (click)="update({ page: query().page + 1 })"
        >
          Next
        </button>
      </nav>
    </section>
  `,
})
export class CatalogPage {
  private readonly routes = inject(AppRouter).routes;
  private readonly backendApi = inject(BackendApi);
  private readonly preferences = inject(Preferences);
  protected readonly links = inject(CatalogLinks);
  private readonly route = this.routes.BROWSE;
  private readonly catalog = computed(() => {
    const episodes = this.routes.EPISODES.ifActive();
    if (episodes) {
      const { showId, seasonNumber } = episodes.params().path;
      return { route: 'episodes', showId, seasonNumber } as const;
    }
    return { route: this.routes.SHOWS.ifActive() ? 'shows' : 'movies' } as const;
  });
  protected readonly genres = ['Drama', 'Comedy', 'Science fiction', 'Mystery'];
  protected readonly query = computed(() => this.route.params().query);
  protected readonly pageSize = computed(() => this.preferences.pageSize(this.query().pageSize));
  protected readonly heading = computed(() => headings[this.catalog().route]);

  private readonly request = computed<CatalogQuery>(() => {
    return {
      ...this.catalog(),
      ...this.query(),
      pageSize: this.pageSize(),
    };
  });

  protected readonly response = toSignal(
    toObservable(this.request).pipe(switchMap((req) => this.backendApi.getCatalog(req))),
  );

  protected update(patch: RouteQueryPatch<typeof this.route>) {
    void this.route.patchQuery(patch, { replaceUrl: true });
  }
  protected sort(field: 'title' | 'year') {
    this.update({ sort: { ...this.query().sort, field }, page: 1 });
  }
  protected direction(direction: 'asc' | 'desc') {
    this.update({ sort: { ...this.query().sort, direction }, page: 1 });
  }
  protected setPageSize(value: string) {
    this.update({ pageSize: Number(value) as PageSize, page: 1 });
  }
  protected toggleGenre(genre: string) {
    const { genres } = this.query();
    this.update({
      genres: genres.includes(genre)
        ? genres.filter((value) => value !== genre)
        : [...genres, genre],
      page: 1,
    });
  }
  protected toggleFavorite(id: CatalogItem['id']) {
    void this.backendApi.toggleFavorite(id);
  }
}
