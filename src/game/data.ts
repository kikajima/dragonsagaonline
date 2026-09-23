// Game data: classes, skills, items, enemies, quests, NPC chat (all original)

export interface SkillDef {
  id: string;
  name: string;
  cost: number;
  kind: 'dmg' | 'dmgall' | 'heal' | 'multi' | 'buff';
  power: number;
  desc: string;
  lv: number; // learn level
  fx: 'ki' | 'beam' | 'punch' | 'heal' | 'wind';
}

export const SKILLS: Record<string, SkillDef> = {
  onda: { id: 'onda', name: 'Onda de Ki', cost: 12, kind: 'dmg', power: 1.4, desc: 'Dispara uma esfera de Ki concentrada.', lv: 1, fx: 'ki' },
  meteoro: { id: 'meteoro', name: 'Meteoro Ki', cost: 30, kind: 'dmg', power: 2.6, desc: 'Explosão devastadora de energia.', lv: 8, fx: 'beam' },
  punho: { id: 'punho', name: 'Punho Trovejante', cost: 15, kind: 'multi', power: 0.75, desc: 'Dois golpes em alta velocidade.', lv: 4, fx: 'punch' },
  regen: { id: 'regen', name: 'Regenerar', cost: 20, kind: 'heal', power: 1.2, desc: 'Recupera HP de um aliado.', lv: 3, fx: 'heal' },
  vento: { id: 'vento', name: 'Dança do Vento', cost: 25, kind: 'dmgall', power: 1.1, desc: 'Golpeia todos os inimigos.', lv: 6, fx: 'wind' },
  grito: { id: 'grito', name: 'Grito de Guerra', cost: 18, kind: 'buff', power: 1.3, desc: 'Aumenta o ATK do grupo no turno.', lv: 5, fx: 'punch' },
};

export interface ClassDef {
  id: string;
  styleKey: string;
  name: string;
  desc: string;
  hp: number; ki: number; atk: number; def: number; spd: number;
  growth: { hp: number; ki: number; atk: number; def: number; spd: number };
  skills: string[];
}

export const CLASSES: ClassDef[] = [
  {
    id: 'saiya', styleKey: 'saiya', name: 'Guerreiro Saiya',
    desc: 'Raça guerreira de outro planeta. Equilibrado e com poder oculto.',
    hp: 120, ki: 40, atk: 22, def: 14, spd: 10,
    growth: { hp: 18, ki: 7, atk: 3.4, def: 2.2, spd: 1.4 },
    skills: ['onda', 'punho', 'meteoro'],
  },
  {
    id: 'humano', styleKey: 'humano', name: 'Lutador Humano',
    desc: 'Mestre de artes marciais da Terra. Rápido e preciso.',
    hp: 100, ki: 45, atk: 18, def: 12, spd: 15,
    growth: { hp: 14, ki: 8, atk: 2.8, def: 2.0, spd: 2.2 },
    skills: ['onda', 'punho', 'grito'],
  },
  {
    id: 'nameko', styleKey: 'nameko', name: 'Guerreiro Nameko',
    desc: 'Raça sábia e resiliente. Cura a si mesmo e aos aliados.',
    hp: 110, ki: 55, atk: 17, def: 17, spd: 9,
    growth: { hp: 16, ki: 10, atk: 2.6, def: 2.8, spd: 1.1 },
    skills: ['onda', 'regen', 'meteoro'],
  },
  {
    id: 'lutadora', styleKey: 'lutadora', name: 'Lutadora Ágil',
    desc: 'Punhos afiados como o vento. Ataca todos os inimigos.',
    hp: 95, ki: 50, atk: 19, def: 11, spd: 14,
    growth: { hp: 13, ki: 9, atk: 3.0, def: 1.8, spd: 2.0 },
    skills: ['onda', 'vento', 'meteoro'],
  },
];

