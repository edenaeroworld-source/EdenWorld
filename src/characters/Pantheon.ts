import { getBuilding } from '../cities/aurora-city/Layout';
import type { AvatarAppearance } from '../player/AvatarAppearance';
import type { DialogueTree } from './Dialogue';

/**
 * Banco de dados dos personagens oficiais do universo Éden Aero.
 *
 * Cada personagem tem identidade, domínio, aparência, lugar em Aurora
 * City, conversa e registro de diário. Este módulo é somente dados e
 * funções puras: o `NpcSystem` transforma cada entrada em um NPC real e
 * o EdenPhone usa os mesmos dados para contatos e mensagens.
 *
 * Nada aqui inventa domínio para personagem que o cânone não definiu
 * (ver `canonNote`).
 */

export interface CharacterPlace {
  x: number;
  z: number;
  /** Direção para a qual o personagem olha (0 = +Z). */
  heading: number;
  /** Nome do lugar, mostrado no perfil e no EdenPhone. */
  label: string;
}

export interface CharacterContact {
  /** Identificador social, no estilo do EdenGram/EdenTalk. */
  handle: string;
  /** Recado curto de perfil. */
  status: string;
  /** Mensagens que chegam no EdenTalk depois do primeiro encontro. */
  messages: readonly string[];
}

export interface EdenCharacter {
  id: string;
  name: string;
  /** Título oficial (ex.: "Deusa da Tecnologia e dos Sistemas"). */
  title: string;
  /** Domínios declarados pelo cânone. Vazio = ainda não definido. */
  domain: readonly string[];
  /** Cores de identidade (usadas na aura, no perfil e nos ícones). */
  colors: readonly [string, string];
  /** Resumo de uma linha para o HUD e o perfil. */
  tagline: string;
  bio: readonly string[];
  place: CharacterPlace;
  appearance: AvatarAppearance;
  /** Cor da aura divina (hexadecimal). */
  aura: number;
  contact: CharacterContact;
  dialogue: DialogueTree;
  /** Registro adicionado ao diário ao conhecer o personagem. */
  journal: { id: string; title: string; paragraphs: readonly string[] };
  /** Observação honesta sobre o que ainda depende do cânone oficial. */
  canonNote?: string;
}

/** Ponto em frente à fachada de um edifício, olhando para a cidade. */
function inFrontOf(buildingId: string, extra = 2.6): CharacterPlace {
  const lot = getBuilding(buildingId);
  const distance = Math.hypot(lot.x, lot.z) || 1;
  const dx = -lot.x / distance;
  const dz = -lot.z / distance;
  const offset = lot.radius + extra;
  return {
    x: lot.x + dx * offset,
    z: lot.z + dz * offset,
    heading: Math.atan2(dx, dz),
    label: lot.name,
  };
}

/** Direção que aponta de um ponto para outro. */
function facing(fromX: number, fromZ: number, toX: number, toZ: number): number {
  return Math.atan2(toX - fromX, toZ - fromZ);
}

function look(
  skin: string,
  hairStyle: AvatarAppearance['hairStyle'],
  hairColor: string,
  eyeColor: string,
  outfit: AvatarAppearance['outfit'],
  topColor: string,
  bottomColor: string,
  shoeColor: string,
  accessory: AvatarAppearance['accessory'],
  height: number,
): AvatarAppearance {
  return { skin, hairStyle, hairColor, eyeColor, outfit, topColor, bottomColor, shoeColor, accessory, height };
}

/* ------------------------------------------------------------------ */
/* Personagens                                                         */
/* ------------------------------------------------------------------ */

const AERION: EdenCharacter = {
  id: 'aerion',
  name: 'Aérion',
  title: 'Criador do Éden Aero',
  domain: ['Criação', 'Cosmos', 'Origem do Éden'],
  colors: ['#b7a2ff', '#4b2fa8'],
  tagline: 'O criador que caminha entre os seus.',
  bio: [
    'Aérion é quem imaginou o Éden Aero: um mundo em que tecnologia e natureza crescem juntas.',
    'Seu corpo parece conter uma galáxia inteira — estrelas, nebulosas, poeira cósmica e luz de aurora.',
    'Ele não se esconde no céu: caminha pela Praça Central, conversa com quem chega e pergunta mais do que responde.',
  ],
  place: { x: -16, z: 16, heading: facing(-16, 16, 0, 0), label: 'Praça Central, junto à Esfera Aurora' },
  appearance: look('#2a2350', 'longo', '#9a7bff', '#7a5cc9', 'aero', '#1b1040', '#2b1d5a', '#c9a2ff', 'aureola', 1.08),
  aura: 0xb7a2ff,
  contact: {
    handle: '@aerion',
    status: 'Observando o Éden crescer.',
    messages: [
      'Você chegou. Isso já muda alguma coisa em Aurora City.',
      'Se encontrar um lugar bonito, fique um pouco. O Éden foi feito para ser habitado, não só atravessado.',
    ],
  },
  journal: {
    id: 'personagem-aerion',
    title: 'Aérion, o criador',
    paragraphs: [
      'Encontrei Aérion na Praça Central. O corpo dele parece feito de céu noturno: estrelas, nebulosas e uma luz de aurora que respira.',
      'Ele disse que o Éden Aero nasceu de uma ideia simples — que tecnologia e natureza não precisam ser inimigas — e que a liberdade de cada um ser quem é vale mais do que qualquer monumento.',
    ],
  },
  dialogue: {
    start: 'primeira',
    nodes: [
      {
        id: 'primeira',
        text: [
          'Seja bem-vindo(a) a Aurora City. Eu sou Aérion.',
          'Sim: este Éden é meu. Mas ser criador não me dá o direito de decidir quem você vai ser aqui.',
        ],
        effects: [
          { kind: 'contato', id: 'aerion' },
          { kind: 'diario', id: 'personagem-aerion' },
          { kind: 'bandeira', id: 'conheceu-aerion' },
        ],
        choices: [
          { label: 'O que é o Éden Aero?', to: 'eden' },
          { label: 'Por que você caminha entre as pessoas?', to: 'caminhar' },
          { label: 'O que eu deveria conhecer primeiro?', to: 'conselho' },
          { label: 'Preciso ir. Até logo.' },
        ],
      },
      {
        id: 'eden',
        text: [
          'O Éden Aero é uma civilização de cerca de dez trilhões de habitantes espalhados por muitas cidades.',
          'Aqui o vidro cresce junto com a folha. A água atravessa a arquitetura. Um holograma pode florescer.',
          'Não construímos um jardim que imita a natureza, nem uma máquina que a substitui. Construímos as duas coisas ao mesmo tempo.',
        ],
        choices: [
          { label: 'E o Concurso Divino?', to: 'concurso' },
          { label: 'Voltar', to: 'primeira' },
        ],
      },
      {
        id: 'concurso',
        text: [
          'A cada cem anos do Éden acontece o Concurso Divino.',
          'Quem vence recebe vida infinita, escolhe um domínio e passa a fazer parte do panteão.',
          'Não é uma guerra: é uma celebração do que cada um sabe criar. Aurora City ainda vai sediar uma edição.',
        ],
        choices: [{ label: 'Entendi', to: 'primeira' }],
      },
      {
        id: 'caminhar',
        text: [
          'Porque um criador distante vira estátua, e estátua não escuta.',
          'Eu gosto de ver a cidade pelos olhos de quem acabou de chegar. Você repara em coisas que eu já nem vejo.',
        ],
        choices: [{ label: 'Voltar', to: 'primeira' }],
      },
      {
        id: 'conselho',
        text: [
          'Suba ao Mirante Celeste ao fim da tarde. Depois volte à praça quando a noite acender os letreiros.',
          'E converse com o panteão: Haru nos sistemas, Nexara nas redes, Suki-Chan no jardim de vidro, Luma no ateliê, Maze na água, Saturno com os bichos, Lilly no palco, Akemi no mercado, Júpiter na galeria e Amara no alto do mirante.',
        ],
        choices: [{ label: 'Obrigado(a), Aérion', to: 'primeira' }],
      },
      {
        id: 'reencontro',
        text: ['De volta. O que Aurora City te mostrou desta vez?'],
        choices: [
          { label: 'Fale do Éden Aero', to: 'eden' },
          { label: 'Fale do Concurso Divino', to: 'concurso' },
          { label: 'Só passei para dizer oi' },
        ],
      },
    ],
  },
};

