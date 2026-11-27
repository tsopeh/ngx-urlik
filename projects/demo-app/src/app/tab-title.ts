import { computed, DestroyRef, effect, inject, Injectable, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { type RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { tabTitle } from './page-titles';

/**
 * Sets the browser tab's title, the only code that does. The title is the heading of the page on
 * screen, once the page has one, or else the title of the active route. Angular calls
 * `updateTitle()` after every navigation, and a page reports its heading with `showHeading()`.
 */
@Injectable({ providedIn: 'root' })
export class TabTitle extends TitleStrategy {
  private readonly routeTitle = signal<string | undefined>(undefined);
  private readonly heading = signal<(() => string | null | undefined) | null>(null);
  readonly title = computed(() => {
    const heading = this.heading()?.();
    return heading ? tabTitle(heading) : (this.routeTitle() ?? 'TasteTrack');
  });

  constructor() {
    super();
    const document = inject(Title);
    effect(() => document.setTitle(this.title()));
  }

  override updateTitle(snapshot: RouterStateSnapshot): void {
    this.routeTitle.set(this.buildTitle(snapshot));
  }

  /**
   * Shows `heading` in the tab while the calling page exists. Call it in the page's injection
   * context. While `heading` returns nothing, like before the page's data loads, the route's
   * title shows.
   */
  showHeading(heading: () => string | null | undefined): void {
    this.heading.set(heading);
    inject(DestroyRef).onDestroy(() => {
      if (this.heading() === heading) {
        this.heading.set(null);
      }
    });
  }
}
