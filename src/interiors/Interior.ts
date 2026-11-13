/**
 * Interiores: entrar nos prédios.
 *
 * Um interior é uma cena própria, carregada só quando alguém entra e
 * liberada quando sai. É isso que permite ter dezenas de portas no
 * mundo sem carregar dezenas de cenas na memória — especialmente no
 * celular, onde carregar tudo não é uma opção.
 *
 * O `InteriorManager` guarda o caminho de volta: ao sair, o jogador
 * reaparece na porta por onde entrou, virado para fora, e não no meio
 * da rua nem no centro da região.
 *
 * Módulo puro: sem Three.js, sem DOM. Quem instancia a geometria é a
 * camada de cenário, lendo `InteriorDef`.
 */

export type InteriorCategory =
  | 'casa'
  | 'apartamento'
  | 'shopping'
  | 'tecnologia'
  | 'jogos'
  | 'petshop'
  | 'restaurante'
  | 'escola'
  | 'hospital'
  | 'estudio'
  | 'cinema'
  | 'hotel'
  | 'santuario'
  | 'publico'
  | 'cultura';

/**
 * Para que serve um cômodo.
 *
 * Define o acabamento padrão (piso, forro, janela) quando o ambiente
 * não tem decoração própria, e dá ao acabamento um vocabulário comum:
 * uma cozinha é uma cozinha em qualquer prédio.
 */
export type RoomKind =
  | 'sala'
  | 'cozinha'
  | 'quarto'
  | 'banheiro'
  | 'varanda'
  | 'corredor'
  | 'loja'
  | 'deposito'
  | 'recepcao'
  | 'escritorio'
  | 'oficina'
  | 'estufa';

/** Um cômodo do interior, em metros. */
export interface InteriorRoom {
  id: string;
  name: string;
  /** Canto inferior-esquerdo em coordenadas locais do interior. */
  x: number;
  z: number;
  w: number;
  d: number;
  /** Andar. 0 é o térreo. */
  floor: number;
  /** Para que serve. Define acabamento quando não há decoração própria. */
  kind?: RoomKind;
  /** `false` tira as janelas deste cômodo (banheiro, depósito). */
  windows?: boolean;
}

/** Objeto com que dá para interagir dentro do interior. */
export interface InteriorProp {
  id: string;
  name: string;
  x: number;
  z: number;
  floor: number;
  /** O que acontece ao interagir. */
  action: 'sentar' | 'olhar' | 'comprar' | 'conversar' | 'usar' | 'subir' | 'descer';
  note: string;
}

export interface InteriorDef {
  id: string;
  name: string;
  category: InteriorCategory;
  /** Região e lugar onde fica a porta de entrada. */
  regionId: string;
  placeId: string;
  /** Quantos andares. */
  floors: number;
  rooms: readonly InteriorRoom[];
  props: readonly InteriorProp[];
  /** Moradores/atendentes de dentro (ids do panteão ou perfis). */
  residents: readonly string[];
  /** Loja que funciona aqui, quando há uma. */
  shopId?: string;
  /** Clima de iluminação interna. */
  lighting: 'quente' | 'fria' | 'neon' | 'natural' | 'penumbra';
  /** Onde o jogador aparece ao entrar, em coordenadas locais. */
  spawn: { x: number; z: number; heading: number };
  /**
   * A porta da rua, no muro externo. O jogador nasce um pouco para
   * dentro dela (`spawn`), de frente para o ambiente — e não em cima
   * da própria porta, como acontecia antes.
   */
  entrance?: { x: number; z: number; yaw: number };
  /**
   * Onde ficam as passagens entre cômodos.
   *
   * Sem declaração, a passagem nasce no meio da divisória — o que
   * funciona numa sala vazia e atrapalha numa cozinha, onde o meio da
   * parede é justamente onde fica a bancada. Declarar o ponto deixa o
   * acabamento usar a parede inteira.
   */
  openings?: readonly { x: number; z: number; width?: number }[];
  /**
   * O vão da escada, quando o prédio tem mais de um andar.
   *
   * É o mesmo retângulo nos dois sentidos: embaixo recebe os degraus,
   * em cima vira o buraco na laje. Sem ele, um prédio de dois andares
   * só teria o térreo — que é exatamente o que acontecia.
   */
  stairwell?: { x: number; z: number; w: number; d: number; /** Direção da subida. */ yaw: number };
  /**
   * Id do acabamento que mobilia este interior (ver `fitouts/`).
   *
   * Sem acabamento, o prédio recebe a mobília genérica derivada de
   * `props` — útil para um ambiente novo nascer jogável no mesmo dia
   * em que é declarado, e insuficiente para um ambiente principal.
   */
  fitout?: string;
  note: string;
}

