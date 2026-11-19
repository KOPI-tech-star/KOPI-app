import { CoffeeSteamSvg } from './CoffeeSteamSvg';

interface LayerGeometry {
  variant: 'desktop' | 'tablet' | 'mobile';
  stageClass: string;
  backdropSrc: string;
  cloudsLeftSrc: string;
  cloudsRightSrc: string;
  mountainsNearSrc: string;
  terrainSrc: string;
  plantsLeftSrc: string;
  plantsRightSrc: string;
  catSrc: string;
  sunCenter: { left: string; top: string; size: string };
  cloudsLeftBox: { left: string; top: string; width: string; height: string };
  cloudsRightBox: { left: string; top: string; width: string; height: string };
  terrainBox: { height: string };
  plantsLeftBox: { width: string; height: string };
  plantsRightBox: { left: string; width: string; height: string };
  catBox: { left: string; top: string; width: string; height: string };
  steamBox: { left: string; top: string; width: string; height: string };
}

const LAYER_CONFIGS: readonly LayerGeometry[] = [
  {
    variant: 'desktop',
    stageClass: 'kopi-bg-desktop',
    backdropSrc: '/assets/layers/desktop/backdrop.png',
    cloudsLeftSrc: '/assets/layers/desktop/clouds-left.png',
    cloudsRightSrc: '/assets/layers/desktop/clouds-right.png',
    mountainsNearSrc: '/assets/layers/desktop/mountains-near.png',
    terrainSrc: '/assets/layers/desktop/terrain-mound.png',
    plantsLeftSrc: '/assets/layers/desktop/plants-left.png',
    plantsRightSrc: '/assets/layers/desktop/plants-right.png',
    catSrc: '/assets/layers/desktop/cat-master.png',
    sunCenter: { left: '80.5%', top: '60%', size: '34%' },
    cloudsLeftBox: { left: '0%', top: '24.973%', width: '41.866%', height: '27.630%' },
    cloudsRightBox: { left: '66.986%', top: '23.911%', width: '33.014%', height: '22.848%' },
    terrainBox: { height: '12.327%' },
    plantsLeftBox: { width: '31.399%', height: '29.862%' },
    plantsRightBox: { left: '61.005%', width: '20.933%', height: '21.360%' },
    catBox: { left: '31.998%', top: '56.323%', width: '28.888%', height: '36.557%' },
    steamBox: { left: '3.8%', top: '9.5%', width: '16.5%', height: '28%' },
  },
  {
    variant: 'tablet',
    stageClass: 'kopi-bg-tablet',
    backdropSrc: '/assets/layers/tablet/backdrop.png',
    cloudsLeftSrc: '/assets/layers/tablet/clouds-left.png',
    cloudsRightSrc: '/assets/layers/tablet/clouds-right.png',
    mountainsNearSrc: '/assets/layers/tablet/mountains-near.png',
    terrainSrc: '/assets/layers/tablet/terrain-mound.png',
    plantsLeftSrc: '/assets/layers/tablet/plants-left.png',
    plantsRightSrc: '/assets/layers/tablet/plants-right.png',
    catSrc: '/assets/layers/tablet/cat-master.png',
    sunCenter: { left: '74%', top: '66%', size: '44%' },
    cloudsLeftBox: { left: '0%', top: '45.580%', width: '30.387%', height: '13.812%' },
    cloudsRightBox: { left: '65.378%', top: '40.401%', width: '34.622%', height: '14.848%' },
    terrainBox: { height: '9.185%' },
    plantsLeftBox: { width: '24.678%', height: '21.271%' },
    plantsRightBox: { left: '59.853%', width: '40.147%', height: '15.055%' },
    catBox: { left: '22.560%', top: '69.406%', width: '39.871%', height: '25.345%' },
    steamBox: { left: '5%', top: '11%', width: '17%', height: '28%' },
  },
  {
    variant: 'mobile',
    stageClass: 'kopi-bg-mobile',
    backdropSrc: '/assets/layers/mobile/backdrop.png',
    cloudsLeftSrc: '/assets/layers/mobile/clouds-left.png',
    cloudsRightSrc: '/assets/layers/mobile/clouds-right.png',
    mountainsNearSrc: '/assets/layers/mobile/mountains-near.png',
    terrainSrc: '/assets/layers/mobile/terrain-mound.png',
    plantsLeftSrc: '/assets/layers/mobile/plants-left.png',
    plantsRightSrc: '/assets/layers/mobile/plants-right.png',
    catSrc: '/assets/layers/mobile/cat-master.png',
    sunCenter: { left: '75.5%', top: '66%', size: '54%' },
    cloudsLeftBox: { left: '0%', top: '41.268%', width: '44.633%', height: '14.354%' },
    cloudsRightBox: { left: '58.448%', top: '35.885%', width: '41.552%', height: '16.447%' },
    terrainBox: { height: '8.792%' },
    plantsLeftBox: { width: '17.535%', height: '21.053%' },
    plantsRightBox: { left: '62.699%', width: '37.301%', height: '15.072%' },
    catBox: { left: '13.284%', top: '69.976%', width: '51.541%', height: '24.641%' },
    steamBox: { left: '5%', top: '11%', width: '17%', height: '28%' },
  },
];

