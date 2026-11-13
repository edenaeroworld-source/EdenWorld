/**
 * A paleta Frutiger Aero dos interiores.
 *
 * Os materiais do mundo aberto (`MaterialLibrary`) servem fachada,
 * pedra e vidro — o suficiente para a casca de um prédio, e pouco
 * demais para mobiliar um. Um sofá, uma geladeira e um aquário não
 * podem ser todos "facade" cinza.
 *
 * Esta paleta é própria dos interiores e **auto-suficiente**: não
 * depende de canvas, textura nem contexto 2D, então monta igual no
 * navegador e no teste. São poucas dezenas de materiais, criados uma
 * vez por cena e liberados junto com ela.
 *
 * Como o batcher agrupa geometria por material, manter a paleta curta
 * é o que mantém o número de chamadas de desenho baixo: um interior
 * inteiro cabe em ~20 chamadas, celular incluso.
 */

import * as THREE from 'three';

interface PaintOptions {
  color: number;
  roughness?: number;
  metalness?: number;
  emissive?: number;
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
}

function paint(name: string, options: PaintOptions): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    color: options.color,
    roughness: options.roughness ?? 0.6,
    metalness: options.metalness ?? 0.05,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
  });
  material.name = `interior:${name}`;
  if (options.emissive !== undefined) {
    material.emissive = new THREE.Color(options.emissive);
    material.emissiveIntensity = options.emissiveIntensity ?? 1;
  }
  if (options.transparent) material.depthWrite = false;
  return material;
}

/**
 * Superfícies e acabamentos disponíveis dentro dos prédios.
 *
 * Os nomes dizem o acabamento, não o objeto: `gloss` é qualquer
 * plástico branco brilhante, seja um armário ou um balcão. É isso que
 * permite reusar a mesma paleta em cinco ambientes diferentes sem que
 * todos fiquem parecidos — o que muda é a combinação.
 */
export class InteriorPalette {
  /* Estrutura */
  /** Piso claro polido, o padrão das áreas comuns. */
  readonly floorLight = paint('piso-claro', { color: 0xe8eef2, roughness: 0.32, metalness: 0.08 });
  /** Piso de madeira clara, das casas. */
  readonly floorWood = paint('piso-madeira', { color: 0xc49a6c, roughness: 0.55 });
  /** Porcelanato frio, de banheiro e laboratório. */
  readonly floorTile = paint('piso-ceramica', { color: 0xdfe9ee, roughness: 0.22, metalness: 0.06 });
  /** Carpete macio das áreas de espera. */
  readonly carpet = paint('carpete', { color: 0x7fb9c9, roughness: 0.95 });
  /** Parede interna, branco quente. */
  readonly wall = paint('parede', { color: 0xf4f7f8, roughness: 0.78 });
  /** Parede de destaque, azul-gelo. */
  readonly wallAccent = paint('parede-destaque', { color: 0xbfe3f2, roughness: 0.7 });
  /** Teto, levemente mais frio que a parede. */
  readonly ceiling = paint('teto', { color: 0xfafcfd, roughness: 0.9 });
  /** Rodapé e batente. */
  readonly trim = paint('acabamento', { color: 0xd8e3e8, roughness: 0.45, metalness: 0.15 });

