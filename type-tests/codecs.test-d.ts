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
