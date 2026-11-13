/**
 * Aplicativos do universo: viagem, carteira, bichos e atividades.
 *
 * Mesma regra das telas do EdenOS: nada aqui é enfeite. Cada botão
 * chama o `UniverseSystem` de verdade e mostra o que ele respondeu,
 * inclusive quando a resposta é "não dá, e o motivo é este".
 */

import { REGIONS, getRegion } from '../regions/Region';
import { getStore, storeIsOpen, storeStock } from '../economy/Items';
import { PROPERTIES, getProperty } from '../housing/Housing';
import { MISSIONS } from '../missions/Missions';
import { getSpecies, speciesOfKind } from '../creatures/Species';
import { PET_NEEDS } from '../creatures/PetManager';
import type { UniverseSystem } from '../universe/UniverseSystem';
import { button, h } from './dom';
import { icon } from './icons';

export interface UniverseAppHost {
  universe(): UniverseSystem;
  /** Hora do mundo agora (0–24), para horário de loja. */
  worldHour(): number;
  /** Pede ao jogo para viajar (o Engine cuida da transição). */
  requestTravel(regionId: string): void;
  /** Redesenha a tela atual. */
  refresh(): void;
}

function head(title: string, subtitle?: string): HTMLDivElement {
  const element = h('div', { class: 'phone__app-head' }, h('h2', { text: title }));
  if (subtitle) element.appendChild(h('span', { class: 'muted', text: subtitle }));
  return element;
}

/** Selo colorido com a identidade da região. */
function badge(color: string, text: string): HTMLSpanElement {
  const element = h('span', { class: 'badge', text });
  element.style.background = color;
  element.style.color = '#10243a';
  return element;
}

function money(value: number): string {
  return `${value.toLocaleString('pt-BR')} ⬡`;
}

/* ------------------------- Mapa do Éden (viagem) ------------------------ */

export function buildAtlas(host: UniverseAppHost, content: HTMLElement): void {
  const universe = host.universe();
  const current = universe.regions.current;
  content.append(head('Mapa do Éden', `Você está em ${current.name}`));

  content.appendChild(
    h('p', { class: 'eden-note', text: 'As regiões são partes do mesmo mundo, não fases. Você leva tudo consigo: cristais, inventário, bichos e casa.' }),
  );

  for (const region of REGIONS) {
    const known = universe.regions.knows(region.id);
    const here = region.id === current.id;
    const card = h('div', { class: `person${known ? '' : ' is-unknown'}` });

    card.appendChild(
      h(
        'div',
        { class: 'post__head' },
        badge(region.colors[0], known ? region.name.slice(0, 2) : '??'),
        h('div', {}, h('b', { text: known ? region.name : 'Região não descoberta' }), h('small', { text: known ? region.tagline : 'Alguém há de comentar sobre ela.' })),
      ),
    );

    if (known) {
      card.appendChild(h('p', { class: 'muted', text: region.description }));
      // Dizer antes de clicar se há cenário para pisar ou não.
      card.appendChild(
        h('p', {
          class: region.playable ? 'eden-note' : 'muted',
          text: region.playable ? 'Cenário 3D pronto: dá para andar por lá.' : 'Sem cenário 3D ainda.',
        }),
      );
      card.appendChild(h('p', { class: 'muted', text: `Lugares: ${region.places.map((place) => place.name).join(' · ')}` }));
      if (!region.playable) {
        // Honestidade: a região existe como lugar do mundo, mas o cenário
        // tridimensional dela ainda não foi construído. Dizer isso é
        // melhor do que deixar o jogador viajar para o vazio.
        card.appendChild(h('p', { class: 'eden-note', text: 'O cenário desta região ainda está em construção. Ela já existe no mapa, nas lojas e nas atividades.' }));
      }

      const row = h('div', { class: 'row' });
      if (here) row.appendChild(h('span', { class: 'muted', text: 'Você está aqui.' }));
      else {
        const blocker = universe.regions.travelBlocker(region.id);
        const travel = button({
          class: 'btn btn--small' + (region.playable ? '' : ' btn--ghost'),
          icon: icon('map', 18),
          label: blocker ?? (region.playable ? `Viajar para ${region.name}` : 'Viajar mesmo assim'),
          onClick: () => {
            if (blocker) return;
            host.requestTravel(region.id);
            host.refresh();
          },
        });
        // Um botão que não leva a lugar nenhum não deve parecer clicável.
        travel.disabled = blocker !== null;
        travel.setAttribute('aria-label', blocker ?? `Viajar para ${region.name}`);
        row.appendChild(travel);
        if (region.playable) row.appendChild(h('span', { class: 'muted', text: `${Math.round(universe.regions.travelTimeTo(region.id) * 10) / 10}s de viagem` }));
      }
      card.appendChild(row);
    }
    content.appendChild(card);
  }
}

