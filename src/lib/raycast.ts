import * as THREE from 'three';
import type { VoxelWorld } from './VoxelWorld';

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function setNDC(event: MouseEvent) {
  mouse.x =  (event.clientX / window.innerWidth)  * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
}

const MAX_H = 85;

export function ddaRay(
  event: MouseEvent,
  camera: THREE.Camera,
  world: VoxelWorld,
): { k: string; gx: number; gy: number; gz: number; nx: number; ny: number; nz: number } | null {
  setNDC(event);
  raycaster.setFromCamera(mouse, camera);
  const ro = raycaster.ray.origin;
  const rd = raycaster.ray.direction;

  const t0 = rd.y < 0 ? (MAX_H - ro.y) / rd.y : 0;
  let ox = ro.x + t0 * rd.x;
  let oy = ro.y + t0 * rd.y;
  let oz = ro.z + t0 * rd.z;

  let gx = Math.round(ox);
  let gy = Math.floor(oy);
  let gz = Math.round(oz);

  const sx = rd.x > 0 ? 1 : rd.x < 0 ? -1 : 0;
  const sy = rd.y > 0 ? 1 : rd.y < 0 ? -1 : 0;
  const sz = rd.z > 0 ? 1 : rd.z < 0 ? -1 : 0;

  let tMaxX = sx ? ((gx + sx * 0.5) - ox) / rd.x : Infinity;
  let tMaxY = sy ? ((gy + (sy > 0 ? 1 : 0)) - oy) / rd.y : Infinity;
  let tMaxZ = sz ? ((gz + sz * 0.5) - oz) / rd.z : Infinity;

  const tDX = sx ? 1 / Math.abs(rd.x) : Infinity;
  const tDY = sy ? 1 / Math.abs(rd.y) : Infinity;
  const tDZ = sz ? 1 / Math.abs(rd.z) : Infinity;

  let nx = 0, ny = 0, nz = 0;

  for (let i = 0; i < 512; i++) {
    if (gy >= 0 && gy <= MAX_H) {
      const k = world.key(gx, gy, gz);
      if (world.voxelData.has(k)) return { k, gx, gy, gz, nx, ny, nz };
    }
    if (gy < -1) break;

    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      gx += sx; nx = -sx; ny = 0;  nz = 0;  tMaxX += tDX;
    } else if (tMaxY < tMaxZ) {
      gy += sy; nx = 0;  ny = -sy; nz = 0;  tMaxY += tDY;
    } else {
      gz += sz; nx = 0;  ny = 0;  nz = -sz; tMaxZ += tDZ;
    }
  }
  return null;
}

export function getPlacementTarget(
  event: MouseEvent,
  camera: THREE.Camera,
  world: VoxelWorld,
  groundPlane: THREE.Mesh,
): { gx: number; gy: number; gz: number } | null {
  const hit = ddaRay(event, camera, world);
  if (hit) return { gx: hit.gx + hit.nx, gy: hit.gy + hit.ny, gz: hit.gz + hit.nz };

  setNDC(event);
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObject(groundPlane);
  if (hits.length > 0) {
    const p = hits[0].point;
    return { gx: Math.round(p.x), gy: 0, gz: Math.round(p.z) };
  }
  return null;
}

export function getRemoveTarget(
  event: MouseEvent,
  camera: THREE.Camera,
  world: VoxelWorld,
): { colorIdx: number; instanceIdx: number } | null {
  const hit = ddaRay(event, camera, world);
  if (!hit) return null;
  return world.voxelData.get(hit.k) ?? null;
}
