import { Component, computed, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AppRouter } from './app-router';
import { TasteTrackRepository } from './database';
import type { CatalogItem } from './domain';
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
          <label class="search"
            ><span>Search</span
            ><input
              type="search"
              [value]="search()"
              (input)="setSearch($any($event.target).value)"
              placeholder="Titles, genres, contributors…"
          /></label>
        </div>
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
  private readonly path = location.pathname;
  private readonly params = this.path.includes('/screen')
    ? this.routes.ROOT.SCREEN.urlParams()
    : this.path.includes('/music')
      ? this.routes.ROOT.MUSIC.urlParams()
      : this.path.includes('/theatre')
        ? this.routes.ROOT.THEATRE.urlParams()
        : null;
  private readonly localSearch = signal('');
  protected readonly detailActive = signal(false);
  protected readonly search = computed(
    () => this.params?.value().query.search ?? this.localSearch(),
  );
  protected readonly selectedGenres = computed(() => this.params?.value().query.genres ?? []);
  protected readonly genres = ['Drama', 'Comedy', 'Science fiction', 'Rock', 'Jazz', 'Musical'];
  protected readonly heading = computed(() =>
    this.path.includes('/movies')
      ? 'Movies'
      : this.path.includes('/shows')
        ? 'TV shows'
        : this.path.includes('/albums')
          ? 'Albums'
          : this.path.includes('/songs')
            ? 'Songs'
            : this.path.includes('/productions')
              ? 'Productions'
              : this.path.includes('/works')
                ? 'Theatre works'
                : this.path.includes('/venues')
                  ? 'Venues'
                  : this.path.includes('/people')
                    ? 'People'
                    : this.path.includes('/groups')
                      ? 'Groups'
                      : this.path.includes('/tags')
                        ? 'Personal tags'
                        : this.path.includes('/episodes')
                          ? 'Episodes'
                          : 'Catalog',
  );
  protected readonly results = computed(() => {
    const kind = this.path.includes('/movies')
      ? 'movie'
      : this.path.includes('/shows')
        ? 'show'
        : this.path.includes('/albums')
          ? 'album'
          : this.path.includes('/songs')
            ? 'song'
            : this.path.includes('/theatre')
              ? 'theatre'
              : this.path.includes('/episodes')
                ? 'episode'
                : null;
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
  protected setSearch(search: string) {
    if (!this.params) {
      this.localSearch.set(search);
      return;
    }
    void this.params.updateQueryParams((query) => ({ ...query, search, page: 1 }), {
      replaceUrl: true,
    });
  }
  protected toggleGenre(genre: string) {
    if (!this.params) return;
    void this.params.updateQueryParams(
      (query) => ({
        ...query,
        genres: query.genres.includes(genre)
          ? query.genres.filter((candidate) => candidate !== genre)
          : [...query.genres, genre],
        page: 1,
      }),
      { replaceUrl: true },
    );
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
