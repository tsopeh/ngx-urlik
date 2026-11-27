import type { LibraryStatus } from './backend';

/** What TasteTrack calls each library status on screen. */
export const statusLabels: Readonly<Record<LibraryStatus, string>> = {
  saved: 'Watchlist',
  'in-progress': 'Watching',
  completed: 'Watched',
};
