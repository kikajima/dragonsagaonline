// Turn-based battle system (SNES side-view style)
import { SKILLS, ITEMS, type EnemyDef } from './data';
import { chip } from './audio';
import { getEnemyArt, getEffectSprites } from './enemySprites';
import { getBattleSprite, getPortrait } from './charSprites';
import { panel, pText, pTextC, drawShadow } from './pixel';

export interface Fighter {
  id: string;
  name: string;
  side: 'party' | 'enemy';
  enemyId?: string;
  styleKey?: string;
  lv: number;
  hp: number; maxHp: number;
  ki: number; maxKi: number;
  atk: number; def: number; spd: number;
  skills: string[];
  alive: boolean;
  defending: boolean;
  buffed: boolean;
  transformed?: boolean;
  pl?: number;
  drop?: { id: string; chance: number };
  exp: number;
  zeni: number;
}

export interface Anim {
  kind: 'dash' | 'blast' | 'beam' | 'heal' | 'wind' | 'enemyblast' | 'transform' | 'star';
  from?: Fighter;
  to?: Fighter;
  t: number;
  dur: number;
  done?: boolean;
  hits?: number;
  onHit?: () => void;
}

export type BattleMsg = { text: string; t: number };

export type BattleResult = { win: boolean; fled: boolean; exp: number; zeni: number; drops: string[] } | null;

export interface BattleCommandEvent {
  action: 'attack' | 'skill' | 'item' | 'defend' | 'flee' | 'transform';
  skillId?: string;
  itemId?: string;
}

export interface AuthoritativeBattleState {
  playerHp: number;
  playerKi: number;
  enemyHp: number;
  enemyMaxHp: number;
  outcome: 'active' | 'win' | 'lose' | 'fled';
}

export class Battle {
  party: Fighter[] = [];
  enemies: Fighter[] = [];
  msgs: BattleMsg[] = [];
  queue: { actor: Fighter; action: 'attack' | 'skill' | 'item' | 'defend' | 'flee' | 'transform'; skillId?: string; itemId?: string; target?: Fighter }[] = [];
  currentIdx = -1; // index into turn order
  turnOrder: Fighter[] = [];
  phase: 'intro' | 'menu' | 'target' | 'skillmenu' | 'itemmenu' | 'anim' | 'msg' | 'end' | 'gameover' = 'intro';
  menuIdx = 0;
  subIdx = 0;
  pendingAction: 'attack' | 'skill' | 'item' | null = null;
  pendingSkillId: string | null = null;
  anim: Anim | null = null;
  shake = 0;
  flash = 0;
  result: BattleResult = null;
  isBoss = false;
  t = 0;
  menuTimer = 0;
  onEnd: ((r: BattleResult) => void) | null = null;
  onCommand: ((event: BattleCommandEvent) => void) | null = null;
  goldFlash = 0;
  popups: { x: number; y: number; text: string; t: number; color: string }[] = [];

  // screen position of enemy slot i (feet on ground)
  enemyPos(i: number, W: number, H: number): { x: number; y: number } {
    const slots = [
      { x: W - 280, dy: 0 },
      { x: W - 150, dy: 26 },
      { x: W - 400, dy: 44 },
    ];
    const s = slots[i % slots.length];
    const art = getEnemyArt(this.enemies[i]?.enemyId || 'saiba');
    return { x: s.x, y: H * 0.62 - art.h + s.dy };
  }

  constructor(partyFighters: Fighter[], enemyDefs: EnemyDef[], isBoss = false) {
    this.party = partyFighters;
    this.enemies = enemyDefs.map((e) => ({
      id: e.id, name: e.name, side: 'enemy' as const, enemyId: e.id,
      lv: 1, hp: e.hp, maxHp: e.hp, ki: e.ki, maxKi: e.ki,
      atk: e.atk, def: e.def, spd: e.spd, skills: e.skill ? [e.skill] : [],
      alive: true, defending: false, buffed: false, pl: e.pl,
      drop: e.drop, exp: e.exp, zeni: e.zeni,
    }));
    this.isBoss = isBoss;
    const pl = this.enemies[0]?.pl;
    if (pl) this.pushMsg(`${this.enemies[0].name}! Nível de Poder: ${pl.toLocaleString('pt-BR')}!`, 0);
    else this.pushMsg(`${this.enemies.map((e) => e.name).join(' e ')} apareceu!`, 0);
    this.buildTurnOrder();
    chip.sfx('battlestart');
  }

  pushMsg(text: string, dur = 1.4) {
    this.msgs.push({ text, t: dur });
    if (this.msgs.length > 4) this.msgs.shift();
  }

  buildTurnOrder() {
    this.turnOrder = [...this.party.filter((f) => f.alive), ...this.enemies.filter((f) => f.alive)]
      .sort((a, b) => b.spd - a.spd + (Math.random() - 0.5) * 2);
    this.currentIdx = -1;
  }

  // Advance to next actor and open menu / run enemy AI
  beginTurn() {
    const next = this.nextActor();
    if (!next) { this.win(); return; }
    if (next.side === 'party') {
      this.phase = 'menu';
      this.menuIdx = 0;
    } else {
      this.enemyAI(next);
    }
  }

