import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HERO_CTA_LABEL,
  HERO_DESCRIPTION,
  HERO_HEADLINE_WORDS,
  MEDIA_ASSETS,
  NAV_ITEMS,
  selectBackgroundMode,
} from './firstScreen';

test('hero headline preserves exact word-by-word font and color assignments', () => {
  const fullText = HERO_HEADLINE_WORDS.map((w) => w.text).join(' ');
  assert.equal(fullText, 'Find real problems. Uncover real opportunities.');

  const cormorantWords = HERO_HEADLINE_WORDS.filter((w) => w.font === 'cormorant');
  assert.equal(cormorantWords.length, 1);
  assert.deepEqual(cormorantWords[0], {
    text: 'opportunities.',
    font: 'cormorant',
    weight: 600,
    style: 'italic',
    color: '#C65A1B',
    line: 2,
  });

  const newsreaderWords = HERO_HEADLINE_WORDS.filter((w) => w.font === 'newsreader');
  assert.equal(newsreaderWords.length, 5);
  for (const word of newsreaderWords) {
    assert.equal(word.weight, 600);
    assert.equal(word.style, 'normal');
    assert.equal(word.color, '#392419');
  }
});

test('supporting copy, CTA, and navigation items match specification', () => {
  assert.equal(
    HERO_DESCRIPTION,
    'Turn everyday complaints into meaningful business ideas.'
  );
  assert.equal(HERO_CTA_LABEL, 'Explore Opportunities');
  assert.deepEqual(
    NAV_ITEMS.map((item) => item.label),
    ['Home', 'Explore', 'Resources', 'About', 'Sign In']
  );
});

test('background breakpoint selection respects mobile, tablet, and desktop boundaries', () => {
  assert.equal(selectBackgroundMode(390), 'mobile');
  assert.equal(selectBackgroundMode(430), 'mobile');
  assert.equal(selectBackgroundMode(767), 'mobile');
  assert.equal(selectBackgroundMode(768), 'tablet');
  assert.equal(selectBackgroundMode(820), 'tablet');
  assert.equal(selectBackgroundMode(1024), 'tablet');
  assert.equal(selectBackgroundMode(1025), 'desktop');
  assert.equal(selectBackgroundMode(1366), 'desktop');
  assert.equal(selectBackgroundMode(1440), 'desktop');
  assert.equal(selectBackgroundMode(1920), 'desktop');
});

test('uploaded background media asset paths point to public/assets/aistudio', () => {
  assert.equal(MEDIA_ASSETS.mobileVideo, '/assets/aistudio/screen_1_animated_57f7d1f8.mp4');
  assert.equal(MEDIA_ASSETS.mobileFallback, '/assets/aistudio/mobile_bg_544bdbdc.png');
  assert.equal(MEDIA_ASSETS.tabletBg, '/assets/aistudio/tab_bg_0a831155.png');
  assert.equal(MEDIA_ASSETS.desktopBg, '/assets/aistudio/laptop_bg_16294420.png');
});
