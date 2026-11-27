import type {
  CatalogItem,
  Contributor,
  Credit,
  JournalEvent,
  LibraryItem,
  PersonId,
  PersonalState,
  Season,
  StudioId,
  TasteTrackSeed,
} from './domain';

type Genre = 'Drama' | 'Comedy' | 'Science fiction' | 'Mystery';

const people: Contributor[] = [
  {
    id: 'per_wendell',
    kind: 'person',
    name: 'Wendell Marchbank',
    description: 'Director of meticulously arranged fictional worlds.',
  },
  {
    id: 'per_tamsin',
    kind: 'person',
    name: 'Tamsin Vellacourt',
    description: 'Actor with a fondness for unlikely protagonists.',
  },
  {
    id: 'per_hollis',
    kind: 'person',
    name: 'Hollis Brandvold',
    description: 'Writer of mysteries, comedies, and unexpected endings.',
  },
  {
    id: 'per_odalys',
    kind: 'person',
    name: 'Odalys Fenwright',
    description: 'Actor and director working across film and television.',
  },
  {
    id: 'per_marisol',
    kind: 'person',
    name: 'Marisol Thistlewood',
    description: 'Actor known for quiet roles that steal the scene.',
  },
  {
    id: 'per_desmond',
    kind: 'person',
    name: 'Desmond Achterberg',
    description: 'Writer who never met a twist he did not like.',
  },
  {
    id: 'per_june',
    kind: 'person',
    name: 'June Okafor-Hale',
    description: 'Director of small towns with big secrets.',
  },
  {
    id: 'per_rafferty',
    kind: 'person',
    name: 'Rafferty Bloom',
    description: 'Comic actor, occasional villain, reliable scene partner.',
  },
];

const studios: Contributor[] = [
  {
    id: 'st_frame',
    kind: 'studio',
    name: 'Frame One Pictures',
    description: 'An independent film studio.',
  },
  {
    id: 'st_lantern',
    kind: 'studio',
    name: 'Lantern Row Films',
    description: 'Small budgets, long shadows, and stories told after dark.',
  },
  {
    id: 'st_quarrybell',
    kind: 'studio',
    name: 'Quarrybell Studios',
    description: 'A television studio telling stories one season at a time.',
  },
  {
    id: 'st_mossgate',
    kind: 'studio',
    name: 'Mossgate Television',
    description: 'Coastal dramas, cozy mysteries, and the occasional spaceship.',
  },
];

const movieStudios: StudioId[] = ['st_frame', 'st_lantern'];
const showStudios: StudioId[] = ['st_quarrybell', 'st_mossgate'];

const person = (index: number) => people[index % people.length].id as PersonId;

/** Spreads the people across titles; the two actor formulas never pick the same person. */
const credits = (index: number, studio: StudioId): readonly Credit[] => [
  { contributorId: person(index * 3), role: 'Director' },
  { contributorId: person(index * 5 + 1), role: 'Actor' },
  { contributorId: person(index * 7 + 2), role: 'Actor' },
  { contributorId: person(index * 3 + 5), role: 'Writer' },
  { contributorId: studio, role: 'Production' },
];

/** `The Clockmaker's Alibi` → `the-clockmakers-alibi`. */
const slug = (title: string) =>
  title
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const palettes = ['plum', 'coral', 'amber', 'teal', 'blue', 'rose'];