export interface EnemyDef {
  id: string;
  name: string;
  art: string;
  mini?: string;
  hp: number; atk: number; def: number; spd: number; ki: number;
  exp: number; zeni: number;
  pl: number;
  skill?: string;
  boss?: boolean;
  drop?: { id: string; chance: number };
}

export const ENEMIES: Record<string, EnemyDef> = {
  saiba: { id: 'saiba', name: 'Saiba', art: 'saiba', mini: 'saiba', hp: 55, atk: 16, def: 6, spd: 10, ki: 10, exp: 22, zeni: 18, pl: 800, skill: 'onda', drop: { id: 'sensu', chance: 0.15 } },
  lobo: { id: 'lobo', name: 'Lobo do Vale', art: 'lobo', mini: 'lobo', hp: 70, atk: 19, def: 8, spd: 14, ki: 0, exp: 30, zeni: 22, pl: 1100, drop: { id: 'sensu', chance: 0.1 } },
  dino: { id: 'dino', name: 'Rex da Planície', art: 'dino', mini: 'dino', hp: 120, atk: 24, def: 12, spd: 6, ki: 0, exp: 48, zeni: 40, pl: 1900, drop: { id: 'capsula', chance: 0.12 } },
  soldado: { id: 'soldado', name: 'Soldado do Exército F', art: 'soldado', mini: 'soldado', hp: 150, atk: 30, def: 16, spd: 12, ki: 30, exp: 75, zeni: 70, pl: 2800, skill: 'onda', drop: { id: 'capsula', chance: 0.2 } },
  radix: { id: 'radix', name: 'Radix, o Enviado', art: 'radix', mini: 'boss', hp: 420, atk: 42, def: 22, spd: 14, ki: 60, exp: 400, zeni: 500, pl: 5500, skill: 'meteoro', boss: true, drop: { id: 'sensu', chance: 1 } },
  nappos: { id: 'nappos', name: 'Nappos, o Executor', art: 'nappos', mini: 'boss', hp: 700, atk: 55, def: 30, spd: 10, ki: 80, exp: 800, zeni: 900, pl: 8000, skill: 'meteoro', boss: true, drop: { id: 'capsula', chance: 1 } },
  vegar: { id: 'vegar', name: 'Príncipe Vegar', art: 'vegar', mini: 'boss', hp: 1100, atk: 70, def: 38, spd: 18, ki: 120, exp: 2000, zeni: 2500, pl: 14000, skill: 'meteoro', boss: true, drop: { id: 'sensu', chance: 1 } },
};

export interface EncounterTable { region: string; enemies: string[][] }

export const ENCOUNTERS: EncounterTable[] = [
  { region: 'planicie', enemies: [['saiba'], ['saiba', 'saiba'], ['lobo'], ['saiba', 'saiba', 'saiba']] },
  { region: 'campo', enemies: [['lobo'], ['saiba'], ['lobo', 'saiba']] },
  { region: 'estrada', enemies: [['saiba'], ['lobo']] },
  { region: 'deserto', enemies: [['soldado'], ['soldado', 'soldado'], ['lobo', 'lobo'], ['soldado', 'saiba', 'saiba']] },
  { region: 'cratera', enemies: [['soldado', 'soldado']] },
  { region: 'ilha', enemies: [['lobo'], ['dino']] },
];

export interface ItemDef {
  id: string;
  name: string;
  desc: string;
  price: number;
  kind: 'heal' | 'kiheal' | 'fullheal' | 'gear';
  power?: number;
  gear?: { atk?: number; def?: number };
}

