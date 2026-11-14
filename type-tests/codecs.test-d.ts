import {
  booleanCodec,
  enumCodec,
  listCodec,
  numberCodec,
  queryParam,
  stringCodec,
  type UrlParamCodec,
} from 'ngx-urlik';
import { describe, expectTypeOf, it } from 'vitest';

describe('built-in codecs', () => {
  it('read and write their value type, with null for "can\'t convert"', () => {
    expectTypeOf(stringCodec()).toEqualTypeOf<UrlParamCodec<string>>();
    expectTypeOf(numberCodec()).toEqualTypeOf<UrlParamCodec<number>>();
    expectTypeOf(booleanCodec()).toEqualTypeOf<UrlParamCodec<boolean>>();
    expectTypeOf(numberCodec().deserialize('1')).toEqualTypeOf<number | null>();
    expectTypeOf(numberCodec().serialize(1)).toEqualTypeOf<string | null>();
  });

  it('enumCodec reads the values of a tuple, a string enum, or a string record', () => {
    enum Status {
      Open = 'open',
      Closed = 'closed',
    }
    expectTypeOf(enumCodec(['first', 'second'] as const)).toEqualTypeOf<
      UrlParamCodec<'first' | 'second'>
    >();
    expectTypeOf(enumCodec(Status).deserialize('open')).toEqualTypeOf<Status | null>();
    expectTypeOf(enumCodec({ a: 'x', b: 'y' } as const)).toEqualTypeOf<UrlParamCodec<'x' | 'y'>>();
  });

  it('enumCodec reads numeric and mixed enums as the enum type', () => {
    enum Status {
      Active,
      Archived,
    }
    enum Limit {
      None = 0,
      Auto = 'auto',
    }
    expectTypeOf(enumCodec(Status).deserialize('0')).toEqualTypeOf<Status | null>();
    expectTypeOf(enumCodec(Limit).deserialize('0')).toEqualTypeOf<Limit | null>();
    // @ts-expect-error 2 isn't a member
    enumCodec(Status).serialize(2);
    // @ts-expect-error a member's name isn't its value
    enumCodec(Status).serialize('Active');
  });

  it('enumCodec reads arrays of numbers and strings', () => {
    expectTypeOf(enumCodec([10, 50, 'all'] as const)).toEqualTypeOf<
      UrlParamCodec<10 | 50 | 'all'>
    >();
    // @ts-expect-error booleans have booleanCodec()
    enumCodec([true, 'friends']);
    // @ts-expect-error null can't be a value
    enumCodec([null]);
  });

  it('listCodec holds a readonly array of the item type', () => {
    expectTypeOf(listCodec(numberCodec(), ',')).toEqualTypeOf<UrlParamCodec<readonly number[]>>();
    // @ts-expect-error a list of numbers can't write strings
    listCodec(numberCodec(), ',').serialize(['a']);
  });
});

describe('queryParam()', () => {
  it('records whether the field is required and whether it has a default', () => {
    expectTypeOf(queryParam({ codec: numberCodec() }).required).toEqualTypeOf<false>();
    expectTypeOf(
      queryParam({ codec: numberCodec(), required: true }).required,
    ).toEqualTypeOf<true>();
  });

  it("takes a default of the codec's type, as a plain value", () => {
    // @ts-expect-error the codec reads numbers
    queryParam({ codec: numberCodec(), defaultValue: '1' });
    // @ts-expect-error a default is a plain value, not a function
    queryParam({ codec: stringCodec(), defaultValue: () => 'en' });
  });

  it("rejects a codec whose values include null, because null means can't convert", () => {
    const nullable = {} as UrlParamCodec<string | null>;
    // @ts-expect-error a value type can't include null
    queryParam({ codec: nullable });
  });
});
