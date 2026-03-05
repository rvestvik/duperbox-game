import * as THREE from 'three';
import { WATER_LEVEL } from './constants';

// A small cube-based humanoid that wanders the island.
// The group origin is at the character's feet.
// Body layout (Y from feet up):
//   legs:   hip pivot at y=0.42, hang down 0.42
//   torso:  center at y=0.65, height 0.46
//   arms:   shoulder pivot at y=0.88, hang down 0.40
//   head:   center at y=1.10, size 0.36

const WALK_SPEED = 2.5; // world units / second
const ANIM_FREQ  = 5.0; // radians / second of swing cycle
const SWING_AMP  = 0.45; // max limb rotation (radians)

function limb(w: number, h: number, d: number, mat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.position.y = -h / 2; // hang down from pivot
  g.add(mesh);
  return g;
}

export class Character {
  readonly group: THREE.Group;

  private head:  THREE.Mesh;
  private armL:  THREE.Group;
  private armR:  THREE.Group;
  private legL:  THREE.Group;
  private legR:  THREE.Group;

  private x: number;
  private z: number;
  private worldY = 0;

  private targetX: number;
  private targetZ: number;
  private walkTimer = 0;
  private animTime  = 0;

  private getHeight: (gx: number, gz: number) => number;

  constructor(
    scene: THREE.Scene,
    getHeight: (gx: number, gz: number) => number,
    startX = 0,
    startZ = 0,
  ) {
    this.getHeight = getHeight;
    this.x = startX;
    this.z = startZ;
    this.targetX = startX;
    this.targetZ = startZ;

    this.group = new THREE.Group();
    scene.add(this.group);

    const skin  = mat(0xf4c48e, 0.90);
    const shirt = mat(0xc0392b, 0.85);
    const pants = mat(0x2c3e6b, 0.88);

    // Torso
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.46, 0.22), shirt);
    torso.position.y = 0.65;
    torso.receiveShadow = true;
    this.group.add(torso);

    // Head
    this.head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), skin);
    this.head.position.y = 1.10;
    this.head.receiveShadow = true;
    this.group.add(this.head);

    // Arms — pivot at shoulder (y=0.88), x = ±(torso/2 + arm/2) = ±0.265
    this.armL = limb(0.16, 0.40, 0.16, skin);
    this.armL.position.set(-0.265, 0.88, 0);
    this.group.add(this.armL);

    this.armR = limb(0.16, 0.40, 0.16, skin);
    this.armR.position.set( 0.265, 0.88, 0);
    this.group.add(this.armR);

    // Legs — pivot at hip (y=0.42), x = ±0.10
    this.legL = limb(0.16, 0.42, 0.16, pants);
    this.legL.position.set(-0.10, 0.42, 0);
    this.group.add(this.legL);

    this.legR = limb(0.16, 0.42, 0.16, pants);
    this.legR.position.set( 0.10, 0.42, 0);
    this.group.add(this.legR);

    // Place immediately above spawn
    this.worldY = getHeight(Math.round(startX), Math.round(startZ)) + 1;
    this.group.position.set(this.x, this.worldY, this.z);
    this.pickNewTarget();
  }

  private pickNewTarget() {
    // Try random nearby land positions; fallback toward center
    for (let attempt = 0; attempt < 15; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const dist  = 15 + Math.random() * 55;
      const tx = Math.round(this.x + Math.cos(angle) * dist);
      const tz = Math.round(this.z + Math.sin(angle) * dist);
      if (this.getHeight(tx, tz) > WATER_LEVEL) {
        this.targetX = tx;
        this.targetZ = tz;
        this.walkTimer = 3 + Math.random() * 4;
        return;
      }
    }
    this.targetX = 0;
    this.targetZ = 0;
    this.walkTimer = 3;
  }

  update(dt: number) {
    const dx = this.targetX - this.x;
    const dz = this.targetZ - this.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const walking = dist > 0.3;

    if (walking) {
      const step = Math.min(WALK_SPEED * dt, dist);
      this.x += (dx / dist) * step;
      this.z += (dz / dist) * step;
      this.group.rotation.y = Math.atan2(dx, dz);
    }

    this.walkTimer -= dt;
    if (!walking || this.walkTimer <= 0) this.pickNewTarget();

    // If current cell is water, immediately reroute
    const surfaceY = this.getHeight(Math.round(this.x), Math.round(this.z));
    if (surfaceY <= WATER_LEVEL) this.pickNewTarget();

    // Smoothly follow terrain height
    const groundY = Math.max(surfaceY, WATER_LEVEL) + 1;
    this.worldY += (groundY - this.worldY) * Math.min(1, dt * 10);

    // Animate limbs
    if (walking) this.animTime += dt * ANIM_FREQ;
    const swing = walking ? Math.sin(this.animTime) * SWING_AMP : 0;
    const bob   = walking ? Math.abs(Math.sin(this.animTime)) * 0.03 : 0;

    this.armL.rotation.x =  swing;
    this.armR.rotation.x = -swing;
    this.legL.rotation.x = -swing;
    this.legR.rotation.x =  swing;

    this.head.position.y = 1.10 + bob * 0.5;
    this.group.position.set(this.x, this.worldY + bob, this.z);
  }

  dispose(scene: THREE.Scene) {
    scene.remove(this.group);
    this.group.traverse(obj => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material.dispose();
      }
    });
  }
}

function mat(color: number, roughness: number) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
}