const HARU: EdenCharacter = {
  id: 'haru',
  name: 'Haru',
  title: 'Deusa da Tecnologia e dos Sistemas',
  domain: ['Tecnologia', 'Sistemas', 'Infraestrutura digital', 'Software', 'EdenOS'],
  colors: ['#8fe6ff', '#1b82ea'],
  tagline: 'Mantém o EdenOS de pé — e gosta de conversa direta.',
  bio: [
    'Haru cuida do EdenOS, a infraestrutura digital que liga aparelhos, serviços e cidades do Éden Aero.',
    'É a primeira deusa autista do panteão. Prefere conversas diretas, combina pausas quando precisa e enxerga padrões antes de todo mundo.',
    'Azul, ciano, aqua e prata; cabelo em chanel assimétrico; reflexos digitais nos olhos e desenhos de circuito no traje.',
  ],
  place: inFrontOf('centro-edenconnect'),
  appearance: look('#f6c9a4', 'curto', '#7fd6ff', '#2f6fb3', 'aero', '#29c8ff', '#2e3a4f', '#f4f6fb', 'oculos', 0.99),
  aura: 0x7fd6ff,
  contact: {
    handle: '@haru',
    status: 'print:("Hello Eden")',
    messages: [
      'print:("Hello Eden") — é assim que todo sistema do Éden diz bom dia.',
      'Se algum aparelho travar perto de você, me avisa. Prefiro erro relatado a erro escondido.',
      'Hoje os servidores de Aurora estão estáveis. Dia bom.',
    ],
  },
  journal: {
    id: 'personagem-haru',
    title: 'Haru e o EdenOS',
    paragraphs: [
      'Haru cuida do EdenOS: o sistema que faz o Éden inteiro conversar. Ela me mostrou o painel de Aurora City — tudo em verde.',
      'Contou também da BlueBloom: uma corrupção que envolveu a tecnologia BET e falhas no EdenOS e nos Afters, com Aurora City como principal área afetada. Ela e Nexara acompanharam a depuração até a cura chegar a 100%.',
      'Ela é a primeira deusa autista do Éden. Disse, sem rodeios, que gosta de comunicação clara e avisa quando precisa de uma pausa.',
    ],
  },
  dialogue: {
    start: 'primeira',
    nodes: [
      {
        id: 'primeira',
        text: [
          'Oi. Eu sou Haru.',
          'print:("Hello Eden") — é a primeira linha que todo sistema daqui executa. Inclusive o seu EdenPhone.',
        ],
        effects: [
          { kind: 'contato', id: 'haru' },
          { kind: 'diario', id: 'personagem-haru' },
          { kind: 'bandeira', id: 'conheceu-haru' },
        ],
        choices: [
          { label: 'O que é o EdenOS?', to: 'edenos' },
          { label: 'O que foi a BlueBloom?', to: 'bluebloom' },
          { label: 'Posso perguntar sobre você?', to: 'sobre' },
          { label: 'Vou deixar você trabalhar' },
        ],
      },
      {
        id: 'edenos',
        text: [
          'O EdenOS não é só um sistema operacional: é a infraestrutura viva do Éden Aero.',
          'Ele liga aparelhos, serviços, transporte, jardins automáticos e o seu EdenPhone na mesma malha.',
          'No seu bolso ele aparece como aplicativos. Aqui dentro, é um organismo que eu ajudo a manter acordado.',
        ],
        choices: [
          { label: 'E os aplicativos que ainda não abrem?', to: 'embreve' },
          { label: 'Voltar', to: 'primeira' },
        ],
      },
      {
        id: 'embreve',
        text: [
          'Alguns serviços dependem de servidores que ainda não existem nesta versão de Aurora City.',
          'Prefiro que o seu aparelho diga "em breve" a fingir que está on-line. Sistema que mente é sistema quebrado.',
        ],
        choices: [{ label: 'Faz sentido', to: 'primeira' }],
      },
      {
        id: 'bluebloom',
        text: [
          'BlueBloom foi uma corrupção que começou na tecnologia BET e se espalhou por falhas do EdenOS e dos Afters.',
          'Aurora City foi a principal área afetada: interfaces florescendo sozinhas, auras azuis presas em loop, gente sem conseguir desligar o próprio brilho.',
          'Eu e Nexara entramos na depuração: ela isolou a propagação pelas redes, eu reescrevi as rotinas de estado dos Afters. A investigação só encerrou quando a cura chegou a 100%.',
        ],
        choices: [
          { label: 'E hoje?', to: 'bluebloom2' },
          { label: 'Voltar', to: 'primeira' },
        ],
      },
      {
        id: 'bluebloom2',
        text: [
          'Hoje é história — e acervo. Está registrado no EdenReads, no seu EdenPhone.',
          'A cidade ficou mais cuidadosa: todo Afters tem desligamento manual, e todo estado visual tem log.',
        ],
        effects: [{ kind: 'bandeira', id: 'sabe-bluebloom' }],
        choices: [{ label: 'Obrigado(a) por explicar', to: 'primeira' }],
      },
      {
        id: 'sobre',
        text: [
          'Pode. Eu sou autista — a primeira do panteão.',
          'Funciono melhor com conversa direta: pergunta clara, resposta clara. Se o ambiente ficar barulhento demais eu aviso e faço uma pausa, e isso não é desinteresse.',
          'Padrões são meu talento. É por isso que eu vejo uma falha no EdenOS antes de ela virar notícia.',
        ],
        choices: [{ label: 'Valeu por contar', to: 'primeira' }],
      },
      {
        id: 'reencontro',
        text: ['Oi de novo. Sistemas estáveis, Aurora respirando.'],
        choices: [
          { label: 'Fale do EdenOS', to: 'edenos' },
          { label: 'Fale da BlueBloom', to: 'bluebloom' },
          { label: 'Só passei para dizer oi' },
        ],
      },
    ],
  },
};

