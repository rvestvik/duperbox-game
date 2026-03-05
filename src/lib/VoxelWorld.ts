import * as THREE from 'three';
import { COLORS, ROUGHNESS, MAX_INSTANCES } from './constants';

export class VoxelWorld {
  instanceMeshes: THREE.InstancedMesh[];
  waterMesh: THREE.InstancedMesh;
  voxelData = new Map<string, { colorIdx: number; instanceIdx: number }>();
  instanceKeys: string[][] = COLORS.map(() => []);

  private _count = 0;
  private tmpMatrix = new THREE.Matrix4();
  private renderer: THREE.WebGLRenderer;

  get count() { return this._count; }

  key(gx: number, gy: number, gz: number) { return `${gx},${gy},${gz}`; }

  constructor(
    scene: THREE.Scene,
    renderer: THREE.WebGLRenderer,
    boxGeo: THREE.BoxGeometry,
    edgeTex: THREE.CanvasTexture,
  ) {
    this.renderer = renderer;

    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x1a6fa8, transparent: true, opacity: 0.55,
      roughness: 0.05, metalness: 0.15, depthWrite: false,
    });
    this.waterMesh = new THREE.InstancedMesh(boxGeo, waterMat, 500_000);
    this.waterMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.waterMesh.count = 0;
    this.waterMesh.castShadow = false;
    this.waterMesh.receiveShadow = false;
    this.waterMesh.frustumCulled = false;
    scene.add(this.waterMesh);

    this.instanceMeshes = COLORS.map((color, i) => {
      const mat = new THREE.MeshStandardMaterial({
        color, map: edgeTex, roughness: ROUGHNESS[i], metalness: 0.0,
      });
      const mesh = new THREE.InstancedMesh(boxGeo, mat, MAX_INSTANCES);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      scene.add(mesh);
      return mesh;
    });
  }

  addVoxel(gx: number, gy: number, gz: number, colorIdx: number): boolean {
    const k = this.key(gx, gy, gz);
    if (this.voxelData.has(k)) return false;
    const mesh = this.instanceMeshes[colorIdx];
    const instanceIdx = mesh.count;
    this.tmpMatrix.setPosition(gx, gy + 0.5, gz);
    mesh.setMatrixAt(instanceIdx, this.tmpMatrix);
    mesh.count++;
    mesh.instanceMatrix.needsUpdate = true;
    this.renderer.shadowMap.needsUpdate = true;
    this.voxelData.set(k, { colorIdx, instanceIdx });
    this.instanceKeys[colorIdx][instanceIdx] = k;
    this._count++;
    return true;
  }

  removeVoxel(colorIdx: number, instanceIdx: number): boolean {
    const mesh = this.instanceMeshes[colorIdx];
    const keys = this.instanceKeys[colorIdx];
    const k = keys[instanceIdx];
    if (!k) return false;
    const lastIdx = mesh.count - 1;
    if (instanceIdx !== lastIdx) {
      mesh.getMatrixAt(lastIdx, this.tmpMatrix);
      mesh.setMatrixAt(instanceIdx, this.tmpMatrix);
      mesh.instanceMatrix.needsUpdate = true;
      const lastKey = keys[lastIdx];
      keys[instanceIdx] = lastKey;
      this.voxelData.set(lastKey, { colorIdx, instanceIdx });
    }
    keys.splice(lastIdx, 1);
    mesh.count--;
    mesh.instanceMatrix.needsUpdate = true;
    this.renderer.shadowMap.needsUpdate = true;
    this.voxelData.delete(k);
    this._count--;
    return true;
  }

  clearAllVoxels() {
    this.instanceMeshes.forEach((mesh, ci) => {
      mesh.count = 0;
      mesh.instanceMatrix.needsUpdate = true;
      this.instanceKeys[ci].length = 0;
    });
    this.waterMesh.count = 0;
    this.waterMesh.instanceMatrix.needsUpdate = true;
    this.voxelData.clear();
    this._count = 0;
  }

  placeBulk(gx: number, gy: number, gz: number, colorIdx: number) {
    const k = this.key(gx, gy, gz);
    if (this.voxelData.has(k)) return;
    const mesh = this.instanceMeshes[colorIdx];
    const instanceIdx = mesh.count;
    this.tmpMatrix.setPosition(gx, gy + 0.5, gz);
    mesh.setMatrixAt(instanceIdx, this.tmpMatrix);
    mesh.count++;
    this.voxelData.set(k, { colorIdx, instanceIdx });
    this.instanceKeys[colorIdx][instanceIdx] = k;
    this._count++;
  }

  flushUpdates() {
    this.instanceMeshes.forEach(m => { m.instanceMatrix.needsUpdate = true; });
    this.renderer.shadowMap.needsUpdate = true;
  }
}
