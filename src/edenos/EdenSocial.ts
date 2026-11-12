import { PANTHEON, getCharacter, type EdenCharacter } from '../characters/Pantheon';

/**
 * Camada social do EdenOS — **local**.
 *
 * Guarda quem o jogador conheceu, as fotos que tirou e as mensagens que
 * recebeu, tudo no próprio aparelho. Não existe servidor, conta ou envio
 * de dados nesta versão: o EdenPhone diz isso ao jogador em cada tela.
 */

export interface EdenPhoto {
  id: string;
  /** Miniatura em `data:` (JPEG). */
  data: string;
  /** Lugar onde a foto foi tirada. */
  place: string;
  /** Horário do mundo (ex.: "18:40"). */
  clock: string;
  /** Carimbo de tempo real (ordenação). */
  at: number;
}

export interface SocialData {
  /** Ids de personagens do panteão já conhecidos. */
  contacts: string[];
  /** Nomes de cidadãos com quem o jogador já conversou. */
  citizens: string[];
  photos: EdenPhoto[];
  /** Conversas abertas pelo menos uma vez (tira o marcador de "novo"). */
  readThreads: string[];
}

export const MAX_PHOTOS = 12;
const MAX_CITIZENS = 60;
const MAX_PHOTO_CHARS = 90_000;

export function emptySocialData(): SocialData {
  return { contacts: [], citizens: [], photos: [], readThreads: [] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringList(value: unknown, limit: number, maxLength = 48): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const text = item.trim().slice(0, maxLength);
    if (text.length === 0 || out.includes(text)) continue;
    out.push(text);
    if (out.length >= limit) break;
  }
  return out;
}

/** Valida dados sociais vindos do armazenamento (ou de um arquivo importado). */
export function sanitizeSocialData(raw: unknown): SocialData {
  if (!isRecord(raw)) return emptySocialData();
  const known = new Set(PANTHEON.map((character) => character.id));
  const photos: EdenPhoto[] = [];
  if (Array.isArray(raw.photos)) {
    for (const item of raw.photos) {
      if (!isRecord(item)) continue;
      const data = item.data;
      if (typeof data !== 'string' || !data.startsWith('data:image/jpeg;base64,') || data.length > MAX_PHOTO_CHARS) continue;
      photos.push({
        id: typeof item.id === 'string' ? item.id.slice(0, 40) : `foto-${photos.length}`,
        data,
        place: typeof item.place === 'string' ? item.place.slice(0, 48) : 'Aurora City',
        clock: typeof item.clock === 'string' ? item.clock.slice(0, 8) : '',
        at: typeof item.at === 'number' && Number.isFinite(item.at) ? item.at : 0,
      });
      if (photos.length >= MAX_PHOTOS) break;
    }
  }
  return {
    contacts: stringList(raw.contacts, 32).filter((id) => known.has(id)),
    citizens: stringList(raw.citizens, MAX_CITIZENS),
    photos,
    readThreads: stringList(raw.readThreads, 32),
  };
}

export interface FeedContext {
  playerName: string;
  clock: string;
  weather: string;
  area: string;
  day: number;
  crystals: readonly [number, number];
  areas: readonly [number, number];
  portals: readonly [number, number];
  night: boolean;
  hasFlag(flag: string): boolean;
}

export type FeedTag = 'sistema' | 'cidade' | 'panteao' | 'voce' | 'agenda';

export interface FeedPost {
  id: string;
  author: string;
  handle: string;
  color: string;
  text: string;
  tag: FeedTag;
}

export interface TalkThread {
  character: EdenCharacter;
  messages: readonly string[];
  unread: boolean;
}

/** Estado social do jogador no EdenOS. */
export class EdenSocial {
  private readonly contacts: Set<string>;
  private readonly citizens: Set<string>;
  private readonly readThreads: Set<string>;
  private photoList: EdenPhoto[];

  constructor(data: SocialData = emptySocialData()) {
    this.contacts = new Set(data.contacts);
    this.citizens = new Set(data.citizens);
    this.readThreads = new Set(data.readThreads);
    this.photoList = [...data.photos];
  }

  /** Registra um encontro com o panteão. Retorna `true` na primeira vez. */
  meet(characterId: string): boolean {
    if (!getCharacter(characterId) || this.contacts.has(characterId)) return false;
    this.contacts.add(characterId);
    return true;
  }

  hasMet(characterId: string): boolean {
    return this.contacts.has(characterId);
  }

  /** Registra uma conversa com um cidadão comum. */
  meetCitizen(name: string): boolean {
    if (this.citizens.has(name) || this.citizens.size >= MAX_CITIZENS) return false;
    this.citizens.add(name);
    return true;
  }

  get contactCount(): number {
    return this.contacts.size;
  }

  /** Ids do panteão já conhecidos, na ordem canônica. */
  get contactIds(): readonly string[] {
    return PANTHEON.filter((character) => this.contacts.has(character.id)).map((character) => character.id);
  }

  get citizenCount(): number {
    return this.citizens.size;
  }

  get citizenNames(): readonly string[] {
    return [...this.citizens];
  }

