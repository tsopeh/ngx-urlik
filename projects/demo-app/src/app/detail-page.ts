import { DatePipe, DOCUMENT, ViewportScroller } from '@angular/common';
import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  Injector,
  signal,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AppRouter } from './app-router';
import {
  BackendApi,
  isViewingDate,
  type ItemDetail,
  type ItemDetailRequest,
  type LibraryStatus,
} from './backend';
import { CatalogLinks } from './catalog-links';
import { LoadingIndicator } from './loading-indicator';
import { TabTitle } from './tab-title';
import { Preferences } from './preferences';

/** The date as `YYYY-MM-DD` in the browser's timezone. */
function localDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

@Component({
  imports: [DatePipe, LoadingIndicator, ReactiveFormsModule, RouterLink],
  template: `
    <section class="page-stack" [attr.aria-busy]="loaded.isLoading()">
      @if (item(); as title) {
        <header class="page-header">
          <div>
            <p class="eyebrow">{{ isSeason() ? 'Season' : title.kind }}</p>
            <h1>{{ heading() }}</h1>
            <p>{{ title.subtitle }}</p>
          </div>
          <app-loading-indicator [active]="loaded.isLoading()" />
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
            <nav class="anchor-links" aria-label="Seasons" [attr.aria-busy]="seasons.isLoading()">
              @for (link of seasonLinks(); track link.label) {
                <a [routerLink]="link.url">{{ link.label }}</a>
              }
            </nav>
          } @else if (seasons.isLoading()) {
            <app-loading-indicator />
          }
        </section>
        @if (!isSeason()) {
          <section class="panel">
            @if (title.kind === 'episode') {
              <h2>Your viewings</h2>
              <p>
                An episode counts toward its show. Logging one puts the show in your Library as
                Watching, unless you're already watching it or watched it.
              </p>
            } @else {
              <h2>Your library</h2>
            }
            <div class="filter-panel">
              @if (title.kind !== 'episode') {
                <label
                  >Status<select [formControl]="statusControl" (change)="setStatus()">
                    <option value="" disabled>Not in library</option>
                    <option value="saved">Watchlist</option>
                    <option value="in-progress">Watching</option>
                    <option value="completed">Watched</option>
                  </select></label
                >
                <label
                  >Rating<select [formControl]="ratingControl" (change)="setRating()">
                    <option value="">Unrated</option>
                    @for (rating of ratings; track rating) {
                      <option [value]="rating">{{ rating }}/10</option>
                    }
                  </select></label
                >
              }
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
          @for (viewing of recentViewings(); track viewing.id) {
            <p>
              <time [attr.datetime]="viewing.occurredAt">{{
                viewing.occurredAt | date: 'mediumDate' : 'UTC'
              }}</time>
              @if (viewing.episode) {
                · {{ viewing.episode }}
              }
              @if (viewing.rating) {
                · ★ {{ viewing.rating }}
              }
            </p>
          }
          <a [routerLink]="historyUrl()">View history for {{ title.title }}</a>
        </section>
      } @else if (detail() === null) {
        <h1>Title not found</h1>
        <p>This movie, show, season, or episode is not in the catalog.</p>
      } @else {
        <app-loading-indicator />
      }
    </section>
  `,
})
export class DetailPage {
  private readonly routes = inject(AppRouter).routes;
  private readonly escapeHatch = inject(AppRouter).escapeHatch;
  private readonly viewportScroller = inject(ViewportScroller);
  private readonly backendApi = inject(BackendApi);
  private readonly preferences = inject(Preferences);
  protected readonly links = inject(CatalogLinks);
  protected readonly viewingDate = signal(localDate(new Date()));
  // Counts running writes. A status change can finish while a log still runs.
  private readonly writes = signal(0);
  protected readonly saving = computed(() => this.writes() > 0);
  protected readonly saved = signal(false);
  protected readonly error = signal('');
  protected readonly ratings = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  protected readonly statusControl = new FormControl('', { nonNullable: true });
  protected readonly ratingControl = new FormControl('', { nonNullable: true });

  // One page serves four routes, so it narrows the active route once into a discriminated union.
  private readonly activeRoute = computed(() => {
    const movie = this.routes.MOVIE_DETAIL.ifActive();
    if (movie) {
      return { route: 'movie' as const, movieId: movie.params().path.movieId };
    }
    const show = this.routes.SHOW_DETAIL.ifActive();
    if (show) {
      return { route: 'show' as const, showId: show.params().path.showId };
    }
    const season = this.routes.SEASON_DETAIL.ifActive();
    if (season) {
      const { showId, seasonNumber } = season.params().path;
      return { route: 'season' as const, showId, seasonNumber };
    }
    const episode = this.routes.EPISODE_DETAIL.ifActive();
    if (episode) {
      const { showId, seasonNumber, episodeNumber } = episode.params().path;
      return { route: 'episode' as const, showId, seasonNumber, episodeNumber };
    }
    throw new Error('DetailPage shows only movie, show, season, and episode routes');
  });

