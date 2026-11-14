import type { Signal } from '@angular/core';
import type { Router } from '@angular/router';
import { describe, expectTypeOf, it } from 'vitest';
import { appRouter } from './fixtures';

const { escapeHatch } = appRouter;

describe('escapeHatch', () => {
  it("passes Angular's own methods through, with Angular's types", () => {
    expectTypeOf(escapeHatch.navigateByUrl).toEqualTypeOf<Router['navigateByUrl']>();
    expectTypeOf(escapeHatch.navigate).toEqualTypeOf<Router['navigate']>();
    expectTypeOf(escapeHatch.createUrlTree).toEqualTypeOf<Router['createUrlTree']>();
    expectTypeOf(escapeHatch.url).toEqualTypeOf<string>();
    expectTypeOf(escapeHatch.isActive('/teams')).toEqualTypeOf<Signal<boolean>>();
  });

  it('keeps browserUrl, which typed navigation leaves out', () => {
    escapeHatch.navigateByUrl('/teams', { browserUrl: '/elsewhere' });
  });

  it('leaves out router state, the route config, and lifecycle controls', () => {
    // @ts-expect-error raw router state isn't passed through
    void escapeHatch.routerState;
    // @ts-expect-error the route list is fixed
    escapeHatch.resetConfig([]);
    // @ts-expect-error lifecycle controls stay with Angular
    escapeHatch.dispose();
  });

  it('is read-only', () => {
    // @ts-expect-error escapeHatch values can't be replaced
    escapeHatch.url = '/';
  });
});
