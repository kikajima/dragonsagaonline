import test from "node:test";
import assert from "node:assert/strict";
import {
  DRAGON_BALL_SPOTS,
  ENEMY_RULES,
  ITEM_RULES,
  QUEST_TARGETS,
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


test("Dragon Ball spots are seven unique authoritative locations", () => {
  assert.equal(DRAGON_BALL_SPOTS.length, 7);
  assert.equal(new Set(DRAGON_BALL_SPOTS.map((spot) => spot.key)).size, 7);
});

test("shop catalog keeps authoritative prices", () => {
  assert.equal(ITEM_RULES.sensu?.price, 50);
  assert.equal(ITEM_RULES.elixir?.price, 500);
  assert.equal(ITEM_RULES.espada?.price, 4000);
  assert.equal(ITEM_RULES.manto?.kind, "gear");
});

test("saga combat steps map to the expected enemy sequence", () => {
  assert.deepEqual(
    [1, 2, 3, 4, 5].map((index) => QUEST_TARGETS[index]?.enemyId),
    ["saiba", "soldado", "radix", "nappos", "vegar"],
  );
});