// Title, tagline, year, genres.
const movieRows: readonly (readonly [string, string, number, readonly Genre[]])[] = [
  ["Quillon's Last Inference", 'One model. No fallback.', 2024, ['Science fiction', 'Drama']],
  ['Nine Cells and a Formula', 'Nine cells enter. One formula leaves.', 2001, ['Comedy']],
  [
    'Midnight at the Lost and Found',
    'Everything left behind wants to be claimed.',
    2019,
    ['Mystery'],
  ],
  ["The Lighthouse Keeper's Playlist", 'Forty years of songs for passing ships.', 2015, ['Drama']],
  ['Grandma Versus the Robot Vacuum', 'The house has room for one boss.', 2021, ['Comedy']],
  ['Static Bloom', 'Flowers that grow on radio waves.', 2024, ['Science fiction']],
  ['Seven Umbrellas', 'It rains only on the guilty.', 2012, ['Mystery']],
  [
    'Cold Coffee, Warm Hearts',
    'Two baristas, one espresso machine, zero patience.',
    2014,
    ['Comedy'],
  ],
  ['Glass Harbor', 'A town where nobody can lie.', 2018, ['Drama']],
  [
    "Tomorrow's Leftovers",
    "A fridge that shows next week's dinner.",
    2022,
    ['Science fiction', 'Comedy'],
  ],
  ["The Clockmaker's Alibi", 'He was fixing time when it happened.', 1998, ['Mystery']],
  ['Saltwater Sonata', 'A cellist returns to the fishing village she fled.', 2011, ['Drama']],
  ['Rent Is Due on Mars', 'First colonists, first landlord.', 2025, ['Science fiction', 'Comedy']],
  ['The Great Parking Space War', 'Neighbors. Snow. One cleared spot.', 2016, ['Comedy']],
  [
    'Echoes of Station Nine',
    'The relay keeps answering calls nobody made.',
    2020,
    ['Science fiction', 'Mystery'],
  ],
  [
    "The Prompter's Last Cue",
    'Her big break came with a body in the wings.',
    2009,
    ['Mystery', 'Drama'],
  ],
  ['Bring Your Dragon to Work Day', 'HR was not consulted.', 2018, ['Comedy']],
  ['The Forgetting Engine', 'Erase one memory. Lose three more.', 2016, ['Science fiction']],
  ['The Postwoman of Pell Hollow', 'A mail carrier with one house on her route.', 1999, ['Drama']],
  ['Who Ate the Wedding Cake?', 'Twelve guests, one empty plate.', 2020, ['Mystery', 'Comedy']],
  [
    'Planet of Mild Inconvenience',
    'The aliens are polite, and always in the way.',
    2019,
    ['Science fiction', 'Comedy'],
  ],
  [
    'Needlework at Cinder Street',
    "A tattoo artist reads the past on her clients' skin.",
    2017,
    ['Mystery', 'Drama'],
  ],
  ['The Retirement Heist', 'Five pensioners, one casino, no hurry.', 2012, ['Comedy']],
  [
    "Gravity's Daughter",
    'She was born where up and down mean nothing.',
    2024,
    ['Science fiction', 'Drama'],
  ],
  ['Last Call at the Starlight Diner', 'Open all night, closing forever.', 2022, ['Drama']],
  ['No Encore for Odile Brask', 'She walked on stage and never walked off.', 2016, ['Mystery']],
  [
    'Mondays With the Minotaur',
    'A labyrinth, a support group, and very good coffee.',
    2023,
    ['Comedy'],
  ],
  [
    'Recursion Street',
    'The same Tuesday, slightly different every time.',
    2026,
    ['Science fiction'],
  ],
  ['Fifty Years of Postscripts', 'Pen pals for fifty years, never once met.', 2005, ['Drama']],
  ['Inspector Crumbsworth', 'A beagle with a badge.', 2021, ['Comedy', 'Mystery']],
];

