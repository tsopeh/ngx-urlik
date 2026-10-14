import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NavigationStart, Router } from '@angular/router';
import { createQueryParamsFormGroup, createQueryParamsSignalForm } from 'ngx-urlik/forms';
import { AbstractControl, Validators } from '@angular/forms';
import { minLength } from '@angular/forms/signals';
import { defineAppRouter } from './app-router';
import { numberCodec, queryParam, stringCodec, UrlParamCodec } from './params';

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

  it('keeps an invalid draft until external navigation resets it', async () => {
    const { results, router } = await setup();
    const form = TestBed.runInInjectionContext(() =>
      createQueryParamsFormGroup(results, { writeWhen: 'valid' }),
    );
    form.controls.search.addValidators(Validators.minLength(10));
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

  describe('with a normalizing codec', () => {
    const trimmed: UrlParamCodec<string> = {
      serialize: (value) => (typeof value === 'string' ? value.trim() : null),
      deserialize: (raw) => raw.trim(),
    };
    const trimmedSetup = async () => {
      const definition = defineAppRouter(RouteNames, {
        routes: [
          {
            path: 'results',
            routeName: RouteNames.RESULTS,
            queryParams: { search: queryParam({ codec: trimmed, defaultValue: '' }) },
            component: Page,
          },
        ],
      });
      TestBed.configureTestingModule({ providers: [definition.provideAppRouter()] });
      const router = TestBed.inject(Router);
      await router.navigateByUrl('/results');
      return { results: TestBed.inject(definition.AppRouter).routes.RESULTS, router };
    };

    it('keeps a reactive draft that encodes to the committed value', async () => {
      const { results, router } = await trimmedSetup();
      const form = TestBed.runInInjectionContext(() => createQueryParamsFormGroup(results));
      form.controls.search.setValue('elm ');

      await vi.waitFor(() => expect(router.url).toBe('/results?search=elm'));
      TestBed.tick();
      expect(form.controls.search.value).toBe('elm ');

      await router.navigateByUrl('/results?search=oak');
      await vi.waitFor(() => expect(form.controls.search.value).toBe('oak'));
    });

    it('keeps a signal form draft that encodes to the committed value', async () => {
      const { results, router } = await trimmedSetup();
      const binding = TestBed.runInInjectionContext(() => createQueryParamsSignalForm(results));
      binding.model.set({ search: 'elm ' });
      TestBed.tick();

      await vi.waitFor(() => expect(router.url).toBe('/results?search=elm'));
      TestBed.tick();
      expect(binding.model().search).toBe('elm ');
    });
  });

  describe('writeWhen: valid', () => {
    it('holds a reactive field until it is valid and writes an empty value', async () => {
      const { results, router } = await setup();
      const form = TestBed.runInInjectionContext(() =>
        createQueryParamsFormGroup(results, { writeWhen: 'valid' }),
      );
      form.controls.search.addValidators(Validators.minLength(3));

      form.controls.search.setValue('el');
      form.controls.page.setValue(2);
      await vi.waitFor(() => expect(router.url).toBe('/results?page=2'));
      form.controls.search.setValue('elm');
      await vi.waitFor(() => expect(router.url).toBe('/results?page=2&search=elm'));
      form.controls.search.setValue('');
      await vi.waitFor(() => expect(router.url).toBe('/results?page=2'));
    });

    it('writes a reactive field once its async validator passes', async () => {
      const { results, router } = await setup();
      const form = TestBed.runInInjectionContext(() =>
        createQueryParamsFormGroup(results, { writeWhen: 'valid' }),
      );
      let settle!: (errors: null | { taken: true }) => void;
      form.controls.search.addAsyncValidators(
        (_control: AbstractControl) => new Promise((resolve) => (settle = resolve)),
      );

      form.controls.search.setValue('elm');
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(router.url).toBe('/results');
      settle(null);
      await vi.waitFor(() => expect(router.url).toBe('/results?search=elm'));
    });

    it('holds a signal form field until its schema passes', async () => {
      const { results, router } = await setup();
      const binding = TestBed.runInInjectionContext(() =>
        createQueryParamsSignalForm(results, {
          schema: (fields) => minLength(fields.search, 3),
          writeWhen: 'valid',
        }),
      );

      binding.model.update((query) => ({ ...query, search: 'el', page: 2 }));
      TestBed.tick();
      await vi.waitFor(() => expect(router.url).toBe('/results?page=2'));
      binding.model.update((query) => ({ ...query, search: 'elm' }));
      TestBed.tick();
      await vi.waitFor(() => expect(router.url).toBe('/results?page=2&search=elm'));
    });
  });

  describe('reactive debounce', () => {
    it('writes a debounced field after its last change without delaying other fields', async () => {
      const { results, router } = await setup();
      const starts: string[] = [];
      router.events.subscribe((event) => {
        if (event instanceof NavigationStart) starts.push(event.url);
      });
      const form = TestBed.runInInjectionContext(() =>
        createQueryParamsFormGroup(results, { debounce: { search: 200 } }),
      );

      form.controls.search.setValue('e');
      form.controls.search.setValue('el');
      form.controls.page.setValue(2);
      await vi.waitFor(() => expect(router.url).toBe('/results?page=2'));
      form.controls.search.setValue('elm');
      await vi.waitFor(() => expect(router.url).toBe('/results?page=2&search=elm'));
      expect(starts).toEqual(['/results?page=2', '/results?page=2&search=elm']);
    });

    it('drops a pending debounced write when external navigation starts', async () => {
      const { results, router } = await setup();
      const form = TestBed.runInInjectionContext(() =>
        createQueryParamsFormGroup(results, { debounce: { search: 40 } }),
      );

      form.controls.search.setValue('stale');
      await router.navigateByUrl('/results?page=3');
      await new Promise((resolve) => setTimeout(resolve, 80));
      expect(router.url).toBe('/results?page=3');
      expect(form.controls.search.value).toBe('');
    });
  });
});