  // Get next actor, start of round builds new order
  nextActor(): Fighter | null {
    for (let i = 0; i < this.turnOrder.length; i++) {
      this.currentIdx++;
      if (this.currentIdx >= this.turnOrder.length) {
        this.buildTurnOrder();
        this.party.forEach((p) => { p.buffed = false; if (p.transformed) { p.ki -= 4; if (p.ki <= 0) { p.transformed = false; this.pushMsg('A Forma Super se desfez!', 1.2); } } });
        this.enemies.forEach((e) => { e.defending = false; });
        continue;
      }
      const f = this.turnOrder[this.currentIdx];
      if (f && f.alive && f.hp > 0) return f;
    }
    this.buildTurnOrder();
    return this.nextActor();
  }

  playerCommand(action: 'attack' | 'skill' | 'item' | 'defend' | 'flee' | 'transform', skillId?: string, itemId?: string, target?: Fighter) {
    const actor = this.turnOrder[this.currentIdx];
    if (!actor) return;
    this.onCommand?.({ action, skillId, itemId });
    this.queue.push({ actor, action, skillId, itemId, target });
    this.phase = 'anim';
    this.resolveNext();
  }

  private resolveNext() {
    const cmd = this.queue.shift();
    if (!cmd) {
      // check deaths / win / lose
      if (this.enemies.every((e) => !e.alive)) { this.win(); return; }
      if (this.party.every((p) => !p.alive)) { this.lose(); return; }
      this.beginTurn();
      return;
    }
    const { actor, action, skillId, itemId, target } = cmd;
    if (!actor || !actor.alive) { this.resolveNext(); return; }
    switch (action) {
      case 'attack': this.doAttack(actor, target || this.pickEnemyTarget(actor)); break;
      case 'skill': {
        const sk = SKILLS[skillId!];
        if (!sk) { this.resolveNext(); return; }
        if (actor.ki < sk.cost) { this.pushMsg('Ki insuficiente!', 1); this.phase = 'menu'; return; }
        actor.ki -= sk.cost;
        this.doSkill(actor, sk.id, target);
        break;
      }
      case 'item': this.doItem(actor, itemId!, target); break;
      case 'defend': actor.defending = true; this.pushMsg(`${actor.name} se defende!`, 0.9); this.finish(0.7); break;
      case 'transform': this.doTransform(actor); break;
      case 'flee': this.tryFlee(actor); break;
    }
  }

  pickEnemyTarget(actor: Fighter): Fighter {
    const alive = this.enemies.filter((e) => e.alive);
    return alive[Math.floor(Math.random() * alive.length)] || alive[0];
  }

  pickPartyTarget(): Fighter {
    const alive = this.party.filter((p) => p.alive);
    return alive[Math.floor(Math.random() * alive.length)];
  }

  calcDamage(a: Fighter, d: Fighter, mult = 1): number {
    let atk = a.atk * (a.buffed ? 1.3 : 1) * (a.transformed ? 1.8 : 1);
    if (a.transformed) atk = a.atk * 1.8;
    const raw = atk * mult * (0.85 + Math.random() * 0.3) - d.def * (d.defending ? 1.6 : 1) * 0.5;
    return Math.max(1, Math.floor(raw));
  }

  doAttack(a: Fighter, t: Fighter) {
    const crit = Math.random() < 0.1;
    const dmg = this.calcDamage(a, t) * (crit ? 1.8 : 1);
    this.anim = { kind: 'dash', from: a, to: t, t: 0, dur: 0.55 };
    this.pendingDamage = { target: t, dmg, crit };
    this.anim.onHit = () => {
      this.applyDamage(t, dmg, crit);
      this.finish(0.5);
    };
  }

  pendingDamage: { target: Fighter; dmg: number; crit: boolean } | null = null;

  doSkill(a: Fighter, skillId: string, target?: Fighter) {
    const sk = SKILLS[skillId];
    if (sk.kind === 'heal') {
      const t = target && target.side === 'party' ? target : a;
      const heal = Math.floor(a.ki * sk.power * 0.9 + a.atk * 0.5);
      this.anim = { kind: 'heal', from: a, to: t, t: 0, dur: 0.7 };
      this.anim.onHit = () => {
        t.hp = Math.min(t.maxHp, t.hp + heal);
        chip.sfx('heal');
        this.pushMsg(`${t.name} recuperou ${heal} HP!`, 1.1);
        this.finish(0.6);
      };
    } else if (sk.kind === 'buff') {
      this.party.forEach((p) => { if (p.alive) p.buffed = true; });
      chip.sfx('crit');
      this.pushMsg('O ATK do grupo aumentou!', 1.1);
      this.finish(0.8);
    } else if (sk.kind === 'dmgall' || sk.kind === 'multi') {
      const targets = sk.kind === 'dmgall' ? this.enemies.filter((e) => e.alive) : [this.pickEnemyTarget(a)];
      const hits = sk.kind === 'multi' ? 2 : 1;
      this.anim = { kind: sk.fx === 'wind' ? 'wind' : 'beam', from: a, to: targets[0], t: 0, dur: 0.8, hits };
      const dmgPer = targets.map((t) => this.calcDamage(a, t, sk.power));
      this.anim.onHit = () => {
        targets.forEach((t, i) => this.applyDamage(t, dmgPer[i], false));
        chip.sfx(sk.fx === 'wind' ? 'crit' : 'beam');
        this.finish(0.7);
      };
    } else {
      const t = target && target.side === 'enemy' && target.alive ? target : this.pickEnemyTarget(a);
      const dmg = this.calcDamage(a, t, sk.power);
      this.anim = { kind: sk.fx === 'beam' ? 'beam' : 'blast', from: a, to: t, t: 0, dur: 0.8 };
      this.anim.onHit = () => {
        this.applyDamage(t, dmg, false);
        chip.sfx(sk.fx === 'beam' ? 'beam' : 'ki');
        this.finish(0.6);
      };
    }
  }

