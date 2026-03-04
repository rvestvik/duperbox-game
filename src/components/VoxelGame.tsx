'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

const COLORS = [
  0xe74c3c, // red
  0xe67e22, // orange
  0xf1c40f, // yellow
  0x2ecc71, // green
  0x3498db, // blue
  0x9b59b6, // purple
  0x1abc9c, // teal
  0xecf0f1, // white
];

const CAMERA_DISTANCE = 20;
const MAX_INSTANCES = 100_000; // per color

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
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    // ── Scene ─────────────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);

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
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(10, 20, 10);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.1;
    dirLight.shadow.camera.far = 500;
    dirLight.shadow.camera.left = -80;
    dirLight.shadow.camera.right = 80;
    dirLight.shadow.camera.top = 80;
    dirLight.shadow.camera.bottom = -80;
    scene.add(dirLight);

    // ── Ground plane ──────────────────────────────────────────────────────
    const groundGeo = new THREE.PlaneGeometry(200, 200);
    const groundMat = new THREE.MeshLambertMaterial({ color: 0x4caf50 });
    const groundPlane = new THREE.Mesh(groundGeo, groundMat);
    groundPlane.rotation.x = -Math.PI / 2;
    groundPlane.receiveShadow = true;
    scene.add(groundPlane);

    // ── Shared geometry ───────────────────────────────────────────────────
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);

    // ── Ghost voxel ───────────────────────────────────────────────────────
    const ghostMat = new THREE.MeshPhongMaterial({ color: 0x00ff88, opacity: 0.5, transparent: true });
    const ghost = new THREE.Mesh(boxGeo, ghostMat);
    ghost.visible = false;
    scene.add(ghost);

    // ── InstancedMesh per color ───────────────────────────────────────────
    const instanceMeshes = COLORS.map(color => {
      const mat = new THREE.MeshPhongMaterial({ color });
      const mesh = new THREE.InstancedMesh(boxGeo, mat, MAX_INSTANCES);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      return mesh;
    });

    // Reverse lookup: InstancedMesh → color index
    const meshToColorIdx = new Map<THREE.InstancedMesh, number>(
      instanceMeshes.map((m, i) => [m, i])
    );

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

      // Swap the removed instance with the last one to keep the array packed
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
    // 3=green(grass) 1=orange(dirt) 6=teal(stone) 5=purple(deep)  7=white(snow)
    function terrainColor(gy: number, surfaceY: number): number {
      if (gy === surfaceY) return surfaceY >= 11 ? 7 : 3; // snow cap or grass
      if (gy >= surfaceY - 2) return 1;  // dirt
      if (gy >= 2)            return 6;  // stone
      return 5;                           // deep / bedrock
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
      const SIZE = 64;
      const HALF = SIZE / 2;
      const MIN_H = 1;
      const MAX_H = 14;

      const treeSites: Array<[number, number, number]> = [];

      for (let gx = -HALF; gx < HALF; gx++) {
        for (let gz = -HALF; gz < HALF; gz++) {
          const n = fbm(gx * 0.035 + seed, gz * 0.035 + seed);
          const surfaceY = MIN_H + Math.floor(n * (MAX_H - MIN_H));

          for (let gy = 0; gy <= surfaceY; gy++) {
            placeBulk(gx, gy, gz, terrainColor(gy, surfaceY));
          }

          // Collect grass tiles for tree placement (not on snow, not on edges)
          const isGrass = surfaceY < 11;
          const notEdge = Math.abs(gx) < HALF - 3 && Math.abs(gz) < HALF - 3;
          const treeRoll = hash2(gx * 1.7 + seed, gz * 2.3 + seed);
          if (isGrass && notEdge && treeRoll < 0.04) {
            treeSites.push([gx, surfaceY, gz]);
          }
        }
      }

      // Place trees after terrain so leaves don't get overwritten by terrain
      for (const [gx, sy, gz] of treeSites) {
        placeTree(gx, sy, gz);
      }

      instanceMeshes.forEach(m => { m.instanceMatrix.needsUpdate = true; });
      const count = voxelData.size;
      voxelCountRef.current = count;
      setVoxelCount(count);

      frustumSize = 50;
      orbitTarget.set(0, 3, 0);
      updateCamera();
    }

    generateRef.current = generateLandscape;

    // ── Raycaster ─────────────────────────────────────────────────────────
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    function setNDC(event: MouseEvent) {
      mouse.x =  (event.clientX / window.innerWidth)  * 2 - 1;
      mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    }

    function getPlacementTarget(event: MouseEvent) {
      setNDC(event);
      raycaster.setFromCamera(mouse, camera);
      // Only 9 objects to test (ground + 8 instanced meshes) regardless of voxel count
      const hits = raycaster.intersectObjects([groundPlane, ...instanceMeshes]);
      if (!hits.length) return null;
      const hit = hits[0];

      if (hit.object === groundPlane) {
        return { gx: Math.round(hit.point.x), gy: 0, gz: Math.round(hit.point.z) };
      }

      const instanceId = hit.instanceId;
      if (instanceId == null || !hit.face) return null;
      const colorIdx = meshToColorIdx.get(hit.object as THREE.InstancedMesh)!;
      const k = instanceKeys[colorIdx][instanceId];
      if (!k) return null;
      const [vx, vy, vz] = k.split(',').map(Number);
      return {
        gx: vx + Math.round(hit.face.normal.x),
        gy: vy + Math.round(hit.face.normal.y),
        gz: vz + Math.round(hit.face.normal.z),
      };
    }

    function getRemoveTarget(event: MouseEvent) {
      setNDC(event);
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(instanceMeshes);
      if (!hits.length || hits[0].instanceId == null) return null;
      const colorIdx = meshToColorIdx.get(hits[0].object as THREE.InstancedMesh)!;
      return { colorIdx, instanceIdx: hits[0].instanceId };
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
        frustumSize = Math.max(4, Math.min(80, frustumSize + event.deltaY * 0.3));
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