// Title, tagline, first year, genres, season count. Each season airs a year after the last.
const showRows: readonly (readonly [string, string, number, readonly Genre[], number])[] = [
  [
    'Brambleworth Manor',
    'Twelve tenants, one locked attic, no straight answers.',
    2022,
    ['Mystery', 'Comedy'],
    3,
  ],
  [
    'Counsel for the Comet',
    'Defending a comet in a court that meets once every seventy years.',
    2020,
    ['Drama'],
    3,
  ],
  ['Paperweight & Sons', 'A family stationery shop, one argument per ream.', 2018, ['Comedy'], 2],
  ['Wirefern', 'Something in the old phone lines is answering back.', 2023, ['Science fiction'], 2],
  ['Overdue After Midnight', 'They lend more than books after dark.', 2019, ['Mystery'], 3],
  ['The 7:15 to Wrenhaven', 'Stories from the morning crossing.', 2016, ['Comedy'], 2],
  [
    'Deep Space Neighbors',
    'Suburbia, three light-years out.',
    2023,
    ['Science fiction', 'Comedy'],
    2,
  ],
  ['The Harbor Inquest', 'Every season, a new body washes ashore.', 2014, ['Mystery', 'Drama'], 3],
  [
    'Saucepan Dynasty',
    'Three generations, one restaurant, endless arguments.',
    2018,
    ['Comedy', 'Drama'],
    3,
  ],
  [
    'The Relay Keepers',
    'Survivors rebuild a radio network after the blackout.',
    2021,
    ['Science fiction', 'Drama'],
    2,
  ],
  ['Parish Lines', 'A small-town priest solves murders between sermons.', 2012, ['Mystery'], 3],
  ['Open Plan', 'Eight desks, no walls, no secrets.', 2020, ['Comedy'], 2],
  [
    'Ninety Nights at Halvard Station',
    'An Antarctic research station waits for spring.',
    2017,
    ['Drama', 'Mystery'],
    2,
  ],
  [
    'Twelve Steps for Toasters',
    'Twelve steps to feeling something.',
    2024,
    ['Science fiction', 'Comedy'],
    1,
  ],
  ['Herring Season at Brackwater', "A fishing family keeps the sea's secrets.", 2010, ['Drama'], 3],
  ['Unclaimed at Platform Six', 'Each item comes with a mystery.', 2015, ['Mystery', 'Comedy'], 2],
  [
    'The Halfway Grandchildren',
    'The grandchildren will land. Probably.',
    2022,
    ['Science fiction', 'Drama'],
    2,
  ],
  [
    'Coldwater Precinct',
    'The quietest station in the state, until now.',
    2011,
    ['Mystery', 'Drama'],
    3,
  ],
  ['The Minivan Custody Rota', 'Three divorced fathers, one shared minivan.', 2016, ['Comedy'], 2],
  [
    'The Archive at the End of Time',
    'Librarians catalog the last days of the universe.',
    2025,
    ['Science fiction'],
    1,
  ],
  [
    'Rye Bread & Reasonable Doubt',
    'Flour on the counter. Fingerprints in the flour.',
    2018,
    ['Mystery', 'Comedy'],
    2,
  ],
  [
    'Tenants of Tower Nine',
    'Every apartment, a different decade.',
    2021,
    ['Science fiction', 'Mystery'],
    2,
  ],
  [
    'Mission Control, Party of Four',
    'A family runs a space program from the garage.',
    2023,
    ['Comedy', 'Science fiction'],
    1,
  ],
  ['The Vineyard Years', 'A family wine business across five decades.', 2009, ['Drama'], 3],
  [
    'Five Mailboxes on Pembrook Close',
    'Five houses, one block party, too many grudges.',
    2015,
    ['Comedy'],
    2,
  ],
  ['Trauma Bay Seven', 'Twelve-hour shifts, no easy cases.', 2012, ['Drama'], 3],
  ['Stamped and Unsolved', 'Undeliverable mail, unsolved crimes.', 2019, ['Mystery', 'Drama'], 2],
  ['Orbital Roommates', 'Six astronauts, one bathroom.', 2020, ['Comedy', 'Science fiction'], 2],
  [
    'The Missing Day at Eldercroft',
    'Students keep disappearing, for exactly one day.',
    2023,
    ['Mystery', 'Drama'],
    2,
  ],
  [
    'Crater Croppers',
    'The first farm on the moon, and its first pests.',
    2024,
    ['Comedy', 'Science fiction'],
    1,
  ],
];