  protected readonly loaded = rxResource<ItemDetail | null, ItemDetailRequest>({
    params: this.activeRoute,
    stream: ({ params }) => this.backendApi.getItemDetail(params),
  });
  protected readonly detail = this.loaded.value;

  protected readonly item = computed(() => this.detail()?.item);
  protected readonly isSeason = computed(() => this.detail()?.isSeason ?? false);
  protected readonly heading = computed(() => this.detail()?.heading ?? '');
  protected readonly state = computed(() => this.detail()?.state);
  protected readonly eventCount = computed(() => this.detail()?.eventCount ?? 0);
  protected readonly recentViewings = computed(() => this.detail()?.recentViewings ?? []);
  protected readonly credits = computed(() => this.detail()?.credits ?? []);

  // Every detail route sits under BROWSE, so links up and across keep its catalog filters.
  private readonly catalogQuery = computed(() => this.routes.BROWSE.params().query);

  protected readonly parentLink = computed(() => {
    const query = this.catalogQuery();
    const active = this.activeRoute();
    switch (active.route) {
      case 'episode':
        return {
          label: `Season ${active.seasonNumber}`,
          url: this.routes.SEASON_DETAIL.createUrlTree({
            path: { showId: active.showId, seasonNumber: active.seasonNumber },
            query,
          }),
        };
      case 'season':
        return {
          label: 'Back to show',
          url: this.routes.SHOW_DETAIL.createUrlTree({ path: { showId: active.showId }, query }),
        };
      default:
        return null;
    }
  });
  protected readonly childrenLink = computed(() => {
    const active = this.activeRoute();
    if (active.route !== 'season') {
      return null;
    }
    return {
      label: 'Browse episodes',
      url: this.routes.EPISODES.createUrlTree({
        path: { showId: active.showId, seasonNumber: active.seasonNumber },
        query: { ...this.catalogQuery(), search: '', genres: [], page: 1 },
      }),
    };
  });
  private readonly showId = computed(() => {
    const active = this.activeRoute();
    return active.route === 'show' ? active.showId : null;
  });
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
  // A movie, season, or episode has no seasons to load, so the resource stays idle there.
  protected readonly seasons = rxResource({
    params: () => this.showId() ?? undefined,
    stream: ({ params }) => this.backendApi.getSeasons(params),
  });
  // A show lists its seasons; each link keeps the catalog filters.
  protected readonly seasonLinks = computed(() => {
    if (this.showId() === null) {
      return [];
    }
    return (this.seasons.value() ?? []).map((season) => ({
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
  constructor() {
    this.scrollToSectionOnLoad();
    inject(TabTitle).showHeading(this.heading);
    effect(() => {
      const current = this.state();
      this.statusControl.setValue(current?.status ?? '', { emitEvent: false });
      this.ratingControl.setValue(String(current?.rating ?? ''), { emitEvent: false });
    });
  }

  // Angular scrolls to the URL's fragment, like #credits, when the navigation ends. On a fresh load
  // or after Back, the title hasn't loaded by then, so the section isn't on the page and nothing
  // scrolls. The page scrolls once, after the title's sections render, unless the user scrolled
  // the page while it loaded.
  private scrollToSectionOnLoad() {
    const section = this.escapeHatch.parseUrl(this.escapeHatch.url).fragment;
    if (!section) {
      return;
    }
    const injector = inject(Injector);
    const document = inject(DOCUMENT);
    const userScrollEvents = ['wheel', 'touchmove', 'keydown'] as const;
    const stop = () => {
      scrollOnce.destroy();
      userScrollEvents.forEach((type) => document.removeEventListener(type, stop));
    };
    userScrollEvents.forEach((type) => document.addEventListener(type, stop, { passive: true }));
    inject(DestroyRef).onDestroy(stop);
    const scrollOnce = effect(() => {
      if (this.item()) {
        stop();
        afterNextRender(() => this.viewportScroller.scrollToAnchor(section), { injector });
      }
    });
  }

  // An episode page has no status or rating, so only a movie or show gets here.
  protected async setStatus() {
    const item = this.item();
    if (item && item.kind !== 'episode') {
      const status = this.statusControl.value as LibraryStatus;
      await this.persist(
        () => this.backendApi.updatePersonal(item.id, { status }),
        () => this.statusControl.setValue(this.state()?.status ?? '', { emitEvent: false }),
      );
    }
  }
  protected async setRating() {
    const item = this.item();
    if (item && item.kind !== 'episode') {
      const value = this.ratingControl.value;
      const rating = value ? Number(value) : null;
      await this.persist(
        () => this.backendApi.updatePersonal(item.id, { rating }),
        () => this.ratingControl.setValue(String(this.state()?.rating ?? ''), { emitEvent: false }),
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
