import * as THREE from 'three';
import { STLLoader }    from 'three/addons/loaders/STLLoader.js';
import { OBJLoader }    from 'three/addons/loaders/OBJLoader.js';
import { GLTFLoader }   from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

let scene, camera, renderer, controls, currentObject;
let lastStats = null;

// ── Measurement tool ────────────────────────────────────────────────────
const raycaster = new THREE.Raycaster();
let measureActive = false;
let measureGroup = null;
let pendingPoints = [];
let measureMarkerRadius = 1;
let onMeasureChange = null;
let pointerDownPos = null;

export function initViewer(canvas) {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff);

  camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.001, 100000);
  camera.position.set(0, 0, 5);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(devicePixelRatio);
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;

  // Lighting — ambient + two directional lights for good shading
  scene.add(new THREE.AmbientLight(0xffffff, 0.65));

  const key = new THREE.DirectionalLight(0xffffff, 0.85);
  key.position.set(3, 5, 3);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xc8d8e8, 0.35);
  fill.position.set(-3, -2, -2);
  scene.add(fill);

  // Subtle grid on the floor
  const grid = new THREE.GridHelper(1000, 200, 0xdddddd, 0xeeeeee);
  scene.add(grid);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping   = true;
  controls.dampingFactor   = 0.06;
  controls.screenSpacePanning = true;

  window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  renderer.domElement.addEventListener('pointerdown', (e) => {
    pointerDownPos = { x: e.clientX, y: e.clientY };
  });
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!measureActive || !pointerDownPos) return;
    const dx = e.clientX - pointerDownPos.x;
    const dy = e.clientY - pointerDownPos.y;
    if (Math.hypot(dx, dy) < 5) handleMeasureClick(e.clientX, e.clientY);
  });

  (function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  })();
}

function handleMeasureClick(clientX, clientY) {
  if (!currentObject) return;

  const rect = renderer.domElement.getBoundingClientRect();
  const ndc = new THREE.Vector2(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1
  );

  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObject(currentObject, true);
  if (!hits.length) return;

  const point = hits[0].point;

  if (pendingPoints.length === 0) {
    clearMeasurement();
    addMeasureMarker(point);
    pendingPoints.push(point);
  } else {
    addMeasureMarker(point);
    addMeasureLine(pendingPoints[0], point);
    const distance = pendingPoints[0].distanceTo(point);
    pendingPoints = [];
    if (onMeasureChange) onMeasureChange(distance);
  }
}

function addMeasureMarker(point) {
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(measureMarkerRadius, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xff5722, depthTest: false })
  );
  marker.position.copy(point);
  marker.renderOrder = 999;
  measureGroup.add(marker);
}

function addMeasureLine(a, b) {
  const geometry = new THREE.BufferGeometry().setFromPoints([a, b]);
  const material = new THREE.LineBasicMaterial({ color: 0xff5722, depthTest: false });
  const line = new THREE.Line(geometry, material);
  line.renderOrder = 999;
  measureGroup.add(line);
}

function clearMeasurement() {
  if (measureGroup) {
    measureGroup.clear();
  }
  pendingPoints = [];
}

export function setMeasureMode(active, onChange) {
  measureActive = active;
  onMeasureChange = onChange || null;

  if (active && !measureGroup) {
    measureGroup = new THREE.Group();
    scene.add(measureGroup);
  }
  if (active && currentObject) {
    const box = new THREE.Box3().setFromObject(currentObject);
    const maxDim = Math.max(...box.getSize(new THREE.Vector3()).toArray());
    measureMarkerRadius = maxDim * 0.008;
  }
  if (!active) clearMeasurement();
}

export function loadArrayBuffer(buffer, filename) {
  return new Promise((resolve, reject) => {
    const ext = filename.split('.').pop().toLowerCase();

    if (currentObject) {
      scene.remove(currentObject);
      currentObject = null;
    }

    switch (ext) {
      case 'stl': {
        const geometry = new STLLoader().parse(buffer);
        geometry.computeVertexNormals();
        const mesh = new THREE.Mesh(
          geometry,
          new THREE.MeshPhongMaterial({ color: 0x9e9e9e, specular: 0x333333, shininess: 40 })
        );
        // STL convention is Z-up; Three.js is Y-up.
        mesh.rotation.x = -Math.PI / 2;
        placeInScene(mesh);
        resolve();
        break;
      }

      case 'obj': {
        const text   = new TextDecoder().decode(buffer);
        const object = new OBJLoader().parse(text);
        object.traverse(child => {
          if (child.isMesh)
            child.material = new THREE.MeshPhongMaterial({ color: 0x9e9e9e });
        });
        placeInScene(object);
        resolve();
        break;
      }

      case 'glb':
      case 'gltf': {
        new GLTFLoader().parse(buffer, '', (gltf) => {
          placeInScene(gltf.scene);
          resolve();
        }, reject);
        break;
      }

      default:
        reject(new Error(`Unsupported file format: .${ext}  (supported: STL, OBJ, GLB, GLTF)`));
    }
  });
}

function placeInScene(object) {
  scene.add(object);
  currentObject = object;
  lastStats = computeStats(object);
  clearMeasurement();
  fitCameraToObject(object);
}

function computeStats(object) {
  const box  = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());

  let triangles = 0;
  let vertices  = 0;
  let meshes    = 0;

  object.traverse(child => {
    if (!child.isMesh) return;
    meshes++;
    const geometry = child.geometry;
    const posAttr  = geometry.getAttribute('position');
    if (!posAttr) return;
    vertices += posAttr.count;
    triangles += geometry.index ? geometry.index.count / 3 : posAttr.count / 3;
  });

  return {
    dimensions: { x: size.x, y: size.y, z: size.z },
    triangles: Math.round(triangles),
    vertices,
    meshes,
  };
}

export function getModelStats() {
  return lastStats;
}

function fitCameraToObject(object) {
  const box    = new THREE.Box3().setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  const size   = box.getSize(new THREE.Vector3());

  // Move object so its center sits at origin
  object.position.sub(center);

  const maxDim = Math.max(size.x, size.y, size.z);
  const fovRad = camera.fov * (Math.PI / 180);
  const dist   = (maxDim / (2 * Math.tan(fovRad / 2))) * 1.5;

  camera.near = dist * 0.001;
  camera.far  = dist * 100;
  camera.updateProjectionMatrix();
  camera.position.set(dist * 0.8, dist * 0.55, dist * 0.8);

  controls.target.set(0, 0, 0);
  controls.update();
}
