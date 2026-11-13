/**
 * A travessia entre regiões, em quatro tempos.
 *
 * Toda troca de região do EDENWORLD passa por aqui — a primeira carga
 * ao abrir o jogo, a viagem por portal, a volta para casa. Não há um
 * caminho "de boot" e outro "de viagem": era essa divisão que fazia
 * uma cidade voltar diferente de como tinha ficado, porque metade da
 * religação só existia num dos dois.
 *
 * Os quatro tempos são sempre os mesmos e sempre nesta ordem:
 *
 * - **A, salvar** — o estado da região que sai é gravado antes de
 *   qualquer coisa ser destruída. Quem não salva primeiro perde.
 * - **B, descarregar** — cenário, física e população da região antiga
 *   somem por inteiro. Sobrar um pedaço é vazamento.
 * - **C, carregar** — a região nova é montada e *todos* os sistemas são
 *   religados a ela.
 * - **D, validar** — antes de devolver o controle ao jogador, confere
 *   que o resultado é jogável. Só depois a tela abre.
 *
 * O módulo é puro de propósito: nada de Three.js, nada de DOM. Quem
 * sabe desenhar passa as funções; aqui mora só a ordem e a conferência.
 */

import { type KeepOutZone, insideKeepOut, keepOutsFor } from './KeepOut';

export type TransitionStage = 'salvar' | 'descarregar' | 'carregar' | 'validar';

/** Relata o andamento da montagem para a tela de carregamento. */
export type TransitionProgress = (fraction: number, label: string) => void | Promise<void>;

export interface RegionValidation {
  ok: boolean;
  /** Descrições legíveis do que está errado. Vazio quando `ok`. */
  problems: readonly string[];
}

export const VALID: RegionValidation = Object.freeze({ ok: true, problems: Object.freeze([]) as readonly string[] });

export function validation(problems: readonly string[]): RegionValidation {
  return { ok: problems.length === 0, problems };
}

export interface RegionTransitionSteps {
  /** A — guarda o estado da região que está saindo. */
  save: () => void | Promise<void>;
  /** B — desmonta tudo que pertence à região antiga. */
  unload: () => void | Promise<void>;
  /** C — monta a região nova e religa os sistemas a ela. */
  load: (progress: TransitionProgress) => void | Promise<void>;
  /** D — confere a integridade antes de devolver o controle. */
  validate: () => RegionValidation | Promise<RegionValidation>;
}

export interface RegionTransitionOptions {
  /** Chamado ao entrar em cada tempo, para registro e telemetria. */
  onStage?: (stage: TransitionStage) => void;
  /** Progresso da montagem (tempo C). */
  onProgress?: TransitionProgress;
}

export interface RegionTransitionResult {
  /** Tempos que chegaram a rodar, na ordem. */
  stages: readonly TransitionStage[];
  validation: RegionValidation;
}

/**
 * Roda a travessia inteira e devolve o laudo.
 *
 * Não engole erro: se um tempo falhar, a exceção sobe — quem chamou
 * precisa saber que o mundo ficou pela metade, em vez de devolver o
 * controle para um cenário quebrado.
 */
export async function runRegionTransition(
  steps: RegionTransitionSteps,
  options: RegionTransitionOptions = {},
): Promise<RegionTransitionResult> {
  const stages: TransitionStage[] = [];
  const enter = (stage: TransitionStage): void => {
    stages.push(stage);
    options.onStage?.(stage);
  };

  enter('salvar');
  await steps.save();

  enter('descarregar');
  await steps.unload();

  enter('carregar');
  await steps.load(options.onProgress ?? (() => {}));

  enter('validar');
  const result = await steps.validate();

  return { stages, validation: result };
}

/* ------------------------------------------------------------------ */
/* Conferência de integridade                                          */
/* ------------------------------------------------------------------ */

/** Um personagem posicionado, do jeito que a conferência precisa ver. */
export interface PlacedCharacter {
  id: string;
  x: number;
  y: number;
  z: number;
  /** `false` para quem está escondido nesta região (não é conferido). */
  active?: boolean;
}

export interface RegionIntegrityInput {
  regionId: string;
  characters: readonly PlacedCharacter[];
  /** Altura do chão firme num ponto — a mesma que a população usa. */
  groundAt: (x: number, z: number) => number;
  /** Raio jogável da região; 0 desliga a conferência de limite. */
  boundaryRadius: number;
  /**
   * Áreas proibidas da região.
   *
   * Omitido, a conferência as busca sozinha pelo `regionId` — assim
   * nenhum chamador precisa lembrar de passá-las, e esquecer não
   * desliga a verificação sem ninguém notar.
   */
  keepOuts?: readonly KeepOutZone[];
}

/** Dois personagens mais perto do que isto estão em cima um do outro. */
export const MIN_CHARACTER_SEPARATION = 1.1;
/** Tolerância vertical entre o personagem e o chão sob ele. */
export const GROUND_TOLERANCE = 0.35;

/**
 * Confere que a região montada está jogável.
 *
 * As perguntas são as que o jogador faz sem saber que está fazendo:
 * *os personagens estão cada um no seu lugar?*, *estão pisando no
 * chão?*, *estão dentro do mundo?* e *estão fora do que é para ficar
 * fora?*. Qualquer "não" aqui é um bug que o jogador veria —
 * personagem enterrado, flutuando, duplicado, fora do mapa ou dentro
 * de uma estrutura em que ninguém entra.
 */
export function checkRegionIntegrity(input: RegionIntegrityInput): RegionValidation {
  const problems: string[] = [];
  const active = input.characters.filter((character) => character.active !== false);
  const forbidden = input.keepOuts ?? keepOutsFor(input.regionId);

  const seen = new Set<string>();
  for (const character of active) {
    if (seen.has(character.id)) problems.push(`${character.id} aparece duas vezes em ${input.regionId}.`);
    seen.add(character.id);
  }

  for (let i = 0; i < active.length; i += 1) {
    for (let j = i + 1; j < active.length; j += 1) {
      const a = active[i];
      const b = active[j];
      const distance = Math.hypot(a.x - b.x, a.z - b.z);
      if (distance < MIN_CHARACTER_SEPARATION) {
        problems.push(`${a.id} e ${b.id} estão no mesmo ponto (${distance.toFixed(2)} m).`);
      }
    }
  }

  for (const character of active) {
    if (!Number.isFinite(character.x) || !Number.isFinite(character.y) || !Number.isFinite(character.z)) {
      problems.push(`${character.id} tem posição inválida.`);
      continue;
    }
    const ground = input.groundAt(character.x, character.z);
    if (Number.isFinite(ground) && Math.abs(character.y - ground) > GROUND_TOLERANCE) {
      const how = character.y < ground ? 'enterrado' : 'flutuando';
      problems.push(`${character.id} está ${how} (y ${character.y.toFixed(2)}, chão ${ground.toFixed(2)}).`);
    }
    if (input.boundaryRadius > 0 && Math.hypot(character.x, character.z) > input.boundaryRadius) {
      problems.push(`${character.id} está fora do limite de ${input.regionId}.`);
    }
    // Área proibida: é aqui que uma viagem que recolocasse alguém
    // dentro do Coração do Roseiral é reprovada, em vez de chegar ao
    // jogador como uma deusa plantada dentro do vidro.
    const zone = insideKeepOut(forbidden, character.x, character.z);
    if (zone) {
      problems.push(`${character.id} está dentro de ${zone.name}, que é área proibida.`);
    }
  }

  return validation(problems);
}
