import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CanActivateFn, NavigationStart, Router } from '@angular/router';
import { defineAppRouter } from './app-router';
import { pathParam, queryParam, stringCodec } from './params';

@Component({ template: '' })
class Page {}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function setup(guard: CanActivateFn = () => true) {
  const definition = defineAppRouter({
    routes: {
      ROOT: {
        path: '',
        queryParams: { locale: queryParam({ codec: stringCodec() }) },
        children: {
          RESULTS: {
            path: 'results',
            queryParams: { search: queryParam({ codec: stringCodec() }) },
            angular: {
              component: Page,
              canActivate: [guard],
              runGuardsAndResolvers: 'always',
            },
          },
          OTHER: { path: 'other', angular: { component: Page } },
          ITEM: {
            path: 'items',
            pathParam: pathParam({ name: 'id', codec: stringCodec() }),
            angular: { component: Page },
          },
        },
      },
    },
  });
  TestBed.configureTestingModule({ providers: [definition.provideAppRouter()] });
  return {
    routes: TestBed.inject(definition.AppRouter),
    router: TestBed.inject(Router),
  };
}

describe('query update concurrency', () => {
  it('preserves both updates when callers await navigation', async () => {
    const { routes, router } = setup();
    await router.navigateByUrl('/results?locale=en&search=old&unknown=keep#section');
    const ref = routes.ROOT.RESULTS.urlParams();
    expect(await ref.updateQueryParams((q) => ({ ...q, search: 'new' }))).toBe(true);
    expect(await ref.updateQueryParams((q) => ({ ...q, locale: 'fr' }))).toBe(true);
    expect(router.url).toBe('/results?locale=fr&search=new&unknown=keep#section');
  });

  it('serializes same-turn updates against fresh committed state', async () => {
    const { routes, router } = setup();
    await router.navigateByUrl('/results?locale=en&search=old');
    const ref = routes.ROOT.RESULTS.urlParams();
    const first = ref.updateQueryParams((q) => ({ ...q, search: 'new' }));
    const second = ref.updateQueryParams((q) => ({ ...q, locale: 'fr' }));
    expect(await Promise.all([first, second])).toEqual([true, true]);
    expect(router.url).toBe('/results?locale=fr&search=new');
  });

  it('shares ordering between descendant and parent writes', async () => {
    const { routes, router } = setup();
    await router.navigateByUrl('/results?locale=en&search=old');
    const first = routes.ROOT.RESULTS.urlParams().updateQueryParams((q) => ({
      ...q,
      search: 'new',
    }));
    const second = routes.ROOT.urlParams().updateQueryParams(() => ({ locale: 'fr' }));
    expect(await Promise.all([first, second])).toEqual([true, true]);
    expect(router.url).toBe('/results?locale=fr&search=new');
  });

  it('reproduces overlap across separate calls while a guard is pending', async () => {
    const entered = deferred<void>();
    const release = deferred<boolean>();
    let hold = false;
    const { routes, router } = setup(() => {
      if (!hold) return true;
      entered.resolve();
      return release.promise;
    });
    await router.navigateByUrl('/results?locale=en&search=old');
    hold = true;
    const ref = routes.ROOT.RESULTS.urlParams();
    const first = ref.updateQueryParams((q) => ({ ...q, search: 'new' }));
    await entered.promise;
    hold = false;
    const second = ref.updateQueryParams((q) => ({ ...q, locale: 'fr' }));
    release.resolve(true);
    expect(await Promise.all([first, second])).toEqual([true, true]);
    expect(router.url).toBe('/results?locale=fr&search=new');
  });

  it('allows external navigation to supersede a pending query update', async () => {
    const entered = deferred<void>();
    const release = deferred<boolean>();
    let hold = false;
    const { routes, router } = setup(() => {
      if (!hold) return true;
      entered.resolve();
      return release.promise;
    });
    await router.navigateByUrl('/results?locale=en&search=old');
    hold = true;
    const update = routes.ROOT.RESULTS.urlParams().updateQueryParams((q) => ({
      ...q,
      search: 'new',
    }));
    await entered.promise;
    const queuedUpdater = vi.fn(() => ({ locale: 'fr' }));
    const queued = routes.ROOT.urlParams().updateQueryParams(queuedUpdater);
    const navigation = router.navigateByUrl('/other');
    release.resolve(true);
    expect(await Promise.all([update, navigation])).toEqual([false, true]);
    expect(await queued).toBe(false);
    expect(queuedUpdater).not.toHaveBeenCalled();
    expect(router.url).toBe('/other');
  });
  it('uses fresh state even when a ref comparator retains an older value', async () => {
    const { routes, router } = setup();
    await router.navigateByUrl('/results?locale=en&search=old');
    const ref = routes.ROOT.RESULTS.urlParams({ isEqual: () => true });
    expect(ref.value().query.search).toBe('old');
    await ref.updateQueryParams((q) => ({ ...q, search: 'new' }));
    expect(ref.value().query.search).toBe('old');
    await ref.updateQueryParams((q) => ({ ...q, locale: 'fr' }));
    expect(router.url).toBe('/results?locale=fr&search=new');
  });

  it('later same-field functional writes see earlier committed values', async () => {
    const { routes, router } = setup();
    await router.navigateByUrl('/results?search=a');
    const ref = routes.ROOT.RESULTS.urlParams();
    const first = ref.updateQueryParams((q) => ({ ...q, search: q.search + 'b' }));
    const second = ref.updateQueryParams((q) => ({ ...q, search: q.search + 'c' }));
    expect(await Promise.all([first, second])).toEqual([true, true]);
    expect(ref.value().query.search).toBe('abc');
  });

  it('defers callback execution and continues after a callback exception', async () => {
    const { routes, router } = setup();
    await router.navigateByUrl('/results');
    const error = new Error('updater failed');
    const updater = vi.fn(() => {
      throw error;
    });
    const first = routes.ROOT.urlParams().updateQueryParams(updater);
    expect(updater).not.toHaveBeenCalled();
    const failure = expect(first).rejects.toBe(error);
    const second = routes.ROOT.urlParams().updateQueryParams(() => ({ locale: 'fr' }));
    await failure;
    expect(await second).toBe(true);
    expect(updater).toHaveBeenCalledTimes(1);
  });

  it.each(['reject', 'throw'] as const)('continues after guard %s', async (mode) => {
    let fail = false;
    const error = new Error('guard failed');
    const { routes, router } = setup(() => {
      if (!fail) return true;
      fail = false;
      if (mode === 'throw') throw error;
      return false;
    });
    await router.navigateByUrl('/results?search=old');
    fail = true;
    const first = routes.ROOT.RESULTS.urlParams().updateQueryParams((q) => ({
      ...q,
      search: 'new',
    }));
    const check =
      mode === 'throw' ? expect(first).rejects.toBe(error) : expect(first).resolves.toBe(false);
    const second = routes.ROOT.urlParams().updateQueryParams(() => ({ locale: 'fr' }));
    await check;
    expect(await second).toBe(true);
    expect(router.url).toBe('/results?search=old&locale=fr');
  });

  it('cancels queued work when a guard redirects a write', async () => {
    let redirect = false;
    const { routes, router } = setup(() => (redirect ? router.parseUrl('/other') : true));
    await router.navigateByUrl('/results');
    redirect = true;
    const first = routes.ROOT.RESULTS.urlParams().updateQueryParams((q) => ({
      ...q,
      search: 'new',
    }));
    const updater = vi.fn(() => ({ locale: 'fr' }));
    const second = routes.ROOT.urlParams().updateQueryParams(updater);
    expect(await first).toBe(true);
    expect(await second).toBe(false);
    expect(updater).not.toHaveBeenCalled();
    expect(router.url).toBe('/other');
    expect(await routes.ROOT.urlParams().updateQueryParams(() => ({ locale: 'de' }))).toBe(true);
  });

  it('does not revive queued writes when external navigation is blocked', async () => {
    let reject = false;
    const { routes, router } = setup(() => !reject);
    await router.navigateByUrl('/results?search=old');
    const updater = vi.fn(() => ({ locale: 'fr' }));
    const queued = routes.ROOT.urlParams().updateQueryParams(updater);
    reject = true;
    expect(await router.navigateByUrl('/results?search=external')).toBe(false);
    expect(await queued).toBe(false);
    expect(updater).not.toHaveBeenCalled();
    expect(router.url).toBe('/results?search=old');
  });

  it('continues after a same-URL skip', async () => {
    const { routes, router } = setup();
    await router.navigateByUrl('/results?locale=en');
    const first = routes.ROOT.urlParams().updateQueryParams((q) => q);
    const second = routes.ROOT.urlParams().updateQueryParams(() => ({ locale: 'fr' }));
    expect(await Promise.all([first, second])).toEqual([false, true]);
    expect(router.url).toBe('/results?locale=fr');
  });

  it('keeps per-write history options', async () => {
    const { routes, router } = setup();
    await router.navigateByUrl('/results');
    const history: (boolean | undefined)[] = [];
    router.events.subscribe((event) => {
      if (event instanceof NavigationStart)
        history.push(router.currentNavigation()?.extras.replaceUrl);
    });
    const first = routes.ROOT.urlParams().updateQueryParams(() => ({ locale: 'en' }), {
      replaceUrl: true,
    });
    const second = routes.ROOT.urlParams().updateQueryParams(() => ({ locale: 'fr' }), {
      replaceUrl: false,
    });
    await Promise.all([first, second]);
    expect(history).toEqual([true, false]);
  });

  it('queues reentrant updates without executing an updater twice', async () => {
    const { routes, router } = setup();
    await router.navigateByUrl('/results');
    let nested!: Promise<boolean>;
    const updater = vi.fn((q: { locale: string | null }) => {
      nested = routes.ROOT.urlParams().updateQueryParams((next) => ({ locale: next.locale + '!' }));
      return { ...q, locale: 'fr' };
    });
    expect(await routes.ROOT.urlParams().updateQueryParams(updater)).toBe(true);
    expect(await nested).toBe(true);
    expect(updater).toHaveBeenCalledTimes(1);
    expect(router.url).toBe('/results?locale=fr!');
  });

  it('rejects an inactive route update through its promise', async () => {
    const { routes, router } = setup();
    await router.navigateByUrl('/other');
    await expect(routes.ROOT.RESULTS.urlParams().updateQueryParams((q) => q)).rejects.toThrow(
      'inactive',
    );
  });

  it('settles waiting writes without executing them on teardown', async () => {
    const { routes, router } = setup();
    await router.navigateByUrl('/results');
    const updater = vi.fn(() => ({ locale: 'fr' }));
    const queued = routes.ROOT.urlParams().updateQueryParams(updater);
    TestBed.resetTestingModule();
    expect(await queued).toBe(false);
    expect(updater).not.toHaveBeenCalled();
  });
  it('does not compete with an external navigation started by an updater', async () => {
    const { routes, router } = setup();
    await router.navigateByUrl('/results');
    let external!: Promise<boolean>;
    const update = routes.ROOT.urlParams().updateQueryParams(() => {
      external = router.navigateByUrl('/other');
      return { locale: 'fr' };
    });
    expect(await update).toBe(false);
    expect(await external).toBe(true);
    expect(router.url).toBe('/other');
  });

  it('settles an active write on destruction even if its guard has not resolved', async () => {
    const entered = deferred<void>();
    const release = deferred<boolean>();
    let hold = false;
    const { routes, router } = setup(() => {
      if (!hold) return true;
      entered.resolve();
      return release.promise;
    });
    await router.navigateByUrl('/results');
    hold = true;
    const active = routes.ROOT.urlParams().updateQueryParams(() => ({ locale: 'fr' }));
    await entered.promise;
    TestBed.resetTestingModule();
    expect(await active).toBe(false);
    release.resolve(true);
  });

  it('declines new writes while external navigation is pending', async () => {
    const entered = deferred<void>();
    const release = deferred<boolean>();
    let hold = false;
    const { routes, router } = setup(() => {
      if (!hold) return true;
      entered.resolve();
      return release.promise;
    });
    await router.navigateByUrl('/results');
    hold = true;
    const external = router.navigateByUrl('/results?search=external');
    await entered.promise;
    const updater = vi.fn(() => ({ locale: 'fr' }));
    expect(await routes.ROOT.urlParams().updateQueryParams(updater)).toBe(false);
    expect(updater).not.toHaveBeenCalled();
    hold = false;
    release.resolve(true);
    expect(await external).toBe(true);
    expect(await routes.ROOT.urlParams().updateQueryParams(() => ({ locale: 'de' }))).toBe(true);
    expect(router.url).toBe('/results?search=external&locale=de');
  });
  it('does not replay waiting writes onto another path instance of the same route', async () => {
    const { routes, router } = setup();
    await router.navigateByUrl('/items/a');
    const updater = vi.fn(() => ({ locale: 'fr' }));
    const queued = routes.ROOT.ITEM.urlParams().updateQueryParams(updater);
    expect(await router.navigateByUrl('/items/b')).toBe(true);
    expect(await queued).toBe(false);
    expect(updater).not.toHaveBeenCalled();
    expect(routes.ROOT.ITEM.urlParams().value().path.id).toBe('b');
    expect(router.url).toBe('/items/b');
  });
});