  doItem(a: Fighter, itemId: string, target?: Fighter) {
    const it = ITEMS[itemId];
    const inv = this.inventory!;
    if (!it || (inv.get(itemId) || 0) <= 0) { this.phase = 'menu'; return; }
    inv.set(itemId, (inv.get(itemId) || 0) - 1);
    const t = target && target.side === 'party' ? target : a;
    if (it.kind === 'heal') { t.hp = Math.min(t.maxHp, t.hp + (it.power || 0)); this.pushMsg(`${t.name} recuperou HP!`, 1); }
    else if (it.kind === 'kiheal') { t.ki = Math.min(t.maxKi, t.ki + (it.power || 0)); this.pushMsg(`${t.name} recuperou Ki!`, 1); }
    else if (it.kind === 'fullheal') { t.hp = t.maxHp; t.ki = t.maxKi; this.pushMsg(`${t.name} está totalmente restaurado!`, 1.1); }
    chip.sfx('item');
    this.finish(0.7);
  }

  inventory: Map<string, number> | null = null;

  doTransform(a: Fighter) {
    if (a.ki < 20) { this.pushMsg('Ki insuficiente para transformar!', 1); this.phase = 'menu'; return; }
    a.transformed = true;
    this.goldFlash = 1;
    chip.sfx('transform');
    this.shake = 0.6;
    this.anim = { kind: 'transform', from: a, t: 0, dur: 1.0 };
    this.anim.onHit = () => {
      this.pushMsg(`${a.name} se transformou! O poder explodiu!`, 1.4);
      this.finish(0.8);
    };
  }

  tryFlee(a: Fighter) {
    if (this.isBoss) { this.pushMsg('Não dá para fugir desta batalha!', 1); this.phase = 'menu'; return; }
    if (Math.random() < 0.7) {
      chip.sfx('flee');
      this.pushMsg('O grupo fugiu!', 1);
      this.result = { win: false, fled: true, exp: 0, zeni: 0, drops: [] };
      this.phase = 'end';
      this.menuTimer = 1.2;
    } else {
      this.pushMsg('A fuga falhou!', 1);
      this.finish(0.8);
    }
  }

  applyDamage(t: Fighter, dmg: number, crit: boolean) {
    t.hp -= dmg;
    this.shake = crit ? 0.4 : 0.25;
    chip.sfx(crit ? 'crit' : 'hit');
    this.pushMsg(crit ? `CRÍTICO! ${dmg} de dano em ${t.name}!` : `${t.name} levou ${dmg} de dano!`, 1.1);
    // damage popup
    if (t.side === 'enemy') {
      const idx = this.enemies.indexOf(t);
      const pos = this.enemyPos(idx, 960, 600);
      this.popups.push({ x: pos.x + 40, y: pos.y + 10, text: (crit ? '' : '') + dmg, t: 1.1, color: crit ? '#f8d030' : '#fff' });
    } else {
      const idx = this.party.indexOf(t);
      this.popups.push({ x: 80, y: 90 + idx * 66, text: '-' + dmg, t: 1.1, color: '#f06060' });
    }
    if (t.hp <= 0) {
      t.hp = 0;
      t.alive = false;
      t.transformed = false;
      chip.sfx('dead');
      this.pushMsg(`${t.name} foi derrotado!`, 1.2);
    }
  }

  enemyAI(e: Fighter) {
    const alive = this.party.filter((p) => p.alive);
    if (alive.length === 0) { this.lose(); return; }
    const t = alive[Math.floor(Math.random() * alive.length)];
    // 35% chance to use skill if has ki
    if (e.skills.length && e.ki >= 12 && Math.random() < 0.4) {
      const sk = SKILLS[e.skills[0]];
      e.ki -= sk.cost;
      const dmg = this.calcDamage(e, t, sk.power);
      this.anim = { kind: 'enemyblast', from: e, to: t, t: 0, dur: 0.7 };
      this.anim.onHit = () => {
        this.applyDamage(t, dmg, false);
        chip.sfx('ki');
        this.finish(0.6);
      };
    } else {
      this.doAttack(e, t);
    }
  }

  finish(delay: number) {
    this.phase = 'anim';
    this.finishDelay = delay;
  }
  finishDelay = 0;