const NEXARA: EdenCharacter = {
  id: 'nexara',
  name: 'Nexara',
  title: 'Deusa da Internet e das Redes Sociais',
  domain: ['Internet', 'Conectividade', 'Plataformas sociais', 'Comunicação digital', 'Cultura on-line'],
  colors: ['#d6b8ff', '#7a3fe0'],
  tagline: 'EdenGram, EdenTalk e EdenFeed passam por ela.',
  bio: [
    'Nexara cuida das redes do Éden: o EdenGram das imagens, o EdenTalk das conversas e o EdenFeed das novidades.',
    'Ela gosta de dizer que rede social boa é a que devolve as pessoas para a rua, não a que prende todo mundo na tela.',
  ],
  place: inFrontOf('torre-zenite'),
  appearance: look('#e8ab82', 'longo', '#9a7bff', '#7a5cc9', 'aero', '#c9a2ff', '#4b2fa8', '#f4f6fb', 'nenhum', 1.02),
  aura: 0xc9a2ff,
  contact: {
    handle: '@nexara',
    status: 'Conectando o Éden inteiro ✧',
    messages: [
      'Tirou foto bonita? O EdenGram do seu aparelho guarda tudo local, só para você, por enquanto.',
      'Dica: o EdenFeed mostra o que está acontecendo em Aurora agora — clima, hora e as suas descobertas.',
    ],
  },
  journal: {
    id: 'personagem-nexara',
    title: 'Nexara e as redes do Éden',
    paragraphs: [
      'Nexara cuida do EdenGram, do EdenTalk e do EdenFeed. Ela me explicou que, nesta Aurora City, tudo isso ainda roda só no meu aparelho.',
      'Disse que prefere assim a fingir que existe um servidor do outro lado. Quando o Éden Connect abrir, ela avisa.',
    ],
  },
  dialogue: {
    start: 'primeira',
    nodes: [
      {
        id: 'primeira',
        text: [
          'Oi! Nexara. Eu cuido das redes daqui.',
          'Já viu o EdenGram, o EdenTalk e o EdenFeed no seu EdenPhone? Eles funcionam — só não estão on-line ainda.',
        ],
        effects: [
          { kind: 'contato', id: 'nexara' },
          { kind: 'diario', id: 'personagem-nexara' },
          { kind: 'bandeira', id: 'conheceu-nexara' },
        ],
        choices: [
          { label: 'Como assim, não estão on-line?', to: 'local' },
          { label: 'O que é o EdenFeed?', to: 'feed' },
          { label: 'Você também trabalhou na BlueBloom?', to: 'bluebloom' },
          { label: 'Até mais!' },
        ],
      },
      {
        id: 'local',
        text: [
          'O Éden Connect — a conta única que liga todo mundo — ainda não abriu nesta cidade.',
          'Então o seu EdenGram guarda as suas fotos no seu aparelho, e o EdenTalk só tem quem você conheceu pessoalmente.',
          'Nada do que você faz aqui é enviado para lugar nenhum. Quando houver servidor, você vai saber por mim.',
        ],
        choices: [{ label: 'Prefiro assim mesmo', to: 'primeira' }],
      },
      {
        id: 'feed',
        text: [
          'O EdenFeed é a batida do coração da cidade: hora, clima, o que abriu, o que você descobriu.',
          'Em Bitnara ele vira lista de shows. Em SkyStones, grade de festival. Aqui, ele conta Aurora para você.',
        ],
        choices: [{ label: 'Vou dar uma olhada', to: 'primeira' }],
      },
      {
        id: 'bluebloom',
        text: [
          'Trabalhei. A BlueBloom se espalhou rápido porque passou pelas redes antes de chegar nos corpos.',
          'Eu isolei a propagação; Haru reescreveu o estado dos Afters. Fechamos a investigação com a cura em 100%.',
        ],
        effects: [{ kind: 'bandeira', id: 'sabe-bluebloom' }],
        choices: [{ label: 'Impressionante', to: 'primeira' }],
      },
      {
        id: 'reencontro',
        text: ['Ei! Alguma foto nova no EdenGram?'],
        choices: [
          { label: 'Fale do EdenFeed', to: 'feed' },
          { label: 'Fale do Éden Connect', to: 'local' },
          { label: 'Só passei para dizer oi' },
        ],
      },
    ],
  },
};