const INTERIORS: InteriorDef[] = [
  {
    id: 'atelie-aero',
    name: 'Ateliê Aero',
    category: 'tecnologia',
    regionId: 'aurora-city',
    placeId: 'atelie-aero',
    fitout: 'atelie-aero',
    floors: 1,
    rooms: [
      { id: 'salao', name: 'Salão', x: 0, z: 0, w: 14, d: 10, floor: 0 },
      { id: 'cabine', name: 'Cabine de ajuste', x: 14, z: 2, w: 6, d: 6, floor: 0 },
    ],
    props: [
      { id: 'balcao', name: 'Balcão', x: 7, z: 2, floor: 0, action: 'comprar', note: 'O catálogo Afters inteiro.' },
      { id: 'espelho', name: 'Espelho de ajuste', x: 18.1, z: 5, floor: 0, action: 'usar', note: 'Abre o painel Afters.' },
      { id: 'sofa-espera', name: 'Sofá de espera', x: 3, z: 8, floor: 0, action: 'sentar', note: 'Confortável demais para a pressa de ninguém.' },
    ],
    residents: ['luma'],
    shopId: 'afters-atelie',
    lighting: 'quente',
    spawn: { x: 7, z: 9, heading: 0 },
    note: 'O ateliê onde os Afters foram inventados.',
  },
  {
    id: 'mercado-eden',
    name: 'Mercado Éden',
    category: 'shopping',
    regionId: 'aurora-city',
    placeId: 'mercado-eden',
    floors: 2,
    rooms: [
      { id: 'terreo', name: 'Térreo', x: 0, z: 0, w: 24, d: 18, floor: 0, kind: 'loja' },
      { id: 'galeria', name: 'Galeria', x: 0, z: 0, w: 24, d: 18, floor: 1, kind: 'loja' },
    ],
    stairwell: { x: 19, z: 12.4, w: 4.6, d: 4.6, yaw: Math.PI },
    fitout: 'edenstore',
    props: [
      { id: 'banca-akemi', name: 'Banca da Akemi', x: 6, z: 4, floor: 0, action: 'comprar', note: 'Pão, fruta e conversa.' },
      { id: 'escada', name: 'Escada', x: 22, z: 16, floor: 0, action: 'subir', note: 'Leva à galeria.' },
      { id: 'edenhome-balcao', name: 'EdenHome', x: 8, z: 6, floor: 1, action: 'comprar', note: 'Móveis e decoração.' },
      { id: 'edengame-balcao', name: 'EdenGame', x: 16, z: 6, floor: 1, action: 'comprar', note: 'Consoles e jogos.' },
      { id: 'escada-desce', name: 'Escada', x: 22, z: 16, floor: 1, action: 'descer', note: 'Volta ao térreo.' },
    ],
    residents: ['akemi'],
    shopId: 'edenhome-aurora',
    lighting: 'natural',
    spawn: { x: 12, z: 17, heading: 0 },
    note: 'Dois andares. Cheira a pão quente no térreo.',
  },
  {
    id: 'edenpawl-aurora',
    name: 'Casa EdenPawl',
    category: 'petshop',
    regionId: 'aurora-city',
    placeId: 'casa-edenpawl',
    floors: 1,
    rooms: [
      { id: 'loja', name: 'Loja', x: 0, z: 0, w: 16, d: 12, floor: 0, kind: 'loja' },
      { id: 'adocao', name: 'Sala de adoção', x: 16, z: 0, w: 12, d: 12, floor: 0, kind: 'sala' },
    ],
    openings: [{ x: 16, z: 8.5, width: 3.2 }],
    fitout: 'edenpawl',
    props: [
      { id: 'prateleiras', name: 'Prateleiras', x: 4, z: 4.4, floor: 0, action: 'comprar', note: 'Ração, brinquedo e escova.' },
      { id: 'saturno-mesa', name: 'Mesa de Saturno', x: 19, z: 2.6, floor: 0, action: 'conversar', note: 'Ela decide quem leva quem.' },
      { id: 'recanto', name: 'Recanto dos bichos', x: 23, z: 8, floor: 0, action: 'olhar', note: 'Quem está esperando uma casa.' },
    ],
    residents: ['saturno'],
    shopId: 'edenpawl-aurora',
    lighting: 'quente',
    spawn: { x: 8, z: 10.2, heading: Math.PI },
    entrance: { x: 8, z: 12, yaw: 0 },
    note: 'A casa de Saturno. Entra bicho, sai bicho, entra gente.',
  },
  {
    id: 'torre-zenite',
    name: 'Torre Zênite',
    category: 'tecnologia',
    regionId: 'aurora-city',
    placeId: 'torre-zenite',
    floors: 3,
    rooms: [
      { id: 'recepcao', name: 'Recepção', x: 0, z: 0, w: 18, d: 12, floor: 0, kind: 'recepcao' },
      { id: 'edentech', name: 'EdenTech', x: 0, z: 0, w: 18, d: 12, floor: 1, kind: 'loja' },
      { id: 'laboratorio', name: 'Laboratório', x: 0, z: 0, w: 18, d: 12, floor: 2, kind: 'oficina' },
    ],
    stairwell: { x: 13.2, z: 6.6, w: 4.4, d: 4.4, yaw: Math.PI },
    fitout: 'edentech',
    props: [
      { id: 'elevador', name: 'Elevador', x: 16, z: 10, floor: 0, action: 'subir', note: 'Três andares.' },
      { id: 'vitrine-tech', name: 'Vitrine EdenTech', x: 6, z: 4, floor: 1, action: 'comprar', note: 'Computadores, telas, EdenPhone.' },
      { id: 'nexara-posto', name: 'Posto da Nexara', x: 9, z: 4, floor: 2, action: 'conversar', note: 'Daqui ela cuida das redes do Éden.' },
    ],
    residents: ['nexara'],
    shopId: 'edentech-aurora',
    lighting: 'fria',
    spawn: { x: 9, z: 11, heading: 0 },
    note: 'A torre que mantém o Éden conectado.',
  },
  {
    id: 'apto-aurora-12',
    name: 'Apartamento 12 — Aurora',
    category: 'apartamento',
    regionId: 'aurora-city',
    placeId: 'residencial-orvalho',
    floors: 1,
    rooms: [
      { id: 'sala', name: 'Sala de estar', x: 0, z: 0, w: 9, d: 7.4, kind: 'sala', floor: 0 },
      { id: 'cozinha', name: 'Cozinha', x: 9, z: 0, w: 6, d: 7.4, kind: 'cozinha', floor: 0 },
      { id: 'corredor', name: 'Corredor', x: 0, z: 7.4, w: 15, d: 2.6, kind: 'corredor', windows: false, floor: 0 },
      { id: 'quarto', name: 'Quarto', x: 0, z: 10, w: 8, d: 6.6, kind: 'quarto', floor: 0 },
      { id: 'banheiro', name: 'Banheiro', x: 8, z: 10, w: 3.6, kind: 'banheiro', windows: false, d: 6.6, floor: 0 },
      { id: 'varanda', name: 'Varanda', x: 11.6, z: 10, w: 3.4, d: 6.6, kind: 'varanda', floor: 0 },
    ],
    props: [
      { id: 'sofa-apto', name: 'Sofá', x: 2.4, z: 2.2, floor: 0, action: 'sentar', note: 'De frente para a televisão e para a janela. Dá para escolher.' },
      { id: 'tv-apto', name: 'Televisão', x: 6.6, z: 1.2, floor: 0, action: 'usar', note: 'Pega os canais do Éden e um que ninguém sabe de onde vem.' },
      { id: 'cozinha-apto', name: 'Cozinha', x: 12, z: 1.6, floor: 0, action: 'usar', note: 'Bancada, cooktop e uma geladeira com ímãs de todas as regiões.' },
      { id: 'mesa-apto', name: 'Mesa', x: 11.8, z: 5.2, floor: 0, action: 'sentar', note: 'Duas cadeiras. Nunca precisou de mais.' },
      { id: 'cama-apto', name: 'Cama', x: 2.4, z: 12.6, floor: 0, action: 'usar', note: 'A janela do quarto dá para os jardins do Orvalho.' },
      { id: 'armario-apto', name: 'Guarda-roupa', x: 6.4, z: 11.2, floor: 0, action: 'olhar', note: 'Metade vazia, esperando o que você ainda vai comprar.' },
      { id: 'banheiro-apto', name: 'Banheiro', x: 9.8, z: 12.4, floor: 0, action: 'olhar', note: 'Pequeno, claro e com um chuveiro que funciona de verdade.' },
      { id: 'estante-apto', name: 'Estante', x: 0.9, z: 5.4, floor: 0, action: 'olhar', note: 'Livros, uma concha e a sua primeira pedra de cristal.' },
      { id: 'varanda-apto', name: 'Varanda', x: 13.3, z: 13.2, floor: 0, action: 'sentar', note: 'Cabe uma cadeira e a cidade inteira.' },
    ],
    residents: [],
    lighting: 'quente',
    spawn: { x: 13.4, z: 8.7, heading: -Math.PI / 2 },
    entrance: { x: 15, z: 8.7, yaw: Math.PI / 2 },
    openings: [
      { x: 9, z: 6.4 },
      { x: 6.5, z: 7.4 },
      { x: 12, z: 7.4 },
      { x: 4, z: 10 },
      { x: 9.8, z: 10, width: 1.2 },
      { x: 13.3, z: 10, width: 2.6 },
    ],
    fitout: 'apartamento-aurora',
    note: 'Seu apartamento em Aurora City. Pequeno, claro, todo seu.',
  },
  {
    id: 'centro-edenconnect',
    name: 'Centro Éden Connect',
    category: 'publico',
    regionId: 'aurora-city',
    placeId: 'centro-edenconnect',
    floors: 1,
    rooms: [
      { id: 'recepcao', name: 'Recepção', x: 0, z: 0, w: 16, d: 11, kind: 'recepcao', floor: 0 },
      { id: 'espera', name: 'Sala de espera', x: 0, z: 11, w: 16, d: 7, kind: 'sala', floor: 0 },
      { id: 'corredor', name: 'Corredor', x: 16, z: 0, w: 4, d: 18, kind: 'corredor', windows: false, floor: 0 },
      { id: 'atendimento', name: 'Sala de atendimento', x: 20, z: 0, w: 9, d: 9, kind: 'escritorio', floor: 0 },
      { id: 'registros', name: 'Sala de registros', x: 20, z: 9, w: 9, d: 9, kind: 'escritorio', floor: 0 },
    ],
    props: [
      { id: 'balcao-connect', name: 'Balcão de atendimento', x: 8, z: 2.6, floor: 0, action: 'conversar', note: 'Quatro guichês, três abertos. É sempre assim.' },
      { id: 'totem-senha', name: 'Totem de senha', x: 2.2, z: 7.4, floor: 0, action: 'usar', note: 'Tira a senha e avisa quantos estão na frente.' },
      { id: 'espera-connect', name: 'Banco de espera', x: 4, z: 14, floor: 0, action: 'sentar', note: 'Macio o bastante para a espera não doer.' },
      { id: 'mural-connect', name: 'Mural de avisos', x: 13.4, z: 17.4, floor: 0, action: 'olhar', note: 'Avisos da cidade, achados e perdidos, um anúncio de aula de natação.' },
      { id: 'sala-atendimento', name: 'Sala de atendimento', x: 24, z: 4.4, floor: 0, action: 'conversar', note: 'Onde se resolve o que o balcão não resolve.' },
      { id: 'arquivo-connect', name: 'Arquivo', x: 24, z: 13.4, floor: 0, action: 'olhar', note: 'Tudo que Aurora City já registrou, numa parede só.' },
      { id: 'bebedouro-connect', name: 'Bebedouro', x: 18, z: 9, floor: 0, action: 'usar', note: 'Gelada. É o que se diz de melhor sobre este corredor.' },
    ],
    residents: [],
    lighting: 'fria',
    spawn: { x: 8, z: 16.2, heading: Math.PI },
    entrance: { x: 8, z: 18, yaw: 0 },
    openings: [
      { x: 8, z: 11, width: 4.5 },
      { x: 16, z: 5.5 },
      { x: 16, z: 14 },
      { x: 20, z: 4.5 },
      { x: 20, z: 13.5 },
    ],
    fitout: 'centro-civico',
    note: 'Serviços da cidade: registros, moradia e o que mais precisar.',
  },
  {
    id: 'estudio-bitnara',
    name: 'Estúdio Bitnara',
    category: 'estudio',
    regionId: 'bitnara',
    placeId: 'estudio-bitnara',
    floors: 1,
    rooms: [
      { id: 'sala-tecnica', name: 'Sala técnica', x: 0, z: 0, w: 10, d: 8, floor: 0 },
      { id: 'cabine-voz', name: 'Cabine de voz', x: 10, z: 1, w: 6, d: 6, floor: 0 },
    ],
    props: [
      { id: 'mesa-som', name: 'Mesa de som', x: 5, z: 2, floor: 0, action: 'usar', note: 'Grava o que estiver sendo cantado.' },
      { id: 'microfone', name: 'Microfone', x: 13, z: 4, floor: 0, action: 'usar', note: 'Acende quando alguém entra na cabine.' },
    ],
    residents: [],
    lighting: 'neon',
    spawn: { x: 5, z: 7, heading: 0 },
    note: 'Paredes tratadas. Nada vaza daqui.',
  },
  {
    id: 'santuario-rosas',
    name: 'Santuário de Rosas Park',
    category: 'santuario',
    regionId: 'rosas-park',
    placeId: 'santuario-rosas',
    floors: 1,
    rooms: [{ id: 'abrigo', name: 'Abrigo', x: 0, z: 0, w: 20, d: 16, floor: 0 }],
    props: [
      { id: 'posto-cuidados', name: 'Posto de cuidados', x: 5, z: 4, floor: 0, action: 'usar', note: 'Onde os bichos resgatados se recuperam.' },
      { id: 'saturno-rosas', name: 'Saturno', x: 12, z: 6, floor: 0, action: 'conversar', note: 'Ela passa mais tempo aqui do que admite.' },
    ],
    residents: ['saturno'],
    shopId: 'edenpawl-rosas',
    lighting: 'natural',
    spawn: { x: 10, z: 15, heading: 0 },
    note: 'Silêncio obrigatório. Os bichos agradecem.',
  },
  {
    id: 'casa-de-cha',
    name: 'Casa de Chá',
    category: 'restaurante',
    regionId: 'rosas-park',
    placeId: 'casa-de-cha',
    floors: 1,
    rooms: [
      { id: 'salao', name: 'Salão', x: 0, z: 0, w: 16, d: 12, floor: 0 },
      { id: 'varanda', name: 'Varanda de vidro', x: 16, z: 2, w: 8, d: 8, floor: 0 },
    ],
    props: [
      { id: 'balcao-cha', name: 'Balcão', x: 3, z: 9, floor: 0, action: 'comprar', note: 'Dezenove chás. A dona sabe todos de cor.' },
      { id: 'mesa-janela', name: 'Mesa da janela', x: 12, z: 3, floor: 0, action: 'sentar', note: 'Dá para o lago. É a disputada.' },
      { id: 'mesa-canto', name: 'Mesa do canto', x: 4, z: 3, floor: 0, action: 'sentar', note: 'Para quem veio ler.' },
      { id: 'banco-varanda', name: 'Banco da varanda', x: 19, z: 6, floor: 0, action: 'sentar', note: 'Chove em volta e não molha aqui.' },
      { id: 'estante-cha', name: 'Estante de latas', x: 14, z: 10, floor: 0, action: 'olhar', note: 'Latas que ninguém abre, só olha.' },
      { id: 'suki-cha', name: 'Suki-Chan', x: 8, z: 7, floor: 0, action: 'conversar', note: 'Ela vem quase todo dia, no fim da tarde.' },
    ],
    residents: ['suki'],
    lighting: 'quente',
    spawn: { x: 8, z: 11, heading: Math.PI },
    note: 'Chá, bolo e silêncio. Nessa ordem.',
  },
  {
    id: 'viveiro-eden',
    name: 'Viveiro Éden',
    category: 'shopping',
    regionId: 'rosas-park',
    placeId: 'viveiro-eden',
    floors: 1,
    rooms: [{ id: 'estufa', name: 'Estufa', x: 0, z: 0, w: 22, d: 18, floor: 0 }],
    props: [
      { id: 'caixa-viveiro', name: 'Caixa', x: 4, z: 15, floor: 0, action: 'comprar', note: 'Mudas, vasos e terra. Paga-se na saída.' },
      { id: 'bancada-mudas', name: 'Bancada de mudas', x: 8, z: 6, floor: 0, action: 'olhar', note: 'Cada vaso tem uma etiqueta escrita à mão.' },
      { id: 'canteiro-raros', name: 'Canteiro dos raros', x: 17, z: 5, floor: 0, action: 'olhar', note: 'Plantas que só crescem no Éden. Algumas ainda sem nome.' },
      { id: 'regador', name: 'Regador comunitário', x: 13, z: 12, floor: 0, action: 'usar', note: 'Quem passa, rega. É a regra da casa.' },
      { id: 'banco-estufa', name: 'Banco da estufa', x: 19, z: 13, floor: 0, action: 'sentar', note: 'Quente mesmo quando lá fora não está.' },
      { id: 'jardineiro-viveiro', name: 'Jardineiro do Viveiro', x: 11, z: 9, floor: 0, action: 'conversar', note: 'Fala com as plantas antes de falar com gente.' },
    ],
    residents: [],
    shopId: 'edenhome-rosas',
    lighting: 'natural',
    spawn: { x: 11, z: 16, heading: Math.PI },
    note: 'Mudas de tudo que cresce no Éden.',
  },
  {
    id: 'casa-rosas-7',
    name: 'Casa 7 — Rosas Park',
    category: 'casa',
    regionId: 'rosas-park',
    placeId: 'casa-rosas-7',
    floors: 1,
    rooms: [
      { id: 'sala', name: 'Sala', x: 0, z: 0, w: 14, d: 11, floor: 0 },
      { id: 'quarto', name: 'Quarto', x: 14, z: 0, w: 10, d: 11, floor: 0 },
      { id: 'varanda', name: 'Varanda', x: 0, z: 11, w: 24, d: 6, floor: 0 },
    ],
    props: [
      { id: 'sofa-casa7', name: 'Sofá', x: 4, z: 4, floor: 0, action: 'sentar', note: 'Fundo demais. Ninguém levanta com pressa.' },
      { id: 'cama-casa7', name: 'Cama', x: 19, z: 4, floor: 0, action: 'usar', note: 'A janela do quarto dá para o roseiral.' },
      { id: 'mesa-casa7', name: 'Mesa', x: 10, z: 8, floor: 0, action: 'sentar', note: 'Serve de mesa de jantar e de escrivaninha.' },
      { id: 'prateleira-casa7', name: 'Prateleira', x: 2, z: 9, floor: 0, action: 'olhar', note: 'Onde param as coisas trazidas das viagens.' },
      { id: 'rede-varanda', name: 'Rede da varanda', x: 12, z: 14, floor: 0, action: 'sentar', note: 'De tarde dá sol aqui até tarde.' },
    ],
    residents: [],
    lighting: 'quente',
    spawn: { x: 7, z: 13, heading: Math.PI },
    note: 'Pequena, de madeira clara e vidro. Dá para morar.',
  },
];

const BY_ID = new Map(INTERIORS.map((interior) => [interior.id, interior]));

export function registerInterior(interior: InteriorDef): InteriorDef {
  if (BY_ID.has(interior.id)) throw new Error(`[Interior] Interior já registrado: ${interior.id}`);
  INTERIORS.push(interior);
  BY_ID.set(interior.id, interior);
  return interior;
}

export function getInterior(id: string): InteriorDef | undefined {
  return BY_ID.get(id);
}

export function allInteriors(): readonly InteriorDef[] {
  return INTERIORS;
}

export function interiorsInRegion(regionId: string): InteriorDef[] {
  return INTERIORS.filter((interior) => interior.regionId === regionId);
}

/** Cômodos de um andar. */
export function roomsOnFloor(interior: InteriorDef, floor: number): InteriorRoom[] {
  return interior.rooms.filter((room) => room.floor === floor);
}

/** O ponto no mundo exterior a que a saída deste interior devolve. */
export interface ExitPoint {
  regionId: string;
  x: number;
  z: number;
  heading: number;
}