export const ITEMS: Record<string, ItemDef> = {
  sensu: { id: 'sensu', name: 'Feijão Sensu', desc: 'Restaura 100 HP. Sabor estranho...', price: 50, kind: 'heal', power: 100 },
  capsula: { id: 'capsula', name: 'Cápsula de Ki', desc: 'Restaura 60 Ki.', price: 80, kind: 'kiheal', power: 60 },
  elixir: { id: 'elixir', name: 'Elixir do Felino', desc: 'Restaura todo o HP e Ki.', price: 500, kind: 'fullheal' },
  bastao: { id: 'bastao', name: 'Bastão Sagrado', desc: 'ATK +12. Estica quando você quer.', price: 600, kind: 'gear', gear: { atk: 12 } },
  armadura: { id: 'armadura', name: 'Traje de Treino', desc: 'DEF +10. Pesado, mas funciona.', price: 600, kind: 'gear', gear: { def: 10 } },
  espada: { id: 'espada', name: 'Espada do Dragão', desc: 'ATK +30. Corte lendário.', price: 4000, kind: 'gear', gear: { atk: 30 } },
  manto: { id: 'manto', name: 'Manto do Mestre', desc: 'DEF +25. Costurado à mão.', price: 3500, kind: 'gear', gear: { def: 25 } },
  scouter: { id: 'scouter', name: 'Scouter', desc: 'Revela o Nível de Poder dos inimigos no mapa.', price: 300, kind: 'gear' },
};

export const SHOP_STOCK = ['sensu', 'capsula', 'elixir', 'bastao', 'armadura', 'scouter', 'espada', 'manto'];

export interface QuestDef {
  id: string;
  title: string;
  desc: string;
  target?: string; // enemy id to defeat
  count?: number;
  rewardExp: number;
  rewardZeni: number;
  rewardText: string;
}

export const QUESTS: QuestDef[] = [
  { id: 'q0', title: 'O Mestre da Ilha', desc: 'Visite o Mestre Kame na ilha ao sudeste (ponte a leste do deserto). Ele vai te ensinar as bases.', rewardExp: 50, rewardZeni: 200, rewardText: 'Kurin se juntou ao grupo!' },
  { id: 'q1', title: 'Praga Verde', desc: 'Derrote 3 Saibas na planície ao sul da cidade. Eles apareceram de sementes estranhas.', target: 'saiba', count: 3, rewardExp: 120, rewardZeni: 300, rewardText: 'Kurin se juntou ao grupo!' },
  { id: 'q2', title: 'O Exército F', desc: 'Derrote 3 Soldados do Exército F no deserto a leste. Eles procuram as Esferas do Dragão.', target: 'soldado', count: 3, rewardExp: 250, rewardZeni: 600, rewardText: 'Nailo se juntou ao grupo!' },
  { id: 'q3', title: 'O Enviado', desc: 'Radix, um guerreiro do espaço, aguarda na passagem da montanha ao norte. Nível de Poder: 5.500!', target: 'radix', count: 1, rewardExp: 500, rewardZeni: 1000, rewardText: 'A cidade está mais segura... por enquanto.' },
  { id: 'q4', title: 'O Executor', desc: 'Nappos chegou com a frota! Enfrente-o na cratera vulcânica a noroeste. PL: 8.000!', target: 'nappos', count: 1, rewardExp: 900, rewardZeni: 1500, rewardText: 'O céu clareou sobre a cidade.' },
  { id: 'q5', title: 'O Príncipe', desc: 'O Príncipe Vegar o desafia no deserto profundo (leste). PL: 14.000! A Terra depende de você.', target: 'vegar', count: 1, rewardExp: 2000, rewardZeni: 3000, rewardText: 'A Terra está salva. Lenda, você se tornou lenda!' },
];

// Dragon balls locations (tile coords)
export const BALL_SPOTS: [number, number][] = [
  [13, 28], [30, 22], [25, 55], [47, 50], [58, 28], [90, 75], [40, 16],
];

