import { Directive, effect, ElementRef, inject, input } from '@angular/core';

/**
 * Restarts the element's CSS animations each time `appReplayAnimation` changes, so the inspector's
 * dot blinks and its badge pops for every new event. Re-creating the element would also restart
 * them, but Angular's NG0956 warning flags a list that re-creates every item.
 */
@Directive({ selector: '[appReplayAnimation]' })
export class ReplayAnimation {
  readonly appReplayAnimation = input.required<unknown>();

  constructor() {
    const element: HTMLElement = inject(ElementRef).nativeElement;
    // The browser starts the animation when it inserts the element, so the first run skips it.
    let inserted = true;
    effect(() => {
      this.appReplayAnimation();
      if (inserted) {
        inserted = false;
        return;
      }
      // `getAnimations()` doesn't return a CSS animation that has finished, so it can't restart one.
      // Reading `offsetWidth` makes the browser apply `none` before the stylesheet's animation
      // comes back, so the animation starts again from the beginning.
      element.style.animation = 'none';
      void element.offsetWidth;
      element.style.removeProperty('animation');
    });
  }
}
