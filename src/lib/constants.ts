export const COLORS = [
  0xc0392b, // 0 — deep red          (paint / tree trunk)
  0x9a6a42, // 1 — warm dirt brown   (terrain dirt)
  0x4ab83a, // 2 — bright leaf green (tree canopy)
  0x8b6914, // 3 — dry grass brown   (terrain grass)
  0x3a8ec0, // 4 — sky blue          (paint)
  0xbcb0a4, // 5 — light warm stone  (terrain stone)
  0x7a6e66, // 6 — mid warm stone    (terrain deep)
  0xedf1f7, // 7 — cool snow white   (terrain snow)
] as const;

export const ROUGHNESS = [
  0.90, // 0 red
  0.97, // 1 dirt
  0.90, // 2 leaf green
  0.93, // 3 grass
  0.20, // 4 blue (slightly shiny)
  0.82, // 5 stone
  0.75, // 6 deep stone
  0.90, // 7 snow
] as const;

export const CAMERA_DISTANCE = 20;
export const MAX_INSTANCES = 500_000;
export const WATER_LEVEL = 3;
