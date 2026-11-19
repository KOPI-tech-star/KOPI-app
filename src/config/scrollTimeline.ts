export type SceneId =
  | 'scene-01'
  | 'scene-02'
  | 'scene-03'
  | 'scene-04'
  | 'scene-05';

export interface ScrollSceneState {
  progress: number;
  activeScene: SceneId;
  /** Subtle sun atmospheric halo opacity [0..1] */
  sunGlowOpacity: number;
  /** Subtle sun atmospheric halo scale [1..1.24] */
  sunGlowScale: number;
  /** Distant sky/mountain layer vertical shift (px) */
  mtnFarY: number;
  /** Distant sky/mountain layer scale */
  mtnFarScale: number;
  /** Near mountain layer vertical parallax shift (px) */
  mtnNearY: number;
  /** Near mountain layer horizontal parallax shift (px) */
  mtnNearX: number;
  /** Left cloud horizontal drift (px) */
  cloudLeftX: number;
  /** Left cloud vertical drift (px) */
  cloudLeftY: number;
  /** Right cloud horizontal drift (px) */
  cloudRightX: number;
  /** Right cloud vertical drift (px) */
  cloudRightY: number;
  /** Left foreground plant rotation (deg, anchored at bottom-left) */
  plantLeftRot: number;
  /** Right foreground plant rotation (deg, anchored at bottom-right) */
  plantRightRot: number;
  /** Foreground plant gentle vertical settle (px) */
  plantY: number;
  /** Foreground terrain mound prominence scale (anchored at bottom-center) */
  terrainScale: number;
  /** Official Kopi cat subtle emphasis scale (anchored strictly at bottom-center) */
  catScale: number;
  /** Fixed cat vertical translation — strictly 0 to guarantee ground contact */
  catTranslateY: 0;
  /** Official Kopi cat subtle opacity refinement */
  catOpacity: number;
  /** SVG coffee steam draw progress [0..1] for stroke-dashoffset */
  steamDraw: number;
  /** SVG coffee steam opacity [0..1] */
  steamOpacity: number;
}

export const SCROLL_TRACK_SVH = 175;

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

export function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * clamp01(t);
}

