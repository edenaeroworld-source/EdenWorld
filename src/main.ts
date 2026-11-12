import * as THREE from 'three';
import { Renderer } from './core/Renderer';
import { QualitySystem, isQualityLevel } from './systems/QualitySystem';
import { World } from './world/World';

// TEMP: protótipo de visualização do mundo
const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;display:block';
document.body.style.margin = '0';
const renderer = new Renderer({ canvas, antialias: true });
const params = new URLSearchParams(location.search);
const level = params.get('quality');
const profile = QualitySystem.preset(isQualityLevel(level) ? level : 'media');
renderer.setResolution({ pixelRatioCap: 1, resolutionScale: 1 });
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, renderer.aspect, 0.12, 1600);
camera.layers.enable(1);
renderer.onResize((w, h) => { camera.aspect = w / h; camera.updateProjectionMatrix(); });

const num = (k: string, d: number): number => Number(params.get(k) ?? d);
camera.position.set(num('x', 0), num('y', 260), num('z', 330));
camera.lookAt(num('tx', 0), num('ty', 0), num('tz', 0));
const focus = new THREE.Vector3(num('fx', num('tx', 0)), 0, num('fz', num('tz', 0)));

const world = new World(scene, renderer.three);
const t0 = performance.now();
void world.build((f, label) => console.log('progress', f, label)).then(() => {
  console.log('build ms', Math.round(performance.now() - t0), JSON.stringify(world.vegetation.stats), 'colliders', world.physics.colliderCount, 'interactables', world.city.interactables.length);
  world.applyQuality(profile);
  world.setViewport(renderer.size.width, renderer.size.height, 1, 58);
  if (params.has('h')) world.environment.clock.setHours(Number(params.get('h')));
  let elapsed = num('t', 0);
  let frames = 0;
  const frame = (): void => {
    elapsed += 1 / 60;
    world.update(1 / 60, elapsed, camera, focus, false);
    renderer.render(scene, camera);
    frames++;
    const info = renderer.three.info;
    (window as unknown as Record<string, unknown>).__frames = frames;
    (window as unknown as Record<string, unknown>).__info = { calls: info.render.calls, triangles: info.render.triangles, programs: info.programs?.length };
    requestAnimationFrame(frame);
  };
  frame();
});
