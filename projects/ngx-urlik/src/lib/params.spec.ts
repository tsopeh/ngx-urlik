import {
  booleanCodec,
  enumCodec,
  listCodec,
  numberCodec,
  queryParam,
  repeatedQueryParam,
  stringCodec,
} from './params';

describe('parameter codecs and definitions', () => {
  it('creates pure reusable scalar codecs', () => {
    expect(stringCodec().deserialize('')).toBe('');
    expect(booleanCodec().deserialize('true')).toBe(true);
    expect(booleanCodec().deserialize('TRUE')).toBeNull();
    expect(stringCodec().serialize(42 as never)).toBeNull();
  });

  it.each([
    ['0', 0],
    ['-1.25', -1.25],
    ['1e3', 1000],
    ['Infinity', Infinity],
    ['-Infinity', -Infinity],
  ])('parses the complete numeric value %s', (raw, expected) => {
    expect(numberCodec().deserialize(raw)).toBe(expected);
  });

  it.each(['', ' ', '12px', 'NaN', '--1'])('rejects malformed numeric input %j', (raw) => {
    expect(numberCodec().deserialize(raw)).toBeNull();
  });

  it('rejects NaN serialization while retaining infinities', () => {
    expect(numberCodec().serialize(Number.NaN)).toBeNull();
    expect(numberCodec().serialize(Infinity)).toBe('Infinity');
    expect(numberCodec().serialize(-Infinity)).toBe('-Infinity');
  });

  it('accepts only declared string enum values', () => {
    const codec = enumCodec({ Open: 'open', Closed: 'closed' } as const);
    expect(codec.deserialize('open')).toBe('open');
    expect(codec.deserialize('Open')).toBeNull();
    expect(codec.serialize('closed')).toBe('closed');
    expect(() => enumCodec({ String: 'ok', Numeric: 1 } as never)).toThrow(
      'enum codec values must all be strings',
    );

    const arrayCodec = enumCodec(['open', 'closed'] as const);
    expect(arrayCodec.deserialize('open')).toBe('open');
    expect(arrayCodec.deserialize('Open')).toBeNull();
    expect(arrayCodec.serialize('closed')).toBe('closed');
    expect(arrayCodec.serialize('other' as never)).toBeNull();
    expect(() => enumCodec(['ok', 1] as never)).toThrow('enum codec values must all be strings');
  });

  it('keeps query defaults and collection representation outside codecs', () => {
    const codec = stringCodec();
    expect(queryParam({ codec, required: true, defaultValue: 'all' })).toMatchObject({
      kind: 'query',
      mode: 'scalar',
      required: true,
      defaultValue: 'all',
    });
    expect(repeatedQueryParam({ codec })).toMatchObject({ mode: 'repeated', required: false });
  });

  it('joins list items with a separator', () => {
    const codec = listCodec(numberCodec(), ',');
    expect(codec.serialize([1, 2])).toBe('1,2');
    expect(codec.serialize([])).toBe('');
    expect(codec.deserialize('1,2')).toEqual([1, 2]);
    expect(codec.deserialize('')).toEqual([]);
    expect(codec.deserialize('1,x')).toBeNull();
    expect(codec.deserialize('1,,2')).toBeNull();

    const text = listCodec(stringCodec(), '|');
    expect(text.serialize(['a,b', 'c'])).toBe('a,b|c');
    expect(text.serialize(['a|b'])).toBeNull();
    expect(text.serialize([''])).toBeNull();
    expect(() => listCodec(stringCodec(), '')).toThrow('list codec separator');
  });
});
