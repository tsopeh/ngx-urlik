import { Component } from '@angular/core';
import { defineAppRouter } from './app-router';
import { numberCodec, queryParam } from './params';

@Component({ template: '' })
class Page {}

// TypeScript rejects most of these routes first. JavaScript callers, and routes typed as Angular's
// `Routes`, reach the same checks at startup.
const define =
  (routes: unknown, names: Record<string, string> = {}) =>
  () =>
    defineAppRouter(names, { routes } as never);

describe('startup checks', () => {
  it('lists every problem in one error', () => {
    expect(
      define(
        [
          { path: 'a//b', routeName: 'A', component: Page },
          { path: 'c', routeName: 'A', component: Page },
        ],
        { A: 'A', B: 'B' },
      ),
    ).toThrow(
      [
        'defineAppRouter() found problems:',
        "- A: path has an empty segment, from a leading, trailing, or doubled '/'",
        "- routeName 'A' is used by both routes[0] and routes[1]. Give each route its own routeName.",
        "- RouteNames.B has no route. Give a route routeName: 'B', or remove the member.",
      ].join('\n'),
    );
  });

  it('needs the route names enum first, and a route array', () => {
    expect(() => defineAppRouter(null as never, { routes: [] })).toThrow(
      'pass your route names enum as the first argument',
    );
    expect(define({})).toThrow('routes must be an array');
    expect(define([{ path: 'a', routeName: 'A', children: [7] }], { A: 'A' })).toThrow(
      'routes[0].children[0] must be a route object',
    );
  });

  describe('paths of named routes and the routes above them', () => {
    it.each([
      ['/a', "path has an empty segment, from a leading, trailing, or doubled '/'"],
      ['a/', "path has an empty segment, from a leading, trailing, or doubled '/'"],
      ['items/:', "placeholder ':' needs a name without spaces or : ? # ; ( )"],
      ['items/:my id', "placeholder ':my id' needs a name without spaces or : ? # ; ( )"],
      ['items;v=1', "path segment 'items;v=1' can't contain : ? # ; ( )"],
      ['a(b)', "path segment 'a(b)' can't contain : ? # ; ( )"],
    ])('rejects %j', (path, message) => {
      expect(define([{ path, routeName: 'A', component: Page }], { A: 'A' })).toThrow(
        `A: ${message}`,
      );
    });

    it('needs the path to be a string', () => {
      expect(define([{ path: 5, routeName: 'A', component: Page }], { A: 'A' })).toThrow(
        'A: path must be a string',
      );
    });

    it('needs the primary outlet', () => {
      expect(
        define([{ path: 'side', outlet: 'aside', routeName: 'A', component: Page }], { A: 'A' }),
      ).toThrow('A: needs a plain path in the primary outlet');
    });
  });

  describe('what a named route can be', () => {
    it.each([
      ['a redirect', { path: 'old', redirectTo: '/new' }],
      ['a wildcard', { path: '**', component: Page }],
      ['a matcher', { matcher: () => null, component: Page }],
    ])("can't be %s", (_kind, route) => {
      expect(define([{ ...route, routeName: 'A' }], { A: 'A' })).toThrow(
        "A: redirects, wildcards, and matchers can't have a routeName",
      );
    });

    it("can't load its children lazily, and neither can a route above it", () => {
      const loadChildren = async () => [];
      expect(define([{ path: 'a', routeName: 'A', loadChildren }], { A: 'A' })).toThrow(
        "A: a named route can't use loadChildren",
      );
      expect(
        define(
          [{ path: 'a', loadChildren, children: [{ path: 'b', routeName: 'B', component: Page }] }],
          { B: 'B' },
        ),
      ).toThrow("routes[0]: it's above a named route, so it can't use loadChildren");
    });

    it('can sit next to unnamed routes that do all of these', () => {
      expect(
        define(
          [
            { path: 'a', routeName: 'A', component: Page },
            { path: 'old', redirectTo: '/a' },
            { matcher: () => null, component: Page },
            { path: 'lazy', loadChildren: async () => [] },
            { path: 'side', outlet: 'aside', component: Page },
            { path: '**', component: Page },
          ],
          { A: 'A' },
        ),
      ).not.toThrow();
    });
  });

  describe('pathParams and queryParams', () => {
    it('needs pathParams to map placeholder names to codecs', () => {
      expect(
        define([{ path: 'items/:id', routeName: 'A', pathParams: [numberCodec()] }], { A: 'A' }),
      ).toThrow('A: pathParams must map each placeholder name to its codec');
      expect(
        define([{ path: 'items/:id', routeName: 'A', pathParams: { id: 'number' } }], { A: 'A' }),
      ).toThrow('A: pathParams.id must be a codec');
    });

    it('needs queryParams to be an object', () => {
      expect(define([{ path: 'a', routeName: 'A', queryParams: [] }], { A: 'A' })).toThrow(
        'A: queryParams must be an object',
      );
    });

    it('checks these fields on routes with no named route below, too', () => {
      expect(define([{ path: 'items/:id', pathParams: { slug: numberCodec() } }])).toThrow(
        "routes[0]: pathParams.slug isn't a placeholder in the path",
      );
      expect(
        define([{ path: 'a', queryParams: { page: queryParam({ codec: numberCodec() }) } }]),
      ).toThrow(
        'routes[0]: no named route at or below it reads queryParams. Add a routeName, or remove queryParams.',
      );
    });

    it('needs children to be an array', () => {
      expect(define([{ path: 'a', routeName: 'A', children: {} }], { A: 'A' })).toThrow(
        'A: children must be an array',
      );
    });
  });
});