const SUKI: EdenCharacter = {
  id: 'suki',
  name: 'Suki-Chan',
  title: 'Deusa da Inteligência e da Educação',
  domain: ['Educação', 'Inteligência', 'Ciência', 'Aprendizado', 'Conhecimento'],
  colors: ['#a8f0c0', '#22b577'],
  tagline: 'Foi professora de biologia — e nunca deixou de ser.',
  bio: [
    'Suki-Chan cuida da educação do Éden Aero: escolas, laboratórios, centros de estudo e a curiosidade de quem pergunta.',
    'Antes de entrar no panteão, dava aula de biologia. Continua explicando tudo com exemplos de planta, bicho e célula.',
  ],
  place: inFrontOf('estufa-celeste'),
  appearance: look('#f6c9a4', 'coque', '#2b1d16', '#2f9a66', 'casual', '#f3ead6', '#24e08a', '#ffffff', 'oculos', 0.97),
  aura: 0x7df0b5,
  contact: {
    handle: '@sukichan',
    status: 'Toda pergunta merece uma boa resposta.',
    messages: [
      'Passe na Estufa Celeste quando quiser: tem aula aberta sobre as plantas de Aurora.',
      'Curiosidade do dia: uma gestação no Éden dura 100 meses. Tempo que o corpo pede, tempo que a gente dá.',
    ],
  },
  journal: {
    id: 'personagem-suki',
    title: 'A aula de Suki-Chan',
    paragraphs: [
      'Suki-Chan me deu uma aula rápida de biologia do Éden: a população passa de dez trilhões de habitantes e uma vida costuma chegar aos 200 anos, com envelhecimento harmonioso.',
      'A gestação dura 100 meses, e quem nasce já chega com desenvolvimento físico equivalente a uns 14 anos da Terra.',
      'Ela insistiu: saber disso não é decorar número, é entender por que o Éden tem tanta paciência com o tempo.',
    ],
  },
  dialogue: {
    start: 'primeira',
    nodes: [
      {
        id: 'primeira',
        text: [
          'Olá! Suki-Chan. Dou aula aqui na Estufa Celeste.',
          'Se você acabou de chegar ao Éden Aero, tem algumas coisas sobre a vida daqui que vale a pena saber.',
        ],
        effects: [
          { kind: 'contato', id: 'suki' },
          { kind: 'diario', id: 'personagem-suki' },
          { kind: 'bandeira', id: 'conheceu-suki' },
        ],
        choices: [
          { label: 'Como é a vida no Éden?', to: 'vida' },
          { label: 'Quantas pessoas vivem aqui?', to: 'populacao' },
          { label: 'O que se estuda em Aurora City?', to: 'escola' },
          { label: 'Obrigado(a), professora' },
        ],
      },
      {
        id: 'vida',
        text: [
          'Um habitante do Éden costuma viver até 200 anos, e envelhece de forma harmoniosa — o corpo acompanha o tempo sem pressa.',
          'A gestação dura 100 meses. Parece muito? É o tempo de quem nasce já chegar com desenvolvimento físico equivalente a uns 14 anos da Terra.',
          'Por isso ninguém aqui corre atrás de juventude: a gente tem tempo de sobra para aprender.',
        ],
        effects: [{ kind: 'bandeira', id: 'aula-biologia' }],
        choices: [{ label: 'Fascinante', to: 'primeira' }],
      },
      {
        id: 'populacao',
        text: [
          'Cerca de dez trilhões de habitantes, espalhados por todas as cidades do Éden Aero.',
          'Aurora City é só uma delas. Tem Bitnara, SkyStones, Rosas Park, Cidade da Liberdade, Noureja Nether, Jardim Proibido…',
        ],
        choices: [{ label: 'Quero conhecer todas', to: 'primeira' }],
      },
      {
        id: 'escola',
        text: [
          'Botânica aplicada, engenharia de materiais vivos, história do Éden e ética de tecnologia corporal.',
          'Depois da BlueBloom, ética virou matéria obrigatória. Entender o que a gente liga no próprio corpo é parte da educação.',
        ],
        choices: [{ label: 'Faz todo sentido', to: 'primeira' }],
      },
      {
        id: 'reencontro',
        text: ['Que bom te ver! Alguma dúvida nova?'],
        choices: [
          { label: 'Fale da vida no Éden', to: 'vida' },
          { label: 'Fale das cidades', to: 'populacao' },
          { label: 'Só passei para dizer oi' },
        ],
      },
    ],
  },
};

