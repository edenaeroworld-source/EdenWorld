import { describe, expect, it } from 'vitest';
import {
  CITIZEN_ACCESSORIES,
  CITIZEN_HAIR_BY_SEX,
  CITIZEN_OUTFITS_BY_SEX,
  DEFAULT_APPEARANCE,
  SEXES,
  SEX_LABELS,
  type AvatarAppearance,
  type Sex,
  randomAppearance,
  sanitizeAppearance,
} from '../../src/player/AvatarAppearance';
import { OFFICIAL_IDS, officialAppearance, officialFingerprint } from '../../src/characters/CharacterModels';
import { makeCitizen } from '../../src/npc/CitizenData';
import { createRng } from '../../src/utils/math';

/**
 * Etapa 1 do EdenWorld 2.0 — o eixo de sexo entra nos dados, e **nada
 * mais acontece**.
 *
 * O valor desta suíte não está em afirmar que o campo existe: está em
 * provar que acrescentá-lo não mexeu em nada que já existia. Por isso as
 * tabelas abaixo são valores-ouro, capturados executando o código
 * **antes** da alteração e colados aqui literalmente.
 *
 * Se uma etapa futura mudar o corpo do panteão ou a aparência dos
 * habitantes sem que alguém tenha pedido, é aqui que o erro aparece.
 */

/** Impressão digital das onze fichas oficiais, medida antes da etapa 1. */
const DEUSAS_ANTES: Readonly<Record<string, string>> = {
  aerion: 'aerion|#2a2350|longo|#9a7bff|#7a5cc9|aero|#1b1040|#2b1d5a|#c9a2ff|aureola|1.0800|0.0000|sem-afters|height:1.0800|build:0.5268|shoulders:1.1361|chest:0.9398|waist:1.1458|hips:0.9365|armLength:1.0218|legLength:1.0034|neck:1.0172|headSize:0.9878|faceShape:0.8721',
  haru: 'haru|#f6c9a4|fibra|#7fd6ff|#2f6fb3|sistema|#36476b|#1d2740|#f4f6fb|nenhum|0.9900|0.0000|sem-afters|height:0.9900|build:0.5814|shoulders:0.9168|chest:0.9516|waist:1.1765|hips:0.9979|armLength:0.9640|legLength:0.9451|neck:1.0265|headSize:0.9964|faceShape:0.6082',
  nexara: 'nexara|#e8ab82|fluxo|#efe6ff|#29c8ff|rede|#f4f6fb|#eceaff|#f4f6fb|nenhum|1.0200|0.0000|sem-afters|height:1.0200|build:0.8071|shoulders:1.0060|chest:0.9311|waist:0.8959|hips:1.1538|armLength:1.0493|legLength:0.9320|neck:0.9507|headSize:0.9466|faceShape:0.2880',
  suki: 'suki|#e8ab82|cascata|#1a1a22|#3b2a20|docente|#e23c8f|#b02a73|#f4f6fb|lentes|0.9700|0.0000|sem-afters|height:0.9700|build:0.0668|shoulders:1.1115|chest:0.9265|waist:1.1334|hips:1.0069|armLength:1.0207|legLength:1.0050|neck:1.0583|headSize:1.0269|faceShape:0.9377',
  luma: 'luma|#cf8f63|ondulado|#a855f7|#3b2a20|aurora|#dff7ff|#8fe9d8|#dff7ff|cristal|1.0100|0.0000|1.250/1.500/true/true|height:1.0100|build:0.2808|shoulders:0.9832|chest:1.0197|waist:1.1536|hips:0.9714|armLength:1.0161|legLength:1.0154|neck:0.9440|headSize:0.9691|faceShape:0.1110',
  lilly: 'lilly|#cf8f63|onda|#161b2a|#b98cff|sonora|#171a26|#121520|#29c8ff|nenhum|1.0000|0.0000|sem-afters|height:1.0000|build:0.2940|shoulders:0.9275|chest:1.1162|waist:1.0231|hips:0.8741|armLength:1.0534|legLength:1.0552|neck:0.9160|headSize:0.9613|faceShape:0.4426',
  akemi: 'akemi|#ffe0c8|cachos|#7d5636|#7a5cc9|cosplay|#f7f3ff|#d98ac0|#ffc1d6|nenhum|0.9600|0.0000|sem-afters|height:0.9600|build:0.1623|shoulders:0.8895|chest:0.9674|waist:1.0777|hips:1.0741|armLength:1.0191|legLength:1.0166|neck:1.0378|headSize:1.0247|faceShape:0.2659',
  saturno: 'saturno|#f3d2c1|silvestre|#8a5a2b|#c98a2b|guardia|#ffd84a|#d99a30|#f3ead6|nenhum|1.0000|0.0000|sem-afters|height:1.0000|build:0.4373|shoulders:1.0796|chest:0.9339|waist:1.1834|hips:0.9997|armLength:0.9301|legLength:1.0385|neck:0.9454|headSize:1.0228|faceShape:0.3006',
  maze: 'maze|#7d4a2c|copa|#a8702f|#2f9a66|jardim|#eef9ef|#2fa36a|#f3ead6|nenhum|1.0300|0.0000|sem-afters|height:1.0300|build:0.1255|shoulders:0.9427|chest:0.9606|waist:0.9093|hips:1.0173|armLength:1.0470|legLength:0.9395|neck:1.0533|headSize:1.0562|faceShape:0.5687',
  jupiter: 'jupiter|#cf8f63|pincelada|#c0392b|#3b2a20|lumen|#f7f2ee|#ffb199|#f3ead6|atelie|1.0000|0.0000|sem-afters|height:1.0000|build:0.3854|shoulders:1.0028|chest:1.0823|waist:0.8460|hips:0.9757|armLength:1.0125|legLength:1.0667|neck:1.0008|headSize:0.9802|faceShape:0.1666',
  amara: 'amara|#7d4a2c|nascente|#e3f6ec|#c98a2b|regaco|#8fe3cd|#2f9b8e|#ffffff|nimbo|1.0200|1.0000|sem-afters|height:1.0200|build:0.8820|shoulders:0.8840|chest:0.9367|waist:0.9820|hips:0.9596|armLength:0.9997|legLength:1.0139|neck:1.0166|headSize:0.9719|faceShape:0.2466',
};

