import * as THREE from 'three';
import { STLLoader }    from 'three/addons/loaders/STLLoader.js';
import { OBJLoader }    from 'three/addons/loaders/OBJLoader.js';
import { GLTFLoader }   from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

let scene, camera, renderer, controls, currentObject;

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

  (function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  })();
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
  fitCameraToObject(object);
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
