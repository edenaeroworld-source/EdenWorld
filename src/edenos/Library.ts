/**
 * Acervo do EdenReads: textos do universo Éden Aero lidos dentro do jogo.
 *
 * É conteúdo de lore, não um serviço on-line: tudo vive no próprio jogo.
 * Alguns textos só aparecem depois que o jogador descobre o assunto
 * (bandeira de história).
 */

export interface LibraryDocument {
  id: string;
  title: string;
  subtitle: string;
  /** Coleção para agrupar na lista. */
  shelf: 'universo' | 'cidades' | 'tecnologia' | 'historia';
  paragraphs: readonly string[];
  /** Quando presente, só aparece com a bandeira correspondente. */
  requiresFlag?: string;
}

export const LIBRARY: readonly LibraryDocument[] = [
  {
    id: 'o-que-e-eden-aero',
    title: 'O que é o Éden Aero',
    subtitle: 'Introdução à civilização',
    shelf: 'universo',
    paragraphs: [
      'O Éden Aero é uma civilização onde tecnologia e natureza não disputam espaço: elas crescem juntas.',
      'Prédios abrigam vegetação viva. Sistemas digitais aparecem como interfaces transparentes. A água atravessa a arquitetura urbana. Praças misturam jardim botânico, cristal, fonte e infraestrutura futurista.',
      'A ideia central da civilização é a liberdade de ser quem se é: identidade, gosto, personalidade e expressão criativa pertencem a cada habitante.',
    ],
  },
  {
    id: 'biologia-do-eden',
    title: 'Biologia do Éden',
    subtitle: 'Aula aberta de Suki-Chan',
    shelf: 'universo',
    paragraphs: [
      'A população do Éden Aero é de aproximadamente dez trilhões de habitantes.',
      'Uma vida costuma alcançar 200 anos, com envelhecimento harmonioso.',
      'A gestação dura 100 meses. Quem nasce chega com desenvolvimento físico equivalente a cerca de 14 anos da Terra.',
      'Estes são fatos biológicos próprios do Éden: servem para entender a cultura, o ritmo e a paciência desta civilização.',
    ],
  },
  {
    id: 'concurso-divino',
    title: 'O Concurso Divino',
    subtitle: 'Instituição cultural do Éden',
    shelf: 'universo',
    paragraphs: [
      'A cada cem anos do Éden acontece o Concurso Divino.',
      'Quem vence recebe vida infinita, escolhe um domínio e passa a integrar o panteão.',
      'É uma celebração pública, com cerimônia, anúncio e plateia — não uma disputa violenta.',
      'A próxima edição ainda não tem data confirmada em Aurora City. Quando houver, ela aparece no EdenFeed.',
    ],
  },
  {
    id: 'panteao',
    title: 'O panteão do Éden',
    subtitle: 'Quem cuida de quê',
    shelf: 'universo',
    paragraphs: [
      'Aérion criou o Éden Aero e caminha entre os seus.',
      'Luma responde pelo corpo e pela silhueta viva, incluindo o ecossistema Afters. Suki-Chan cuida da inteligência e da educação. Nexara governa a internet e as redes sociais. Lilly rege a música e a vibração. Akemi-Chan representa a cultura otaku e o fandom.',
      'Saturno defende os animais e é a primeira filha de Adão e Eva. Haru cuida da tecnologia e dos sistemas, incluindo o EdenOS, e é a primeira deusa autista do Éden. Maze responde pela natureza. Júpiter assina a arte e a criação estética.',
      'Amara é a Deusa da Maternidade: o cuidado com o que ainda está começando. Está grávida, e isso faz parte da identidade dela no cânone — não de uma fase.',
    ],
  },
  {
    id: 'aurora-city',
    title: 'Aurora City',
    subtitle: 'A metrópole central',
    shelf: 'cidades',
    paragraphs: [
      'Aurora City é o coração urbano do Éden Aero, inspirada em São Paulo e São Bernardo do Campo com estética Frutiger Aero.',
      'De dia: céu azul, vidro refletindo, iluminação aqua, muita água limpa e vegetação.',
      'À noite a cidade entra na Era Vice Éden: néon, pôr do sol rosa e violeta, água luminosa e vida noturna tropical futurista.',
    ],
  },
  {
    id: 'bitnara',
    title: 'Bitnara',
    subtitle: 'Capital do K-pop',
    shelf: 'cidades',
    paragraphs: [
      'Bitnara é a capital oficial do K-pop do Éden Aero, inspirada em Seul e na cultura coreana de entretenimento.',
      'Tem arenas de show, estúdios musicais, academias de dança, empresas de entretenimento, lojas, painéis digitais e ruas temáticas.',
      'Abertura oficial: 14 de novembro de 2026.',
      'A região ainda não é jogável nesta versão do EDENWORLD.',
    ],
  },
  {
    id: 'skystones',
    title: 'SkyStones',
    subtitle: 'Capital do rock',
    shelf: 'cidades',
    paragraphs: [
      'SkyStones é a capital do rock: casas de show grandes, distritos temáticos, estúdios de gravação, lojas de música, chão de festival e instalações artísticas.',
      'A identidade é deliberadamente diferente da de Bitnara — outra energia, outro público, mesmo amor pela música.',
      'A região ainda não é jogável nesta versão do EDENWORLD.',
    ],
  },
  {
    id: 'rosas-park',
    title: 'Rosas Park',
    subtitle: 'Região botânica e recreativa',
    shelf: 'cidades',
    paragraphs: [
      'Rosas Park reúne jardins de sakura, lagos, pontes, trilhas botânicas, cachoeiras, campos de flores e estruturas de cristal.',
      'É a região mais tranquila do Éden, pensada para descanso e contemplação, e guarda as referências de Rosas Park e Giovanni Breda em sua história local.',
      'A região ainda não é jogável nesta versão do EDENWORLD.',
    ],
  },
  {
    id: 'cidade-da-liberdade',
    title: 'Cidade da Liberdade',
    subtitle: 'Região cultural e criativa',
    shelf: 'cidades',
    paragraphs: [
      'Distritos de anime e mangá, centros de convenção, galerias de arte, comunidades criativas e instalações públicas.',
      'É a casa de Akemi-Chan e o palco natural da EdenCon.',
      'A região ainda não é jogável nesta versão do EDENWORLD.',
    ],
  },
  {
    id: 'noureja-nether',
    title: 'Noureja Nether',
    subtitle: 'A região de contraste',
    shelf: 'cidades',
    paragraphs: [
      'Noureja Nether é a região escura do Éden — misteriosa, sofisticada e arquitetonicamente distinta, e não um cyberpunk genérico.',
      'Vidro escuro, luz contrastante, vegetação própria, neblina atmosférica, áreas subterrâneas e comunidades de habitantes com cultura própria.',
      'A personagem Kling pertence a esta região e será preservada quando ela for construída.',
      'A região ainda não é jogável nesta versão do EDENWORLD.',
    ],
  },
  {
    id: 'jardim-proibido',
    title: 'Jardim Proibido',
    subtitle: 'Região natural e misteriosa',
    shelf: 'cidades',
    paragraphs: [
      'Vegetação densa, estruturas antigas, plantas bioluminescentes, caminhos escondidos, cachoeiras, monumentos naturais e vida selvagem.',
      'A região se liga diretamente a Saturno e ao cuidado com os animais do Éden.',
      'A região ainda não é jogável nesta versão do EDENWORLD.',
    ],
  },
  {
    id: 'edenos',
    title: 'EdenOS',
    subtitle: 'A infraestrutura digital viva',
    shelf: 'tecnologia',
    paragraphs: [
      'O EdenOS não é apenas um sistema operacional: é a infraestrutura digital central do Éden Aero.',
      'Ele conecta aparelhos, aplicativos, serviços e a vida cotidiana. No bolso do habitante, aparece como o EdenPhone.',
      'Nesta versão de Aurora City, os aplicativos sociais funcionam apenas neste aparelho: não há servidor, conta nem envio de dados.',
    ],
  },
  {
    id: 'afters-bet',
    title: 'Afters e a tecnologia BET',
    subtitle: 'Body Expansion Tech',
    shelf: 'tecnologia',
    paragraphs: [
      'Afters é a marca de tecnologia corporal do Éden Aero, assinada por Luma. BET significa Body Expansion Tech.',
      'A família reúne AfterBust®, AfterCurve®, GelGrow®, CandyGrow®, AfterLove e AfterVelvet — cada um com assinatura própria de luz, movimento e som.',
      'No EDENWORLD, a linha é representada como personalização estética: aura, brilho, partículas, cor e intensidade, com transição animada e desligamento manual.',
    ],
  },
  {
    id: 'bluebloom',
    title: 'Arquivo BlueBloom',
    subtitle: 'Evento histórico · investigação encerrada',
    shelf: 'historia',
    requiresFlag: 'sabe-bluebloom',
    paragraphs: [
      'A BlueBloom foi causada por uma corrupção envolvendo a tecnologia BET e por falhas no EdenOS e nos Afters.',
      'Aurora City foi a principal área afetada: interfaces florescendo sozinhas, auras presas em repetição e habitantes sem conseguir desligar os próprios efeitos.',
      'Haru e Nexara participaram da depuração: Nexara isolou a propagação pelas redes e Haru reescreveu as rotinas de estado dos Afters.',
      'A investigação alcançou a cura em 100%. Desde então, todo produto Afters tem desligamento manual obrigatório e todo estado visual é registrado.',
    ],
  },
];

export function libraryFor(hasFlag: (flag: string) => boolean): readonly LibraryDocument[] {
  return LIBRARY.filter((document) => !document.requiresFlag || hasFlag(document.requiresFlag));
}

export function getDocument(id: string): LibraryDocument | undefined {
  return LIBRARY.find((document) => document.id === id);
}
