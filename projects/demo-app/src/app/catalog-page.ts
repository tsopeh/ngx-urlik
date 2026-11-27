import { Component, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { debounce, FormField } from '@angular/forms/signals';
import type { QueryPatchOf, RoutesOf } from 'ngx-urlik';
import { createQueryParamsSignalForm } from 'ngx-urlik/forms';
import { AppRouter } from './app-router';
import { BackendApi, type CatalogItem, type CatalogQuery } from './backend';
import { CatalogLinks } from './catalog-links';
import { EventLog } from './inspector/event-log';
import type { PageSize } from './codecs';
import { LoadingIndicator } from './loading-indicator';
import { MediaCard } from './media-card';
import { Preferences } from './preferences';
import { withPreviousValue } from './with-previous-value';

type Routes = RoutesOf<typeof AppRouter>;

const headings = { episodes: 'Episodes', movies: 'Movies', shows: 'TV shows' } as const;

@Component({
  imports: [FormField, LoadingIndicator, MediaCard],
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
        <app-loading-indicator [active]="titles.isLoading()" />
      </div>
      <div class="filter-panel">
        <label
          >Search<input
            type="search"
            [formField]="binding.form.search"
            placeholder="Search titles…"
        /></label>
        <label
          >Sort<select
            [value]="binding.model().sort.field"
            (change)="setSort($any($event.target).value)"
          >
            <option value="title">Title</option>
            <option value="year">Year</option>
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
            [class.selected]="binding.model().genres.includes(genre)"
            [attr.aria-pressed]="binding.model().genres.includes(genre)"
            (click)="toggleGenre(genre)"
          >
            {{ genre }}
          </button>
        }
      </div>
      <div class="media-grid" [attr.aria-busy]="titles.isLoading()">
        @if (response(); as loaded) {
          @for (card of loaded.items; track card.item.id) {
            <app-media-card
              [item]="card.item"
              [state]="card.state"
              [url]="links.item(card.item)"
              (favorite)="toggleFavorite(card.item)"
            />
          } @empty {
            <p class="empty">No titles match these filters.</p>
          }
        }
      </div>
      <nav class="anchor-links" aria-label="Pagination">
        <button
          class="button"
          [disabled]="binding.model().page <= 1"
          (click)="setPage(binding.model().page - 1)"
        >
          Previous
        </button>
        <span>Page {{ binding.model().page }}</span>
        <button
          class="button"
          [disabled]="binding.model().page * pageSize() >= (response()?.total ?? 0)"
          (click)="setPage(binding.model().page + 1)"
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
  private readonly log = inject(EventLog);
  private readonly route = this.routes.BROWSE;
  protected readonly binding = createQueryParamsSignalForm(this.route, {
    schema: (fields) => debounce(fields.search, 300),
    // Any change other than the page itself starts from the first page, in the same navigation.
    beforeWrite: this.log.formWrite('Catalog form', (patch) => {
      const changesMoreThanPage = Object.keys(patch).some((field) => field !== 'page');
      return changesMoreThanPage ? { page: 1, ...patch } : patch;
    }),
  });
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
  protected readonly pageSize = computed(() =>
    this.preferences.pageSize(this.binding.model().pageSize),
  );
  protected readonly heading = computed(() => headings[this.catalog().route]);

  private readonly request = computed<CatalogQuery>(() => {
    return {
      ...this.catalog(),
      ...this.query(),
      pageSize: this.pageSize(),
    };
  });

  protected readonly titles = withPreviousValue(
    rxResource({
      params: this.request,
      stream: ({ params }) => this.backendApi.getCatalog(params),
    }),
  );
  protected readonly response = this.titles.value;

  constructor() {
    this.log.watchSignalForm('Catalog form', this.binding.form, () => this.query());
  }

  protected setSort(field: 'title' | 'year') {
    this.edit({ sort: { ...this.binding.model().sort, field } });
  }
  protected setDirection(direction: 'asc' | 'desc') {
    this.edit({ sort: { ...this.binding.model().sort, direction } });
  }
  protected setPageSize(value: string) {
    this.edit({ pageSize: Number(value) as PageSize });
  }
  protected setPage(page: number) {
    this.edit({ page });
  }
  protected toggleGenre(genre: string) {
    const { genres } = this.binding.model();
    this.edit({
      genres: genres.includes(genre)
        ? genres.filter((value) => value !== genre)
        : [...genres, genre],
    });
  }
  // Episode cards have no favorite button: an episode counts toward its show.
  protected toggleFavorite(item: CatalogItem) {
    if (item.kind !== 'episode') {
      void this.backendApi.toggleFavorite(item.id);
    }
  }

  // Every control changes the model, and the binding decides when the URL follows.
  private edit(change: QueryPatchOf<Routes['BROWSE']>) {
    this.binding.model.update((query) => ({ ...query, ...change }));
  }
}
