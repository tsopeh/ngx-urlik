import type {
  CatalogId,
  CatalogItem,
  Contributor,
  GroupId,
  JournalEvent,
  MediaKind,
  PersonId,
  PersonalState,
  PersonalTag,
  TasteTrackSeed,
} from './domain';

const palettes = ['plum', 'coral', 'amber', 'teal', 'blue', 'rose'] as const;
const genreByKind: Record<MediaKind, readonly string[]> = {
  movie: ['Drama', 'Comedy', 'Science fiction', 'Mystery'],
  show: ['Comedy', 'Drama', 'Mystery', 'Documentary'],
  episode: ['Comedy', 'Drama'],
  album: ['Rock', 'Jazz', 'Electronic', 'Folk'],
  song: ['Rock', 'Jazz', 'Electronic', 'Folk'],
  theatre: ['Play', 'Musical', 'Comedy', 'Drama'],
};

const featured: readonly Omit<CatalogItem, 'contributorIds'>[] = [
  {
    id: 'mov_the-last-algorithm',
    kind: 'movie',
    title: 'The Last Algorithm',
    subtitle: 'One model. No fallback.',
    year: 2025,
    genres: ['Science fiction', 'Drama'],
    accent: 'plum',
    featured: true,
  },
  {
    id: 'mov_fellowship-of-the-spreadsheet',
    kind: 'movie',
    title: 'The Fellowship of the Spreadsheet',
    subtitle: 'Nine cells enter. One formula leaves.',
    year: 2023,
    genres: ['Comedy', 'Adventure'],
    accent: 'amber',
    featured: true,
  },
  {
    id: 'tv_only-mergers',
    kind: 'show',
    title: 'Only Mergers in the Building',
    subtitle: 'A commit history with secrets.',
    year: 2024,
    genres: ['Comedy', 'Mystery'],
    accent: 'coral',
    featured: true,
  },
  {
    id: 'tv_better-call-sol',
    kind: 'show',
    title: 'Better Call Sol',
    subtitle: 'Legal drama, stellar consequences.',
    year: 2022,
    genres: ['Drama', 'Comedy'],
    accent: 'blue',
    featured: true,
  },
  {
    id: 'alb_dark-side-of-the-spoon',
    kind: 'album',
    title: 'The Dark Side of the Spoon',
    subtitle: 'The Cutlery Collective',
    year: 2021,
    genres: ['Rock'],
    accent: 'teal',
    featured: true,
  },
  {
    id: 'alb_kind-of-blue-screen',
    kind: 'album',
    title: 'Kind of Blue Screen',
    subtitle: 'Miles Ahead of Support',
    year: 2020,
    genres: ['Jazz', 'Electronic'],
    accent: 'blue',
    featured: true,
  },
  {
    id: 'prod_waiting-for-git',
    kind: 'theatre',
    title: 'Waiting for Git',
    subtitle: 'A production in two unresolved acts.',
    year: 2025,
    genres: ['Play', 'Comedy'],
    accent: 'rose',
    featured: true,
  },
  {
    id: 'prod_midsummer-deployment',
    kind: 'theatre',
    title: 'A Midsummer Night’s Deployment',
    subtitle: 'Staging changes under moonlight.',
    year: 2024,
    genres: ['Musical', 'Comedy'],
    accent: 'plum',
    featured: true,
  },
];

const contributors: Contributor[] = Array.from({ length: 100 }, (_, index) => {
  const group = index >= 84;
  return {
    id: `${group ? 'grp' : 'per'}_${group ? 'ensemble' : 'artist'}-${index + 1}` as
      PersonId | GroupId,
    kind: group ? 'group' : 'person',
    name: group
      ? ['The Cutlery Collective', 'Merge Conflict Players', 'Orchestra 404'][index % 3] +
        ` ${index - 83}`
      : ['Wes Andersonville', 'Hans Zipper', 'Tilda Swintonian', 'Miles Ahead'][index % 4] +
        ` ${index + 1}`,
    roles: group
      ? ['Ensemble', 'Recording artist']
      : ['Actor', 'Director', 'Composer'].slice(0, (index % 3) + 1),
  };
});