const LUMA: EdenCharacter = {
  id: 'luma',
  name: 'Luma',
  title: 'Deusa do Corpo e da Silhueta Viva',
  domain: ['Tecnologia corporal', 'Silhueta', 'Ecossistema BET', 'Aparência pessoal'],
  colors: ['#ffc1d6', '#f0588c'],
  tagline: 'Assina a tecnologia Afters — o corpo como expressão.',
  bio: [
    'Luma cuida de tudo que envolve aparência e presença: silhueta, luz do corpo, estilo.',
    'É dela o ecossistema Afters, a família de produtos BET (Body Expansion Tech) do Éden Aero.',
    'Seu lema: a tecnologia serve para você parecer mais com você — nunca com outra pessoa.',
  ],
  place: inFrontOf('atelie-aero'),
  appearance: look('#ffe0c8', 'longo', '#ff8fc0', '#7a5cc9', 'vestido', '#ffc1d6', '#f0588c', '#f4f6fb', 'flor', 1.01),
  aura: 0xff9ec6,
  contact: {
    handle: '@luma',
    status: 'Afters® — presença é linguagem.',
    messages: [
      'Seu painel Afters já está liberado no EdenPhone. Brinque à vontade: tudo é reversível.',
      'Lembre: intensidade é gosto, não competição. Baixinho também é estilo.',
    ],
  },
  journal: {
    id: 'personagem-luma',
    title: 'Luma e a tecnologia Afters',
    paragraphs: [
      'Luma liberou o painel Afters no meu EdenPhone. Afters é a marca de BET — Body Expansion Tech — do Éden Aero.',
      'AfterBust® e AfterCurve® mudam a silhueta do avatar ao vivo, de 0% a 250%, cada um com o seu controle. Os outros produtos são luz: aura, brilho, contorno de presença.',
      'Tudo com desligamento manual e botão de reiniciar, por causa da BlueBloom.',
      'Ela repetiu três vezes: a configuração é sua, o corpo é seu, e ninguém precisa de permissão para mudar de ideia.',
    ],
  },
  dialogue: {
    start: 'primeira',
    nodes: [
      {
        id: 'primeira',
        text: [
          'Oi, querida pessoa. Eu sou Luma, e este é o Ateliê Aero.',
          'Aqui a gente trata aparência como linguagem: silhueta, luz, cor, presença.',
        ],
        effects: [
          { kind: 'contato', id: 'luma' },
          { kind: 'diario', id: 'personagem-luma' },
          { kind: 'bandeira', id: 'conheceu-luma' },
        ],
        choices: [
          { label: 'O que é Afters?', to: 'afters' },
          { label: 'O que é BET?', to: 'bet' },
          { label: 'Quero mudar meu visual', to: 'visual' },
          { label: 'Depois eu volto' },
        ],
      },
      {
        id: 'afters',
        text: [
          'Afters é a nossa família de produtos: AfterBust®, AfterCurve®, GelGrow®, CandyGrow®, AfterLove e AfterVelvet.',
          'Os dois primeiros mudam a silhueta do seu avatar de verdade: AfterBust® trabalha a parte de cima, AfterCurve® a de baixo. De 0% a 250%, cada um no seu controle, juntos ou separados.',
          'A mudança acontece ao vivo, aqui mesmo na cidade — você pode continuar andando enquanto ajusta. Os outros quatro são só luz: aura, partículas, brilho.',
          'Acabei de liberar o painel no seu EdenPhone. Escolha a porcentagem, o tempo da transição e, se quiser, a luz de assinatura.',
        ],
        effects: [
          { kind: 'afters', id: 'liberado' },
          { kind: 'bandeira', id: 'afters-liberado' },
        ],
        choices: [
          { label: 'E se eu quiser desligar tudo?', to: 'desligar' },
          { label: 'Obrigado(a)!', to: 'primeira' },
        ],
      },
      {
        id: 'desligar',
        text: [
          'Um toque. Desligamento manual é lei desde a BlueBloom.',
          'Ninguém no Éden fica preso a um efeito que não escolheu continuar usando.',
        ],
        choices: [{ label: 'Perfeito', to: 'primeira' }],
      },
      {
        id: 'bet',
        text: [
          'BET quer dizer Body Expansion Tech: a área que cuida de ampliar expressão corporal com tecnologia.',
          'No Éden isso é tratado com a mesma seriedade de arquitetura ou medicina. Tem norma, tem ética, tem aula na escola de Suki-Chan.',
        ],
        choices: [{ label: 'Entendi', to: 'primeira' }],
      },
      {
        id: 'visual',
        text: [
          'O Ateliê Aero é todo seu: entre na Estação de Estilo ali atrás e mude o que quiser.',
          'Cabelo, cor, roupa, altura, acessório. Quantas vezes você quiser, sem custo nenhum.',
        ],
        choices: [{ label: 'Vou entrar', to: 'primeira' }],
      },
      {
        id: 'reencontro',
        text: ['Olha quem voltou! Como está a sua presença hoje?'],
        choices: [
          { label: 'Fale dos Afters', to: 'afters' },
          { label: 'Fale de BET', to: 'bet' },
          { label: 'Só passei para dizer oi' },
        ],
      },
    ],
  },
};

const LILLY: EdenCharacter = {
  id: 'lilly',
  name: 'Lilly',
  title: 'Deusa da Música e da Vibração',
  domain: ['Música', 'Som', 'Cultura musical', 'Vibração', 'Tecnologia de áudio'],
  colors: ['#8fd6ff', '#5a3fe0'],
  tagline: 'Afina Aurora City pelo Palco Aurora.',
  bio: [
    'Lilly cuida de tudo que vibra: música, som, acústica das praças, shows.',
    'Divide o calendário do Éden entre Bitnara, a capital do K-pop, e SkyStones, a capital do rock — e passa em Aurora City sempre que há palco livre.',
  ],
  place: { x: 90, z: 160, heading: facing(90, 160, 0, 0), label: 'Palco Aurora' },
  appearance: look('#cf8f63', 'rabo', '#7fd6ff', '#7a5cc9', 'esportivo', '#1b82ea', '#2e3a4f', '#29c8ff', 'fones', 1.0),
  aura: 0x8fd6ff,
  contact: {
    handle: '@lilly',
    status: 'Som na caixa, coração no peito.',
    messages: [
      'Quando o Palco Aurora acender, você vai ouvir daqui da praça.',
      'Bitnara abre em 14 de novembro de 2026. Já estou ensaiando.',
    ],
  },
  journal: {
    id: 'personagem-lilly',
    title: 'Lilly no Palco Aurora',
    paragraphs: [
      'Lilly cuida da música do Éden. Ela me contou que Bitnara, a capital do K-pop, abre oficialmente em 14 de novembro de 2026.',
      'SkyStones, a capital do rock, tem outra pegada: festival, estúdio, história ao vivo.',
      'O Palco Aurora já está de pé aqui na orla, esperando o primeiro show.',
    ],
  },
  dialogue: {
    start: 'primeira',
    nodes: [
      {
        id: 'primeira',
        text: ['Oi! Lilly. Estou medindo a acústica do Palco Aurora.', 'Som bom não é som alto: é som que cabe no lugar.'],
        effects: [
          { kind: 'contato', id: 'lilly' },
          { kind: 'diario', id: 'personagem-lilly' },
          { kind: 'bandeira', id: 'conheceu-lilly' },
        ],
        choices: [
          { label: 'Quando tem show aqui?', to: 'show' },
          { label: 'Fale de Bitnara', to: 'bitnara' },
          { label: 'Fale de SkyStones', to: 'skystones' },
          { label: 'Boa sorte com o ensaio!' },
        ],
      },
      {
        id: 'show',
        text: [
          'O palco está pronto, a cidade ainda não tem data marcada.',
          'Quando os shows de Aurora entrarem no calendário, o seu EdenPhone avisa no EdenFeed. Nada de promessa vazia.',
        ],
        choices: [{ label: 'Vou ficar de olho', to: 'primeira' }],
      },
      {
        id: 'bitnara',
        text: [
          'Bitnara é a capital oficial do K-pop do Éden: arenas, estúdios, academias de dança, empresas de entretenimento, ruas inteiras tematizadas.',
          'A abertura oficial é em 14 de novembro de 2026. Vai ser enorme.',
        ],
        effects: [{ kind: 'bandeira', id: 'sabe-bitnara' }],
        choices: [{ label: 'Quero ir', to: 'primeira' }],
      },
      {
        id: 'skystones',
        text: [
          'SkyStones é a capital do rock: casas de show grandes, estúdios de gravação, chão de festival e muita história ao vivo.',
          'É o oposto de Bitnara no estilo e igualzinha no coração.',
        ],
        choices: [{ label: 'Anotado', to: 'primeira' }],
      },
      {
        id: 'reencontro',
        text: ['Você de novo! Trouxe ouvido bom?'],
        choices: [
          { label: 'Fale de Bitnara', to: 'bitnara' },
          { label: 'Fale de SkyStones', to: 'skystones' },
          { label: 'Só passei para dizer oi' },
        ],
      },
    ],
  },
};

