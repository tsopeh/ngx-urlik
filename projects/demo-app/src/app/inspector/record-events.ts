import { DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  NavigationCancel,
  NavigationCancellationCode,
  NavigationEnd,
  NavigationError,
  NavigationSkipped,
  NavigationStart,
} from '@angular/router';
import { AppRouter } from '../app-router';
import { diagnosticsRelay } from './diagnostics-relay';
import { EventLog } from './event-log';

const cancelReasons: Readonly<Record<NavigationCancellationCode, string>> = {
  [NavigationCancellationCode.Redirect]: 'a guard redirected it',
  [NavigationCancellationCode.SupersededByNewNavigation]: 'a newer navigation replaced it',
  [NavigationCancellationCode.NoDataFromResolver]: 'a resolver returned no data',
  [NavigationCancellationCode.GuardRejected]: 'a guard declined it',
  [NavigationCancellationCode.Aborted]: 'it was aborted',
};

/**
 * Adds every navigation and every router warning to the event log. A navigation is one event,
 * which changes as the navigation ends. Call it once, when the app starts.
 */
export function recordAppEvents(): void {
  const log = inject(EventLog);
  const { escapeHatch } = inject(AppRouter);

  const stopWarnings = diagnosticsRelay.listen((diagnostic) =>
    log.add('warning', diagnostic.route, `${diagnostic.code} for ${diagnostic.parameter}`),
  );
  inject(DestroyRef).onDestroy(stopWarnings);

  // Each running navigation's event ID and start time, by navigation ID.
  const running = new Map<number, { eventId: number; started: number }>();
  escapeHatch.events.pipe(takeUntilDestroyed()).subscribe((event) => {
    if (event instanceof NavigationStart) {
      const trigger = event.navigationTrigger === 'popstate' ? ' after Back or Forward' : '';
      const eventId = log.add('router', 'Router', `navigating to ${event.url}${trigger}`);
      running.set(event.id, { eventId, started: performance.now() });
      return;
    }
    const navigationId = 'id' in event ? event.id : -1;
    const navigation = running.get(navigationId);
    if (!navigation) {
      return;
    }
    const took = `${Math.round(performance.now() - navigation.started)} ms`;
    if (event instanceof NavigationEnd) {
      log.update(navigation.eventId, `showed ${event.urlAfterRedirects} after ${took}`);
    } else if (event instanceof NavigationCancel) {
      const reason = event.code === undefined ? event.reason : cancelReasons[event.code];
      log.update(navigation.eventId, `cancelled ${event.url}: ${reason}`, 'warning');
    } else if (event instanceof NavigationSkipped) {
      log.update(navigation.eventId, `skipped ${event.url}: it's the current URL`);
    } else if (event instanceof NavigationError) {
      log.update(navigation.eventId, `failed ${event.url}: ${String(event.error)}`, 'warning');
    } else {
      return;
    }
    running.delete(navigationId);
  });
}
