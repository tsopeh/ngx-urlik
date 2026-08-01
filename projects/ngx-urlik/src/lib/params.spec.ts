import {
  booleanPathParam,
  booleanQueryParam,
  enumPathParam,
  enumQueryParam,
  numberPathParam,
  numberQueryParam,
  stringPathParam,
  stringQueryParam,
} from './params';

describe('built-in serializers', () => {
  it('strictly parses scalar values', () => {
    expect(stringQueryParam().serializer.deserialize('')).toBe('');
    expect(numberQueryParam().serializer.deserialize('12px')).toBeNull();
    expect(numberQueryParam().serializer.deserialize('Infinity')).toBe(Infinity);
    expect(booleanQueryParam().serializer.deserialize('TRUE')).toBeNull();
  });

  it('uses and canonically omits defaults', () => {
    const definition = enumQueryParam({ All: 'all', Open: 'open' } as const, {
      defaultValue: 'all',
    });
    expect(definition.serializer.deserialize(null)).toBe('all');
    expect(definition.serializer.serialize('all')).toBeNull();
    expect(definition.serializer.serialize('open')).toBe('open');
  });

  it('distinguishes empty query strings from invalid empty path strings', () => {
    expect(stringQueryParam().serializer.deserialize('')).toBe('');
    expect(stringPathParam({ name: 'value' }).serializer.deserialize('')).toBeNull();
    expect(stringQueryParam().serializer.deserialize(null)).toBeNull();
  });

  it.each([
    ['0', 0],
    ['-1.25', -1.25],
    ['1e3', 1000],
    ['Infinity', Infinity],
    ['-Infinity', -Infinity],
  ])('parses the complete numeric value %s', (raw, expected) => {
    expect(numberPathParam({ name: 'number' }).serializer.deserialize(raw)).toBe(expected);
  });

  it.each(['', ' ', '12px', 'NaN', '--1', null, undefined, 12])(
    'rejects malformed numeric input %j',
    (raw) => {
      expect(numberQueryParam().serializer.deserialize(raw)).toBeNull();
    },
  );

  it('accepts only lowercase boolean spellings', () => {
    const query = booleanQueryParam();
    expect(query.serializer.deserialize('true')).toBe(true);
    expect(query.serializer.deserialize('false')).toBe(false);
    expect(query.serializer.deserialize('TRUE')).toBeNull();
    expect(query.serializer.deserialize('1')).toBeNull();
    expect(booleanPathParam({ name: 'flag' }).serializer.deserialize(null)).toBeNull();
  });

  it('accepts only declared string enum values', () => {
    const values = { Open: 'open', Closed: 'closed' } as const;
    expect(enumPathParam(values, { name: 'state' }).serializer.deserialize('open')).toBe('open');
    expect(enumQueryParam(values).serializer.deserialize('Open')).toBeNull();
    expect(() => enumQueryParam({ String: 'ok', Numeric: 1 } as never)).toThrow(
      /must all be strings/,
    );
  });

  it('uses a default for both missing and malformed values and reevaluates it when needed', () => {
    let current = 1;
    const definition = numberQueryParam({ defaultValue: () => current });
    expect(definition.serializer.deserialize(null)).toBe(1);
    expect(definition.serializer.deserialize('bad')).toBe(1);
    expect(definition.serializer.serialize(1)).toBeNull();
    current = 2;
    expect(definition.serializer.deserialize(null)).toBe(2);
    expect(definition.serializer.serialize(1)).toBe('1');
  });
});
