import { Injectable, signal } from '@angular/core';
import { normalLatency } from './backend';

export type BackendSpeed = 'instant' | 'normal' | 'slow';

const latencies: Readonly<Record<BackendSpeed, () => number>> = {
  instant: () => 0,
  normal: normalLatency,
  slow: () => 2000,
};

/** The lowest minimum rating that the Library guard declines while the lab setting is on. */
export const declinedMinRating = 9;

/**
 * Settings that change how TasteTrack behaves, so a visitor can see how ngx-urlik handles a slow
 * backend and a declined write. Settings reset when the page reloads.
 */
@Injectable({ providedIn: 'root' })
export class DemoLab {
  readonly backendSpeed = signal<BackendSpeed>('normal');
  readonly declineTopRatings = signal(false);

  /** Milliseconds the fake backend waits before it answers, at the current speed. */
  latency(): number {
    return latencies[this.backendSpeed()]();
  }
}
