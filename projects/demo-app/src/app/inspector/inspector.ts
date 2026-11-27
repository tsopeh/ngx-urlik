import { DatePipe, Location } from '@angular/common';
import {
  Component,
  computed,
  effect,
  inject,
  linkedSignal,
  type Signal,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd } from '@angular/router';
import { filter, map } from 'rxjs';
import { AppRouter } from '../app-router';
import { type BackendSpeed, DemoLab } from '../demo-lab';
import { describe, EventLog } from './event-log';

/** The part of a typed route the inspector reads. Every route in `AppRouter.routes` has it. */
interface InspectedRoute {
  ifActive(): unknown;
  readonly params: Signal<{ readonly path: object; readonly query: object }>;
}

interface ParamRow {
  readonly name: string;
  readonly value: string;
  /** Where the value comes from: the path, the URL's query text, or the default. */
  readonly source: string;
  /** Whether `params()` returned a new value since the last URL on the same route. */
  readonly changed: boolean;
}

const openKey = 'taste-track:inspector';
const hintKey = 'taste-track:inspector-hint';

// Wide screens show the inspector beside the page, so it starts open there.
function readOpen(): boolean {
  try {
    const stored = localStorage.getItem(openKey);
    if (stored !== null) {
      return stored === 'open';
    }
  } catch {
    // Storage is blocked, so the inspector starts open on wide screens.
  }
  return matchMedia('(min-width: 1200px)').matches;
}

function writeOpen(open: boolean): void {
  try {
    localStorage.setItem(openKey, open ? 'open' : 'closed');
  } catch {
    // Not remembered.
  }
}

// The hint shows until the visitor dismisses it. With storage blocked, it shows on every visit.
function readHintDismissed(): boolean {
  try {
    return localStorage.getItem(hintKey) === 'dismissed';
  } catch {
    return false;
  }
}

function writeHintDismissed(): void {
  try {
    localStorage.setItem(hintKey, 'dismissed');
  } catch {
    // Not remembered.
  }
}

/**
 * Shows what ngx-urlik reads from the URL and what the app does with it: the active routes, the
 * parameters `params()` returns, and a log of navigations, form edits and writes, backend
 * answers, and warnings.
 */
