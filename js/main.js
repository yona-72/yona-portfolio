// =============================================================
//  エントリーポイント
//  登場の流れ
//    1. 真っ白な画面で、中央のロゴを書く(同時に裏で背景を読み込む)
//    2. 書き終わったら、背景とヘッダーをフェードイン
//    3. 少し遅れて、キャッチコピーとボタンが順に出る
//    4. その後からスクロールの演出を有効にする(下の「スクロールの演出」)
// =============================================================
import { PrismBackground } from './hero/prism-background.js';
import { bindArchLayout } from './hero/arch-layout.js';
import { drawLogo } from './hero/logo-draw.js';

const TIMING = {
  logoDelay: 400,       // 白い画面になってからロゴを書き始めるまで(ms)
  logoDuration: 1100,   // 1文字を書く時間
  logoStagger: 230,     // 次の文字を書き始めるまでの間隔
  holdAfterLogo: 250,   // 書き終わってから背景を出し始めるまで
  revealUi: 700,        // 背景を出し始めてからボタン類を出すまで
};

const root = document.documentElement;

// 再読み込みでスクロール位置が残ると、登場演出が画面外で再生されてしまうので、必ず一番上から始める
// (作品ページの「戻る」から #work-03 などが付いて来たときは、登場演出を飛ばし、下の Works の処理でその作品の位置へ移動する)
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
const deepLink = location.hash;
if (deepLink) root.classList.remove('is-intro'); else scrollTo(0, 0);
const hero = document.querySelector('[data-hero]');
const bgLayer = hero.querySelector('[data-hero-bg]');
const logo = hero.querySelector('[data-hero-logo]');
const wait = ms => new Promise(r => setTimeout(r, ms));

const bg = new PrismBackground(bgLayer);
// レイアウトは画像の読み込みを待たずに決める(ロゴが書いている途中で動かないように)
bindArchLayout(hero, bg);

const bgReady = bg.init().catch(err => {
  console.warn('[prism]', err);
  bgLayer.classList.add('is-static');
});

const logoDone = drawLogo(logo, {
  duration: TIMING.logoDuration,
  stagger: TIMING.logoStagger,
  delay: TIMING.logoDelay,
});

Promise.all([logoDone, bgReady])
  .then(() => wait(TIMING.holdAfterLogo))
  .finally(async () => {
    root.classList.remove('is-intro');          // 背景・ヘッダーがフェードイン
    hero.classList.add('is-loaded');
    await wait(TIMING.revealUi);
    hero.classList.add('is-revealed');          // キャッチコピー・ボタン
  });

// ---- スクロールの演出 ----
const FADE_DISTANCE = 0.8;   // ヒーローの高さの何割スクロールしたら、ロゴやボタンが消えきるか

// ファーストビュー:スクロール量を --p(0〜1)にして .hero に入れる → hero.css がベールとロゴを動かす
// 登場演出(is-intro)の間は何もしない
root.classList.add('at-hero');   // 最初はファーストビューなのでメニューボタンの状態から始める
const content = document.querySelector('.content');
function updateHeroFade() {
  if (root.classList.contains('is-intro')) return;
  const h = hero.offsetHeight;
  const p = Math.min(1, Math.max(0, scrollY / (h * FADE_DISTANCE)));
  hero.style.setProperty('--p', p.toFixed(3));
  // ヘッダーの下にコンテンツが来たら、ヘッダーにすりガラスを敷く
  root.classList.toggle('is-scrolled', scrollY > h * 0.85);
  // ファーストビューにいる間はナビをメニューボタンにまとめる(sections.css の .at-hero)
  const atHero = scrollY < h * 0.6;
  root.classList.toggle('at-hero', atHero);
  if (!atHero && root.classList.contains('menu-open')) setMenu(false);
  // ファーストビューは固定なので、コンテンツで完全に隠れたら背景の描画を止めて負荷を下げる
  const covered = scrollY > h * 1.1;
  // 下のコンテンツの光の玉の視差(sections.css の .content の --d)
  if (content) content.style.setProperty('--d', Math.round(scrollY - content.offsetTop));
  if (bg.gl && bg.visible === covered) { bg.visible = !covered; bg._sync(); }
}
let ticking = false;
addEventListener('scroll', () => {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => { ticking = false; updateHeroFade(); });
}, { passive: true });
addEventListener('resize', updateHeroFade);
new MutationObserver(updateHeroFade).observe(root, { attributes: true, attributeFilter: ['class'] });

// 下のセクション:[data-reveal] が画面に入ったら、ふわっと現れる
const reveals = [...document.querySelectorAll('[data-reveal]')];
if (reveals.length && 'IntersectionObserver' in window) {
  // 同じ親の中で何番目かを --i に入れ、少しずつずらして出す(作品を増やしても自動で並ぶ)
  reveals.forEach(el => {
    const group = [...el.parentElement.children].filter(c => c.hasAttribute('data-reveal'));
    el.style.setProperty('--i', group.indexOf(el));
  });
  root.classList.add('has-reveal');
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      e.target.classList.add('is-inview');
      io.unobserve(e.target);
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });
  reveals.forEach(el => io.observe(el));
}