/** Os 54 habitantes de Aurora City, medidos antes da etapa 1. */
const CIDADAOS_ANTES: Readonly<Record<number, string>> = {
  1: 'Noor Zênite|#ffe0c8|nascente|#9a7bff|#7a5cc9|esportivo|#ff9ecb|#ffffff|#2e3a4f|fones|0.94|2.168075|0.0000/0.0000/false/false',
  2: 'Suri do Orvalho|#cf8f63|longo|#a855f7|#1f1f24|casual|#d7e9ff|#7a5cc9|#ff6f91|lentes|0.95|1.899916|0.0000/0.0000/false/false',
  3: 'Rafael Brisa|#cf8f63|ondulado|#c0392b|#c98a2b|casual|#9fe6b0|#ffd84a|#7a5cc9|flor|1.03|1.128981|0.0000/0.0000/false/false',
  4: 'Vega das Águas|#f6c9a4|pincelada|#ff8fc0|#7a5cc9|casual|#4fd6a8|#7ddc5a|#c9a2ff|chapeu|1.05|1.364967|0.0000/0.0000/false/false',
  5: 'Joana Lumen|#f3d2c1|fluxo|#2b1d16|#c98a2b|aero|#d7e9ff|#24e08a|#c9a2ff|atelie|1.05|1.828406|0.0000/0.0000/false/false',
  6: 'Rafael Aurora|#5a3320|rabo|#2b1d16|#7a5cc9|casual|#7fe3c0|#c9a2ff|#29c8ff|chapeu|1.06|1.211140|0.0000/0.0000/false/false',
  7: 'Alícia Brisa|#ffe0c8|silvestre|#f4f6fb|#1f1f24|casual|#2fa37a|#f3ead6|#f3ead6|atelie|1.05|1.155443|0.0000/0.0000/false/false',
  8: 'Benício do Orvalho|#f6c9a4|ondulado|#ff8fc0|#2f6fb3|esportivo|#ffd3ef|#1b82ea|#1b82ea|nenhum|1.05|1.809935|0.0000/0.0000/false/false',
  9: 'Fernanda das Águas|#7d4a2c|longo|#ff8fc0|#c98a2b|aero|#b7a8ff|#2e3a4f|#ff6f91|fones|1|1.336739|1.7500/1.9500/true/true',
  10: 'Teo do Orvalho|#cf8f63|onda|#a855f7|#2f6fb3|casual|#4fd6a8|#f3ead6|#c9a2ff|oculos|0.93|1.253153|0.0000/0.0000/false/false',
  11: 'Zuri Mares|#ffe0c8|fluxo|#f3e3a6|#7a5cc9|casual|#7fe6ff|#c9a2ff|#2e3a4f|fones|1.02|1.248651|2.0500/0.0000/true/false',
  12: 'Maya Brisa|#a96c45|curto|#7fd6ff|#3b2a20|aero|#d7e9ff|#ffd84a|#1b82ea|chapeu|0.93|1.154498|0.0000/0.0000/false/false',
  13: 'Suri Alvorada|#cf8f63|cascata|#f3e3a6|#1f1f24|esportivo|#4fd6a8|#ff6f91|#ffd84a|fones|0.96|1.023830|0.0000/0.0000/false/false',
  14: 'Miguel Luz|#e8ab82|longo|#f3e3a6|#2f9a66|casual|#ff9ecb|#ff6f91|#2e3a4f|fones|1.07|1.454748|0.0000/0.0000/false/false',
  15: 'Kai Mares|#cf8f63|cascata|#f4f6fb|#1f1f24|casual|#7fd6ff|#24e08a|#ffd84a|oculos|1.05|1.076406|0.0000/0.0000/false/false',
  16: 'Alícia das Águas|#5a3320|copa|#ff8fc0|#7a5cc9|casual|#4fd6a8|#ffffff|#c9a2ff|chapeu|0.99|1.070138|0.0000/0.0000/false/false',
  17: 'Fernanda Luz|#5a3320|onda|#d9a441|#3b2a20|esportivo|#bdf3dd|#29c8ff|#1b82ea|chapeu|0.96|1.072054|0.0000/0.0000/false/false',
  18: 'Yuri do Orvalho|#f3d2c1|copa|#d9a441|#2f9a66|esportivo|#7fe3c0|#24e08a|#24e08a|nenhum|0.95|1.375419|0.0000/0.0000/false/false',
  19: 'Zuri Zênite|#5a3320|silvestre|#f4f6fb|#1f1f24|aero|#aef0ff|#c9a2ff|#24e08a|fones|1.06|1.628243|0.0000/0.3000/false/true',
  20: 'Zara Mares|#e8ab82|pincelada|#7fd6ff|#2f9a66|esportivo|#ffe6f2|#ffffff|#29c8ff|fones|1.06|1.193207|0.0000/0.0000/false/false',
  21: 'Benício Nimbus|#7d4a2c|cacheado|#ff8fc0|#1f1f24|casual|#d7e9ff|#29c8ff|#24e08a|oculos|0.94|1.443949|0.0000/0.0000/false/false',
  22: 'Otávio Sereno|#5a3320|fluxo|#7fd6ff|#2f6fb3|aero|#b7a8ff|#24e08a|#ffd84a|chapeu|1.06|1.437717|0.0000/0.0000/false/false',
  23: 'Suri Cristal|#cf8f63|cascata|#9a7bff|#2f6fb3|casual|#d7e9ff|#f3ead6|#1b82ea|nimbo|1.01|1.457401|0.0000/0.0000/false/false',
  24: 'Taís Zênite|#ffe0c8|silvestre|#a855f7|#2f9a66|aero|#5ec8e6|#2e3a4f|#2e3a4f|chapeu|0.98|1.238287|0.0000/0.0000/false/false',
  25: 'Enzo Alvorada|#f6c9a4|espetado|#5a3a22|#c98a2b|aero|#ffc98f|#f3ead6|#ffd84a|chapeu|1.05|1.203447|0.8500/0.0000/true/false',
  26: 'Lior Nimbus|#5a3320|pincelada|#5a3a22|#3b2a20|esportivo|#9ff2ff|#c9a2ff|#ffd84a|atelie|1.04|1.629448|0.0000/0.4000/false/true',
  27: 'Sena Sereno|#7d4a2c|fluxo|#5a3a22|#3b2a20|aero|#b7a8ff|#ffd84a|#ff6f91|oculos|1.06|1.293275|0.0000/0.0000/false/false',
  28: 'Zuri Cristal|#a96c45|silvestre|#f3e3a6|#2f9a66|esportivo|#bdf3dd|#7a5cc9|#7ddc5a|chapeu|1.02|1.191952|0.0000/0.0000/false/false',
  29: 'Helena Brisa|#5a3320|onda|#ff8fc0|#2f6fb3|aero|#5ec8e6|#7ddc5a|#7ddc5a|oculos|0.98|1.020710|0.0000/0.0000/false/false',
  30: 'Enzo Zênite|#f6c9a4|copa|#f4f6fb|#2f6fb3|aero|#ff8fb4|#f3ead6|#2e3a4f|nenhum|1.03|1.172173|0.9000/0.8500/true/true',
  31: 'Benício Zênite|#f6c9a4|curto|#9a7bff|#1f1f24|esportivo|#ffe6f2|#ff9f43|#7a5cc9|nenhum|0.98|1.238259|0.0000/0.0000/false/false',
  32: 'Helena Nimbus|#7d4a2c|fluxo|#5a3a22|#c98a2b|casual|#d7e9ff|#24e08a|#ff9f43|nenhum|0.94|1.641893|0.0000/0.0000/false/false',
  33: 'Nina Mares|#a96c45|cacheado|#a855f7|#2f9a66|esportivo|#b7a8ff|#c9a2ff|#7ddc5a|nenhum|0.99|1.664231|0.0000/0.0000/false/false',
  34: 'Zuri das Águas|#ffe0c8|fluxo|#f3e3a6|#1f1f24|esportivo|#ff9ecb|#7ddc5a|#f3ead6|fones|1.03|2.180195|0.0000/0.0000/false/false',
  35: 'Alícia Nimbus|#cf8f63|careca|#c0392b|#c98a2b|vestido|#ff9ecb|#24e08a|#c9a2ff|oculos|1.06|1.642624|1.1000/1.2000/true/true',
  36: 'Priscila do Orvalho|#a96c45|fluxo|#2b1d16|#7a5cc9|casual|#ffe0a3|#2e3a4f|#24e08a|oculos|0.99|1.425336|0.0000/0.0000/false/false',
  37: 'Kauê das Águas|#5a3320|rabo|#5a3a22|#1f1f24|aero|#ffd84a|#1b82ea|#2e3a4f|oculos|1.01|1.503018|0.8000/0.7500/true/true',
  38: 'Nael do Orvalho|#5a3320|longo|#f3e3a6|#c98a2b|aero|#ffb37a|#1b82ea|#ff6f91|atelie|1.02|1.186799|0.0000/0.0000/false/false',
  39: 'Valentina Nimbus|#5a3320|rabo|#5a3a22|#2f6fb3|casual|#7fd6ff|#7ddc5a|#24e08a|nenhum|0.94|1.294906|0.0000/0.0000/false/false',
  40: 'Zuri das Águas|#f6c9a4|cachos|#7fd6ff|#2f9a66|casual|#ffd3a8|#2e3a4f|#7ddc5a|oculos|0.95|1.214434|0.0000/0.0000/false/false',
  41: 'Aiko Nimbus|#e8ab82|copa|#9a7bff|#3b2a20|aero|#ffd84a|#29c8ff|#2e3a4f|nenhum|0.93|1.250212|0.9500/0.8000/true/true',
  42: 'Mio Sereno|#f6c9a4|silvestre|#a855f7|#2f6fb3|casual|#ffe0a3|#7ddc5a|#2e3a4f|chapeu|1.05|1.157775|0.0000/0.0000/false/false',
  43: 'Helena Aurora|#e8ab82|nascente|#2b1d16|#3b2a20|casual|#ff8fb4|#ffd84a|#7a5cc9|oculos|0.95|1.212710|1.9000/1.4500/true/true',
  44: 'Joana Sereno|#f6c9a4|coque|#9a7bff|#3b2a20|esportivo|#9ff2ff|#7a5cc9|#ffffff|oculos|1.04|1.737361|0.0000/0.0000/false/false',
  45: 'Miguel Aurora|#7d4a2c|pincelada|#a855f7|#1f1f24|vestido|#ff9ea8|#24e08a|#7ddc5a|nenhum|1.07|1.155384|0.0000/0.0000/false/false',
  46: 'Priscila Alvorada|#ffe0c8|cacheado|#9a7bff|#1f1f24|esportivo|#4fd6a8|#7ddc5a|#24e08a|oculos|1.06|1.055656|0.0000/0.0000/false/false',
  47: 'Nael Aurora|#a96c45|onda|#a855f7|#1f1f24|casual|#4fd6a8|#24e08a|#7a5cc9|oculos|0.95|1.087494|0.0000/0.0000/false/false',
  48: 'Mio Luz|#f3d2c1|careca|#a855f7|#2f9a66|esportivo|#ff9ecb|#ffd84a|#c9a2ff|fones|0.99|2.329848|1.9000/1.2500/true/true',
  49: 'Teo Mares|#ffe0c8|fluxo|#ff8fc0|#1f1f24|casual|#ffc98f|#c9a2ff|#1b82ea|oculos|1.03|1.127092|0.0000/0.0000/false/false',
  50: 'Suri Aurora|#e8ab82|espetado|#f3e3a6|#3b2a20|aero|#ff9ea8|#ff9f43|#ff9f43|oculos|0.98|1.581017|0.0000/0.0000/false/false',
  51: 'Miguel Nimbus|#cf8f63|careca|#c0392b|#2f9a66|vestido|#ffc98f|#ffffff|#c9a2ff|nenhum|0.94|1.323319|0.0000/0.0000/false/false',
  52: 'Priscila Mares|#e8ab82|fibra|#2b1d16|#3b2a20|esportivo|#ff9ecb|#1b82ea|#29c8ff|flor|0.95|2.153420|0.0000/0.0000/false/false',
  53: 'Nina Nimbus|#a96c45|cachos|#a855f7|#7a5cc9|casual|#ff8fb4|#f3ead6|#f3ead6|flor|1.03|1.172376|0.0000/0.0000/false/false',
  54: 'Suri Mares|#f3d2c1|nascente|#8a5a2b|#1f1f24|casual|#8fd4ff|#29c8ff|#7ddc5a|nenhum|1.01|1.567821|0.0000/0.8500/false/true',
};