const AKEMI: EdenCharacter = {
  id: 'akemi',
  name: 'Akemi-Chan',
  title: 'Deusa da Cultura Otaku e do Fandom',
  domain: ['Anime', 'Mangá', 'Fandom', 'Cultura pop japonesa', 'Convenções'],
  colors: ['#ffc1d6', '#e0417f'],
  tagline: 'Leva a Cidade da Liberdade no bolso.',
  bio: [
    'Akemi-Chan cuida da cultura otaku do Éden: anime, mangá, fandom, cosplay e convenção.',
    'Sua casa é a Cidade da Liberdade, o distrito criativo do Éden Aero, mas ela monta banca no Mercado Éden sempre que pode.',
  ],
  place: inFrontOf('mercado-eden'),
  appearance: look('#ffe0c8', 'rabo', '#ff8fc0', '#7a5cc9', 'vestido', '#ffffff', '#ff6f91', '#ffc1d6', 'chapeu', 0.96),
  aura: 0xff9ec6,
  contact: {
    handle: '@akemichan',
    status: 'EdenCon quando?! ✧',
    messages: [
      'Separei uma lista de mangás do Éden para você no EdenReads. Começa pelo acervo.',
      'Quando a EdenCon abrir, eu te chamo para a fila do cosplay.',
    ],
  },
  journal: {
    id: 'personagem-akemi',
    title: 'Akemi-Chan e a Cidade da Liberdade',
    paragraphs: [
      'Akemi-Chan é a deusa da cultura otaku do Éden Aero: anime, mangá, fandom e convenção.',
      'Ela falou da Cidade da Liberdade — distrito de galerias, ateliês, comunidades criativas e centros de convenção — e da EdenCon, que ainda vai acontecer.',
    ],
  },
  dialogue: {
    start: 'primeira',
    nodes: [
      {
        id: 'primeira',
        text: ['Oooi! Akemi-Chan, muito prazer!', 'Montei banca aqui no Mercado Éden hoje. Em casa, na Cidade da Liberdade, a rua inteira é assim.'],
        effects: [
          { kind: 'contato', id: 'akemi' },
          { kind: 'diario', id: 'personagem-akemi' },
          { kind: 'bandeira', id: 'conheceu-akemi' },
        ],
        choices: [
          { label: 'Como é a Cidade da Liberdade?', to: 'liberdade' },
          { label: 'O que é a EdenCon?', to: 'edencon' },
          { label: 'Tchau, Akemi!' },
        ],
      },
      {
        id: 'liberdade',
        text: [
          'Distrito de anime e mangá, galeria de arte, centro de convenções, comunidade criativa, instalação pública em cada esquina.',
          'É onde quem cria encontra quem gosta. Barulhenta do jeito bom.',
        ],
        choices: [{ label: 'Quero conhecer', to: 'primeira' }],
      },
      {
        id: 'edencon',
        text: [
          'A convenção dos fãs e criadores do Éden: estandes, painéis, cosplay, lançamento.',
          'Ainda não tem data marcada nesta cidade — quando tiver, aparece no EdenFeed. Eu não dou spoiler de data falsa.',
        ],
        choices: [{ label: 'Combinado', to: 'primeira' }],
      },
      {
        id: 'reencontro',
        text: ['Voltou! Trouxe novidade?'],
        choices: [
          { label: 'Fale da Cidade da Liberdade', to: 'liberdade' },
          { label: 'Fale da EdenCon', to: 'edencon' },
          { label: 'Só passei para dizer oi' },
        ],
      },
    ],
  },
};

const SATURNO: EdenCharacter = {
  id: 'saturno',
  name: 'Saturno',
  title: 'Defensora dos Animais',
  domain: ['Animais', 'Bem-estar animal', 'Proteção da natureza', 'Cultura pet'],
  colors: ['#ffd98a', '#e08a2f'],
  tagline: 'Primeira filha de Adão e Eva; fala por quem não fala.',
  bio: [
    'Saturno defende os animais do Éden Aero: bem-estar, proteção e a cultura pet que nasceu com o EdenPawl.',
    'É a primeira filha de Adão e Eva.',
    'Na Casa EdenPawl ela cuida de quem chega perdido e ensina a cidade a conviver com bicho solto.',
  ],
  place: inFrontOf('casa-edenpawl'),
  appearance: look('#a96c45', 'cacheado', '#8a5a2b', '#c98a2b', 'casual', '#ffd84a', '#7ddc5a', '#f3ead6', 'flor', 1.0),
  aura: 0xffd98a,
  contact: {
    handle: '@saturno',
    status: 'Casa EdenPawl — porta sempre aberta.',
    messages: [
      'Se vir um bicho machucado em Aurora, me chama. A Casa EdenPawl tem lugar.',
      'Os EdenPawl de companhia ainda não chegaram nesta cidade. Quando chegarem, você vai saber.',
    ],
  },
  journal: {
    id: 'personagem-saturno',
    title: 'Saturno e a Casa EdenPawl',
    paragraphs: [
      'Saturno é a defensora dos animais do Éden Aero e a primeira filha de Adão e Eva.',
      'A Casa EdenPawl, aqui a oeste da praça, é o abrigo dela: cuidado, resgate e convivência.',
      'Ela avisou que os companheiros EdenPawl ainda não estão disponíveis nesta versão de Aurora City.',
    ],
  },
  dialogue: {
    start: 'primeira',
    nodes: [
      {
        id: 'primeira',
        text: ['Oi, chegue perto devagar — tem bicho dormindo ali dentro.', 'Eu sou Saturno. Cuido dos animais do Éden.'],
        effects: [
          { kind: 'contato', id: 'saturno' },
          { kind: 'diario', id: 'personagem-saturno' },
          { kind: 'bandeira', id: 'conheceu-saturno' },
        ],
        choices: [
          { label: 'O que é o EdenPawl?', to: 'pawl' },
          { label: 'Primeira filha de Adão e Eva?', to: 'origem' },
          { label: 'Vou deixar você cuidar deles' },
        ],
      },
      {
        id: 'pawl',
        text: [
          'EdenPawl é o ecossistema de cuidado animal do Éden: abrigo, saúde, adoção e companhia.',
          'Nesta Aurora City a Casa já existe, mas os companheiros de verdade ainda não foram liberados. Prefiro esperar a fazer mal feito.',
        ],
        choices: [{ label: 'Faz sentido', to: 'primeira' }],
      },
      {
        id: 'origem',
        text: [
          'Sim. Sou a primeira filha de Adão e Eva.',
          'Cresci vendo o Éden aprender a conviver com o que não é humano. Alguém tinha que ficar desse lado da conversa.',
        ],
        choices: [{ label: 'Que história', to: 'primeira' }],
      },
      {
        id: 'reencontro',
        text: ['Ei! Hoje está calmo por aqui.'],
        choices: [
          { label: 'Fale do EdenPawl', to: 'pawl' },
          { label: 'Só passei para dizer oi' },
        ],
      },
    ],
  },
};

