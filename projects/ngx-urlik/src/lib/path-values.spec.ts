import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { defineAppRouter } from './app-router';
import { numberCodec, UrlParamCodec } from './params';

@Component({ template: '' })
class Page {}

function setup(codec: UrlParamCodec<string>) {
  const definition = defineAppRouter(
    { ITEM: 'ITEM', FALLBACK: 'FALLBACK' },
    {
      routes: [
        { path: 'items/:id', routeName: 'ITEM', pathParam: { id: codec }, component: Page },
        { path: 'items/:slug', routeName: 'FALLBACK', component: Page },
      ],
    },
  );
  TestBed.configureTestingModule({ providers: [definition.provideAppRouter()] });
  const appRouter = TestBed.inject(definition.AppRouter);
  return { ...appRouter.routes, appRouter, router: TestBed.inject(Router) };
}

const codec = (serialize: (value: string) => unknown): UrlParamCodec<string> => ({
  serialize: serialize as UrlParamCodec<string>['serialize'],
  deserialize: (raw) => raw,
});

describe('path values', () => {
  describe('when a link is built', () => {
    it("throws if the codec throws, and keeps the codec's error as the cause", async () => {
      const failure = new Error('ids are lowercase');
      const { ITEM } = setup(
        codec(() => {
          throw failure;
        }),
      );

      let thrown: unknown;
      try {
        ITEM.createUrlTree({ path: { id: 'ABC' } });
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toEqual(new Error("ITEM: can't write path parameter 'id': the codec threw"));
      expect((thrown as Error).cause).toBe(failure);
    });

    it.each([
      ["returns ''", '', "the codec returned '', and a path segment can't be empty"],
      ['returns null', null, "the codec didn't return a string"],
      ['returns a number', 4, "the codec didn't return a string"],
    ])('throws if the codec %s', (_case, output, detail) => {
      const { ITEM } = setup(codec(() => output));
      expect(() => ITEM.createUrlTree({ path: { id: 'x' } })).toThrow(
        `ITEM: can't write path parameter 'id': ${detail}`,
      );
    });

    it('makes navigate() reject, before Angular sees the navigation', async () => {
      const { ITEM, router } = setup(codec(() => ''));
      const navigate = vi.spyOn(router, 'navigateByUrl');

      await expect(ITEM.navigate({ path: { id: 'x' } })).rejects.toThrow(/can't be empty/);
      expect(navigate).not.toHaveBeenCalled();
    });
  });

  describe('when Angular matches a URL', () => {
    it('tries the next route if the codec throws', async () => {
      const { FALLBACK, router } = setup({
        serialize: (value) => value,
        deserialize: (raw) => {
          if (raw.startsWith('-')) {
            throw new Error('no negative ids');
          }
          return raw;
        },
      });

      await router.navigateByUrl('/items/-4');

      expect(FALLBACK.params().path.slug).toBe('-4');
    });

    it('tries the next route if the codec returns null', async () => {
      const definition = defineAppRouter(
        { ITEM: 'ITEM', FALLBACK: 'FALLBACK' },
        {
          routes: [
            {
              path: 'items/:id',
              routeName: 'ITEM',
              pathParam: { id: numberCodec() },
              component: Page,
            },
            { path: 'items/:slug', routeName: 'FALLBACK', component: Page },
          ],
        },
      );
      TestBed.configureTestingModule({ providers: [definition.provideAppRouter()] });
      const { routes } = TestBed.inject(definition.AppRouter);

      await TestBed.inject(Router).navigateByUrl('/items/abc');

      expect(routes.ITEM.ifActive()).toBeNull();
      expect(routes.FALLBACK.params().path.slug).toBe('abc');
    });
  });

  describe('when a value is read again', () => {
    it('throws, naming the URL, if the codec rejects a value it accepted while matching', async () => {
      let strict = false;
      const { ITEM, appRouter, router } = setup({
        serialize: (value) => value,
        deserialize: (raw) => (strict && raw === 'old' ? null : raw),
      });
      await router.navigateByUrl('/items/old');
      expect(ITEM.params().path.id).toBe('old');

      // A codec should give the same answer every time. This one doesn't, so a fresh read fails.
      strict = true;

      expect(() => appRouter.paramsSnapshot(ITEM, router.routerState.snapshot.root)).toThrow(
        "ITEM: can't read path parameter 'id' from '/items/old' for route 'items/:id'",
      );
    });
  });
});