  win() {
    const exp = this.enemies.reduce((s, e) => s + e.exp, 0);
    const zeni = this.enemies.reduce((s, e) => s + e.zeni, 0);
    const drops: string[] = [];
    this.enemies.forEach((e) => {
      if (e.drop && Math.random() < e.drop.chance) drops.push(e.drop.id);
    });
    chip.sfx('levelup');
    this.pushMsg('Vitória!', 1.2);
    this.result = { win: true, fled: false, exp, zeni, drops };
    this.phase = 'end';
    this.menuTimer = 1.6;
  }

  lose() {
    this.pushMsg('O grupo foi derrotado...', 1.4);
    this.result = { win: false, fled: false, exp: 0, zeni: 0, drops: [] };
    this.phase = 'gameover';
    this.menuTimer = 1.8;
  }

  // ---------- Update & Render ----------
  update(dt: number) {
    this.t += dt;
    if (this.shake > 0) this.shake -= dt;
    if (this.flash > 0) this.flash -= dt;
    if (this.goldFlash > 0) this.goldFlash -= dt;

    if (this.phase === 'intro') {
      this.menuTimer += dt;
      if (this.menuTimer > 1.2) this.beginTurn();
    } else if (this.phase === 'menu') {
      // safety: victory/defeat can also happen while waiting for input
      if (this.enemies.every((e) => !e.alive)) this.win();
      else if (this.party.every((p) => !p.alive)) this.lose();
    } else if (this.phase === 'anim') {
      if (this.anim) {
        this.anim.t += dt;
        if (this.anim.kind === 'dash' || this.anim.kind === 'blast' || this.anim.kind === 'beam' || this.anim.kind === 'heal' || this.anim.kind === 'enemyblast' || this.anim.kind === 'wind' || this.anim.kind === 'transform') {
          const hitAt = this.anim.kind === 'dash' ? 0.55 * this.anim.dur : 0.6 * this.anim.dur;
          if (!this.anim.done && this.anim.t >= hitAt && this.anim.onHit) {
            this.anim.done = true;
            this.anim.onHit();
            this.anim = null;
            this.finishDelay = Math.max(this.finishDelay, 0.4);
            return;
          }
        }
        if (this.anim && this.anim.t >= this.anim.dur) this.anim = null;
      } else {
        this.finishDelay -= dt;
        if (this.finishDelay <= 0) {
          if (this.enemies.every((e) => !e.alive)) { this.win(); return; }
          if (this.party.every((p) => !p.alive)) { this.lose(); return; }
          this.resolveNext();
        }
      }
    } else if (this.phase === 'end' || this.phase === 'gameover') {
      this.menuTimer -= dt;
      if (this.menuTimer <= 0 && this.onEnd) {
        const cb = this.onEnd;
        this.onEnd = null;
        cb(this.result);
      }
    }
    // msgs decay
    this.msgs.forEach((m) => (m.t -= dt));
    this.msgs = this.msgs.filter((m) => m.t > 0);
    // popups decay
    this.popups.forEach((p) => (p.t -= dt));
    this.popups = this.popups.filter((p) => p.t > 0);
  }

  render(g: CanvasRenderingContext2D, W: number, H: number) {
    const sx = this.shake > 0 ? (Math.random() - 0.5) * 8 * this.shake : 0;
    const sy = this.shake > 0 ? (Math.random() - 0.5) * 8 * this.shake : 0;
    g.save();
    g.translate(sx, sy);

    // Battle background
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, this.isBoss ? '#481828' : '#284878');
    grad.addColorStop(0.6, this.isBoss ? '#782838' : '#4878a8');
    grad.addColorStop(1, this.isBoss ? '#a84838' : '#78a8c8');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    // ground
    g.fillStyle = this.isBoss ? '#582820' : '#3d7848';
    g.fillRect(0, H * 0.62, W, H * 0.38);
    g.fillStyle = this.isBoss ? '#482018' : '#33683c';
    for (let i = 0; i < 12; i++) g.fillRect(((i * 97) % W), H * 0.62 + ((i * 53) % (H * 0.35)), 20, 3);
    // distant mountains (SNES depth)
    g.fillStyle = this.isBoss ? '#34121c' : '#28405e';
    g.beginPath();
    g.moveTo(0, H * 0.62);
    for (let i = 0; i <= 5; i++) {
      const mx = (W / 5) * i;
      const mh = 46 + ((i * 71) % 58);
      g.lineTo(mx - W / 10, H * 0.62 - mh);
      g.lineTo(mx, H * 0.62);
    }
    g.closePath();
    g.fill();
    // clouds
    g.fillStyle = 'rgba(255,255,255,0.5)';
    for (let i = 0; i < 4; i++) {
      const cx = (i * 210 + this.t * 12) % (W + 120) - 60;
      g.fillRect(cx, 40 + i * 22, 60, 10);
      g.fillRect(cx + 12, 32 + i * 22, 36, 10);
    }

    const fx = getEffectSprites();

