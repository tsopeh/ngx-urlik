import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NavigationStart, Router } from '@angular/router';
import { createQueryParamsFormGroup, createQueryParamsSignalForm } from 'ngx-urlik/forms';
import { filter } from 'rxjs';
import { defineAppRouter } from './app-router';
import { numberCodec, queryParam, stringCodec } from './params';

@Component({ template: '' })
class Page {}

async function setup() {
  const definition = defineAppRouter(RouteNames, {
    routes: [
      {
        path: 'results',
        routeName: RouteNames.RESULTS,
        queryParams: {
          search: queryParam({ codec: stringCodec(), defaultValue: '' }),
          page: queryParam({ codec: numberCodec(), defaultValue: 1 }),
        },
        component: Page,
      },
      { path: 'other', component: Page },
    ],
  });
  TestBed.configureTestingModule({ providers: [definition.provideAppRouter()] });
  const router = TestBed.inject(Router);
  await router.navigateByUrl('/results');
  return { results: TestBed.inject(definition.AppRouter).routes.RESULTS, router };
}

enum RouteNames {
  A = 'A',
  ABOUT = 'ABOUT',
  B = 'B',
  CATALOG = 'CATALOG',
  CHILD = 'CHILD',
  HOME = 'HOME',
  ITEM = 'ITEM',
  ITEMS = 'ITEMS',
  MOVIES = 'MOVIES',
  RESULTS = 'RESULTS',
  ROOT = 'ROOT',
  SEASONS = 'SEASONS',
}

describe('query forms', () => {
  it('commits a multi-field reactive edit in one navigation', async () => {
    const { results, router } = await setup();
    await router.navigateByUrl('/results?search=old&page=4&campaign=summer');
    const starts: string[] = [];
    router.events.subscribe((event) => {
      if (event instanceof NavigationStart) starts.push(event.url);
    });
    const form = TestBed.runInInjectionContext(() => createQueryParamsFormGroup(results));
    form.patchValue({ search: 'new', page: 1 });

    await vi.waitFor(() => expect(router.url).toBe('/results?search=new&campaign=summer'));
    expect(starts).toEqual(['/results?search=new&campaign=summer']);
    expect(form.getRawValue()).toEqual({ search: 'new', page: 1 });
  });

  it('commits a multi-field signal form edit in one navigation', async () => {
    const { results, router } = await setup();
    const starts: string[] = [];
    router.events.subscribe((event) => {
      if (event instanceof NavigationStart) starts.push(event.url);
    });
    const binding = TestBed.runInInjectionContext(() => createQueryParamsSignalForm(results));
    binding.model.update((query) => ({ ...query, search: 'new', page: 2 }));
    TestBed.flushEffects();

    await vi.waitFor(() => expect(router.url).toBe('/results?search=new&page=2'));
    expect(starts).toEqual(['/results?search=new&page=2']);
  });

  it('keeps a filtered draft until external navigation resets it', async () => {
    const { results, router } = await setup();
    const form = TestBed.runInInjectionContext(() =>
      createQueryParamsFormGroup(results, {
        transformWrites: (changes) => changes.pipe(filter((change) => change.param !== 'search')),
      }),
    );
    form.controls.search.setValue('draft');
    expect(form.controls.search.value).toBe('draft');
    expect(router.url).toBe('/results');

    await router.navigateByUrl('/results?search=external');
    await vi.waitFor(() => expect(form.controls.search.value).toBe('external'));
    expect(form.pristine).toBe(true);
  });

  it('shares the write queue with direct route patches', async () => {
    const { results, router } = await setup();
    const form = TestBed.runInInjectionContext(() => createQueryParamsFormGroup(results));
    form.controls.search.setValue('first');
    const direct = results.patchQuery({ page: 2 });

    expect(await direct).toBe(true);
    await vi.waitFor(() => expect(router.url).toBe('/results?search=first&page=2'));
    expect(form.getRawValue()).toEqual({ search: 'first', page: 2 });
  });
});
