import { Component, computed, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { debounce, FormField, minLength } from '@angular/forms/signals';
import { createQueryParamsSignalForm } from 'ngx-urlik/forms';
import { switchMap } from 'rxjs';
import { AppRouter } from './app-router';
import { CatalogLinks } from './catalog-links';
import { experienceCountCodec } from './codecs';
import {
  BackendApi,
  type CatalogItem,
  type LibraryItemCard,
  type LibraryQuery,
  type LibraryStatus,
  type MediaKind,
} from './backend';
import { MediaCard } from './media-card';

@Component({
  imports: [FormField, MediaCard],
  template: `
    <section class="page-stack">
      <header class="page-header">
        <div>
          <p class="eyebrow">Personal archive</p>
          <h1>Your library</h1>
          <p>Your watchlist, ratings, and watched titles.</p>
        </div>
      </header>
      <section class="filter-panel" aria-label="Library filters">
        <label class="search"
          ><span>Search library</span
          ><input type="search" [formField]="binding.form.search" placeholder="Try “inference”…"
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
          <h2>{{ response().total }} collected titles</h2>
        </div>
      </div>
      <div id="favorites" class="media-grid">
        @for (card of response().items; track card.item.id) {
          <app-media-card
            [item]="card.item"
            [state]="card.state"
            [url]="links.item(card.item)"
            (favorite)="toggleFavorite(card.item.id)"
          />
        } @empty {
          <p class="empty">No library items match these filters.</p>
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
          [disabled]="binding.model().page * binding.model().pageSize >= response().total"
          (click)="setPage(binding.model().page + 1)"
        >
          Next
        </button>
      </nav>
    </section>
  `,
})
export class LibraryPage {
  protected readonly links = inject(CatalogLinks);
  protected readonly kinds: readonly MediaKind[] = ['movie', 'show', 'episode'];
  protected readonly statuses: readonly LibraryStatus[] = ['saved', 'in-progress', 'completed'];
  protected readonly routes = inject(AppRouter);
  private readonly backendApi = inject(BackendApi);
  protected readonly binding = createQueryParamsSignalForm(this.routes.routes.LIBRARY, {
    schema: (fields) => {
      debounce(fields.search, 300);
      minLength(fields.search, 3);
    },
    writeWhen: 'valid',
    // Any change other than the page itself starts from the first page, in the same navigation.
    beforeWrite: (patch) =>
      Object.keys(patch).some((field) => field !== 'page') ? { page: 1, ...patch } : patch,
  });
  protected readonly ratings = [6, 7, 8, 9, 10];
  protected readonly pageSizes = [12, 24, 48] as const;

  private readonly request = computed<LibraryQuery>(() => this.binding.model());

  protected readonly response = toSignal(
    toObservable(this.request).pipe(switchMap((req) => this.backendApi.getLibrary(req))),
    {
      initialValue: {
        items: [] as readonly LibraryItemCard[],
        total: 0,
      },
    },
  );

  protected countValue() {
    const count = this.binding.model().replayCount;
    return count ? experienceCountCodec().serialize(count) : '';
  }
  protected setCount(value: string) {
    this.binding.model.update((query) => ({
      ...query,
      replayCount: experienceCountCodec().deserialize(value),
    }));
  }
  protected setSort(field: 'title' | 'rating') {
    this.binding.model.update((query) => ({ ...query, sort: { ...query.sort, field } }));
  }
  protected setDirection(direction: 'asc' | 'desc') {
    this.binding.model.update((query) => ({
      ...query,
      sort: { ...query.sort, direction },
    }));
  }
  protected setPage(page: number) {
    this.binding.model.update((query) => ({ ...query, page }));
  }
  protected toggleMedia(kind: MediaKind) {
    this.binding.model.update((query) => ({
      ...query,
      media: query.media.includes(kind)
        ? query.media.filter((value) => value !== kind)
        : [...query.media, kind],
    }));
  }
  protected toggleStatus(status: LibraryStatus) {
    this.binding.model.update((query) => ({
      ...query,
      statuses: query.statuses.includes(status)
        ? query.statuses.filter((value) => value !== status)
        : [...query.statuses, status],
    }));
  }
  protected setRating(value: string) {
    this.binding.model.update((query) => ({
      ...query,
      minRating: value ? Number(value) : null,
    }));
  }
  protected setPageSize(value: string) {
    this.binding.model.update((query) => ({
      ...query,
      pageSize: Number(value) as 12 | 24 | 48,
    }));
  }
  protected toggleFavorite(id: CatalogItem['id']) {
    void this.backendApi.toggleFavorite(id);
  }
}
