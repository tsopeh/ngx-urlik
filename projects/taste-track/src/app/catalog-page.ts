import { Component, computed, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AppRouter } from './app-router';
import { TasteTrackRepository } from './database';
import type { CatalogItem, MediaKind } from './domain';
import { MediaCard } from './media-card';

@Component({
  imports: [MediaCard, RouterOutlet],
  template: `
    <section class="page-stack inset">
      @if (!detailActive()) {
        <div class="section-heading">
          <div>
            <p class="eyebrow">Catalog</p>
            <h2>{{ heading() }}</h2>
            <p>{{ results().length }} records in this view</p>
          </div>
          <label class="search">
            <span>Search</span>
            <input
              type="search"
              [value]="search()"
              (input)="setSearch($any($event.target).value)"
              placeholder="Titles, genres, contributors…"
            />
          </label>
        </div>
        @if (hasCatalogFilters()) {
          <div class="chip-row" aria-label="Quick genre filters">
            @for (genre of genres; track genre) {
              <button
                type="button"
                [class.selected]="selectedGenres().includes(genre)"
                (click)="toggleGenre(genre)"
              >
                {{ genre }}
              </button>
            }
          </div>
        }
        <div class="media-grid">
          @for (item of visible(); track item.id) {
            <app-media-card
              [item]="item"
              [state]="stateFor(item.id)"
              [url]="urlFor(item)"
              (favorite)="toggleFavorite(item.id)"
            />
          } @empty {
            <p class="empty">Nothing matches this combination yet.</p>
          }
        </div>
      }
      <router-outlet (activate)="detailActive.set(true)" (deactivate)="detailActive.set(false)" />
    </section>
  `,
})
export class CatalogPage {
  private readonly routes = inject(AppRouter);
  private readonly repository = inject(TasteTrackRepository);
  private readonly active = this.routes.activeRoute({
    episodes: this.routes.ROOT.SCREEN.SHOWS.DETAIL.SEASONS.DETAIL.EPISODES,
    movies: this.routes.ROOT.SCREEN.MOVIES,
    shows: this.routes.ROOT.SCREEN.SHOWS,
    albums: this.routes.ROOT.MUSIC.ALBUMS,
    songs: this.routes.ROOT.MUSIC.SONGS,
    performances: this.routes.ROOT.THEATRE.PRODUCTIONS.DETAIL.PERFORMANCES,
    productions: this.routes.ROOT.THEATRE.PRODUCTIONS,
    works: this.routes.ROOT.THEATRE.WORKS,
    venues: this.routes.ROOT.THEATRE.VENUES,
    people: this.routes.ROOT.PEOPLE,
    groups: this.routes.ROOT.GROUPS,
    tags: this.routes.ROOT.TAGS,
  });
  private readonly localSearch = signal('');

  protected readonly detailActive = signal(false);
  protected readonly genres = ['Drama', 'Comedy', 'Science fiction', 'Rock', 'Jazz', 'Musical'];
  protected readonly hasCatalogFilters = computed(() => this.catalogKind() !== null);
  protected readonly heading = computed(
    () =>
      ({
        episodes: 'Episodes',
        movies: 'Movies',
        shows: 'TV shows',
        albums: 'Albums',
        songs: 'Songs',
        performances: 'Performances',
        productions: 'Productions',
        works: 'Theatre works',
        venues: 'Venues',
        people: 'People',
        groups: 'Groups',
        tags: 'Personal tags',
      })[this.active.value().route],
  );
  protected readonly search = computed(() => {
    const active = this.active.value();
    switch (active.route) {
      case 'episodes':
      case 'movies':
      case 'shows':
      case 'albums':
      case 'songs':
      case 'performances':
      case 'productions':
      case 'works':
      case 'venues':
        return active.params.query.search;
      case 'people':
      case 'groups':
      case 'tags':
        return this.localSearch();
    }
  });
  protected readonly selectedGenres = computed(() => {
    const active = this.active.value();
    switch (active.route) {
      case 'episodes':
      case 'movies':
      case 'shows':
      case 'albums':
      case 'songs':
      case 'performances':
      case 'productions':
      case 'works':
      case 'venues':
        return active.params.query.genres;
      case 'people':
      case 'groups':
      case 'tags':
        return [];
    }
  });
  protected readonly results = computed(() => {
    const kind = this.catalogKind();
    return this.repository
      .items()
      .filter(
        (item) =>
          (!kind || item.kind === kind) &&
          (!this.search() ||
            `${item.title} ${item.subtitle} ${item.genres.join(' ')}`
              .toLowerCase()
              .includes(this.search().toLowerCase())) &&
          (!this.selectedGenres().length ||
            this.selectedGenres().some((genre) => item.genres.includes(genre))),
      );
  });
  protected readonly visible = computed(() => this.results().slice(0, 24));

  private readonly catalogKind = computed<MediaKind | null>(() => {
    const route = this.active.value().route;
    return {
      episodes: 'episode',
      movies: 'movie',
      shows: 'show',
      albums: 'album',
      songs: 'song',
      performances: 'theatre',
      productions: 'theatre',
      works: 'theatre',
      venues: 'theatre',
      people: null,
      groups: null,
      tags: null,
    }[route] as MediaKind | null;
  });

  protected setSearch(search: string) {
    const active = this.active.value();
    switch (active.route) {
      case 'episodes':
      case 'movies':
      case 'shows':
      case 'albums':
      case 'songs':
      case 'performances':
      case 'productions':
      case 'works':
      case 'venues':
        void active.node
          .urlParams()
          .updateQueryParams((query) => ({ ...query, search, page: 1 }), { replaceUrl: true });
        break;
      case 'people':
      case 'groups':
      case 'tags':
        this.localSearch.set(search);
    }
  }

  protected toggleGenre(genre: string) {
    const active = this.active.value();
    switch (active.route) {
      case 'episodes':
      case 'movies':
      case 'shows':
      case 'albums':
      case 'songs':
      case 'performances':
      case 'productions':
      case 'works':
      case 'venues':
        void active.node.urlParams().updateQueryParams(
          (query) => ({
            ...query,
            genres: query.genres.includes(genre)
              ? query.genres.filter((candidate) => candidate !== genre)
              : [...query.genres, genre],
            page: 1,
          }),
          { replaceUrl: true },
        );
        break;
      case 'people':
      case 'groups':
      case 'tags':
        break;
    }
  }

  protected stateFor(id: string) {
    return this.repository.personalStates().find((state) => state.itemId === id);
  }
  protected toggleFavorite(id: CatalogItem['id']) {
    void this.repository.toggleFavorite(id);
  }
  protected urlFor(item: CatalogItem) {
    if (item.kind === 'movie')
      return this.routes.ROOT.SCREEN.MOVIES.DETAIL.createUrlTree({
        path: { movieId: item.id as `mov_${string}` },
      });
    if (item.kind === 'show')
      return this.routes.ROOT.SCREEN.SHOWS.DETAIL.createUrlTree({
        path: { showId: item.id as `tv_${string}` },
      });
    if (item.kind === 'album')
      return this.routes.ROOT.MUSIC.ALBUMS.DETAIL.createUrlTree({
        path: { albumId: item.id as `alb_${string}` },
      });
    if (item.kind === 'song')
      return this.routes.ROOT.MUSIC.SONGS.DETAIL.createUrlTree({
        path: { songId: item.id as `song_${string}` },
      });
    if (item.kind === 'theatre')
      return this.routes.ROOT.THEATRE.PRODUCTIONS.DETAIL.createUrlTree({
        path: { productionId: item.id as `prod_${string}` },
      });
    return null;
  }
}
