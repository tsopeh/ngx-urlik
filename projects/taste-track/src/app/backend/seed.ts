import type {
  CatalogItem,
  Contributor,
  Credit,
  JournalEvent,
  PersonalState,
  Season,
  TasteTrackSeed,
} from './domain';

const contributors: Contributor[] = [
  {
    id: 'per_wes',
    kind: 'person',
    name: 'Wes Andersonville',
    description: 'Director of meticulously arranged fictional worlds.',
  },
  {
    id: 'per_tilda',
    kind: 'person',
    name: 'Tilda Swintonian',
    description: 'Actor with a fondness for unlikely protagonists.',
  },
  {
    id: 'per_hans',
    kind: 'person',
    name: 'Hans Zipper',
    description: 'Writer of mysteries, comedies, and unexpected endings.',
  },
  {
    id: 'per_ava',
    kind: 'person',
    name: 'Ava DuVersion',
    description: 'Actor and director working across film and television.',
  },
  {
    id: 'st_frame',
    kind: 'studio',
    name: 'Frame One Pictures',
    description: 'An independent film studio.',
  },
  {
    id: 'st_signal',
    kind: 'studio',
    name: 'Signal House Studios',
    description: 'A television studio telling stories one season at a time.',
  },
];
const credits = (index: number, tv: boolean): readonly Credit[] => [
  { contributorId: index % 2 ? 'per_ava' : 'per_wes', role: 'Director' },
  { contributorId: 'per_tilda', role: 'Actor' },
  { contributorId: 'per_hans', role: 'Writer' },
  { contributorId: tv ? 'st_signal' : 'st_frame', role: 'Production' },
];
const palettes = ['plum', 'coral', 'amber', 'teal', 'blue', 'rose'];
const genres = ['Drama', 'Comedy', 'Science fiction', 'Mystery'];
const movies: CatalogItem[] = Array.from({ length: 30 }, (_, index) => ({
  id:
    index === 0
      ? 'mov_the-last-algorithm'
      : index === 1
        ? 'mov_fellowship-of-the-spreadsheet'
        : `mov_picture-${index + 1}`,
  kind: 'movie',
  title:
    index === 0
      ? 'The Last Algorithm'
      : index === 1
        ? 'The Fellowship of the Spreadsheet'
        : `Picture ${String(index + 1).padStart(2, '0')}`,
  subtitle:
    index === 0
      ? 'One model. No fallback.'
      : index === 1
        ? 'Nine cells enter. One formula leaves.'
        : 'A fictional story from the TasteTrack film archive.',
  year: 2000 + (index % 26),
  genres: index === 0 ? ['Science fiction', 'Drama'] : [genres[index % genres.length]],
  credits: credits(index, false),
  accent: palettes[index % palettes.length],
}));
const shows: CatalogItem[] = Array.from({ length: 4 }, (_, index) => ({
  id: ['tv_only-mergers', 'tv_better-call-sol', 'tv_the-office-hours', 'tv_stranger-strings'][
    index
  ] as `tv_${string}`,
  kind: 'show',
  title: [
    'Only Mergers in the Building',
    'Better Call Sol',
    'The Office Hours',
    'Stranger Strings',
  ][index],
  subtitle: [
    'A commit history with secrets.',
    'Legal drama, stellar consequences.',
    'An everyday workplace, with extraordinary meetings.',
    'Some connections should stay unplugged.',
  ][index],
  year: 2022 + index,
  genres: [genres[index]],
  credits: credits(index, true),
  accent: palettes[index + 1],
}));
const seasons: Season[] = shows.flatMap((show) =>
  [1, 2].map((number) => ({
    id: `${show.id}-${number}`,
    showId: show.id as `tv_${string}`,
    number,
    title: `Season ${number}`,
  })),
);
const episodes: CatalogItem[] = seasons.flatMap((season) => {
  const show = shows.find((show) => show.id === season.showId)!;
  return Array.from({ length: 4 }, (_, index) => ({
    id: `ep_${season.showId.slice(3)}-${season.number}-${index + 1}` as const,
    kind: 'episode' as const,
    showId: season.showId,
    seasonNumber: season.number,
    episodeNumber: index + 1,
    title: ['The Callback', 'A Route Apart', 'Signals at Dawn', 'The Final Frame'][index],
    subtitle: `${show.title} · Season ${season.number}, episode ${index + 1}`,
    year: show.year + season.number - 1,
    genres: show.genres,
    credits: show.credits,
    accent: show.accent,
  }));
});
const items = [...movies, ...shows, ...episodes];
const personalStates: PersonalState[] = items
  .filter((_, index) => index % 3 !== 2)
  .map((item, index) => ({
    itemId: item.id,
    status: (['completed', 'saved', 'in-progress'] as const)[index % 3],
    favorite: index % 7 === 0,
    rating: index % 3 === 1 ? null : 6 + (index % 5),
    count:
      index % 3 === 1
        ? { kind: 'exact', value: 0 }
        : index === 0
          ? { kind: 'countless' }
          : { kind: 'exact', value: 1 + (index % 4) },
  }));
const events: JournalEvent[] = personalStates
  .filter((state) => state.status !== 'saved')
  .flatMap((state, index) => {
    const item = items.find((item) => item.id === state.itemId)!;
    return Array.from(
      { length: state.count.kind === 'exact' ? Math.min(2, state.count.value) : 2 },
      (_, watch) => ({
        id: `evt_${index + 1}-${watch + 1}` as const,
        itemId: item.id,
        kind: item.kind,
        occurredAt: new Date(Date.UTC(2026, watch + 5, 1 + (index % 27), 20)).toISOString(),
        rating: state.rating,
      }),
    );
  });
export const tasteTrackSeed: TasteTrackSeed = {
  items,
  seasons,
  contributors,
  personalStates,
  events,
};
