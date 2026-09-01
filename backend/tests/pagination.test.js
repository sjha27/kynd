'use strict';

const { parsePaginationParams } = require('../src/lib/pagination');

describe('parsePaginationParams', () => {
  it('defaults when no params are given', () => {
    expect(parsePaginationParams({})).toEqual({ limit: 20, offset: 0 });
  });

  it('passes through in-range values', () => {
    expect(parsePaginationParams({ limit: '10', offset: '40' })).toEqual({
      limit: 10,
      offset: 40,
    });
  });

  it('clamps limit above the maximum', () => {
    expect(parsePaginationParams({ limit: '500' }).limit).toBe(50);
  });

  it('clamps a zero or negative limit up to the minimum', () => {
    expect(parsePaginationParams({ limit: '0' }).limit).toBe(1);
    expect(parsePaginationParams({ limit: '-5' }).limit).toBe(1);
  });

  it('clamps a negative offset up to zero', () => {
    expect(parsePaginationParams({ offset: '-20' }).offset).toBe(0);
  });

  it('falls back to defaults for non-numeric input', () => {
    expect(parsePaginationParams({ limit: 'abc', offset: 'xyz' })).toEqual({
      limit: 20,
      offset: 0,
    });
  });

  it('truncates decimal input to an integer', () => {
    expect(parsePaginationParams({ limit: '10.9', offset: '5.9' })).toEqual({
      limit: 10,
      offset: 5,
    });
  });
});
