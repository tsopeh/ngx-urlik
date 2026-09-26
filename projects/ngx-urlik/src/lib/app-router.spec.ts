import { Component, EnvironmentProviders, inject, InjectionToken, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRoute,
  NavigationEnd,
  Router,
  RouterOutlet,
  UrlTree,
  withComponentInputBinding,
  withRouterConfig,
} from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { filter, firstValueFrom } from 'rxjs';
import { AppRouterDiagnostic, defineAppRouter } from './app-router';
import {
  delimitedQueryParam,
  numberCodec,
  pathParam,
  queryParam,
  repeatedQueryParam,
  stringCodec,
  UrlParamCodec,
} from './params';

@Component({ template: '' })
class EmptyComponent {}

@Component({ imports: [RouterOutlet], template: 'layout <router-outlet />' })
class TestLayout {}
@Component({ template: 'exact {{ label }}' })
class ExactPage {
  readonly label = inject(ActivatedRoute).snapshot.data['label'];
}
@Component({ template: 'deeper page' })
class DeeperPage {}

const setup = <T>(definition: {
  AppRouter: InjectionToken<T>;
  provideAppRouter: () => EnvironmentProviders;
}) => {
  TestBed.configureTestingModule({ providers: [definition.provideAppRouter()] });
  return {
    appRouter: TestBed.runInInjectionContext(() => inject(definition.AppRouter)),
    router: TestBed.inject(Router),
  };
};

const expectInvalid = (routes: unknown, messages: readonly string[]) => {
  let actual: string | undefined;
  try {
    defineAppRouter({ routes: routes as never });
  } catch (error) {
    actual = (error as Error).message;
  }
  expect(actual).toBe(`Invalid app router definition:\n- ${messages.join('\n- ')}`);
};

