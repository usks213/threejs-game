export const DAY_SECONDS = 720;
export type Weather = 'clear' | 'cloud' | 'rain' | 'storm' | 'snow' | 'fog' | 'magic';
export interface EnvironmentState {region?:string;regionId?:import('./adventure').AdventureRegion;temperature?:number;wind?:{x:number;z:number}; seconds: number; day: number; hour: number; daylight: number; weather: Weather }
export function environmentAt(seconds: number, tier = 1): EnvironmentState {
  const day = Math.floor(seconds / DAY_SECONDS) + 1, hour = ((seconds / DAY_SECONDS * 24 + 9) % 24 + 24) % 24;
  const daylight = Math.max(0, Math.sin((hour - 6) / 24 * Math.PI * 2));
  const weather: Weather = tier === 4 ? 'snow' : tier === 5 ? 'magic' : ['clear', 'cloud', 'rain', 'clear', 'fog', 'storm'][Math.floor(seconds / 180) % 6] as Weather;
  return { seconds, day, hour, daylight, weather };
}