/** Saída do botão "Aleatório" para as sementes 1, 2 e 3, antes da etapa 1. */
const ALEATORIOS_ANTES: readonly string[] = [
  '#7d4a2c|curto|#c0392b|#c98a2b|praia|#24e08a|#ff6f91|#c9a2ff|fones|1.06',
  '#7d4a2c|ondulado|#d9a441|#7a5cc9|praia|#ff6f91|#ffd84a|#7ddc5a|cristal|0.95',
  '#7d4a2c|curto|#c0392b|#3b2a20|esportivo|#ffd84a|#ffd84a|#29c8ff|oculos|1.01',
];

/** A ficha padrão, medida antes da etapa 1. */
const PADRAO_ANTES = '#f6c9a4|curto|#5a3a22|#2f6fb3|aero|#ffffff|#29c8ff|#ffffff|nenhum|1';

/** Os dez campos que já existiam, na ordem em que foram medidos. */
function digito(a: AvatarAppearance): string {
  return [a.skin, a.hairStyle, a.hairColor, a.eyeColor, a.outfit, a.topColor, a.bottomColor, a.shoeColor, a.accessory, a.height].join('|');
}

describe('o eixo de sexo existe e tem forma', () => {
  it('tem exatamente dois valores', () => {
    expect(SEXES).toEqual(['fem', 'masc']);
  });

  it('cada valor tem rótulo em português', () => {
    expect(SEX_LABELS.fem).toBe('Feminino');
    expect(SEX_LABELS.masc).toBe('Masculino');
  });

  it('o padrão do Éden é feminino — o corpo que o jogo sempre teve', () => {
    expect(DEFAULT_APPEARANCE.sex).toBe('fem');
  });

  it('os outros dez campos da ficha padrão continuam os de antes', () => {
    // Sem esta trava, mexer no tom de pele ou no traje padrão passaria
    // despercebido: foi o que uma mutação de teste mostrou.
    expect(digito(DEFAULT_APPEARANCE)).toBe(PADRAO_ANTES);
  });

  it('sanear uma ficha vazia reconstrói exatamente a ficha padrão', () => {
    expect(digito(sanitizeAppearance({}))).toBe(PADRAO_ANTES);
  });
});

