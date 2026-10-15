import { DatePipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { createQueryParamsFormGroup } from 'ngx-urlik/forms';
import { switchMap } from 'rxjs';
import { BackendApi, type ActivityEntry, type ActivityQuery } from './backend';
import { AppRouter } from './app-router';
import { CatalogLinks } from './catalog-links';

@Component({
  imports: [DatePipe, ReactiveFormsModule, RouterLink],
  template: `
    <section class="page-stack">
      <header class="page-header">
        <div>
          <p class="eyebrow">Journal</p>
          <h1>Viewing history</h1>
          <p>Your movies, episodes, and rewatches.</p>
        </div>
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
          ><select formControlName="pageSize">
            <option [ngValue]="12">12</option>
            <option [ngValue]="24">24</option>
            <option [ngValue]="48">48</option>
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
      <section class="activity-list" aria-label="Journal entries">
        @for (entry of response().entries; track entry.event.id) {
          <article>
            <time [attr.datetime]="entry.event.occurredAt">{{
              entry.event.occurredAt | date: 'mediumDate'
            }}</time
            ><span class="activity-icon">▶</span>
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
      </section>
      <nav class="anchor-links" aria-label="Pagination">
        <button class="button" [disabled]="query().page <= 1" (click)="setPage(query().page - 1)">
          Previous</button
        ><span>Page {{ query().page }}</span
        ><button
          class="button"
          [disabled]="query().page * query().pageSize >= response().total"
          (click)="setPage(query().page + 1)"
        >
          Next
        </button>
      </nav>
    </section>
  `,
})
export class ActivityPage {
  protected readonly links = inject(CatalogLinks);
  private readonly routes = inject(AppRouter);
  private readonly backendApi = inject(BackendApi);
  protected readonly form = createQueryParamsFormGroup(this.routes.routes.ACTIVITY, {
    debounce: { search: 250 },
    writeWhen: 'valid',
    // A new filter or order starts from the first page, in the same navigation.
    beforeWrite: (patch) =>
      (['search', 'from', 'to', 'sort', 'pageSize'] as const).some((field) => field in patch)
        ? { page: 1, ...patch }
        : patch,
  });
  protected readonly query = computed(() => this.routes.routes.ACTIVITY.params().query);

  private readonly request = computed<ActivityQuery>(() => this.query());

  protected readonly response = toSignal(
    toObservable(this.request).pipe(switchMap((req) => this.backendApi.getActivity(req))),
    {
      initialValue: {
        entries: [] as readonly ActivityEntry[],
        total: 0,
      },
    },
  );

  constructor() {
    this.form.controls.search.addValidators(Validators.minLength(3));
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
