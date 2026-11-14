import { Location } from '@angular/common';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NavigationEnd, Router, withComponentInputBinding } from '@angular/router';
import { filter, firstValueFrom } from 'rxjs';
import { defineAppRouter } from './app-router';

@Component({ template: '' })
class Page {}

function setup(...features: Parameters<ReturnType<typeof defineAppRouter>['provideAppRouter']>) {
  const definition = defineAppRouter(
    { HOME: 'HOME' },
    {
      routes: [
        { path: 'home', routeName: 'HOME', component: Page },
        { path: 'reports/:id', component: Page },
      ],
    },
  );
  TestBed.configureTestingModule({ providers: [definition.provideAppRouter(...features)] });
  return {
    escapeHatch: TestBed.inject(definition.AppRouter).escapeHatch,
    router: TestBed.inject(Router),
  };
}

describe('escapeHatch', () => {
  it("navigates to any URL with Angular's own methods", async () => {
    const { escapeHatch, router } = setup();

    await expect(escapeHatch.navigateByUrl('/reports/4?tab=cost')).resolves.toBe(true);
    expect(router.url).toBe('/reports/4?tab=cost');

    await expect(
      escapeHatch.navigate(['/reports', 5], { queryParams: { tab: 'time' } }),
    ).resolves.toBe(true);
    expect(router.url).toBe('/reports/5?tab=time');
  });

  it("builds, parses, and writes URLs exactly as Angular's router does", async () => {
    const { escapeHatch, router } = setup();
    await router.navigateByUrl('/reports/4');

    const relative = escapeHatch.createUrlTree(['..', '7'], { relativeTo: null });
    expect(escapeHatch.serializeUrl(relative)).toBe(
      router.serializeUrl(router.createUrlTree(['..', '7'])),
    );
    expect(escapeHatch.parseUrl('/home?x=1#top')).toEqual(router.parseUrl('/home?x=1#top'));
  });

  it('keeps browserUrl, so the address bar can show a different URL', async () => {
    const { escapeHatch, router } = setup();

    await escapeHatch.navigateByUrl('/reports/4', { browserUrl: '/shared/abc' });

    expect(router.url).toBe('/reports/4');
    expect(TestBed.inject(Location).path()).toBe('/shared/abc');
  });

  it("reads the router's current values each time, not a copy", async () => {
    const { escapeHatch, router } = setup(withComponentInputBinding());
    expect(escapeHatch.navigated).toBe(false);
    expect(escapeHatch.componentInputBindingEnabled).toBe(true);

    const ended = firstValueFrom(
      escapeHatch.events.pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      ),
    );
    const navigation = router.navigateByUrl('/home');
    expect(escapeHatch.currentNavigation()?.extractedUrl.toString()).toBe('/home');
    await navigation;

    expect((await ended).url).toBe('/home');
    expect(escapeHatch.url).toBe('/home');
    expect(escapeHatch.navigated).toBe(true);
    expect(escapeHatch.currentNavigation()).toBeNull();
    expect(escapeHatch.lastSuccessfulNavigation()?.finalUrl?.toString()).toBe('/home');
  });

  it('leaves out router state, the route config, and lifecycle controls', () => {
    const { escapeHatch } = setup();

    for (const name of ['routerState', 'config', 'resetConfig', 'dispose', 'initialNavigation']) {
      expect(escapeHatch).not.toHaveProperty(name);
    }
  });
});