const episodeTitles = [
  'Seventeen Missed Calls from Aunt Odile',
  'The Thermostat Treaty',
  'Somebody Ate the Evidence',
  'A Map Drawn on a Napkin',
  'The Night the Lift Got Stuck',
  'Minutes of the Last Meeting',
  'Nobody Ordered the Anchovies',
  'The Lighthouse Is Blinking Morse',
  'Inventory of a Small Disaster',
  'The Callback Nobody Returned',
  'Two Umbrellas, One Alibi',
  'Signals Before Breakfast',
  'The Final Frame of Reel Nine',
  'Last Orders at the Gullwing',
  'Open House, Locked Basement',
  'Static on Channel Forty',
  'Wet Paint and Dry Humor',
  'The Spare Key Under the Gnome',
  'High Tide at Low Speed',
  'Off the Record, On the Roof',
  'The Fine Print on Page Ninety',
  'Overnight in the Archive',
  'A Blind Spot in the Rearview',
  'Wrong Number, Right Person',
  'The Reunion Nobody Answered',
  'Spring Cleaning in October',
  'Room Service for the Ghost in 214',
  'Lights Out on Pellmore Street',
  'An Audition for a Silent Part',
  'A Grace Period of Eleven Days',
  'Homecoming by Ferry, Again',
  'The Last Word Was a Typo',
  'Missed Connections at Platform Two',
  'Borrowed Time, Overdue Fines',
  'A Clean Slate and a Dirty Window',
  'The Detour Through the Allotments',
  'Common Ground, Uncommon Neighbors',
  'Full Circle on a Square Table',
];

const movies: LibraryItem[] = movieRows.map(([title, subtitle, year, genres], index) => ({
  id: `mov_${slug(title)}`,
  kind: 'movie',
  title,
  subtitle,
  year,
  genres,
  credits: credits(index, movieStudios[index % movieStudios.length]),
  accent: palettes[index % palettes.length],
}));

const shows = showRows.map(([title, subtitle, year, genres, seasonCount], index) => ({
  item: {
    id: `tv_${slug(title)}`,
    kind: 'show',
    title,
    subtitle,
    year,
    genres,
    credits: credits(index, showStudios[index % showStudios.length]),
    accent: palettes[(index + 1) % palettes.length],
  } satisfies CatalogItem,
  seasonCount,
}));

const seasons: Season[] = shows.flatMap(({ item, seasonCount }) =>
  Array.from({ length: seasonCount }, (_, index) => ({
    id: `${item.id}-${index + 1}`,
    showId: item.id,
    number: index + 1,
    title: `Season ${index + 1}`,
  })),
);

// Four to eight episodes a season, with titles that differ within a season.
const episodes: CatalogItem[] = shows.flatMap(({ item: show, seasonCount }, showIndex) =>
  Array.from({ length: seasonCount }, (_, seasonIndex) => seasonIndex + 1).flatMap((seasonNumber) =>
    Array.from({ length: 4 + ((showIndex * 3 + seasonNumber) % 5) }, (_, index) => ({
      id: `ep_${show.id.slice(3)}-${seasonNumber}-${index + 1}` as const,
      kind: 'episode' as const,
      showId: show.id,
      seasonNumber,
      episodeNumber: index + 1,
      title: episodeTitles[(showIndex * 7 + (seasonNumber - 1) * 9 + index) % episodeTitles.length],
      subtitle: `${show.title} · Season ${seasonNumber}, episode ${index + 1}`,
      year: show.year + seasonNumber - 1,
      genres: show.genres,
      credits: show.credits,
      accent: show.accent,
    })),
  ),
);

const items = [...movies, ...shows.map(({ item }) => item), ...episodes];

// Two of every three movies and shows are in the library.
const tracked = [...movies, ...shows.map(({ item }) => item)];
const personalStates: PersonalState[] = tracked
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

const titleEvents: JournalEvent[] = personalStates
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

// The first four shows being watched have one to four first-season episodes logged.
const watching = personalStates.filter(
  (state) => state.status === 'in-progress' && state.itemId.startsWith('tv_'),
);
const episodeEvents: JournalEvent[] = watching.slice(0, 4).flatMap((state, showIndex) =>
  episodes
    .filter(
      (episode) =>
        episode.kind === 'episode' &&
        episode.showId === state.itemId &&
        episode.seasonNumber === 1 &&
        episode.episodeNumber <= showIndex + 1,
    )
    .map((episode, index) => ({
      id: `evt_${episode.id.slice(3)}` as const,
      itemId: episode.id,
      kind: 'episode' as const,
      occurredAt: new Date(Date.UTC(2026, 7, 3 + showIndex * 5 + index, 20)).toISOString(),
      rating: null,
    })),
);

const events = [...titleEvents, ...episodeEvents];

export const tasteTrackSeed: TasteTrackSeed = {
  items,
  seasons,
  contributors: [...people, ...studios],
  personalStates,
  events,
};
