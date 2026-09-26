import {
  Component,
  createEnvironmentInjector,
  EnvironmentInjector,
  ErrorHandler,
  runInInjectionContext,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { CanActivateFn, NavigationStart, Router } from '@angular/router';
import {
  defineAppRouter,
  numberCodec,
  queryParam,
  repeatedQueryParam,
  stringCodec,
} from 'ngx-urlik';
import {
  bindQueryParamsToFormGroup,
  createQueryParamsFormGroup,
  createQueryParamsSignalForm,
} from 'ngx-urlik/forms';
import { debounceTime, filter, groupBy, map, mergeMap, tap } from 'rxjs';

@Component({ template: '' })
class Page {}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

async function setup(
  guard: CanActivateFn = () => true,
  isEqual?: (a: unknown, b: unknown) => boolean,
) {
  const definition = defineAppRouter({
    routes: {
      ROOT: {
        path: '',
        isEqual,
        queryParams: {
          search: queryParam({ codec: stringCodec(), defaultValue: '' }),
          page: queryParam({ codec: numberCodec(), defaultValue: 1 }),
          roles: repeatedQueryParam({ codec: stringCodec() }),
        },
        children: {
          RESULTS: {
            path: 'results',
            angular: { component: Page, canActivate: [guard], runGuardsAndResolvers: 'always' },
          },
          OTHER: { path: 'other', angular: { component: Page } },
        },
      },
    },
  });
  const handleError = vi.fn();
  TestBed.configureTestingModule({
    providers: [
      definition.provideAppRouter(),
      { provide: ErrorHandler, useValue: { handleError } },
    ],
  });
  const routes = TestBed.inject(definition.AppRouter);
  const router = TestBed.inject(Router);
  await router.navigateByUrl('/results');
  return { routes, router, handleError };
}

const groupedDelay = <T extends { param: PropertyKey }>(changes: import('rxjs').Observable<T>) =>
  changes.pipe(
    groupBy((change) => change.param),
    mergeMap((group) => (group.key === 'search' ? group.pipe(debounceTime(300)) : group)),
  );

afterEach(() => vi.useRealTimers());

describe('query form bindings', () => {
  it('commits a multi-field reactive form edit in one navigation', async () => {
    const { routes, router } = await setup();
    await router.navigateByUrl('/results?search=old&page=4&unknown=keep');
    const starts: string[] = [];
    router.events.subscribe((event) => {
      if (event instanceof NavigationStart) starts.push(event.url);
    });
    const form = TestBed.runInInjectionContext(() => createQueryParamsFormGroup(routes.ROOT));
    form.patchValue({ search: 'new', page: 1 });
    await vi.waitFor(() => expect(router.url).toBe('/results?search=new&unknown=keep'));
    expect(starts).toEqual(['/results?search=new&unknown=keep']);
  });

  it('commits a multi-field signal form edit in one navigation', async () => {
    const { routes, router } = await setup();
    await router.navigateByUrl('/results?search=old&page=4&unknown=keep');
    const starts: string[] = [];
    router.events.subscribe((event) => {
      if (event instanceof NavigationStart) starts.push(event.url);
    });
    const binding = TestBed.runInInjectionContext(() => createQueryParamsSignalForm(routes.ROOT));
    binding.model.update((query) => ({ ...query, search: 'new', page: 1 }));
    TestBed.flushEffects();
    await vi.waitFor(() => expect(router.url).toBe('/results?search=new&unknown=keep'));
    expect(starts).toEqual(['/results?search=new&unknown=keep']);
  });

  it('batches only transformed fields emitted synchronously by one form edit', async () => {
    const { routes, router } = await setup();
    const starts: string[] = [];
    router.events.subscribe((event) => {
      if (event instanceof NavigationStart) starts.push(event.url);
    });
    const form = TestBed.runInInjectionContext(() =>
      createQueryParamsFormGroup(routes.ROOT, {
        transformWrites: (changes) =>
          changes.pipe(
            filter((change) => change.param !== 'roles'),
            map((change) =>
              change.param === 'search' ? { ...change, value: change.value.trim() } : change,
            ),
          ),
      }),
    );
    form.patchValue({ search: ' new ', page: 2, roles: ['staged'] });
    await vi.waitFor(() => expect(router.url).toBe('/results?search=new&page=2'));
    expect(starts).toEqual(['/results?search=new&page=2']);
    expect(form.getRawValue()).toEqual({ search: 'new', page: 2, roles: ['staged'] });
  });

  it('keeps a delayed field out of the immediate batch from the same edit', async () => {
    const { routes, router } = await setup();
    await router.navigateByUrl('/results?search=old&page=4');
    vi.useFakeTimers();
    const starts: string[] = [];
    router.events.subscribe((event) => {
      if (event instanceof NavigationStart) starts.push(event.url);
    });
    const form = TestBed.runInInjectionContext(() =>
      createQueryParamsFormGroup(routes.ROOT, { transformWrites: groupedDelay }),
    );
    form.patchValue({ search: 'new', page: 1, roles: ['admin'] });
    await vi.advanceTimersByTimeAsync(0);
    expect(starts).toEqual(['/results?search=old&roles=admin']);
    expect(form.controls.search.value).toBe('new');
    await vi.advanceTimersByTimeAsync(300);
    expect(starts).toEqual(['/results?search=old&roles=admin', '/results?search=new&roles=admin']);
    expect(router.url).toBe('/results?search=new&roles=admin');
  });

  it('preserves submission order between separate form edits and direct writes', async () => {
    const { routes, router } = await setup();
    const starts: string[] = [];
    router.events.subscribe((event) => {
      if (event instanceof NavigationStart) starts.push(event.url);
    });
    const form = TestBed.runInInjectionContext(() => createQueryParamsFormGroup(routes.ROOT));
    form.patchValue({ search: 'first', page: 2 });
    const direct = routes.ROOT.patchQuery((q) => ({ ...q, roles: ['admin'] }));
    form.patchValue({ search: 'second', page: 3 });
    await direct;
    await vi.waitFor(() => expect(router.url).toBe('/results?search=second&page=3&roles=admin'));
    expect(starts).toEqual([
      '/results?search=first&page=2',
      '/results?search=first&page=2&roles=admin',
      '/results?search=second&page=3&roles=admin',
    ]);
    expect(form.getRawValue()).toEqual({ search: 'second', page: 3, roles: ['admin'] });
  });

  it('writes controls with replacement history and preserves interaction state', async () => {
    const { routes, router } = await setup();
    const history: (boolean | undefined)[] = [];
    router.events.subscribe((event) => {
      if (event instanceof NavigationStart)
        history.push(router.currentNavigation()?.extras.replaceUrl);
    });
    const form = TestBed.runInInjectionContext(() => createQueryParamsFormGroup(routes.ROOT));
    form.markAsDirty();
    form.markAllAsTouched();
    form.controls.search.setValue('angular');
    await vi.waitFor(() => expect(router.url).toBe('/results?search=angular'));
    TestBed.flushEffects();
    expect(form.dirty).toBe(true);
    expect(form.touched).toBe(true);
    expect(history).toEqual([true]);
  });

  it('shares the queue across two bindings and a direct writer', async () => {
    const { routes, router } = await setup();
    const first = TestBed.runInInjectionContext(() => createQueryParamsFormGroup(routes.ROOT));
    const second = TestBed.runInInjectionContext(() =>
      createQueryParamsFormGroup(routes.ROOT.RESULTS),
    );
    first.controls.search.setValue('angular');
    second.controls.page.setValue(2);
    await routes.ROOT.patchQuery((q) => ({ ...q, roles: ['admin'] }));
    TestBed.flushEffects();
    expect(router.url).toBe('/results?search=angular&page=2&roles=admin');
    expect(first.getRawValue()).toEqual({ search: 'angular', page: 2, roles: ['admin'] });
    expect(second.getRawValue()).toEqual(first.getRawValue());
  });

  it('preserves edits made while a prior form write is waiting on a guard', async () => {
    const entered = deferred<void>();
    const release = deferred<boolean>();
    let hold = false;
    const { routes, router } = await setup(() => {
      if (!hold) return true;
      entered.resolve();
      return release.promise;
    });
    const form = TestBed.runInInjectionContext(() => createQueryParamsFormGroup(routes.ROOT));
    hold = true;
    form.controls.page.setValue(2);
    await entered.promise;
    form.controls.search.setValue('new');
    form.controls.page.setValue(3);
    hold = false;
    release.resolve(true);
    await vi.waitFor(() => expect(router.url).toBe('/results?page=3&search=new'));
    expect(form.getRawValue()).toEqual({ search: 'new', page: 3, roles: [] });
  });

  it('preserves a debounced field when another binding writes an unrelated field', async () => {
    const { routes, router } = await setup();
    vi.useFakeTimers();
    const first = TestBed.runInInjectionContext(() =>
      createQueryParamsFormGroup(routes.ROOT, { transformWrites: groupedDelay }),
    );
    const second = TestBed.runInInjectionContext(() => createQueryParamsFormGroup(routes.ROOT));
    first.controls.search.setValue('delayed');
    second.controls.page.setValue(2);
    await vi.advanceTimersByTimeAsync(0);
    expect(router.url).toBe('/results?page=2');
    expect(first.getRawValue()).toEqual({ search: 'delayed', page: 2, roles: [] });
    await vi.advanceTimersByTimeAsync(300);
    expect(router.url).toBe('/results?page=2&search=delayed');
    expect(second.controls.search.value).toBe('delayed');
  });

  it('does not flush a debounced field through an immediate field in the same form', async () => {
    const { routes, router } = await setup();
    vi.useFakeTimers();
    const form = TestBed.runInInjectionContext(() =>
      createQueryParamsFormGroup(routes.ROOT, { transformWrites: groupedDelay }),
    );
    form.controls.search.setValue('delayed');
    form.controls.page.setValue(2);
    await vi.advanceTimersByTimeAsync(0);
    expect(router.url).toBe('/results?page=2');
    await vi.advanceTimersByTimeAsync(300);
    expect(router.url).toBe('/results?page=2&search=delayed');
  });

  it('orders same-field writes by submission, including debounced submissions', async () => {
    const { routes, router } = await setup();
    vi.useFakeTimers();
    const form = TestBed.runInInjectionContext(() =>
      createQueryParamsFormGroup(routes.ROOT, { transformWrites: groupedDelay }),
    );
    form.controls.search.setValue('staged');
    await routes.ROOT.patchQuery((q) => ({ ...q, search: 'direct' }));
    expect(form.controls.search.value).toBe('staged');
    await vi.advanceTimersByTimeAsync(300);
    expect(router.url).toBe('/results?search=staged');
    form.controls.search.setValue('earlier');
    await vi.advanceTimersByTimeAsync(300);
    await routes.ROOT.patchQuery((q) => ({ ...q, search: 'later' }));
    expect(form.controls.search.value).toBe('later');
  });

  it('cancels staged edits at external navigation start even when its guard rejects', async () => {
    let reject = false;
    const { routes, router } = await setup(() => !reject);
    vi.useFakeTimers();
    const form = TestBed.runInInjectionContext(() =>
      createQueryParamsFormGroup(routes.ROOT, { transformWrites: groupedDelay }),
    );
    form.markAsDirty();
    form.markAllAsTouched();
    form.controls.search.setValue('stale');
    reject = true;
    expect(await router.navigateByUrl('/results?search=external')).toBe(false);
    expect(form.getRawValue()).toEqual({ search: '', page: 1, roles: [] });
    expect(form.pristine).toBe(true);
    expect(form.untouched).toBe(true);
    reject = false;
    await vi.advanceTimersByTimeAsync(300);
    expect(router.url).toBe('/results');
  });

  it('resets forms to the external URL and tolerates an inactive bound route', async () => {
    const { routes, router } = await setup();
    const form = TestBed.runInInjectionContext(() =>
      createQueryParamsFormGroup(routes.ROOT.RESULTS),
    );
    await router.navigateByUrl('/results?search=history&page=2');
    TestBed.flushEffects();
    expect(form.getRawValue()).toEqual({ search: 'history', page: 2, roles: [] });
    await router.navigateByUrl('/other');
    expect(() => TestBed.flushEffects()).not.toThrow();
  });

  it('creates array controls and signal forms that share the coordinator', async () => {
    const { routes, router } = await setup();
    const reactive = TestBed.runInInjectionContext(() => createQueryParamsFormGroup(routes.ROOT));
    const binding = TestBed.runInInjectionContext(() => createQueryParamsSignalForm(routes.ROOT));
    expect(reactive.controls.roles).toBeInstanceOf(FormControl);
    binding.model.update((q) => ({ ...q, roles: ['admin', 'editor'] }));
    TestBed.flushEffects();
    reactive.controls.search.setValue('angular');
    await vi.waitFor(() => expect(router.url).toContain('search=angular'));
    TestBed.flushEffects();
    expect(binding.model()).toEqual({ search: 'angular', page: 1, roles: ['admin', 'editor'] });
    expect(reactive.getRawValue()).toEqual(binding.model());
  });

  it('emits validity metadata without automatically blocking an invalid write', async () => {
    const { routes, router } = await setup();
    await router.navigateByUrl('/results?search=initial');
    const events: unknown[] = [];
    const form = new FormGroup({
      search: new FormControl('', { nonNullable: true, validators: Validators.required }),
      page: new FormControl(1, { nonNullable: true }),
      roles: new FormControl<readonly string[]>([], { nonNullable: true }),
    });
    TestBed.runInInjectionContext(() =>
      bindQueryParamsToFormGroup(routes.ROOT, form, {
        transformWrites: (changes) => changes.pipe(tap((change) => events.push(change))),
      }),
    );
    form.controls.search.setValue('');
    await vi.waitFor(() => expect(router.url).toBe('/results'));
    expect(events).toEqual([
      expect.objectContaining({
        param: 'search',
        value: '',
        valid: false,
        pending: false,
        formValid: false,
        formPending: false,
      }),
    ]);
  });

  it('supports transformed values and synchronizes the canonical result', async () => {
    const { routes, router } = await setup();
    const form = TestBed.runInInjectionContext(() =>
      createQueryParamsFormGroup(routes.ROOT, {
        transformWrites: (changes) =>
          changes.pipe(
            map((change) =>
              change.param === 'search' ? { ...change, value: change.value.trim() } : change,
            ),
          ),
      }),
    );
    form.controls.search.setValue('  new  ');
    await vi.waitFor(() => expect(router.url).toBe('/results?search=new'));
    expect(form.controls.search.value).toBe('new');
    form.controls.search.setValue('');
    await vi.waitFor(() => expect(router.url).toBe('/results'));
    expect(form.controls.search.value).toBe('');
  });

  it.each(['declined', 'error'] as const)(
    'reports %s writes and retains entered values',
    async (kind) => {
      let fail = false;
      const failure = new Error('guard failed');
      const { routes, router } = await setup(() => {
        if (!fail) return true;
        if (kind === 'error') throw failure;
        return false;
      });
      const onWriteFailure = vi.fn();
      const form = TestBed.runInInjectionContext(() =>
        createQueryParamsFormGroup(routes.ROOT, { replaceUrl: false, onWriteFailure }),
      );
      fail = true;
      form.controls.search.setValue('failed');
      await vi.waitFor(() =>
        expect(onWriteFailure).toHaveBeenCalledWith(
          kind === 'error' ? { kind, error: failure } : { kind },
        ),
      );
      expect(form.controls.search.value).toBe('failed');
      expect(router.url).toBe('/results');
    },
  );

  it('reports unhandled write errors through Angular ErrorHandler', async () => {
    let fail = false;
    const failure = new Error('guard failed');
    const { routes, handleError } = await setup(() => {
      if (fail) throw failure;
      return true;
    });
    const form = TestBed.runInInjectionContext(() => createQueryParamsFormGroup(routes.ROOT));
    fail = true;
    form.controls.search.setValue('failed');
    await vi.waitFor(() => expect(handleError).toHaveBeenCalledWith(failure));
  });

  it('cancels a destroyed binding’s queued and staged writes without canceling other writers', async () => {
    const { routes, router } = await setup();
    const context = createEnvironmentInjector([], TestBed.inject(EnvironmentInjector));
    const form = runInInjectionContext(context, () => createQueryParamsFormGroup(routes.ROOT));
    form.controls.search.setValue('stale');
    const other = routes.ROOT.patchQuery((q) => ({ ...q, page: 2 }));
    context.destroy();
    expect(await other).toBe(true);
    form.controls.search.setValue('ignored');
    expect(router.url).toBe('/results?page=2');
  });

  it('clears staged edits and resets interaction state after a redirected form write', async () => {
    let redirect = false;
    const { routes, router } = await setup(() => {
      if (!redirect) return true;
      redirect = false;
      return router.parseUrl('/results?search=redirected');
    });
    const form = TestBed.runInInjectionContext(() => createQueryParamsFormGroup(routes.ROOT));
    form.markAsDirty();
    form.markAllAsTouched();
    redirect = true;
    form.controls.search.setValue('requested');
    form.controls.page.setValue(2);
    await vi.waitFor(() => expect(router.url).toBe('/results?search=redirected'));
    expect(form.getRawValue()).toEqual({ search: 'redirected', page: 1, roles: [] });
    expect(form.pristine).toBe(true);
    expect(form.untouched).toBe(true);
  });

  it('settles a same-URL form write and honors explicit history options', async () => {
    const { routes, router } = await setup();
    const form = TestBed.runInInjectionContext(() =>
      createQueryParamsFormGroup(routes.ROOT, {
        replaceUrl: false,
        transformWrites: (changes) =>
          changes.pipe(
            map((change) =>
              change.param === 'search' ? { ...change, value: change.value.trim() } : change,
            ),
          ),
      }),
    );
    form.controls.search.setValue('   ');
    await vi.waitFor(() => expect(form.controls.search.value).toBe(''));
    expect(router.url).toBe('/results');
    form.controls.page.setValue(2);
    await vi.waitFor(() => expect(router.url).toBe('/results?page=2'));
    expect(router.lastSuccessfulNavigation()?.extras.replaceUrl).toBe(false);
  });

  it('initializes from fresh state even when route equality retains an older signal value', async () => {
    const { routes } = await setup(undefined, () => true);
    const ref = routes.ROOT;
    expect(ref.params().query.search).toBe('');
    await ref.patchQuery((q) => ({ ...q, search: 'latest' }));
    expect(ref.params().query.search).toBe('');
    const form = TestBed.runInInjectionContext(() => createQueryParamsFormGroup(ref));
    expect(form.controls.search.value).toBe('latest');
  });

  it('fails synchronously when binding an inactive route', async () => {
    const { routes, router } = await setup();
    await router.navigateByUrl('/other');
    expect(() =>
      TestBed.runInInjectionContext(() => createQueryParamsFormGroup(routes.ROOT.RESULTS)),
    ).toThrow('inactive');
  });
});
