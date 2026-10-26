// =============================================================
//  作品ページ(work-03.html 〜)の小さな演出
//  ・[data-reveal] が画面に入ったら、ふわっと現れる(トップと同じ動き)
//  ・画像が見つからないときは外して、枠の中の「IMAGE 01」を見せる
//  ・フッターの年
// =============================================================
(function () {
  var root = document.documentElement;

  document.querySelectorAll('[data-detail-img]').forEach(function (img) {
    var drop = function () { img.remove(); };
    if (img.complete && img.naturalWidth === 0) drop(); else img.addEventListener('error', drop);
  });

  var reveals = [].slice.call(document.querySelectorAll('[data-reveal]'));
  if (reveals.length && 'IntersectionObserver' in window) {
    reveals.forEach(function (el) {
      var group = [].filter.call(el.parentElement.children, function (c) { return c.hasAttribute('data-reveal'); });
      el.style.setProperty('--i', group.indexOf(el));
    });
    root.classList.add('has-reveal');
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('is-inview');
        io.unobserve(e.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    reveals.forEach(function (el) { io.observe(el); });
  }

  // 一番下ではフッターと重ならないように、左下の番号を隠す(トップと同じ)
  var onScroll = function () {
    root.classList.toggle('is-end', innerHeight + scrollY > document.documentElement.scrollHeight - 140);
  };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();


  // 「← Back」「Back to works」「Works」:作品ページは新しいタブで開くので、
  // このタブを閉じてメインページ(元のタブ)に戻る。閉じられないときは、ふつうにメインページへ移動する
  document.querySelectorAll('a[href^="index.html#work-"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      if (history.length > 1) return;          // このタブの中で他のページを見てきた場合は、ふつうに移動
      e.preventDefault();
      window.close();
      setTimeout(function () { location.href = a.href; }, 200);   // 閉じられなかったとき
    });
  });

  document.querySelectorAll('[data-year]').forEach(function (el) { el.textContent = new Date().getFullYear(); });
})();

// =============================================================
//  画像・動画の拡大表示(モーダル)
//  .piece の画像・動画を押すと大きく表示。← → でほかの作品、×・まわり・Esc で閉じる
// =============================================================
(function () {
  var frames = [].slice.call(document.querySelectorAll('.piece__fig .detail__frame'));
  if (!frames.length) return;
  var root = document.documentElement;

  var box = document.createElement('div');
  box.className = 'lightbox';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', '拡大表示');
  box.innerHTML =
    '<div class="lightbox__top"><p class="lightbox__count"><b data-lb-now>01</b> / <span data-lb-all>01</span></p>' +
    '<button class="lightbox__btn" type="button" data-lb-close aria-label="閉じる">×</button></div>' +
    '<div class="lightbox__stage" data-lb-stage>' +
    '<button class="lightbox__btn lightbox__nav lightbox__nav--prev" type="button" data-lb-prev aria-label="前へ">←</button>' +
    '<button class="lightbox__btn lightbox__nav lightbox__nav--next" type="button" data-lb-next aria-label="次へ">→</button></div>' +
    '<div class="lightbox__cap"><p class="lightbox__title" data-lb-title></p><p class="lightbox__jp" data-lb-jp></p></div>';
  document.body.appendChild(box);
  var stage = box.querySelector('[data-lb-stage]');
  var closeBtn = box.querySelector('[data-lb-close]');
  var current = -1, lastFocus = null;

  // 中身が入っている枠だけを対象にする(画像が無い枠は押せない)
  function items() { return frames.filter(function (f) { return f.querySelector('img, video'); }); }

  function show(i) {
    var list = items(); if (!list.length) return;
    current = (i + list.length) % list.length;
    var frame = list[current];
    var piece = frame.closest('.piece');
    var old = stage.querySelector('.lightbox__media'); if (old) old.remove();
    var src = frame.querySelector('img, video'), el;
    if (src.tagName === 'VIDEO') {
      el = document.createElement('video');
      el.src = src.currentSrc || src.src; el.poster = src.poster || '';
      el.controls = true; el.autoplay = true; el.loop = true; el.muted = true; el.playsInline = true;
    } else {
      el = document.createElement('img');
      el.src = src.currentSrc || src.src; el.alt = src.alt || '';
    }
    el.className = 'lightbox__media';
    // 縦に長い画像(高さが幅の2倍以上)は、スクロールして全部見られる表示にする
    var long = src.tagName === 'IMG' && src.naturalHeight > src.naturalWidth * 2;
    stage.classList.toggle('is-long', long);
    stage.scrollTop = 0;
    stage.insertBefore(el, stage.firstChild);
    box.querySelector('[data-lb-title]').textContent = piece ? (piece.querySelector('.piece__title') || {}).textContent || '' : '';
    box.querySelector('[data-lb-jp]').textContent = piece ? (piece.querySelector('.piece__jp') || {}).textContent || '' : '';
    if (long) box.querySelector('[data-lb-jp]').textContent += '  ―  SCROLL ↓';
    box.querySelector('[data-lb-now]').textContent = String(current + 1).padStart(2, '0');
    box.querySelector('[data-lb-all]').textContent = String(list.length).padStart(2, '0');
    if (list.length < 2) box.setAttribute('data-single', ''); else box.removeAttribute('data-single');
  }
  function open(frame) {
    lastFocus = document.activeElement;
    show(items().indexOf(frame));
    box.classList.add('is-open'); root.classList.add('lightbox-open');
    closeBtn.focus({ preventScroll: true });
  }
  function close() {
    if (!box.classList.contains('is-open')) return;
    box.classList.remove('is-open'); root.classList.remove('lightbox-open');
    var m = stage.querySelector('video.lightbox__media'); if (m) m.pause();
    setTimeout(function () { if (!box.classList.contains('is-open')) { var o = stage.querySelector('.lightbox__media'); if (o) o.remove(); } }, 500);
    if (lastFocus) lastFocus.focus({ preventScroll: true });
  }

  frames.forEach(function (f) {
    f.setAttribute('tabindex', '0');
    f.setAttribute('role', 'button');
    f.setAttribute('aria-label', '拡大して見る');
    f.addEventListener('click', function () { if (f.querySelector('img, video')) open(f); });
    f.addEventListener('keydown', function (e) {
      if ((e.key === 'Enter' || e.key === ' ') && f.querySelector('img, video')) { e.preventDefault(); open(f); }
    });
  });
  closeBtn.addEventListener('click', close);
  box.querySelector('[data-lb-prev]').addEventListener('click', function () { show(current - 1); });
  box.querySelector('[data-lb-next]').addEventListener('click', function () { show(current + 1); });
  // 画像・ボタン以外(まわりの余白)を押したら閉じる
  box.addEventListener('click', function (e) {
    if (e.target === box || e.target === stage || e.target.classList.contains('lightbox__cap') || e.target.classList.contains('lightbox__top')) close();
  });
  addEventListener('keydown', function (e) {
    if (!box.classList.contains('is-open')) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') show(current - 1);
    else if (e.key === 'ArrowRight') show(current + 1);
    else if (e.key === 'Tab') {   // フォーカスをモーダルの中にとどめる
      var btns = [].slice.call(box.querySelectorAll('button, video')).filter(function (b) { return b.offsetParent !== null; });
      var first = btns[0], last = btns[btns.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
})();