document.querySelectorAll('[data-year]').forEach(el => (el.textContent = new Date().getFullYear()));

// 「動きを減らす」設定の端末では、作品の枠の揺らめき(SVGのアニメーション)を止める
if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
  document.querySelector('.drop-defs')?.pauseAnimations?.();
}

// 作品の枠:ホバーするたびに、まわりの波紋を1回広げる(sections.css の .is-rippling)
document.querySelectorAll('.work').forEach(work => {
  // 画像(水滴の形)にカーソルが入ったときだけ
  work.querySelector('.work__thumb')?.addEventListener('pointerenter', () => {
    work.classList.remove('is-rippling');
    void work.offsetWidth;                 // 一度外したクラスを付け直して、最初から再生させる
    work.classList.add('is-rippling');
  });
  // 輪(::before)が消えきったら外す
  work.addEventListener('animationend', e => {
    if (e.pseudoElement === '::before') work.classList.remove('is-rippling');
  });
});

// いま見ているセクション:ナビに取り消し線を付け、画面左下の番号を切り替える
const navLinks = [...document.querySelectorAll('.site-nav [data-nav]')];
const frameNo = document.querySelector('[data-frame-no]');
const frameName = document.querySelector('[data-frame-name]');
const sections = [...document.querySelectorAll('[data-section]')];
function updateCurrent() {
  const line = innerHeight * 0.45;           // 画面の少し上あたりを基準にする
  let cur = sections[0];
  sections.forEach(sec => { if (sec.getBoundingClientRect().top <= line) cur = sec; });
  // ファーストビューは固定なので、コンテンツがまだ重なっていない間は Top
  if (scrollY < innerHeight * 0.5) cur = sections[0];
  const id = cur.id || 'top';
  navLinks.forEach(a => a.classList.toggle('is-current', a.dataset.nav === id));
  if (frameNo) frameNo.textContent = cur.dataset.section;
  if (frameName) frameName.textContent = cur.dataset.name;
  const atEnd = innerHeight + scrollY > document.documentElement.scrollHeight - 140;
  root.classList.toggle('is-end', atEnd);
  updateTone(atEnd);
}

// 背景の色替え:About に来たら水色、SNS に来たらピンク(sections.css の .content__tone)
// セクションの上端が画面の 60% の位置まで来たら切り替える。ページの一番下まで来たら必ず SNS にする
// (画面が縦に長いと、SNS の上端が基準の位置まで上がりきらないことがあるため)
const toneAbout = document.getElementById('about');
const toneSns = document.getElementById('sns');
function updateTone(atEnd) {
  const line = innerHeight * 0.6;
  let tone = '';
  if (toneAbout && toneAbout.getBoundingClientRect().top <= line) tone = 'about';
  if (toneSns && (toneSns.getBoundingClientRect().top <= line || atEnd)) tone = 'sns';
  if (tone) root.dataset.tone = tone; else delete root.dataset.tone;
}
addEventListener('scroll', () => requestAnimationFrame(updateCurrent), { passive: true });
addEventListener('resize', updateCurrent);
updateCurrent();

