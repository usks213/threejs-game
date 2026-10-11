/** Match one complete CSS line, including WebKit's nearest-pixel line-box rounding. */
export function singleLineHeightMatches(height: number, lineHeight: number): boolean {
 if (!Number.isFinite(height) || !Number.isFinite(lineHeight) || height <= 0 || lineHeight <= 0) return false;
 // Keep the original 0.05px precision around either exact layout representation.
 // Do not allow an arbitrary half-pixel shortfall or apply rounding to multi-line hints.
 return Math.abs(height - lineHeight) < 0.05 || Math.abs(height - Math.round(lineHeight)) < 0.05;
}
