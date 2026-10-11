import { expect, it } from 'vitest';
import { AdaptiveResolution } from '../../src/rendering/resolution';

it('excludes initial compilation and gradually reduces sustained moderately slow frames', () => {
  const r = new AdaptiveResolution();
  expect(r.observe(3000)).toBe(false); expect(r.observe(3000)).toBe(false);
  expect(r.scale).toBe(1);
  for (let i = 0; i < 3; i++) r.observe(60);
  expect(r.scale).toBe(.85);
  for (let i = 0; i < 20; i++) r.observe(100);
  expect(r.scale).toBe(.55);
});

it('cuts pixel area promptly for genuinely stalled active frames, with a bounded floor', () => {
  const r = new AdaptiveResolution(); r.observe(16); r.observe(16);
  expect(r.observe(300)).toBe(true); expect(r.scale).toBe(.4);
  expect(r.observe(2400)).toBe(true); expect(r.scale).toBe(.35);
  for (let i = 0; i < 30; i++) expect(r.observe(3000)).toBe(false);
  expect(r.scale).toBe(.35);
});

it('recovers detail slowly after a transient active stall, without oscillating on occasional fast frames', () => {
  const r = new AdaptiveResolution(); r.observe(16); r.observe(16); r.observe(2400);
  for (let i = 0; i < 10; i++) { r.observe(16); r.observe(60); }
  expect(r.scale).toBe(.35);
  for (let i = 0; i < 59; i++) expect(r.observe(16)).toBe(false);
  expect(r.observe(16)).toBe(true); expect(r.scale).toBe(.4);
  for (let i = 0; i < 1000; i++) r.observe(16);
  expect(r.scale).toBe(1);
});

it('honors explicit quality and ignores invalid timings without consuming compilation exclusions', () => {
  const r = new AdaptiveResolution('high');
  for (let i = 0; i < 30; i++) expect(r.observe(1000)).toBe(false);
  expect(r.scale).toBe(1);
  r.setMode('medium'); expect(r.scale).toBe(.75);
  r.setMode('low'); expect(r.scale).toBe(.55);
  r.setMode('auto');
  for (const value of [NaN, Infinity, 0, -10]) expect(r.observe(value)).toBe(false);
  r.observe(3000); r.observe(3000); expect(r.scale).toBe(1);
});
