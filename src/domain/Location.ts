export const LOCATIONS = [
  'A1', 'A2', 'A3', 'B1', 'B2', 'C1', 'C2',
] as const
export type Location = typeof LOCATIONS[number]