    // Enemies (right side, feet on ground)
    const aliveEnemies = this.enemies.filter((e) => e.alive);
    this.enemies.forEach((e, i) => {
      const art = getEnemyArt(e.enemyId || 'saiba');
      const pos = this.enemyPos(i, W, H);
      const bob = Math.sin(this.t * 3 + i * 1.5) * 4;
      const ex = pos.x;
      const ey = pos.y + bob;
      if (e.alive) {
        // shadow
        g.fillStyle = 'rgba(0,0,0,0.3)';
        g.beginPath();
        g.ellipse(pos.x + art.w / 2, H * 0.62 + 14 + Math.floor(i / 3) * 0, art.w * 0.4, 8, 0, 0, Math.PI * 2);
        g.fill();
        g.drawImage(art.body, ex, ey);
        // mini HP bar
        g.fillStyle = '#101828';
        g.fillRect(ex + art.w / 2 - 30, ey - 10, 60, 6);
        g.fillStyle = '#f04040';
        g.fillRect(ex + art.w / 2 - 29, ey - 9, 58 * Math.max(0, e.hp / e.maxHp), 4);
        if (e.pl && this.t < 6) {
          pTextC(g, `PL ${e.pl.toLocaleString('pt-BR')}`, ex + art.w / 2, ey + art.h + 4, 7, '#f0a838');
        }
      } else {
        g.globalAlpha = 0.2;
        g.drawImage(art.body, ex, ey + 26);
        g.globalAlpha = 1;
      }
    });

    // Party fighters standing on the field (left side, facing the enemies)
    const partyPos = (i: number) => {
      const slots = [
        { x: 128, dy: 0 },
        { x: 58, dy: 24 },
        { x: 200, dy: 34 },
      ];
      const s = slots[i % slots.length];
      return { x: s.x, y: H * 0.62 + 28 + s.dy };
    };
    this.party.forEach((f, i) => {
      const dashing = this.anim?.kind === 'dash' && this.anim.from === f;
      if (!f.alive || dashing) return;
      const spr = getBattleSprite(f.styleKey || 'saiya', !!f.transformed);
      const pos = partyPos(i);
      const bob = Math.sin(this.t * 2.4 + i * 1.7) * 3;
      const fy = pos.y - spr.height + bob;
      drawShadow(g, pos.x + spr.width / 2, H * 0.62 + 32, spr.width * 0.3, 7);
      if (f.transformed) {
        // golden aura flicker (Forma Super)
        g.globalAlpha = 0.35 + Math.sin(this.t * 11) * 0.15;
        g.fillStyle = '#f8d030';
        g.beginPath();
        g.ellipse(pos.x + spr.width / 2, fy + spr.height * 0.55, spr.width * 0.62, spr.height * 0.55, 0, 0, Math.PI * 2);
        g.fill();
        g.globalAlpha = 1;
      }
      g.drawImage(spr, pos.x, fy);
    });

