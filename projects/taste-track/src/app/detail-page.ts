import { Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { of, switchMap } from 'rxjs';
import { AppRouter } from './app-router';
import {
  BackendApi,
  isViewingDate,
  type ItemDetailRequest,
  type LibraryStatus,
  type Season,
} from './backend';
import { CatalogLinks } from './catalog-links';
import { Preferences } from './preferences';

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
          <a [routerLink]="[]" fragment="overview" queryParamsHandling="preserve">Overview</a
          ><a [routerLink]="[]" fragment="credits" queryParamsHandling="preserve">Credits</a
          ><a [routerLink]="[]" fragment="history" queryParamsHandling="preserve">History</a>
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
          @if (continueLink(); as link) {
            <p>
              <a [routerLink]="link.url">{{ link.label }}</a>
            </p>
          }
          @if (seasonLinks().length) {
            <nav class="anchor-links" aria-label="Seasons">
              @for (link of seasonLinks(); track link.label) {
                <a [routerLink]="link.url">{{ link.label }}</a>
              }
            </nav>
          }
        </section>
        @if (!isSeason()) {
          <section class="panel">
            <h2>Your library</h2>
            <div class="filter-panel">
              <label
                >Status<select
                  [value]="state()?.status ?? ''"
                  (change)="setStatus($any($event.target))"
                >
                  <option value="" disabled>Not in library</option>
                  <option value="saved">Watchlist</option>
                  <option value="in-progress">Watching</option>
                  <option value="completed">Watched</option>
                </select></label
              >
              <label
                >Rating<select
                  [value]="state()?.rating ?? ''"
                  (change)="setRating($any($event.target))"
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
  private readonly routes = inject(AppRouter).routes;
  private readonly backendApi = inject(BackendApi);
  private readonly preferences = inject(Preferences);
  protected readonly links = inject(CatalogLinks);
  protected readonly viewingDate = signal(new Date().toISOString().slice(0, 10));
  // Counts running writes. A status change can finish while a log still runs.
  private readonly writes = signal(0);
  protected readonly saving = computed(() => this.writes() > 0);
  protected readonly saved = signal(false);
  protected readonly error = signal('');
  protected readonly ratings = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  // One page serves four routes, so it asks which one shows and reads through what it gets back.
  private readonly request = computed<ItemDetailRequest>(() => {
    const movie = this.routes.MOVIE_DETAIL.ifActive();
    if (movie) {
      return { route: 'movie', movieId: movie.params().path.movieId };
    }
    const show = this.routes.SHOW_DETAIL.ifActive();
    if (show) {
      return { route: 'show', showId: show.params().path.showId };
    }
    const season = this.routes.SEASON_DETAIL.ifActive();
    if (season) {
      const { showId, seasonNumber } = season.params().path;
      return { route: 'season', showId, seasonNumber };
    }
    const episode = this.routes.EPISODE_DETAIL.ifActive();
    if (episode) {
      const { showId, seasonNumber, episodeNumber } = episode.params().path;
      return { route: 'episode', showId, seasonNumber, episodeNumber };
    }
    throw new Error('DetailPage shows only movie, show, season, and episode routes');
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

  // Every detail route sits under BROWSE, so links up and across keep its catalog filters.
  private readonly catalogQuery = computed(() => this.routes.BROWSE.params().query);

  protected readonly parentLink = computed(() => {
    const query = this.catalogQuery();
    const episode = this.routes.EPISODE_DETAIL.ifActive();
    if (episode) {
      const { showId, seasonNumber } = episode.params().path;
      return {
        label: `Season ${seasonNumber}`,
        url: this.routes.SEASON_DETAIL.createUrlTree({ path: { showId, seasonNumber }, query }),
      };
    }
    const season = this.routes.SEASON_DETAIL.ifActive();
    if (season) {
      const { showId } = season.params().path;
      return {
        label: 'Back to show',
        url: this.routes.SHOW_DETAIL.createUrlTree({ path: { showId }, query }),
      };
    }
    return null;
  });
  protected readonly childrenLink = computed(() => {
    const season = this.routes.SEASON_DETAIL.ifActive();
    if (!season) {
      return null;
    }
    return {
      label: 'Browse episodes',
      url: this.routes.EPISODES.createUrlTree({
        path: season.params().path,
        query: { ...this.catalogQuery(), search: '', genres: [], page: 1 },
      }),
    };
  });
  private readonly showId = computed(
    () => this.routes.SHOW_DETAIL.ifActive()?.params().path.showId ?? null,
  );
  // The season this show was last opened at, which Preferences saved from the URL.
  protected readonly continueLink = computed(() => {
    const showId = this.showId();
    const seasonNumber = showId === null ? undefined : this.preferences.lastSeason(showId);
    const nothingToContinue = showId === null || seasonNumber === undefined;
    if (nothingToContinue) {
      return null;
    }
    return {
      label: `Continue with Season ${seasonNumber}`,
      url: this.routes.SEASON_DETAIL.createUrlTree({
        path: { showId, seasonNumber },
        query: this.catalogQuery(),
      }),
    };
  });
  private readonly seasons = toSignal(
    toObservable(this.showId).pipe(
      switchMap((showId) => (showId ? this.backendApi.getSeasons(showId) : of([]))),
    ),
    { initialValue: [] as readonly Season[] },
  );
  // A show lists its seasons; each link keeps the catalog filters.
  protected readonly seasonLinks = computed(() => {
    if (this.showId() === null) {
      return [];
    }
    return this.seasons().map((season) => ({
      label: season.title,
      url: this.routes.SEASON_DETAIL.createUrlTree({
        path: { showId: season.showId, seasonNumber: season.number },
        query: this.catalogQuery(),
      }),
    }));
  });
  protected historyUrl() {
    return this.routes.HISTORY.createUrlTree({
      query: { search: this.item()?.title ?? '' },
    });
  }
  // A failed write leaves the stored value as it was, so the select shows it again. Its [value]
  // binding didn't change, so Angular wouldn't put it back.
  protected async setStatus(select: HTMLSelectElement) {
    const item = this.item();
    if (item) {
      const status = select.value as LibraryStatus;
      await this.persist(
        () => this.backendApi.updatePersonal(item.id, { status }),
        () => (select.value = this.state()?.status ?? ''),
      );
    }
  }
  protected async setRating(select: HTMLSelectElement) {
    const item = this.item();
    if (item) {
      const rating = select.value ? Number(select.value) : null;
      await this.persist(
        () => this.backendApi.updatePersonal(item.id, { rating }),
        () => (select.value = String(this.state()?.rating ?? '')),
      );
    }
  }
  protected async logViewing() {
    const item = this.item();
    if (!item) {
      return;
    }
    this.saved.set(false);
    // A date input takes years past 9999, like 20261-11-11, which the journal rejects.
    if (!isViewingDate(this.viewingDate())) {
      this.error.set('Enter a date like 2026-11-11.');
      return;
    }
    await this.persist(async () => {
      await this.backendApi.logViewing(item, this.viewingDate());
      this.saved.set(true);
    });
  }
  private async persist(write: () => Promise<void>, undo?: () => void) {
    this.writes.update((count) => count + 1);
    this.error.set('');
    try {
      await write();
    } catch {
      undo?.();
      this.error.set('Could not save your changes. Please try again.');
    } finally {
      this.writes.update((count) => count - 1);
    }
  }
}
