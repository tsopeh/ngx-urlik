import { Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { switchMap } from 'rxjs';
import { AppRouter } from './app-router';
import { BackendApi, type ItemDetail, type ItemDetailRequest } from './backend-api';
import { CatalogLinks } from './catalog-links';
import type { CollectionStatus } from './domain';

@Component({
  imports: [RouterLink],
  template: `
    <section class="page-stack">
      @if (item(); as title) {
        <header class="page-header">
          <div>
            <p class="eyebrow">{{ isSeason() ? 'Season' : title.kind }}</p>
            <h1>{{ heading() }}</h1>
            <p>{{ title.subtitle }}</p>
          </div>
        </header>
        <nav class="anchor-links" aria-label="On this page">
          <a [routerLink]="sectionUrl('overview')">Overview</a
          ><a [routerLink]="sectionUrl('credits')">Credits</a
          ><a [routerLink]="sectionUrl('history')">History</a>
        </nav>
        <section id="overview" class="panel">
          <h2>Overview</h2>
          <p>{{ title.year }} · {{ title.genres.join(', ') }}</p>
          @if (parentLink(); as parent) {
            <p>
              <a [routerLink]="parent.url">{{ parent.label }}</a>
            </p>
          }
          @if (childrenLink(); as child) {
            <p>
              <a [routerLink]="child.url">{{ child.label }}</a>
            </p>
          }
        </section>
        @if (!isSeason()) {
          <section class="panel">
            <h2>Your collection</h2>
            <div class="filter-panel">
              <label
                >Status<select
                  [value]="state()?.status ?? ''"
                  (change)="setStatus($any($event.target).value)"
                >
                  <option value="" disabled>Not in collection</option>
                  <option value="saved">Watchlist</option>
                  <option value="in-progress">Watching</option>
                  <option value="completed">Watched</option>
                </select></label
              >
              <label
                >Rating<select
                  [value]="state()?.rating ?? ''"
                  (change)="setRating($any($event.target).value)"
                >
                  <option value="">Unrated</option>
                  @for (rating of ratings; track rating) {
                    <option [value]="rating" [selected]="state()?.rating === rating">
                      {{ rating }}/10
                    </option>
                  }
                </select></label
              >
              <label
                >Viewing date<input
                  type="date"
                  [value]="viewingDate()"
                  (input)="viewingDate.set($any($event.target).value)"
              /></label>
              <button
                class="button primary"
                [disabled]="saving() || !viewingDate()"
                (click)="logViewing()"
              >
                Log viewing
              </button>
            </div>
            @if (saved()) {
              <p role="status">Viewing saved.</p>
            }
            @if (error()) {
              <p role="alert">{{ error() }}</p>
            }
          </section>
        }
        <section id="credits" class="panel">
          <h2>Cast & crew</h2>
          @for (credit of credits(); track credit.person.id + credit.role) {
            <p>
              <a [routerLink]="links.contributor(credit.person)">{{ credit.person.name }}</a> ·
              {{ credit.role }}
            </p>
          }
        </section>
        <section id="history" class="panel">
          <h2>{{ eventCount() }} recorded viewings</h2>
          <a [routerLink]="historyUrl()">View history for {{ title.title }}</a>
        </section>
      } @else if (detail() === null) {
        <h1>Title not found</h1>
        <p>This movie, show, season, or episode is not in the catalog.</p>
      }
    </section>
  `,
})
export class DetailPage {
  private readonly routes = inject(AppRouter);
  private readonly backendApi = inject(BackendApi);
  protected readonly links = inject(CatalogLinks);
  protected readonly viewingDate = signal(new Date().toISOString().slice(0, 10));
  protected readonly saving = signal(false);
  protected readonly saved = signal(false);
  protected readonly error = signal('');
  protected readonly ratings = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  private readonly context = this.routes.activeRoute({
    episode: this.routes.routes.EPISODE_DETAIL,
    season: this.routes.routes.SEASON_DETAIL,
    show: this.routes.routes.SHOW_DETAIL,
    movie: this.routes.routes.MOVIE_DETAIL,
  });

  private readonly request = computed<ItemDetailRequest>(() => {
    const active = this.context();
    switch (active.route) {
      case 'movie':
        return { route: 'movie', movieId: active.params.path.movieId };
      case 'show':
        return { route: 'show', showId: active.params.path.showId };
      case 'season':
        return {
          route: 'season',
          showId: active.params.path.showId,
          seasonNumber: active.params.path.seasonNumber,
        };
      case 'episode':
        return {
          route: 'episode',
          showId: active.params.path.showId,
          seasonNumber: active.params.path.seasonNumber,
          episodeNumber: active.params.path.episodeNumber,
        };
    }
  });

  protected readonly detail = toSignal(
    toObservable(this.request).pipe(switchMap((req) => this.backendApi.getItemDetail(req))),
  );

  protected readonly item = computed(() => this.detail()?.item);
  protected readonly isSeason = computed(() => this.detail()?.isSeason ?? false);
  protected readonly heading = computed(() => this.detail()?.heading ?? '');
  protected readonly state = computed(() => this.detail()?.state);
  protected readonly eventCount = computed(() => this.detail()?.eventCount ?? 0);
  protected readonly credits = computed(() => this.detail()?.credits ?? []);

  protected readonly parentLink = computed(() => {
    const active = this.context();
    if (active.route === 'episode')
      return {
        label: `Season ${active.params.path.seasonNumber}`,
        url: this.routes.routes.SEASON_DETAIL.createUrlTree({
          path: active.params.path,
          query: active.params.query,
        }),
      };
    if (active.route === 'season')
      return {
        label: 'Back to show',
        url: this.routes.routes.SHOW_DETAIL.createUrlTree({
          path: { showId: active.params.path.showId },
          query: active.params.query,
        }),
      };
    return null;
  });
  protected readonly childrenLink = computed(() => {
    const active = this.context();
    if (active.route === 'show')
      return {
        label: 'Browse seasons',
        url: this.routes.routes.SEASONS.createUrlTree({
          path: active.params.path,
          query: active.params.query,
        }),
      };
    if (active.route === 'season')
      return {
        label: 'Browse episodes',
        url: this.routes.routes.EPISODES.createUrlTree({
          path: active.params.path,
          query: { ...active.params.query, search: '', genres: [], page: 1 },
        }),
      };
    return null;
  });
  protected sectionUrl(fragment: string) {
    return this.context().createUrlTree({ fragment });
  }
  protected historyUrl() {
    return this.routes.routes.ACTIVITY.createUrlTree({
      query: { search: this.item()?.title ?? '' },
    });
  }
  protected async setStatus(status: CollectionStatus) {
    const item = this.item();
    if (item) await this.persist(() => this.backendApi.updatePersonal(item.id, { status }));
  }
  protected async setRating(value: string) {
    const item = this.item();
    if (item)
      await this.persist(() =>
        this.backendApi.updatePersonal(item.id, { rating: value ? Number(value) : null }),
      );
  }
  protected async logViewing() {
    const item = this.item();
    if (!item) return;
    this.saved.set(false);
    await this.persist(async () => {
      await this.backendApi.logViewing(item, this.viewingDate());
      this.saved.set(true);
    });
  }
  private async persist(write: () => Promise<void>) {
    this.saving.set(true);
    this.error.set('');
    try {
      await write();
    } catch {
      this.error.set('Could not save your changes. Please try again.');
    } finally {
      this.saving.set(false);
    }
  }
}
