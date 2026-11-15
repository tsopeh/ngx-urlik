import { Component, computed, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CanActivateFn, NavigationStart, Router } from '@angular/router';
import { AppRouterDiagnostic, AppRouterDiagnostics, defineAppRouter } from './app-router';
import { queryParam, stringCodec } from './params';

@Component({ template: '' })
class Page {}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function setup(guard: CanActivateFn = () => true, diagnostics?: AppRouterDiagnostics) {
  const definition = defineAppRouter(
    { ROOT: RouteNames.ROOT, RESULTS: RouteNames.RESULTS, OTHER: RouteNames.OTHER },
    {
      routes: [
        {
          path: '',
          routeName: RouteNames.ROOT,
          queryParams: { locale: queryParam({ codec: stringCodec() }) },
          children: [
            {
              path: 'results',
              routeName: RouteNames.RESULTS,
              queryParams: { search: queryParam({ codec: stringCodec() }) },
              component: Page,
              canActivate: [guard],
              runGuardsAndResolvers: 'always' as const,
            },
            { path: 'other', routeName: RouteNames.OTHER, component: Page },
          ],
        },
      ],
      diagnostics,
    },
  );
  TestBed.configureTestingModule({ providers: [definition.provideAppRouter()] });
  return { appRouter: TestBed.inject(definition.AppRouter), router: TestBed.inject(Router) };
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
  OTHER = 'OTHER',
  RESULTS = 'RESULTS',
  ROOT = 'ROOT',
  SEASONS = 'SEASONS',
}