// ---- Works:1つずつ固定して、スクロールで切り替える ----
// .works の中をスクロールした割合(0〜1)から、今の作品とバーの色の満ち具合を決める
const worksTrack = document.querySelector('[data-works]');
if (worksTrack) {
  const items = [...worksTrack.querySelectorAll('.work')];
  const cells = [...worksTrack.querySelectorAll('[data-works-go]')];
  const nowEl = worksTrack.querySelector('[data-works-now]');
  const pctEl = worksTrack.querySelector('[data-works-pct]');
  const n = items.length;
  worksTrack.style.setProperty('--n', n);
  worksTrack.classList.add('is-pinned');
  let current = -1;

  const progress = () => {
    const total = worksTrack.offsetHeight - innerHeight;
    return Math.min(1, Math.max(0, -worksTrack.getBoundingClientRect().top / total));
  };
  const updateWorks = () => {
    const p = progress();
    const idx = Math.min(n - 1, Math.floor(p * n));
    if (idx !== current) {
      current = idx;
      items.forEach((el, i) => {
        el.classList.toggle('is-active', i === idx);
        el.classList.toggle('is-before', i < idx);
      });
      cells.forEach((c, i) => c.classList.toggle('is-active', i === idx));
      if (nowEl) nowEl.textContent = String(idx + 1).padStart(2, '0');
    }
    cells.forEach((c, i) => c.firstElementChild.style.setProperty('--f', Math.min(1, Math.max(0, p * n - i)).toFixed(3)));
    if (pctEl) pctEl.textContent = String(Math.round(p * 100)).padStart(3, '0');
  };
  // i 番目の作品が表示される位置
  const topOf = i => {
    const total = worksTrack.offsetHeight - innerHeight;
    return worksTrack.getBoundingClientRect().top + scrollY + total * ((i + 0.08) / n);
  };
  // バーを押すと、その作品が表示される位置までスクロール
  cells.forEach((c, i) => c.addEventListener('click', () => {
    scrollTo({ top: topOf(i), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }));
  // 作品ページの「戻る」(index.html#work-03 など)から来たら、その作品の位置へ。#works なら1つ目の作品へ
  const m = deepLink.match(/^#work-(\d+)$/);
  const startIdx = m ? items.findIndex(el => el.dataset.work === m[1].padStart(2, '0')) : (deepLink === '#works' ? 0 : -1);
  if (startIdx >= 0) {
    const jump = () => scrollTo({ top: topOf(startIdx), behavior: 'auto' });
    jump();
    addEventListener('load', jump, { once: true });   // 画像や文字の読み込みで高さが変わっても、位置を合わせ直す
  }
  addEventListener('scroll', () => requestAnimationFrame(updateWorks), { passive: true });
  addEventListener('resize', updateWorks);
  updateWorks();
}

// ---- ファーストビュー右上のカテゴリー:ジグザグに置いて、文字と文字を斜めの線でつなぐ ----
// 奇数番目(01・03)は左の列、偶数番目(02・04)は右の列。下に行くほど少しずつ右へずらす
const cats = document.querySelector('.hm--cats');
function layoutCats() {
  if (!cats) return;
  const items = [...cats.querySelectorAll('a')];
  const GAP = 26;        // 左の列の文字の終わりから、右の列の文字の始まりまで(px)
  const DRIFT = 16;      // 段が下がるごとに右へずらす量(px)
  items.forEach(el => (el.style.marginLeft = '0px'));
  const leftItems = items.filter((_, i) => i % 2 === 0);
  const leftEnd = Math.max(...leftItems.map((el, k) => el.offsetWidth + k * DRIFT * 2));
  items.forEach((el, i) => {
    const row = Math.floor(i / 2);
    const x = i % 2 === 0 ? row * DRIFT * 2 : leftEnd + GAP + row * DRIFT * 2;
    el.style.marginLeft = `${x}px`;
  });
  let svg = cats.querySelector('svg');
  if (!svg) {
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('aria-hidden', 'true');
    cats.appendChild(svg);
  }
  const box = cats.getBoundingClientRect();
  svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
  svg.innerHTML = '';
  const NS = 'http://www.w3.org/2000/svg';
  for (let i = 0; i < items.length - 1; i++) {
    const a = items[i].getBoundingClientRect(), b = items[i + 1].getBoundingClientRect();
    // 左→右の段は「前の文字の終わり → 次の文字の始まり」、右→左の段は「前の文字の始まり → 次の文字の終わり」
    const goRight = i % 2 === 0;
    const x1 = (goRight ? a.right + 4 : a.left - 4) - box.left, y1 = a.bottom - box.top + 2;
    const x2 = (goRight ? b.left - 4 : b.right + 4) - box.left, y2 = b.top - box.top - 2;
    const line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', x1); line.setAttribute('y1', y1);
    line.setAttribute('x2', x2); line.setAttribute('y2', y2);
    svg.appendChild(line);
    if (i > 0) {   // 折れ目に小さな点
      const dot = document.createElementNS(NS, 'circle');
      dot.setAttribute('cx', x1); dot.setAttribute('cy', y1); dot.setAttribute('r', 1.2);
      svg.appendChild(dot);
    }
  }
}
layoutCats();
document.fonts?.ready.then(layoutCats);
addEventListener('resize', layoutCats);

// ---- メニュー(ファーストビューのメニューボタンで開く) ----
const menuBtn = document.querySelector('[data-menu-btn]');
const menu = document.querySelector('[data-menu]');
function setMenu(open) {
  root.classList.toggle('menu-open', open);
  menuBtn?.setAttribute('aria-expanded', String(open));
  menuBtn?.setAttribute('aria-label', open ? 'メニューを閉じる' : 'メニューを開く');
  menu?.setAttribute('aria-hidden', String(!open));
}
menuBtn?.addEventListener('click', () => setMenu(!root.classList.contains('menu-open')));
menu?.querySelectorAll('[data-menu-link]').forEach(a => a.addEventListener('click', () => setMenu(false)));
addEventListener('keydown', e => { if (e.key === 'Escape') setMenu(false); });

// 作品の画像が見つからないときは、その画像を外す(空の枠のまま崩れないように)
document.querySelectorAll('[data-work-img]').forEach(img => {
  const drop = () => img.remove();
  if (img.complete && img.naturalWidth === 0) drop(); else img.addEventListener('error', drop);
});

// ---- TOPへ戻る(右下のボタンと、フッターの BACK TO TOP)----
// アドレスに #top を残さず、ページの一番上までなめらかにスクロールする
document.querySelectorAll('[data-to-top], .site-footer__top').forEach(a => a.addEventListener('click', e => {
  e.preventDefault();
  const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' });
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
}));
