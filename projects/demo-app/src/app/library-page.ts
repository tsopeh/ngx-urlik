import { Component, computed, inject, linkedSignal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { debounce, FormField, minLength } from '@angular/forms/signals';
import { createQueryParamsSignalForm, type QueryWriteFailure } from 'ngx-urlik/forms';
import { AppRouter } from './app-router';
import { Preferences } from './preferences';
import { CatalogLinks } from './catalog-links';
import { LoadingIndicator } from './loading-indicator';
import { withPreviousValue } from './with-previous-value';
import { experienceCountCodec, type PageSize } from './codecs';
import {
  BackendApi,
  type CatalogItem,
  type LibraryQuery,
  type LibraryStatus,
  type MediaKind,
} from './backend';
import { MediaCard } from './media-card';
import { statusLabels } from './status-labels';

@Component({
  imports: [FormField, LoadingIndicator, MediaCard],
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
          ><select [value]="pageSize()" (change)="setPageSize($any($event.target).value)">
            @for (size of pageSizes; track size) {
              <option [value]="size" [selected]="pageSize() === size">
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
            {{ statusLabels[status] }}
          </button>
        }
      </div>
      @if (writeFailure(); as message) {
        <p role="alert">{{ message }}</p>
      }
      <div class="section-heading">
        <div>
          <p class="eyebrow">Your titles</p>
          <h2>
            @if (response(); as loaded) {
              {{ loaded.total }} collected titles
            } @else {
              Collected titles
            }
          </h2>
        </div>
        <app-loading-indicator [active]="library.isLoading()" />
      </div>
      <div id="favorites" class="media-grid" [attr.aria-busy]="library.isLoading()">
        @if (response(); as loaded) {
          @for (card of loaded.items; track card.item.id) {
            <app-media-card
              [item]="card.item"
              [state]="card.state"
              [url]="links.item(card.item)"
              (favorite)="toggleFavorite(card.item.id)"
            />
          } @empty {
            <p class="empty">No library items match these filters.</p>
          }
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
          [disabled]="binding.model().page * pageSize() >= (response()?.total ?? 0)"
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
  protected readonly statusLabels = statusLabels;
  private readonly routes = inject(AppRouter).routes;
  private readonly backendApi = inject(BackendApi);
  private readonly preferences = inject(Preferences);
  protected readonly binding = createQueryParamsSignalForm(this.routes.LIBRARY, {
    schema: (fields) => {
      debounce(fields.search, 300);
      minLength(fields.search, 3);
    },
    // Any change other than the page itself starts from the first page, in the same navigation.
    beforeWrite: (patch) => {
      const changesMoreThanPage = Object.keys(patch).some((field) => field !== 'page');
      return changesMoreThanPage ? { page: 1, ...patch } : patch;
    },
    onWriteFailure: (failure) => this.writeFailure.set(describeFailure(failure)),
  });
  // A failed write leaves the URL as it was, so the message stays until the URL changes.
  protected readonly writeFailure = linkedSignal({
    source: () => this.routes.LIBRARY.params(),
    computation: () => '',
  });
  protected readonly ratings = [6, 7, 8, 9, 10];
  protected readonly pageSizes = [12, 24, 48] as const;

  protected readonly pageSize = computed(() =>
    this.preferences.pageSize(this.binding.model().pageSize),
  );
  // The list shows what's in the URL. The model also holds drafts, like a search too short to write.
  private readonly request = computed<LibraryQuery>(() => {
    const query = this.routes.LIBRARY.params().query;
    return { ...query, pageSize: this.preferences.pageSize(query.pageSize) };
  });

  protected readonly library = withPreviousValue(
    rxResource({
      params: this.request,
      stream: ({ params }) => this.backendApi.getLibrary(params),
    }),
  );
  protected readonly response = this.library.value;

  protected countValue() {
    const count = this.binding.model().replayCount;
    return count ? experienceCountCodec().serialize(count) : '';
  }
  protected setCount(value: string) {
    this.edit({ replayCount: experienceCountCodec().deserialize(value) });
  }
  protected setSort(field: 'title' | 'rating') {
    this.edit({ sort: { ...this.binding.model().sort, field } });
  }
  protected setDirection(direction: 'asc' | 'desc') {
    this.edit({ sort: { ...this.binding.model().sort, direction } });
  }
  protected setPage(page: number) {
    this.edit({ page });
  }
  protected toggleMedia(kind: MediaKind) {
    this.edit({ media: toggled(this.binding.model().media, kind) });
  }
  protected toggleStatus(status: LibraryStatus) {
    this.edit({ statuses: toggled(this.binding.model().statuses, status) });
  }
  protected setRating(value: string) {
    this.edit({ minRating: value ? Number(value) : null });
  }
  protected setPageSize(value: string) {
    this.edit({ pageSize: Number(value) as PageSize });
  }
  protected toggleFavorite(id: CatalogItem['id']) {
    void this.backendApi.toggleFavorite(id);
  }

  // Every control changes the model, and the binding decides when the URL follows.
  private edit(change: Partial<ReturnType<typeof this.binding.model>>) {
    this.binding.model.update((query) => ({ ...query, ...change }));
  }
}

function describeFailure(failure: QueryWriteFailure): string {
  return failure.kind === 'declined'
    ? 'A guard declined this filter change, so the URL and the list stay as they were. ' +
        'Your choice remains in the form, and the next filter change tries it again.'
    : 'Could not change the filters. Please try again.';
}

/** The list with `item` added, or removed if it's already there. */
function toggled<T>(list: readonly T[], item: T): readonly T[] {
  return list.includes(item) ? list.filter((value) => value !== item) : [...list, item];
}
