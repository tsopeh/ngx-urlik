import { DOCUMENT } from '@angular/common';
import { DestroyRef, effect, inject, Injectable, signal, untracked } from '@angular/core';
import type { FormGroup } from '@angular/forms';
import type { FieldState, FieldTree } from '@angular/forms/signals';

export type EventKind = 'router' | 'form' | 'backend' | 'warning' | 'app';

export interface LoggedEvent {
  readonly id: number;
  /** Milliseconds since the page loaded, from `performance.now()`. */
  readonly at: number;
  readonly kind: EventKind;
  readonly source: string;
  readonly text: string;
  /** How many times in a row this same event happened. */
  readonly repeats: number;
}

const maxEvents = 100;
// An edit whose input event ran within this many ms is dated by that event.
const inputWindow = 100;

/**
 * What TasteTrack and ngx-urlik do, newest first, for the inspector to show. Pages and services
 * add events. The log keeps the last 100.
 */
@Injectable({ providedIn: 'root' })
export class EventLog {
  private nextId = 1;
  private readonly events = signal<readonly LoggedEvent[]>([]);
  readonly entries = this.events.asReadonly();
  /** How many events were ever added, so the inspector can count the ones nobody has seen. */
  readonly added = signal(0);
  // When each form was last edited, so a write can say how long it waited.
  private readonly lastEdit = new Map<string, number>();
  // The last value logged for each form field, by `source.field`, so an edit is logged once.
  private readonly loggedEdits = new Map<string, string>();
  // When the last input or change event ran. The watchers below run a few ms after it.
  private lastInput = -Infinity;

  constructor() {
    const document = inject(DOCUMENT);
    const recordInput = (event: Event) => (this.lastInput = event.timeStamp);
    document.addEventListener('input', recordInput, { capture: true });
    document.addEventListener('change', recordInput, { capture: true });
  }

  /**
   * Adds an event and returns its ID, which `update()` takes. The same event right after itself,
   * like a warning reported twice, counts as a repeat instead.
   */
  add(kind: EventKind, source: string, text: string, at = performance.now()): number {
    this.added.update((count) => count + 1);
    const [latest] = this.events();
    const repeated = latest?.kind === kind && latest.source === source && latest.text === text;
    if (repeated) {
      this.events.update(([, ...rest]) => [
        { ...latest, at, repeats: latest.repeats + 1 },
        ...rest,
      ]);
      return latest.id;
    }
    const event: LoggedEvent = { id: this.nextId++, at, kind, source, text, repeats: 1 };
    this.events.update((events) => [event, ...events].slice(0, maxEvents));
    return event.id;
  }

  /** Replaces an event's text, like a navigation that ended. Does nothing if it was dropped. */
  update(id: number, text: string, kind?: EventKind): void {
    this.events.update((events) =>
      events.map((event) =>
        event.id === id ? { ...event, text, kind: kind ?? event.kind } : event,
      ),
    );
  }

  clear(): void {
    this.events.set([]);
  }

  /**
   * Logs an edit the user made in a form. Edits in a row to the same field share one event, so
   * typing "oak" shows one line with the latest value.
   */
  edit(source: string, field: string, value: unknown): void {
    const shown = describe(value);
    if (this.loggedEdits.get(`${source}.${field}`) === shown) {
      return;
    }
    this.loggedEdits.set(`${source}.${field}`, shown);
    const now = performance.now();
    const at = now - this.lastInput < inputWindow ? this.lastInput : now;
    this.lastEdit.set(source, at);
    const text = `edits ${field} = ${shown}`;
    const [latest] = this.events();
    const sameField = latest?.source === source && latest.text.startsWith(`edits ${field} =`);
    if (sameField) {
      this.events.update(([, ...rest]) => [{ ...latest, text, at }, ...rest]);
    } else {
      this.add('form', source, text, at);
    }
  }

  /**
   * Logs each edit in a Signal Form. Call it where the form is created. A field's control value
   * changes on every keystroke, even with a debounce. A value the binding sets from the URL equals
   * its query parameter, so it isn't logged.
   */
  watchSignalForm<Query extends object>(
    source: string,
    form: FieldTree<Query>,
    urlQuery: () => Query,
  ): void {
    // TypeScript can't index a FieldTree by a generic key, so the fields are read by name.
    const fields = form as unknown as Readonly<Record<string, () => FieldState<unknown>>>;
    for (const field of Object.keys(untracked(urlQuery))) {
      let previous: string | undefined;
      effect(() => {
        const value = fields[field]().controlValue();
        const shown = describe(value);
        const fromUrl = describe((untracked(urlQuery) as Record<string, unknown>)[field]);
        if (shown === fromUrl) {
          // The field matches the URL again, so the next edit to it is new.
          this.loggedEdits.delete(`${source}.${field}`);
        } else if (previous !== undefined && shown !== previous) {
          this.edit(source, field, value);
        }
        previous = shown;
      });
    }
  }

  /**
   * Logs each edit in a Reactive form group. Call it where the form is created. The binding sets
   * fields from the URL without emitting `valueChanges`, so only edits by the user or the page's
   * code are logged.
   */
  watchFormGroup(source: string, form: FormGroup): void {
    const destroyRef = inject(DestroyRef);
    for (const [field, control] of Object.entries(form.controls)) {
      const subscription = control.valueChanges.subscribe((value) =>
        this.edit(source, field, value),
      );
      destroyRef.onDestroy(() => subscription.unsubscribe());
    }
  }

  /**
   * Wraps a form's `beforeWrite`, so the log shows what each write sends to the URL and how long
   * after the last edit it ran. Pass the page's own `beforeWrite`, if it has one.
   *
   * A change made by code, like a chip click, is written before the watchers above run, so the
   * wrapper logs the patch's edits first. A watcher doesn't log an edit twice.
   */
  formWrite<Patch extends object, Draft>(
    source: string,
    beforeWrite: (patch: Patch, draft: Draft) => Patch = (patch) => patch,
  ): (patch: Patch, draft: Draft) => Patch {
    return (patch, draft) => {
      for (const [field, value] of Object.entries(patch)) {
        this.edit(source, field, value);
      }
      const written = beforeWrite(patch, draft);
      const lastEdit = this.lastEdit.get(source);
      const wait =
        lastEdit === undefined
          ? ''
          : `, ${Math.round(performance.now() - lastEdit)} ms after the last edit`;
      // The binding can still skip the write, when a running write already sends the same values.
      // The router's event shows whether a navigation follows.
      this.add('form', source, `ready to write ${describe(written)}${wait}`);
      return written;
    };
  }
}

/** A short, readable form of a value: `'oak'`, `[Drama, Comedy]`, `{ field: 'year' }`. */
export function describe(value: unknown): string {
  if (typeof value === 'string') {
    return `'${value}'`;
  }
  if (Array.isArray(value)) {
    return `[${value.map(describe).join(', ')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const fields = Object.entries(value).map(([key, field]) => `${key}: ${describe(field)}`);
    return `{ ${fields.join(', ')} }`;
  }
  return String(value);
}
