import { useEffect, useRef } from 'react';
import {
  computeSceneState,
  computeScrollProgress,
} from '../config/scrollTimeline';

export function useScrollStory() {
  const trackRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reducedMotion = mediaQuery.matches;
    let rafId: number | null = null;

    const applySceneToDom = () => {
      rafId = null;
      const trackEl = trackRef.current;
      const stageEl = stageRef.current;
      if (!stageEl) return;

      let rawProgress = 0;
      if (trackEl) {
        const rect = trackEl.getBoundingClientRect();
        rawProgress = computeScrollProgress(
          rect.top,
          rect.height,
          window.innerHeight,
        );
      }

      const state = computeSceneState(rawProgress, reducedMotion);
      const style = stageEl.style;

      stageEl.dataset.scrollProgress = state.progress.toFixed(3);
      stageEl.dataset.scene = state.activeScene;
      stageEl.dataset.reducedMotion = reducedMotion ? 'true' : 'false';

      style.setProperty('--kopi-sun-glow-opacity', String(state.sunGlowOpacity));
      style.setProperty('--kopi-sun-glow-scale', String(state.sunGlowScale));
      style.setProperty('--kopi-mtn-far-y', `${state.mtnFarY}px`);
      style.setProperty('--kopi-mtn-far-scale', String(state.mtnFarScale));
      style.setProperty('--kopi-mtn-near-y', `${state.mtnNearY}px`);
      style.setProperty('--kopi-mtn-near-x', `${state.mtnNearX}px`);
      style.setProperty('--kopi-cloud-left-x', `${state.cloudLeftX}px`);
      style.setProperty('--kopi-cloud-left-y', `${state.cloudLeftY}px`);
      style.setProperty('--kopi-cloud-right-x', `${state.cloudRightX}px`);
      style.setProperty('--kopi-cloud-right-y', `${state.cloudRightY}px`);
      style.setProperty('--kopi-plant-left-rot', `${state.plantLeftRot}deg`);
      style.setProperty('--kopi-plant-right-rot', `${state.plantRightRot}deg`);
      style.setProperty('--kopi-plant-y', `${state.plantY}px`);
      style.setProperty('--kopi-terrain-scale', String(state.terrainScale));
      style.setProperty('--kopi-cat-scale', String(state.catScale));
      style.setProperty('--kopi-cat-opacity', String(state.catOpacity));
      style.setProperty('--kopi-steam-draw', String(state.steamDraw));
      style.setProperty('--kopi-steam-opacity', String(state.steamOpacity));
    };

    const scheduleUpdate = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(applySceneToDom);
    };

    const handleReducedMotionChange = (event: MediaQueryListEvent) => {
      reducedMotion = event.matches;
      scheduleUpdate();
    };

    // Apply initial frame synchronously so first paint at 0% is exact
    applySceneToDom();

    window.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate, { passive: true });
    mediaQuery.addEventListener('change', handleReducedMotionChange);

    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      window.removeEventListener('scroll', scheduleUpdate);
      window.removeEventListener('resize', scheduleUpdate);
      mediaQuery.removeEventListener('change', handleReducedMotionChange);
    };
  }, []);

  return { trackRef, stageRef };
}
