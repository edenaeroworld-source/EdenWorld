/**
 * Atividades do Éden.
 *
 * Chamar de "missão" é quase injusto: nada aqui é obrigatório, nada
 * tranca o mundo e nada acontece em ordem. São coisas que alguém pediu,
 * ou que o lugar sugere, e que ficam disponíveis até você querer.
 *
 * Por isso o sistema não tem "fase atual" nem "próxima missão": tem uma
 * lista de atividades, cada uma com objetivos que podem ser cumpridos
 * em qualquer ordem, de qualquer região.
 *
 * Módulo puro: sem Three.js, sem DOM.
 */

export type MissionCategory =
  | 'narrativa'
  | 'secundaria'
  | 'pessoal'
  | 'exploracao'
  | 'musica'
  | 'compras'
  | 'educacao'
  | 'carreira'
  | 'bichos'
  | 'conservacao'
  | 'casa'
  | 'sazonal';

export type ObjectiveKind =
  /** Chegar a uma região. */
  | 'visitar-regiao'
  /** Entrar num interior. */
  | 'entrar-interior'
  /** Conversar com um personagem. */
  | 'conversar'
  /** Comprar um item. */
  | 'comprar'
  /** Adotar um bicho. */
  | 'adotar'
  /** Cuidar de um bicho (qualquer necessidade). */
  | 'cuidar'
  /** Avistar uma espécie selvagem. */
  | 'avistar'
  /** Colocar um móvel numa casa. */
  | 'decorar'
  /** Ter uma casa. */
  | 'morar';

export interface Objective {
  id: string;
  kind: ObjectiveKind;
  /** Alvo: id de região, interior, personagem, item, espécie... */
  target: string;
  /** Quantas vezes. Normalmente 1. */
  count: number;
  /** Texto mostrado no diário. */
  label: string;
}

export interface Mission {
  id: string;
  title: string;
  category: MissionCategory;
  /** Quem propõe. Vazio quando o lugar é que sugere. */
  giver?: string;
  /** Região onde a atividade faz sentido. Vazio = qualquer uma. */
  regionId?: string;
  summary: string;
  objectives: readonly Objective[];
  rewards: { crystals?: number; items?: readonly string[] };
  /** Texto do diário ao concluir. */
  conclusion: string;
  /**
   * Atividades que precisam estar concluídas antes desta aparecer.
   * Usado com muita parcimônia — só quando a história não faz sentido
   * fora de ordem.
   */
  requires?: readonly string[];
}

