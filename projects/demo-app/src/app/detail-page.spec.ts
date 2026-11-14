import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { provideAppRouter } from './app-router';
import { BackendApi, type ItemDetail } from './backend';
import type { PersonalState } from './backend/domain';
import { tasteTrackSeed } from './backend/seed';
import { DetailPage } from './detail-page';

const movie = tasteTrackSeed.items.find((item) => item.kind === 'movie')!;
const state: PersonalState = {
  itemId: movie.id,
  status: 'saved',
  favorite: false,
  rating: 7,
  count: { kind: 'exact', value: 0 },
};

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function setup(backend: Partial<BackendApi>) {
  const detail: ItemDetail = {
    item: movie,
    heading: movie.title,
    isSeason: false,
    state,
    eventCount: 0,
    credits: [],
  };
  TestBed.configureTestingModule({
    providers: [
      provideAppRouter(),
      {
        provide: BackendApi,
        useValue: { getItemDetail: () => of(detail), getSeasons: () => of([]), ...backend },
      },
    ],
  });
  await TestBed.inject(Router).navigateByUrl(`/movies/${movie.id.slice('mov_'.length)}`);
  const fixture = TestBed.createComponent(DetailPage);
  await fixture.whenStable();
  const element = fixture.nativeElement as HTMLElement;
  const selects = element.querySelectorAll('select');
  return {
    fixture,
    status: selects[0],
    rating: selects[1],
    logButton: element.querySelector<HTMLButtonElement>('button.primary')!,
  };
}

describe('DetailPage', () => {
  it('keeps Log viewing off until every running write finishes', async () => {
    const log = deferred();
    const rate = deferred();
    const { fixture, rating, logButton } = await setup({
      logViewing: () => log.promise,
      updatePersonal: () => rate.promise,
    });

    logButton.click();
    rating.value = '9';
    rating.dispatchEvent(new Event('change'));
    rate.resolve();
    await fixture.whenStable();
    // The log still runs, so a second click would log a second viewing.
    expect(logButton.disabled).toBe(true);

    log.resolve();
    await vi.waitFor(async () => {
      await fixture.whenStable();
      expect(logButton.disabled).toBe(false);
    });
  });

  it('shows the saved status again when a status write fails', async () => {
    const { fixture, status } = await setup({
      updatePersonal: () => Promise.reject(new Error('quota')),
    });

    status.value = 'completed';
    status.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(status.value).toBe('saved');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Could not save your changes.',
    );
  });
});
