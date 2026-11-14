import { booleanCodec, enumCodec, listCodec, numberCodec, queryParam, stringCodec } from './params';

describe('parameter codecs and definitions', () => {
  it('booleanCodec reads and writes exactly true and false', () => {
    expect(booleanCodec().serialize(true)).toBe('true');
    expect(booleanCodec().serialize(false)).toBe('false');
    expect(booleanCodec().serialize('true' as never)).toBeNull();
    expect(booleanCodec().deserialize('false')).toBe(false);
    expect(booleanCodec().deserialize('1')).toBeNull();
  });

  it('numberCodec writes only numbers', () => {
    expect(numberCodec().serialize(-1.5)).toBe('-1.5');
    expect(numberCodec().serialize('4' as never)).toBeNull();
  });

  it('listCodec writes only arrays', () => {
    expect(listCodec(stringCodec(), ',').serialize('a,b' as never)).toBeNull();
    expect(listCodec(stringCodec(), ',').serialize([])).toBe('');
  });

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
      'enumCodec(): every value must be a string. Use a string enum or an array of strings.',
    );

    const arrayCodec = enumCodec(['open', 'closed'] as const);
    expect(arrayCodec.deserialize('open')).toBe('open');
    expect(arrayCodec.deserialize('Open')).toBeNull();
    expect(arrayCodec.serialize('closed')).toBe('closed');
    expect(arrayCodec.serialize('other' as never)).toBeNull();
    expect(() => enumCodec(['ok', 1] as never)).toThrow('every value must be a string');
  });

  it('keeps query defaults outside codecs', () => {
    const codec = stringCodec();
    expect(queryParam({ codec, required: true, defaultValue: 'all' })).toMatchObject({
      kind: 'query',
      required: true,
      defaultValue: 'all',
    });
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
    expect(text.serialize([''])).toBeNull();
    expect(() => listCodec(stringCodec(), '')).toThrow("the separator can't be empty");
    expect(() => listCodec(stringCodec(), '\\')).toThrow("the separator can't be empty");
  });

  it('escapes the separator and backslashes inside items', () => {
    const codec = listCodec(stringCodec(), ',');
    const values = ['red, green', 'blue', 'a\\b', '\\,', ','];
    expect(codec.serialize(['red, green', 'blue'])).toBe('red\\, green,blue');
    expect(codec.serialize(['a\\b'])).toBe('a\\\\b');
    expect(codec.deserialize(codec.serialize(values)!)).toEqual(values);

    const words = listCodec(stringCodec(), ' or ');
    expect(words.serialize(['this or that', 'other'])).toBe('this\\ or that or other');
    expect(words.deserialize('this\\ or that or other')).toEqual(['this or that', 'other']);

    // A backslash that escapes nothing, or ends the text, isn't one this codec wrote.
    expect(codec.deserialize('a\\b')).toBeNull();
    expect(codec.deserialize('a\\')).toBeNull();

    const nested = listCodec(listCodec(stringCodec(), ','), ';');
    const grid = [['a,b', 'c'], ['d']];
    expect(nested.deserialize(nested.serialize(grid)!)).toEqual(grid);
  });
});