describe('defineAppRouter', () => {
  it('constructs deterministic absolute URLs and forwards nested Angular options', () => {
    const definition = defineAppRouter({
      routes: {
        ROOT: {
          path: '',
          children: {
            USER: {
              path: 'users',
              pathParam: pathParam({ name: 'userId', codec: stringCodec() }),
              queryParams: { search: queryParam({ codec: stringCodec() }) },
              angular: { component: EmptyComponent },
            },
            NOT_FOUND: { path: '**', angular: { component: EmptyComponent } },
          },
        },
      },
    });
    const { appRouter, router } = setup(definition);
    const tree = appRouter.ROOT.USER.createUrlTree({
      path: { userId: 'a b' },
      query: { search: 'x' },
    });
    expect(tree).not.toBeNull();
    expect(router.serializeUrl(tree!)).toBe('/users/a%20b?search=x');
    expect('createUrlTree' in appRouter.ROOT.NOT_FOUND).toBe(false);
  });

  it('constructs and navigates with fragments without adding them to URL parameter state', async () => {
    const definition = defineAppRouter({
      routes: {
        ROOT: {
          path: '',
          queryParams: { search: queryParam({ codec: stringCodec() }) },
          angular: { component: EmptyComponent },
        },
      },
    });
    const { appRouter, router } = setup(definition);

    expect(router.serializeUrl(appRouter.ROOT.createUrlTree({ fragment: 'section' })!)).toBe(
      '/#section',
    );
    expect(router.serializeUrl(appRouter.ROOT.createUrlTree({ fragment: '' })!)).toBe('/#');
    expect(router.serializeUrl(appRouter.ROOT.createUrlTree({ fragment: null })!)).toBe('/');
    expect(router.serializeUrl(appRouter.ROOT.createUrlTree()!)).toBe('/');

    const navigateByUrl = vi.spyOn(router, 'navigateByUrl');
    await appRouter.ROOT.navigate(
      { query: { search: 'term' }, fragment: 'results' },
      { replaceUrl: true },
    );
    const [tree, options] = navigateByUrl.mock.calls.at(-1)!;
    expect(router.serializeUrl(tree as UrlTree)).toBe('/?search=term#results');
    expect(options).toEqual({ replaceUrl: true });
    expect(appRouter.ROOT.params()).toEqual({ path: {}, query: { search: 'term' } });
  });

  it('identifies the active candidate route and returns its decoded parameters', async () => {
    const definition = defineAppRouter({
      routes: {
        ROOT: {
          path: '',
          children: {
            LEFT: {
              path: 'left',
              children: {
                DETAIL: {
                  path: 'detail',
                  pathParam: pathParam({ name: 'id', codec: numberCodec() }),
                  angular: { component: EmptyComponent },
                },
              },
            },
            RIGHT: {
              path: 'right',
              children: {
                DETAIL: {
                  path: 'detail',
                  queryParams: { id: queryParam({ codec: numberCodec(), required: true }) },
                  angular: { component: EmptyComponent },
                },
              },
            },
          },
        },
      },
    });
    const { appRouter } = setup(definition);

    await appRouter.ROOT.LEFT.DETAIL.navigate({ path: { id: 42 } });

    const activeRoute = appRouter.activeRoute({
      left: appRouter.ROOT.LEFT.DETAIL,
      right: appRouter.ROOT.RIGHT.DETAIL,
    });
    const active = activeRoute();

    expect(active).toEqual({
      route: 'left',
      node: appRouter.ROOT.LEFT.DETAIL,
      params: { path: { id: 42 }, query: {} },
    });

    await appRouter.ROOT.RIGHT.DETAIL.navigate({ query: { id: 7 } });

    expect(activeRoute()).toEqual({
      route: 'right',
      node: appRouter.ROOT.RIGHT.DETAIL,
      params: { path: {}, query: { id: 7 } },
    });

    await appRouter.ROOT.navigate();

    expect(() => activeRoute()).toThrowError(
      'activeRoute(): none of the candidate routes [left, right] is active',
    );
  });

  it('selects the deepest candidate with exact content, independently of candidate order', async () => {
    const definition = defineAppRouter({
      routes: {
        ROOT: {
          path: '',
          children: {
            SHOW: {
              path: 'show',
              pathParam: pathParam({ name: 'id', codec: numberCodec() }),
              exactMatch: { angular: { component: EmptyComponent } },
              children: {
                SEASON: { path: 'season', angular: { component: EmptyComponent } },
              },
            },
          },
        },
      },
    });
    const { appRouter } = setup(definition);
    const { ROOT } = appRouter;
    const candidates = {
      root: ROOT,
      show: ROOT.SHOW,
      season: ROOT.SHOW.SEASON,
    };
    const forwards = appRouter.activeRoute(candidates);
    const backwards = appRouter.activeRoute({
      season: candidates.season,
      show: candidates.show,
      root: candidates.root,
    });
    await ROOT.SHOW.navigate({ path: { id: 42 } });
    expect(forwards()).toEqual({
      route: 'show',
      node: ROOT.SHOW,
      params: { path: { id: 42 }, query: {} },
    });
    expect(backwards()).toEqual(forwards());
    await ROOT.SHOW.SEASON.navigate({ path: { id: 42 } });
    expect(forwards().route).toBe('season');
    expect(backwards()).toEqual(forwards());
    expect(ROOT.SHOW.params().path.id).toBe(42);
    expect(Object.keys(ROOT.SHOW)).not.toContain('exactMatch');
    await ROOT.navigate();
    expect(forwards().route).toBe('root');
    expect(backwards()).toEqual(forwards());
  });

  it('constructs a named route with exact content and redirects only the exact landing URL', async () => {
    const definition = defineAppRouter({
      routes: {
        ROOT: {
          path: '',
          exactMatch: { redirectTo: (): UrlTree => inject(Router).parseUrl('/show/7?search=kept') },
          children: {
            SHOW: {
              path: 'show',
              pathParam: pathParam({ name: 'id', codec: numberCodec() }),
              queryParams: { search: queryParam({ codec: stringCodec() }) },
              exactMatch: { angular: { component: EmptyComponent } },
              children: {
                CHILD: { path: 'child', angular: { component: EmptyComponent } },
              },
            },
            FALLBACK: { path: '**', angular: { component: EmptyComponent } },
          },
        },
      },
    });
    const { appRouter, router } = setup(definition);
    await router.navigateByUrl('/');
    expect(router.url).toBe('/show/7?search=kept');
    const route = appRouter.ROOT.SHOW;
    expect(route.params()).toEqual({ path: { id: 7 }, query: { search: 'kept' } });
    expect(
      router.serializeUrl(route.createUrlTree({ path: { id: 7 }, query: { search: 'next' } })!),
    ).toBe('/show/7?search=next');
    await route.patchQuery(() => ({ search: 'updated' }));
    expect(router.url).toBe('/show/7?search=updated');
    await router.navigateByUrl('/show/7/child');
    expect(router.url).toBe('/show/7/child');
    expect(route.params().path.id).toBe(7);
    await router.navigateByUrl('/unknown');
    expect(appRouter.ROOT.FALLBACK.params()).toEqual({ path: {}, query: {} });
  });

  it('renders exact content inside a persistent layout with page-local Angular options', async () => {
    const label = new InjectionToken<string>('label');
    const pageGuard = vi.fn(() => true);
    const definition = defineAppRouter({
      routes: {
        ROOT: {
          path: '',
          angular: { component: TestLayout },
          exactMatch: {
            angular: {
              loadComponent: async () => ExactPage,
              providers: [{ provide: label, useValue: 'home' }],
              resolve: { label: () => inject(label) },
              canActivate: [pageGuard],
              title: 'Home',
              data: { page: true },
            },
          },
          children: { DEEP: { path: 'deep', angular: { component: DeeperPage } } },
        },
      },
    });
    const { appRouter, router } = setup(definition);
    const harness = await RouterTestingHarness.create('/?q=1#section');
    const layout = harness.routeDebugElement!.componentInstance;
    expect(harness.routeNativeElement!.textContent).toContain('layout exact home');
    expect(pageGuard).toHaveBeenCalledTimes(1);
    const page = router.routerState.snapshot.root.firstChild!.firstChild!;
    expect(page.title).toBe('Home');
    expect(page.data['page']).toBe(true);
    await harness.navigateByUrl('/deep');
    expect(harness.routeDebugElement!.componentInstance).toBe(layout);
    expect(harness.routeNativeElement!.textContent).toContain('deeper page');
    expect(harness.routeNativeElement!.textContent).not.toContain('exact home');
    expect(pageGuard).toHaveBeenCalledTimes(1);
    expect(appRouter.ROOT.params()).toEqual({ path: {}, query: {} });
  });

  it('passes inherited and own parameters to exact redirects in their provider context', async () => {
    const destination = new InjectionToken<string>('destination');
    const canMatch = vi.fn(() => true);
    const redirect = vi.fn();
    const definition = defineAppRouter({
      routes: {
        ROOT: {
          path: 'account',
          pathParam: pathParam({ name: 'accountId', codec: stringCodec() }),
          queryParams: { locale: queryParam({ codec: stringCodec(), defaultValue: 'en' }) },
          children: {
            ITEM: {
              path: 'item',
              pathParam: pathParam({ name: 'id', codec: numberCodec() }),
              queryParams: { search: queryParam({ codec: stringCodec() }) },
              exactMatch: {
                angular: {
                  providers: [{ provide: destination, useValue: 'detail' }],
                  canMatch: [canMatch],
                  data: { landing: true },
                },
                redirectTo: ({ path, query }) => {
                  redirect({ path, query });
                  return inject(Router).parseUrl(
                    `/account/${path.accountId}/item/${path.id}/${inject(destination)}?locale=${query.locale}&search=${query.search}`,
                  );
                },
              },
              children: { DETAIL: { path: 'detail', angular: { component: EmptyComponent } } },
            },
          },
        },
      },
    });
    const { appRouter, router } = setup(definition);
    await router.navigateByUrl('/account/alice/item/7?locale=fr&search=kept');
    expect(router.url).toBe('/account/alice/item/7/detail?locale=fr&search=kept');
    expect(redirect).toHaveBeenCalledExactlyOnceWith({
      path: { accountId: 'alice', id: 7 },
      query: { locale: 'fr', search: 'kept' },
    });
    expect(canMatch).toHaveBeenCalledTimes(1);
    expect(appRouter.ROOT.ITEM.params()).toEqual({
      path: { accountId: 'alice', id: 7 },
      query: { locale: 'fr', search: 'kept' },
    });
    await router.navigateByUrl('/account/bob/item/8/detail?locale=en');
    expect(router.url).toBe('/account/bob/item/8/detail?locale=en');
    expect(redirect).toHaveBeenCalledTimes(1);
  });

  it('leaves a layout outlet empty without exactMatch and renders exact content on a leaf', async () => {
    const definition = defineAppRouter({
      routes: {
        ROOT: {
          path: '',
          angular: { loadComponent: async () => TestLayout },
          children: {
            LEAF: {
              path: 'leaf',
              exactMatch: { angular: { component: ExactPage, data: { label: 'leaf' } } },
            },
            NESTED: {
              path: 'nested',
              angular: { component: TestLayout },
              exactMatch: { angular: { component: ExactPage, data: { label: 'nested' } } },
            },
          },
        },
      },
    });
    const { appRouter } = setup(definition);
    const harness = await RouterTestingHarness.create('/');
    const layout = harness.routeDebugElement!.componentInstance;
    expect(harness.routeNativeElement!.textContent!.trim()).toBe('layout');
    await harness.navigateByUrl('/leaf?unowned=1#section');
    expect(harness.routeNativeElement!.textContent).toContain('layout exact leaf');
    expect(appRouter.ROOT.LEAF.params()).toEqual({ path: {}, query: {} });
    await harness.navigateByUrl('/nested');
    expect(harness.routeNativeElement!.textContent).toContain('layout layout exact nested');
    await harness.navigateByUrl('/');
    expect(harness.routeDebugElement!.componentInstance).toBe(layout);
    expect(harness.routeNativeElement!.textContent!.trim()).toBe('layout');
  });

  it('lets Angular fall back when a redirect canMatch guard rejects the exact URL', async () => {
    const enabled = new InjectionToken<boolean>('enabled');
    const guardedRedirect = vi.fn(() => new UrlTree());
    const definition = defineAppRouter({
      routes: {
        ROOT: {
          path: '',
          children: {
            PAGE: {
              path: 'page',
              exactMatch: {
                angular: {
                  providers: [{ provide: enabled, useValue: false }],
                  canMatch: [() => inject(enabled)],
                },
                redirectTo: guardedRedirect,
              },
              children: {
                CHILD: { path: 'child', angular: { component: DeeperPage } },
                FALLBACK: {
                  path: '**',
                  angular: { component: ExactPage, data: { label: 'fallback' } },
                },
              },
            },
            OLD: {
              path: 'old',
              angular: {
                providers: [{ provide: enabled, useValue: false }],
                canMatch: [() => inject(enabled)],
              },
              redirectTo: guardedRedirect,
            },
            ALLOWED: {
              path: 'allowed',
              angular: { canMatch: [() => true] },
              redirectTo: () => inject(Router).parseUrl('/page/child'),
            },
            FALLBACK: {
              path: '**',
              angular: { component: ExactPage, data: { label: 'fallback' } },
            },
          },
        },
      },
    });
    setup(definition);
    const harness = await RouterTestingHarness.create('/page');
    expect(harness.routeNativeElement!.textContent).toContain('exact fallback');
    await harness.navigateByUrl('/old');
    expect(harness.routeNativeElement!.textContent).toContain('exact fallback');
    expect(guardedRedirect).not.toHaveBeenCalled();
    await harness.navigateByUrl('/page/child');
    expect(harness.routeNativeElement!.textContent).toContain('deeper page');
    await harness.navigateByUrl('/allowed');
    expect(TestBed.inject(Router).url).toBe('/page/child');
  });

  it('provides one bounded escape hatch with bound methods and live observations', async () => {
    const definition = defineAppRouter({
      routes: { ROOT: { path: '', angular: { component: EmptyComponent } } },
    });
    const { appRouter, router } = setup(definition);
    const again = TestBed.runInInjectionContext(() => inject(definition.AppRouter));
    const escapeHatch = appRouter.escapeHatch;
    expect(again.escapeHatch).toBe(escapeHatch);

    const parsed = router.parseUrl('/target');
    const created = router.parseUrl('/created');
    const createUrlTree = vi.spyOn(router, 'createUrlTree').mockReturnValue(created);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const navigateByUrl = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(false);
    const parseUrl = vi.spyOn(router, 'parseUrl').mockReturnValue(parsed);
    const serializeUrl = vi.spyOn(router, 'serializeUrl').mockReturnValue('/serialized');
    const isActive = vi.spyOn(router, 'isActive').mockReturnValue(true);

    expect(escapeHatch.createUrlTree(['/created'], { fragment: 'part' })).toBe(created);
    await expect(escapeHatch.navigate(['/target'], { browserUrl: '/shown' })).resolves.toBe(true);
    await expect(escapeHatch.navigateByUrl(parsed, { replaceUrl: true })).resolves.toBe(false);
    expect(escapeHatch.parseUrl('/target')).toBe(parsed);
    expect(escapeHatch.serializeUrl(parsed)).toBe('/serialized');
    expect(escapeHatch.isActive('/target', true)).toBe(true);
    expect(escapeHatch.isActive(parsed, { paths: 'exact' })).toBe(true);
    expect(createUrlTree).toHaveBeenCalledWith(['/created'], { fragment: 'part' });
    expect(navigate).toHaveBeenCalledWith(['/target'], { browserUrl: '/shown' });
    expect(navigateByUrl).toHaveBeenCalledWith(parsed, { replaceUrl: true });
    expect(parseUrl).toHaveBeenCalledWith('/target');
    expect(serializeUrl).toHaveBeenCalledWith(parsed);
    expect(isActive.mock.calls).toEqual([
      ['/target', true],
      [parsed, { paths: 'exact' }],
    ]);

    expect(escapeHatch.events).toBe(router.events);
    expect(escapeHatch.currentNavigation).toBe(router.currentNavigation);
    expect(escapeHatch.lastSuccessfulNavigation).toBe(router.lastSuccessfulNavigation);
    expect(escapeHatch.componentInputBindingEnabled).toBe(router.componentInputBindingEnabled);
    router.navigated = false;
    expect(escapeHatch.navigated).toBe(false);
    router.navigated = true;
    expect(escapeHatch.navigated).toBe(true);
    expect(escapeHatch.url).toBe(router.url);

    expect(Object.keys(escapeHatch).sort()).toEqual(
      [
        'componentInputBindingEnabled',
        'createUrlTree',
        'currentNavigation',
        'events',
        'isActive',
        'lastSuccessfulNavigation',
        'navigate',
        'navigateByUrl',
        'navigated',
        'parseUrl',
        'serializeUrl',
        'url',
      ].sort(),
    );
    for (const observation of [
      'url',
      'events',
      'currentNavigation',
      'lastSuccessfulNavigation',
      'navigated',
      'componentInputBindingEnabled',
    ]) {
      const descriptor = Object.getOwnPropertyDescriptor(escapeHatch, observation)!;
      expect(descriptor.get).toBeTypeOf('function');
      expect(descriptor.set).toBeUndefined();
    }
  });

  it('uses the last scalar value and keeps repeated and delimited arrays distinct', async () => {
    const definition = defineAppRouter({
      routes: {
        ROOT: {
          path: '',
          queryParams: {
            scalar: queryParam({ codec: stringCodec() }),
            repeated: repeatedQueryParam({ codec: stringCodec() }),
            delimited: delimitedQueryParam({ codec: stringCodec(), separator: ',' }),
          },
          angular: { component: EmptyComponent },
        },
      },
    });
    const { appRouter, router } = setup(definition);
    await router.navigateByUrl('/?scalar=first&scalar=last&repeated=a&repeated=b&delimited=a,b');
    expect(appRouter.ROOT.params().query).toEqual({
      scalar: 'last',
      repeated: ['a', 'b'],
      delimited: ['a', 'b'],
    });

    const tree = appRouter.ROOT.createUrlTree({
      query: { repeated: ['a,b'], delimited: ['a,b', 'c'] },
    });
    expect(router.serializeUrl(tree!)).toBe('/?repeated=a,b&delimited=a%252Cb,c');
  });

  it('preserves empty elements when the element codec accepts them', async () => {
    const definition = defineAppRouter({
      routes: {
        ROOT: {
          path: '',
          queryParams: {
            repeated: repeatedQueryParam({ codec: stringCodec() }),
            delimited: delimitedQueryParam({ codec: stringCodec(), separator: ',' }),
          },
          angular: { component: EmptyComponent },
        },
      },
    });
    const { appRouter, router } = setup(definition);
    await router.navigateByUrl('/?repeated=&delimited=a,,b');
    expect(appRouter.ROOT.params().query).toEqual({
      repeated: [''],
      delimited: ['a', '', 'b'],
    });
  });

  it('invalidates repeated physical keys for delimited arrays without invoking the codec', async () => {
    const deserialize = vi.fn((raw: string) => raw);
    const diagnostics: AppRouterDiagnostic[] = [];
    const definition = defineAppRouter({
      diagnostics: { warn: (diagnostic) => diagnostics.push(diagnostic) },
      routes: {
        ROOT: {
          path: '',
          queryParams: {
            empty: delimitedQueryParam({
              codec: { serialize: (value: string) => value, deserialize },
              separator: ',',
            }),
            fixed: delimitedQueryParam({
              codec: stringCodec(),
              separator: ',',
              defaultValue: ['fallback'],
            }),
            dynamic: delimitedQueryParam({
              codec: stringCodec(),
              separator: ',',
              defaultValue: () => ['current'],
            }),
          },
          angular: { component: EmptyComponent },
        },
      },
    });
    const { appRouter, router } = setup(definition);
    await router.navigateByUrl('/?empty=a&empty=b&fixed=a&fixed=b&dynamic=a&dynamic=b');
    expect(appRouter.ROOT.params().query).toEqual({
      empty: [],
      fixed: ['fallback'],
      dynamic: ['current'],
    });
    expect(deserialize).not.toHaveBeenCalled();
    expect(diagnostics).toHaveLength(3);
    expect(diagnostics[0]).toEqual({
      code: 'INVALID_ARRAY_REPRESENTATION',
      message: "ROOT: deserialize query parameter 'empty' used repeated keys for a delimited value",
      route: 'ROOT',
      parameter: 'empty',
      operation: 'deserialize',
    });
  });

  it('invalidates a whole array when one element is malformed', async () => {
    const diagnostics: AppRouterDiagnostic[] = [];
    const definition = defineAppRouter({
      diagnostics: { warn: (diagnostic) => diagnostics.push(diagnostic) },
      routes: {
        ROOT: {
          path: '',
          queryParams: {
            ids: repeatedQueryParam({ codec: numberCodec(), defaultValue: [9] }),
          },
          angular: { component: EmptyComponent },
        },
      },
    });
    const { appRouter, router } = setup(definition);
    await router.navigateByUrl('/?ids=1&ids=oops&ids=3');
    expect(appRouter.ROOT.params().query.ids).toEqual([9]);
    expect(diagnostics.map((item) => item.message)).toEqual([
      "ROOT: deserialize query parameter 'ids' at index 1 was invalid",
    ]);
  });

  it('warns, omits invalid queries, and continues navigation', async () => {
    const diagnostics: AppRouterDiagnostic[] = [];
    const definition = defineAppRouter({
      diagnostics: { warn: (diagnostic) => diagnostics.push(diagnostic) },
      routes: {
        ROOT: {
          path: 'items',
          pathParam: pathParam({ name: 'id', codec: numberCodec() }),
          queryParams: {
            filter: queryParam({ codec: numberCodec() }),
            ids: repeatedQueryParam({ codec: numberCodec() }),
          },
          angular: { component: EmptyComponent },
        },
      },
    });
    const { appRouter, router } = setup(definition);
    await expect(
      appRouter.ROOT.navigate({
        path: { id: 1 },
        query: { filter: Number.NaN, ids: [1, Number.NaN, 3] },
      }),
    ).resolves.toBe(true);
    expect(router.url).toBe('/items/1');
    expect(diagnostics.map((item) => item.message)).toEqual([
      "ROOT: serialize query parameter 'filter' was invalid",
      "ROOT: serialize query parameter 'ids' at index 1 was invalid",
    ]);
  });

  it('reports complete route identities and owned parameter placement', () => {
    const diagnostics: AppRouterDiagnostic[] = [];
    const definition = defineAppRouter({
      diagnostics: { warn: (diagnostic) => diagnostics.push(diagnostic) },
      routes: {
        ROOT: {
          path: '',
          children: {
            LEFT: {
              path: 'left',
              children: {
                DETAIL: {
                  path: 'detail',
                  pathParam: pathParam({ name: 'id', codec: numberCodec() }),
                  angular: { component: EmptyComponent },
                },
              },
            },
            RIGHT: {
              path: 'right',
              children: {
                DETAIL: {
                  path: 'detail',
                  queryParams: { id: queryParam({ codec: numberCodec() }) },
                  angular: { component: EmptyComponent },
                },
              },
            },
          },
        },
      },
    });
    const { appRouter } = setup(definition);

    expect(appRouter.ROOT.LEFT.DETAIL.createUrlTree({ path: { id: Number.NaN } })).toBeNull();
    expect(appRouter.ROOT.RIGHT.DETAIL.createUrlTree({ query: { id: Number.NaN } })).not.toBeNull();

    expect(diagnostics).toEqual([
      expect.objectContaining({
        route: 'ROOT.LEFT.DETAIL',
        parameter: 'id',
        message: "ROOT.LEFT.DETAIL: serialize path parameter 'id' was invalid",
      }),
      expect.objectContaining({
        route: 'ROOT.RIGHT.DETAIL',
        parameter: 'id',
        message: "ROOT.RIGHT.DETAIL: serialize query parameter 'id' was invalid",
      }),
    ]);
  });

  it('returns null and resolves false when a path cannot serialize', async () => {
    const diagnostics: AppRouterDiagnostic[] = [];
    const definition = defineAppRouter({
      diagnostics: { warn: (diagnostic) => diagnostics.push(diagnostic) },
      routes: {
        ROOT: {
          path: 'items',
          pathParam: pathParam({ name: 'id', codec: numberCodec() }),
          angular: { component: EmptyComponent },
        },
      },
    });
    const { appRouter, router } = setup(definition);
    const navigateByUrl = vi.spyOn(router, 'navigateByUrl');
    expect(appRouter.ROOT.createUrlTree({ path: { id: Number.NaN } })).toBeNull();
    await expect(appRouter.ROOT.navigate({ path: { id: Number.NaN } })).resolves.toBe(false);
    expect(navigateByUrl).not.toHaveBeenCalled();
    expect(diagnostics.map((item) => item.message)).toEqual([
      "ROOT: serialize path parameter 'id' was invalid",
      "ROOT: serialize path parameter 'id' was invalid",
    ]);
  });

  it('recovers from codec exceptions and retains their cause', async () => {
    const failure = new Error('bad codec');
    const codec: UrlParamCodec<string> = {
      serialize: () => {
        throw failure;
      },
      deserialize: () => {
        throw failure;
      },
    };
    const diagnostics: AppRouterDiagnostic[] = [];
    const definition = defineAppRouter({
      diagnostics: { warn: (diagnostic) => diagnostics.push(diagnostic) },
      routes: {
        ROOT: {
          path: '',
          queryParams: { broken: queryParam({ codec }) },
          angular: { component: EmptyComponent },
        },
      },
    });
    const { appRouter, router } = setup(definition);
    await router.navigateByUrl('/?broken=value');
    expect(appRouter.ROOT.params().query.broken).toBeNull();
    expect(appRouter.ROOT.createUrlTree({ query: { broken: 'value' } })).not.toBeNull();
    expect(diagnostics).toHaveLength(2);
    expect(diagnostics.every((item) => item.code === 'PARAM_CODEC_THROWN')).toBe(true);
    expect(diagnostics.every((item) => item.cause === failure)).toBe(true);
  });

  it('throws only for inactive state and invalid active path state', async () => {
    const selectiveCodec: UrlParamCodec<string> = {
      serialize: (value) => value,
      deserialize: (raw) => (raw === 'valid' ? raw : null),
    };
    const definition = defineAppRouter({
      diagnostics: { warn: () => undefined },
      routes: {
        ROOT: {
          path: '',
          children: {
            ITEM: {
              path: 'items',
              pathParam: pathParam({ name: 'id', codec: selectiveCodec }),
              angular: { component: EmptyComponent },
            },
            OTHER: { path: 'other', angular: { component: EmptyComponent } },
          },
        },
      },
    });
    const { appRouter, router } = setup(definition);
    await router.navigateByUrl('/other');
    expect(() => appRouter.ROOT.ITEM.params()).toThrow(
      "ITEM: expected active route 'items/:id', but the current primary route is inactive",
    );
    await router.navigateByUrl('/items/invalid');
    expect(() => appRouter.ROOT.ITEM.params()).toThrow(
      "ITEM: expected active route 'items/:id', attempted current path '/items/invalid' could not resolve 'id'",
    );
  });

  it('evaluates injection-aware defaults reactively and canonically omits them', async () => {
    const locale = new InjectionToken<ReturnType<typeof signal<string>>>('locale');
    const current = signal('en');
    const definition = defineAppRouter({
      routes: {
        ROOT: {
          path: '',
          queryParams: {
            locale: queryParam({
              codec: stringCodec(),
              defaultValue: () => inject(locale)(),
            }),
          },
          angular: { component: EmptyComponent },
        },
      },
    });
    TestBed.configureTestingModule({
      providers: [{ provide: locale, useValue: current }, definition.provideAppRouter()],
    });
    const appRouter = TestBed.runInInjectionContext(() => inject(definition.AppRouter));
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/');
    expect(appRouter.ROOT.params().query.locale).toBe('en');
    current.set('fr');
    expect(appRouter.ROOT.params().query.locale).toBe('fr');
    expect(router.serializeUrl(appRouter.ROOT.createUrlTree({ query: { locale: 'fr' } })!)).toBe(
      '/',
    );
  });

  it('propagates exceptions from consumer-owned default factories', async () => {
    const failure = new Error('default failed');
    const definition = defineAppRouter({
      routes: {
        ROOT: {
          path: '',
          queryParams: {
            value: queryParam({
              codec: stringCodec(),
              defaultValue: () => {
                throw failure;
              },
            }),
          },
          angular: { component: EmptyComponent },
        },
      },
    });
    const { appRouter, router } = setup(definition);
    await router.navigateByUrl('/');
    expect(() => appRouter.ROOT.params()).toThrow(failure);
  });

  it('canonically omits static and dynamic array defaults and empty arrays', () => {
    let current = ['dynamic'] as readonly string[];
    const definition = defineAppRouter({
      routes: {
        ROOT: {
          path: '',
          queryParams: {
            empty: repeatedQueryParam({ codec: stringCodec(), required: true }),
            fixed: repeatedQueryParam({ codec: stringCodec(), defaultValue: ['fixed'] }),
            dynamic: delimitedQueryParam({
              codec: stringCodec(),
              separator: ',',
              defaultValue: () => current,
            }),
          },
          angular: { component: EmptyComponent },
        },
      },
    });
    const { appRouter, router } = setup(definition);
    const tree = appRouter.ROOT.createUrlTree({
      query: { empty: [], fixed: ['fixed'], dynamic: ['dynamic'] },
    });
    expect(router.serializeUrl(tree!)).toBe('/');
    current = ['other'];
    expect(
      router.serializeUrl(
        appRouter.ROOT.createUrlTree({
          query: { empty: [], fixed: ['fixed'], dynamic: ['dynamic'] },
        })!,
      ),
    ).toBe('/?dynamic=dynamic');
  });

  it('updates only owned query keys and preserves unknown and descendant keys', async () => {
    const definition = defineAppRouter({
      routes: {
        ROOT: {
          path: '',
          queryParams: { locale: queryParam({ codec: stringCodec() }) },
          children: {
            CHILD: {
              path: 'child',
              queryParams: { search: queryParam({ codec: stringCodec() }) },
              angular: { component: EmptyComponent },
            },
          },
        },
      },
    });
    const { appRouter, router } = setup(definition);
    await router.navigateByUrl('/child?locale=en&search=term&unknown=keep');
    let calls = 0;
    await appRouter.ROOT.patchQuery((previous) => {
      calls++;
      expect(previous).toEqual({ locale: 'en' });
      return { locale: 'fr' };
    });
    expect(calls).toBe(1);
    expect(router.url).toBe('/child?locale=fr&search=term&unknown=keep');
  });

  it('exposes one stable state signal with route-defined equality', async () => {
    const isEqual = vi.fn(() => true);
    const definition = defineAppRouter({
      routes: {
        ROOT: {
          path: '',
          queryParams: { value: queryParam({ codec: stringCodec() }) },
          isEqual,
          angular: { component: EmptyComponent },
        },
      },
    });
    const { appRouter, router } = setup(definition);
    await router.navigateByUrl('/?value=a');
    const params = appRouter.ROOT.params;
    expect(params().query.value).toBe('a');
    await router.navigateByUrl('/?value=b');
    expect(appRouter.ROOT.params).toBe(params);
    expect(params().query.value).toBe('a');
    expect(isEqual).toHaveBeenCalled();
  });

  it('requires redirect callbacks to produce a definite UrlTree and supports explicit fallback', async () => {
    let appRouter!: any;
    const diagnostics: AppRouterDiagnostic[] = [];
    const definition = defineAppRouter({
      diagnostics: { warn: (diagnostic) => diagnostics.push(diagnostic) },
      routes: {
        ROOT: {
          path: '',
          children: {
            TARGET: {
              path: 'target',
              pathParam: pathParam({ name: 'id', codec: numberCodec() }),
              angular: { component: EmptyComponent },
            },
            SAFE: { path: 'safe', angular: { component: EmptyComponent } },
            LEGACY: {
              path: 'legacy',
              queryParams: { id: queryParam({ codec: numberCodec() }) },
              redirectTo: ({ query }: { query: { id: number | null } }): UrlTree =>
                appRouter.ROOT.TARGET.createUrlTree({ path: { id: query.id ?? Number.NaN } }) ??
                appRouter.ROOT.SAFE.createUrlTree()!,
            },
          },
        },
      },
    });
    const setupResult = setup(definition);
    appRouter = setupResult.appRouter;
    await setupResult.router.navigateByUrl('/legacy?id=bad');
    expect(setupResult.router.url).toBe('/safe');
    expect(diagnostics.map((item) => item.message)).toEqual([
      "ROOT.LEGACY: deserialize query parameter 'id' was invalid",
      "ROOT.TARGET: serialize path parameter 'id' was invalid",
    ]);
  });

  it('forwards every supported ordinary Angular route option', () => {
    const canMatch = [() => true];
    const canActivate = [() => true];
    const canActivateChild = [() => true];
    const canDeactivate = [() => true];
    const resolve = { value: () => 'resolved' };
    const providers = [{ provide: 'route-token', useValue: true }];
    const definition = defineAppRouter({
      routes: {
        ROOT: {
          path: '',
          angular: {
            component: EmptyComponent,
            canMatch,
            canActivate,
            canActivateChild,
            canDeactivate,
            resolve,
            data: { static: true },
            title: 'Title',
            providers,
            runGuardsAndResolvers: 'paramsOrQueryParamsChange',
          },
        },
      },
    });
    const { router } = setup(definition);
    expect(router.config[0]).toMatchObject({
      component: EmptyComponent,
      canMatch,
      canActivate,
      canActivateChild,
      canDeactivate,
      resolve,
      data: { static: true },
      title: 'Title',
      providers,
      runGuardsAndResolvers: 'paramsOrQueryParamsChange',
    });
  });

  it('forwards Angular features and forces parameter inheritance', async () => {
    const definition = defineAppRouter({
      routerConfig: { onSameUrlNavigation: 'reload' },
      routes: {
        ROOT: {
          path: 'accounts',
          pathParam: pathParam({ name: 'accountId', codec: stringCodec() }),
          children: {
            SETTINGS: { path: 'settings', angular: { component: EmptyComponent } },
          },
        },
      },
    });
    TestBed.configureTestingModule({
      providers: [definition.provideAppRouter(withComponentInputBinding())],
    });
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/accounts/42/settings');
    expect(router.routerState.snapshot.root.firstChild?.firstChild?.paramMap.get('accountId')).toBe(
      '42',
    );
    const nextEnd = firstValueFrom(
      router.events.pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd)),
    );
    await router.navigateByUrl('/accounts/42/settings');
    await expect(nextEnd).resolves.toBeInstanceOf(NavigationEnd);
    expect(() => definition.provideAppRouter(withRouterConfig({}) as never)).toThrow(
      'withRouterConfig() is not accepted by provideAppRouter(); use defineAppRouter({ routerConfig })',
    );
  });
});

