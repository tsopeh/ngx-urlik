import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { TasteTrackRepository } from './database';
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