describe('saneamento: um save antigo não sabe que este campo existe', () => {
  it('ficha vazia vira feminino', () => {
    expect(sanitizeAppearance({}).sex).toBe('fem');
  });

  it('ficha sem o campo vira feminino, preservando o resto', () => {
    const v1 = { skin: '#7d4a2c', hairStyle: 'coque', outfit: 'casual', height: 1.05 };
    const limpa = sanitizeAppearance(v1);
    expect(limpa.sex).toBe('fem');
    expect(limpa.skin).toBe('#7d4a2c');
    expect(limpa.hairStyle).toBe('coque');
    expect(limpa.outfit).toBe('casual');
    expect(limpa.height).toBe(1.05);
  });

  it('aceita os dois valores válidos', () => {
    expect(sanitizeAppearance({ sex: 'fem' }).sex).toBe('fem');
    expect(sanitizeAppearance({ sex: 'masc' }).sex).toBe('masc');
  });

  it('qualquer lixo cai no padrão, sem lançar', () => {
    for (const lixo of ['outro', 'FEM', 'Masc', '', ' masc', 'male', 0, 1, null, undefined, {}, [], true, NaN]) {
      expect(sanitizeAppearance({ sex: lixo }).sex).toBe('fem');
    }
  });

  it('entrada que não é objeto também devolve ficha válida', () => {
    for (const lixo of [null, undefined, 42, 'nada', []]) {
      expect(sanitizeAppearance(lixo).sex).toBe('fem');
    }
  });

  it('sanear duas vezes dá o mesmo resultado', () => {
    const uma = sanitizeAppearance({ sex: 'masc', skin: '#a96c45' });
    expect(sanitizeAppearance(uma)).toEqual(uma);
  });
});

