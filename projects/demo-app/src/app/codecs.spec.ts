import { experienceCountCodec, paginationParams, prefixedIdCodec, sortCodec } from './codecs';

describe('TasteTrack route helpers', () => {
  it('round-trips exact and countless experience counts', () => {
    const codec = experienceCountCodec();
    expect(codec.deserialize('12')).toEqual({ kind: 'exact', value: 12 });
    expect(codec.deserialize('countless')).toEqual({ kind: 'countless' });
    expect(codec.deserialize('-1')).toBeNull();
    expect(codec.serialize({ kind: 'countless' })).toBe('countless');
  });

  it('keeps sorting atomic and constrained to declared fields', () => {
    const codec = sortCodec(['title', 'rating'] as const);
    expect(codec.deserialize('rating:desc')).toEqual({ field: 'rating', direction: 'desc' });
    expect(codec.deserialize('date:desc')).toBeNull();
    expect(codec.deserialize('title:sideways')).toBeNull();
  });

  it('writes IDs to the URL without their prefix', () => {
    const codec = prefixedIdCodec('tv');
    expect(codec.serialize('tv_wirefern')).toBe('wirefern');
    expect(codec.deserialize('wirefern')).toBe('tv_wirefern');
    expect(codec.serialize('mov_wirefern' as never)).toBeNull();
    expect(codec.deserialize('Brambleworth Manor')).toBeNull();
  });

  it('composes exact page and page-size definitions', () => {
    const params = paginationParams({ pageSizes: [12, 24, 48] });
    expect(params.page.codec.deserialize('2')).toBe(2);
    expect(params.pageSize.codec.deserialize('24')).toBe(24);
    expect(params.pageSize.codec.deserialize('25')).toBeNull();
  });
});
