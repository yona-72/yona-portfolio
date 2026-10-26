// =============================================================
//  ロゴの線描きアニメーション
//  [data-draw] の付いた path を1文字ずつ線で「書く」ように描き、
//  描き終わった部分から塗りをふわっと入れ、線を元データの太さに戻す。最後に [data-sparkle] がきらめく。
// =============================================================

const EASE_DRAW = 'cubic-bezier(.65, 0, .35, 1)';
const EASE_OUT = 'cubic-bezier(.2, .7, .2, 1)';

/**
 * @param {SVGSVGElement} svg
 * @param {{ duration?: number, stagger?: number, delay?: number }} [opt]
 *   duration: 1文字を描く時間(ms) / stagger: 次の文字を描き始めるまでの間隔(ms)
 * @returns {Promise<void>} すべて描き終わったら解決
 */
export function drawLogo(svg, { duration = 1100, stagger = 230, delay = 0 } = {}) {
  const paths = [...svg.querySelectorAll('[data-draw]')];
  const sparkle = svg.querySelector('[data-sparkle]');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  svg.classList.add('is-drawing');
  if (reduce || !paths.length || !('animate' in Element.prototype)) {
    svg.classList.remove('is-drawing');
    svg.classList.add('is-drawn');
    return Promise.resolve();
  }

  const anims = [];
  paths.forEach((p, i) => {
    const len = Math.ceil(p.getTotalLength());
    const start = delay + i * stagger;
    p.style.strokeDasharray = `${len} ${len}`;
    p.style.strokeDashoffset = len;
    p.style.fillOpacity = 0;

    anims.push(p.animate(
      [{ strokeDashoffset: len }, { strokeDashoffset: 0 }],
      { duration, delay: start, easing: EASE_DRAW, fill: 'forwards' }
    ));
    // 塗りを入れながら線を元データの太さ(--sw)まで細くする
    const sw = getComputedStyle(p).getPropertyValue('--sw').trim() || '.75px';
    anims.push(p.animate(
      [{ fillOpacity: 0, strokeWidth: '1.1px' }, { fillOpacity: 1, strokeWidth: sw }],
      { duration: 700, delay: start + duration * .65, easing: EASE_OUT, fill: 'forwards' }
    ));
  });

  if (sparkle) {
    const t = delay + (paths.length - 1) * stagger + duration * .9;
    sparkle.style.transformBox = 'fill-box';
    sparkle.style.transformOrigin = '50% 50%';
    anims.push(sparkle.animate(
      [
        { opacity: 0, transform: 'scale(0) rotate(-120deg)' },
        { opacity: 1, transform: 'scale(1.35) rotate(10deg)', offset: .6 },
        { opacity: 1, transform: 'scale(1) rotate(0deg)' },
      ],
      { duration: 900, delay: t, easing: EASE_OUT, fill: 'both' }
    ));
  }

  return Promise.all(anims.map(a => a.finished)).then(() => {
    // 描き終えたら dasharray を外して、拡大縮小しても線が崩れないようにする
    paths.forEach(p => { p.style.strokeDasharray = ''; p.style.strokeDashoffset = ''; p.style.fillOpacity = ''; });
    anims.forEach(a => a.cancel());
    svg.classList.remove('is-drawing');
    svg.classList.add('is-drawn');
  });
}
