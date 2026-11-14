import type { UrlTree } from '@angular/router';
import { describe, expectTypeOf, it } from 'vitest';
import { appRouter } from './fixtures';

const { HOME, MEMBER, TEAMS } = appRouter.routes;
const memberPath = { teamId: 1, memberId: 2, showId: 'abc' };

describe('createUrlTree()', () => {
  it('returns a UrlTree, never null', () => {
    expectTypeOf(HOME.createUrlTree()).toEqualTypeOf<UrlTree>();
    expectTypeOf(
      MEMBER.createUrlTree({ path: memberPath, query: { page: 1 } }),
    ).toEqualTypeOf<UrlTree>();
  });

  it("needs every placeholder, the parents' too, with its codec's type", () => {
    TEAMS.createUrlTree({ path: { teamId: 1 } });
    // @ts-expect-error `teamId` comes from the parent and is required
    MEMBER.createUrlTree({ path: { memberId: 2, showId: 'abc' }, query: { page: 1 } });
    // @ts-expect-error `teamId` uses numberCodec()
    MEMBER.createUrlTree({ path: { ...memberPath, teamId: '1' }, query: { page: 1 } });
    // @ts-expect-error a route with placeholders needs its values
    TEAMS.createUrlTree();
  });

  it('makes query fields optional, unless they are required', () => {
    MEMBER.createUrlTree({ path: memberPath, query: { page: 1, locale: 'de' } });
    MEMBER.createUrlTree({ path: memberPath, query: { page: null } });
    // @ts-expect-error `page` is required: true
    MEMBER.createUrlTree({ path: memberPath });
  });

  it('accepts only declared query fields, with their types', () => {
    // @ts-expect-error `sort` isn't declared on this route
    MEMBER.createUrlTree({ path: memberPath, query: { page: 1, sort: 'name' } });
    // @ts-expect-error `tags` holds strings
    MEMBER.createUrlTree({ path: memberPath, query: { page: 1, tags: [1] } });
  });

  it('takes a fragment as a string or null', () => {
    HOME.createUrlTree({ fragment: 'top' });
    HOME.createUrlTree({ fragment: null });
    // @ts-expect-error a fragment is text
    HOME.createUrlTree({ fragment: 1 });
  });
});

describe('navigate()', () => {
  it("takes the link values first and Angular's navigation options second", () => {
    expectTypeOf(HOME.navigate({}, { replaceUrl: true })).toEqualTypeOf<Promise<boolean>>();
    expectTypeOf(HOME.navigate(undefined, { state: { from: 'menu' } })).toEqualTypeOf<
      Promise<boolean>
    >();
    // @ts-expect-error options go second; `replaceUrl` isn't a link value
    HOME.navigate({ replaceUrl: true });
  });

  it('leaves out browserUrl, which could show an address the typed route did not build', () => {
    // @ts-expect-error browserUrl isn't a typed navigation option
    HOME.navigate({}, { browserUrl: '/elsewhere' });
  });
});