export function easeInOutCubic(t: number): number {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

export function segmentProgress(
  progress: number,
  start: number,
  end: number,
): number {
  if (end <= start) return progress >= end ? 1 : 0;
  return clamp01((progress - start) / (end - start));
}

export function computeScrollProgress(
  sectionTop: number,
  sectionHeight: number,
  viewportHeight: number,
): number {
  const scrollableDistance = Math.max(1, sectionHeight - viewportHeight);
  return clamp01(-sectionTop / scrollableDistance);
}

export function getActiveScene(progress: number): SceneId {
  const p = clamp01(progress);
  if (p < 0.2) return 'scene-01';
  if (p < 0.45) return 'scene-02';
  if (p < 0.7) return 'scene-03';
  if (p < 0.9) return 'scene-04';
  return 'scene-05';
}

export function computeSceneState(
  rawProgress: number,
  reducedMotion = false,
): ScrollSceneState {
  if (reducedMotion) {
    return {
      progress: 1,
      activeScene: 'scene-05',
      sunGlowOpacity: 0.42,
      sunGlowScale: 1,
      mtnFarY: 0,
      mtnFarScale: 1,
      mtnNearY: 0,
      mtnNearX: 0,
      cloudLeftX: 0,
      cloudLeftY: 0,
      cloudRightX: 0,
      cloudRightY: 0,
      plantLeftRot: 0,
      plantRightRot: 0,
      plantY: 0,
      terrainScale: 1,
      catScale: 1,
      catTranslateY: 0,
      catOpacity: 1,
      steamDraw: 1,
      steamOpacity: 0.8,
    };
  }

  const p = clamp01(rawProgress);

  // Scene segments matching the 5-scene specification
  const s1 = easeInOutCubic(segmentProgress(p, 0.0, 0.2));
  const s2 = easeInOutCubic(segmentProgress(p, 0.2, 0.45));
  const s3 = easeInOutCubic(segmentProgress(p, 0.45, 0.7));
  const s4 = easeInOutCubic(segmentProgress(p, 0.7, 0.9));
  const s5 = easeInOutCubic(segmentProgress(p, 0.9, 1.0));

  // Sun atmosphere reveals gently in Scene 01-02 and deepens warmly in Scene 03-05
  const sunGlowOpacity =
    0.12 + s1 * 0.16 + s2 * 0.32 + s3 * 0.22 + s4 * 0.06 + s5 * 0.04;
  const sunGlowScale = 1 + s1 * 0.03 + s2 * 0.11 + s3 * 0.07 + s4 * 0.03;

  // Multi-layer mountain parallax: distant slow, near distinct faster pace
  const mtnFarY = -(s1 * 2.0 + s2 * 7.0 + s3 * 5.0);
  const mtnFarScale = 1 + s2 * 0.014 + s3 * 0.008;
  const mtnNearY = -(s1 * 3.5 + s2 * 14.5 + s3 * 12.0 + s4 * 2.5);
  const mtnNearX = -(s2 * 7.5 + s3 * 5.0);

  // Two cloud layers moving horizontally at distinct speeds
  const cloudLeftX = -(s1 * 6 + s2 * 30 + s3 * 14 + s4 * 4);
  const cloudLeftY = -(s2 * 5 + s3 * 3.5);
  const cloudRightX = s1 * 7 + s2 * 40 + s3 * 18 + s4 * 5;
  const cloudRightY = -(s2 * 7 + s3 * 4.5);

  // Foreground plants: begin neutral at Scene 01, open gently during Scene 02,
  // then glide back into a framed resting angle during Scene 03
  const plantOpening = easeInOutCubic(segmentProgress(p, 0.15, 0.45));
  const plantFraming = easeInOutCubic(segmentProgress(p, 0.45, 0.72));
  const plantLeftRot = lerp(0, -3.1, plantOpening) + lerp(0, 3.6, plantFraming);
  const plantRightRot = lerp(0, 3.1, plantOpening) + lerp(0, -3.6, plantFraming);
  const plantY = lerp(0, 10, plantOpening) - lerp(0, 10, plantFraming);

  // Foreground terrain mound prominence in Scene 03+ (anchored bottom center)
  const terrainScale = 1 + s2 * 0.008 + s3 * 0.02 + s4 * 0.006;

  // Character emphasis in Scene 04 (strictly bottom-center anchored, never detached)
  const catScale = 1 + s4 * 0.038 + s5 * 0.004;
  const catOpacity = 0.97 + s1 * 0.01 + s4 * 0.02;

  // Coffee steam draws upward with scroll progress in Scene 04 (0.65 -> 0.88), rests in Scene 05
  const steamDraw = easeInOutCubic(segmentProgress(p, 0.65, 0.88));
  const steamOpacity = clamp01(segmentProgress(p, 0.62, 0.74)) * (0.92 + s5 * 0.05);

  return {
    progress: p,
    activeScene: getActiveScene(p),
    sunGlowOpacity: Number(sunGlowOpacity.toFixed(4)),
    sunGlowScale: Number(sunGlowScale.toFixed(4)),
    mtnFarY: Number(mtnFarY.toFixed(3)),
    mtnFarScale: Number(mtnFarScale.toFixed(5)),
    mtnNearY: Number(mtnNearY.toFixed(3)),
    mtnNearX: Number(mtnNearX.toFixed(3)),
    cloudLeftX: Number(cloudLeftX.toFixed(3)),
    cloudLeftY: Number(cloudLeftY.toFixed(3)),
    cloudRightX: Number(cloudRightX.toFixed(3)),
    cloudRightY: Number(cloudRightY.toFixed(3)),
    plantLeftRot: Number(plantLeftRot.toFixed(3)),
    plantRightRot: Number(plantRightRot.toFixed(3)),
    plantY: Number(plantY.toFixed(3)),
    terrainScale: Number(terrainScale.toFixed(5)),
    catScale: Number(catScale.toFixed(5)),
    catTranslateY: 0,
    catOpacity: Number(catOpacity.toFixed(4)),
    steamDraw: Number(steamDraw.toFixed(4)),
    steamOpacity: Number(steamOpacity.toFixed(4)),
  };
}
