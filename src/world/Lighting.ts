import * as THREE from 'three';
import type { AtmosphereState } from './Atmosphere';

export interface ShadowSettings {
  enabled: boolean;
  mapSize: number;
  /** Meia-largura (m) da área coberta por sombras ao redor do jogador. */
  distance: number;
}

/**
 * Iluminação dinâmica: uma luz direcional (sol/lua) com sombras que
 * acompanham o jogador e uma luz hemisférica para o ambiente.
 */
export class Lighting {
  readonly sun: THREE.DirectionalLight;
  readonly ambient: THREE.HemisphereLight;
  private readonly focus = new THREE.Vector3();
  private shadowDistance = 60;
  private readonly lightOffset = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private readonly lightMatrix = new THREE.Matrix4();
  private readonly lightMatrixInverse = new THREE.Matrix4();

  constructor(scene: THREE.Scene) {
    this.sun = new THREE.DirectionalLight(0xffffff, 2.5);
    this.sun.name = 'SunLight';
    this.sun.castShadow = false;
    this.sun.shadow.bias = -0.00035;
    this.sun.shadow.normalBias = 0.045;
    scene.add(this.sun);
    scene.add(this.sun.target);

    this.ambient = new THREE.HemisphereLight(0xd2ecff, 0xa6dc9c, 1.1);
    this.ambient.name = 'AmbientLight';
    scene.add(this.ambient);
  }

  /** Aplica as opções de sombra do perfil de qualidade (em tempo real). */
  configureShadows(settings: ShadowSettings): void {
    const light = this.sun;
    this.shadowDistance = settings.distance;

    if (light.shadow.mapSize.x !== settings.mapSize && settings.mapSize > 0) {
      light.shadow.mapSize.set(settings.mapSize, settings.mapSize);
      // Força a recriação do mapa de sombras no novo tamanho.
      if (light.shadow.map) {
        light.shadow.map.dispose();
        light.shadow.map = null;
      }
    }

    const camera = light.shadow.camera;
    camera.left = -settings.distance;
    camera.right = settings.distance;
    camera.top = settings.distance;
    camera.bottom = -settings.distance;
    camera.near = 1;
    camera.far = 520;
    camera.updateProjectionMatrix();

    // Alternar castShadow altera o estado das luzes e recompila os materiais conforme necessário.
    light.castShadow = settings.enabled && settings.mapSize > 0;
  }

  /**
   * Atualiza cor, intensidade e direção das luzes e mantém o volume de
   * sombras centrado no ponto de foco (o jogador).
   */
  update(atmosphere: AtmosphereState, focus: THREE.Vector3): void {
    this.sun.color.copy(atmosphere.lightColor);
    this.sun.intensity = atmosphere.lightIntensity;
    this.ambient.color.copy(atmosphere.ambientSky);
    this.ambient.groundColor.copy(atmosphere.ambientGround);
    this.ambient.intensity = atmosphere.ambientIntensity;

    this.focus.copy(focus);
    this.lightOffset.copy(atmosphere.lightDirection).multiplyScalar(260);

    if (this.sun.castShadow) {
      // Encaixa o foco na grade de texels do mapa de sombras para evitar cintilação.
      const texel = (this.shadowDistance * 2) / this.sun.shadow.mapSize.x;
      this.lightMatrix.lookAt(this.lightOffset, this.tmp.set(0, 0, 0), THREE.Object3D.DEFAULT_UP);
      this.lightMatrixInverse.copy(this.lightMatrix).invert();
      this.tmp.copy(this.focus).applyMatrix4(this.lightMatrixInverse);
      this.tmp.x = Math.round(this.tmp.x / texel) * texel;
      this.tmp.y = Math.round(this.tmp.y / texel) * texel;
      this.tmp.applyMatrix4(this.lightMatrix);
      this.focus.copy(this.tmp);
    }

    this.sun.target.position.copy(this.focus);
    this.sun.position.copy(this.focus).add(this.lightOffset);
    this.sun.target.updateMatrixWorld();
  }

  dispose(): void {
    this.sun.shadow.map?.dispose();
    this.sun.dispose();
    this.ambient.dispose();
  }
}
