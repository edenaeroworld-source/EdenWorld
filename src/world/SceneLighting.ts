/**
 * Auditoria da iluminação da cena.
 *
 * A cena do jogo vive a sessão inteira; as regiões vão e vêm por baixo
 * dela. Toda vez que isso é esquecido, alguma coisa fica para trás —
 * e a conta sempre aparece como luz.
 *
 * Já aconteceu duas vezes, por motivos diferentes:
 *
 *  1. O relógio reiniciava a cada chegada, e com ele a intensidade do
 *     ambiente (corrigido no Marco L, com `resetSceneAtmosphere`).
 *  2. O sol e a luz hemisférica da região anterior **continuavam na
 *     cena**. `dispose()` no Three.js libera memória de GPU; não tira
 *     o objeto do grafo. Uma viagem dobrava a luz, duas triplicavam.
 *
 * O remendo das duas vezes foi pontual. Este módulo é a pergunta
 * genérica, feita de fora: *o que, exatamente, esta cena está
 * carregando agora?* Com ela dá para afirmar três coisas que antes
 * eram olhadas a olho nu:
 *
 *  - uma região montada tem **uma** iluminação, não duas;
 *  - uma região descartada não deixa **nada** aceso;
 *  - os números visuais de uma região são **os mesmos** antes e
 *    depois de uma viagem de ida e volta.
 *
 * É a mesma ideia de `checkRegionIntegrity`, aplicada à luz em vez de
 * à posição dos personagens: uma conferência que roda na etapa de
 * validação da viagem, para que um vazamento futuro apareça como erro
 * no console em vez de como uma cidade lavada de branco.
 */

import * as THREE from 'three';

/** Nome do sol direcional criado por `Lighting`. */
export const SUN_LIGHT_NAME = 'SunLight';
/** Nome da luz hemisférica criada por `Lighting`. */
export const AMBIENT_LIGHT_NAME = 'AmbientLight';
/** Nome do grupo de céu criado por `Environment`. */
export const SKY_GROUP_NAME = 'Sky';
/** Nome do grupo de nuvens criado por `Environment`. */
export const CLOUD_GROUP_NAME = 'Clouds';

/**
 * Retrato dos parâmetros visuais que a cena carrega agora.
 *
 * Tudo aqui é número ou contagem de propósito: é o que permite
 * comparar uma região com ela mesma depois de dez viagens e dizer se
 * algo mudou, sem depender de alguém olhar a tela.
 */
export interface SceneLightingReport {
  /** Quantos sóis direcionais há na cena. Mais de um é vazamento. */
  suns: number;
  /** Quantas luzes hemisféricas de região há na cena. */
  ambients: number;
  /** Luzes que não vieram da iluminação de região (interiores, cenário). */
  others: number;
  /** Quantas cúpulas de céu há na cena. */
  skies: number;
  /** Quantos grupos de nuvens há na cena. */
  clouds: number;
  /**
   * Soma das intensidades de todas as luzes da cena.
   *
   * É a medida direta do sintoma: com o vazamento, este número
   * **dobrava** a cada viagem.
   */
  totalIntensity: number;
  /** Intensidade do mapa de ambiente aplicada à cena. */
  environmentIntensity: number;
  /** A cena tem mapa de reflexo? */
  hasEnvironmentMap: boolean;
  /** A cena tem névoa? */
  hasFog: boolean;
  /** Cor da névoa em hexadecimal, ou `null` sem névoa. */
  fogColor: number | null;
  fogNear: number | null;
  fogFar: number | null;
}

/** Lê os parâmetros visuais da cena, sem alterar nada. */
export function readSceneLighting(scene: THREE.Scene): SceneLightingReport {
  let suns = 0;
  let ambients = 0;
  let others = 0;
  let skies = 0;
  let clouds = 0;
  let totalIntensity = 0;

  scene.traverse((object) => {
    if (object.name === SKY_GROUP_NAME) skies += 1;
    if (object.name === CLOUD_GROUP_NAME) clouds += 1;
    const light = object as THREE.Light;
    if (!light.isLight) return;
    totalIntensity += light.intensity;
    if (object.name === SUN_LIGHT_NAME) suns += 1;
    else if (object.name === AMBIENT_LIGHT_NAME) ambients += 1;
    else others += 1;
  });

  const fog = scene.fog instanceof THREE.Fog ? scene.fog : null;
  return {
    suns,
    ambients,
    others,
    skies,
    clouds,
    totalIntensity,
    environmentIntensity: scene.environmentIntensity,
    hasEnvironmentMap: scene.environment !== null,
    hasFog: scene.fog !== null,
    fogColor: fog ? fog.color.getHex() : null,
    fogNear: fog ? fog.near : null,
    fogFar: fog ? fog.far : null,
  };
}

/** Resultado de uma conferência de iluminação. */
export interface LightingAudit {
  ok: boolean;
  problems: string[];
  report: SceneLightingReport;
}

/**
 * Confere que a cena carrega **uma** iluminação de região.
 *
 * Roda na etapa de validação da viagem. Duas luzes do mesmo papel
 * significam que a região anterior não foi embora inteira, e o
 * jogador veria isso como brilho a mais — que é exatamente a forma
 * como este bug sempre se apresentou.
 */
export function checkLightingIsolation(scene: THREE.Scene): LightingAudit {
  const report = readSceneLighting(scene);
  const problems: string[] = [];

  if (report.suns !== 1) {
    problems.push(`a cena tem ${report.suns} sóis (deveria ter 1): iluminação de outra região ficou para trás.`);
  }
  if (report.ambients !== 1) {
    problems.push(`a cena tem ${report.ambients} luzes de ambiente (deveria ter 1).`);
  }
  if (report.skies !== 1) {
    problems.push(`a cena tem ${report.skies} céus (deveria ter 1).`);
  }
  if (report.clouds !== 1) {
    problems.push(`a cena tem ${report.clouds} grupos de nuvens (deveria ter 1).`);
  }

  return { ok: problems.length === 0, problems, report };
}

/**
 * Confere que uma cena de onde o mundo foi descartado não ficou acesa.
 *
 * O contrato do outro lado da viagem: depois de `World.dispose()` não
 * pode sobrar luz, céu, névoa nem mapa de reflexo. O que sobrar aqui
 * é o que vai somar na próxima região.
 */
export function checkSceneCleared(scene: THREE.Scene): LightingAudit {
  const report = readSceneLighting(scene);
  const problems: string[] = [];

  if (report.suns > 0) problems.push(`sobraram ${report.suns} sóis na cena descartada.`);
  if (report.ambients > 0) problems.push(`sobraram ${report.ambients} luzes de ambiente na cena descartada.`);
  if (report.skies > 0) problems.push(`sobraram ${report.skies} céus na cena descartada.`);
  if (report.clouds > 0) problems.push(`sobraram ${report.clouds} grupos de nuvens na cena descartada.`);
  if (report.hasFog) problems.push('a névoa da região anterior continua na cena.');
  if (report.hasEnvironmentMap) problems.push('o mapa de reflexo da região anterior continua na cena.');
  if (report.environmentIntensity !== 1) {
    problems.push(`a intensidade de ambiente ficou em ${report.environmentIntensity} (deveria voltar a 1).`);
  }

  return { ok: problems.length === 0, problems, report };
}
