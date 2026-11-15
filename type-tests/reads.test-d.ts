import type { Signal } from '@angular/core';
import {
  numberCodec,
  type PathParamsOf,
  queryParam,
  type QueryParamsOf,
  type RouteNode,
  type RouteQueryPatch,
  type RoutesOf,
  type ParamsOf,
  stringCodec,
  type RouteParams,
} from 'ngx-urlik';
import { describe, expectTypeOf, it } from 'vitest';
import { appRouter, definition, snapshot } from './fixtures';

const { MEMBER, TEAMS } = appRouter.routes;

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
    expectTypeOf(MEMBER.ifActive).toEqualTypeOf<Signal<typeof MEMBER | null>>();
    expectTypeOf(MEMBER.ifActive()?.params().path.memberId).toEqualTypeOf<number | undefined>();
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
    // @ts-expect-error ifActive is read-only
    MEMBER.ifActive.set(null);
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
    expectTypeOf<RouteQueryPatch<Member>>().toEqualTypeOf<Partial<Query>>();
  });

  it('name a route from the token, with no injected router', () => {
    type Routes = RoutesOf<typeof definition.AppRouter>;
    expectTypeOf<keyof Routes>().toEqualTypeOf<'MEMBER' | 'TEAMS' | 'HOME'>();
    expectTypeOf<Routes['MEMBER']>().toEqualTypeOf<Member>();
    expectTypeOf<QueryParamsOf<Routes['MEMBER']>>().toEqualTypeOf<Query>();
  });

  it('build a node or a state from plain types', () => {
    expectTypeOf<RouteParams<{ id: number }, { q: string }>>().toEqualTypeOf<
      Readonly<{ path: Readonly<{ id: number }>; query: Readonly<{ q: string }> }>
    >();
    expectTypeOf(MEMBER).toExtend<RouteNode<PathParamsOf<Member>, QueryParamsOf<Member>, 'page'>>();
  });
});