// Simulated MMO players
export const FAKE_PLAYERS: { name: string; style: string; lines: string[] }[] = [
  { name: 'xXKakarotXx', style: 'saiya', lines: ['alguém topa farmar saiba?', 'meu PL tá 6.900 hehe', 'quem é boss da montanha?'] },
  { name: 'PrincipeV_BR', style: 'rival', lines: ['sou o príncipe de todos os saiyas', 'ok quem apagou a lan kkkk', '1v1 na arena?'] },
  { name: 'Kurin_Sem_Nariz', style: 'humano', lines: ['vendo feijão sensu 40z', 'alguém viu meu scouter?', 'Kienzan quando?'] },
  { name: 'NailoVerde', style: 'nameko', lines: ['regen lv 3 finalmente', 'need cápsula de ki', 'a ilha tem spawn de lobo'] },
  { name: 'LutaDora_99', style: 'lutadora', lines: ['dança do vento é OP demais', 'quest do exército F quem vai?', 'acabei de upar!!'] },
  { name: 'MestreKameFan', style: 'mestre', lines: ['o mestre dá quest boa', 'kkkkkk', 'alguém me empresta 500z?'] },
  { name: 'CapsuleCorpCEO', style: 'humano', lines: ['comprei a espada, tô OP', 'scouter vale a pena sim', 'servidor caiu? não? ok'] },
  { name: 'SaibaSlayer', style: 'saiya', lines: ['farm de saiba é xp fácil', 'quem quer party?', 'acharam esfera perto da torre!'] },
  { name: 'DragonRadar77', style: 'lutadora', lines: ['achei 2 esferas hoje!', 'a da cratera é perigosa pega', 'gg'] },
  { name: 'NomekianoPaz', style: 'nameko', lines: ['paz entre raças', 'need elixir', 'healo de graça na praça'] },
];

export const SYSTEM_LINES = [
  'Jogador entrou no servidor.',
  'Novo recorde: boss derrotado em 40s!',
  'O tempo está bom na planície.',
  'Evento 2x EXP termina em breve!',
  'Servidor estável. Divirtam-se!',
];

export const NPC_LINES: Record<string, string[]> = {
  mestre: [
    'Ah, um jovem com espírito de luta! Sente o Ki ao seu redor...',
    'Os Saibas surgiram na planície sul. Um guerreiro de verdade treina contra eles.',
    'O Nível de Poder não é tudo. Mas quase tudo! HA HA HA!',
    'Colete as 7 Esferas do Dragão e o dragão Shenlong atenderá um desejo.',
    'Radix chegou do espaço. Cuidado com o rádio dele... digo, o scouter.',
  ],
  lojista: [
    'Bem-vindo à Loja de Cápsulas! Temos de tudo, compactado em caixinhas.',
    'Feijão Sensu fresquinho! Cura até coração partido.',
    'A Espada do Dragão? Só para clientes VIP... ah, você tem zeni? Então é VIP.',
    'Dizem que tem uma esfera do dragão perto do lago, ao leste da cidade...',
  ],
  aldeao1: ['Os Saibas me comeram a plantação!', 'Dizem que a torre ao norte tem uma fonte que cura.', 'Cuidado com o deserto, o Exército F chegou.'],
  aldeao2: ['Meu filho quer virar lutador quando crescer...', 'O dragão aparece quando você junta 7 esferas douradas.', 'Compro um scouter se alguém estiver vendendo.'],
  guarda: ['A cidade está sob proteção da guarda. Aproveite a visita!', 'Fale com o Mestre Kame na ilha ao sudeste, ele procura discípulos.', 'Nível de Poder de um Saiba? Uns 800. Fraco, mas vem em bando.'],
  kurin: ['Eu sou Kurin! Bora lutar junto!', 'Sem nariz é aerodinâmico, tá?', 'Se ficar com pouca vida, eu aviso. Ou não.'],
  nailo: ['Eu sou Nailo, do clã do guerreiro verde.', 'Minha regeneração pode salvar o grupo.', 'Os céus responderão.'],
};

// Level curve
export function expForLevel(lv: number): number {
  return Math.floor(lv * lv * 25 + lv * 25);
}
