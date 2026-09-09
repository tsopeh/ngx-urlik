import { DatePipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { debounceTime, groupBy, mergeMap } from 'rxjs';
import { createQueryParamsFormGroup } from 'ngx-urlik/forms';
import { RouterLink } from '@angular/router';
import { CatalogLinks } from './catalog-links';
import { AppRouter } from './app-router';
import { TasteTrackRepository } from './database';

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
          ><input
            type="search"
            formControlName="search"
            (input)="setPage(1)"
            placeholder="Search titles…"
        /></label>
        <label
          ><span>From</span><input type="date" formControlName="from" (change)="setPage(1)"
        /></label>
        <label
          ><span>To</span><input type="date" formControlName="to" (change)="setPage(1)"
        /></label>
        <label
          ><span>Page size</span
          ><select formControlName="pageSize" (change)="setPage(1)">
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
        @for (event of visible(); track event.id) {
          @let item = itemFor(event.itemId);
          <article>
            <time [attr.datetime]="event.occurredAt">{{
              event.occurredAt | date: 'mediumDate'
            }}</time
            ><span class="activity-icon">▶</span>
            <div>
              <p class="eyebrow">{{ event.kind }}</p>
              <h3>
                @if (item) {
                  <a [routerLink]="links.item(item)">{{ item.title }}</a>
                }
              </h3>
              <p>{{ item?.subtitle }}</p>
            </div>
            @if (event.rating) {
              <strong>★ {{ event.rating }}</strong>
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
          [disabled]="query().page * query().pageSize >= matched().length"
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
  private readonly repository = inject(TasteTrackRepository);
  protected readonly form = createQueryParamsFormGroup(this.routes.ROOT.ACTIVITY, {
    transformWrites: (changes) =>
      changes.pipe(
        groupBy((change) => change.param),
        mergeMap((group) => (group.key === 'search' ? group.pipe(debounceTime(250)) : group)),
      ),
  });
  protected readonly query = computed(() => this.routes.ROOT.ACTIVITY.urlParams().value().query);
  protected readonly matched = computed(() => {
    const query = this.query();
    const matched = this.repository.events().filter((event) => {
      const item = this.repository.items().find((candidate) => candidate.id === event.itemId);
      return (
        (!query.search || item?.title.toLowerCase().includes(query.search.toLowerCase())) &&
        (!query.from || event.occurredAt >= query.from) &&
        (!query.to || event.occurredAt <= `${query.to}T23:59:59.999Z`)
      );
    });
    return matched.sort(
      (a, b) =>
        (query.sort.field === 'date'
          ? a.occurredAt.localeCompare(b.occurredAt)
          : (a.rating ?? 0) - (b.rating ?? 0)) * (query.sort.direction === 'asc' ? 1 : -1),
    );
  });
  protected readonly visible = computed(() => {
    const query = this.query();
    return this.matched().slice((query.page - 1) * query.pageSize, query.page * query.pageSize);
  });
  protected itemFor(id: string) {
    return this.repository.items().find((item) => item.id === id);
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
    this.setPage(1);
  }
}
