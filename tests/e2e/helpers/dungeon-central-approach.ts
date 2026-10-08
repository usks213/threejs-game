/** Both ordinary door controls remain within 2.2m even with .24m settling error.
 * Opposite lateral offsets make each untouched central guard prefer one player.
 * The players stage behind closed doors before either starts the engagement. */
export const CENTRAL_APPROACH = [
  {enemy: 'e0', door: 'door-south', point: {x: -1.4, z: 6.1}},
  {enemy: 'e1', door: 'door-north', point: {x: 1.4, z: -6.1}},
] as const;