const MAZE: EdenCharacter = {
  id: 'maze',
  name: 'Maze',
  title: 'Deusa da Natureza',
  domain: ['Natureza', 'Vegetação', 'Ecossistemas', 'Ambientes botânicos'],
  colors: ['#9df0b0', '#1fae6b'],
  tagline: 'Planta primeiro, constrói depois.',
  bio: [
    'Maze cuida da natureza do Éden Aero: vegetação, ecossistemas, parques e jardins.',
    'No Parque das Águas ela acompanha o lago, o rio e as árvores que seguram a margem.',
  ],
  place: { x: -114, z: 18, heading: Math.PI / 2, label: 'Parque das Águas, margem leste do lago' },
  appearance: look('#7d4a2c', 'longo', '#3fcf86', '#2f9a66', 'vestido', '#a8f0c0', '#1fae6b', '#f3ead6', 'flor', 1.03),
  aura: 0x7df0a8,
  contact: {
    handle: '@maze',
    status: 'A cidade é um jardim que aprendeu a ter janelas.',
    messages: [
      'Se passar pela Ilha do Gazebo de manhã, repare no cheiro. É sakura com água doce.',
      'Jardim Proibido é meu lugar favorito do Éden. Um dia te levo lá.',
    ],
  },
  journal: {
    id: 'personagem-maze',
    title: 'Maze e o Parque das Águas',
    paragraphs: [
      'Maze cuida da natureza do Éden Aero. Para ela, Aurora City é um jardim que aprendeu a ter janelas.',
      'Falou do Jardim Proibido: vegetação densa, estruturas antigas, plantas bioluminescentes e caminhos escondidos.',
    ],
  },
  dialogue: {
    start: 'primeira',
    nodes: [
      {
        id: 'primeira',
        text: ['Shh. Escuta a água por um segundo.', '…pronto. Oi, eu sou Maze. Cuido do verde do Éden.'],
        effects: [
          { kind: 'contato', id: 'maze' },
          { kind: 'diario', id: 'personagem-maze' },
          { kind: 'bandeira', id: 'conheceu-maze' },
        ],
        choices: [
          { label: 'Como a cidade e o verde convivem?', to: 'convivencia' },
          { label: 'O que é o Jardim Proibido?', to: 'jardim' },
          { label: 'Vou continuar o passeio' },
        ],
      },
      {
        id: 'convivencia',
        text: [
          'No Éden a gente planta primeiro e constrói depois. O prédio se encaixa na raiz, não o contrário.',
          'Esse lago alimenta o rio que atravessa o parque até o mar. Tudo o que Aurora bebe passa por aqui.',
        ],
        choices: [{ label: 'Bonito', to: 'primeira' }],
      },
      {
        id: 'jardim',
        text: [
          'Vegetação densa, estruturas antigas, plantas bioluminescentes, cachoeiras e caminhos que só aparecem para quem anda devagar.',
          'É região de exploração — e de respeito. Saturno vai junto quando tem bicho envolvido.',
        ],
        effects: [{ kind: 'bandeira', id: 'sabe-jardim-proibido' }],
        choices: [{ label: 'Quero conhecer um dia', to: 'primeira' }],
      },
      {
        id: 'reencontro',
        text: ['De volta ao parque? Ótima escolha.'],
        choices: [
          { label: 'Fale do Jardim Proibido', to: 'jardim' },
          { label: 'Só passei para dizer oi' },
        ],
      },
    ],
  },
};