  /* Acabamentos */
  /** Plástico branco brilhante — a cara do Frutiger Aero. */
  readonly gloss = paint('laca-branca', { color: 0xffffff, roughness: 0.14, metalness: 0.08 });
  /** Laca azul-piscina. */
  readonly glossAqua = paint('laca-aqua', { color: 0x58c6e8, roughness: 0.16, metalness: 0.1 });
  /** Laca verde-folha. */
  readonly glossMint = paint('laca-menta', { color: 0x76d7a8, roughness: 0.2, metalness: 0.08 });
  /** Laca rosa, do petshop e da casa de chá. */
  readonly glossRose = paint('laca-rosa', { color: 0xf3a7c2, roughness: 0.24, metalness: 0.05 });
  /** Laca âmbar, de madeira pintada. */
  readonly glossAmber = paint('laca-ambar', { color: 0xf0b86a, roughness: 0.3 });
  /** Madeira média de móvel. */
  readonly wood = paint('madeira', { color: 0xa9743f, roughness: 0.62 });
  /** Madeira escura de estante. */
  readonly woodDark = paint('madeira-escura', { color: 0x6d4525, roughness: 0.68 });
  /** Cromado de pé de cadeira e puxador. */
  readonly chrome = paint('cromado', { color: 0xd4dde2, roughness: 0.14, metalness: 0.92 });
  /** Alumínio escovado dos eletrodomésticos. */
  readonly aluminium = paint('aluminio', { color: 0xb6c2c8, roughness: 0.34, metalness: 0.78 });
  /** Grafite de tela desligada e eletrônico. */
  readonly graphite = paint('grafite', { color: 0x2b3238, roughness: 0.42, metalness: 0.3 });
  /** Tecido de estofado. */
  readonly fabric = paint('tecido', { color: 0x8fa9bd, roughness: 0.92 });
  /** Tecido claro de cama. */
  readonly linen = paint('linho', { color: 0xf1ece2, roughness: 0.95 });

  /* Vidro e luz */
  /** Vidro de vitrine e divisória. */
  readonly glass = paint('vidro', { color: 0xc8f0ff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.3 });
  /** Vidro de janela, mais limpo. */
  readonly window = paint('janela', { color: 0xdff6ff, roughness: 0.02, metalness: 0.05, transparent: true, opacity: 0.22 });
  /** Água de aquário e fonte. */
  readonly water = paint('agua', { color: 0x4fc3e8, roughness: 0.1, transparent: true, opacity: 0.55 });
  /** Luminária acesa. */
  readonly lampOn = paint('luminaria', { color: 0xfff6e0, roughness: 0.3, emissive: 0xffe9bd, emissiveIntensity: 1.5 });
  /** Fita de luz ciano, a assinatura da casa. */
  readonly neonAqua = paint('neon-aqua', { color: 0x9df3ff, roughness: 0.2, emissive: 0x4fd8ff, emissiveIntensity: 2.2 });
  /** Fita de luz rosa. */
  readonly neonRose = paint('neon-rosa', { color: 0xffc2e2, roughness: 0.2, emissive: 0xff6fb5, emissiveIntensity: 2 });
  /** Tela ligada. */
  readonly screen = paint('tela', { color: 0x9fe8ff, roughness: 0.18, emissive: 0x3fb4e8, emissiveIntensity: 1.3 });

  /* Gente */
  /** Pele clara. */
  readonly skin = paint('pele-clara', { color: 0xf0c9a8, roughness: 0.82 });
  /** Pele morena. */
  readonly skinWarm = paint('pele-morena', { color: 0xc08a5e, roughness: 0.82 });
  /** Pele escura. */
  readonly skinDeep = paint('pele-escura', { color: 0x7d4f33, roughness: 0.82 });
  /** Cabelo. */
  readonly hair = paint('cabelo', { color: 0x2f2a2c, roughness: 0.74 });
  /** Uniforme da casa. */
  readonly uniform = paint('uniforme', { color: 0x2f9fd0, roughness: 0.68 });

  /* Vida */
  /** Folhagem de vaso. */
  readonly leaf = paint('folha', { color: 0x4f9d5a, roughness: 0.82 });
  /** Folhagem clara, de samambaia. */
  readonly leafPale = paint('folha-clara', { color: 0x87c66e, roughness: 0.85 });
  /** Terra de vaso. */
  readonly soil = paint('terra', { color: 0x4a3426, roughness: 0.98 });
  /** Cerâmica de vaso. */
  readonly ceramic = paint('ceramica', { color: 0xeae2d6, roughness: 0.5 });

  private readonly all: THREE.MeshStandardMaterial[] = [];

  constructor() {
    for (const value of Object.values(this)) {
      if (value instanceof THREE.MeshStandardMaterial) this.all.push(value);
    }
  }

  /** Quantos materiais a paleta tem — o teto de chamadas de desenho. */
  get size(): number {
    return this.all.length;
  }

  dispose(): void {
    for (const material of this.all) material.dispose();
    this.all.length = 0;
  }
}
