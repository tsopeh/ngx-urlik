import { DatePipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { createQueryParamsFormGroup } from 'ngx-urlik/forms';
import { BackendApi, type HistoryQuery } from './backend';
import { AppRouter } from './app-router';
import { Preferences } from './preferences';
import { CatalogLinks } from './catalog-links';
import { LoadingIndicator } from './loading-indicator';
import { withPreviousValue } from './with-previous-value';
import type { PageSize } from './codecs';

@Component({
  imports: [DatePipe, LoadingIndicator, ReactiveFormsModule, RouterLink],
  template: `
    <section class="page-stack">
      <header class="page-header">
        <div>
          <p class="eyebrow">Journal</p>
          <h1>Viewing history</h1>
          <p>Your movies, episodes, and rewatches.</p>
        </div>
        <app-loading-indicator [active]="journal.isLoading()" />
      </header>
      <form class="filter-panel" [formGroup]="form" (submit)="$event.preventDefault()">
        <label class="search"
          ><span>Search history</span
          ><input type="search" formControlName="search" placeholder="Search titles…"
        /></label>
        <label><span>From</span><input type="date" formControlName="from" /></label>
        <label><span>To</span><input type="date" formControlName="to" /></label>
        <label
          ><span>Page size</span
          ><select [value]="pageSize()" (change)="setPageSize($any($event.target).value)">
            <option>12</option>
            <option>24</option>
            <option>48</option>
          </select></label
        >
        <label
          >Sort<select
            [value]="query().sort.field + ':' + query().sort.direction"
            (change)="setSort($any($event.target).value)"
          >
            <option value="date:desc">Newest first</option>
            <option value="date:asc">Oldest first</option>
            <option value="rating:desc">Highest rated</option>
            <option value="rating:asc">Lowest rated</option>
          </select></label
        >
      </form>
      <section
        class="history-list"
        aria-label="Journal entries"
        [attr.aria-busy]="journal.isLoading()"
      >
        @if (response(); as loaded) {
          @for (entry of loaded.entries; track entry.event.id) {
            <article>
              <time [attr.datetime]="entry.event.occurredAt">{{
                entry.event.occurredAt | date: 'mediumDate' : 'UTC'
              }}</time
              ><span class="history-icon">▶</span>
              <div>
                <p class="eyebrow">{{ entry.event.kind }}</p>
                <h3>
                  @if (entry.item; as item) {
                    <a [routerLink]="links.item(item)">{{ item.title }}</a>
                  }
                </h3>
                <p>{{ entry.item?.subtitle }}</p>
              </div>
              @if (entry.event.rating) {
                <strong>★ {{ entry.event.rating }}</strong>
              }
            </article>
          } @empty {
            <p>No viewings match these filters.</p>
          }
        }
      </section>
      <nav class="anchor-links" aria-label="Pagination">
        <button class="button" [disabled]="query().page <= 1" (click)="setPage(query().page - 1)">
          Previous</button
        ><span>Page {{ query().page }}</span
        ><button
          class="button"
          [disabled]="query().page * pageSize() >= (response()?.total ?? 0)"
          (click)="setPage(query().page + 1)"
        >
          Next
        </button>
      </nav>
    </section>
  `,
})
export class HistoryPage {
  protected readonly links = inject(CatalogLinks);
  private readonly routes = inject(AppRouter).routes;
  private readonly backendApi = inject(BackendApi);
  private readonly preferences = inject(Preferences);
  protected readonly form = createQueryParamsFormGroup(this.routes.HISTORY, {
    debounce: { search: 250 },
    writeWhen: 'valid',
    // A cleared date input gives '', which leaves the URL as null. A new filter or order starts
    // from the first page, in the same navigation.
    beforeWrite: (patch) => {
      for (const field of ['from', 'to'] as const) {
        if (patch[field] === '') {
          patch = { ...patch, [field]: null };
        }
      }
      const filters = ['search', 'from', 'to', 'sort', 'pageSize'] as const;
      const changesFilter = filters.some((field) => field in patch);
      return changesFilter ? { page: 1, ...patch } : patch;
    },
  });
  protected readonly query = computed(() => this.routes.HISTORY.params().query);
  protected readonly pageSize = computed(() => this.preferences.pageSize(this.query().pageSize));

  private readonly request = computed<HistoryQuery>(() => ({
    ...this.query(),
    pageSize: this.pageSize(),
  }));

  protected readonly journal = withPreviousValue(
    rxResource({
      params: this.request,
      stream: ({ params }) => this.backendApi.getHistory(params),
    }),
  );
  protected readonly response = this.journal.value;

  constructor() {
    this.form.controls.search.addValidators(Validators.minLength(3));
  }

  protected setPageSize(value: string) {
    this.form.controls.pageSize.setValue(Number(value) as PageSize);
  }
  protected setPage(page: number) {
    this.form.controls.page.setValue(page);
  }
  protected setSort(value: string) {
    const [field, direction] = value.split(':');
    this.form.controls.sort.setValue({
      field: field as 'date' | 'rating',
      direction: direction as 'asc' | 'desc',
    });
  }
}
