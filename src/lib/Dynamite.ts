import * as THREE from 'three';
import type { VoxelWorld } from './VoxelWorld';

const FUSE_TIME     = 3.0;
const BLAST_RADIUS  = 5;
const PARTICLE_COUNT = 55;
const PARTICLE_LIFE  = 1.4; // seconds

interface Charge {
  gx: number; gy: number; gz: number;
  fuse: number;
  group: THREE.Group;
  body: THREE.Mesh;
}

interface Particle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
}

const PARTICLE_COLORS = [0xff6600, 0xff3300, 0xffaa00, 0xcccccc, 0x9a6a42, 0xbcb0a4, 0x555555];

export class DynamiteManager {
  private charges: Charge[]   = [];
  private particles: Particle[] = [];
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  place(gx: number, gy: number, gz: number) {
    // Don't stack two charges on the same cell
    if (this.charges.some(c => c.gx === gx && c.gy === gy && c.gz === gz)) return;

    const group = new THREE.Group();
    group.position.set(gx, gy + 0.5, gz);

    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xcc2200, roughness: 0.85, emissive: 0x330000,
    });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.88, 0.82), bodyMat);
    body.receiveShadow = true;
    group.add(body);

    // Fuse
    const fuse = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.28, 0.08),
      new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 1 }),
    );
    fuse.position.y = 0.58;
    group.add(fuse);

    this.scene.add(group);
    this.charges.push({ gx, gy, gz, fuse: FUSE_TIME, group, body });
  }

  // Returns true if at least one explosion happened (so caller can sync voxel count)
  update(dt: number, world: VoxelWorld): boolean {
    let exploded = false;

    for (const charge of this.charges) {
      charge.fuse -= dt;

      // Blink faster as fuse runs low
      const freq = 2 + (1 - Math.max(0, charge.fuse) / FUSE_TIME) * 10;
      const blink = Math.sin(Date.now() * 0.001 * freq * Math.PI * 2) > 0;
      const mat = charge.body.material as THREE.MeshStandardMaterial;
      mat.emissive.setHex(blink ? 0xff2200 : 0x330000);
    }

    // Collect exploding charges before mutating array
    const toExplode = this.charges.filter(c => c.fuse <= 0);
    for (const charge of toExplode) {
      this.explode(charge, world);
      this.charges.splice(this.charges.indexOf(charge), 1);
      exploded = true;
    }

    // Animate particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        (p.mesh.material as THREE.Material).dispose();
        this.particles.splice(i, 1);
        continue;
      }
      p.vel.y -= 12 * dt; // gravity
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.x += dt * 4;
      p.mesh.rotation.z += dt * 2.5;
      (p.mesh.material as THREE.MeshStandardMaterial).opacity = p.life / p.maxLife;
    }

    return exploded;
  }

  private explode(charge: Charge, world: VoxelWorld) {
    const { gx, gy, gz } = charge;

    // Remove from scene
    this.scene.remove(charge.group);
    charge.group.traverse(obj => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        (obj.material as THREE.Material).dispose();
      }
    });

    // Remove voxels in blast sphere — look up by key each iteration so
    // shifting instanceIdx values (from swap-remove) don't cause stale reads.
    for (let dx = -BLAST_RADIUS; dx <= BLAST_RADIUS; dx++) {
      for (let dy = -BLAST_RADIUS; dy <= BLAST_RADIUS; dy++) {
        for (let dz = -BLAST_RADIUS; dz <= BLAST_RADIUS; dz++) {
          if (dx*dx + dy*dy + dz*dz > BLAST_RADIUS * BLAST_RADIUS) continue;
          const k    = world.key(gx + dx, gy + dy, gz + dz);
          const data = world.voxelData.get(k);
          if (data) world.removeVoxel(data.colorIdx, data.instanceIdx);
        }
      }
    }

    // Spawn particles
    const origin = new THREE.Vector3(gx, gy + 0.5, gz);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const s = 0.12 + Math.random() * 0.28;
      const color = PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)];
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(s, s, s),
        new THREE.MeshStandardMaterial({ color, roughness: 0.8, transparent: true, opacity: 1 }),
      );
      mesh.position.copy(origin);

      const speed = 5 + Math.random() * 9;
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.random() * Math.PI; // full sphere
      const vel = new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta) * speed,
        Math.abs(Math.cos(phi)) * speed + 2 + Math.random() * 3, // bias upward
        Math.sin(phi) * Math.sin(theta) * speed,
      );

      this.scene.add(mesh);
      const life = PARTICLE_LIFE * (0.6 + Math.random() * 0.8);
      this.particles.push({ mesh, vel, life, maxLife: life });
    }
  }

  dispose() {
    for (const c of this.charges) {
      this.scene.remove(c.group);
      c.group.traverse(obj => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          (obj.material as THREE.Material).dispose();
        }
      });
    }
    for (const p of this.particles) {
      this.scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      (p.mesh.material as THREE.Material).dispose();
    }
    this.charges   = [];
    this.particles = [];
  }
}
