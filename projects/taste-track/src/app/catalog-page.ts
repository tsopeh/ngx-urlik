import { Component, computed, inject } from '@angular/core';
import { AppRouter } from './app-router';
import { TasteTrackRepository } from './database';
import { CatalogLinks } from './catalog-links';
import { MediaCard } from './media-card';
import type { PageSize } from './codecs';

@Component({
  imports: [MediaCard],
  template: `
    <section class="page-stack inset">
      <div class="section-heading">
        <div>
          <h2>{{ heading() }}</h2>
          <p>{{ results().length }} titles</p>
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
        @for (item of visible(); track item.id) {
          <app-media-card
            [item]="item"
            [state]="stateFor(item.id)"
            [url]="links.item(item)"
            (favorite)="repository.toggleFavorite(item.id)"
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
          [disabled]="query().page * query().pageSize >= results().length"
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
  protected readonly repository = inject(TasteTrackRepository);
  protected readonly links = inject(CatalogLinks);
  private readonly params = this.routes.ROOT.SCREEN.urlParams();
  private readonly active = this.routes.activeRoute({
    episodes: this.routes.ROOT.SCREEN.SHOWS.DETAIL.SEASONS.DETAIL.EPISODES,
    movies: this.routes.ROOT.SCREEN.MOVIES,
    shows: this.routes.ROOT.SCREEN.SHOWS,
  });
  protected readonly genres = ['Drama', 'Comedy', 'Science fiction', 'Mystery'];
  protected readonly query = computed(() => this.params.value().query);
  protected readonly heading = computed(
    () =>
      ({ episodes: 'Episodes', movies: 'Movies', shows: 'TV shows' })[this.active.value().route],
  );
  protected readonly results = computed(() => {
    const active = this.active.value();
    const query = this.query();
    return this.repository
      .items()
      .filter((item) => {
        const inBranch =
          active.route === 'episodes'
            ? item.kind === 'episode' &&
              item.showId === active.params.path.showId &&
              item.seasonNumber === active.params.path.seasonNumber
            : item.kind === (active.route === 'movies' ? 'movie' : 'show');
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
  });
  protected readonly visible = computed(() =>
    this.results().slice(
      (this.query().page - 1) * this.query().pageSize,
      this.query().page * this.query().pageSize,
    ),
  );
  protected update(patch: Partial<ReturnType<typeof this.query>>) {
    void this.params.updateQueryParams((query) => ({ ...query, ...patch }), { replaceUrl: true });
  }
  protected sort(field: 'title' | 'year') {
    this.update({ sort: { ...this.query().sort, field }, page: 1 });
  }
  protected direction(direction: 'asc' | 'desc') {
    this.update({ sort: { ...this.query().sort, direction }, page: 1 });
  }
  protected pageSize(value: string) {
    this.update({ pageSize: Number(value) as PageSize, page: 1 });
  }
  protected toggleGenre(genre: string) {
    const genres = this.query().genres;
    this.update({
      genres: genres.includes(genre)
        ? genres.filter((value) => value !== genre)
        : [...genres, genre],
      page: 1,
    });
  }
  protected stateFor(id: string) {
    return this.repository.personalStates().find((state) => state.itemId === id);
  }
}