export const MISSIONS: readonly Mission[] = Object.freeze([
  Object.freeze({
    id: 'primeiros-passos',
    title: 'O Éden é maior do que parece',
    category: 'narrativa' as MissionCategory,
    giver: 'aerion',
    summary: 'Aérion comenta que Aurora City é só o começo. Há outras regiões, e a estação leva a elas.',
    objectives: Object.freeze([
      { id: 'falar-aerion', kind: 'conversar' as ObjectiveKind, target: 'aerion', count: 1, label: 'Conversar com Aérion' },
      { id: 'ir-rosas', kind: 'visitar-regiao' as ObjectiveKind, target: 'rosas-park', count: 1, label: 'Chegar a Rosas Park' },
    ]),
    rewards: { crystals: 300 },
    conclusion: 'Rosas Park existe mesmo, e é tão calmo quanto diziam. Aurora City não é o mundo — é a porta.',
  }),
  Object.freeze({
    id: 'casa-propria',
    title: 'Um lugar para voltar',
    category: 'casa' as MissionCategory,
    summary: 'Ter um endereço no Éden muda a sensação de andar pela cidade. Qualquer imóvel serve.',
    objectives: Object.freeze([
      { id: 'ter-casa', kind: 'morar' as ObjectiveKind, target: '', count: 1, label: 'Adquirir um imóvel' },
      { id: 'por-movel', kind: 'decorar' as ObjectiveKind, target: '', count: 3, label: 'Colocar três móveis' },
    ]),
    rewards: { crystals: 200, items: Object.freeze(['luminaria-lumen']) },
    conclusion: 'A casa já tem cara de alguma coisa. Falta o resto, mas dá para voltar para cá.',
  }),
  Object.freeze({
    id: 'companhia',
    title: 'Alguém para chegar junto',
    category: 'bichos' as MissionCategory,
    giver: 'saturno',
    regionId: 'aurora-city',
    summary: 'Saturno diz que tem bicho esperando casa na EdenPawl. Ela não insiste — ela só avisa.',
    objectives: Object.freeze([
      { id: 'visitar-pawl', kind: 'entrar-interior' as ObjectiveKind, target: 'edenpawl-aurora', count: 1, label: 'Entrar na Casa EdenPawl' },
      { id: 'adotar', kind: 'adotar' as ObjectiveKind, target: '', count: 1, label: 'Adotar um bicho' },
      { id: 'cuidar', kind: 'cuidar' as ObjectiveKind, target: '', count: 3, label: 'Cuidar dele três vezes' },
    ]),
    rewards: { crystals: 250, items: Object.freeze(['racao-comum', 'bolinha']) },
    conclusion: 'Saturno não disse "eu avisei". Mas olhou de um jeito que dizia.',
  }),
  Object.freeze({
    id: 'observador',
    title: 'Observar sem pegar',
    category: 'conservacao' as MissionCategory,
    giver: 'saturno',
    summary: 'O acordo do Jardim Proibido: olhar é permitido, levar não. Saturno quer saber o que você viu.',
    objectives: Object.freeze([
      { id: 'ver-veado', kind: 'avistar' as ObjectiveKind, target: 'veado', count: 1, label: 'Avistar um veado' },
      { id: 'ver-lumifera', kind: 'avistar' as ObjectiveKind, target: 'criatura-bioluminescente', count: 1, label: 'Avistar uma lumífera' },
      { id: 'ver-cristal', kind: 'avistar' as ObjectiveKind, target: 'passaro-cristal', count: 1, label: 'Avistar um pássaro-de-cristal' },
    ]),
    rewards: { crystals: 400 },
    conclusion: 'Três espécies, nenhuma tocada. Saturno chamou isso de "a forma certa de gostar de bicho".',
  }),
  Object.freeze({
    id: 'escritorio-em-casa',
    title: 'Trabalhar de casa',
    category: 'compras' as MissionCategory,
    giver: 'nexara',
    regionId: 'aurora-city',
    summary: 'Nexara acha absurdo você não ter um computador em casa. Ela tem razão.',
    objectives: Object.freeze([
      { id: 'comprar-pc', kind: 'comprar' as ObjectiveKind, target: 'computador-zenite', count: 1, label: 'Comprar um Computador Zênite' },
      { id: 'instalar', kind: 'decorar' as ObjectiveKind, target: 'computador-zenite', count: 1, label: 'Instalá-lo em casa' },
    ]),
    rewards: { crystals: 150 },
    conclusion: 'Ligou de primeira. Nexara mandou uma mensagem dois minutos depois: "viu?".',
    requires: Object.freeze(['casa-propria']),
  }),
  Object.freeze({
    id: 'turne',
    title: 'Duas capitais, um som',
    category: 'musica' as MissionCategory,
    giver: 'lilly',
    summary: 'Lilly aposta que você não aguenta Bitnara e SkyStones no mesmo dia. Ela aposta alto.',
    objectives: Object.freeze([
      { id: 'ir-bitnara', kind: 'visitar-regiao' as ObjectiveKind, target: 'bitnara', count: 1, label: 'Chegar a Bitnara' },
      { id: 'ir-skystones', kind: 'visitar-regiao' as ObjectiveKind, target: 'skystones', count: 1, label: 'Chegar a SkyStones' },
      { id: 'instrumento', kind: 'comprar' as ObjectiveKind, target: '', count: 1, label: 'Comprar um instrumento' },
    ]),
    rewards: { crystals: 500 },
    conclusion: 'Bitnara brilha, SkyStones treme. Lilly perdeu a aposta e pagou sorrindo.',
  }),
]);

const BY_ID = new Map(MISSIONS.map((mission) => [mission.id, mission]));

export function getMission(id: string): Mission | undefined {
  return BY_ID.get(id);
}

export type MissionStatus = 'disponivel' | 'ativa' | 'concluida';

export interface MissionProgress {
  id: string;
  status: MissionStatus;
  /** Quantas vezes cada objetivo foi cumprido. */
  counts: Record<string, number>;
  startedAt: number;
  completedAt: number;
}

export interface MissionSaveData {
  missions: MissionProgress[];
}

export function emptyMissionData(): MissionSaveData {
  return { missions: [] };
}

export function sanitizeMissionData(raw: unknown): MissionSaveData {
  if (!raw || typeof raw !== 'object') return emptyMissionData();
  const value = raw as Record<string, unknown>;
  const missions: MissionProgress[] = [];
  if (Array.isArray(value.missions)) {
    for (const raw2 of value.missions) {
      if (!raw2 || typeof raw2 !== 'object') continue;
      const entry = raw2 as Record<string, unknown>;
      const mission = typeof entry.id === 'string' ? getMission(entry.id) : undefined;
      if (!mission || missions.some((m) => m.id === mission.id)) continue;
      const counts: Record<string, number> = {};
      if (entry.counts && typeof entry.counts === 'object') {
        for (const objective of mission.objectives) {
          const value2 = (entry.counts as Record<string, unknown>)[objective.id];
          if (typeof value2 === 'number' && value2 > 0) counts[objective.id] = Math.min(objective.count, Math.floor(value2));
        }
      }
      const status: MissionStatus = entry.status === 'concluida' ? 'concluida' : entry.status === 'ativa' ? 'ativa' : 'disponivel';
      missions.push({
        id: mission.id,
        status,
        counts,
        startedAt: typeof entry.startedAt === 'number' ? entry.startedAt : 0,
        completedAt: typeof entry.completedAt === 'number' ? entry.completedAt : 0,
      });
    }
  }
  return { missions };
}