  get photos(): readonly EdenPhoto[] {
    return this.photoList;
  }

  addPhoto(photo: EdenPhoto): void {
    this.photoList.unshift(photo);
    if (this.photoList.length > MAX_PHOTOS) this.photoList.length = MAX_PHOTOS;
  }

  removePhoto(id: string): void {
    this.photoList = this.photoList.filter((photo) => photo.id !== id);
  }

  markThreadRead(characterId: string): void {
    this.readThreads.add(characterId);
  }

  /** Conversas do EdenTalk: uma por personagem conhecido. */
  threads(): TalkThread[] {
    const out: TalkThread[] = [];
    for (const character of PANTHEON) {
      if (!this.contacts.has(character.id)) continue;
      out.push({ character, messages: character.contact.messages, unread: !this.readThreads.has(character.id) });
    }
    return out;
  }

  get unreadCount(): number {
    return this.threads().filter((thread) => thread.unread).length;
  }

  /** Monta o EdenFeed a partir do estado atual do mundo e do jogador. */
  feed(context: FeedContext): FeedPost[] {
    const posts: FeedPost[] = [];
    posts.push({
      id: 'sistema-agora',
      author: 'EdenOS · Aurora City',
      handle: '@edenos',
      color: '#29c8ff',
      tag: 'sistema',
      text: `${context.clock} · ${context.weather} · ${context.area}. Dia ${context.day} em Aurora City.`,
    });
    if (context.night) {
      posts.push({
        id: 'cidade-vice',
        author: 'Prefeitura de Aurora',
        handle: '@auroracity',
        color: '#ff6f91',
        tag: 'cidade',
        text: 'A Era Vice Éden começou: o néon da orla e do centro está aceso até o amanhecer.',
      });
    } else {
      posts.push({
        id: 'cidade-dia',
        author: 'Prefeitura de Aurora',
        handle: '@auroracity',
        color: '#1fae6b',
        tag: 'cidade',
        text: 'Jardins irrigados, fontes ligadas e orla liberada. Bom passeio.',
      });
    }

    const [crystals, crystalTotal] = context.crystals;
    if (crystals > 0) {
      posts.push({
        id: 'voce-cristais',
        author: context.playerName,
        handle: '@voce',
        color: '#8fe6ff',
        tag: 'voce',
        text:
          crystals >= crystalTotal
            ? `Encontrei todos os ${crystalTotal} Cristais de Luz de Aurora City.`
            : `Já encontrei ${crystals} de ${crystalTotal} Cristais de Luz por aí.`,
      });
    }
    const [areas, areaTotal] = context.areas;
    if (areas > 1) {
      posts.push({
        id: 'voce-areas',
        author: context.playerName,
        handle: '@voce',
        color: '#9df0b0',
        tag: 'voce',
        text: `${areas} de ${areaTotal} áreas de Aurora City visitadas.`,
      });
    }
    const [portals, portalTotal] = context.portals;
    if (portals > 1) {
      posts.push({
        id: 'voce-portais',
        author: context.playerName,
        handle: '@voce',
        color: '#c9a2ff',
        tag: 'voce',
        text: `${portals} de ${portalTotal} portais ativados — viagem rápida liberada no mapa.`,
      });
    }

    for (const character of PANTHEON) {
      if (!this.contacts.has(character.id)) continue;
      const message = character.contact.messages[0];
      if (!message) continue;
      posts.push({
        id: `panteao-${character.id}`,
        author: character.name,
        handle: character.contact.handle,
        color: character.colors[0],
        tag: 'panteao',
        text: message,
      });
    }

    posts.push({
      id: 'agenda-bitnara',
      author: 'Agenda do Éden',
      handle: '@edenagenda',
      color: '#ffd98a',
      tag: 'agenda',
      text: 'Bitnara, capital do K-pop, abre oficialmente em 14 de novembro de 2026.',
    });
    posts.push({
      id: 'agenda-eventos',
      author: 'Agenda do Éden',
      handle: '@edenagenda',
      color: '#d6b8ff',
      tag: 'agenda',
      text: 'EdenGala, EdenCon e Concurso Divino ainda não têm data marcada em Aurora City. Sem data falsa por aqui.',
    });
    posts.push({
      id: 'sistema-local',
      author: 'EdenOS',
      handle: '@edenos',
      color: '#7fd6ff',
      tag: 'sistema',
      text: 'Este feed é montado dentro do seu EdenPhone, a partir do que você viu em Aurora City. Nada sai deste aparelho: não há servidor, conta nem outras pessoas on-line.',
    });
    if (context.hasFlag('sabe-bluebloom')) {
      posts.push({
        id: 'historia-bluebloom',
        author: 'Arquivo do Éden',
        handle: '@edenarquivo',
        color: '#8fd6ff',
        tag: 'sistema',
        text: 'Arquivo BlueBloom liberado no EdenReads: investigação encerrada com cura em 100%.',
      });
    }
    return posts;
  }

  toData(): SocialData {
    return {
      contacts: [...this.contacts],
      citizens: [...this.citizens],
      photos: this.photoList.slice(0, MAX_PHOTOS),
      readThreads: [...this.readThreads],
    };
  }
}
