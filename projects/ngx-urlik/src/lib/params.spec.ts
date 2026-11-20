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

  it.each(['-0', '-0.0', '-0e5'])('numberCodec reads %j as 0, the value it writes', (raw) => {
    expect(Object.is(numberCodec().deserialize(raw), 0)).toBe(true);
    expect(numberCodec().serialize(-0)).toBe('0');
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

    const arrayCodec = enumCodec(['open', 'closed'] as const);
    expect(arrayCodec.deserialize('open')).toBe('open');
    expect(arrayCodec.deserialize('Open')).toBeNull();
    expect(arrayCodec.serialize('closed')).toBe('closed');
    expect(arrayCodec.serialize('other' as never)).toBeNull();
  });

  it('writes a numeric enum member as its number, not its name', () => {
    enum Status {
      Active,
      Archived,
    }
    const codec = enumCodec(Status);
    expect(codec.serialize(Status.Archived)).toBe('1');
    expect(codec.deserialize('0')).toBe(Status.Active);
    expect(codec.deserialize('Active')).toBeNull();
    expect(codec.deserialize('01')).toBeNull();
    expect(codec.serialize(2 as never)).toBeNull();
    expect(codec.serialize('Active' as never)).toBeNull();
  });

  it('reads a mixed enum, with numbers and strings', () => {
    enum Limit {
      None = 0,
      Auto = 'auto',
    }
    const codec = enumCodec(Limit);
    expect(codec.serialize(Limit.None)).toBe('0');
    expect(codec.serialize(Limit.Auto)).toBe('auto');
    expect(codec.deserialize('auto')).toBe(Limit.Auto);
    expect(codec.deserialize('0')).toBe(Limit.None);
    expect(codec.deserialize('None')).toBeNull();
    expect(codec.serialize('0' as never)).toBeNull();
  });

  it('keeps a record entry that only looks like a reverse mapping', () => {
    const codec = enumCodec({ one: 1, '2': 'two' } as const);
    expect(codec.deserialize('1')).toBe(1);
    expect(codec.deserialize('two')).toBe('two');
    expect(codec.deserialize('one')).toBeNull();
  });

  it('reads arrays of numbers and strings', () => {
    const limits = enumCodec([10, 50, 'all'] as const);
    expect(limits.serialize(50)).toBe('50');
    expect(limits.deserialize('all')).toBe('all');
    expect(limits.deserialize('50')).toBe(50);
    expect(limits.deserialize('20')).toBeNull();
    expect(limits.serialize('50' as never)).toBeNull();
  });

  it('throws when two values write the same text', () => {
    expect(() => enumCodec([1, '1'] as const)).toThrow(
      "enumCodec(): 1 and '1' both write as '1'. Give each value its own text.",
    );
    expect(() => enumCodec({ One: 1, Text: '1' } as const)).toThrow(
      "enumCodec(): 1 and '1' both write as '1'. Give each value its own text.",
    );
  });

  it('throws for a value that has no single text', () => {
    expect(() => enumCodec([Number.NaN])).toThrow(
      "enumCodec(): NaN can't be a value. Use strings or finite numbers.",
    );
    expect(() => enumCodec([null] as never)).toThrow("enumCodec(): null can't be a value.");
    expect(() => enumCodec([true] as never)).toThrow("enumCodec(): true can't be a value.");
    expect(() => enumCodec({ Big: 1n } as never)).toThrow("enumCodec(): 1n can't be a value.");
  });

  it('keeps query defaults outside codecs', () => {
    const codec = stringCodec();
    const definition = queryParam({ codec, required: true, defaultValue: 'all' });
    expect(definition).toStrictEqual({
      kind: 'query',
      codec,
      required: true,
      hasDefault: true,
      defaultValue: 'all',
    });
    expect(definition.codec).toBe(codec);
    expect(queryParam({ codec })).toStrictEqual({
      kind: 'query',
      codec,
      required: false,
      hasDefault: false,
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
  });

  it('takes one character as the separator, other than a backslash', () => {
    const message = 'the separator must be one character other than a backslash';
    expect(() => listCodec(stringCodec(), '')).toThrow(message);
    expect(() => listCodec(stringCodec(), '\\')).toThrow(message);
    // With '||', ['a|', 'b'] and ['a', '|b'] would both write 'a|||b'.
    expect(() => listCodec(stringCodec(), '||')).toThrow(message);
    expect(() => listCodec(stringCodec(), ' or ')).toThrow(message);
  });

  it('escapes the separator and backslashes inside items', () => {
    const codec = listCodec(stringCodec(), ',');
    const values = ['red, green', 'blue', 'a\\b', '\\,', ','];
    expect(codec.serialize(['red, green', 'blue'])).toBe('red\\, green,blue');
    expect(codec.serialize(['a\\b'])).toBe('a\\\\b');
    expect(codec.deserialize(codec.serialize(values)!)).toEqual(values);

    // A backslash that escapes nothing, or ends the text, isn't one this codec wrote.
    expect(codec.deserialize('a\\b')).toBeNull();
    expect(codec.deserialize('a\\')).toBeNull();

    const nested = listCodec(listCodec(stringCodec(), ','), ';');
    const grid = [['a,b', 'c'], ['d']];
    expect(nested.deserialize(nested.serialize(grid)!)).toEqual(grid);
  });
});
