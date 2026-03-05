import * as THREE from 'three';
import { CAMERA_DISTANCE } from './constants';

export class OrbitCamera {
  azimuth = Math.PI / 4;
  elevation = Math.atan(1 / Math.sqrt(2));
  orbitDistance = CAMERA_DISTANCE;
  frustumSize = 20;
  orbitTarget = new THREE.Vector3(0, 0, 0);
  camera: THREE.OrthographicCamera;

  private get aspect() { return window.innerWidth / window.innerHeight; }

  constructor() {
    const a = this.aspect;
    this.camera = new THREE.OrthographicCamera(
      (-this.frustumSize * a) / 2,
      ( this.frustumSize * a) / 2,
       this.frustumSize / 2,
      -this.frustumSize / 2,
      -1000, 1000,
    );
    this.update();
  }

  update() {
    const { azimuth: az, elevation: el, orbitDistance: d, orbitTarget: t } = this;
    const x = d * Math.cos(el) * Math.sin(az);
    const y = d * Math.sin(el);
    const z = d * Math.cos(el) * Math.cos(az);
    this.camera.position.set(t.x + x, t.y + y, t.z + z);
    this.camera.lookAt(t);
    const a = this.aspect;
    this.camera.left   = (-this.frustumSize * a) / 2;
    this.camera.right  = ( this.frustumSize * a) / 2;
    this.camera.top    =   this.frustumSize / 2;
    this.camera.bottom =  -this.frustumSize / 2;
    this.camera.updateProjectionMatrix();
  }

  basis() {
    const sinAz = Math.sin(this.azimuth), cosAz = Math.cos(this.azimuth);
    const sinEl = Math.sin(this.elevation), cosEl = Math.cos(this.elevation);
    return {
      right:   new THREE.Vector3(cosAz, 0, -sinAz),
      up:      new THREE.Vector3(-sinEl * sinAz, cosEl, -sinEl * cosAz),
      forward: new THREE.Vector3(-cosEl * sinAz, -sinEl, -cosEl * cosAz),
    };
  }

  pan(dx: number, dy: number) {
    const speed = this.frustumSize / window.innerHeight;
    const { right, up } = this.basis();
    this.orbitTarget.addScaledVector(right,  dx * speed);
    this.orbitTarget.addScaledVector(up,    -dy * speed);
    this.update();
  }

  zoom(delta: number, ndcX: number, ndcY: number) {
    const oldSize = this.frustumSize;
    this.frustumSize = Math.max(4, Math.min(300, this.frustumSize + delta));
    const { right, up } = this.basis();
    const shift = (oldSize - this.frustumSize) / 2;
    this.orbitTarget.addScaledVector(right, ndcX * shift * this.aspect);
    this.orbitTarget.addScaledVector(up,    ndcY * shift);
    this.update();
  }

  // Apply camera-space pivot orbit so the pivot point stays at the same screen pixel.
  // pivot: world-space pivot point. a/b/c: its right/up/forward components from drag start.
  orbitAroundPivot(pivot: THREE.Vector3, a: number, b: number, c: number) {
    const { right, up, forward } = this.basis();
    const camPos = pivot.clone()
      .addScaledVector(right,   -a)
      .addScaledVector(up,      -b)
      .addScaledVector(forward, -c);
    this.camera.position.copy(camPos);
    this.orbitTarget.copy(camPos).addScaledVector(forward, this.orbitDistance);
    this.camera.lookAt(this.orbitTarget);
    const aspect = this.aspect;
    this.camera.left   = (-this.frustumSize * aspect) / 2;
    this.camera.right  = ( this.frustumSize * aspect) / 2;
    this.camera.top    =   this.frustumSize / 2;
    this.camera.bottom =  -this.frustumSize / 2;
    this.camera.updateProjectionMatrix();
  }
}
