import { Component, InjectionToken, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { stringPathParam, stringQueryParam } from './params';
import { defineAppRouter, fallbackRoute } from './app-router';

@Component({ template: '' })
class EmptyComponent {}

describe('defineAppRouter', () => {
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
});