    // Party attack anim (dash) — party dashes right, enemy lunges left
    if (this.anim && (this.anim.kind === 'dash')) {
      const a = this.anim;
      const p = Math.min(1, a.t / (0.55 * a.dur));
      const f = a.from!;
      if (f.side === 'enemy') {
        const ti = this.enemies.indexOf(f);
        const pos = this.enemyPos(ti, W, H);
        const art = getEnemyArt(f.enemyId || 'saiba');
        const tx = 170;
        const ty = H * 0.62 - art.h;
        const x = pos.x - (pos.x - tx) * p;
        const y = pos.y - (pos.y - ty) * p * 0.5;
        g.drawImage(art.body, x, y);
      } else {
        const spr = getBattleSprite(f.styleKey || 'saiya', !!f.transformed);
        const target = a.to && a.to.alive ? a.to : (aliveEnemies[0] || this.enemies[0]);
        const ti = this.enemies.indexOf(target);
        const pos = this.enemyPos(ti, W, H);
        const sx0 = partyPos(this.party.indexOf(f)).x;
        const sy0 = H * 0.62 + 28 - spr.height;
        const tx = pos.x - spr.width * 0.35;
        const x = sx0 + (tx - sx0) * p;
        const y = sy0 + Math.sin(p * Math.PI) * -34;
        // speed trail
        if (p > 0.12) {
          g.globalAlpha = 0.3;
          g.drawImage(spr, x - (tx - sx0) * 0.12, y + 8);
          g.globalAlpha = 0.18;
          g.drawImage(spr, x - (tx - sx0) * 0.22, y + 14);
          g.globalAlpha = 1;
        }
        g.drawImage(spr, x, y);
      }
    }
    if (this.anim && (this.anim.kind === 'blast' || this.anim.kind === 'enemyblast' || this.anim.kind === 'beam' || this.anim.kind === 'wind')) {
      const a = this.anim;
      const p = Math.min(1, a.t / a.dur);
      const target = a.to && a.to.alive ? a.to : (aliveEnemies[0] || this.enemies[0]);
      const ti = this.enemies.indexOf(target);
      const pos = this.enemyPos(ti, W, H);
      const tx = pos.x + 30;
      const ty = pos.y + 30;
      if (a.kind === 'blast' || a.kind === 'enemyblast') {
        const fromX = a.kind === 'blast' ? 80 : tx + 120;
        const x = fromX + (tx - fromX) * p;
        const r = 10 + Math.sin(p * Math.PI) * 8;
        g.fillStyle = '#88d8f8';
        g.beginPath(); g.arc(x, ty, r, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#ffffff';
        g.beginPath(); g.arc(x, ty, r * 0.55, 0, Math.PI * 2); g.fill();
      } else if (a.kind === 'beam') {
        const w = Math.max(0, (tx - 70) * Math.min(1, p * 2));
        g.fillStyle = '#48c8f8';
        g.fillRect(70, ty - 12, w, 24);
        g.fillStyle = '#ffffff';
        g.fillRect(70, ty - 6, w, 12);
      } else if (a.kind === 'wind') {
        g.strokeStyle = 'rgba(136,216,248,0.8)';
        g.lineWidth = 3;
        for (let i = 0; i < 3; i++) {
          g.beginPath();
          g.arc(tx, ty, 30 + i * 18 + p * 60, 0, Math.PI * 2);
          g.stroke();
        }
      }
    }
    if (this.anim && this.anim.kind === 'heal') {
      const a = this.anim;
      const p = Math.min(1, a.t / a.dur);
      const t = a.to || a.from!;
      g.fillStyle = `rgba(88,248,136,${0.7 * (1 - p)})`;
      g.beginPath();
      g.arc(W * 0.28, H * 0.4, 30 + p * 30, 0, Math.PI * 2);
      g.fill();
      g.drawImage(fx.star, W * 0.28 - 12, H * 0.4 - 40 - p * 20);
    }
    if (this.anim && this.anim.kind === 'transform') {
      const a = this.anim;
      const p = Math.min(1, a.t / a.dur);
      g.fillStyle = `rgba(248,208,48,${0.5 * (1 - p)})`;
      g.fillRect(0, 0, W, H);
      for (let i = 0; i < 8; i++) {
        const yy = H - p * H * 1.1 + i * 40;
        g.drawImage(fx.aura, 40 + i * 24, yy, 36, 60);
      }
    }

    // Impact stars when just hit
    if (!this.anim && this.shake > 0.1) {
      const target = aliveEnemies[0] || this.enemies[0];
      if (target) {
        const ti = this.enemies.indexOf(target);
        const pos = this.enemyPos(ti, W, H);
        g.drawImage(fx.star, pos.x + 20, pos.y + 20);
        g.drawImage(fx.star, pos.x + 60, pos.y + 50);
      }
    }

    // Damage popups
    this.popups.forEach((p) => {
      const yy = p.y - (1.1 - p.t) * 40;
      g.globalAlpha = Math.min(1, p.t * 2);
      pTextC(g, p.text, p.x, yy, 12, p.color);
      g.globalAlpha = 1;
    });

    // Party panel (left, compact)
    panel(g, 10, 60, 240, 26 + this.party.length * 56);
    this.party.forEach((f, i) => {
      const y = 72 + i * 56;
      const port = getPortrait(f.styleKey || 'saiya');
      g.globalAlpha = f.alive ? 1 : 0.3;
      g.drawImage(port, 20, y);
      g.globalAlpha = 1;
      pText(g, f.name, 62, y + 2, 8, f.alive ? '#fff' : '#8890a0');
      pText(g, `HP ${Math.max(0, Math.round(f.hp))}/${f.maxHp}`, 62, y + 20, 7, '#a8f0a8');
      pText(g, `KI ${f.ki}/${f.maxKi}`, 62, y + 34, 7, '#88c8f8');
      if (f.transformed) pText(g, 'SUPER!', 178, y + 2, 7, '#f8d030');
      if (f.buffed) pText(g, 'UP!', 178, y + 20, 7, '#f08838');
    });

    // Message log (top)
    panel(g, W / 2 - 180, 8, 360, 20 + this.msgs.length * 14);
    this.msgs.forEach((m, i) => {
      pText(g, m.text, W / 2 - 168, 16 + i * 14, 8, '#fff');
    });

    // Command menu (bottom)
    if (this.phase === 'menu') {
      const actor = this.turnOrder[this.currentIdx];
      const cmds = ['Atacar', 'Artes Ki', 'Item', 'Defender', 'Fugir'];
      if (actor?.transformed === false && this.canTransform(actor)) cmds.splice(4, 0, 'Transformar');
      panel(g, W / 2 - 200, H - 78, 400, 70);
      cmds.forEach((c, i) => {
        const col = i % 3, row = Math.floor(i / 3);
        const x = W / 2 - 180 + col * 130;
        const y = H - 64 + row * 24;
        if (i === this.menuIdx) { g.fillStyle = '#f0c030'; g.fillRect(x - 8, y - 3, 118, 20); }
        pText(g, c, x, y, 8, i === this.menuIdx ? '#101828' : '#fff');
      });
      pText(g, `${actor?.name || ''} - escolha (setas + Z)`, W / 2 - 180, H - 14, 7, '#a8b0c0');
    }
    if (this.phase === 'skillmenu') {
      const actor = this.turnOrder[this.currentIdx];
      const skills = actor ? actor.skills.map((s) => SKILLS[s]).filter(Boolean) : [];
      panel(g, W / 2 - 220, H - 108, 440, 100);
      skills.forEach((sk, i) => {
        const y = H - 94 + i * 22;
        if (i === this.subIdx) { g.fillStyle = '#f0c030'; g.fillRect(W / 2 - 206, y - 3, 400, 20); }
        pText(g, `${sk.name} (KI ${sk.cost})`, W / 2 - 198, y, 8, actor && actor.ki >= sk.cost ? (i === this.subIdx ? '#101828' : '#fff') : '#8890a0');
      });
    }
    if (this.phase === 'itemmenu') {
      const items = [...(this.inventory || new Map()).entries()].filter(([id, n]) => n > 0 && ITEMS[id]);
      panel(g, W / 2 - 220, H - 108, 440, 100);
      items.slice(0, 4).forEach(([id, n], i) => {
        const y = H - 94 + i * 22;
        if (i === this.subIdx) { g.fillStyle = '#f0c030'; g.fillRect(W / 2 - 206, y - 3, 400, 20); }
        pText(g, `${ITEMS[id].name} x${n}`, W / 2 - 198, y, 8, i === this.subIdx ? '#101828' : '#fff');
      });
      if (items.length === 0) pText(g, 'Sem itens!', W / 2 - 100, H - 90, 8, '#f08888');
    }
    if (this.phase === 'target') {
      const target = this.pendingTarget;
      if (target) {
        const idx = this.enemies.indexOf(target);
        const art = getEnemyArt(target.enemyId || 'saiba');
        const pos = this.enemyPos(idx, W, H);
        const ex = pos.x, ey = pos.y;
        g.strokeStyle = '#f04040';
        g.lineWidth = 3;
        const pulse = 4 + Math.sin(this.t * 8) * 3;
        g.strokeRect(ex - pulse, ey - pulse, art.body.width + pulse * 2, art.body.height + pulse * 2);
        pTextC(g, 'Z: confirmar  X: voltar', W / 2, H - 30, 8, '#f8d030');
      }
    }

    // End overlay
    if (this.phase === 'end' && this.result) {
      panel(g, W / 2 - 140, H / 2 - 60, 280, 120);
      pTextC(g, this.result.win ? 'VITÓRIA!' : 'FUGIU!', W / 2, H / 2 - 44, 12, '#f8d030');
      pTextC(g, `EXP +${this.result.exp}`, W / 2, H / 2 - 14, 9, '#a8f0a8');
      pTextC(g, `Zeni +${this.result.zeni}`, W / 2, H / 2 + 4, 9, '#f8d030');
      if (this.result.drops.length) pTextC(g, `Item: ${this.result.drops.map((d) => ITEMS[d]?.name).join(', ')}`, W / 2, H / 2 + 22, 8, '#88c8f8');
      pTextC(g, '...', W / 2, H / 2 + 44, 8, '#a8b0c0');
    }
    if (this.phase === 'gameover') {
      g.fillStyle = 'rgba(0,0,0,0.7)';
      g.fillRect(0, 0, W, H);
      pTextC(g, 'DERROTA...', W / 2, H / 2 - 30, 14, '#f04040');
      pTextC(g, 'Você acordará na cidade.', W / 2, H / 2 + 6, 9, '#fff');
    }

    g.restore();
  }

