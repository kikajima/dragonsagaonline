import test from "node:test";
import assert from "node:assert/strict";
import {
  ENEMY_RULES,
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
