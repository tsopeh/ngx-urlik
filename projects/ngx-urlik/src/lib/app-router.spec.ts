import { Component, EnvironmentProviders, InjectionToken, inject, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  NavigationEnd,
  Router,
  UrlTree,
  withComponentInputBinding,
  withRouterConfig,
} from '@angular/router';
import { filter, firstValueFrom } from 'rxjs';
import {
  UrlParamCodec,
  delimitedQueryParam,
  numberCodec,
  pathParam,
  queryParam,
  repeatedQueryParam,
  stringCodec,
} from './params';
import { AppRouterDiagnostic, defineAppRouter } from './app-router';

@Component({ template: '' })
class EmptyComponent {}

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
    expect(appRouter.ROOT.urlParams().value()).toEqual({ path: {}, query: { search: 'term' } });
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
    expect(appRouter.ROOT.urlParams().value().query).toEqual({
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
    expect(appRouter.ROOT.urlParams().value().query).toEqual({
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
    expect(appRouter.ROOT.urlParams().value().query).toEqual({
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
    expect(appRouter.ROOT.urlParams().value().query.ids).toEqual([9]);
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
    expect(appRouter.ROOT.urlParams().value().query.broken).toBeNull();
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
    expect(() => appRouter.ROOT.ITEM.urlParams().value()).toThrow(
      "ITEM: expected active route 'items/:id', but the current primary route is inactive",
    );
    await router.navigateByUrl('/items/invalid');
    expect(() => appRouter.ROOT.ITEM.urlParams().value()).toThrow(
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
    expect(appRouter.ROOT.urlParams().value().query.locale).toBe('en');
    current.set('fr');
    expect(appRouter.ROOT.urlParams().value().query.locale).toBe('fr');
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
    expect(() => appRouter.ROOT.urlParams().value()).toThrow(failure);
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
    await appRouter.ROOT.urlParams().updateQueryParams((previous) => {
      calls++;
      expect(previous).toEqual({ locale: 'en' });
      return { locale: 'fr' };
    });
    expect(calls).toBe(1);
    expect(router.url).toBe('/child?locale=fr&search=term&unknown=keep');
  });

  it('retains stable refs and route/call-site equality precedence', async () => {
    const routeEquality = vi.fn(() => false);
    const callEquality = vi.fn(() => true);
    const definition = defineAppRouter({
      routes: {
        ROOT: {
          path: '',
          queryParams: { value: queryParam({ codec: stringCodec() }) },
          isEqual: routeEquality,
          angular: { component: EmptyComponent },
        },
      },
    });
    const { appRouter, router } = setup(definition);
    await router.navigateByUrl('/?value=a');
    expect(appRouter.ROOT.urlParams()).toBe(appRouter.ROOT.urlParams());
    const inheritedRef = appRouter.ROOT.urlParams();
    const overriddenRef = appRouter.ROOT.urlParams({ isEqual: callEquality });
    inheritedRef.value();
    overriddenRef.value();
    await router.navigateByUrl('/?value=b');
    inheritedRef.value();
    overriddenRef.value();
    expect(routeEquality).toHaveBeenCalled();
    expect(callEquality).toHaveBeenCalled();
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
      "LEGACY: deserialize query parameter 'id' was invalid",
      "TARGET: serialize path parameter 'id' was invalid",
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

  it('reserves escapeHatch only at the router root', () => {
    expectInvalid({ escapeHatch: { path: '' } }, [
      "escapeHatch: 'escapeHatch' is reserved at the router root",
    ]);
    expect(() =>
      defineAppRouter({
        routes: {
          ROOT: { path: '', children: { escapeHatch: { path: 'allowed' } } },
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
