import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { type StoredState, TasteTrackRepository, withoutEpisodeEntries } from './database';
import { tasteTrackSeed } from './seed';

describe('TasteTrackRepository', () => {
  it("resolves a committed write even when the reload after it fails, so a retry can't repeat it", async () => {
    const repository = TestBed.inject(TasteTrackRepository);
    const database = (repository as unknown as { database: { transaction: unknown } }).database;
    database.transaction = vi.fn(async () => undefined);
    vi.spyOn(repository, 'reload').mockRejectedValue(new Error('closed'));
    const movie = tasteTrackSeed.items.find((item) => item.kind === 'movie')!;

    await expect(repository.logViewing(movie, '2026-11-11')).resolves.toBeUndefined();
    expect(repository.error()).toContain('Your changes are saved');
  });
});

describe('withoutEpisodeEntries', () => {
  const entry = (itemId: string, status: StoredState['status']): StoredState => ({
    itemId,
    status,
    favorite: false,
    rating: null,
    count: { kind: 'exact', value: 0 },
  });
  const movie = entry('mov_quillons-last-inference', 'completed');

  it('moves episode entries to their show, which becomes Watching', () => {
    const states = [
      movie,
      entry('ep_paperweight-and-sons-1-1', 'completed'),
      entry('ep_paperweight-and-sons-1-2', 'saved'),
    ];

    expect(withoutEpisodeEntries(states, tasteTrackSeed.items)).toEqual([
      movie,
      entry('tv_paperweight-and-sons', 'in-progress'),
    ]);
  });

  it('puts a show on the watchlist when its episodes were only on the watchlist', () => {
    const states = [entry('ep_paperweight-and-sons-1-1', 'saved')];

    expect(withoutEpisodeEntries(states, tasteTrackSeed.items)).toEqual([
      entry('tv_paperweight-and-sons', 'saved'),
    ]);
  });

  it("keeps a show's own entry as it is", () => {
    const show = entry('tv_paperweight-and-sons', 'completed');
    const states = [show, entry('ep_paperweight-and-sons-1-1', 'in-progress')];

    expect(withoutEpisodeEntries(states, tasteTrackSeed.items)).toEqual([show]);
  });
});