@Component({
  selector: 'app-inspector',
  imports: [DatePipe],
  host: { '[class.open]': 'open()' },
  template: `
    @if (open()) {
      <aside class="panel-body" aria-labelledby="inspector-title">
        <header class="title-bar">
          <div>
            <h2 id="inspector-title">
              @for (count of [log.added()]; track count) {
                <span class="live" aria-hidden="true"></span>
              }
              <span class="library">ngx-urlik</span> inspector
            </h2>
            <p class="lede">What the library reads from this URL, and what the app does with it.</p>
          </div>
          <button type="button" class="small" (click)="setOpen(false)">Hide</button>
        </header>

        @if (showHint()) {
          <div class="hint">
            <p>
              Change a filter or open a title, then watch the URL, the parameters, and the events
              below change with it.
            </p>
            <button type="button" class="small" (click)="dismissHint()">Got it</button>
          </div>
        }

        <section>
          <h3>URL</h3>
          <code class="url">{{ url() }}</code>
          <a [href]="externalUrl()" target="_blank" rel="noopener">Open this URL in a new tab</a>
        </section>

        <section>
          <h3>Active routes</h3>
          @if (activeNames().length) {
            <p class="routes">
              @for (name of activeNames(); track name; let last = $last) {
                <code [class.deepest]="last">{{ name }}</code>
                @if (!last) {
                  <span aria-hidden="true">›</span>
                }
              }
            </p>
          } @else {
            <p class="muted">No named route matches this URL.</p>
          }
        </section>

        @if (deepestName(); as name) {
          <section>
            <h3>
              <code>{{ name }}.params()</code>
            </h3>
            <dl class="params">
              @for (row of rows(); track row.name) {
                <div [class.changed]="row.changed">
                  <dt>{{ row.name }}</dt>
                  <dd>
                    <code>{{ row.value }}</code>
                    <small>{{ row.source }}</small>
                    @if (row.changed) {
                      <small class="tag">new value</small>
                    }
                  </dd>
                </div>
              }
            </dl>
            <p class="muted">
              A value marked “new value” is a new object or value since the last URL. Every other
              value is the same one as before, so nothing that reads only it runs again.
            </p>
          </section>
        }

        <section class="log">
          <header>
            <h3>Events</h3>
            <button type="button" class="small" (click)="log.clear()">Clear events</button>
          </header>
          <ol>
            @for (event of log.entries(); track event.id) {
              <li [class]="event.kind">
                <time>{{ origin + event.at | date: 'HH:mm:ss.SSS' }}</time>
                <span class="kind"
                  >{{ event.source }}
                  @if (event.repeats > 1) {
                    <small>×{{ event.repeats }}</small>
                  }
                </span>
                <span class="text">{{ event.text }}</span>
              </li>
            } @empty {
              <li class="muted">Nothing yet. Change a filter or open a page.</li>
            }
          </ol>
        </section>

        <section>
          <h3>Try</h3>
          <div class="speeds" role="group" aria-label="Backend speed">
            @for (speed of speeds; track speed.value) {
              <button
                type="button"
                class="small"
                [class.selected]="lab.backendSpeed() === speed.value"
                [attr.aria-pressed]="lab.backendSpeed() === speed.value"
                (click)="lab.backendSpeed.set(speed.value)"
              >
                {{ speed.label }}
              </button>
            }
          </div>
          <button type="button" class="small" (click)="openUnreadableLink()">
            Open /library?minRating=abc
          </button>
          <p class="muted">
            The codec can't read <code>abc</code>, so <code>minRating</code> reads as its default,
            and the log shows the warning.
          </p>
        </section>
      </aside>
    } @else {
      <button type="button" class="opener" (click)="setOpen(true)">
        <span class="live" aria-hidden="true"></span>
        <span><span class="library">ngx-urlik</span> inspector</span>
        @if (unseen() > 0) {
          @for (count of [log.added()]; track count) {
            <span class="badge"
              >{{ unseen() }}<span class="visually-hidden"> new events</span></span
            >
          }
        }
      </button>
    }
  `,
  styles: `
    /* Colors come from the --inspector-* tokens in styles.css, so the panel looks like a tool. */
    :host {
      display: block;
      color: var(--inspector-text);
    }
    .panel-body {
      position: sticky;
      top: 0;
      height: 100vh;
      overflow-y: auto;
      padding: 1rem;
      border-left: 3px solid var(--inspector-teal);
      background: var(--inspector-bg);
      display: grid;
      align-content: start;
      gap: 1.25rem;
      font-size: 0.8rem;
    }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.5rem;
    }
    .title-bar {
      align-items: start;
      padding-bottom: 0.75rem;
      border-bottom: 1px solid var(--inspector-border);
    }
    h2,
    h3 {
      margin: 0;
      letter-spacing: 0;
    }
    h2 {
      font-size: 1rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      color: var(--inspector-text);
    }
    .library {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      color: var(--inspector-teal);
    }
    .lede {
      margin: 0.25rem 0 0;
      color: var(--inspector-muted);
    }
    h3 {
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--inspector-muted);
      margin-bottom: 0.4rem;
    }
    h3 code {
      text-transform: none;
      letter-spacing: 0;
      color: var(--inspector-teal);
    }
    section {
      display: grid;
      gap: 0.4rem;
    }
    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 0.78rem;
    }
    .hint {
      display: grid;
      gap: 0.5rem;
      padding: 0.75rem;
      border: 1px solid var(--inspector-amber);
      border-radius: 0.5rem;
      background: var(--inspector-mark);
    }
    .hint p {
      margin: 0;
    }
    .url {
      overflow-wrap: anywhere;
      color: var(--inspector-text);
      background: var(--inspector-surface);
      border: 1px solid var(--inspector-border);
      border-radius: 0.5rem;
      padding: 0.5rem;
    }
    a {
      color: var(--inspector-teal);
    }
    .routes {
      display: flex;
      flex-wrap: wrap;
      gap: 0.3rem;
      align-items: center;
      margin: 0;
      color: var(--inspector-muted);
    }
    .routes code.deepest {
      color: var(--inspector-teal);
      font-weight: 700;
    }
    .muted {
      margin: 0;
      color: var(--inspector-muted);
    }
    .params {
      margin: 0;
      display: grid;
      gap: 0.35rem;
    }
    .params div {
      display: grid;
      grid-template-columns: 6.5rem minmax(0, 1fr);
      gap: 0.5rem;
      padding: 0.3rem 0.4rem;
      border-radius: 0.4rem;
    }
    .params div.changed {
      background: var(--inspector-mark);
    }
    .params dt {
      font-weight: 600;
      overflow-wrap: anywhere;
    }
    .params dd {
      margin: 0;
      display: grid;
      gap: 0.1rem;
      overflow-wrap: anywhere;
    }
    .params small {
      color: var(--inspector-muted);
    }
    .params .tag {
      color: var(--inspector-amber);
      font-weight: 600;
    }
    button.small {
      border: 1px solid var(--inspector-border);
      background: var(--inspector-surface);
      color: var(--inspector-text);
      border-radius: 99rem;
      padding: 0.3rem 0.6rem;
      font-size: 0.75rem;
      justify-self: start;
    }
    button.small.selected {
      border-color: var(--inspector-teal);
      color: var(--inspector-teal);
    }
    .speeds {
      display: flex;
      flex-wrap: wrap;
      gap: 0.3rem;
    }
    .log ol {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 0.15rem;
    }
    .log li {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: 0 0.5rem;
      padding: 0.35rem 0.4rem;
      border-left: 3px solid var(--inspector-border);
      border-radius: 0.25rem;
      background: var(--inspector-surface);
      animation: inspector-arrive 1.6s ease-out;
    }
    .log li.router {
      border-left-color: var(--inspector-teal);
    }
    .log li.form {
      border-left-color: var(--inspector-pink);
    }
    .log li.warning {
      border-left-color: var(--inspector-red);
    }
    .log li.app {
      border-left-color: var(--inspector-amber);
    }
    .log li.muted {
      background: none;
      border-left-color: transparent;
    }
    .log time {
      color: var(--inspector-muted);
      font-variant-numeric: tabular-nums;
    }
    .log .kind {
      font-weight: 600;
    }
    .log .text {
      grid-column: 1 / -1;
      overflow-wrap: anywhere;
    }
    .live {
      width: 0.55rem;
      aspect-ratio: 1;
      border-radius: 50%;
      background: var(--inspector-teal);
      animation: inspector-blink 0.9s ease-out;
    }
    .opener {
      position: fixed;
      z-index: 20;
      right: 1rem;
      bottom: 1rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      border: 1px solid var(--inspector-teal);
      border-radius: 99rem;
      padding: 0.6rem 1rem;
      background: var(--inspector-bg);
      color: var(--inspector-text);
      box-shadow: var(--shadow-card);
      font-weight: 600;
    }
    .badge {
      min-width: 1.4rem;
      padding: 0.1rem 0.4rem;
      border-radius: 99rem;
      background: var(--inspector-amber);
      color: var(--inspector-bg);
      font-size: 0.75rem;
      text-align: center;
      animation: inspector-pop 0.6s ease-out;
    }
    /* Between phone and wide screens, the open inspector covers the right side of the page. */
    @media (max-width: 1199px) {
      :host(.open) {
        position: fixed;
        z-index: 20;
        top: 0;
        right: 0;
        width: min(24rem, 100%);
        box-shadow: var(--shadow-card);
      }
    }
    /* On phones it's a sheet above the bottom navigation. */
    @media (max-width: 760px) {
      :host(.open) {
        top: auto;
        bottom: 4.5rem;
        width: 100%;
      }
      .panel-body {
        height: 55vh;
        border-left: 0;
        border-top: 3px solid var(--inspector-teal);
      }
      .opener {
        bottom: 5.5rem;
      }
    }
  `,
})
export class Inspector {
  private readonly appRouter = inject(AppRouter);
  private readonly location = inject(Location);
  protected readonly log = inject(EventLog);
  protected readonly lab = inject(DemoLab);
  protected readonly origin = performance.timeOrigin;
  protected readonly speeds: readonly { value: BackendSpeed; label: string }[] = [
    { value: 'instant', label: 'Instant' },
    { value: 'normal', label: 'Normal' },
    { value: 'slow', label: 'Slow (2 s)' },
  ];

