import {
  booleanCodec,
  delimitedQueryParam,
  enumCodec,
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
    expect(delimitedQueryParam({ codec, separator: ',' })).toMatchObject({
      mode: 'delimited',
      separator: ',',
      required: false,
    });
  });
});
