import { describe, expectTypeOf, it } from 'vitest';
import { appRouter } from './fixtures';

const { MEMBER } = appRouter.routes;

describe('patchQuery()', () => {
  it("takes any of the fields the route reads, its parents' included", () => {
    expectTypeOf(MEMBER.patchQuery({ page: 2, locale: 'de' })).toEqualTypeOf<Promise<boolean>>();
    MEMBER.patchQuery({ tags: [] });
    MEMBER.patchQuery({ labels: null });
  });

  it('needs no required field, because it merges into the URL', () => {
    MEMBER.patchQuery({ locale: 'de' });
  });

  it('accepts only declared fields, with their types', () => {
    // @ts-expect-error `sort` isn't declared on this route
    MEMBER.patchQuery({ sort: 'name' });
    // @ts-expect-error `page` is a number
    MEMBER.patchQuery({ page: '2' });
    // @ts-expect-error path values aren't part of a query patch
    MEMBER.patchQuery({ teamId: 1 });
  });

  it('takes the same navigation options as navigate(), except browserUrl', () => {
    MEMBER.patchQuery(
      { page: 2 },
      { replaceUrl: true, skipLocationChange: true, state: { from: 'sidebar' }, info: 1 },
    );
    // @ts-expect-error browserUrl could show an address the typed route didn't build
    MEMBER.patchQuery({ page: 2 }, { browserUrl: '/elsewhere' });
  });
});