function ParallaxStage({ config }: { config: LayerGeometry }) {
  const aspectClass =
    config.variant === 'desktop'
      ? 'kopi-stage-desktop'
      : config.variant === 'tablet'
        ? 'kopi-stage-tablet'
        : 'kopi-stage-mobile';

  return (
    <div className={`${config.stageClass} relative h-full w-full overflow-hidden`}>
      <div
        className={`${aspectClass} absolute bottom-0 left-1/2 -translate-x-1/2`}
        data-testid={`scene-stage-${config.variant}`}
      >
        {/* 1. Sky + Distant Mountains + Rising Sun backdrop */}
        <img
          src={config.backdropSrc}
          alt=""
          decoding="async"
          data-testid={`layer-backdrop-${config.variant}`}
          className="kopi-motion-layer pointer-events-none absolute inset-0 h-full w-full select-none object-fill"
          style={{
            transform:
              'translate3d(0, var(--kopi-mtn-far-y, 0px), 0) scale(var(--kopi-mtn-far-scale, 1))',
            transformOrigin: 'bottom center',
            willChange: 'transform',
          }}
        />

        {/* 2. Scroll-reactive warm sun atmosphere glow */}
        <div
          aria-hidden="true"
          data-testid={`layer-sun-glow-${config.variant}`}
          className="kopi-motion-layer pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            left: config.sunCenter.left,
            top: config.sunCenter.top,
            width: config.sunCenter.size,
            aspectRatio: '1 / 1',
            background:
              'radial-gradient(circle, rgba(255, 179, 92, 0.56) 0%, rgba(247, 134, 52, 0.24) 44%, rgba(255, 226, 190, 0) 74%)',
            opacity: 'var(--kopi-sun-glow-opacity, 0.12)',
            transform: 'scale(var(--kopi-sun-glow-scale, 1))',
            willChange: 'transform, opacity',
          }}
        />

        {/* 3. Left Clouds (distinct horizontal speed) */}
        <img
          src={config.cloudsLeftSrc}
          alt=""
          decoding="async"
          data-testid={`layer-clouds-left-${config.variant}`}
          className="kopi-motion-layer pointer-events-none absolute select-none object-fill"
          style={{
            left: config.cloudsLeftBox.left,
            top: config.cloudsLeftBox.top,
            width: config.cloudsLeftBox.width,
            height: config.cloudsLeftBox.height,
            transform:
              'translate3d(var(--kopi-cloud-left-x, 0px), var(--kopi-cloud-left-y, 0px), 0)',
            willChange: 'transform',
          }}
        />

        {/* 4. Right Clouds (distinct horizontal speed) */}
        <img
          src={config.cloudsRightSrc}
          alt=""
          decoding="async"
          data-testid={`layer-clouds-right-${config.variant}`}
          className="kopi-motion-layer pointer-events-none absolute select-none object-fill"
          style={{
            left: config.cloudsRightBox.left,
            top: config.cloudsRightBox.top,
            width: config.cloudsRightBox.width,
            height: config.cloudsRightBox.height,
            transform:
              'translate3d(var(--kopi-cloud-right-x, 0px), var(--kopi-cloud-right-y, 0px), 0)',
            willChange: 'transform',
          }}
        />

        {/* 5. Near Mountains (distinct vertical & subtle horizontal parallax) */}
        <img
          src={config.mountainsNearSrc}
          alt=""
          decoding="async"
          data-testid={`layer-mountains-near-${config.variant}`}
          className="kopi-motion-layer pointer-events-none absolute inset-0 h-full w-full select-none object-fill"
          style={{
            transform:
              'translate3d(var(--kopi-mtn-near-x, 0px), var(--kopi-mtn-near-y, 0px), 0)',
            willChange: 'transform',
          }}
        />

        {/* 6. Foreground Sandy Mound Terrain */}
        <img
          src={config.terrainSrc}
          alt=""
          decoding="async"
          data-testid={`layer-terrain-${config.variant}`}
          className="kopi-motion-layer pointer-events-none absolute bottom-0 left-0 w-full select-none object-fill"
          style={{
            height: config.terrainBox.height,
            transform: 'scale(var(--kopi-terrain-scale, 1))',
            transformOrigin: 'bottom center',
            willChange: 'transform',
          }}
        />

        {/* 7. Official Kopi Cat + Laptop + Mug (strictly bottom-center anchored, translateY = 0) + Scroll-Drawn Coffee Steam */}
        <div
          data-testid={`layer-cat-${config.variant}`}
          className="kopi-motion-layer pointer-events-none absolute"
          style={{
            left: config.catBox.left,
            top: config.catBox.top,
            width: config.catBox.width,
            height: config.catBox.height,
            opacity: 'var(--kopi-cat-opacity, 0.97)',
            transform: 'scale(var(--kopi-cat-scale, 1))',
            transformOrigin: 'bottom center',
            willChange: 'transform, opacity',
          }}
        >
          <img
            src={config.catSrc}
            alt=""
            decoding="async"
            className="h-full w-full select-none object-fill"
          />
          <CoffeeSteamSvg
            className="pointer-events-none absolute"
            style={config.steamBox}
          />
        </div>

        {/* 8. Foreground Left Plants */}
        <img
          src={config.plantsLeftSrc}
          alt=""
          decoding="async"
          data-testid={`layer-plants-left-${config.variant}`}
          className="kopi-motion-layer pointer-events-none absolute bottom-0 left-0 select-none object-fill"
          style={{
            width: config.plantsLeftBox.width,
            height: config.plantsLeftBox.height,
            transform:
              'translate3d(0, var(--kopi-plant-y, 0px), 0) rotate(var(--kopi-plant-left-rot, 0deg))',
            transformOrigin: 'bottom left',
            willChange: 'transform',
          }}
        />

        {/* 9. Foreground Right Plants */}
        <img
          src={config.plantsRightSrc}
          alt=""
          decoding="async"
          data-testid={`layer-plants-right-${config.variant}`}
          className="kopi-motion-layer pointer-events-none absolute bottom-0 select-none object-fill"
          style={{
            left: config.plantsRightBox.left,
            width: config.plantsRightBox.width,
            height: config.plantsRightBox.height,
            transform:
              'translate3d(0, var(--kopi-plant-y, 0px), 0) rotate(var(--kopi-plant-right-rot, 0deg))',
            transformOrigin: 'bottom right',
            willChange: 'transform',
          }}
        />
      </div>
    </div>
  );
}

export function HeroBackground() {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden bg-[var(--kopi-cream)]"
      aria-hidden="true"
    >
      {LAYER_CONFIGS.map((config) => (
        <ParallaxStage key={config.variant} config={config} />
      ))}
    </div>
  );
}
