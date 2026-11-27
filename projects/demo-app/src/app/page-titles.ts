import type { LibraryStatus } from './backend';
import { statusLabels } from './status-labels';

/** A browser tab title: the page, what its URL filters, and the app, like `Movies · Drama · TasteTrack`. */
export function tabTitle(...parts: readonly (string | null | false)[]): string {
  return [...parts.filter((part) => !!part), 'TasteTrack'].join(' · ');
}

const quoted = (search: string) => search !== '' && `“${search}”`;
const pageNumber = (page: number) => page > 1 && `page ${page}`;

export function catalogTitle(
  heading: string,
  query: { search: string; genres: readonly string[]; page: number },
): string {
  return tabTitle(heading, quoted(query.search), query.genres.join(', '), pageNumber(query.page));
}

export function libraryTitle(query: {
  search: string;
  statuses: readonly LibraryStatus[];
  page: number;
}): string {
  const statusNames = query.statuses.map((status) => statusLabels[status]).join(', ');
  return tabTitle('Library', statusNames, quoted(query.search), pageNumber(query.page));
}

export function historyTitle(query: {
  search: string;
  from: string | null;
  to: string | null;
  page: number;
}): string {
  return tabTitle(
    'History',
    quoted(query.search),
    query.from && `from ${query.from}`,
    query.to && `to ${query.to}`,
    pageNumber(query.page),
  );
}

export function contributorsTitle(heading: string, query: { search: string }): string {
  return tabTitle(heading, quoted(query.search));
}
