'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

const COLORS = [
  0xc0392b, // 0 — deep red       (paint)
  0x7a5230, // 1 — rich dirt brown (terrain dirt)
  0xd4ac0d, // 2 — golden yellow  (paint)
  0x4a7c3f, // 3 — muted forest green (terrain grass)
  0x2471a3, // 4 — deep ocean blue (paint)
  0x9e9080, // 5 — warm stone      (terrain stone)
  0x5a5048, // 6 — dark warm stone (terrain deep)
  0xedf1f7, // 7 — cool snow white (terrain snow)
];

// Per-color PBR roughness (matches material feel of each color)
const ROUGHNESS = [
  0.90, // 0 red
  0.97, // 1 dirt
  0.85, // 2 yellow
  0.93, // 3 grass
  0.20, // 4 blue (slightly shiny)
  0.82, // 5 stone
  0.72, // 6 deep stone
  0.90, // 7 snow
];

const CAMERA_DISTANCE = 20;
const MAX_INSTANCES = 500_000; // per color

export default function VoxelGame() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [voxelCount, setVoxelCount] = useState(0);
  const [activeColor, setActiveColor] = useState(0);

  const activeColorRef = useRef(0);
  const voxelCountRef = useRef(0);
  const generateRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // ── Renderer ──────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false;  // re-triggered manually on changes
    renderer.shadowMap.needsUpdate = true;  // initialize shadow map on first frame
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    // ── Scene ─────────────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    const SKY_COLOR = new THREE.Color(0x90b8d4);
    scene.background = SKY_COLOR;

    // ── Camera orbit state ────────────────────────────────────────────────
    let azimuth = Math.PI / 4;
    let elevation = Math.atan(1 / Math.sqrt(2));
    let frustumSize = 20;
    const orbitTarget = new THREE.Vector3(0, 0, 0);

    const aspect = () => window.innerWidth / window.innerHeight;

    const camera = new THREE.OrthographicCamera(
      (-frustumSize * aspect()) / 2,
      ( frustumSize * aspect()) / 2,
       frustumSize / 2,
      -frustumSize / 2,
      -1000,
      1000,
    );

    function updateCamera() {
      const x = CAMERA_DISTANCE * Math.cos(elevation) * Math.sin(azimuth);
      const y = CAMERA_DISTANCE * Math.sin(elevation);
      const z = CAMERA_DISTANCE * Math.cos(elevation) * Math.cos(azimuth);
      camera.position.set(orbitTarget.x + x, orbitTarget.y + y, orbitTarget.z + z);
      camera.lookAt(orbitTarget);
      const a = aspect();
      camera.left   = (-frustumSize * a) / 2;
      camera.right  = ( frustumSize * a) / 2;
      camera.top    =   frustumSize / 2;
      camera.bottom =  -frustumSize / 2;
      camera.updateProjectionMatrix();
    }

    function pan(dx: number, dy: number) {
      const speed = frustumSize / window.innerHeight;
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0);
      const up    = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1);
      orbitTarget.addScaledVector(right, -dx * speed);
      orbitTarget.addScaledVector(up,     dy * speed);
      updateCamera();
    }

    updateCamera();

    // ── Lighting ──────────────────────────────────────────────────────────
    // Sky blue from above, warm earth from below
    const hemiLight = new THREE.HemisphereLight(0x90b8d4, 0x5a3d1a, 1.4);
    scene.add(hemiLight);

    // Warm sun
    const dirLight = new THREE.DirectionalLight(0xfff4e0, 1.4);
    dirLight.position.set(120, 180, 80);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.1;
    dirLight.shadow.camera.far = 1000;
    dirLight.shadow.camera.left = -200;
    dirLight.shadow.camera.right = 200;
    dirLight.shadow.camera.top = 200;
    dirLight.shadow.camera.bottom = -200;
    dirLight.shadow.bias = -0.0003;
    scene.add(dirLight);

    // ── Ground plane ──────────────────────────────────────────────────────
    const groundGeo = new THREE.PlaneGeometry(2000, 2000);
    const groundMat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });
    const groundPlane = new THREE.Mesh(groundGeo, groundMat);
    groundPlane.rotation.x = -Math.PI / 2;
    scene.add(groundPlane);

    // ── Shared geometry ───────────────────────────────────────────────────
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);

    // ── Ghost voxel ───────────────────────────────────────────────────────
    const ghostMat = new THREE.MeshStandardMaterial({ color: 0x00ff88, opacity: 0.4, transparent: true, roughness: 0.8, metalness: 0 });
    const ghost = new THREE.Mesh(boxGeo, ghostMat);
    ghost.visible = false;
    scene.add(ghost);

    // ── InstancedMesh per color ───────────────────────────────────────────
    const instanceMeshes = COLORS.map((color, i) => {
      const mat = new THREE.MeshStandardMaterial({ color, roughness: ROUGHNESS[i], metalness: 0.0 });
      const mesh = new THREE.InstancedMesh(boxGeo, mat, MAX_INSTANCES);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      return mesh;
    });

    // ── Voxel data ────────────────────────────────────────────────────────
    // key → { colorIdx, instanceIdx }
    const voxelData = new Map<string, { colorIdx: number; instanceIdx: number }>();
    // instanceKeys[colorIdx][instanceIdx] = key
    const instanceKeys: string[][] = COLORS.map(() => []);

    const key = (gx: number, gy: number, gz: number) => `${gx},${gy},${gz}`;
    const tmpMatrix = new THREE.Matrix4();

    function addVoxel(gx: number, gy: number, gz: number) {
      const k = key(gx, gy, gz);
      if (voxelData.has(k)) return;

      const colorIdx = activeColorRef.current;
      const mesh = instanceMeshes[colorIdx];
      const instanceIdx = mesh.count;

      tmpMatrix.setPosition(gx, gy + 0.5, gz);
      mesh.setMatrixAt(instanceIdx, tmpMatrix);
      mesh.count++;
      mesh.instanceMatrix.needsUpdate = true;
      renderer.shadowMap.needsUpdate = true;

      voxelData.set(k, { colorIdx, instanceIdx });
      instanceKeys[colorIdx][instanceIdx] = k;

      voxelCountRef.current++;
      setVoxelCount(voxelCountRef.current);
    }

    function removeVoxel(colorIdx: number, instanceIdx: number) {
      const mesh = instanceMeshes[colorIdx];
      const keys = instanceKeys[colorIdx];
      const k = keys[instanceIdx];
      if (!k) return;

      const lastIdx = mesh.count - 1;

      if (instanceIdx !== lastIdx) {
        mesh.getMatrixAt(lastIdx, tmpMatrix);
        mesh.setMatrixAt(instanceIdx, tmpMatrix);
        mesh.instanceMatrix.needsUpdate = true;

        const lastKey = keys[lastIdx];
        keys[instanceIdx] = lastKey;
        voxelData.set(lastKey, { colorIdx, instanceIdx });
      }

      keys.splice(lastIdx, 1);
      mesh.count--;
      mesh.instanceMatrix.needsUpdate = true;
      renderer.shadowMap.needsUpdate = true;
      voxelData.delete(k);

      voxelCountRef.current--;
      setVoxelCount(voxelCountRef.current);
    }

    // ── Landscape generation ──────────────────────────────────────────────
    function clearAllVoxels() {
      instanceMeshes.forEach((mesh, ci) => {
        mesh.count = 0;
        mesh.instanceMatrix.needsUpdate = true;
        instanceKeys[ci].length = 0;
      });
      voxelData.clear();
    }

    // Value noise helpers
    function hash2(x: number, y: number) {
      const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
      return n - Math.floor(n);
    }
    function smoothstep(t: number) { return t * t * (3 - 2 * t); }
    function valueNoise(x: number, y: number) {
      const ix = Math.floor(x), iy = Math.floor(y);
      const fx = smoothstep(x - ix), fy = smoothstep(y - iy);
      return (
        hash2(ix,     iy    ) * (1 - fx) * (1 - fy) +
        hash2(ix + 1, iy    ) * fx       * (1 - fy) +
        hash2(ix,     iy + 1) * (1 - fx) * fy +
        hash2(ix + 1, iy + 1) * fx       * fy
      );
    }
    function fbm(x: number, y: number) {
      // 4-octave fractional Brownian motion
      return (
        valueNoise(x,       y      ) * 0.500 +
        valueNoise(x * 2,   y * 2  ) * 0.250 +
        valueNoise(x * 4,   y * 4  ) * 0.125 +
        valueNoise(x * 8,   y * 8  ) * 0.063
      ) / 0.938; // normalise to ~0..1
    }

    // Color index by depth from surface
    // 7=snow  5=bare rock  3=grass  1=dirt  5=stone  6=deep stone
    function terrainColor(gy: number, surfaceY: number): number {
      if (gy === surfaceY) {
        if (surfaceY >= 30) return 7; // snow cap
        if (surfaceY >= 22) return 5; // bare rocky peak
        return 3;                     // grass
      }
      if (gy >= surfaceY - 3) return 1; // dirt
      if (gy >= 3)            return 5; // stone
      return 6;                         // dark deep stone
    }

    // Bulk insert without triggering React updates — caller must flush needsUpdate
    function placeBulk(gx: number, gy: number, gz: number, colorIdx: number) {
      const k = key(gx, gy, gz);
      if (voxelData.has(k)) return;
      const mesh = instanceMeshes[colorIdx];
      const instanceIdx = mesh.count;
      tmpMatrix.setPosition(gx, gy + 0.5, gz);
      mesh.setMatrixAt(instanceIdx, tmpMatrix);
      mesh.count++;
      voxelData.set(k, { colorIdx, instanceIdx });
      instanceKeys[colorIdx][instanceIdx] = k;
    }

    // 0=red(trunk)  3=green(leaves)
    function placeTree(gx: number, surfaceY: number, gz: number) {
      const trunkH = 4 + Math.floor(hash2(gx * 3.1, gz * 7.3) * 2); // 4 or 5, seeded

      // Trunk
      for (let y = surfaceY + 1; y <= surfaceY + trunkH; y++) {
        placeBulk(gx, y, gz, 0);
      }

      // Canopy — blocky Minecraft-style layers around the trunk top
      const top = surfaceY + trunkH;
      const layers: Array<{ dy: number; r: number; trim: boolean }> = [
        { dy: -1, r: 1, trim: false }, // 3×3 collar
        { dy:  0, r: 2, trim: true  }, // 5×5 minus corners
        { dy:  1, r: 2, trim: true  }, // 5×5 minus corners
        { dy:  2, r: 1, trim: false }, // 3×3 cap
      ];
      for (const { dy, r, trim } of layers) {
        for (let dx = -r; dx <= r; dx++) {
          for (let dz = -r; dz <= r; dz++) {
            if (trim && Math.abs(dx) === r && Math.abs(dz) === r) continue;
            placeBulk(gx + dx, top + dy, gz + dz, 3);
          }
        }
      }
    }

    function generateLandscape() {
      clearAllVoxels();

      const seed = Math.random() * 100;
      const SIZE = 400;
      const HALF = SIZE / 2;
      const MIN_H = 1;
      const MAX_H = 40;

      // Pass 1: compute all surface heights into a flat array
      const heights = new Int32Array(SIZE * SIZE);
      for (let gx = -HALF; gx < HALF; gx++) {
        for (let gz = -HALF; gz < HALF; gz++) {
          const n = fbm(gx * 0.035 + seed, gz * 0.035 + seed);
          heights[(gx + HALF) * SIZE + (gz + HALF)] = MIN_H + Math.floor(n * (MAX_H - MIN_H));
        }
      }
      const h = (gx: number, gz: number) =>
        gx < -HALF || gx >= HALF || gz < -HALF || gz >= HALF
          ? 0
          : heights[(gx + HALF) * SIZE + (gz + HALF)];

      // Pass 2: place only voxels with at least one exposed face (surface culling)
      const treeSites: Array<[number, number, number]> = [];

      for (let gx = -HALF; gx < HALF; gx++) {
        for (let gz = -HALF; gz < HALF; gz++) {
          const surfaceY = h(gx, gz);
          const hN = h(gx, gz - 1), hS = h(gx, gz + 1);
          const hE = h(gx + 1, gz), hW = h(gx - 1, gz);

          for (let gy = 0; gy <= surfaceY; gy++) {
            // Top face always visible; side face visible if neighbor is lower
            if (gy === surfaceY || gy > hN || gy > hS || gy > hE || gy > hW) {
              placeBulk(gx, gy, gz, terrainColor(gy, surfaceY));
            }
          }

          const isGrass = surfaceY < 28;
          const notEdge = Math.abs(gx) < HALF - 3 && Math.abs(gz) < HALF - 3;
          if (isGrass && notEdge && hash2(gx * 1.7 + seed, gz * 2.3 + seed) < 0.008) {
            treeSites.push([gx, surfaceY, gz]);
          }
        }
      }

      for (const [gx, sy, gz] of treeSites) placeTree(gx, sy, gz);

      instanceMeshes.forEach(m => { m.instanceMatrix.needsUpdate = true; });
      renderer.shadowMap.needsUpdate = true;
      const count = voxelData.size;
      voxelCountRef.current = count;
      setVoxelCount(count);

      frustumSize = 120;
      orbitTarget.set(0, 5, 0);
      updateCamera();
    }

    generateRef.current = generateLandscape;

    // ── Raycaster (DDA grid traversal — O(steps) not O(voxels)) ──────────
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    function setNDC(event: MouseEvent) {
      mouse.x =  (event.clientX / window.innerWidth)  * 2 - 1;
      mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    }

    // Returns the first voxel hit and the face normal (pointing away from it)
    function ddaRay(event: MouseEvent) {
      setNDC(event);
      raycaster.setFromCamera(mouse, camera);
      const ro = raycaster.ray.origin;
      const rd = raycaster.ray.direction;

      // If ray origin is above terrain, advance to just below MAX_H to skip empty sky.
      // If already within or below terrain range, start from the origin itself.
      const MAX_H = 42;
      const t0 = (rd.y < 0 && ro.y > MAX_H) ? (MAX_H - ro.y) / rd.y : 0;

      let ox = ro.x + t0 * rd.x;
      let oy = ro.y + t0 * rd.y;
      let oz = ro.z + t0 * rd.z;

      // Voxel (gx,gy,gz) occupies x∈[gx-0.5,gx+0.5], y∈[gy,gy+1], z∈[gz-0.5,gz+0.5]
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

      for (let i = 0; i < 256; i++) {
        if (gy >= 0 && gy <= MAX_H) {
          const k = key(gx, gy, gz);
          if (voxelData.has(k)) return { k, gx, gy, gz, nx, ny, nz };
        }
        if (gy < -1) break;

        if (tMaxX < tMaxY && tMaxX < tMaxZ) {
          gx += sx; nx = -sx; ny = 0; nz = 0; tMaxX += tDX;
        } else if (tMaxY < tMaxZ) {
          gy += sy; nx = 0; ny = -sy; nz = 0; tMaxY += tDY;
        } else {
          gz += sz; nx = 0; ny = 0; nz = -sz; tMaxZ += tDZ;
        }
      }
      return null;
    }

    function getPlacementTarget(event: MouseEvent) {
      const hit = ddaRay(event);
      if (hit) return { gx: hit.gx + hit.nx, gy: hit.gy + hit.ny, gz: hit.gz + hit.nz };

      // Fall back to ground plane (y=0) analytical intersection
      setNDC(event);
      raycaster.setFromCamera(mouse, camera);
      const ro = raycaster.ray.origin;
      const rd = raycaster.ray.direction;
      if (rd.y < 0 && ro.y > 0) {
        const t = -ro.y / rd.y;
        return { gx: Math.round(ro.x + t * rd.x), gy: 0, gz: Math.round(ro.z + t * rd.z) };
      }
      return null;
    }

    function getRemoveTarget(event: MouseEvent) {
      const hit = ddaRay(event);
      if (!hit) return null;
      const data = voxelData.get(hit.k);
      return data ?? null;
    }

    // ── Orbit drag state ──────────────────────────────────────────────────
    let dragging = false;
    let dragMeta = false;
    let dragX = 0;
    let dragY = 0;
    let dragMoved = false;

    // ── Mouse handlers ────────────────────────────────────────────────────
    function onMouseDown(event: MouseEvent) {
      if (event.button === 0) {
        dragging = true;
        dragMeta = event.metaKey;
        dragX = event.clientX;
        dragY = event.clientY;
        dragMoved = false;
      }
    }

    function onMouseMove(event: MouseEvent) {
      if (dragging && dragMeta) {
        const dx = event.clientX - dragX;
        const dy = event.clientY - dragY;
        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) dragMoved = true;
        if (dragMoved) {
          azimuth   -= dx * 0.008;
          elevation  = Math.max(0.05, Math.min(Math.PI / 2 - 0.05, elevation + dy * 0.008));
          updateCamera();
          ghost.visible = false;
        }
        dragX = event.clientX;
        dragY = event.clientY;
        return;
      }

      if (event.metaKey) { ghost.visible = false; return; }

      const target = getPlacementTarget(event);
      if (!target) { ghost.visible = false; return; }
      const { gx, gy, gz } = target;
      if (voxelData.has(key(gx, gy, gz))) { ghost.visible = false; return; }
      ghost.position.set(gx, gy + 0.5, gz);
      ghost.visible = true;
    }

    function onMouseUp(event: MouseEvent) {
      if (event.button === 0) dragging = false;
    }

    function onClick(event: MouseEvent) {
      if (event.button !== 0 || dragMoved) return;
      if (event.metaKey) {
        const target = getRemoveTarget(event);
        if (target) removeVoxel(target.colorIdx, target.instanceIdx);
        ghost.visible = false;
      } else {
        const target = getPlacementTarget(event);
        if (target) addVoxel(target.gx, target.gy, target.gz);
      }
    }

    function onContextMenu(event: MouseEvent) {
      event.preventDefault();
    }

    function onWheel(event: WheelEvent) {
      event.preventDefault();
      if (event.ctrlKey) {
        frustumSize = Math.max(4, Math.min(300, frustumSize + event.deltaY * 0.3));
        updateCamera();
      } else {
        pan(event.deltaX, event.deltaY);
      }
    }

    // ── Resize ────────────────────────────────────────────────────────────
    function onResize() {
      renderer.setSize(window.innerWidth, window.innerHeight);
      updateCamera();
    }

    window.addEventListener('mousedown',   onMouseDown);
    window.addEventListener('mousemove',   onMouseMove);
    window.addEventListener('mouseup',     onMouseUp);
    window.addEventListener('click',       onClick);
    window.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('wheel',       onWheel, { passive: false });
    window.addEventListener('resize',      onResize);

    // ── Render loop ───────────────────────────────────────────────────────
    let animId: number;
    function animate() {
      animId = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    }
    animate();

    // ── Cleanup ───────────────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('mousedown',   onMouseDown);
      window.removeEventListener('mousemove',   onMouseMove);
      window.removeEventListener('mouseup',     onMouseUp);
      window.removeEventListener('click',       onClick);
      window.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('wheel',       onWheel);
      window.removeEventListener('resize',      onResize);
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden' }}>
      <div ref={mountRef} style={{ width: '100%', height: '100%' }} />

      <div style={{
        position: 'fixed', top: 12, left: 12,
        background: 'rgba(0,0,0,0.55)', color: '#fff',
        padding: '8px 12px', borderRadius: 8, fontSize: 13, lineHeight: 1.7,
        pointerEvents: 'none', userSelect: 'none',
      }}>
        <div>Click — place voxel</div>
        <div>⌘ click — remove voxel</div>
        <div>⌘ drag — rotate</div>
        <div>Two-finger drag — pan</div>
        <div>Pinch — zoom</div>
      </div>

      <div style={{
        position: 'fixed', top: 12, right: 12,
        display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8,
      }}>
        <div style={{
          background: 'rgba(0,0,0,0.55)', color: '#fff',
          padding: '6px 12px', borderRadius: 8, fontSize: 13,
          pointerEvents: 'none', userSelect: 'none',
        }}>
          Voxels: {voxelCount}
        </div>
        <button
          onClick={() => generateRef.current?.()}
          style={{
            background: 'rgba(0,0,0,0.55)', color: '#fff',
            border: '1px solid rgba(255,255,255,0.3)',
            padding: '6px 14px', borderRadius: 8, fontSize: 13,
            cursor: 'pointer',
          }}
        >
          Generate landscape
        </button>
      </div>

      <div style={{
        position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', gap: 8,
        background: 'rgba(0,0,0,0.55)', padding: '8px 12px', borderRadius: 12,
      }}>
        {COLORS.map((color, i) => (
          <div
            key={i}
            onClick={() => { activeColorRef.current = i; setActiveColor(i); }}
            style={{
              width: 32, height: 32, borderRadius: 6, cursor: 'pointer',
              background: `#${color.toString(16).padStart(6, '0')}`,
              border: activeColor === i ? '3px solid #fff' : '3px solid transparent',
              boxSizing: 'border-box',
            }}
          />
        ))}
      </div>
    </div>
  );
}