  protected readonly open = signal(readOpen());
  // How many events had been added when the inspector was last open.
  private readonly seen = signal(this.log.added());
  protected readonly unseen = computed(() => this.log.added() - this.seen());

  protected readonly url = toSignal(
    this.appRouter.escapeHatch.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: this.appRouter.escapeHatch.url },
  );
  protected readonly externalUrl = computed(() => this.location.prepareExternalUrl(this.url()));

  // The keys of AppRouter.routes follow the RouteNames enum, which lists each parent before its
  // children. So the active routes come out parent first, and the last one is the deepest.
  private readonly routes: readonly [string, InspectedRoute][] = Object.entries(
    this.appRouter.routes,
  );
  private readonly active = computed(() =>
    this.routes.filter(([, route]) => route.ifActive() !== null),
  );
  protected readonly activeNames = computed(() => this.active().map(([name]) => name));
  private readonly deepest = computed(() => this.active().at(-1));
  protected readonly deepestName = computed(() => this.deepest()?.[0]);

  protected readonly rows = linkedSignal<
    { name: string; params: { path: object; query: object } } | undefined,
    readonly ParamRow[]
  >({
    source: () => {
      const deepest = this.deepest();
      return deepest && { name: deepest[0], params: deepest[1].params() };
    },
    computation: (current, previous) => {
      if (!current) {
        return [];
      }
      const before = previous?.source?.name === current.name ? previous.source.params : undefined;
      const rawQuery = this.appRouter.escapeHatch.parseUrl(this.url()).queryParams;
      const row = (group: 'path' | 'query', name: string, value: unknown): ParamRow => ({
        name,
        value: describe(value),
        source:
          group === 'path'
            ? 'from the path'
            : name in rawQuery
              ? `from ?${name}=${String(rawQuery[name])}`
              : value === null
                ? 'not in the URL, no default'
                : 'the default, left out of the URL',
        changed: before !== undefined && (before[group] as Record<string, unknown>)[name] !== value,
      });
      return [
        ...Object.entries(current.params.path).map(([name, value]) => row('path', name, value)),
        ...Object.entries(current.params.query).map(([name, value]) => row('query', name, value)),
      ];
    },
  });

  constructor() {
    // While the inspector is open, every event counts as seen.
    effect(() => {
      if (this.open()) {
        this.seen.set(this.log.added());
      }
    });
  }

  protected readonly showHint = signal(!readHintDismissed());

  protected dismissHint() {
    this.showHint.set(false);
    writeHintDismissed();
  }

  protected setOpen(open: boolean) {
    this.open.set(open);
    writeOpen(open);
  }

  // A typed route can't build this link, because its codec can't write `abc`, so the inspector
  // navigates through the escape hatch.
  protected openUnreadableLink() {
    void this.appRouter.escapeHatch.navigateByUrl('/library?minRating=abc');
  }
}
