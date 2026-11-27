export type MediaKind = 'movie' | 'show' | 'episode';
/** What the Library holds. An episode counts toward its show, so it's never an entry itself. */
export type LibraryKind = Exclude<MediaKind, 'episode'>;
export type CatalogId = `mov_${string}` | `tv_${string}` | `ep_${string}`;
export type PersonId = `per_${string}`;
export type StudioId = `st_${string}`;

export type ExperienceCount =
  Readonly<{ kind: 'exact'; value: number }> | Readonly<{ kind: 'countless' }>;
export type LibraryStatus = 'saved' | 'in-progress' | 'completed';

export interface Credit {
  readonly contributorId: PersonId | StudioId;
  readonly role: 'Actor' | 'Director' | 'Writer' | 'Production';
}

interface CatalogMetadata {
  readonly title: string;
  readonly subtitle: string;
  readonly year: number;
  readonly genres: readonly string[];
  readonly credits: readonly Credit[];
  readonly accent: string;
}

export type CatalogItem = CatalogMetadata &
  (
    | { readonly kind: 'movie'; readonly id: `mov_${string}` }
    | { readonly kind: 'show'; readonly id: `tv_${string}` }
    | {
        readonly kind: 'episode';
        readonly id: `ep_${string}`;
        readonly showId: `tv_${string}`;
        readonly seasonNumber: number;
        readonly episodeNumber: number;
      }
  );

export interface Season {
  readonly id: string;
  readonly showId: `tv_${string}`;
  readonly number: number;
  readonly title: string;
}

export type Contributor = {
  readonly name: string;
  readonly description: string;
} & (
  | { readonly kind: 'person'; readonly id: PersonId }
  | { readonly kind: 'studio'; readonly id: StudioId }
);

export interface PersonalState {
  readonly itemId: CatalogId;
  readonly status: LibraryStatus;
  readonly favorite: boolean;
  readonly rating: number | null;
  readonly count: ExperienceCount;
}

export interface JournalEvent {
  readonly id: `evt_${string}`;
  readonly itemId: CatalogId;
  readonly kind: MediaKind;
  readonly occurredAt: string;
  readonly rating: number | null;
}

export interface TasteTrackSeed {
  readonly items: readonly CatalogItem[];
  readonly seasons: readonly Season[];
  readonly contributors: readonly Contributor[];
  readonly personalStates: readonly PersonalState[];
  readonly events: readonly JournalEvent[];
}

/** Whether a date can be logged as a viewing: `2026-11-11`, not `20261-11-11` or `2026-13-01`. */
export const isViewingDate = (date: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date));
