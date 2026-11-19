import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clamp01,
  computeSceneState,
  computeScrollProgress,
  getActiveScene,
} from './scrollTimeline';

test('computeScrollProgress clamps cleanly across top, middle, and bottom', () => {
  assert.equal(computeScrollProgress(0, 1750, 1000), 0);
  assert.equal(computeScrollProgress(120, 1750, 1000), 0);
  assert.equal(computeScrollProgress(-375, 1750, 1000), 0.5);
  assert.equal(computeScrollProgress(-750, 1750, 1000), 1);
  assert.equal(computeScrollProgress(-1200, 1750, 1000), 1);
  assert.equal(clamp01(Number.NaN), 0);
});

test('getActiveScene maps 5 progress bands accurately', () => {
  assert.equal(getActiveScene(0), 'scene-01');
  assert.equal(getActiveScene(0.19), 'scene-01');
  assert.equal(getActiveScene(0.25), 'scene-02');
  assert.equal(getActiveScene(0.5), 'scene-03');
  assert.equal(getActiveScene(0.75), 'scene-04');
  assert.equal(getActiveScene(0.95), 'scene-05');
  assert.equal(getActiveScene(1), 'scene-05');
});

test('timeline progression is deterministic and reversible across 0%, 25%, 50%, 75%, 100%', () => {
  const s0 = computeSceneState(0);
  const s25 = computeSceneState(0.25);
  const s50 = computeSceneState(0.5);
  const s75 = computeSceneState(0.75);
  const s100 = computeSceneState(1);

  // Neutral Scene 01 start
  assert.equal(s0.mtnFarY, 0);
  assert.equal(s0.mtnNearY, 0);
  assert.equal(s0.cloudLeftX, 0);
  assert.equal(s0.cloudRightX, 0);
  assert.equal(s0.catScale, 1);
  assert.equal(s0.steamDraw, 0);
  assert.equal(s0.steamOpacity, 0);

  // Cloud layers diverge horizontally at distinct speeds
  assert.ok(s25.cloudLeftX < 0);
  assert.ok(s25.cloudRightX > 0);
  assert.notEqual(Math.abs(s50.cloudLeftX), Math.abs(s50.cloudRightX));

  // Mountain layers move at different speeds
  assert.ok(Math.abs(s50.mtnNearY) > Math.abs(s50.mtnFarY));

  // Sun atmosphere intensifies from Scene 01 to Scene 05
  assert.ok(s50.sunGlowOpacity > s25.sunGlowOpacity);
  assert.ok(s100.sunGlowOpacity >= s75.sunGlowOpacity);

  // Steam remains hidden before Scene 04 and draws progressively from 0 -> 1 in Scene 04-05
  assert.equal(s50.steamDraw, 0);
  assert.ok(s75.steamDraw > 0 && s75.steamDraw < 1);
  assert.equal(s100.steamDraw, 1);
  assert.ok(s100.catScale > 1 && s100.catScale < 1.08);

  // Reversing scroll back to any progress returns the exact same state
  assert.deepEqual(computeSceneState(0.25), s25);
  assert.deepEqual(computeSceneState(0), s0);
});

test('cat stays strictly grounded with zero vertical offset across all scenes', () => {
  for (let i = 0; i <= 20; i++) {
    const state = computeSceneState(i / 20);
    assert.equal(state.catTranslateY, 0);
  }
});

test('reducedMotion disables parallax/scaling while preserving static completed state', () => {
  const reduced = computeSceneState(0.5, true);
  assert.equal(reduced.mtnFarY, 0);
  assert.equal(reduced.mtnNearY, 0);
  assert.equal(reduced.cloudLeftX, 0);
  assert.equal(reduced.cloudRightX, 0);
  assert.equal(reduced.plantLeftRot, 0);
  assert.equal(reduced.plantRightRot, 0);
  assert.equal(reduced.catScale, 1);
  assert.equal(reduced.catTranslateY, 0);
  assert.equal(reduced.steamDraw, 1);
  assert.ok(reduced.steamOpacity > 0);
});