describe('route validation', () => {
  it('requires exactly one named root', () => {
    expectInvalid({}, ['routes must contain exactly one named root route']);
  });

  it('validates static paths', () => {
    expectInvalid({ ROOT: { path: '', children: { BAD: { path: 'two/segments' } } } }, [
      'ROOT.BAD: path must be one valid static segment',
    ]);
  });

  it('rejects empty child paths and invalid exact-match definitions', () => {
    expectInvalid({ ROOT: { path: '', children: { BAD: { path: '' } } } }, [
      'ROOT.BAD: empty paths are only allowed at the application root; use exactMatch',
    ]);
    for (const exactMatch of [
      {},
      { angular: {} },
      { angular: { component: EmptyComponent, loadComponent: () => EmptyComponent } },
    ])
      expectInvalid({ ROOT: { path: '', exactMatch } }, [
        'ROOT.exactMatch: specify exactly one component, loadComponent, or redirectTo',
      ]);
    for (const key of ['path', 'pathParam', 'queryParams', 'children', 'isEqual'])
      expectInvalid(
        { ROOT: { path: '', exactMatch: { angular: { component: EmptyComponent }, [key]: {} } } },
        [`ROOT.exactMatch: unknown property '${key}'`],
      );
    expectInvalid({ ROOT: { path: '', redirectTo: () => new UrlTree(), exactMatch: {} } }, [
      "ROOT: unknown route property 'exactMatch'",
    ]);
    expectInvalid({ ROOT: { path: '', children: { FALLBACK: { path: '**', exactMatch: {} } } } }, [
      "ROOT.FALLBACK: unknown route property 'exactMatch'",
    ]);
    expectInvalid(
      {
        ROOT: {
          path: '',
          exactMatch: { redirectTo: () => new UrlTree(), angular: { component: EmptyComponent } },
        },
      },
      [
        "ROOT.exactMatch.angular: unknown Angular route property 'component'",
        'ROOT.exactMatch: specify exactly one component, loadComponent, or redirectTo',
      ],
    );
  });

  it('reports malformed exact-match objects and forbidden Angular options', () => {
    for (const exactMatch of [null, undefined, [], 'page'])
      expectInvalid({ ROOT: { path: '', exactMatch } }, [
        'ROOT.exactMatch: exactMatch must be a non-null object',
      ]);
    for (const angular of [null, [], 'page'])
      expectInvalid({ ROOT: { path: '', exactMatch: { angular } } }, [
        'ROOT.exactMatch.angular: Angular options must be a non-null object',
        'ROOT.exactMatch: specify exactly one component, loadComponent, or redirectTo',
      ]);
    expectInvalid({ ROOT: { path: '', exactMatch: { redirectTo: '/page' } } }, [
      'ROOT.exactMatch: redirectTo must be a function',
    ]);
    for (const key of [
      'canActivate',
      'canActivateChild',
      'canDeactivate',
      'resolve',
      'title',
      'runGuardsAndResolvers',
    ])
      expectInvalid(
        {
          ROOT: {
            path: '',
            exactMatch: { redirectTo: () => new UrlTree(), angular: { [key]: [] } },
          },
        },
        [`ROOT.exactMatch.angular: unknown Angular route property '${key}'`],
      );
    for (const key of [
      'path',
      'pathMatch',
      'children',
      'loadChildren',
      'outlet',
      'matcher',
      'redirectTo',
    ])
      expectInvalid(
        {
          ROOT: {
            path: '',
            exactMatch: { angular: { component: EmptyComponent, [key]: 'forbidden' } },
          },
        },
        [`ROOT.exactMatch.angular: unknown Angular route property '${key}'`],
      );
  });

  it('validates fallback placement and uniqueness', () => {
    expectInvalid(
      {
        ROOT: {
          path: '',
          children: {
            FIRST: { path: '**' },
            ORDINARY: { path: 'ordinary' },
            SECOND: { path: '**' },
          },
        },
      },
      [
        'ROOT.ORDINARY: fallback routes must be declared last',
        'ROOT.SECOND: only one fallback route is allowed per sibling branch',
      ],
    );
  });

  it('rejects a fallback root', () => {
    expectInvalid({ ROOT: { path: '**' } }, ['ROOT: the root route cannot be a fallback']);
  });

  it('rejects duplicate sibling URL patterns', () => {
    expectInvalid(
      {
        ROOT: {
          path: '',
          children: { A: { path: 'item' }, B: { path: 'item' } },
        },
      },
      ["ROOT.B: duplicates sibling URL pattern 'item' from ROOT.A"],
    );
  });

  it('rejects parameter shadowing', () => {
    expectInvalid(
      {
        ROOT: {
          path: '',
          queryParams: { id: queryParam({ codec: stringCodec() }) },
          children: {
            CHILD: {
              path: 'child',
              pathParam: pathParam({ name: 'id', codec: stringCodec() }),
            },
          },
        },
      },
      ["ROOT.CHILD: parameter 'id' shadows an ancestor parameter"],
    );
  });

  it('rejects reserved route identities', () => {
    expectInvalid({ ROOT: { path: '', children: { navigate: { path: 'reserved' } } } }, [
      "ROOT.navigate: 'navigate' is a reserved router method name",
    ]);
  });

  it('reserves the direct state and query patch members', () => {
    expectInvalid(
      {
        ROOT: {
          path: '',
          children: {
            params: { path: 'state' },
            patchQuery: { path: 'patch' },
          },
        },
      },
      [
        "ROOT.params: 'params' is a reserved router method name",
        "ROOT.patchQuery: 'patchQuery' is a reserved router method name",
      ],
    );
  });

  it('reserves application-wide router methods only at the router root', () => {
    expectInvalid({ escapeHatch: { path: '' } }, [
      "escapeHatch: 'escapeHatch' is reserved at the router root",
    ]);
    expectInvalid({ activeRoute: { path: '' } }, [
      "activeRoute: 'activeRoute' is reserved at the router root",
    ]);
    expect(() =>
      defineAppRouter({
        routes: {
          ROOT: {
            path: '',
            children: {
              escapeHatch: { path: 'allowed-escape' },
              activeRoute: { path: 'allowed-active' },
            },
          },
        },
      }),
    ).not.toThrow();
  });

  it('rejects mutually exclusive Angular component loaders', () => {
    expectInvalid(
      {
        ROOT: {
          path: '',
          angular: { component: EmptyComponent, loadComponent: async () => EmptyComponent },
        },
      },
      ['ROOT.angular: component and loadComponent are mutually exclusive'],
    );
  });

  it('enforces redirect and fallback capabilities', () => {
    expectInvalid(
      {
        ROOT: {
          path: '',
          children: {
            REDIRECT: { path: 'old', redirectTo: () => new UrlTree(), children: {} },
            FALLBACK: { path: '**', pathParam: pathParam({ name: 'id', codec: stringCodec() }) },
          },
        },
      },
      [
        "ROOT.REDIRECT: unknown route property 'children'",
        "ROOT.FALLBACK: unknown route property 'pathParam'",
      ],
    );
  });

  it('requires an unambiguous delimited-array separator', () => {
    expectInvalid(
      {
        ROOT: {
          path: '',
          queryParams: {
            empty: delimitedQueryParam({ codec: stringCodec(), separator: '' }),
            unsafe: delimitedQueryParam({ codec: stringCodec(), separator: '-' }),
          },
        },
      },
      [
        "ROOT: query parameter 'empty' separator must be one character escaped by encodeURIComponent",
        "ROOT: query parameter 'unsafe' separator must be one character escaped by encodeURIComponent",
      ],
    );
  });
});
