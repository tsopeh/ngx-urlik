import { DatePipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { debounceTime, groupBy, mergeMap } from 'rxjs';
import { createQueryParamsFormGroup } from 'ngx-urlik/forms';
import { AppRouter } from './app-router';
import { TasteTrackRepository } from './database';

@Component({
  imports: [DatePipe, ReactiveFormsModule],
  template: `
    <section class="page-stack">
      <header class="page-header">
        <div>
          <p class="eyebrow">Journal</p>
          <h1>Activity</h1>
          <p>A chronological record of watches, listens, rewatches, and nights at the theatre.</p>
        </div>
      </header>
      <form class="filter-panel" [formGroup]="form">
        <label class="search"
          ><span>Search activity</span
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
      </form>
      <section class="activity-list" aria-label="Journal entries">
        @for (event of visible(); track event.id) {
          @let item = itemFor(event.itemId);
          <article>
            <time [attr.datetime]="event.occurredAt">{{
              event.occurredAt | date: 'mediumDate'
            }}</time
            ><span class="activity-icon">{{ iconFor(event.kind) }}</span>
            <div>
              <p class="eyebrow">{{ event.kind }}</p>
              <h3>{{ item?.title }}</h3>
              <p>{{ event.note || item?.subtitle }}</p>
            </div>
            @if (event.rating) {
              <strong>★ {{ event.rating }}</strong>
            }
          </article>
        }
      </section>
    </section>
  `,
})
export class ActivityPage {
  private readonly routes = inject(AppRouter);
  private readonly repository = inject(TasteTrackRepository);
  protected readonly form = createQueryParamsFormGroup(this.routes.ROOT.ACTIVITY, {
    transformWrites: (changes) =>
      changes.pipe(
        groupBy((change) => change.param),
        mergeMap((group) => (group.key === 'search' ? group.pipe(debounceTime(250)) : group)),
      ),
  });
  protected readonly visible = computed(() => {
    const query = this.routes.ROOT.ACTIVITY.urlParams().value().query;
    const matched = this.repository.events().filter((event) => {
      const item = this.repository.items().find((candidate) => candidate.id === event.itemId);
      return (
        (!query.search || item?.title.toLowerCase().includes(query.search.toLowerCase())) &&
        (!query.media.length || query.media.includes(event.kind)) &&
        (!query.from || event.occurredAt >= query.from) &&
        (!query.to || event.occurredAt <= `${query.to}T23:59:59.999Z`)
      );
    });
    const start = (query.page - 1) * query.pageSize;
    return matched.slice(start, start + query.pageSize);
  });
  protected itemFor(id: string) {
    return this.repository.items().find((item) => item.id === id);
  }
  protected iconFor(kind: string) {
    return kind === 'album' || kind === 'song' ? '♫' : kind === 'theatre' ? '◇' : '▶';
  }
}