/* ----------------------------- Carteira -------------------------------- */

export function buildWallet(host: UniverseAppHost, content: HTMLElement): void {
  const universe = host.universe();
  const economy = universe.economy;
  content.append(head('Carteira', money(economy.crystals)));

  const inventory = economy.inventory();
  content.appendChild(h('h3', { text: 'Inventário' }));
  if (inventory.length === 0) content.appendChild(h('p', { class: 'muted', text: 'Nada guardado ainda.' }));
  for (const { item, quantity } of inventory) {
    const card = h('div', { class: 'person' });
    card.appendChild(h('div', { class: 'post__head' }, h('div', {}, h('b', { text: `${item.name} ×${quantity}` }), h('small', { text: item.note }))));
    card.appendChild(h('p', { class: 'muted', text: `Vale ${money(item.price)} · ${item.use}` }));
    content.appendChild(card);
  }

  content.appendChild(h('h3', { text: 'Extrato' }));
  const history = [...economy.transactions()].reverse().slice(0, 12);
  if (history.length === 0) content.appendChild(h('p', { class: 'muted', text: 'Nenhuma movimentação.' }));
  for (const entry of history) {
    const sign = entry.kind === 'compra' ? '−' : '+';
    content.appendChild(
      h('div', { class: 'post' }, h('b', { text: `${sign}${money(entry.amount)}` }), h('p', { class: 'muted', text: entry.note })),
    );
  }
}

/* ------------------------------- Lojas --------------------------------- */

export function buildStores(host: UniverseAppHost, content: HTMLElement): void {
  const universe = host.universe();
  const hour = host.worldHour();
  const region = universe.regions.current;
  content.append(head('Lojas', `${region.name} · ${Math.floor(hour)}h`));

  if (region.shops.length === 0) {
    content.appendChild(h('p', { class: 'muted', text: 'Não há lojas nesta região. Algumas coisas não se compram.' }));
    return;
  }

  for (const storeId of region.shops) {
    const store = getStore(storeId);
    if (!store) continue;
    const open = storeIsOpen(store, hour);
    const card = h('div', { class: `person${open ? '' : ' is-unknown'}` });
    card.appendChild(
      h('div', { class: 'post__head' }, h('div', {}, h('b', { text: store.name }), h('small', { text: open ? 'Aberta agora' : `Abre às ${store.opens}h` }))),
    );

    if (open) {
      for (const item of storeStock(store).slice(0, 8)) {
        const row = h('div', { class: 'row' });
        row.appendChild(h('span', {}, h('b', { text: item.name }), h('small', { class: 'muted', text: ` ${money(item.price)}` })));
        row.appendChild(
          button({
            class: 'btn btn--ghost btn--small',
            label: 'Comprar',
            onClick: () => {
              universe.buy(store.id, item.id, 1, host.worldHour());
              host.refresh();
            },
          }),
        );
        card.appendChild(row);
      }
    }
    content.appendChild(card);
  }
}

/* ------------------------------- Bichos -------------------------------- */

export function buildPets(host: UniverseAppHost, content: HTMLElement): void {
  const universe = host.universe();
  const pets = universe.pets;
  content.append(head('EdenPawl', `${pets.count} companheiro(s)`));

  for (const pet of pets.list()) {
    const species = getSpecies(pet.speciesId);
    const card = h('div', { class: 'person' });
    card.appendChild(
      h('div', { class: 'post__head' }, h('div', {}, h('b', { text: pet.name }), h('small', { text: `${species?.name ?? ''} · ${pets.mood(pet.id)}` }))),
    );
    for (const need of PET_NEEDS) {
      const value = Math.round(pet.needs[need] * 100);
      card.appendChild(h('p', { class: 'muted', text: `${need}: ${value}%` }));
    }

    const row = h('div', { class: 'row' });
    row.appendChild(
      button({
        class: 'btn btn--ghost btn--small',
        label: 'Fazer carinho',
        onClick: () => {
          universe.petPet(pet.id);
          host.refresh();
        },
      }),
    );
    row.appendChild(
      button({
        class: 'btn btn--ghost btn--small',
        label: pet.following ? 'Deixar descansar' : 'Chamar junto',
        onClick: () => {
          pets.setFollowing(pet.id, !pet.following);
          host.refresh();
        },
      }),
    );
    card.appendChild(row);
    content.appendChild(card);
  }

  content.appendChild(h('h3', { text: 'Para adoção' }));
  content.appendChild(
    h('p', { class: 'eden-note', text: 'Só animais domésticos são adotáveis. O que é selvagem continua selvagem — Saturno é clara quanto a isso.' }),
  );
  for (const species of speciesOfKind('domestico')) {
    const row = h('div', { class: 'row' });
    row.appendChild(h('span', {}, h('b', { text: species.name }), h('small', { class: 'muted', text: ` ${species.note}` })));
    row.appendChild(
      button({
        class: 'btn btn--ghost btn--small',
        label: 'Adotar',
        onClick: () => {
          universe.adoptPet(species.id, species.name);
          host.refresh();
        },
      }),
    );
    content.appendChild(row);
  }
}

