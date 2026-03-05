'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { COLORS } from '../lib/constants';
import { OrbitCamera } from '../lib/OrbitCamera';
import { VoxelWorld } from '../lib/VoxelWorld';
import { generateLandscape } from '../lib/terrain';
import { ddaRay, getPlacementTarget, getRemoveTarget } from '../lib/raycast';
import { Character } from '../lib/Character';
import { GameUI } from './GameUI';

function createEdgeTexture(): THREE.CanvasTexture {
  const SIZE = 64;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, SIZE, SIZE);
  const px = 2;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0,        SIZE, px);
  ctx.fillRect(0, SIZE - px, SIZE, px);
  ctx.fillRect(0, 0,        px,   SIZE);
  ctx.fillRect(SIZE - px, 0, px,  SIZE);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export default function VoxelGame() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [voxelCount, setVoxelCount] = useState(0);
  const [activeColor, setActiveColor] = useState(0);

  const activeColorRef = useRef(0);
  const generateRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // ── Renderer ──────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.VSMShadowMap;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    // ── Scene ─────────────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x90b8d4);

    // ── Camera ────────────────────────────────────────────────────────────
    const orbit = new OrbitCamera();
    scene.add(orbit.camera); // not required but keeps it in the graph

    // ── Lighting ──────────────────────────────────────────────────────────
    scene.add(new THREE.HemisphereLight(0x90b8d4, 0x5a3d1a, 2.4));

    const dirLight = new THREE.DirectionalLight(0xfff4e0, 0.8);
    dirLight.position.set(40, 200, 30);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(2048, 2048);
    dirLight.shadow.camera.near = 0.1;
    dirLight.shadow.camera.far = 1000;
    dirLight.shadow.camera.left = -200;
    dirLight.shadow.camera.right = 200;
    dirLight.shadow.camera.top = 200;
    dirLight.shadow.camera.bottom = -200;
    dirLight.shadow.bias = -0.0003;
    dirLight.shadow.radius = 32;
    dirLight.shadow.blurSamples = 25;
    scene.add(dirLight);

    // ── Ground plane (for raycasting empty space) ─────────────────────────
    const groundPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(2000, 2000),
      new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }),
    );
    groundPlane.rotation.x = -Math.PI / 2;
    scene.add(groundPlane);

    // ── Shared geometry + edge texture ────────────────────────────────────
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    const edgeTex = createEdgeTexture();

    // ── Voxel world ───────────────────────────────────────────────────────
    const world = new VoxelWorld(scene, renderer, boxGeo, edgeTex);

    // ── Ghost voxel ───────────────────────────────────────────────────────
    const ghost = new THREE.Mesh(
      boxGeo,
      new THREE.MeshStandardMaterial({ color: 0x00ff88, opacity: 0.4, transparent: true, roughness: 0.8 }),
    );
    ghost.visible = false;
    scene.add(ghost);

    // ── Character ─────────────────────────────────────────────────────────
    let character: Character | null = null;

    // ── Generate landscape ────────────────────────────────────────────────
    function generate() {
      const { frustumSize, orbitTarget, getHeight } = generateLandscape(world);
      orbit.frustumSize = frustumSize;
      orbit.orbitTarget.copy(orbitTarget);
      orbit.update();
      setVoxelCount(world.count);

      character?.dispose(scene);
      character = new Character(scene, getHeight);
    }
    generateRef.current = generate;

    // ── Drag / orbit state ────────────────────────────────────────────────
    let dragging = false;
    let dragX = 0, dragY = 0;
    let dragStartX = 0, dragStartY = 0;
    let dragMoved = false;
    let dragPivot: THREE.Vector3 | null = null;
    let dragPivotA = 0, dragPivotB = 0, dragPivotC = 0;

    // ── Mouse handlers ────────────────────────────────────────────────────
    function onMouseDown(event: MouseEvent) {
      if (event.button !== 0) return;
      dragging = true;
      dragX = dragStartX = event.clientX;
      dragY = dragStartY = event.clientY;
      dragMoved = false;

      const hit = ddaRay(event, orbit.camera, world);
      if (hit) {
        const H = new THREE.Vector3(hit.gx, hit.gy + 0.5, hit.gz);
        const { right, up, forward } = orbit.basis();
        const camToH = H.clone().sub(orbit.camera.position);
        dragPivot  = H;
        dragPivotA = camToH.dot(right);
        dragPivotB = camToH.dot(up);
        dragPivotC = camToH.dot(forward);
      } else {
        dragPivot = null;
      }
    }

    function onMouseMove(event: MouseEvent) {
      if (dragging) {
        const dx = event.clientX - dragX;
        const dy = event.clientY - dragY;
        if (Math.abs(event.clientX - dragStartX) > 4 || Math.abs(event.clientY - dragStartY) > 4) {
          dragMoved = true;
        }
        if (dragMoved) {
          orbit.azimuth   -= dx * 0.008;
          orbit.elevation  = Math.max(0.05, Math.min(Math.PI / 2 - 0.05, orbit.elevation + dy * 0.008));

          if (dragPivot) {
            orbit.orbitAroundPivot(dragPivot, dragPivotA, dragPivotB, dragPivotC);
          } else {
            orbit.update();
          }
          ghost.visible = false;
        }
        dragX = event.clientX;
        dragY = event.clientY;
        return;
      }

      const target = getPlacementTarget(event, orbit.camera, world, groundPlane);
      if (!target) { ghost.visible = false; return; }
      const { gx, gy, gz } = target;
      if (world.voxelData.has(world.key(gx, gy, gz))) { ghost.visible = false; return; }
      ghost.position.set(gx, gy + 0.5, gz);
      ghost.visible = true;
    }

    function onMouseUp(event: MouseEvent) {
      if (event.button === 0) { dragging = false; dragPivot = null; }
    }

    function onClick(event: MouseEvent) {
      if (event.button !== 0 || dragMoved) return;
      if (event.metaKey) {
        const target = getRemoveTarget(event, orbit.camera, world);
        if (target) {
          world.removeVoxel(target.colorIdx, target.instanceIdx);
          setVoxelCount(world.count);
          ghost.visible = false;
        }
      } else {
        const target = getPlacementTarget(event, orbit.camera, world, groundPlane);
        if (target) {
          world.addVoxel(target.gx, target.gy, target.gz, activeColorRef.current);
          setVoxelCount(world.count);
        }
      }
    }

    function onContextMenu(event: MouseEvent) {
      event.preventDefault();
    }

    function onWheel(event: WheelEvent) {
      event.preventDefault();
      if (event.ctrlKey) {
        const ndcX =  (event.clientX / window.innerWidth)  * 2 - 1;
        const ndcY = -(event.clientY / window.innerHeight) * 2 + 1;
        orbit.zoom(event.deltaY * 0.9, ndcX, ndcY);
      } else {
        orbit.pan(event.deltaX, event.deltaY);
      }
    }

    function onResize() {
      renderer.setSize(window.innerWidth, window.innerHeight);
      orbit.update();
    }

    window.addEventListener('mousedown',   onMouseDown);
    window.addEventListener('mousemove',   onMouseMove);
    window.addEventListener('mouseup',     onMouseUp);
    window.addEventListener('click',       onClick);
    window.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('wheel',       onWheel, { passive: false });
    window.addEventListener('resize',      onResize);

    // ── Render loop ───────────────────────────────────────────────────────
    const clock = new THREE.Clock();
    let animId: number;
    function animate() {
      animId = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.1); // cap dt to avoid large jumps
      character?.update(dt);
      renderer.render(scene, orbit.camera);
    }
    animate();

    // ── Cleanup ───────────────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(animId);
      character?.dispose(scene);
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
      <GameUI
        voxelCount={voxelCount}
        activeColor={activeColor}
        colors={COLORS}
        onColorSelect={(i) => { activeColorRef.current = i; setActiveColor(i); }}
        onGenerate={() => generateRef.current?.()}
      />
    </div>
  );
}