const supportingKinds: readonly [MediaKind, string, number][] = [
  ['movie', 'mov', 60],
  ['show', 'tv', 12],
  ['album', 'alb', 30],
  ['theatre', 'prod', 18],
];

const supporting = supportingKinds.flatMap(([kind, prefix, count]) =>
  Array.from({ length: count }, (_, index): CatalogItem => ({
    id: `${prefix}_${kind}-${index + 1}` as CatalogId,
    kind,
    title: `${['Chronicle', 'Rhapsody', 'Matinee', 'Picture'][index % 4]} ${String(index + 1).padStart(2, '0')}`,
    subtitle: `A fictional ${kind} from the TasteTrack archive`,
    year: 1990 + ((index * 7) % 36),
    genres: [genreByKind[kind][index % genreByKind[kind].length]],
    contributorIds: [contributors[index % contributors.length].id],
    accent: palettes[index % palettes.length],
    featured: false,
  })),
);

const featuredItems = featured.map((item, index): CatalogItem => ({
  ...item,
  contributorIds: [contributors[index].id, contributors[84 + (index % 16)].id],
}));

const baseItems = [...featuredItems, ...supporting];
const shows = baseItems.filter((item) => item.kind === 'show').slice(0, 12);
const episodes: CatalogItem[] = shows.flatMap((show, showIndex) =>
  Array.from({ length: 24 }, (_, index) => ({
    id: `ep_show-${showIndex + 1}-${index + 1}` as CatalogId,
    kind: 'episode',
    title: `Episode ${index + 1}: ${['The Callback', 'A Route Apart', 'Signals at Dawn'][index % 3]}`,
    subtitle: `Season ${Math.floor(index / 8) + 1}, episode ${(index % 8) + 1}`,
    year: show.year + Math.floor(index / 8),
    genres: show.genres,
    contributorIds: show.contributorIds,
    parentId: show.id,
    accent: show.accent,
    featured: false,
  })),
);

const albums = baseItems.filter((item) => item.kind === 'album').slice(0, 30);
const songs: CatalogItem[] = albums.flatMap((album, albumIndex) =>
  Array.from({ length: 9 }, (_, index) => ({
    id: `song_album-${albumIndex + 1}-${index + 1}` as CatalogId,
    kind: 'song',
    title: `${['Overture', 'Second Signal', 'Golden Query', 'Last Refrain'][index % 4]} ${index + 1}`,
    subtitle: album.title,
    year: album.year,
    genres: album.genres,
    contributorIds: album.contributorIds,
    parentId: album.id,
    accent: album.accent,
    featured: false,
  })),
);

const items = [...baseItems, ...episodes, ...songs];
const tags: PersonalTag[] = [
  'Comfort pick',
  'Rainy day',
  'With friends',
  'Great soundtrack',
  'Worth revisiting',
  'Sunday matinee',
].map((name, index) => ({
  id: `tag_personal-${index + 1}`,
  name,
  color: palettes[index % palettes.length],
}));

const personalStates: PersonalState[] = items.slice(0, 96).map((item, index) => ({
  itemId: item.id,
  status: (['completed', 'saved', 'in-progress', 'paused'] as const)[index % 4],
  favorite: index % 7 === 0,
  rating: index % 5 === 0 ? null : 6 + (index % 5),
  count: index % 19 === 0 ? { kind: 'countless' } : { kind: 'exact', value: 1 + (index % 8) },
  notes: index % 9 === 0 ? 'A dependable favorite with impeccable timing.' : '',
  tagIds: index % 3 === 0 ? [tags[index % tags.length].id] : [],
}));

const events: JournalEvent[] = Array.from({ length: 420 }, (_, index) => {
  const item = items[index % items.length];
  return {
    id: `evt_seed-${index + 1}`,
    itemId: item.id,
    kind: item.kind,
    occurredAt: new Date(
      Date.UTC(2024 + Math.floor(index / 240), index % 12, (index % 27) + 1, 20),
    ).toISOString(),
    rating: index % 4 === 0 ? null : 6 + (index % 5),
    note: index % 13 === 0 ? 'Even better on another visit.' : '',
  };
});

export const tasteTrackSeed: TasteTrackSeed = {
  items,
  contributors,
  tags,
  personalStates,
  events,
};
