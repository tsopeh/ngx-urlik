import { booleanQueryParam, enumQueryParam, numberQueryParam, stringQueryParam } from './params';

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
});