  pendingTarget: Fighter | null = null;

  canTransform(f: Fighter): boolean {
    // super form unlocked flag handled by game; party fighters carry it
    return (f as Fighter & { canSuper?: boolean }).canSuper === true && !f.transformed && f.ki >= 20;
  }

  // keyboard handling
  key(k: string): boolean {
    if (this.phase === 'menu') {
      const actor = this.turnOrder[this.currentIdx];
      const cmds = ['attack', 'skill', 'item', 'defend', 'flee'];
      if (actor && this.canTransform(actor)) cmds.splice(4, 0, 'transform');
      const n = cmds.length;
      if (k === 'ArrowUp' || k === 'ArrowLeft') { this.menuIdx = (this.menuIdx - 1 + n) % n; chip.sfx('menu'); return true; }
      if (k === 'ArrowDown' || k === 'ArrowRight') { this.menuIdx = (this.menuIdx + 1) % n; chip.sfx('menu'); return true; }
      if (k === 'z' || k === 'Enter' || k === 'Z') {
        chip.sfx('confirm');
        const c = cmds[this.menuIdx];
        if (c === 'attack') { this.pendingAction = 'attack'; this.pendingTarget = this.pickEnemyTarget(this.turnOrder[this.currentIdx]); this.phase = 'target'; }
        else if (c === 'skill') { this.phase = 'skillmenu'; this.subIdx = 0; }
        else if (c === 'item') { this.phase = 'itemmenu'; this.subIdx = 0; }
        else if (c === 'defend') this.playerCommand('defend');
        else if (c === 'flee') this.playerCommand('flee');
        else if (c === 'transform') this.playerCommand('transform');
        return true;
      }
    } else if (this.phase === 'target') {
      const alive = this.enemies.filter((e) => e.alive);
      const idx = alive.indexOf(this.pendingTarget!);
      if (k === 'ArrowLeft' || k === 'ArrowUp') {
        this.pendingTarget = alive[(idx - 1 + alive.length) % alive.length];
        chip.sfx('menu'); return true;
      }
      if (k === 'ArrowRight' || k === 'ArrowDown') {
        this.pendingTarget = alive[(idx + 1) % alive.length];
        chip.sfx('menu'); return true;
      }
      if (k === 'z' || k === 'Enter' || k === 'Z') {
        chip.sfx('confirm');
        if (this.pendingAction === 'skill') this.playerCommand('skill', this.pendingSkillId || undefined, undefined, this.pendingTarget!);
        else this.playerCommand('attack', undefined, undefined, this.pendingTarget!);
        this.pendingAction = null;
        return true;
      }
      if (k === 'x' || k === 'Escape') { this.phase = 'menu'; chip.sfx('cancel'); return true; }
    } else if (this.phase === 'skillmenu') {
      const actor = this.turnOrder[this.currentIdx];
      const skills = actor ? actor.skills.map((s) => SKILLS[s]).filter(Boolean) : [];
      if (k === 'ArrowUp') { this.subIdx = (this.subIdx - 1 + skills.length) % skills.length; chip.sfx('menu'); return true; }
      if (k === 'ArrowDown') { this.subIdx = (this.subIdx + 1) % skills.length; chip.sfx('menu'); return true; }
      if (k === 'z' || k === 'Enter' || k === 'Z') {
        const sk = skills[this.subIdx];
        if (!sk) return true;
        if (actor && actor.ki < sk.cost) { chip.sfx('cancel'); return true; }
        chip.sfx('confirm');
        this.pendingAction = 'skill';
        this.pendingSkillId = sk.id;
        if (sk.kind === 'heal') {
          // target party member: just cast on self/lowest? cast on actor for simplicity, or target selection of party
          this.playerCommand('skill', sk.id, undefined, this.lowestHpAlly());
        } else if (sk.kind === 'dmgall' || sk.kind === 'buff') {
          this.playerCommand('skill', sk.id);
        } else {
          this.pendingTarget = this.pickEnemyTarget(actor);
          this.phase = 'target';
        }
        return true;
      }
      if (k === 'x' || k === 'Escape') { this.phase = 'menu'; chip.sfx('cancel'); return true; }
    } else if (this.phase === 'itemmenu') {
      const items = [...(this.inventory || new Map()).entries()].filter(([id, n]) => n > 0 && ITEMS[id] && ITEMS[id].kind !== 'gear');
      if (items.length === 0) { if (k === 'x' || k === 'Escape') { this.phase = 'menu'; chip.sfx('cancel'); } return true; }
      if (k === 'ArrowUp') { this.subIdx = (this.subIdx - 1 + items.length) % items.length; chip.sfx('menu'); return true; }
      if (k === 'ArrowDown') { this.subIdx = (this.subIdx + 1) % items.length; chip.sfx('menu'); return true; }
      if (k === 'z' || k === 'Enter' || k === 'Z') {
        chip.sfx('confirm');
        const [id] = items[this.subIdx];
        this.playerCommand('item', undefined, id);
        return true;
      }
      if (k === 'x' || k === 'Escape') { this.phase = 'menu'; chip.sfx('cancel'); return true; }
    } else if (this.phase === 'intro' || this.phase === 'anim' || this.phase === 'end') {
      // skip waiting
      if (k === 'z' || k === 'Enter') {
        if (this.phase === 'anim' && this.msgs.length) { this.msgs.forEach((m) => (m.t = Math.min(m.t, 0.1))); return true; }
      }
    }
    return false;
  }

