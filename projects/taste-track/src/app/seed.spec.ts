import { describe, expect, it } from 'vitest';
import { tasteTrackSeed as seed } from './seed';

describe('movie and TV seed integrity', () => {
  it('resolves every season, episode, credit, and personal record', () => {
    const items = new Map(seed.items.map((item) => [item.id, item]));
    const contributors = new Map(seed.contributors.map((person) => [person.id, person]));
    expect(items.size).toBe(seed.items.length);
    expect(new Set(seed.events.map((event) => event.id)).size).toBe(seed.events.length);
    for (const season of seed.seasons) {
      expect(items.get(season.showId)?.kind).toBe('show');
      expect(
        seed.items.some(
          (item) =>
            item.kind === 'episode' &&
            item.showId === season.showId &&
            item.seasonNumber === season.number,
        ),
      ).toBe(true);
    }
    const episodePaths = new Set<string>();
    for (const item of seed.items) {
      expect(['movie', 'show', 'episode']).toContain(item.kind);
      for (const credit of item.credits) {
        expect(contributors.has(credit.contributorId)).toBe(true);
        expect(contributors.get(credit.contributorId)?.kind).toBe(
          credit.role === 'Production' ? 'company' : 'person',
        );
      }
      if (item.kind === 'episode') {
        expect(
          seed.seasons.some(
            (season) => season.showId === item.showId && season.number === item.seasonNumber,
          ),
        ).toBe(true);
        const path = `${item.showId}/${item.seasonNumber}/${item.episodeNumber}`;
        expect(episodePaths.has(path)).toBe(false);
        episodePaths.add(path);
      }
    }
    for (const state of seed.personalStates) expect(items.has(state.itemId)).toBe(true);
    for (const event of seed.events) {
      expect(items.get(event.itemId)?.kind).toBe(event.kind);
      expect(new Date(event.occurredAt).getUTCFullYear()).toBeGreaterThanOrEqual(
        items.get(event.itemId)!.year,
      );
    }
  });

  it('has enough titles and history to demonstrate pagination without a sprawling catalog', () => {
    expect(seed.items.filter((item) => item.kind === 'movie').length).toBeGreaterThan(24);
    expect(seed.events.length).toBeGreaterThan(24);
    expect(seed.personalStates.some((state) => state.count.kind === 'countless')).toBe(true);
  });
});
