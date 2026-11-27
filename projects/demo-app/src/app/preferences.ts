import { effect, inject, Injectable, signal } from '@angular/core';
import { queryParam } from 'ngx-urlik';
import { AppRouter } from './app-router';
import { EventLog } from './inspector/event-log';
import { type PageSize, pageSizeCodec, positiveIntegerCodec, prefixedIdCodec } from './codecs';

const pageSizeKey = 'taste-track:pageSize';
const seasonsKey = 'taste-track:seasons';
const pageSizes: readonly PageSize[] = [12, 24, 48];
const defaultPageSize: PageSize = 24;

function readJson(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null');
  } catch {
    return null;
  }
}

// Storage can be blocked, and then nothing is remembered between visits.
function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Not remembered.
  }
}

function removeKey(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Nothing was remembered.
  }
}

function readPageSize(): PageSize | undefined {
  const stored = readJson(pageSizeKey);
  return pageSizes.includes(stored as PageSize) ? (stored as PageSize) : undefined;
}

function readSeasons(): Readonly<Record<string, number>> {
  const stored = readJson(seasonsKey);
  const isRecord = typeof stored === 'object' && stored !== null;
  if (!isRecord) {
    return {};
  }
  const isSeasonNumber = ([, value]: [string, unknown]) =>
    typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
  return Object.fromEntries(Object.entries(stored).filter(isSeasonNumber));
}

/**
 * Values TasteTrack remembers between visits. ngx-urlik has no persistence, so the app decides
 * when to save and where to use what it saved.
 */
@Injectable({ providedIn: 'root' })
export class Preferences {
  private readonly appRouter = inject(AppRouter);
  private readonly log = inject(EventLog);

  // Saved from the URL. `pageSize` has no default, so the URL holds it only when the user picked
  // one.
  private readonly savedPageSize = signal(readPageSize());

  // Saved from the URL on every navigation. A path parameter is always in the URL, so that's exact.
  private readonly seasons = signal(readSeasons());

  constructor() {
    const current = this.appRouter.globalParams({
      path: { showId: prefixedIdCodec('tv'), seasonNumber: positiveIntegerCodec() },
      query: { pageSize: queryParam({ codec: pageSizeCodec(pageSizes) }) },
    });
    effect(() => {
      const { pageSize } = current().query;
      const nothingNew = pageSize === null || this.savedPageSize() === pageSize;
      if (nothingNew) {
        return;
      }
      this.savedPageSize.set(pageSize);
      writeJson(pageSizeKey, pageSize);
      this.log.add('app', 'Preferences', `saved page size ${pageSize} from globalParams()`);
    });
    effect(() => {
      const { showId, seasonNumber } = current().path;
      const nothingNew =
        showId === null || seasonNumber === null || this.seasons()[showId] === seasonNumber;
      if (nothingNew) {
        return;
      }
      this.seasons.update((seasons) => ({ ...seasons, [showId]: seasonNumber }));
      writeJson(seasonsKey, this.seasons());
      this.log.add('app', 'Preferences', `saved season ${seasonNumber} for ${showId}`);
    });
  }

  /** The page size in the URL, or else the one picked last, or else 24. */
  pageSize(fromUrl: PageSize | null): PageSize {
    return fromUrl ?? this.savedPageSize() ?? defaultPageSize;
  }

  /** The season this show was last opened at, if any. */
  lastSeason(showId: string): number | undefined {
    return this.seasons()[showId];
  }

  clear(): void {
    removeKey(pageSizeKey);
    removeKey(seasonsKey);
    this.savedPageSize.set(undefined);
    this.seasons.set({});
  }
}
