import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AppRouter } from './app-router';
import { CatalogLinks } from './catalog-links';
import { TasteTrackRepository } from './database';
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
      } @else if (repository.ready()) {
        <h1>Title not found</h1>
        <p>This movie, show, season, or episode is not in the catalog.</p>
      }
    </section>
  `,
})
export class DetailPage {
  private readonly routes = inject(AppRouter);
  protected readonly repository = inject(TasteTrackRepository);
  protected readonly links = inject(CatalogLinks);
  protected readonly viewingDate = signal(new Date().toISOString().slice(0, 10));
  protected readonly saving = signal(false);
  protected readonly saved = signal(false);
  protected readonly error = signal('');
  protected readonly ratings = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  private readonly context = this.routes.activeRoute({
    episode: this.routes.ROOT.SCREEN.SHOWS.DETAIL.SEASONS.DETAIL.EPISODES.DETAIL,
    season: this.routes.ROOT.SCREEN.SHOWS.DETAIL.SEASONS.DETAIL,
    show: this.routes.ROOT.SCREEN.SHOWS.DETAIL,
    movie: this.routes.ROOT.SCREEN.MOVIES.DETAIL,
  });
  protected readonly isSeason = computed(() => this.context().route === 'season');
  protected readonly item = computed(() => {
    const active = this.context();
    const items = this.repository.items();
    switch (active.route) {
      case 'movie':
        return items.find((item) => item.id === active.params.path.movieId);
      case 'show':
        return items.find((item) => item.id === active.params.path.showId);
      case 'season':
        return this.repository
          .seasons()
          .some(
            (season) =>
              season.showId === active.params.path.showId &&
              season.number === active.params.path.seasonNumber,
          )
          ? items.find((item) => item.id === active.params.path.showId)
          : undefined;
      case 'episode':
        return items.find(
          (item) =>
            item.kind === 'episode' &&
            item.showId === active.params.path.showId &&
            item.seasonNumber === active.params.path.seasonNumber &&
            item.episodeNumber === active.params.path.episodeNumber,
        );
    }
  });
  protected readonly heading = computed(() => {
    const active = this.context();
    return active.route === 'season'
      ? `${this.item()?.title} · Season ${active.params.path.seasonNumber}`
      : this.item()?.title;
  });
  protected readonly state = computed(() =>
    this.repository.personalStates().find((state) => state.itemId === this.item()?.id),
  );
  protected readonly eventCount = computed(
    () => this.repository.events().filter((event) => event.itemId === this.item()?.id).length,
  );
  protected readonly credits = computed(
    () =>
      this.item()?.credits.flatMap((credit) => {
        const person = this.repository
          .contributors()
          .find((person) => person.id === credit.contributorId);
        return person ? [{ person, role: credit.role }] : [];
      }) ?? [],
  );
  protected readonly parentLink = computed(() => {
    const active = this.context();
    if (active.route === 'episode')
      return {
        label: `Season ${active.params.path.seasonNumber}`,
        url: this.routes.ROOT.SCREEN.SHOWS.DETAIL.SEASONS.DETAIL.createUrlTree({
          path: active.params.path,
          query: active.params.query,
        }),
      };
    if (active.route === 'season')
      return {
        label: 'Back to show',
        url: this.routes.ROOT.SCREEN.SHOWS.DETAIL.createUrlTree({
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
        url: this.routes.ROOT.SCREEN.SHOWS.DETAIL.SEASONS.createUrlTree({
          path: active.params.path,
          query: active.params.query,
        }),
      };
    if (active.route === 'season')
      return {
        label: 'Browse episodes',
        url: this.routes.ROOT.SCREEN.SHOWS.DETAIL.SEASONS.DETAIL.EPISODES.createUrlTree({
          path: active.params.path,
          query: { ...active.params.query, search: '', genres: [], page: 1 },
        }),
      };
    return null;
  });
  protected sectionUrl(fragment: string) {
    const active = this.context();
    switch (active.route) {
      case 'movie':
        return active.node.createUrlTree({
          path: active.params.path,
          query: active.params.query,
          fragment,
        });
      case 'show':
        return active.node.createUrlTree({
          path: active.params.path,
          query: active.params.query,
          fragment,
        });
      case 'season':
        return active.node.createUrlTree({
          path: active.params.path,
          query: active.params.query,
          fragment,
        });
      case 'episode':
        return active.node.createUrlTree({
          path: active.params.path,
          query: active.params.query,
          fragment,
        });
    }
  }
  protected historyUrl() {
    return this.routes.ROOT.ACTIVITY.createUrlTree({ query: { search: this.item()?.title ?? '' } });
  }
  protected async setStatus(status: CollectionStatus) {
    const item = this.item();
    if (item) await this.persist(() => this.repository.updatePersonal(item.id, { status }));
  }
  protected async setRating(value: string) {
    const item = this.item();
    if (item)
      await this.persist(() =>
        this.repository.updatePersonal(item.id, { rating: value ? Number(value) : null }),
      );
  }
  protected async logViewing() {
    const item = this.item();
    if (!item) return;
    this.saved.set(false);
    await this.persist(async () => {
      await this.repository.logViewing(item, this.viewingDate());
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
