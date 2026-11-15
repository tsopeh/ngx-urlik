import {
  linkedSignal,
  type Resource,
  resourceFromSnapshots,
  type ResourceSnapshot,
} from '@angular/core';

/**
 * Keeps a resource's last value while its next one loads, so a list stays on screen, dimmed,
 * instead of going blank on every filter change. This is the composition from Angular's resource
 * guide, "Resource composition with snapshots".
 */
export function withPreviousValue<T>(input: Resource<T>): Resource<T> {
  const snapshot = linkedSignal<ResourceSnapshot<T>, ResourceSnapshot<T>>({
    source: input.snapshot,
    computation: (next, previous) => {
      if (
        next.status !== 'loading' ||
        previous === undefined ||
        previous.value.status === 'error'
      ) {
        return next;
      }
      return { status: 'loading' as const, value: previous.value.value };
    },
  });
  return resourceFromSnapshots(snapshot);
}
