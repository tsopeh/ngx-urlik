import {
  Component,
  computed,
  createEnvironmentInjector,
  EnvironmentInjector,
  ErrorHandler,
  runInInjectionContext,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Validators } from '@angular/forms';
import { debounce, minLength } from '@angular/forms/signals';
import { NavigationEnd, NavigationStart, Router } from '@angular/router';
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
        // A page whose chunk takes 50 ms to load.
        {
          path: 'slow',
          loadComponent: () => new Promise((resolve) => setTimeout(() => resolve(Page), 50)),
        },
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

  it("resets a created form group to the route's defaults", async () => {
    const { results, router } = await setup();
    await router.navigateByUrl('/results?search=oak&page=3');
    const form = TestBed.runInInjectionContext(() => createQueryParamsFormGroup(results));

    form.reset();
    expect(form.getRawValue()).toEqual({ search: '', page: 1 });
    await vi.waitFor(() => expect(router.url).toBe('/results'));
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

  it('adds up a form edit and a patch made in the same step', async () => {
    const { results, router } = await setup();
    const onWriteFailure = vi.fn();
    const form = TestBed.runInInjectionContext(() =>
      createQueryParamsFormGroup(results, { onWriteFailure }),
    );
    form.controls.search.setValue('first');
    const direct = results.patchQuery({ page: 2 });

    expect(await direct).toBe(true);
    expect(router.url).toBe('/results?search=first&page=2');
    expect(onWriteFailure).not.toHaveBeenCalled();
  });

  it('writes only the edited field over a patch that just landed', async () => {
    const { results, router } = await setup();
    const { model } = TestBed.runInInjectionContext(() => createQueryParamsSignalForm(results));
    model.update((query) => ({ ...query, search: 'elm' }));
    await results.patchQuery({ page: 2 });

    // The patch lands before the form writes. The form still shows page 1, but nobody edited it.
    await vi.waitFor(() => expect(router.url).toBe('/results?page=2&search=elm'));
    expect(model()).toEqual({ search: 'elm', page: 2 });
  });

  it('keeps the draft and reports a decline when a navigation cancels the write', async () => {
    const { results, router } = await setup();
    const onWriteFailure = vi.fn();
    const form = TestBed.runInInjectionContext(() =>
      createQueryParamsFormGroup(results, { onWriteFailure }),
    );
    form.controls.search.setValue('first');
    const direct = router.navigateByUrl('/results?page=2');

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

    // The second write overtakes the first and carries its field, so both resolve true.
    expect(await write.mock.results[0].value).toBe(true);
    expect(await write.mock.results[1].value).toBe(true);
    expect(router.url).toBe('/results?search=el');
    expect(onWriteFailure).not.toHaveBeenCalled();
  });

  it('writes a draft that a navigation cancelled with the next change', async () => {
    const { results, router } = await setup();
    const form = TestBed.runInInjectionContext(() => createQueryParamsFormGroup(results));
    form.controls.search.setValue('first');
    await router.navigateByUrl('/results?page=2');
    TestBed.flushEffects();
    expect(router.url).toBe('/results?page=2');

    form.controls.page.setValue(3);
    await vi.waitFor(() => expect(router.url).toBe('/results?page=3&search=first'));
  });

  it('follows a URL change that is written into a signal form in one effect run', async () => {
    const { results, router } = await setup();
    let reads = 0;
    const counted = {
      params: () => {
        reads++;
        return results.params();
      },
      patchQuery: results.patchQuery.bind(results),
    } as typeof results;
    const binding = TestBed.runInInjectionContext(() => createQueryParamsSignalForm(counted));
    TestBed.flushEffects();

    // The binding writes the new search into the form from inside its URL effect. That write
    // must not make the effect follow the form, or it runs a second time after the write.
    reads = 0;
    await router.navigateByUrl('/results?search=b');
    TestBed.flushEffects();

    expect(binding.model().search).toBe('b');
    expect(reads).toBe(1);
  });

  describe('with an object field', () => {
    type Sort = { readonly field: string; readonly direction: 'asc' | 'desc' };
    const sortCodec: UrlParamCodec<Sort> = {
      serialize: (value) => `${value.field}:${value.direction}`,
      deserialize: (raw) => {
        const [field, direction] = raw.split(':');
        return direction === 'asc' || direction === 'desc' ? { field, direction } : null;
      },
    };
    const sortSetup = async () => {
      const definition = defineAppRouter(
        { RESULTS: RouteNames.RESULTS },
        {
          routes: [
            {
              path: 'results',
              routeName: RouteNames.RESULTS,
              queryParams: {
                sort: queryParam({
                  codec: sortCodec,
                  defaultValue: { field: 'title', direction: 'asc' },
                }),
                page: queryParam({ codec: numberCodec(), defaultValue: 1 }),
              },
              component: Page,
            },
          ],
        },
      );
      TestBed.configureTestingModule({ providers: [definition.provideAppRouter()] });
      const router = TestBed.inject(Router);
      await router.navigateByUrl('/results?sort=year:desc');
      return { results: TestBed.inject(definition.AppRouter).routes.RESULTS, router };
    };

    it('takes the URL value back after picking the sort that is already chosen', async () => {
      const { results, router } = await sortSetup();
      const onWriteFailure = vi.fn();
      const written: string[][] = [];
      const form = TestBed.runInInjectionContext(() =>
        createQueryParamsFormGroup(results, {
          onWriteFailure,
          beforeWrite: (patch) => {
            written.push(Object.keys(patch));
            return patch;
          },
        }),
      );

      // A new object with the same text. The URL wouldn't change, so patchQuery() doesn't navigate.
      form.controls.sort.setValue({ field: 'year', direction: 'desc' });
      await vi.waitFor(() => expect(form.controls.sort.value).toBe(results.params().query.sort));
      expect(onWriteFailure).not.toHaveBeenCalled();

      form.controls.page.setValue(2);
      await vi.waitFor(() => expect(router.url).toBe('/results?sort=year:desc&page=2'));
      expect(written).toEqual([['sort'], ['page']]);
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

    it('writes a disabled reactive field that changes', async () => {
      const { results, router } = await setup();
      const form = TestBed.runInInjectionContext(() =>
        createQueryParamsFormGroup(results, { writeWhen: 'valid' }),
      );
      form.controls.search.disable();

      form.controls.search.setValue('elm');
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

  describe('debounce', () => {
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

    it('writes a debounced field on top of a navigation that changes other fields', async () => {
      const { results, router } = await setup();
      const form = TestBed.runInInjectionContext(() =>
        createQueryParamsFormGroup(results, { debounce: { search: 40 } }),
      );

      form.controls.search.setValue('stale');
      await router.navigateByUrl('/results?page=3');
      await vi.waitFor(() => expect(router.url).toBe('/results?page=3&search=stale'));
      expect(form.controls.search.value).toBe('stale');
    });

    it('lets the user leave while a debounced edit waits', async () => {
      const { results, router } = await setup();
      const form = TestBed.runInInjectionContext(() =>
        createQueryParamsFormGroup(results, { debounce: { search: 10 } }),
      );

      // The delay ends while the next page still loads, and the write must not cancel that
      // navigation.
      form.controls.search.setValue('elm');
      expect(await router.navigateByUrl('/slow')).toBe(true);
      expect(router.url).toBe('/slow');
    });

    it('drops a debounced reactive edit when a navigation changes that field', async () => {
      const { results, router } = await setup();
      const form = TestBed.runInInjectionContext(() =>
        createQueryParamsFormGroup(results, { debounce: { search: 40 } }),
      );

      // The user types, then presses Back to a URL with another search before the delay ends.
      form.controls.search.setValue('elm');
      await router.navigateByUrl('/results?search=oak');
      TestBed.flushEffects();
      expect(form.controls.search.value).toBe('oak');

      await new Promise((resolve) => setTimeout(resolve, 80));
      expect(router.url).toBe('/results?search=oak');
    });

    it('drops a debounced signal form edit when a navigation changes that field', async () => {
      const { results, router } = await setup();
      const { form } = TestBed.runInInjectionContext(() =>
        createQueryParamsSignalForm(results, { schema: (fields) => debounce(fields.search, 40) }),
      );

      // controlValue is what an input bound with [formField] sets on each keystroke.
      form.search().controlValue.set('elm');
      await router.navigateByUrl('/results?search=oak');
      TestBed.flushEffects();
      expect(form.search().controlValue()).toBe('oak');

      await new Promise((resolve) => setTimeout(resolve, 80));
      expect(router.url).toBe('/results?search=oak');
    });

    it.each(['after', 'before'])(
      "keeps a debounced edit when that field's earlier write lands, if the form follows the URL %s the write settles",
      async (order) => {
        const { results, router } = await setup();
        const form = TestBed.runInInjectionContext(() =>
          createQueryParamsFormGroup(results, { debounce: { search: 20 } }),
        );
        const starts: string[] = [];
        router.events.subscribe((event) => {
          if (event instanceof NavigationStart) {
            starts.push(event.url);
            // The user types again while the write of 'el' runs.
            if (event.url === '/results?search=el') {
              form.controls.search.setValue('elm');
            }
          }
          if (event instanceof NavigationEnd && order === 'before') {
            TestBed.flushEffects();
          }
        });

        form.controls.search.setValue('el');
        await vi.waitFor(() => expect(router.url).toBe('/results?search=elm'));
        expect(starts).toEqual(['/results?search=el', '/results?search=elm']);
        expect(form.controls.search.value).toBe('elm');
      },
    );
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

    it('keeps the page when a search goes back to its URL value while its write runs', async () => {
      const { results, router } = await setup();
      await router.navigateByUrl('/results?search=oak&page=3');
      const form = TestBed.runInInjectionContext(() =>
        createQueryParamsFormGroup(results, { beforeWrite: resetPage }),
      );

      // The 'elm' write is still running. Going back to 'oak' writes the search, and the page the
      // reset changed, back to their URL values.
      form.controls.search.setValue('elm');
      form.controls.search.setValue('oak');
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(router.url).toBe('/results?search=oak&page=3');
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

  describe('failures', () => {
    it('sends errors to ErrorHandler without onWriteFailure, and keeps declines silent', async () => {
      const { results, router } = await setup();
      const handleError = vi.spyOn(TestBed.inject(ErrorHandler), 'handleError');
      const form = TestBed.runInInjectionContext(() => createQueryParamsFormGroup(results));

      form.controls.search.setValue('first');
      await router.navigateByUrl('/results?page=2');
      await vi.waitFor(() => expect(router.url).toBe('/results?page=2'));
      expect(handleError).not.toHaveBeenCalled();

      await router.navigateByUrl('/other');
      form.controls.search.setValue('lost');
      await vi.waitFor(() => expect(handleError).toHaveBeenCalledTimes(1));
      expect(handleError.mock.calls[0][0]).toEqual(
        new Error(
          "RESULTS: route 'results' isn't active, so it has no params to read. Check ifActive() first.",
        ),
      );
    });

    it('keeps its values when its route stops showing, and reports an edit then as an error', async () => {
      const { results, router } = await setup();
      await router.navigateByUrl('/results?search=oak');
      const onWriteFailure = vi.fn();
      const form = TestBed.runInInjectionContext(() =>
        createQueryParamsFormGroup(results, { onWriteFailure }),
      );

      await router.navigateByUrl('/other');
      TestBed.flushEffects();
      expect(form.getRawValue()).toEqual({ search: 'oak', page: 1 });

      form.controls.search.setValue('elm');
      await vi.waitFor(() =>
        expect(onWriteFailure).toHaveBeenCalledWith({ kind: 'error', error: expect.any(Error) }),
      );
      expect(router.url).toBe('/other');
      expect(form.controls.search.value).toBe('elm');
    });
  });

  describe('lifetime', () => {
    const createIn = <T>(injector: EnvironmentInjector, create: () => T): T =>
      runInInjectionContext(injector, create);

    it('drops an edit still waiting for its debounce when it is destroyed', async () => {
      const { results, router } = await setup();
      const injector = createEnvironmentInjector([], TestBed.inject(EnvironmentInjector));
      const form = createIn(injector, () =>
        createQueryParamsFormGroup(results, { debounce: { search: 20 } }),
      );

      form.controls.search.setValue('elm');
      injector.destroy();
      await new Promise((resolve) => setTimeout(resolve, 60));

      expect(router.url).toBe('/results');
    });

    it('lets a write that already started finish, and reports nothing after it is destroyed', async () => {
      const { results, router } = await setup();
      const injector = createEnvironmentInjector([], TestBed.inject(EnvironmentInjector));
      const onWriteFailure = vi.fn();
      const form = createIn(injector, () =>
        createQueryParamsFormGroup(results, { onWriteFailure }),
      );

      const write = vi.spyOn(results, 'patchQuery');

      form.controls.search.setValue('elm');
      expect(write).toHaveBeenCalledWith({ search: 'elm' }, { replaceUrl: true });
      const cancelling = router.navigateByUrl('/results?page=2');
      injector.destroy();
      await cancelling;
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(router.url).toBe('/results?page=2');
      expect(onWriteFailure).not.toHaveBeenCalled();
    });

    it('reports nothing for a write that fails after it is destroyed', async () => {
      const { results, router } = await setup();
      const injector = createEnvironmentInjector([], TestBed.inject(EnvironmentInjector));
      const onWriteFailure = vi.fn();
      const form = createIn(injector, () =>
        createQueryParamsFormGroup(results, { onWriteFailure }),
      );
      await router.navigateByUrl('/other');

      form.controls.search.setValue('elm');
      injector.destroy();
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(onWriteFailure).not.toHaveBeenCalled();
    });

    it('stops following the URL when it is destroyed', async () => {
      const { results, router } = await setup();
      const injector = createEnvironmentInjector([], TestBed.inject(EnvironmentInjector));
      const form = createIn(injector, () => createQueryParamsFormGroup(results));

      injector.destroy();
      await router.navigateByUrl('/results?search=after');
      TestBed.flushEffects();

      expect(form.controls.search.value).toBe('');
    });
  });
});
