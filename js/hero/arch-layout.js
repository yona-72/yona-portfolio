// =============================================================
//  アーチの位置をCSS変数に書き出す
//  画面比率で背景の見える範囲が変わっても、中央コンテンツが常にアーチの中に収まる
//  .hero に --arch-left / --arch-top / --arch-width / --arch-height が入る
// =============================================================
export function bindArchLayout(hero, bg) {
  const apply = () => {
    const ARCH = bg.arch;
    const [l, t] = bg.toScreen(ARCH.left, ARCH.top);
    const [r, b] = bg.toScreen(ARCH.right, ARCH.bottom);
    const w = hero.clientWidth, h = hero.clientHeight;
    // 画面外にはみ出す場合は画面内に収める(スマホ縦向きなど)
    const left = Math.max(l, 16), right = Math.min(r, w - 16);
    const top = Math.max(t, 0), bottom = Math.min(b, h);
    hero.style.setProperty('--arch-left', `${left}px`);
    hero.style.setProperty('--arch-top', `${top}px`);
    hero.style.setProperty('--arch-width', `${right - left}px`);
    hero.style.setProperty('--arch-height', `${bottom - top}px`);
  };
  hero.addEventListener('prism:layout', apply);
  addEventListener('resize', apply);
  apply();
  return apply;
}
