import test from "node:test";
import assert from "node:assert/strict";
import {
  ENEMY_RULES,
  scaleEnemyForSaga,
  canWalk,
  computeCharacterStats,
  isPvpSafeZone,
  minimumBattleDurationMs,
} from "./worldRules.js";

test("town road is walkable and ocean is blocked", () => {
  assert.equal(canWalk(19.5 * 16, 43.5 * 16), true);
  assert.equal(canWalk(2 * 16, 2 * 16), false);
});

test("shared character formulas include class growth and gear", () => {
  const stats = computeCharacterStats({
    classId: "saiya",
    level: 10,
    baseAtk: 5,
    baseDef: 3,
    gearOwned: ["espada", "manto"],
  });

  assert.equal(stats.maxHp, 282);
  assert.equal(stats.maxKi, 103);
  assert.equal(stats.attack, 87);
  assert.equal(stats.defense, 61);
});

test("battle validation duration stays bounded", () => {
  const stats = computeCharacterStats({
    classId: "humano",
    level: 5,
    gearOwned: [],
  });
  const duration = minimumBattleDurationMs(ENEMY_RULES.saiba!, stats);
  assert.ok(duration >= 1800);
  assert.ok(duration <= 12000);
});

test("city is a PvP safe zone while the plains are not", () => {
  assert.equal(isPvpSafeZone(19.5 * 16, 30 * 16), true);
  assert.equal(isPvpSafeZone(44 * 16, 55 * 16), false);
});


test("saga scaling increases difficulty and rewards progressively", () => {
  const base = ENEMY_RULES.saiba!;
  const saga2 = scaleEnemyForSaga(base, 1);
  const saga6 = scaleEnemyForSaga(base, 5);

  assert.equal(saga2.sagaCycle, 1);
  assert.ok(saga2.hp > base.hp);
  assert.ok(saga2.atk > base.atk);
  assert.ok(saga2.def > base.def);
  assert.ok(saga2.exp > base.exp);
  assert.ok(saga2.zeni > base.zeni);

  assert.ok(saga6.hp > saga2.hp);
  assert.ok(saga6.atk > saga2.atk);
  assert.ok(saga6.exp > saga2.exp);
  assert.ok(saga6.zeni > saga2.zeni);
});

test("boss saga scaling is tougher than common mob scaling", () => {
  const common = scaleEnemyForSaga(ENEMY_RULES.saiba!, 3);
  const boss = scaleEnemyForSaga(ENEMY_RULES.radix!, 3);

  assert.ok(boss.difficultyMultiplier > common.difficultyMultiplier);
  assert.equal(boss.rewardMultiplier, common.rewardMultiplier);
});
