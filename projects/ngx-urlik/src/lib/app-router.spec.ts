import { Component, InjectionToken, inject, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  NavigationEnd,
  Router,
  withComponentInputBinding,
  withRouterConfig,
} from '@angular/router';
import { filter, firstValueFrom } from 'rxjs';
import {
  numberPathParam,
  numberQueryParam,
  pathParam,
  queryParam,
  stringPathParam,
  stringQueryParam,
} from './params';
import { defineAppRouter, fallbackRoute } from './app-router';

@Component({ template: '' })
class EmptyComponent {}

describe('defineAppRouter', () => {
  it('makes accepted route definitions immutable after definition', () => {
    const serializer = {
      serialize: (value: string | null) => value,
      deserialize: (value: unknown) => (typeof value === 'string' ? value : null),
    };
    const data = { nested: { labels: ['original'] } };
    const guards = [() => true];
    const providers = [{ provide: 'immutable-test', useValue: true }];
    const routes = {
      ROOT: {
        path: '',
        data,
        canActivate: guards,
        providers,
        queryParams: { custom: queryParam({ serializer }) },
        children: {
          USER: { path: 'users', component: EmptyComponent },
        },
      },
    };
    const definition = defineAppRouter({ routes });

    expect(() => ((routes.ROOT.children.USER as { path: string }).path = 'changed')).toThrow();
    expect(() => data.nested.labels.push('changed')).toThrow();
    expect(() => guards.push(() => false)).toThrow();
    expect(() => providers.push({ provide: 'other', useValue: false })).toThrow();
    expect(() => ((providers[0] as { useValue: boolean }).useValue = false)).toThrow();
    expect(() => (serializer.serialize = () => 'changed')).toThrow();
    TestBed.configureTestingModule({ providers: [definition.provideAppRouter()] });
    const appRouter = TestBed.runInInjectionContext(() => inject(definition.AppRouter));
    const router = TestBed.inject(Router);
    expect(router.serializeUrl(appRouter.ROOT.USER.createUrlTree())).toBe('/users');
  });

  it('constructs deterministic absolute URLs through the real Angular Router', () => {
    const definition = defineAppRouter({
      routes: {
        ROOT: {
          path: '',
          children: {
            USER: {
              path: 'users',
              pathParam: stringPathParam({ name: 'userId' }),
              queryParams: { search: stringQueryParam() },
              component: EmptyComponent,
            },
            NOT_FOUND: fallbackRoute({ component: EmptyComponent }),
          },
        },
      },
    });
    TestBed.configureTestingModule({ providers: [definition.provideAppRouter()] });
    const appRouter = TestBed.runInInjectionContext(() => inject(definition.AppRouter));
    const router = TestBed.inject(Router);
    expect(
      router.serializeUrl(
        appRouter.ROOT.USER.createUrlTree({ path: { userId: 'a b' }, query: { search: 'x' } }),
      ),
    ).toBe('/users/a%20b?search=x');
  });

  it('rejects NaN path output and canonically omits NaN query output', () => {
    const definition = defineAppRouter({
      routes: {
        ROOT: {
          path: 'numbers',
          pathParam: numberPathParam({ name: 'id' }),
          queryParams: { filter: numberQueryParam() },
          component: EmptyComponent,
        },
      },
    });
    TestBed.configureTestingModule({ providers: [definition.provideAppRouter()] });
    const appRouter = TestBed.runInInjectionContext(() => inject(definition.AppRouter));
    const router = TestBed.inject(Router);

    expect(() =>
      appRouter.ROOT.createUrlTree({ path: { id: Number.NaN }, query: { filter: 1 } }),
    ).toThrow(/path parameter 'id' cannot serialize to an empty segment/);
    expect(
      router.serializeUrl(
        appRouter.ROOT.createUrlTree({ path: { id: 1 }, query: { filter: Number.NaN } }),
      ),
    ).toBe('/numbers/1');
  });

  it('reads accumulated state and updates only owned query keys', async () => {
    const definition = defineAppRouter({
      routes: {
        ROOT: {
          path: '',
          queryParams: {
            locale: stringQueryParam({ defaultValue: 'en' }),
          },
          children: {
            USER: {
              path: 'users',
              pathParam: stringPathParam({ name: 'userId' }),
              queryParams: { search: stringQueryParam() },
              component: EmptyComponent,
            },
          },
        },
      },
    });
    TestBed.configureTestingModule({ providers: [definition.provideAppRouter()] });
    const appRouter = TestBed.runInInjectionContext(() => inject(definition.AppRouter));
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/users/42?locale=fr&search=old&unknown=keep');
    const ref = appRouter.ROOT.USER.urlParams();
    expect(ref.value()).toEqual({ path: { userId: '42' }, query: { locale: 'fr', search: 'old' } });
    await ref.updateQueryParams((query) => ({ ...query, locale: 'en', search: null }));
    expect(router.url).toBe('/users/42?unknown=keep');
  });

  it('invokes a query updater once and preserves descendant and unknown keys', async () => {
    const definition = defineAppRouter({
      routes: {
        ROOT: {
          path: '',
          queryParams: { locale: stringQueryParam() },
          children: {
            CHILD: {
              path: 'child',
              queryParams: { search: stringQueryParam() },
              component: EmptyComponent,
            },
          },
        },
      },
    });
    TestBed.configureTestingModule({ providers: [definition.provideAppRouter()] });
    const appRouter = TestBed.runInInjectionContext(() => inject(definition.AppRouter));
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/child?locale=en&search=term&unknown=keep');
    let calls = 0;
    await appRouter.ROOT.urlParams().updateQueryParams(
      (previous) => {
        calls++;
        expect(previous).toEqual({ locale: 'en' });
        return { locale: 'fr' };
      },
      { replaceUrl: true },
    );
    expect(calls).toBe(1);
    expect(router.url).toBe('/child?locale=fr&search=term&unknown=keep');
  });

  it('forwards navigation behavior options and always navigates absolutely', async () => {
    const definition = defineAppRouter({
      routes: {
        ROOT: {
          path: 'app',
          children: {
            TARGET: { path: 'target', component: EmptyComponent },
            OTHER: { path: 'elsewhere', component: EmptyComponent },
          },
        },
      },
    });
    TestBed.configureTestingModule({ providers: [definition.provideAppRouter()] });
    const appRouter = TestBed.runInInjectionContext(() => inject(definition.AppRouter));
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/app/elsewhere');
    const navigateByUrl = vi.spyOn(router, 'navigateByUrl');
    await appRouter.ROOT.TARGET.navigate(undefined, {
      replaceUrl: true,
      state: { source: 'test' },
    });
    expect(router.url).toBe('/app/target');
    expect(navigateByUrl).toHaveBeenCalledWith(expect.anything(), {
      replaceUrl: true,
      state: { source: 'test' },
    });
  });

  it('throws expected-versus-attempted context for malformed active path state', async () => {
    const definition = defineAppRouter({
      routes: {
        ROOT: {
          path: 'items',
          pathParam: pathParam<string | null, 'id'>({
            name: 'id',
            serializer: {
              serialize: String,
              deserialize: (raw: unknown) => (raw === 'valid' ? raw : null),
            },
          }),
          component: EmptyComponent,
        },
      },
    });
    TestBed.configureTestingModule({ providers: [definition.provideAppRouter()] });
    const appRouter = TestBed.runInInjectionContext(() => inject(definition.AppRouter));
    await TestBed.inject(Router).navigateByUrl('/items/invalid');
    expect(() => appRouter.ROOT.urlParams().value()).toThrow(
      /expected active route 'items\/:id'.*attempted current path '\/items\/invalid'.*'id'/,
    );
  });

  it('always inherits ancestor parameters and applies user router configuration', async () => {
    const definition = defineAppRouter({
      routerConfig: { onSameUrlNavigation: 'reload' },
      routes: {
        ROOT: {
          path: 'accounts',
          pathParam: stringPathParam({ name: 'accountId' }),
          children: { SETTINGS: { path: 'settings', component: EmptyComponent } },
        },
      },
    });
    TestBed.configureTestingModule({ providers: [definition.provideAppRouter()] });
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/accounts/42/settings');
    const child = router.routerState.snapshot.root.firstChild?.firstChild;
    expect(child?.paramMap.get('accountId')).toBe('42');

    const nextEnd = firstValueFrom(
      router.events.pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd)),
    );
    await router.navigateByUrl('/accounts/42/settings');
    await expect(nextEnd).resolves.toBeInstanceOf(NavigationEnd);
  });

  it('rejects router configuration features while accepting forwarded router features', async () => {
    const definition = defineAppRouter({
      routes: { ROOT: { path: '', component: EmptyComponent } },
    });
    expect(() =>
      definition.provideAppRouter(withRouterConfig({ onSameUrlNavigation: 'reload' }) as never),
    ).toThrow(/withRouterConfig\(\).*defineAppRouter/);

    TestBed.configureTestingModule({
      providers: [definition.provideAppRouter(withComponentInputBinding())],
    });
    await expect(TestBed.inject(Router).navigateByUrl('/')).resolves.toBe(true);
  });

  it('starts concurrent query updates immediately without queueing them', async () => {
    const definition = defineAppRouter({
      routes: {
        ROOT: { path: '', queryParams: { value: stringQueryParam() } },
      },
    });
    TestBed.configureTestingModule({ providers: [definition.provideAppRouter()] });
    const appRouter = TestBed.runInInjectionContext(() => inject(definition.AppRouter));
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/?value=initial');
    const pending: Array<(result: boolean) => void> = [];
    vi.spyOn(router, 'navigateByUrl').mockImplementation(
      () => new Promise<boolean>((resolve) => pending.push(resolve)),
    );

    const first = appRouter.ROOT.urlParams().updateQueryParams(() => ({ value: 'first' }));
    const second = appRouter.ROOT.urlParams().updateQueryParams(() => ({ value: 'second' }));
    expect(pending).toHaveLength(2);
    pending.forEach((resolve) => resolve(true));
    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
  });

  it('inherits ancestor path state, reads the first repeated query value, and reacts to defaults', async () => {
    const fallbackDefault = signal('first');
    const prefix = new InjectionToken<string>('prefix', { factory: () => 'injected-' });
    const definition = defineAppRouter({
      routes: {
        ROOT: {
          path: 'orgs',
          pathParam: pathParam({
            name: 'orgId',
            serializer: {
              serialize: (value: string) => inject(prefix) + value,
              deserialize: (value) =>
                typeof value === 'string' ? value.replace(inject(prefix), '') : null,
            },
          }),
          queryParams: {
            locale: stringQueryParam({ defaultValue: () => fallbackDefault() }),
          },
          children: {
            MEMBER: {
              path: 'members',
              pathParam: stringPathParam({ name: 'memberId' }),
              queryParams: { tag: stringQueryParam() },
              component: EmptyComponent,
            },
          },
        },
      },
    });
    TestBed.configureTestingModule({ providers: [definition.provideAppRouter()] });
    const appRouter = TestBed.runInInjectionContext(() => inject(definition.AppRouter));
    const router = TestBed.inject(Router);

    expect(
      router.serializeUrl(
        appRouter.ROOT.MEMBER.createUrlTree({
          path: { orgId: 'acme', memberId: '7' },
        }),
      ),
    ).toBe('/orgs/injected-acme/members/7');
    await router.navigateByUrl('/orgs/injected-acme/members/7?tag=one&tag=two');
    const ref = appRouter.ROOT.MEMBER.urlParams();
    expect(ref.value()).toEqual({
      path: { orgId: 'acme', memberId: '7' },
      query: { locale: 'first', tag: 'one' },
    });
    fallbackDefault.set('second');
    expect(ref.value().query.locale).toBe('second');
  });

  it('provides stable default refs, contextual inactive errors, and uncached comparator refs', async () => {
    const definition = defineAppRouter({
      routes: {
        ROOT: {
          path: '',
          children: {
            ONE: { path: 'one', component: EmptyComponent },
            TWO: { path: 'two', component: EmptyComponent },
          },
        },
      },
    });
    TestBed.configureTestingModule({ providers: [definition.provideAppRouter()] });
    const appRouter = TestBed.runInInjectionContext(() => inject(definition.AppRouter));
    const router = TestBed.inject(Router);
    const stable = appRouter.ROOT.ONE.urlParams();
    expect(appRouter.ROOT.ONE.urlParams()).toBe(stable);
    expect(appRouter.ROOT.ONE.urlParams({ isEqual: () => true })).not.toBe(
      appRouter.ROOT.ONE.urlParams({ isEqual: () => true }),
    );
    await router.navigateByUrl('/two');
    expect(() => stable.value()).toThrow(
      /ONE.*expected active route 'one'.*primary route is inactive/,
    );
  });

  it('inherits route equality and gives call-site equality highest precedence', async () => {
    const definition = defineAppRouter({
      routes: {
        ROOT: {
          path: '',
          isEqual: () => true,
          children: {
            CHILD: {
              path: 'child',
              queryParams: { value: stringQueryParam() },
              component: EmptyComponent,
            },
          },
        },
      },
    });
    TestBed.configureTestingModule({ providers: [definition.provideAppRouter()] });
    const appRouter = TestBed.runInInjectionContext(() => inject(definition.AppRouter));
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/child?value=one');
    const inherited = appRouter.ROOT.CHILD.urlParams();
    expect(inherited.value().query.value).toBe('one');
    await router.navigateByUrl('/child?value=two');
    expect(inherited.value().query.value).toBe('one');

    const overridden = appRouter.ROOT.CHILD.urlParams({ isEqual: () => false });
    expect(overridden.value().query.value).toBe('two');
    await router.navigateByUrl('/child?value=three');
    expect(overridden.value().query.value).toBe('three');
  });

  it('adds route and parameter context when a custom deserializer throws', async () => {
    const definition = defineAppRouter({
      routes: {
        ROOT: {
          path: '',
          queryParams: {
            broken: queryParam<string | null>({
              serializer: {
                serialize: (value) => value,
                deserialize: () => {
                  throw new Error('adapter failed');
                },
              },
            }),
          },
        },
      },
    });
    TestBed.configureTestingModule({ providers: [definition.provideAppRouter()] });
    const appRouter = TestBed.runInInjectionContext(() => inject(definition.AppRouter));
    await TestBed.inject(Router).navigateByUrl('/');
    expect(() => appRouter.ROOT.urlParams().value()).toThrow(
      /ROOT: failed to deserialize parameter 'broken'/,
    );
  });

  it('aggregates structural errors', () => {
    expect(() =>
      defineAppRouter({
        routes: {
          ROOT: {
            path: '',
            children: {
              BAD: { path: 'bad/path' },
              BAD_TOO: { path: 'bad/path' },
            },
          },
        },
      }),
    ).toThrow(/\n- .*path.*\n-/);
  });

  it('aggregates contextual errors for null and non-object route definitions', () => {
    expect(() =>
      defineAppRouter({
        routes: {
          NULL_ROUTE: null,
          NUMBER_ROUTE: 42,
        } as never,
      }),
    ).toThrow(
      /NULL_ROUTE: route definition must be a non-null object[\s\S]*NUMBER_ROUTE: route definition must be a non-null object/,
    );
  });

  it.each([
    ['null', null],
    ['an array', []],
    ['a number', 42],
  ])('rejects %s as the top-level route collection with a structural diagnostic', (_, routes) => {
    expect(() => defineAppRouter({ routes } as never)).toThrow(
      /Invalid app router definition:\n- routes: route collection must be a non-null object/,
    );
  });

  it('aggregates an explicitly undefined redirect with other route errors', () => {
    expect(() =>
      defineAppRouter({
        routes: {
          ROOT: {
            path: 'bad/path',
            redirectTo: undefined,
          },
        } as never,
      }),
    ).toThrow(
      /ROOT: redirectTo must be a function[\s\S]*ROOT: path must be empty or one valid static segment/,
    );
  });

  it('rejects a fallback root and equivalent sibling dynamic patterns', () => {
    expect(() =>
      defineAppRouter({
        routes: {
          ROOT: fallbackRoute({}),
        },
      }),
    ).toThrow(/ROOT: the root route cannot be a fallback/);

    expect(() =>
      defineAppRouter({
        routes: {
          ROOT: {
            path: '',
            children: {
              BY_USER: { path: 'items', pathParam: stringPathParam({ name: 'userId' }) },
              BY_ITEM: { path: 'items', pathParam: stringPathParam({ name: 'itemId' }) },
            },
          },
        },
      }),
    ).toThrow(/BY_ITEM: duplicates sibling URL pattern 'items\/:param' from ROOT.BY_USER/);
  });

  it('runs functional redirects in injection context with accumulated parameters', async () => {
    let appToken!: InjectionToken<any>;
    const definition = defineAppRouter({
      routes: {
        ROOT: {
          path: '',
          children: {
            USER: {
              path: 'users',
              pathParam: stringPathParam({ name: 'userId' }),
              component: EmptyComponent,
            },
            LEGACY: {
              path: 'legacy',
              pathParam: stringPathParam({ name: 'userId' }),
              redirectTo: ({ path }) =>
                inject(appToken).ROOT.USER.createUrlTree({ path: { userId: path['userId'] } }),
            },
          },
        },
      },
    });
    appToken = definition.AppRouter;
    TestBed.configureTestingModule({ providers: [definition.provideAppRouter()] });
    const router = TestBed.inject(Router);
    expect(await router.navigateByUrl('/legacy/42')).toBe(true);
    expect(router.url).toBe('/users/42');
  });

  it('passes accumulated source state to redirects below componentful parameterized ancestors', async () => {
    let appToken!: InjectionToken<any>;
    let sourceState: unknown;
    const definition = defineAppRouter({
      routes: {
        ROOT: {
          path: 'teams',
          pathParam: stringPathParam({ name: 'teamId' }),
          queryParams: { locale: stringQueryParam() },
          component: EmptyComponent,
          children: {
            TARGET: { path: 'target', component: EmptyComponent },
            LEGACY: {
              path: 'legacy',
              queryParams: { tab: stringQueryParam() },
              redirectTo: (state) => {
                sourceState = state;
                return inject(appToken).ROOT.TARGET.createUrlTree({
                  path: { teamId: state.path.teamId },
                  query: { locale: state.query.locale },
                });
              },
            },
          },
        },
      },
    });
    appToken = definition.AppRouter;
    TestBed.configureTestingModule({ providers: [definition.provideAppRouter()] });
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/teams/acme/legacy?locale=en&tab=old');
    expect(sourceState).toEqual({
      path: { teamId: 'acme' },
      query: { locale: 'en', tab: 'old' },
    });
    expect(router.url).toBe('/teams/acme/target?locale=en');
  });

  it('matches redirects exactly and keeps fallbacks scoped below a non-empty root', async () => {
    let appToken!: InjectionToken<any>;
    const definition = defineAppRouter({
      routes: {
        ROOT: {
          path: 'app',
          children: {
            TARGET: { path: 'target', component: EmptyComponent },
            OLD: {
              path: 'old',
              redirectTo: () => inject(appToken).ROOT.TARGET.createUrlTree(),
            },
            NOT_FOUND: fallbackRoute({ component: EmptyComponent }),
          },
        },
      },
    });
    appToken = definition.AppRouter;
    TestBed.configureTestingModule({ providers: [definition.provideAppRouter()] });
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/app/old/extra');
    expect(router.url).toBe('/app/old/extra');
    await router.navigateByUrl('/app/missing');
    expect(router.url).toBe('/app/missing');
    await expect(router.navigateByUrl('/outside')).rejects.toThrow(/Cannot match any routes/);
  });

  it('forwards Angular features, route providers, canMatch hooks, and lazy components', async () => {
    const routeValue = new InjectionToken<string>('route value');
    let matchedWith: string | undefined;
    let lazyLoads = 0;
    const definition = defineAppRouter({
      routes: {
        ROOT: {
          path: '',
          children: {
            LAZY: {
              path: 'lazy',
              providers: [{ provide: routeValue, useValue: 'provided' }],
              canMatch: [() => ((matchedWith = inject(routeValue)), true)],
              loadComponent: async () => {
                lazyLoads++;
                return EmptyComponent;
              },
            },
          },
        },
      },
    });
    TestBed.configureTestingModule({
      providers: [definition.provideAppRouter(withComponentInputBinding())],
    });
    expect(await TestBed.inject(Router).navigateByUrl('/lazy')).toBe(true);
    expect(matchedWith).toBe('provided');
    expect(lazyLoads).toBe(1);
  });

  it('preserves ordinary activation, deactivation, resolution, data, title, and rerun behavior', async () => {
    const calls: string[] = [];
    let resolutions = 0;
    const definition = defineAppRouter({
      routes: {
        ROOT: {
          path: '',
          canActivateChild: [() => (calls.push('activate-child'), true)],
          children: {
            GUARDED: {
              path: 'guarded',
              component: EmptyComponent,
              canActivate: [() => (calls.push('activate'), true)],
              canDeactivate: [() => (calls.push('deactivate'), true)],
              resolve: {
                resolved: () => {
                  resolutions++;
                  return `value-${resolutions}`;
                },
              },
              data: { static: 'kept' },
              title: 'Guarded title',
              runGuardsAndResolvers: 'paramsOrQueryParamsChange',
            },
            OTHER: { path: 'other', component: EmptyComponent },
          },
        },
      },
    });
    TestBed.configureTestingModule({ providers: [definition.provideAppRouter()] });
    const router = TestBed.inject(Router);

    await router.navigateByUrl('/guarded?version=1');
    const guarded = router.routerState.snapshot.root.firstChild?.firstChild;
    expect(calls).toEqual(['activate-child', 'activate']);
    expect(guarded?.data).toMatchObject({ static: 'kept', resolved: 'value-1' });
    expect(guarded?.title).toBe('Guarded title');

    await router.navigateByUrl('/guarded?version=2');
    expect(resolutions).toBe(2);
    expect(calls).toEqual(['activate-child', 'activate', 'activate-child', 'activate']);

    await router.navigateByUrl('/other');
    expect(calls).toContain('deactivate');
  });
});
