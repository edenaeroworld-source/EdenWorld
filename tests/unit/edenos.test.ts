import { describe, expect, it } from 'vitest';
import {
  AFTERS_PRODUCTS,
  SUPPLEMENTARY_PRODUCTS,
  TRANSFORM_PRODUCTS,
  defaultAftersConfig,
  getAftersProduct,
  productForChannel,
  sanitizeAftersConfig,
} from '../../src/afters/AftersCatalog';
import { defaultAftersBody } from '../../src/afters/AftersState';
import { PANTHEON } from '../../src/characters/Pantheon';
import { EdenSocial, emptySocialData, type FeedContext, sanitizeSocialData } from '../../src/edenos/EdenSocial';
import { LIBRARY, getDocument, libraryFor } from '../../src/edenos/Library';

/**
 * EdenOS: acervo do EdenReads, estado social do aparelho e catálogo Afters.
 * Todos os módulos são puros — o teste roda sem DOM e sem WebGL.
 */

const context = (overrides: Partial<FeedContext> = {}): FeedContext => ({
  playerName: 'Aurora',
  clock: '18:40',
  weather: 'Céu limpo',
  area: 'Praça Central',
  day: 3,
  crystals: [4, 24],
  areas: [5, 11],
  portals: [2, 8],
  night: false,
  hasFlag: () => false,
  ...overrides,
});

describe('EdenReads (acervo)', () => {
  it('tem documentos com id único, prateleira e parágrafos', () => {
    const ids = LIBRARY.map((document) => document.id);
    expect(ids.length).toBeGreaterThanOrEqual(12);
    expect(new Set(ids).size).toBe(ids.length);
    for (const document of LIBRARY) {
      expect(['universo', 'cidades', 'tecnologia', 'historia']).toContain(document.shelf);
      expect(document.title.length).toBeGreaterThan(3);
      expect(document.paragraphs.length).toBeGreaterThan(0);
      for (const paragraph of document.paragraphs) expect(paragraph.trim().length).toBeGreaterThan(20);
    }
  });

  it('guarda o cânone do Éden: população, vida longa e Concurso Divino', () => {
    const text = JSON.stringify(LIBRARY).toLowerCase();
    expect(text).toContain('dez trilhões');
    expect(text).toContain('200 anos');
    expect(text).toContain('100 meses');
    expect(text).toContain('concurso divino');
    expect(text).toContain('bluebloom');
  });

  it('descreve o BlueBloom como história resolvida, com cura em 100%', () => {
    const bluebloom = LIBRARY.find((document) => document.id.includes('bluebloom'));
    expect(bluebloom).toBeDefined();
    const text = bluebloom!.paragraphs.join(' ').toLowerCase();
    expect(text).toContain('haru');
    expect(text).toContain('nexara');
    expect(text).toContain('100%');
  });

  it('esconde o documento trancado até a bandeira aparecer', () => {
    const locked = LIBRARY.filter((document) => document.requiresFlag);
    expect(locked.length).toBeGreaterThan(0);
    const closed = libraryFor(() => false);
    const open = libraryFor(() => true);
    expect(open.length).toBe(LIBRARY.length);
    expect(closed.length).toBe(LIBRARY.length - locked.length);
    for (const document of locked) expect(closed).not.toContain(document);
  });

  it('acha um documento por id e ignora ids inexistentes', () => {
    expect(getDocument(LIBRARY[0].id)).toBe(LIBRARY[0]);
    expect(getDocument('inexistente')).toBeUndefined();
  });
});

