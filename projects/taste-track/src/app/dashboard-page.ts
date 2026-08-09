import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AppRouter } from './app-router';
import { TasteTrackRepository } from './database';
import { MediaCard } from './media-card';

@Component({
  imports: [RouterLink, MediaCard],
  template: `
    <section class="page-stack">
      <header class="page-header hero">
        <div>
          <p class="eyebrow">Sunday, in your cultural universe</p>
          <h1>Good taste leaves a trail.</h1>
          <p>Watch, listen, attend—and remember what stayed with you.</p>
        </div>
        <a class="button primary" [routerLink]="routes.ROOT.COLLECTION.createUrlTree()"
          >Explore collection</a
        >
      </header>
      <section class="stat-grid" aria-label="TasteTrack summary">
        @for (stat of stats(); track stat.label) {
          <article>
            <span>{{ stat.icon }}</span
            ><strong>{{ stat.value }}</strong
            ><small>{{ stat.label }}</small>
          </article>
        }
      </section>
      <section class="panel split">
        <div>
          <p class="eyebrow">Your rhythm</p>
          <h2>Activity by medium</h2>
          <div class="bars" role="img" aria-label="Activity by medium">
            @for (bar of activityBars(); track bar.label) {
              <div>
                <span>{{ bar.label }}</span
                ><i><b [style.width.%]="bar.percent"></b></i><strong>{{ bar.value }}</strong>
              </div>
            }
          </div>
        </div>
        <div class="quote">
          <span>“</span>
          <p>The things we return to become part of our vocabulary.</p>
          <small>— TasteTrack field notes</small>
        </div>
      </section>
      <section>
        <div class="section-heading">
          <div>
            <p class="eyebrow">Curated from your archive</p>
            <h2>Worth another look</h2>
          </div>
          <a [routerLink]="routes.ROOT.COLLECTION.createUrlTree({ fragment: 'favorites' })"
            >View all →</a
          >
        </div>
        <div class="media-grid">
          @for (item of featured(); track item.id) {
            <app-media-card
              [item]="item"
              [state]="stateFor(item.id)"
              [url]="urlFor(item)"
              (favorite)="toggleFavorite(item.id)"
            />
          }
        </div>
      </section>
    </section>
  `,
})
export class DashboardPage {
  protected readonly routes = inject(AppRouter);
  protected readonly repository = inject(TasteTrackRepository);
  protected readonly featured = computed(() =>
    this.repository
      .items()
      .filter((item) => item.featured)
      .slice(0, 4),
  );
  protected readonly stats = computed(() => [
    { icon: '▶', value: this.repository.personalStates().length, label: 'In your collection' },
    { icon: '↻', value: this.repository.events().length, label: 'Recorded experiences' },
    {
      icon: '★',
      value: this.repository.personalStates().filter((state) => state.favorite).length,
      label: 'All-time favorites',
    },
    {
      icon: '∞',
      value: this.repository.personalStates().filter((state) => state.count.kind === 'countless')
        .length,
      label: 'More than you can count',
    },
  ]);
  protected readonly activityBars = computed(() => {
    const counts = new Map<string, number>();
    for (const event of this.repository.events())
      counts.set(event.kind, (counts.get(event.kind) ?? 0) + 1);
    const max = Math.max(...counts.values(), 1);
    return [...counts].map(([label, value]) => ({ label, value, percent: (value / max) * 100 }));
  });
  protected stateFor(id: string) {
    return this.repository.personalStates().find((state) => state.itemId === id);
  }
  protected toggleFavorite(id: Parameters<TasteTrackRepository['toggleFavorite']>[0]) {
    void this.repository.toggleFavorite(id);
  }
  protected urlFor(item: ReturnType<typeof this.featured>[number]) {
    if (item.kind === 'movie')
      return this.routes.ROOT.SCREEN.MOVIES.DETAIL.createUrlTree({
        path: { movieId: item.id as `mov_${string}` },
        fragment: 'overview',
      });
    if (item.kind === 'show')
      return this.routes.ROOT.SCREEN.SHOWS.DETAIL.createUrlTree({
        path: { showId: item.id as `tv_${string}` },
      });
    if (item.kind === 'album')
      return this.routes.ROOT.MUSIC.ALBUMS.DETAIL.createUrlTree({
        path: { albumId: item.id as `alb_${string}` },
        fragment: 'tracks',
      });
    if (item.kind === 'theatre')
      return this.routes.ROOT.THEATRE.PRODUCTIONS.DETAIL.createUrlTree({
        path: { productionId: item.id as `prod_${string}` },
        fragment: 'credits',
      });
    return null;
  }
}
