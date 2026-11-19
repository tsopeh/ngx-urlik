import type { Signal } from '@angular/core';
import {
  numberCodec,
  type ParamsOf,
  type PathParamsOf,
  queryParam,
  type QueryParamsOf,
  type QueryPatchOf,
  type RouteNode,
  type RoutesOf,
  stringCodec,
} from 'ngx-urlik';
import { describe, expectTypeOf, it } from 'vitest';
import { appRouter, definition, snapshot } from './fixtures';

const { HOME, MEMBER, TEAMS } = appRouter.routes;

describe('params()', () => {
  it("holds the route's path values, the parents' included, with their codecs' types", () => {
    expectTypeOf(MEMBER.params().path).toEqualTypeOf<
      Readonly<{ teamId: number; memberId: number; showId: string }>
    >();
  });

  it('reads a field with a default as T, and one without as T | null', () => {
    const { query } = MEMBER.params();
    expectTypeOf(query.locale).toEqualTypeOf<string>();
    expectTypeOf(query.page).toEqualTypeOf<number | null>();
    expectTypeOf(query.tags).toEqualTypeOf<readonly string[]>();
    expectTypeOf(query.ids).toEqualTypeOf<readonly number[]>();
    expectTypeOf(query.labels).toEqualTypeOf<readonly string[] | null>();
  });

  it('is a read-only signal', () => {
    expectTypeOf(MEMBER.params).toExtend<Signal<unknown>>();
    // @ts-expect-error params can't be set
    MEMBER.params.set(MEMBER.params());
    // @ts-expect-error values from params() are read-only
    MEMBER.params().query.page = 2;
  });
});

describe('paramsSnapshot()', () => {
  it('reads the same values as params(), once, from a snapshot', () => {
    expectTypeOf(appRouter.paramsSnapshot(MEMBER, snapshot)).toEqualTypeOf<
      ReturnType<typeof MEMBER.params>
    >();
  });

  it('takes a route from AppRouter.routes', () => {
    // @ts-expect-error a plain object isn't a route
    appRouter.paramsSnapshot({}, snapshot);
  });
});

describe('ifActive()', () => {
  it('holds the route itself, or null', () => {
    expectTypeOf(MEMBER.ifActive()).toEqualTypeOf<typeof MEMBER | null>();
    expectTypeOf(MEMBER.ifActive()?.params().path.memberId).toEqualTypeOf<number | undefined>();
  });

  it("takes any of the route's values, with their types", () => {
    expectTypeOf(
      MEMBER.ifActive({ path: { teamId: 1 }, query: { locale: 'en', page: null, tags: [] } }),
    ).toEqualTypeOf<typeof MEMBER | null>();
    // @ts-expect-error memberId is a number
    MEMBER.ifActive({ path: { memberId: '1' } });
    // @ts-expect-error the route has no such field
    MEMBER.ifActive({ query: { sort: 'name' } });
    // @ts-expect-error a fragment isn't checked
    MEMBER.ifActive({ fragment: 'top' });
  });

  it('takes no path or query parameters on a route without them', () => {
    expectTypeOf(HOME.ifActive({})).toEqualTypeOf<typeof HOME | null>();
    // @ts-expect-error HOME has no path parameters
    HOME.ifActive({ path: { typo: 1 } });
    // @ts-expect-error HOME has no query parameters
    HOME.ifActive({ query: { typo: 1 } });
  });

  it('narrows to the route after a check', () => {
    const member = MEMBER.ifActive();
    if (member) {
      expectTypeOf(member).toEqualTypeOf<typeof MEMBER>();
    }
  });

  it('reads go to the route that was checked', () => {
    // @ts-expect-error TEAMS has no memberId
    void TEAMS.ifActive()?.params().path.memberId;
    // @ts-expect-error ifActive() can be null, so read through ?. or an if
    void MEMBER.ifActive().params();
    // @ts-expect-error ifActive can't be replaced
    MEMBER.ifActive = () => null;
  });
});

describe('globalParams()', () => {
  const current = appRouter.globalParams({
    path: { workspaceId: stringCodec(), season: numberCodec() },
    query: {
      range: queryParam({ codec: stringCodec(), defaultValue: '7d' }),
      page: queryParam({ codec: numberCodec() }),
    },
  });

  it('reads path values as T | null, and query fields as on routes', () => {
    expectTypeOf(current().path).toEqualTypeOf<
      Readonly<{ workspaceId: string | null; season: number | null }>
    >();
    expectTypeOf(current().query.range).toEqualTypeOf<string>();
    expectTypeOf(current().query.page).toEqualTypeOf<number | null>();
  });

  it('has only the values you declare', () => {
    // @ts-expect-error `other` isn't declared
    void current().path.other;
    // @ts-expect-error a global path entry is the codec itself
    appRouter.globalParams({ path: { workspaceId: { codec: stringCodec() } } });
  });

  it('can declare only a path or only a query', () => {
    expectTypeOf(
      appRouter.globalParams({ query: { page: queryParam({ codec: numberCodec() }) } })().query
        .page,
    ).toEqualTypeOf<number | null>();
    expectTypeOf(
      appRouter.globalParamsSnapshot({ path: { workspaceId: stringCodec() } }, snapshot).path,
    ).toEqualTypeOf<Readonly<{ workspaceId: string | null }>>();
  });
});

describe('helper types', () => {
  type Member = typeof MEMBER;
  type Path = { teamId: number; memberId: number; showId: string };
  type Query = Readonly<{
    locale: string;
    page: number | null;
    tags: readonly string[];
    ids: readonly number[];
    labels: readonly string[] | null;
  }>;

  it('name the parts of a route', () => {
    expectTypeOf<PathParamsOf<Member>>().toEqualTypeOf<Path>();
    expectTypeOf<QueryParamsOf<Member>>().toEqualTypeOf<Query>();
    expectTypeOf<ParamsOf<Member>>().toEqualTypeOf<
      Readonly<{ path: Readonly<Path>; query: Query }>
    >();
    expectTypeOf<QueryPatchOf<Member>>().toEqualTypeOf<Partial<Query>>();
  });

  it('name a route from the token, with no injected router', () => {
    type Routes = RoutesOf<typeof definition.AppRouter>;
    expectTypeOf<keyof Routes>().toEqualTypeOf<'MEMBER' | 'TEAMS' | 'HOME'>();
    expectTypeOf<Routes['MEMBER']>().toEqualTypeOf<Member>();
    expectTypeOf<QueryParamsOf<Routes['MEMBER']>>().toEqualTypeOf<Query>();
  });

  it('build a node from plain types', () => {
    expectTypeOf(MEMBER).toExtend<RouteNode<PathParamsOf<Member>, QueryParamsOf<Member>, 'page'>>();
  });
});
