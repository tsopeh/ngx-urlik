import { Component, ErrorHandler, computed, inject, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { NavigationEnd, NavigationStart, Router } from '@angular/router';
import { debounceTime, groupBy, mergeMap, Subject, tap } from 'rxjs';
import {
  bindQueryParamsToFormGroup,
  createQueryParamsFormGroup,
  createQueryParamsSignalForm,
} from 'ngx-urlik/forms';
import { defineAppRouter, queryParam, stringCodec } from 'ngx-urlik';

@Component({ template: '' })
class QueryFormTestComponent {}

describe('query form bindings', () => {
  it('writes a changed query control while replacing history by default', async () => {
    const query = signal({ search: '', page: 1 });
    const updateQueryParams = vi.fn(
      async (
        updater: (previous: Readonly<{ search: string; page: number }>) => {
          search: string;
          page: number;
        },
        _options?: { replaceUrl?: boolean },
      ) => {
        query.update((previous) => updater(previous));
        return true;
      },
    );
    const route = {
      urlParams: () => ({
        value: computed(() => ({ path: {}, query: query() })),
        updateQueryParams,
      }),
    };
    const form = new FormGroup({
      search: new FormControl('', { nonNullable: true }),
      page: new FormControl(1, { nonNullable: true }),
    });

    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: { events: new Subject() } },
        { provide: ErrorHandler, useValue: { handleError: vi.fn() } },
      ],
    });
    TestBed.runInInjectionContext(() => bindQueryParamsToFormGroup(route, form));

    form.controls.search.setValue('angular');
    await Promise.resolve();

    expect(updateQueryParams).toHaveBeenCalledTimes(1);
    expect(updateQueryParams.mock.calls[0][0]({ search: '', page: 1 })).toEqual({
      search: 'angular',
      page: 1,
    });
    expect(updateQueryParams.mock.calls[0][1]).toEqual({ replaceUrl: true });
  });

  it('preserves earlier parameter changes while a query navigation is in flight', async () => {
    const query = signal({ page: 1, sort: 'name' });
    const settlements: Array<(result: boolean) => void> = [];
    const updateQueryParams = vi.fn(
      (
        updater: (previous: Readonly<{ page: number; sort: string }>) => {
          page: number;
          sort: string;
        },
        _options?: { replaceUrl?: boolean },
      ) => {
        const target = updater(query());
        return new Promise<boolean>((resolve) => {
          settlements.push((result) => {
            if (result) query.set(target);
            resolve(result);
          });
        });
      },
    );
    const route = {
      urlParams: () => ({
        value: computed(() => ({ path: {}, query: query() })),
        updateQueryParams,
      }),
    };
    const form = new FormGroup({
      page: new FormControl(1, { nonNullable: true }),
      sort: new FormControl('name', { nonNullable: true }),
    });

    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: { events: new Subject() } },
        { provide: ErrorHandler, useValue: { handleError: vi.fn() } },
      ],
    });
    TestBed.runInInjectionContext(() => bindQueryParamsToFormGroup(route, form));

    form.controls.page.setValue(2);
    form.controls.sort.setValue('date');

    expect(updateQueryParams).toHaveBeenCalledTimes(1);
    settlements[0](true);
    await vi.waitFor(() => expect(updateQueryParams).toHaveBeenCalledTimes(2));
    expect(updateQueryParams.mock.calls[1][0](query())).toEqual({ page: 2, sort: 'date' });
  });

  it('delays one grouped parameter without flushing it through an immediate change', async () => {
    vi.useFakeTimers();
    const query = signal({ search: '', page: 1 });
    const routerEvents = new Subject<NavigationStart | NavigationEnd>();
    let navigationId = 0;
    const targets: Array<{ search: string; page: number }> = [];
    const updateQueryParams = vi.fn(
      async (
        updater: (previous: Readonly<{ search: string; page: number }>) => {
          search: string;
          page: number;
        },
      ) => {
        const target = updater(query());
        targets.push(target);
        navigationId += 1;
        routerEvents.next(new NavigationStart(navigationId, '/'));
        query.set(target);
        routerEvents.next(new NavigationEnd(navigationId, '/', '/'));
        return true;
      },
    );
    const route = {
      urlParams: () => ({
        value: computed(() => ({ path: {}, query: query() })),
        updateQueryParams,
      }),
    };
    const form = new FormGroup({
      search: new FormControl('', { nonNullable: true }),
      page: new FormControl(1, { nonNullable: true }),
    });
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: { events: routerEvents } },
        { provide: ErrorHandler, useValue: { handleError: vi.fn() } },
      ],
    });
    TestBed.runInInjectionContext(() =>
      bindQueryParamsToFormGroup(route, form, {
        transformWrites: (changes) =>
          changes.pipe(
            groupBy((change) => change.param),
            mergeMap((group) => (group.key === 'search' ? group.pipe(debounceTime(300)) : group)),
          ),
      }),
    );

    form.controls.search.setValue('router');
    form.controls.page.setValue(2);
    await Promise.resolve();
    expect(targets).toEqual([{ search: '', page: 2 }]);

    await vi.advanceTimersByTimeAsync(300);
    await vi.waitFor(() => expect(targets).toHaveLength(2));
    expect(targets[1]).toEqual({ search: 'router', page: 2 });
    vi.useRealTimers();
  });

  it('creates a flat reactive group with array-valued controls', () => {
    const query = signal({ search: null as string | null, roles: ['admin'] as readonly string[] });
    const route = {
      urlParams: () => ({
        value: computed(() => ({ path: {}, query: query() })),
        updateQueryParams: vi.fn(async () => true),
      }),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: { events: new Subject() } },
        { provide: ErrorHandler, useValue: { handleError: vi.fn() } },
      ],
    });
    const form = TestBed.runInInjectionContext(() => createQueryParamsFormGroup(route));

    expect(form.controls.search).toBeInstanceOf(FormControl);
    expect(form.controls.roles).toBeInstanceOf(FormControl);
    expect(form.getRawValue()).toEqual({ search: null, roles: ['admin'] });
  });

  it('creates a signal form whose model writes query parameters', async () => {
    const query = signal({ search: '', roles: [] as readonly string[] });
    const updateQueryParams = vi.fn(
      async (
        updater: (previous: Readonly<typeof query extends () => infer Q ? Q : never>) => never,
      ) => {
        query.update((previous) => updater(previous) as never);
        return true;
      },
    );
    const route = {
      urlParams: () => ({
        value: computed(() => ({ path: {}, query: query() })),
        updateQueryParams,
      }),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: { events: new Subject() } },
        { provide: ErrorHandler, useValue: { handleError: vi.fn() } },
      ],
    });
    const binding = TestBed.runInInjectionContext(() => createQueryParamsSignalForm(route));

    binding.model.update((value) => ({ ...value, roles: ['admin', 'editor'] }));
    TestBed.flushEffects();
    await Promise.resolve();

    expect(updateQueryParams).toHaveBeenCalledTimes(1);
    expect(updateQueryParams.mock.calls[0][0]({ search: '', roles: [] })).toEqual({
      search: '',
      roles: ['admin', 'editor'],
    });
  });

  it('cancels a delayed write and resets interaction state after external navigation', async () => {
    vi.useFakeTimers();
    const query = signal({ search: '', page: 1 });
    const routerEvents = new Subject<NavigationStart | NavigationEnd>();
    const updateQueryParams = vi.fn(async () => true);
    const route = {
      urlParams: () => ({
        value: computed(() => ({ path: {}, query: query() })),
        updateQueryParams,
      }),
    };
    const form = new FormGroup({
      search: new FormControl('', { nonNullable: true }),
      page: new FormControl(1, { nonNullable: true }),
    });
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: { events: routerEvents } },
        { provide: ErrorHandler, useValue: { handleError: vi.fn() } },
      ],
    });
    TestBed.runInInjectionContext(() =>
      bindQueryParamsToFormGroup(route, form, {
        transformWrites: (changes) => changes.pipe(debounceTime(300)),
      }),
    );
    form.markAsDirty();
    form.markAllAsTouched();
    form.controls.search.setValue('stale');

    routerEvents.next(new NavigationStart(10, '/?search=history&page=2', 'popstate'));
    query.set({ search: 'history', page: 2 });
    routerEvents.next(new NavigationEnd(10, '/?search=history&page=2', '/?search=history&page=2'));
    TestBed.flushEffects();
    await vi.advanceTimersByTimeAsync(300);

    expect(updateQueryParams).not.toHaveBeenCalled();
    expect(form.getRawValue()).toEqual({ search: 'history', page: 2 });
    expect(form.pristine).toBe(true);
    expect(form.untouched).toBe(true);
    vi.useRealTimers();
  });

  it('preserves dirty and touched state after its own navigation echo', async () => {
    const query = signal({ search: '' });
    const routerEvents = new Subject<NavigationStart | NavigationEnd>();
    const updateQueryParams = vi.fn(
      async (updater: (previous: Readonly<{ search: string }>) => { search: string }) => {
        routerEvents.next(new NavigationStart(20, '/?search=own'));
        query.set(updater(query()));
        routerEvents.next(new NavigationEnd(20, '/?search=own', '/?search=own'));
        return true;
      },
    );
    const route = {
      urlParams: () => ({
        value: computed(() => ({ path: {}, query: query() })),
        updateQueryParams,
      }),
    };
    const form = new FormGroup({
      search: new FormControl('', { nonNullable: true }),
    });
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: { events: routerEvents } },
        { provide: ErrorHandler, useValue: { handleError: vi.fn() } },
      ],
    });
    TestBed.runInInjectionContext(() => bindQueryParamsToFormGroup(route, form));
    form.markAsDirty();
    form.markAllAsTouched();

    form.controls.search.setValue('own');
    await Promise.resolve();
    TestBed.flushEffects();

    expect(form.dirty).toBe(true);
    expect(form.touched).toBe(true);
  });

  it('uses an explicit history option and reports automatic write failures', async () => {
    const query = signal({ search: '' });
    const failure = new Error('navigation failed');
    const onWriteFailure = vi.fn();
    const updateQueryParams = vi.fn(
      async (_updater: unknown, _options?: { replaceUrl?: boolean }) => {
        throw failure;
      },
    );
    const route = {
      urlParams: () => ({
        value: computed(() => ({ path: {}, query: query() })),
        updateQueryParams,
      }),
    };
    const form = new FormGroup({ search: new FormControl('', { nonNullable: true }) });
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: { events: new Subject() } },
        { provide: ErrorHandler, useValue: { handleError: vi.fn() } },
      ],
    });
    TestBed.runInInjectionContext(() =>
      bindQueryParamsToFormGroup(route, form, { replaceUrl: false, onWriteFailure }),
    );

    form.controls.search.setValue('failed');
    await vi.waitFor(() =>
      expect(onWriteFailure).toHaveBeenCalledWith({ kind: 'error', error: failure }),
    );
    expect(updateQueryParams.mock.calls[0][1]).toEqual({ replaceUrl: false });
  });

  it('fails synchronously when the selected route is inactive', () => {
    const route = {
      urlParams: () => ({
        value: computed(() => {
          throw new Error('ROOT.SEARCH: inactive');
        }),
        updateQueryParams: vi.fn(async () => true),
      }),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: { events: new Subject() } },
        { provide: ErrorHandler, useValue: { handleError: vi.fn() } },
      ],
    });

    expect(() =>
      TestBed.runInInjectionContext(() => createQueryParamsFormGroup(route)),
    ).toThrowError('ROOT.SEARCH: inactive');
  });

  it('emits validation metadata without blocking an invalid value', async () => {
    const query = signal({ search: 'initial' });
    const events: unknown[] = [];
    const updateQueryParams = vi.fn(async () => true);
    const route = {
      urlParams: () => ({
        value: computed(() => ({ path: {}, query: query() })),
        updateQueryParams,
      }),
    };
    const form = new FormGroup({
      search: new FormControl('initial', {
        nonNullable: true,
        validators: Validators.required,
      }),
    });
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: { events: new Subject() } },
        { provide: ErrorHandler, useValue: { handleError: vi.fn() } },
      ],
    });
    TestBed.runInInjectionContext(() =>
      bindQueryParamsToFormGroup(route, form, {
        transformWrites: (changes) => changes.pipe(tap((event) => events.push(event))),
      }),
    );

    form.controls.search.setValue('');
    await Promise.resolve();

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
    expect(updateQueryParams).toHaveBeenCalledTimes(1);
  });

  it('stops observing form changes when its injection context is destroyed', () => {
    const query = signal({ search: '' });
    const updateQueryParams = vi.fn(async () => true);
    const route = {
      urlParams: () => ({
        value: computed(() => ({ path: {}, query: query() })),
        updateQueryParams,
      }),
    };
    const form = new FormGroup({ search: new FormControl('', { nonNullable: true }) });
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: { events: new Subject() } },
        { provide: ErrorHandler, useValue: { handleError: vi.fn() } },
      ],
    });
    TestBed.runInInjectionContext(() => bindQueryParamsToFormGroup(route, form));

    TestBed.resetTestingModule();
    form.controls.search.setValue('ignored');

    expect(updateQueryParams).not.toHaveBeenCalled();
  });

  it('recognizes its own navigation using the real Angular Router', async () => {
    const definition = defineAppRouter({
      routes: {
        ROOT: {
          path: '',
          queryParams: { search: queryParam({ codec: stringCodec(), defaultValue: '' }) },
          angular: { component: QueryFormTestComponent },
        },
      },
    });
    TestBed.configureTestingModule({ providers: [definition.provideAppRouter()] });
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/');
    const appRouter = TestBed.runInInjectionContext(() => inject(definition.AppRouter));
    const form = TestBed.runInInjectionContext(() => createQueryParamsFormGroup(appRouter.ROOT));
    form.markAsDirty();
    form.markAllAsTouched();

    form.controls.search.setValue('angular');
    await vi.waitFor(() => expect(router.url).toBe('/?search=angular'));
    TestBed.flushEffects();

    expect(form.dirty).toBe(true);
    expect(form.touched).toBe(true);
  });

  it('treats a redirected self-write as authoritative when the URL changes its value', async () => {
    const query = signal({ search: '' });
    const routerEvents = new Subject<NavigationStart | NavigationEnd>();
    const updateQueryParams = vi.fn(async () => {
      routerEvents.next(new NavigationStart(30, '/?search=requested'));
      query.set({ search: 'redirected' });
      routerEvents.next(new NavigationEnd(30, '/?search=requested', '/?search=redirected'));
      return true;
    });
    const route = {
      urlParams: () => ({
        value: computed(() => ({ path: {}, query: query() })),
        updateQueryParams,
      }),
    };
    const form = new FormGroup({ search: new FormControl('', { nonNullable: true }) });
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: { events: routerEvents } },
        { provide: ErrorHandler, useValue: { handleError: vi.fn() } },
      ],
    });
    TestBed.runInInjectionContext(() => bindQueryParamsToFormGroup(route, form));
    form.markAsDirty();
    form.markAllAsTouched();

    form.controls.search.setValue('requested');
    await Promise.resolve();
    TestBed.flushEffects();

    expect(form.getRawValue()).toEqual({ search: 'redirected' });
    expect(form.pristine).toBe(true);
    expect(form.untouched).toBe(true);
  });

  it("treats another binding's navigation as external and cancels staged work", async () => {
    vi.useFakeTimers();
    const query = signal({ search: '', page: 1 });
    const routerEvents = new Subject<NavigationStart | NavigationEnd>();
    let navigationId = 40;
    const updateQueryParams = vi.fn(
      async (
        updater: (previous: Readonly<{ search: string; page: number }>) => {
          search: string;
          page: number;
        },
      ) => {
        const target = updater(query());
        routerEvents.next(new NavigationStart(navigationId, '/'));
        query.set(target);
        routerEvents.next(new NavigationEnd(navigationId, '/', '/'));
        navigationId += 1;
        return true;
      },
    );
    const route = {
      urlParams: () => ({
        value: computed(() => ({ path: {}, query: query() })),
        updateQueryParams,
      }),
    };
    const first = new FormGroup({
      search: new FormControl('', { nonNullable: true }),
      page: new FormControl(1, { nonNullable: true }),
    });
    const second = new FormGroup({
      search: new FormControl('', { nonNullable: true }),
      page: new FormControl(1, { nonNullable: true }),
    });
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: { events: routerEvents } },
        { provide: ErrorHandler, useValue: { handleError: vi.fn() } },
      ],
    });
    TestBed.runInInjectionContext(() => {
      bindQueryParamsToFormGroup(route, first, {
        transformWrites: (changes) => changes.pipe(debounceTime(300)),
      });
      bindQueryParamsToFormGroup(route, second);
    });

    first.controls.search.setValue('stale');
    second.controls.page.setValue(2);
    TestBed.flushEffects();
    await vi.advanceTimersByTimeAsync(300);

    expect(updateQueryParams).toHaveBeenCalledTimes(1);
    expect(first.getRawValue()).toEqual({ search: '', page: 2 });
    expect(first.pristine).toBe(true);
    vi.useRealTimers();
  });
});
