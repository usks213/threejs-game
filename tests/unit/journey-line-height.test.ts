import { describe, expect, it } from 'vitest';
import { singleLineHeightMatches } from '../helpers/journey-line-height';

describe('journey single-line geometry', () => {
 it.each([14, 14.296875, 14.3])('accepts a complete 14.3px line measured as %spx', height => {
  // Compact journey title: 11px font-size * 1.3 line-height.
  expect(singleLineHeightMatches(height, 14.3)).toBe(true);
 });

 it.each([10, 14])('keeps the original precision for an integer %spx line', lineHeight => {
  expect(singleLineHeightMatches(lineHeight, lineHeight)).toBe(true);
  expect(singleLineHeightMatches(lineHeight - 0.04, lineHeight)).toBe(true);
  expect(singleLineHeightMatches(lineHeight + 0.04, lineHeight)).toBe(true);
  expect(singleLineHeightMatches(lineHeight - 0.06, lineHeight)).toBe(false);
  expect(singleLineHeightMatches(lineHeight + 0.06, lineHeight)).toBe(false);
 });

 it.each([0, 7, 13, 13.8, 13.94, 14.06, 14.36, 14.8, 21, 28, 28.6])('rejects clipped, arbitrary or multiple-line height %spx', height => {
  expect(singleLineHeightMatches(height, 14.3)).toBe(false);
 });

 it.each([NaN, Infinity, -Infinity, 0, -1])('rejects invalid line geometry %s', value => {
  expect(singleLineHeightMatches(value, 14.3)).toBe(false);
  expect(singleLineHeightMatches(14, value)).toBe(false);
 });
});
