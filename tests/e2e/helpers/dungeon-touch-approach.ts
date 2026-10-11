/** Scale the real analog stick, so delayed CDP acknowledgements cannot turn a
 * tiny correction into another full-speed crossing of the waypoint. */
export const dungeonApproachDeflection = (axisDistance: number) =>
  42 * Math.min(1, Math.abs(axisDistance) / 6);

/** The existing maximum hold includes time already spent awaiting touchMove. */
export const dungeonApproachWait = (elapsedMs: number) => Math.max(0, 250 - elapsedMs);