/* ----------------------------- Atividades ------------------------------ */

export function buildActivities(host: UniverseAppHost, content: HTMLElement): void {
  const universe = host.universe();
  const log = universe.missions;
  content.append(head('Atividades', 'Nada aqui é obrigatório'));
  content.appendChild(
    h('p', { class: 'eden-note', text: 'O Éden não tem fases. Estas são coisas que alguém pediu ou que o lugar sugere — faça na ordem que quiser, ou não faça.' }),
  );

  const groups: { title: string; list: typeof MISSIONS }[] = [
    { title: 'Em andamento', list: log.active() },
    { title: 'Disponíveis', list: log.available() },
    { title: 'Concluídas', list: log.completed() },
  ];

  for (const group of groups) {
    if (group.list.length === 0) continue;
    content.appendChild(h('h3', { text: group.title }));
    for (const mission of group.list) {
      const card = h('div', { class: 'person' });
      const region = mission.regionId ? getRegion(mission.regionId)?.name : null;
      card.appendChild(
        h('div', { class: 'post__head' }, h('div', {}, h('b', { text: mission.title }), h('small', { text: region ?? mission.category }))),
      );
      card.appendChild(h('p', { class: 'muted', text: mission.summary }));

      const status = log.statusOf(mission.id);
      if (status === 'ativa') {
        for (const objective of mission.objectives) {
          const done = log.countOf(mission.id, objective.id);
          card.appendChild(h('p', { class: 'muted', text: `${done >= objective.count ? '✓' : '○'} ${objective.label} (${done}/${objective.count})` }));
        }
      } else if (status === 'concluida') {
        card.appendChild(h('p', { class: 'muted', text: mission.conclusion }));
      } else {
        card.appendChild(
          h(
            'div',
            { class: 'row' },
            button({
              class: 'btn btn--ghost btn--small',
              label: 'Aceitar',
              onClick: () => {
                universe.startMission(mission.id);
                host.refresh();
              },
            }),
          ),
        );
      }
      content.appendChild(card);
    }
  }
}

/* ------------------------------ Imóveis -------------------------------- */

export function buildHomes(host: UniverseAppHost, content: HTMLElement): void {
  const universe = host.universe();
  const housing = universe.housing;
  content.append(head('Imóveis', housing.list().length > 0 ? `${housing.list().length} endereço(s)` : 'Nenhum endereço ainda'));

  for (const home of housing.list()) {
    const property = getProperty(home.propertyId);
    if (!property) continue;
    const card = h('div', { class: 'person' });
    card.appendChild(
      h('div', { class: 'post__head' }, h('div', {}, h('b', { text: property.name }), h('small', { text: `${home.tenure} · ${home.items.length} móvel(is)` }))),
    );
    for (const room of property.rooms) {
      card.appendChild(h('p', { class: 'muted', text: `${room.name}: ${housing.itemsIn(property.id, room.id).length} objeto(s)` }));
    }
    content.appendChild(card);
  }

  content.appendChild(h('h3', { text: 'À venda' }));
  for (const property of PROPERTIES) {
    if (housing.owns(property.id)) continue;
    const card = h('div', { class: 'person' });
    const region = getRegion(property.regionId);
    card.appendChild(
      h('div', { class: 'post__head' }, h('div', {}, h('b', { text: property.name }), h('small', { text: `${region?.name ?? ''} · ${money(property.price)}` }))),
    );
    card.appendChild(h('p', { class: 'muted', text: property.note }));
    card.appendChild(
      h(
        'div',
        { class: 'row' },
        button({
          class: 'btn btn--ghost btn--small',
          label: `Comprar · ${money(property.price)}`,
          onClick: () => {
            universe.acquireHome(property.id, 'comprada');
            host.refresh();
          },
        }),
        button({
          class: 'btn btn--ghost btn--small',
          label: `Alugar · ${money(property.rent)}`,
          onClick: () => {
            universe.acquireHome(property.id, 'alugada');
            host.refresh();
          },
        }),
      ),
    );
    content.appendChild(card);
  }
}
