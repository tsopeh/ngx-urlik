import { Component, computed, inject } from '@angular/core';
import { JsonPipe } from '@angular/common';
import { RouterLink, RouterOutlet } from '@angular/router';
import { AppRouter } from './app-router';
import { TasteTrackRepository } from './database';

@Component({
  imports: [JsonPipe, RouterLink, RouterOutlet],
  template: `
    <section class="detail-hero">
      <div class="detail-cover cover-{{ item()?.accent }}">
        <span>{{ item()?.kind }}</span
        ><strong>{{ item()?.title?.slice(0, 1) }}</strong>
      </div>
      <div>
        <p class="eyebrow">{{ item()?.kind ?? 'Typed route detail' }}</p>
        <h1>{{ item()?.title ?? 'Nested route context' }}</h1>
        <p class="lede">
          {{ item()?.subtitle ?? 'This route demonstrates accumulated, decoded path state.' }}
        </p>
        <div class="chip-row">
          @for (genre of item()?.genres ?? []; track genre) {
            <span>{{ genre }}</span>
          }
        </div>
        <nav class="anchor-links" aria-label="On this page">
          <a [routerLink]="sectionUrl('overview')">Overview</a
          ><a [routerLink]="sectionUrl('credits')">Credits</a
          ><a [routerLink]="sectionUrl('activity')">Activity</a>
        </nav>
      </div>
    </section>
    <section id="overview" class="panel">
      <p class="eyebrow">Decoded path state</p>
      <pre>{{ context.value().params.path | json }}</pre>
    </section>
    <section id="credits" class="panel">
      <p class="eyebrow">Credits</p>
      <h2>Connected across every medium</h2>
      <p>People and groups remain shared entities while their roles are specific to each work.</p>
    </section>
    <section id="activity" class="panel">
      <p class="eyebrow">Your history</p>
      <h2>{{ eventCount() }} recorded experiences</h2>
    </section>
    <router-outlet />
  `,
})
export class DetailPage {
  private readonly routes = inject(AppRouter);
  private readonly repository = inject(TasteTrackRepository);
  protected readonly context = this.routes.activeRoute({
    movie: this.routes.ROOT.SCREEN.MOVIES.DETAIL,
    show: this.routes.ROOT.SCREEN.SHOWS.DETAIL,
    season: this.routes.ROOT.SCREEN.SHOWS.DETAIL.SEASONS.DETAIL,
    episode: this.routes.ROOT.SCREEN.SHOWS.DETAIL.SEASONS.DETAIL.EPISODES.DETAIL,
    album: this.routes.ROOT.MUSIC.ALBUMS.DETAIL,
    song: this.routes.ROOT.MUSIC.SONGS.DETAIL,
    production: this.routes.ROOT.THEATRE.PRODUCTIONS.DETAIL,
    person: this.routes.ROOT.PEOPLE.DETAIL,
    group: this.routes.ROOT.GROUPS.DETAIL,
    tag: this.routes.ROOT.TAGS.DETAIL,
  });
  private readonly entityId = computed(() =>
    Object.values(this.context.value().params.path).find((value) => typeof value === 'string'),
  );
  protected readonly item = computed(() =>
    this.repository.items().find((item) => item.id === this.entityId()),
  );
  protected readonly eventCount = computed(
    () => this.repository.events().filter((event) => event.itemId === this.item()?.id).length,
  );
  protected sectionUrl(fragment: string) {
    const active = this.context.value();
    switch (active.route) {
      case 'movie':
        return active.node.createUrlTree({ path: active.params.path, fragment });
      case 'show':
        return active.node.createUrlTree({ path: active.params.path, fragment });
      case 'season':
        return active.node.createUrlTree({ path: active.params.path, fragment });
      case 'episode':
        return active.node.createUrlTree({ path: active.params.path, fragment });
      case 'album':
        return active.node.createUrlTree({ path: active.params.path, fragment });
      case 'song':
        return active.node.createUrlTree({ path: active.params.path, fragment });
      case 'production':
        return active.node.createUrlTree({ path: active.params.path, fragment });
      case 'person':
        return active.node.createUrlTree({ path: active.params.path, fragment });
      case 'group':
        return active.node.createUrlTree({ path: active.params.path, fragment });
      case 'tag':
        return active.node.createUrlTree({ path: active.params.path, fragment });
    }
  }
}