  syncAuthoritativeState(state: AuthoritativeBattleState) {
    const player = this.party[0];
    const enemy = this.enemies[0];

    if (player) {
      player.hp = Math.max(0, Math.min(player.maxHp, Math.floor(state.playerHp)));
      player.ki = Math.max(0, Math.min(player.maxKi, Math.floor(state.playerKi)));
      player.alive = player.hp > 0;
    }

    if (enemy) {
      enemy.maxHp = Math.max(1, Math.floor(state.enemyMaxHp));
      enemy.hp = Math.max(0, Math.min(enemy.maxHp, Math.floor(state.enemyHp)));
      enemy.alive = enemy.hp > 0;
    }

    if (state.outcome === 'win') {
      this.enemies.forEach((fighter) => {
        fighter.hp = 0;
        fighter.alive = false;
      });
    } else if (state.outcome === 'lose') {
      this.party.forEach((fighter) => {
        fighter.hp = 0;
        fighter.alive = false;
      });
    } else if (state.outcome === 'fled') {
      this.result = { win: false, fled: true, exp: 0, zeni: 0, drops: [] };
      this.phase = 'end';
      this.menuTimer = 0.15;
    }
  }

  lowestHpAlly(): Fighter {
    const alive = this.party.filter((p) => p.alive);
    return alive.reduce((a, b) => (a.hp / a.maxHp <= b.hp / b.maxHp ? a : b), alive[0]);
  }
}