describe('nada do que existia mudou', () => {
  it('as dez deusas têm impressão digital idêntica à de antes', () => {
    // A Etapa 3 acrescentou o eixo de silhueta (`BodyShape`), e o
    // Aérion é o único personagem que declara forma. Esta asserção
    // continua sendo a de igualdade byte a byte para as outras dez:
    // se o eixo novo tivesse escorrido para qualquer uma delas, aqui
    // é que apareceria.
    for (const id of OFFICIAL_IDS) {
      if (id === 'aerion') continue;
      expect(officialFingerprint(id), `ficha oficial: ${id}`).toBe(DEUSAS_ANTES[id]);
    }
  });

  it('no Aérion mudou só o que a Etapa 3 pediu', () => {
    // Repontada duas vezes, e sempre pela mesma técnica: em vez de
    // colar a string nova — que esconderia qualquer alteração que
    // viesse de carona —, a asserção parte da string ANTIGA e
    // aplica exatamente as mudanças autorizadas.
    //
    //  · C1 deu a ele silhueta masculina, que entra como sufixo;
    //  · C2 trocou duas peças genéricas por duas exclusivas.
    //
    // Altura, gestação, Afters, cores e as onze proporções têm de
    // continuar idênticas caractere a caractere.
    const esperado = `${DEUSAS_ANTES.aerion}|forma:masc`
      .replace('|longo|', '|cosmos|')
      .replace('|aero|', '|criador|');
    expect(officialFingerprint('aerion')).toBe(esperado);
  });

  it('cobre as onze fichas, não um subconjunto', () => {
    expect(OFFICIAL_IDS.length).toBe(11);
    expect(Object.keys(DEUSAS_ANTES).sort()).toEqual([...OFFICIAL_IDS].sort());
  });

  it('os 54 habitantes mudaram só no que a Etapa 2 autorizou', () => {
    // Na Etapa 1 esta asserção era de igualdade byte a byte, e foi o
    // que provou que separar o eixo de sexo não mexeu em ninguém.
    // A Etapa 2 **mudou os habitantes de propósito** (decisões D1 e
    // D2: fim do vazamento de peça de deusa e metade da cidade
    // masculina), então exigir igualdade aqui seria congelar o bug
    // que a etapa veio consertar.
    //
    // O que continua travado é tudo o que a Etapa 2 **não** podia
    // mexer: nome, velocidade, Afters e altura de cada habitante.
    // Se o sorteio de aparência gastar um número de gerador a mais ou
    // a menos, estes campos saem do lugar e o teste acusa.
    for (let i = 1; i <= 54; i += 1) {
      const c = makeCitizen(i);
      const antes = CIDADAOS_ANTES[i].split('|');

      // Nome e velocidade valem para os 54, sem exceção. A velocidade
      // é sorteada **depois** da aparência e **antes** dos Afters: se
      // o sorteio de peças gastasse um número a mais ou a menos do
      // gerador, ela mudaria em cascata. É a sentinela da sequência.
      expect(c.name, `nome do habitante ${i}`).toBe(antes[0]);
      expect(c.speed.toFixed(6), `velocidade do habitante ${i}`).toBe(antes[antes.length - 2]);

      // Os Afters seguem idênticos para as habitantes femininas. Nos
      // masculinos eles são zerados de propósito (decisão D3), o que
      // o teste logo abaixo cobre.
      if (c.appearance.sex === 'fem') {
        const aftersAgora = `${c.afters.bust.toFixed(4)}/${c.afters.curve.toFixed(4)}/${c.afters.bustActive}/${c.afters.curveActive}`;
        expect(aftersAgora, `Afters da habitante ${i}`).toBe(antes[antes.length - 1]);
      }
    }
  });

  it('nenhum habitante masculino recebe silhueta Afters', () => {
    // Os Afters moldam busto e quadril. Antes da Etapa 2 a cidade era
    // inteiramente feminina e a questão não existia; assim que metade
    // dela virou masculina, quatro homens apareceram com busto entre
    // 0,85 e 2,05.
    for (let i = 1; i <= 54; i += 1) {
      const c = makeCitizen(i);
      if (c.appearance.sex !== 'masc') continue;
      expect(c.afters.bust, `busto do habitante masculino ${i}`).toBe(0);
      expect(c.afters.bustActive, `busto ativo no habitante masculino ${i}`).toBe(false);
      expect(c.afters.curveActive, `curva ativa no habitante masculino ${i}`).toBe(false);
    }
  });

  it('e as habitantes femininas continuam recebendo os seus', () => {
    // Contraprova: se o corte do D3 pegasse geral, os Afters sumiriam
    // da cidade inteira e o teste acima passaria vazio.
    const comAfters = Array.from({ length: 54 }, (_, k) => makeCitizen(k + 1)).filter((c) => c.afters.bustActive || c.afters.curveActive);
    expect(comAfters.length).toBeGreaterThan(0);
    expect(comAfters.every((c) => c.appearance.sex === 'fem')).toBe(true);
  });

  it('e a aparência deles mudou mesmo — não é um teste que passa à toa', () => {
    // A contraprova do teste acima: se `makeCitizen` tivesse ficado
    // igual, a Etapa 2 não teria feito nada.
    const mudaram = Array.from({ length: 54 }, (_, k) => k + 1).filter((i) => {
      const c = makeCitizen(i);
      return `${c.name}|${digito(c.appearance)}` !== CIDADAOS_ANTES[i].split('|').slice(0, -2).join('|');
    });
    expect(mudaram.length).toBeGreaterThan(20);
  });

  it('o botão "Aleatório" nunca devolve peça do outro sexo', () => {
    // Trocou de forma na Etapa 2, e por um motivo: o catálogo cresceu.
    // Enquanto só havia peças femininas, `ALEATORIOS_ANTES` provava
    // que o botão não tinha mudado. Agora que existem bermuda de banho
    // e topete, o valor-ouro antigo só poderia ser mantido deixando o
    // botão sortear da lista cheia — que é justamente o defeito a
    // evitar. O que se trava agora é a propriedade, não o byte.
    for (let semente = 1; semente <= 60; semente += 1) {
      const a = randomAppearance(createRng(semente));
      expect(a.sex).toBe('fem');
      expect(CITIZEN_HAIR_BY_SEX.fem as readonly string[], `semente ${semente}`).toContain(a.hairStyle);
      expect(CITIZEN_OUTFITS_BY_SEX.fem as readonly string[], `semente ${semente}`).toContain(a.outfit);
      expect(CITIZEN_ACCESSORIES as readonly string[], `semente ${semente}`).toContain(a.accessory);
    }

    // E o que o botão sorteava antes continua sorteável: nenhuma peça
    // feminina saiu de circulação quando o catálogo foi separado.
    for (const antes of ALEATORIOS_ANTES) {
      const campos = antes.split('|');
      expect(CITIZEN_HAIR_BY_SEX.fem as readonly string[], antes).toContain(campos[1]);
      expect(CITIZEN_OUTFITS_BY_SEX.fem as readonly string[], antes).toContain(campos[4]);
    }
  });

  it('sortear uma aparência não gasta número do gerador com o sexo', () => {
    // Se `randomAppearance` sorteasse o sexo, a sequência seguinte
    // andaria e as duas chamadas divergiriam.
    const a = randomAppearance(createRng(7));
    const b = randomAppearance(createRng(7));
    expect(digito(a)).toBe(digito(b));
    expect(a.sex).toBe('fem');
  });
});

