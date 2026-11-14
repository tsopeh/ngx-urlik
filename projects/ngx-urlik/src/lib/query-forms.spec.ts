import { Component, computed, ErrorHandler } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Validators } from '@angular/forms';
import { minLength } from '@angular/forms/signals';
import { NavigationStart, Router } from '@angular/router';
import { createQueryParamsFormGroup, createQueryParamsSignalForm } from 'ngx-urlik/forms';
import { defineAppRouter } from './app-router';
import { numberCodec, queryParam, stringCodec, UrlParamCodec } from './params';

@Component({ template: '' })
class Page {}

async function setup() {
  const definition = defineAppRouter(
    { RESULTS: RouteNames.RESULTS },
    {
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
    },
  );
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
      if (event instanceof NavigationStart) {
        starts.push(event.url);
      }
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
      if (event instanceof NavigationStart) {
        starts.push(event.url);
      }
    });
    const binding = TestBed.runInInjectionContext(() => createQueryParamsSignalForm(results));
    binding.model.update((query) => ({ ...query, search: 'new', page: 2 }));
    TestBed.flushEffects();

    await vi.waitFor(() => expect(router.url).toBe('/results?search=new&page=2'));
    expect(starts).toEqual(['/results?search=new&page=2']);
  });

  it('keeps a held draft when a navigation changes that field', async () => {
    const { results, router } = await setup();
    const form = TestBed.runInInjectionContext(() =>
      createQueryParamsFormGroup(results, { writeWhen: 'valid' }),
    );
    form.controls.search.addValidators(Validators.minLength(10));
    form.controls.search.setValue('draft');
    expect(form.controls.search.value).toBe('draft');
    expect(router.url).toBe('/results');

    await router.navigateByUrl('/results?search=external');
    TestBed.flushEffects();
    expect(form.controls.search.value).toBe('draft');
  });

  it('keeps the draft and reports a decline when a same-turn patch cancels the write', async () => {
    const { results, router } = await setup();
    const onWriteFailure = vi.fn();
    const form = TestBed.runInInjectionContext(() =>
      createQueryParamsFormGroup(results, { onWriteFailure }),
    );
    form.controls.search.setValue('first');
    const direct = results.patchQuery({ page: 2 });

    expect(await direct).toBe(true);
    expect(router.url).toBe('/results?page=2');
    await vi.waitFor(() => expect(onWriteFailure).toHaveBeenCalledWith({ kind: 'declined' }));
    TestBed.flushEffects();
    // The form keeps the draft, but the URL never gets it.
    expect(form.getRawValue()).toEqual({ search: 'first', page: 2 });
  });

  it("doesn't report a decline when the user's next edit replaces the write", async () => {
    const { results, router } = await setup();
    const onWriteFailure = vi.fn();
    const write = vi.spyOn(results, 'patchQuery');
    const form = TestBed.runInInjectionContext(() =>
      createQueryParamsFormGroup(results, { onWriteFailure }),
    );
    form.controls.search.setValue('e');
    form.controls.search.setValue('el');

    // The first write is cancelled, but the second one carries the newer value.
    expect(await write.mock.results[0].value).toBe(false);
    expect(await write.mock.results[1].value).toBe(true);
    expect(router.url).toBe('/results?search=el');
    expect(onWriteFailure).not.toHaveBeenCalled();
  });

  describe('with a normalizing codec', () => {
    const trimmed: UrlParamCodec<string> = {
      serialize: (value) => (typeof value === 'string' ? value.trim() : null),
      deserialize: (raw) => raw.trim(),
    };
    const trimmedSetup = async () => {
      const definition = defineAppRouter(
        { RESULTS: RouteNames.RESULTS },
        {
          routes: [
            {
              path: 'results',
              routeName: RouteNames.RESULTS,
              queryParams: { search: queryParam({ codec: trimmed, defaultValue: '' }) },
              component: Page,
            },
          ],
        },
      );
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

    it("doesn't report a decline when the URL already holds the write", async () => {
      const { results, router } = await trimmedSetup();
      await router.navigateByUrl('/results?search=elm');
      const onWriteFailure = vi.fn();
      const write = vi.spyOn(results, 'patchQuery');
      const form = TestBed.runInInjectionContext(() =>
        createQueryParamsFormGroup(results, { onWriteFailure }),
      );
      form.controls.search.setValue('elm ');

      // The URL wouldn't change, so patchQuery() doesn't navigate.
      expect(await write.mock.results[0].value).toBe(true);
      expect(router.url).toBe('/results?search=elm');
      expect(onWriteFailure).not.toHaveBeenCalled();
      expect(form.controls.search.value).toBe('elm ');
    });
  });

  it("doesn't write a form edit that goes back to the URL's value", async () => {
    const { results, router } = await setup();
    await router.navigateByUrl('/results?search=elm');
    const write = vi.spyOn(results, 'patchQuery');
    const form = TestBed.runInInjectionContext(() =>
      createQueryParamsFormGroup(results, { debounce: { search: 20 } }),
    );
    let runs = 0;
    const query = computed(() => {
      runs++;
      return results.params().query;
    });
    const before = results.params();
    query();

    // The user types a letter and deletes it before the debounce ends.
    form.controls.search.setValue('elms');
    form.controls.search.setValue('elm');
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(write).not.toHaveBeenCalled();
    TestBed.tick();
    expect(results.params()).toBe(before);
    query();
    expect(runs).toBe(1);
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

    it("doesn't report a decline when a held field goes back to its URL value", async () => {
      const { results, router } = await setup();
      const onWriteFailure = vi.fn();
      const write = vi.spyOn(results, 'patchQuery');
      const form = TestBed.runInInjectionContext(() =>
        createQueryParamsFormGroup(results, { writeWhen: 'valid', onWriteFailure }),
      );
      form.controls.search.addValidators(Validators.minLength(3));

      form.controls.search.setValue('e');
      form.controls.search.setValue('');

      expect(write).not.toHaveBeenCalled();
      expect(router.url).toBe('/results');
      expect(onWriteFailure).not.toHaveBeenCalled();
    });

    it('writes a reactive field once its async validator passes', async () => {
      const { results, router } = await setup();
      const form = TestBed.runInInjectionContext(() =>
        createQueryParamsFormGroup(results, { writeWhen: 'valid' }),
      );
      let settle!: (errors: null | { taken: true }) => void;
      form.controls.search.addAsyncValidators(() => new Promise((resolve) => (settle = resolve)));

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
        if (event instanceof NavigationStart) {
          starts.push(event.url);
        }
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

    it('writes a debounced field on top of a navigation that lands during its delay', async () => {
      const { results, router } = await setup();
      const form = TestBed.runInInjectionContext(() =>
        createQueryParamsFormGroup(results, { debounce: { search: 40 } }),
      );

      form.controls.search.setValue('stale');
      await router.navigateByUrl('/results?page=3');
      await vi.waitFor(() => expect(router.url).toBe('/results?page=3&search=stale'));
      expect(form.controls.search.value).toBe('stale');
    });
  });

  describe('beforeWrite', () => {
    const resetPage = <P extends { search?: string; page?: number }>(patch: P): P =>
      'search' in patch ? { page: 1, ...patch } : patch;

    it('resets the page in the same reactive write as a debounced search', async () => {
      const { results, router } = await setup();
      await router.navigateByUrl('/results?page=4');
      const starts: string[] = [];
      router.events.subscribe((event) => {
        if (event instanceof NavigationStart) {
          starts.push(event.url);
        }
      });
      const form = TestBed.runInInjectionContext(() =>
        createQueryParamsFormGroup(results, { debounce: { search: 40 }, beforeWrite: resetPage }),
      );

      form.controls.search.setValue('el');
      form.controls.search.setValue('elm');
      await vi.waitFor(() => expect(router.url).toBe('/results?search=elm'));
      expect(starts).toEqual(['/results?search=elm']);
      await vi.waitFor(() => expect(form.controls.page.value).toBe(1));
      expect(form.controls.search.value).toBe('elm');

      form.controls.page.setValue(3);
      await vi.waitFor(() => expect(router.url).toBe('/results?search=elm&page=3'));
      expect(starts).toEqual(['/results?search=elm', '/results?search=elm&page=3']);
    });

    it('resets the page in the same signal form write as a search', async () => {
      const { results, router } = await setup();
      await router.navigateByUrl('/results?page=4');
      const starts: string[] = [];
      router.events.subscribe((event) => {
        if (event instanceof NavigationStart) {
          starts.push(event.url);
        }
      });
      const binding = TestBed.runInInjectionContext(() =>
        createQueryParamsSignalForm(results, { beforeWrite: resetPage }),
      );

      binding.model.update((query) => ({ ...query, search: 'elm' }));
      TestBed.tick();
      await vi.waitFor(() => expect(router.url).toBe('/results?search=elm'));
      expect(starts).toEqual(['/results?search=elm']);
      await vi.waitFor(() => expect(binding.model()).toEqual({ search: 'elm', page: 1 }));
    });

    it("doesn't reset the page when a debounced search ends where it started", async () => {
      const { results, router } = await setup();
      await router.navigateByUrl('/results?search=oak&page=3');
      const form = TestBed.runInInjectionContext(() =>
        createQueryParamsFormGroup(results, { debounce: { search: 20 }, beforeWrite: resetPage }),
      );

      form.controls.search.setValue('oakx');
      form.controls.search.setValue('oak');
      await new Promise((resolve) => setTimeout(resolve, 60));
      expect(router.url).toBe('/results?search=oak&page=3');
      expect(form.getRawValue()).toEqual({ search: 'oak', page: 3 });
    });

    it("doesn't reset the page when a held search goes back to its URL value", async () => {
      const { results, router } = await setup();
      await router.navigateByUrl('/results?page=3');
      const form = TestBed.runInInjectionContext(() =>
        createQueryParamsFormGroup(results, { writeWhen: 'valid', beforeWrite: resetPage }),
      );
      form.controls.search.addValidators(Validators.minLength(3));

      form.controls.search.setValue('a');
      form.controls.search.setValue('');
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(router.url).toBe('/results?page=3');
      expect(form.getRawValue()).toEqual({ search: '', page: 3 });
    });

    it('still writes a search that goes back to its URL value while its write runs', async () => {
      const { results, router } = await setup();
      await router.navigateByUrl('/results?search=oak&page=3');
      const form = TestBed.runInInjectionContext(() =>
        createQueryParamsFormGroup(results, { beforeWrite: resetPage }),
      );

      // The first write is still running, so going back to 'oak' must cancel it.
      form.controls.search.setValue('elm');
      form.controls.search.setValue('oak');
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(router.url).toBe('/results?search=oak');
      expect(form.controls.search.value).toBe('oak');
    });

    it('reports a throwing beforeWrite and skips the write', async () => {
      const { results, router } = await setup();
      const handleError = vi.spyOn(TestBed.inject(ErrorHandler), 'handleError');
      const failure = new Error('beforeWrite failed');
      const starts: string[] = [];
      router.events.subscribe((event) => {
        if (event instanceof NavigationStart) {
          starts.push(event.url);
        }
      });
      const form = TestBed.runInInjectionContext(() =>
        createQueryParamsFormGroup(results, {
          beforeWrite: () => {
            throw failure;
          },
        }),
      );

      form.controls.search.setValue('elm');
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(handleError).toHaveBeenCalledWith(failure);
      expect(starts).toEqual([]);
      expect(router.url).toBe('/results');
      expect(form.controls.search.value).toBe('elm');
    });
  });
});
