import { Component, computed, inject, signal } from '@angular/core';
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
  type LibraryQuery,
  type LibraryStatus,
  type LibraryItemId,
  type LibraryKind,
} from './backend';
import { MediaCard } from './media-card';
import { statusLabels } from './status-labels';
import { EventLog } from './inspector/event-log';

@Component({
  imports: [FormField, LoadingIndicator, MediaCard],
  template: `
    <section class="page-stack">
      <header class="page-header">
        <div>
          <p class="eyebrow">Personal archive</p>
          <h1>Your library</h1>
          <p>
            Your movies and shows: what you plan to watch, are watching, and watched. Logging an
            episode puts its show here.
          </p>
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
          >Times finished<select
            [value]="countValue()"
            (change)="setCount($any($event.target).value)"
          >
            <option value="">Any</option>
            <option value="0">Never</option>
            <option value="1">Once</option>
            <option value="countless">More than I can count</option>
          </select></label
        >
      </section>
      <div class="chip-row" role="group" aria-label="Type filters">
        <span class="row-label" aria-hidden="true">Type</span>
        @for (kind of kinds; track kind.value) {
          <button
            [class.selected]="binding.model().media.includes(kind.value)"
            [attr.aria-pressed]="binding.model().media.includes(kind.value)"
            (click)="toggleMedia(kind.value)"
          >
            {{ kind.label }}
          </button>
        }
      </div>
      <div class="chip-row" role="group" aria-label="Status filters">
        <span class="row-label" aria-hidden="true">Status</span>
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
              [episodes]="card.episodes"
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
  styles: `
    .chip-row .row-label {
      min-width: 3.5rem;
      border: 0;
      background: none;
      padding-left: 0;
      color: var(--text-muted);
      font-size: 0.8rem;
      align-self: center;
    }
  `,
})
export class LibraryPage {
  protected readonly links = inject(CatalogLinks);
  protected readonly kinds: readonly { value: LibraryKind; label: string }[] = [
    { value: 'movie', label: 'Movies' },
    { value: 'show', label: 'Shows' },
  ];
  protected readonly statuses: readonly LibraryStatus[] = ['saved', 'in-progress', 'completed'];
  protected readonly statusLabels = statusLabels;
  private readonly routes = inject(AppRouter).routes;
  private readonly backendApi = inject(BackendApi);
  private readonly preferences = inject(Preferences);
  private readonly log = inject(EventLog);
  protected readonly binding = createQueryParamsSignalForm(this.routes.LIBRARY, {
    schema: (fields) => {
      debounce(fields.search, 300);
      minLength(fields.search, 3);
    },
    // Any change other than the page itself starts from the first page, in the same navigation.
    beforeWrite: this.log.formWrite('Library form', (patch) => {
      // A new write starts, so the last write's failure no longer describes the form.
      this.lastFailure.set(null);
      const changesMoreThanPage = Object.keys(patch).some((field) => field !== 'page');
      return changesMoreThanPage ? { page: 1, ...patch } : patch;
    }),
    onWriteFailure: (failure) => this.lastFailure.set(failure),
  });
  private readonly lastFailure = signal<QueryWriteFailure | null>(null);
  // The message is about edits the URL didn't take, so it shows only while the form differs from
  // the URL. Picking the URL's value again hides it.
  protected readonly writeFailure = computed(() => {
    const failure = this.lastFailure();
    const unwritten =
      JSON.stringify(this.binding.model()) !== JSON.stringify(this.routes.LIBRARY.params().query);
    return failure && unwritten ? describeFailure(failure) : '';
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

  constructor() {
    this.log.watchSignalForm(
      'Library form',
      this.binding.form,
      () => this.routes.LIBRARY.params().query,
    );
  }

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
  protected toggleMedia(kind: LibraryKind) {
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
  protected toggleFavorite(id: LibraryItemId) {
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