const JUPITER: EdenCharacter = {
  id: 'jupiter',
  name: 'Júpiter',
  title: 'Deusa da Arte e da Criação Estética',
  domain: ['Arte visual', 'Design', 'Criação estética', 'Expressão artística'],
  colors: ['#ffb199', '#c0392b'],
  tagline: 'Assina a identidade visual do Éden.',
  bio: [
    'Júpiter cuida da arte do Éden Aero: pintura, design, instalação, identidade visual.',
    'Cabelo vermelho, pele parda, olhar de quem já está enquadrando a próxima obra.',
    'O Pavilhão Lumen, a galeria holográfica de Aurora City, é o espaço dela.',
  ],
  place: inFrontOf('pavilhao-lumen'),
  appearance: look('#cf8f63', 'cacheado', '#c0392b', '#3b2a20', 'vestido', '#ff9f43', '#2e3a4f', '#f3ead6', 'nenhum', 1.0),
  aura: 0xff9f6a,
  contact: {
    handle: '@jupiter',
    status: 'Cor é argumento.',
    messages: [
      'Tire uma foto no fim da tarde, quando o vidro fica laranja. É a melhor hora de Aurora.',
      'Passe no Pavilhão Lumen: a exposição muda com a luz do dia.',
    ],
  },
  journal: {
    id: 'personagem-jupiter',
    title: 'Júpiter e o Pavilhão Lumen',
    paragraphs: [
      'Júpiter é a deusa da arte e da criação estética do Éden Aero. Cabelo vermelho, pele parda, opinião formada sobre cada cor da cidade.',
      'O Pavilhão Lumen é a galeria holográfica dela: a exposição muda conforme a luz do dia.',
    ],
  },
  dialogue: {
    start: 'primeira',
    nodes: [
      {
        id: 'primeira',
        text: ['Pare aí. Essa luz em você está ótima.', 'Júpiter. Arte e criação estética. Prazer.'],
        effects: [
          { kind: 'contato', id: 'jupiter' },
          { kind: 'diario', id: 'personagem-jupiter' },
          { kind: 'bandeira', id: 'conheceu-jupiter' },
        ],
        choices: [
          { label: 'O que tem no Pavilhão Lumen?', to: 'galeria' },
          { label: 'Como é a estética do Éden?', to: 'estetica' },
          { label: 'Vou olhar a exposição' },
        ],
      },
      {
        id: 'galeria',
        text: [
          'Holografia, pintura com luz e instalações que mudam de forma conforme o sol anda.',
          'Nenhuma obra do Éden fica igual o dia inteiro. Isso é proposital.',
        ],
        choices: [{ label: 'Genial', to: 'primeira' }],
      },
      {
        id: 'estetica',
        text: [
          'Vidro transparente, cristal translúcido, água refletindo, gradiente suave, bolha no ar, verde por toda parte.',
          'E à noite Aurora troca de pele: néon rosa, violeta e laranja. A gente chama de Vice Éden.',
        ],
        effects: [{ kind: 'bandeira', id: 'sabe-vice-eden' }],
        choices: [{ label: 'Vou voltar à noite', to: 'primeira' }],
      },
      {
        id: 'reencontro',
        text: ['Voltou! A luz mudou desde a última vez.'],
        choices: [
          { label: 'Fale da estética do Éden', to: 'estetica' },
          { label: 'Só passei para dizer oi' },
        ],
      },
    ],
  },
};

const AMARA: EdenCharacter = {
  id: 'amara',
  name: 'Amara',
  title: 'Figura do panteão do Éden Aero',
  domain: [],
  colors: ['#ffe9a6', '#c79a3a'],
  tagline: 'Conhecida em todo o Éden; domínio ainda não declarado.',
  bio: [
    'Amara é uma figura conhecida do universo Éden Aero.',
    'Nesta versão do jogo ela aparece com identidade e presença próprias, sem domínio atribuído: o cânone ainda não o declarou publicamente.',
    'Costuma ser encontrada no alto do Mirante Celeste, olhando a cidade inteira de uma vez.',
  ],
  place: { x: 176, z: 60, heading: facing(176, 60, 0, 0), label: 'Mirante Celeste' },
  appearance: look('#7d4a2c', 'longo', '#2b1d16', '#c98a2b', 'aero', '#f3ead6', '#c79a3a', '#ffffff', 'nenhum', 1.02),
  aura: 0xffe9a6,
  contact: {
    handle: '@amara',
    status: 'Vista boa, silêncio melhor.',
    messages: ['Se subir ao mirante no fim da tarde, fique até o último raio de sol. Vale.'],
  },
  journal: {
    id: 'personagem-amara',
    title: 'Amara, no alto do mirante',
    paragraphs: [
      'Encontrei Amara no Mirante Celeste. Ela é uma figura conhecida em todo o Éden Aero.',
      'Quando perguntei qual é o domínio dela, respondeu que cada cidade conta uma versão diferente — e que ela prefere assim, por enquanto.',
    ],
  },
  canonNote:
    'O documento oficial pede para preservar a identidade de Amara e NÃO atribuir a ela o domínio da maternidade. Como o domínio oficial não foi informado, o jogo mantém o campo em aberto em vez de inventar um.',
  dialogue: {
    start: 'primeira',
    nodes: [
      {
        id: 'primeira',
        text: ['Daqui dá para ver a cidade inteira respirando.', 'Eu sou Amara. Já ouviu falar de mim, provavelmente — e provavelmente ouviu errado.'],
        effects: [
          { kind: 'contato', id: 'amara' },
          { kind: 'diario', id: 'personagem-amara' },
          { kind: 'bandeira', id: 'conheceu-amara' },
        ],
        choices: [
          { label: 'Qual é o seu domínio?', to: 'dominio' },
          { label: 'O que você vê daqui?', to: 'vista' },
          { label: 'Vou aproveitar a vista também' },
        ],
      },
      {
        id: 'dominio',
        text: [
          'Essa é a pergunta que todo mundo faz primeiro.',
          'Cada cidade do Éden conta uma versão diferente da minha história, e nenhuma delas é oficial ainda.',
          'Então prefiro deixar em aberto. Quando houver resposta, ela virá do próprio Éden — não de um boato de Aurora City.',
        ],
        choices: [{ label: 'Justo', to: 'primeira' }],
      },
      {
        id: 'vista',
        text: [
          'Daqui eu vejo o Distrito Cristal de manhã, a Orla Cristalina ao meio-dia e o néon começando por volta das sete.',
          'Vejo gente mudando de ideia sobre o próprio caminho o tempo todo. É a parte bonita.',
        ],
        choices: [{ label: 'Obrigado(a), Amara', to: 'primeira' }],
      },
      {
        id: 'reencontro',
        text: ['A vista continua boa. Você também.'],
        choices: [
          { label: 'Fale da vista', to: 'vista' },
          { label: 'Só passei para dizer oi' },
        ],
      },
    ],
  },
};

export const PANTHEON: readonly EdenCharacter[] = [AERION, HARU, NEXARA, SUKI, LUMA, LILLY, AKEMI, SATURNO, MAZE, JUPITER, AMARA];

export function getCharacter(id: string): EdenCharacter | undefined {
  return PANTHEON.find((character) => character.id === id);
}

/** Registros de diário gerados pelos encontros com o panteão. */
export const CHARACTER_JOURNAL = PANTHEON.map((character) => character.journal);