/** O que aconteceu no mundo, para o sistema reagir. */
export interface WorldFact {
  kind: ObjectiveKind;
  target: string;
}

export interface MissionCompletion {
  mission: Mission;
  crystals: number;
  items: readonly string[];
}

export class MissionLog {
  private readonly progress = new Map<string, MissionProgress>();

  constructor(data: MissionSaveData = emptyMissionData()) {
    for (const entry of data.missions) this.progress.set(entry.id, { ...entry, counts: { ...entry.counts } });
  }

  private entry(id: string): MissionProgress {
    let found = this.progress.get(id);
    if (!found) {
      found = { id, status: 'disponivel', counts: {}, startedAt: 0, completedAt: 0 };
      this.progress.set(id, found);
    }
    return found;
  }

  statusOf(id: string): MissionStatus {
    return this.progress.get(id)?.status ?? 'disponivel';
  }

  isComplete(id: string): boolean {
    return this.statusOf(id) === 'concluida';
  }

  /** Atividades que o jogador já pode começar (pré-requisitos atendidos). */
  available(): Mission[] {
    return MISSIONS.filter((mission) => {
      if (this.statusOf(mission.id) !== 'disponivel') return false;
      return (mission.requires ?? []).every((id) => this.isComplete(id));
    });
  }

  active(): Mission[] {
    return MISSIONS.filter((mission) => this.statusOf(mission.id) === 'ativa');
  }

  completed(): Mission[] {
    return MISSIONS.filter((mission) => this.statusOf(mission.id) === 'concluida');
  }

  /** Aceita uma atividade. Só funciona se os pré-requisitos estão feitos. */
  start(id: string, at: number = Date.now()): boolean {
    const mission = getMission(id);
    if (!mission || this.statusOf(id) !== 'disponivel') return false;
    if (!(mission.requires ?? []).every((req) => this.isComplete(req))) return false;
    const entry = this.entry(id);
    entry.status = 'ativa';
    entry.startedAt = at;
    return true;
  }

  /** Quanto falta de um objetivo. */
  countOf(missionId: string, objectiveId: string): number {
    return this.progress.get(missionId)?.counts[objectiveId] ?? 0;
  }

  /** Um objetivo cumprido conta para esta atividade? */
  private matches(objective: Objective, fact: WorldFact): boolean {
    if (objective.kind !== fact.kind) return false;
    // Alvo vazio = qualquer um serve ("comprar um instrumento qualquer").
    return objective.target === '' || objective.target === fact.target;
  }

  /**
   * Conta um acontecimento do mundo.
   *
   * Devolve as atividades concluídas por ele — normalmente nenhuma ou
   * uma, mas nada impede que um mesmo fato feche duas.
   */
  record(fact: WorldFact, at: number = Date.now()): MissionCompletion[] {
    const finished: MissionCompletion[] = [];
    for (const mission of MISSIONS) {
      const entry = this.progress.get(mission.id);
      if (!entry || entry.status !== 'ativa') continue;

      let changed = false;
      for (const objective of mission.objectives) {
        if (!this.matches(objective, fact)) continue;
        const current = entry.counts[objective.id] ?? 0;
        if (current >= objective.count) continue;
        entry.counts[objective.id] = current + 1;
        changed = true;
      }
      if (!changed) continue;

      const done = mission.objectives.every((objective) => (entry.counts[objective.id] ?? 0) >= objective.count);
      if (done) {
        entry.status = 'concluida';
        entry.completedAt = at;
        finished.push({ mission, crystals: mission.rewards.crystals ?? 0, items: mission.rewards.items ?? [] });
      }
    }
    return finished;
  }

  /** Progresso de uma atividade, de 0 a 1. */
  fractionOf(missionId: string): number {
    const mission = getMission(missionId);
    if (!mission) return 0;
    if (this.isComplete(missionId)) return 1;
    const total = mission.objectives.reduce((sum, objective) => sum + objective.count, 0);
    if (total === 0) return 0;
    const done = mission.objectives.reduce((sum, objective) => sum + Math.min(objective.count, this.countOf(missionId, objective.id)), 0);
    return done / total;
  }

  toJSON(): MissionSaveData {
    return { missions: [...this.progress.values()].map((entry) => ({ ...entry, counts: { ...entry.counts } })) };
  }
}
