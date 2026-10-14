import { DestroyRef } from '@angular/core';
import {
  NavigationCancel,
  NavigationCancellationCode,
  NavigationEnd,
  NavigationError,
  NavigationSkipped,
  NavigationStart,
  Router,
  UrlTree,
} from '@angular/router';
import { Subject } from 'rxjs';

type Write = {
  token: object;
  build(): UrlTree;
  options?: { replaceUrl?: boolean };
  owner?: object;
  committed?: () => void;
  resolve(value: boolean): void;
  reject(error: unknown): void;
  navigationId?: number;
  invalidated: boolean;
  skipped: boolean;
};

/** Coordinates shared query navigations; forms keep only their local draft state. */
export class QueryWriteCoordinator {
  readonly changes = new Subject<'external' | 'commit'>();
  private queue: Write[] = [];
  private active?: Write;
  private externalNavigation?: number;
  private blocked = false;
  private destroyed = false;

  constructor(
    private readonly router: Router,
    destroyRef: DestroyRef,
  ) {
    const current = router.currentNavigation();
    if (current) {
      this.blocked = true;
      this.externalNavigation = current.id;
    }
    const subscription = router.events.subscribe((event) => {
      const write = this.active;
      const own =
        write && !write.invalidated && router.currentNavigation()?.extras.info === write.token;
      if (event instanceof NavigationStart || event instanceof NavigationSkipped) {
        if (own && write.navigationId === undefined) write.navigationId = event.id;
        if (!own || write.navigationId !== event.id) {
          this.externalNavigation = event.id;
          this.blocked = true;
          this.invalidate();
        }
        if (own && event instanceof NavigationSkipped) write.skipped = true;
      }
      if (
        event instanceof NavigationCancel &&
        event.id === write?.navigationId &&
        event.code === NavigationCancellationCode.Redirect
      ) {
        this.blocked = true;
        this.invalidate();
      }
      if (
        event instanceof NavigationEnd &&
        event.id === write?.navigationId &&
        event.url !== event.urlAfterRedirects
      ) {
        this.invalidate();
      }
      if (
        event instanceof NavigationEnd ||
        event instanceof NavigationSkipped ||
        event instanceof NavigationCancel ||
        event instanceof NavigationError
      ) {
        if (event.id === this.externalNavigation) {
          // A redirect cancellation is followed by another navigation, so keep writes blocked
          // until that navigation finishes.
          if (
            event instanceof NavigationCancel &&
            event.code === NavigationCancellationCode.Redirect
          )
            return;
          this.externalNavigation = undefined;
          this.blocked = false;
          // Let route signals process NavigationEnd before bindings read the new query baseline.
          queueMicrotask(() => {
            if (!this.destroyed) this.changes.next('external');
          });
        }
      }
    });
    destroyRef.onDestroy(() => {
      this.destroyed = true;
      this.invalidate();
      this.active?.resolve(false);
      subscription.unsubscribe();
      this.changes.complete();
    });
  }

  enqueue(
    build: Write['build'],
    options?: Write['options'],
    owner?: object,
    committed?: () => void,
  ): Promise<boolean> {
    if (this.destroyed || this.blocked) return Promise.resolve(false);
    const result = new Promise<boolean>((resolve, reject) => {
      this.queue.push({
        token: {},
        build,
        options,
        owner,
        committed,
        resolve,
        reject,
        invalidated: false,
        skipped: false,
      });
    });
    queueMicrotask(() => void this.drain());
    return result;
  }

  cancelOwner(owner: object): void {
    this.queue = this.queue.filter((write) => {
      if (write.owner !== owner) return true;
      write.resolve(false);
      return false;
    });
  }

  private invalidate(): void {
    if (this.active) this.active.invalidated = true;
    const waiting = this.queue;
    this.queue = [];
    for (const write of waiting) write.resolve(false);
    if (!this.destroyed) this.changes.next('external');
  }

  private async drain(): Promise<void> {
    if (this.active || this.destroyed || this.blocked) return;
    const write = this.queue.shift();
    if (!write) return;
    this.active = write;
    try {
      const tree = write.build();
      // The updater can start an external navigation while it builds the URL tree.
      if (write.invalidated || this.destroyed) {
        write.resolve(false);
        return;
      }
      const result = await this.router.navigateByUrl(tree, { ...write.options, info: write.token });
      if (!write.invalidated && !this.destroyed && (result || write.skipped)) {
        write.committed?.();
        this.changes.next('commit');
      }
      write.resolve(result);
    } catch (error) {
      write.reject(error);
    } finally {
      this.active = undefined;
      queueMicrotask(() => void this.drain());
    }
  }
}

type Query = Readonly<Record<string, unknown>>;
export interface QueryBinding<Q extends Query> {
  readonly coordinator: QueryWriteCoordinator;
  read(): Q | undefined;
  /** Whether two values of a field produce the same URL representation. */
  sameUrlValue(param: keyof Q, left: unknown, right: unknown): boolean;
  /** Merges the fields `patcher` returns into the committed query and writes the result. */
  update(
    patcher: (query: Q) => Partial<Q>,
    options: { replaceUrl?: boolean },
    owner: object,
    committed: () => void,
  ): Promise<boolean>;
}

const bindings = new WeakMap<object, QueryBinding<Query>>();
export function registerQueryBinding(ref: object, binding: QueryBinding<Query>): void {
  bindings.set(ref, binding);
}

/** @internal Connects the forms entry point to a generated route node. */
export function getQueryBinding<Q extends Query>(ref: object): QueryBinding<Q> {
  const binding = bindings.get(ref);
  if (!binding) throw new Error('Query forms require a generated ngx-urlik route node');
  return binding as QueryBinding<Q>;
}