describe('o panteão e a cidade nascem femininos', () => {
  it('todas as fichas oficiais estão marcadas como femininas', () => {
    for (const id of OFFICIAL_IDS) {
      expect(officialAppearance(id)?.sex, `ficha oficial: ${id}`).toBe('fem');
    }
  });

  it('a cidade deixou de ser só feminina — e é a Etapa 2 fazendo isso', () => {
    // Era `toBe('fem')` para os 54, o estado correto ao fim da Etapa 1.
    // A decisão D2 pediu Aurora City perto de metade e metade.
    const sexos = Array.from({ length: 54 }, (_, k) => makeCitizen(k + 1).appearance.sex);
    const masc = sexos.filter((s) => s === 'masc').length;
    expect(masc).toBeGreaterThan(0);
    expect(masc / 54).toBeGreaterThan(0.4);
    expect(masc / 54).toBeLessThan(0.6);
  });

  it('trocar o sexo de uma ficha pronta não reescreve os outros campos', () => {
    // `sanitizeAppearance` continua sem inferir peça a partir do sexo:
    // quem escolhe as peças é quem monta a ficha.
    const fem = sanitizeAppearance({ ...DEFAULT_APPEARANCE, sex: 'fem' as Sex });
    const masc = sanitizeAppearance({ ...DEFAULT_APPEARANCE, sex: 'masc' as Sex });
    expect(digito(masc)).toBe(digito(fem));
  });
});
