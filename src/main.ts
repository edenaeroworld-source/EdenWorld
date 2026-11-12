import * as THREE from 'three';
import { WORLD } from './core/Config';
import { Renderer } from './core/Renderer';
import { auroraHeight } from './cities/aurora-city/AuroraTerrain';
import { buildAuroraZoneMap, generateGardenBeds, paintControlMap } from './cities/aurora-city/Zones';
import { Environment } from './world/Environment';
import { HeightField } from './world/HeightField';
import { Terrain } from './world/Terrain';
import { Water } from './world/Water';

// TEMP: protótipo de visualização do terreno
const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;display:block';
document.body.style.margin = '0';
const renderer = new Renderer({ canvas, antialias: true });
renderer.setResolution({ pixelRatioCap: 1, resolutionScale: 1 });
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, renderer.aspect, 0.12, 1600);
camera.layers.enable(1);
renderer.onResize((w, h) => { camera.aspect = w / h; camera.updateProjectionMatrix(); });

const t0 = performance.now();
const field = new HeightField(WORLD.terrainSize, 320, auroraHeight);
const zones = buildAuroraZoneMap(field);
const beds = generateGardenBeds(zones, field);
const controlCanvas = document.createElement('canvas');
controlCanvas.width = controlCanvas.height = 1024;
paintControlMap(controlCanvas, WORLD.terrainSize, beds);
const controlMap = new THREE.CanvasTexture(controlCanvas);
controlMap.flipY = false;
controlMap.colorSpace = THREE.NoColorSpace;
const terrain = new Terrain({ heightField: field, controlMap });
scene.add(terrain.group);
const water = new Water({ heightField: field, waterLevel: WORLD.waterLevel });
scene.add(water.mesh);
const env = new Environment(scene, renderer.three);
env.applyQuality({ shadows: { enabled: false, mapSize: 0, distance: 50 }, cloudCount: 18, cloudDetail: 2, viewDistance: 700, envUpdateHours: 0.5 });
console.log('build ms', performance.now() - t0, 'beds', beds.length);

const params = new URLSearchParams(location.search);
const cx = Number(params.get('x') ?? 0), cy = Number(params.get('y') ?? 260), cz = Number(params.get('z') ?? 330);
const tx = Number(params.get('tx') ?? 0), ty = Number(params.get('ty') ?? 0), tz = Number(params.get('tz') ?? 0);
if (params.has('h')) env.clock.setHours(Number(params.get('h')));
camera.position.set(cx, cy, cz);
camera.lookAt(tx, ty, tz);
let elapsed = 0;
let frames = 0;
function frame() {
  elapsed += 1 / 60;
  env.update(1 / 60, elapsed, camera.position, new THREE.Vector3(0, 0, 0), false);
  water.update(elapsed, env.atmosphere, env.weather.wind.z);
  renderer.render(scene, camera);
  frames++;
  (window as unknown as { __frames: number }).__frames = frames;
  requestAnimationFrame(frame);
}
frame();