describe('query writes', () => {
  it('patches declared fields in one navigation and keeps unrelated URL state', async () => {
    const { appRouter, router } = setup();
    await router.navigateByUrl('/results?locale=en&search=old&campaign=summer#section');
    const starts: string[] = [];
    router.events.subscribe((event) => {
      if (event instanceof NavigationStart) {
        starts.push(event.url);
      }
    });

    expect(await appRouter.routes.RESULTS.patchQuery({ locale: 'fr', search: 'new' })).toBe(true);
    expect(starts).toEqual(['/results?locale=fr&search=new&campaign=summer#section']);
    await appRouter.routes.RESULTS.patchQuery({ search: undefined });
    expect(router.url).toContain('search=new');
    await appRouter.routes.RESULTS.patchQuery({ search: null });
    expect(router.url).toBe('/results?locale=fr&campaign=summer#section');
  });

  it('resolves true without navigating when the URL would stay the same', async () => {
    const { appRouter, router } = setup();
    await router.navigateByUrl('/results?search=elm');
    const starts: string[] = [];
    router.events.subscribe((event) => {
      if (event instanceof NavigationStart) {
        starts.push(event.url);
      }
    });

    expect(await appRouter.routes.RESULTS.patchQuery({ search: 'elm' })).toBe(true);
    expect(await appRouter.routes.RESULTS.patchQuery({ locale: null })).toBe(true);
    expect(starts).toEqual([]);
  });

  it("doesn't change params() for a patch the URL already holds", async () => {
    const { appRouter, router } = setup();
    await router.navigateByUrl('/results?search=elm');
    const results = appRouter.routes.RESULTS;
    let runs = 0;
    const query = computed(() => {
      runs++;
      return results.params().query;
    });
    const before = results.params();
    query();

    await results.patchQuery({ search: 'elm' });
    expect(results.params()).toBe(before);
    query();
    expect(runs).toBe(1);
  });

  // A navigation that no patch started is the user's, like a link or Back, so a patch never
  // cancels it.
  it("resolves false without navigating while a navigation it didn't start runs", async () => {
    const release = deferred<boolean>();
    const { appRouter, router } = setup((route) =>
      route.queryParamMap.get('search') === 'oak' ? release.promise : true,
    );
    await router.navigateByUrl('/results?search=elm');

    const away = router.navigateByUrl('/results?search=oak');
    const patch = appRouter.routes.RESULTS.patchQuery({ search: 'fir' });
    const back = appRouter.routes.RESULTS.patchQuery({ search: 'elm' });
    release.resolve(true);

    expect(await Promise.all([away, patch, back])).toEqual([true, false, false]);
    expect(router.url).toBe('/results?search=oak');
  });

  it('leaves a typed navigation running', async () => {
    const release = deferred<boolean>();
    const { appRouter, router } = setup((route) =>
      route.queryParamMap.get('search') === 'oak' ? release.promise : true,
    );
    await router.navigateByUrl('/results');
    const results = appRouter.routes.RESULTS;

    const away = results.navigate({ query: { search: 'oak' } });
    const patch = results.patchQuery({ search: 'fir' });
    release.resolve(true);

    expect(await Promise.all([away, patch])).toEqual([true, false]);
    expect(router.url).toBe('/results?search=oak');
  });

  it("passes navigation options through to Angular's router", async () => {
    const { appRouter, router } = setup();
    await router.navigateByUrl('/results');
    const extras: unknown[] = [];
    router.events.subscribe((event) => {
      if (event instanceof NavigationStart) {
        extras.push(router.currentNavigation()?.extras);
      }
    });

    await appRouter.routes.RESULTS.patchQuery(
      { search: 'elm' },
      { replaceUrl: true, state: { from: 'sidebar' }, info: 'filters' },
    );
    expect(extras).toEqual([
      expect.objectContaining({ replaceUrl: true, state: { from: 'sidebar' }, info: 'filters' }),
    ]);
  });

  // Like router.navigate(), a patch starts from the URL when you call it, and the newest
  // navigation wins.
  it('cancels the first of two writes started in the same turn', async () => {
    const { appRouter, router } = setup();
    await router.navigateByUrl('/results?search=a');
    const results = appRouter.routes.RESULTS;
    const first = results.patchQuery({ search: `${results.params().query.search}b` });
    const second = results.patchQuery({ search: `${results.params().query.search}c` });

    expect(await Promise.all([first, second])).toEqual([false, true]);
    expect(router.url).toBe('/results?search=ac');
  });

  it('cancels a child route write when a parent route writes in the same turn', async () => {
    const { appRouter, router } = setup();
    await router.navigateByUrl('/results?locale=en&search=old');
    const first = appRouter.routes.RESULTS.patchQuery({ search: 'new' });
    const second = appRouter.routes.ROOT.patchQuery({ locale: 'fr' });

    expect(await Promise.all([first, second])).toEqual([false, true]);
    expect(router.url).toBe('/results?locale=fr&search=old');
  });

  it('cancels running writes when a router navigation starts', async () => {
    const entered = deferred<void>();
    const release = deferred<boolean>();
    let hold = false;
    const { appRouter, router } = setup(() => {
      if (!hold) {
        return true;
      }
      entered.resolve();
      return release.promise;
    });
    await router.navigateByUrl('/results?search=old');
    hold = true;
    const active = appRouter.routes.RESULTS.patchQuery({ search: 'new' });
    await entered.promise;
    const second = appRouter.routes.ROOT.patchQuery({ locale: 'fr' });
    const leaving = router.navigateByUrl('/other');
    release.resolve(true);

    expect(await Promise.all([active, second, leaving])).toEqual([false, false, true]);
    expect(router.url).toBe('/other');
  });

  it('cancels a redirected write when a later write starts', async () => {
    const { appRouter, router } = setup((route) =>
      route.queryParamMap.get('search') === 'redirect' ? inject(Router).parseUrl('/other') : true,
    );
    await router.navigateByUrl('/results?search=old');
    const redirected = appRouter.routes.RESULTS.patchQuery({ search: 'redirect' });
    const second = appRouter.routes.ROOT.patchQuery({ locale: 'fr' });

    expect(await Promise.all([redirected, second])).toEqual([false, true]);
    expect(router.url).toBe('/results?search=old&locale=fr');
  });

  describe('diagnostics.replacedPatches', () => {
    const collect = () => {
      const diagnostics: AppRouterDiagnostic[] = [];
      const options: AppRouterDiagnostics = {
        replacedPatches: true,
        warn: (diagnostic) => diagnostics.push(diagnostic),
      };
      return { diagnostics, options };
    };

    it('reports the fields of a cancelled patch that the next patch leaves out', async () => {
      const { diagnostics, options } = collect();
      const { appRouter, router } = setup(() => true, options);
      await router.navigateByUrl('/results?locale=en&search=old');
      const first = appRouter.routes.RESULTS.patchQuery({ search: 'new' });
      const second = appRouter.routes.ROOT.patchQuery({ locale: 'fr' });

      expect(await Promise.all([first, second])).toEqual([false, true]);
      expect(router.url).toBe('/results?locale=fr&search=old');
      expect(diagnostics).toEqual([
        {
          code: 'PATCH_REPLACED',
          route: 'ROOT',
          fields: ['search'],
          message:
            "ROOT: patchQuery() cancelled a patch that was still running, so 'search' never reached the URL. Put fields that change together in one patch.",
        },
      ]);
    });

    it('counts a field passed as undefined as left out', async () => {
      const { diagnostics, options } = collect();
      const { appRouter, router } = setup(() => true, options);
      await router.navigateByUrl('/results?search=old');
      void appRouter.routes.RESULTS.patchQuery({ search: 'new' });
      await appRouter.routes.RESULTS.patchQuery({ search: undefined, locale: 'fr' });

      expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual(['PATCH_REPLACED']);
    });

    it('stays quiet when the next patch sets the same field', async () => {
      const { diagnostics, options } = collect();
      const { appRouter, router } = setup(() => true, options);
      await router.navigateByUrl('/results?search=a');
      void appRouter.routes.RESULTS.patchQuery({ search: 'ab' });
      await appRouter.routes.RESULTS.patchQuery({ search: 'ac' });

      expect(router.url).toBe('/results?search=ac');
      expect(diagnostics).toEqual([]);
    });

    it('is off unless the app turns it on', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const diagnostics: AppRouterDiagnostic[] = [];
      const { appRouter, router } = setup(() => true, {
        warn: (diagnostic) => diagnostics.push(diagnostic),
      });
      await router.navigateByUrl('/results?locale=en&search=old');
      void appRouter.routes.RESULTS.patchQuery({ search: 'new' });
      await appRouter.routes.ROOT.patchQuery({ locale: 'fr' });

      expect(router.url).toBe('/results?locale=fr&search=old');
      expect(diagnostics).toEqual([]);
      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
    });

    it('warns on the console when there is no warn function', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const { appRouter, router } = setup(() => true, { replacedPatches: true });
      await router.navigateByUrl('/results?locale=en&search=old');
      void appRouter.routes.RESULTS.patchQuery({ search: 'new' });
      await appRouter.routes.ROOT.patchQuery({ locale: 'fr' });

      expect(warn).toHaveBeenCalledWith(expect.stringContaining("so 'search' never reached"));
      warn.mockRestore();
    });
  });
});