describe('EdenSocial', () => {
  it('começa vazio e registra contatos do panteão', () => {
    const social = new EdenSocial();
    expect(social.contactCount).toBe(0);
    expect(social.meet('haru')).toBe(true);
    expect(social.meet('haru')).toBe(false);
    expect(social.hasMet('haru')).toBe(true);
    expect(social.hasMet('nexara')).toBe(false);
    expect(social.contactIds).toEqual(['haru']);
  });

  it('conta habitantes conhecidos sem repetir nomes', () => {
    const social = new EdenSocial();
    expect(social.meetCitizen('Nina Aurora')).toBe(true);
    expect(social.meetCitizen('Nina Aurora')).toBe(false);
    expect(social.meetCitizen('Kauê Brisa')).toBe(true);
    expect(social.citizenCount).toBe(2);
  });

  it('abre uma conversa por contato, marcada como não lida até ser aberta', () => {
    const social = new EdenSocial();
    social.meet('lilly');
    expect(social.threads().length).toBe(1);
    expect(social.unreadCount).toBe(1);
    social.markThreadRead('lilly');
    expect(social.unreadCount).toBe(0);
    expect(social.threads()[0].unread).toBe(false);
  });

  it('guarda fotos em ordem e respeita o limite do aparelho', () => {
    const social = new EdenSocial();
    for (let i = 0; i < 20; i++) {
      social.addPhoto({ id: `f${i}`, data: 'data:image/jpeg;base64,AAAA', place: 'Orla', clock: '10:00', at: i });
    }
    expect(social.photos.length).toBeLessThanOrEqual(12);
    expect(social.photos[0].id).toBe('f19');
    social.removePhoto('f19');
    expect(social.photos.some((photo) => photo.id === 'f19')).toBe(false);
  });

  it('monta um feed com autor, texto e etiqueta válidos', () => {
    const social = new EdenSocial();
    social.meet('haru');
    const posts = social.feed(context());
    expect(posts.length).toBeGreaterThan(3);
    const ids = posts.map((post) => post.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const post of posts) {
      expect(post.text.trim().length).toBeGreaterThan(10);
      expect(post.handle.startsWith('@')).toBe(true);
      expect(['sistema', 'cidade', 'panteao', 'voce', 'agenda']).toContain(post.tag);
      expect(post.color).toMatch(/^#[0-9a-f]{6}$/i);
    }
    expect(posts.some((post) => post.tag === 'panteao')).toBe(true);
  });

  it('troca a pauta do feed entre o dia e a Vice Eden Era', () => {
    const social = new EdenSocial();
    const day = social.feed(context({ night: false })).map((post) => post.text).join(' ');
    const night = social.feed(context({ night: true })).map((post) => post.text).join(' ');
    expect(day).not.toBe(night);
    expect(night.toLowerCase()).toMatch(/vice [eé]den/);
  });

  it('anuncia Bitnara com data e mantém os outros eventos sem data inventada', () => {
    const text = new EdenSocial()
      .feed(context())
      .map((post) => post.text)
      .join(' ');
    expect(text).toContain('14 de novembro de 2026');
    const undated = text.toLowerCase();
    expect(undated).toMatch(/não têm data|ainda sem data|sem data marcada/);
  });

  it('nunca inventa gente on-line: o feed diz que tudo é local', () => {
    const text = new EdenSocial().feed(context()).map((post) => post.text).join(' ').toLowerCase();
    expect(text).not.toMatch(/\d+\s*(jogadores|pessoas) on-?line/);
    expect(text).toMatch(/deste aparelho|neste aparelho|não há servidor/);
  });

  it('salva e recarrega o estado sem perder nada', () => {
    const social = new EdenSocial();
    social.meet('maze');
    social.meetCitizen('Helena Sol');
    social.addPhoto({ id: 'p1', data: 'data:image/jpeg;base64,AAAA', place: 'Píer', clock: '07:10', at: 1 });
    social.markThreadRead('maze');
    const restored = new EdenSocial(sanitizeSocialData(JSON.parse(JSON.stringify(social.toData()))));
    expect(restored.contactIds).toEqual(['maze']);
    expect(restored.citizenCount).toBe(1);
    expect(restored.photos.length).toBe(1);
    expect(restored.unreadCount).toBe(0);
  });
});

describe('sanitizeSocialData', () => {
  it('devolve um estado vazio para lixo', () => {
    expect(sanitizeSocialData(null)).toEqual(emptySocialData());
    expect(sanitizeSocialData('texto')).toEqual(emptySocialData());
    expect(sanitizeSocialData(42)).toEqual(emptySocialData());
  });

  it('descarta contatos que não existem no panteão', () => {
    const data = sanitizeSocialData({ contacts: ['haru', 'intruso', 123], citizens: [], photos: [], readThreads: [] });
    expect(data.contacts).toEqual(['haru']);
  });

  it('recusa fotos sem data URL de imagem ou grandes demais', () => {
    const data = sanitizeSocialData({
      contacts: [],
      citizens: [],
      readThreads: [],
      photos: [
        { id: 'ok', data: 'data:image/jpeg;base64,AAAA', place: 'Orla', clock: '10:00', at: 1 },
        { id: 'script', data: 'javascript:alert(1)', place: 'x', clock: 'y', at: 2 },
        { id: 'enorme', data: `data:image/jpeg;base64,${'A'.repeat(200_000)}`, place: 'x', clock: 'y', at: 3 },
      ],
    });
    expect(data.photos.map((photo) => photo.id)).toEqual(['ok']);
  });

  it('corta listas longas demais', () => {
    const data = sanitizeSocialData({
      contacts: PANTHEON.map((character) => character.id),
      citizens: Array.from({ length: 500 }, (_, i) => `Pessoa ${i}`),
      photos: [],
      readThreads: [],
    });
    expect(data.contacts.length).toBe(PANTHEON.length);
    expect(data.citizens.length).toBeLessThanOrEqual(60);
  });
});

describe('catálogo Afters', () => {
  it('traz os seis produtos do cânone, com id único e cor válida', () => {
    const ids = AFTERS_PRODUCTS.map((product) => product.id);
    expect(ids.length).toBe(6);
    expect(new Set(ids).size).toBe(6);
    const names = AFTERS_PRODUCTS.map((product) => product.name).join(' ');
    for (const expected of ['AfterBust', 'AfterCurve', 'GelGrow', 'CandyGrow', 'AfterLove', 'AfterVelvet']) {
      expect(names).toContain(expected);
    }
    for (const product of AFTERS_PRODUCTS) {
      expect(product.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(product.tagline.length).toBeGreaterThan(5);
      expect(product.description.length).toBeGreaterThan(20);
    }
  });

  it('separa os dois produtos que transformam dos que só acendem luz', () => {
    expect(TRANSFORM_PRODUCTS.map((product) => product.channel)).toEqual(['bust', 'curve']);
    expect(TRANSFORM_PRODUCTS.map((product) => product.id)).toEqual(['afterbust', 'aftercurve']);
    expect(SUPPLEMENTARY_PRODUCTS.length).toBe(AFTERS_PRODUCTS.length - 2);
    for (const product of SUPPLEMENTARY_PRODUCTS) expect(product.channel).toBeUndefined();
    expect(productForChannel('bust').name).toBe('AfterBust®');
    expect(productForChannel('curve').name).toBe('AfterCurve®');
  });

  it('descreve transformação de silhueta, sem vocabulário anatômico', () => {
    const text = JSON.stringify(AFTERS_PRODUCTS).toLowerCase();
    for (const forbidden of ['seio', 'busto', 'peito', 'bunda', 'nádega', 'decote']) {
      expect(text).not.toContain(forbidden);
    }
    // Os dois produtos principais dizem o que fazem de verdade…
    expect(JSON.stringify(TRANSFORM_PRODUCTS).toLowerCase()).toMatch(/silhueta/);
    expect(JSON.stringify(TRANSFORM_PRODUCTS)).toContain('250%');
    // …e os complementares continuam sendo só luz.
    expect(JSON.stringify(SUPPLEMENTARY_PRODUCTS).toLowerCase()).toMatch(/aura|brilho|partícula|luz/);
    expect(JSON.stringify(SUPPLEMENTARY_PRODUCTS).toLowerCase()).not.toContain('silhueta');
  });

  it('começa trancado, sem produto ativo', () => {
    const config = defaultAftersConfig();
    expect(config.unlocked).toBe(false);
    expect(config.productId).toBeNull();
    expect(config.intensity).toBeGreaterThan(0);
  });

  it('acha produto por id e ignora o desconhecido', () => {
    expect(getAftersProduct(AFTERS_PRODUCTS[0].id)).toBe(AFTERS_PRODUCTS[0]);
    expect(getAftersProduct('nao-existe')).toBeUndefined();
  });

  it('higieniza configurações inválidas vindas do salvamento', () => {
    expect(sanitizeAftersConfig(null)).toEqual(defaultAftersConfig());
    const config = sanitizeAftersConfig({ unlocked: 'sim', productId: 'inventado', color: 'drop table', intensity: 99, particles: 'x', sound: 0 });
    expect(config.productId).toBeNull();
    expect(config.color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(config.intensity).toBeLessThanOrEqual(1);
    expect(config.intensity).toBeGreaterThanOrEqual(0);
    expect(typeof config.particles).toBe('boolean');
    expect(typeof config.sound).toBe('boolean');
  });

  it('mantém uma configuração boa intacta', () => {
    const good = { unlocked: true, productId: AFTERS_PRODUCTS[2].id, color: '#7fd6ff', intensity: 0.5, particles: false, sound: true, body: defaultAftersBody() };
    expect(sanitizeAftersConfig(good)).toEqual(good);
  });
});
