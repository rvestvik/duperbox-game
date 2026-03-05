import * as THREE from 'three';
import { WATER_LEVEL } from './constants';
import { fbm, hash2 } from './noise';
import type { VoxelWorld } from './VoxelWorld';

export function terrainColor(gy: number, surfaceY: number): number {
  if (gy === surfaceY) {
    if (surfaceY >= 30) return 7; // snow cap
    if (surfaceY >= 22) return 5; // bare rocky peak
    return 3;                     // grass
  }
  if (surfaceY >= 30) return 7;        // snowy mountain: white all the way down
  if (surfaceY >= 22) return 5;        // rocky peak: stone all the way down
  if (gy >= surfaceY - 3) return 1;    // lowland: dirt layer under grass
  return 5;                            // stone below
}

function placeTree(gx: number, surfaceY: number, gz: number, world: VoxelWorld) {
  const trunkH = 4 + Math.floor(hash2(gx * 3.1, gz * 7.3) * 2);

  for (let y = surfaceY + 1; y <= surfaceY + trunkH; y++) {
    world.placeBulk(gx, y, gz, 0);
  }

  const top = surfaceY + trunkH;
  const layers: Array<{ dy: number; r: number; trim: boolean }> = [
    { dy: -1, r: 1, trim: false },
    { dy:  0, r: 2, trim: true  },
    { dy:  1, r: 2, trim: true  },
    { dy:  2, r: 1, trim: false },
  ];
  for (const { dy, r, trim } of layers) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (trim && Math.abs(dx) === r && Math.abs(dz) === r) continue;
        world.placeBulk(gx + dx, top + dy, gz + dz, 2);
      }
    }
  }
}

export function generateLandscape(
  world: VoxelWorld,
): { frustumSize: number; orbitTarget: THREE.Vector3 } {
  world.clearAllVoxels();

  const seed = Math.random() * 100;
  const SIZE = 400;
  const HALF = SIZE / 2;

  // Pass 1: compute surface heights
  const heights = new Int32Array(SIZE * SIZE);
  for (let gx = -HALF; gx < HALF; gx++) {
    for (let gz = -HALF; gz < HALF; gz++) {
      const n = fbm(gx * 0.018 + seed, gz * 0.018 + seed);
      let height: number;
      if (n < 0.25) {
        height = 1 + Math.floor((n / 0.25) * 2);
      } else if (n < 0.50) {
        height = 4 + Math.floor(((n - 0.25) / 0.25) * 3);
      } else {
        height = 7 + Math.floor(Math.pow((n - 0.50) / 0.50, 1.5) * 73);
      }
      // Island mask: smooth fade starting at 70% radius
      const ddx = gx / HALF, ddz = gz / HALF;
      const dist = Math.sqrt(ddx * ddx + ddz * ddz);
      const mask = Math.max(0, 1 - Math.max(0, dist - 0.70) / 0.25);
      height = Math.max(1, Math.round(height * mask + 1 * (1 - mask)));
      heights[(gx + HALF) * SIZE + (gz + HALF)] = height;
    }
  }

  const h = (gx: number, gz: number) =>
    gx < -HALF || gx >= HALF || gz < -HALF || gz >= HALF
      ? 0
      : heights[(gx + HALF) * SIZE + (gz + HALF)];

  // Pass 2: place terrain voxels (surface-culled)
  const treeSites: Array<[number, number, number]> = [];
  for (let gx = -HALF; gx < HALF; gx++) {
    for (let gz = -HALF; gz < HALF; gz++) {
      const surfaceY = h(gx, gz);
      const hN = h(gx, gz - 1), hS = h(gx, gz + 1);
      const hE = h(gx + 1, gz), hW = h(gx - 1, gz);
      for (let gy = 0; gy <= surfaceY; gy++) {
        if (gy === surfaceY || gy > hN || gy > hS || gy > hE || gy > hW) {
          world.placeBulk(gx, gy, gz, terrainColor(gy, surfaceY));
        }
      }
      const isGrass = surfaceY >= WATER_LEVEL && surfaceY < 28;
      const notEdge = Math.abs(gx) < HALF - 3 && Math.abs(gz) < HALF - 3;
      if (isGrass && notEdge && hash2(gx * 1.7 + seed, gz * 2.3 + seed) < 0.0016) {
        treeSites.push([gx, surfaceY, gz]);
      }
    }
  }
  for (const [gx, sy, gz] of treeSites) placeTree(gx, sy, gz, world);

  // Pass 3: water
  const waterMatrix = new THREE.Matrix4();
  for (let gx = -HALF; gx < HALF; gx++) {
    for (let gz = -HALF; gz < HALF; gz++) {
      const surfaceY = h(gx, gz);
      if (surfaceY < WATER_LEVEL) {
        for (let wy = surfaceY + 1; wy <= WATER_LEVEL; wy++) {
          waterMatrix.setPosition(gx, wy + 0.5, gz);
          world.waterMesh.setMatrixAt(world.waterMesh.count++, waterMatrix);
        }
      }
    }
  }
  world.waterMesh.instanceMatrix.needsUpdate = true;
  world.flushUpdates();

  return { frustumSize: 120, orbitTarget: new THREE.Vector3(0, 5, 0) };
}
