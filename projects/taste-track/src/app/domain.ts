export type MediaKind = 'movie' | 'show' | 'episode' | 'album' | 'song' | 'theatre';

export type CatalogId = `${'mov' | 'tv' | 'ep' | 'alb' | 'song' | 'prod'}_${string}`;
export type PersonId = `per_${string}`;
export type GroupId = `grp_${string}`;

export type ExperienceCount =
  Readonly<{ kind: 'exact'; value: number }> | Readonly<{ kind: 'countless' }>;

export type CollectionStatus = 'saved' | 'in-progress' | 'completed' | 'paused' | 'abandoned';

export interface CatalogItem {
  readonly id: CatalogId;
  readonly kind: MediaKind;
  readonly title: string;
  readonly subtitle: string;
  readonly year: number;
  readonly genres: readonly string[];
  readonly contributorIds: readonly (PersonId | GroupId)[];
  readonly parentId?: CatalogId;
  readonly accent: string;
  readonly featured: boolean;
}

export interface Contributor {
  readonly id: PersonId | GroupId;
  readonly kind: 'person' | 'group';
  readonly name: string;
  readonly roles: readonly string[];
}

export interface PersonalTag {
  readonly id: `tag_${string}`;
  readonly name: string;
  readonly color: string;
}

export interface PersonalState {
  readonly itemId: CatalogId;
  readonly status: CollectionStatus;
  readonly favorite: boolean;
  readonly rating: number | null;
  readonly count: ExperienceCount;
  readonly notes: string;
  readonly tagIds: readonly PersonalTag['id'][];
}

export interface JournalEvent {
  readonly id: `evt_${string}`;
  readonly itemId: CatalogId;
  readonly kind: MediaKind;
  readonly occurredAt: string;
  readonly rating: number | null;
  readonly note: string;
}

export interface TasteTrackSeed {
  readonly items: readonly CatalogItem[];
  readonly contributors: readonly Contributor[];
  readonly tags: readonly PersonalTag[];
  readonly personalStates: readonly PersonalState[];
  readonly events: readonly JournalEvent[];
}
