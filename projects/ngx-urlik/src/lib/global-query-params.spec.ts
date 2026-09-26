import { Component, computed, inject, InjectionToken, isSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AppRouterDiagnostic } from './app-router';
import { defineLegacyAppRouter as defineAppRouter } from './legacy-app-router.spec-helper';
import {
  delimitedQueryParam,
  numberCodec,
  queryParam,
  repeatedQueryParam,
  stringCodec,
} from './params';

@Component({ template: '' })
class Page {}

const fallback = new InjectionToken<string>('fallback');
const definitions = {
  timeRange: queryParam({ codec: stringCodec(), defaultValue: () => inject(fallback) }),
  count: queryParam({ codec: numberCodec(), required: true }),
  tags: repeatedQueryParam({ codec: stringCodec() }),
  ids: delimitedQueryParam({ codec: numberCodec(), separator: ',' }),
};

function setup() {
  const diagnostics: AppRouterDiagnostic[] = [];
  const definition = defineAppRouter({
    diagnostics: { warn: (diagnostic) => diagnostics.push(diagnostic) },
    routes: {
      ROOT: {
        path: '',
        children: {
          PAGE: { path: 'page', queryParams: definitions, angular: { component: Page } },
          OTHER: { path: 'other', angular: { component: Page } },
          BLOCKED: {
            path: 'blocked',
            angular: { component: Page, canActivate: [() => false] },
          },
          globalQueryParams: { path: 'child', angular: { component: Page } },
        },
      },
    },
  });
  TestBed.configureTestingModule({
    providers: [definition.provideAppRouter(), { provide: fallback, useValue: 'week' }],
  });
  return {
    app: TestBed.inject(definition.AppRouter),
    router: TestBed.inject(Router),
    diagnostics,
  };
}

describe('globalQueryParams', () => {
  it('reads startup fallbacks outside an injection context and matches page decoding', async () => {
    const { app, router } = setup();
    const global = app.globalQueryParams(definitions);
    expect(global()).toEqual({ timeRange: 'week', count: null, tags: [], ids: [] });
    expect(isSignal(global)).toBe(true);
    await router.navigateByUrl('/page?timeRange=day&count=1&count=2&tags=a&tags=b&ids=3,4');
    expect(global()).toEqual(app.ROOT.PAGE.params().query);
    expect(global()).toEqual({ timeRange: 'day', count: 2, tags: ['a', 'b'], ids: [3, 4] });
    await router.navigateByUrl('/other?timeRange=month');
    expect(global()).toEqual({ timeRange: 'month', count: null, tags: [], ids: [] });
    await app.ROOT.OTHER.navigate();
    expect(global().timeRange).toBe('week');
  });

  it('keeps overlapping views independent and reports malformed values without a route owner', async () => {
    const { app, router, diagnostics } = setup();
    const global = app.globalQueryParams(definitions);
    const alternate = app.globalQueryParams({ count: queryParam({ codec: stringCodec() }) });
    await router.navigateByUrl('/page?count=oops&ids=1&ids=2');
    expect(global().count).toBeNull();
    expect(global().ids).toEqual([]);
    expect(alternate().count).toBe('oops');
    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          route: 'globalQueryParams',
          parameter: 'count',
          code: 'PARAM_DESERIALIZE_FAILED',
        }),
        expect.objectContaining({
          route: 'globalQueryParams',
          parameter: 'ids',
          code: 'INVALID_ARRAY_REPRESENTATION',
        }),
      ]),
    );
    const throwing = app.globalQueryParams({
      count: queryParam({
        codec: {
          serialize: (value: string) => value,
          deserialize: (): string | null => {
            throw new Error('codec');
          },
        },
      }),
    });
    expect(throwing().count).toBeNull();
    expect(diagnostics.at(-1)?.code).toBe('PARAM_CODEC_THROWN');
  });

  it('suppresses equal values and accepts a comparator over the direct query object', async () => {
    const { app, router } = setup();
    const global = app.globalQueryParams(definitions);
    let evaluations = 0;
    const observed = computed(() => {
      evaluations++;
      return global();
    });
    await router.navigateByUrl('/page?count=1');
    const initial = observed();
    await router.navigateByUrl('/other?count=1&unrelated=yes');
    expect(observed()).toBe(initial);
    expect(evaluations).toBe(1);
    await router.navigateByUrl('/other?count=2');
    expect(observed().count).toBe(2);
    expect(evaluations).toBe(2);

    const compare = vi.fn(
      (a: Readonly<{ count: number | null }>, b: Readonly<{ count: number | null }>) =>
        a.count === b.count,
    );
    const custom = app.globalQueryParams(definitions, { isEqual: compare });
    const previous = custom();
    await router.navigateByUrl('/other?count=2&timeRange=year');
    expect(custom()).toBe(previous);
    expect(compare).toHaveBeenCalledWith(
      previous,
      expect.objectContaining({ count: 2, timeRange: 'year' }),
    );
  });

  it('retains page-aligned state when navigation is blocked', async () => {
    const { app, router } = setup();
    await router.navigateByUrl('/page?count=1');
    const global = app.globalQueryParams(definitions);
    const page = app.ROOT.PAGE;
    expect(global()).toEqual(page.params().query);
    expect(await router.navigateByUrl('/blocked?count=9')).toBe(false);
    expect(global().count).toBe(1);
    expect(global()).toEqual(page.params().query);
  });

  it('reserves the method name only at the router root', async () => {
    expect(() => defineAppRouter({ routes: { globalQueryParams: { path: '' } } } as never)).toThrow(
      'globalQueryParams',
    );
    const { app, router } = setup();
    await app.ROOT.globalQueryParams.navigate();
    expect(router.url).toBe('/child');
  });
});
