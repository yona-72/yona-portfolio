// =============================================================
//  PrismBackground
//  背景の室内画像をWebGLで描き、カーソルに合わせて光の反射を変える。
//  - 画面全体は動かさない
//  - pointermove は window で拾うので、上に要素を重ねても反応し続ける
//  - ヒーローが画面外・タブ非表示のときは描画を止める
// =============================================================
import { vertexShader, fragmentShader } from './shaders.js';

// 画像ごとの設定。上から順に media が一致したものを使い、どれも一致しなければ最後を使う
//   arch: 画像上でコンテンツを置く範囲(0〜1)。アーチの内側に合わせてある
//   home: カーソルが無いときの光の位置
export const VARIANTS = [
  {
    // スマホ用の縦長画像(scene-sp.jpg / masks-sp.png)を用意したら、下の 'not all' を '(max-width: 420px)' に戻す
    media: 'not all',
    scene: 'images/hero/scene-sp.jpg',
    masks: 'images/hero/masks-sp.png',
    size: [1170, 2532],   // 画像の実寸(読み込み前からレイアウトを決めるため)
    arch: { left: 0.07, right: 0.93, top: 0.285, bottom: 0.57 },
    home: [0.5, 0.42],
  },
  {
    media: 'all',
    scene: 'images/hero/scene.jpg',
    masks: 'images/hero/masks.png',
    size: [3344, 1882],
    arch: { left: 0.27, right: 0.73, top: 0.16, bottom: 0.80 },
    home: [0.5, 0.45],
  },
];

const DEFAULTS = {
  variants: VARIANTS,
  follow: 0.06,         // カーソル追従の速さ(0〜1)
  decay: 0.965,         // 動きの余韻の減衰(1に近いほど長く残る)
  // カーソルを動かしていないときの、水のようなゆらめき
  idle: {
    delay: 2500,        // 最後にカーソルを動かしてから、自動のゆらめきに戻るまで(ms)
    fade: 2000,         // 自動のゆらめきに切り替わるのにかける時間(ms)
    rangeX: 0.26,       // 光源が漂う範囲(画像の幅に対する割合)
    rangeY: 0.16,       // 同じく高さ
    drift: 28,          // 光源がひと巡りする時間(秒)。大きいほどゆっくり
    swell: 7,           // うねりの間隔(秒)。この周期で反射がふわっと強まる
    swellMin: 0.16,     // うねりの弱いとき
    swellMax: 0.62,     // うねりの強いとき
  },
  // 水面の反射光(カーソルに関係なく常に揺らめく層)
  water: {
    base: 0.80,         // いつもの強さ(0で無効)
    swell: 0.50,        // うねりに合わせて足される強さ
  },
  maxDpr: 2,
};

export class PrismBackground {
  constructor(container, options = {}) {
    this.el = container;
    this.opt = { ...DEFAULTS, ...options };
    this.reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.variant = this._pickVariant();
    [this.imgW, this.imgH] = this.variant.size;
    this.target = [...this.variant.home];
    this.cur = [...this.variant.home];
    this.energy = 0;
    this.lastMove = -Infinity;          // まだ一度も動かしていない = 最初から自動で揺らめく
    this.idleW = 1;
    this.running = false;
    this.visible = true;
    this._raf = 0;
    this._onMove = this._onMove.bind(this);
    this._onResize = this._onResize.bind(this);
    this._frame = this._frame.bind(this);
  }

  async init() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'prism-bg__canvas';
    this.canvas.setAttribute('aria-hidden', 'true');
    this.el.appendChild(this.canvas);

    const gl = this.canvas.getContext('webgl', { antialias: false });
    if (!gl) { this.el.classList.add('is-static'); return this; }   // CSS背景のまま
    this.gl = gl;

    const prog = this._program(vertexShader, fragmentShader);
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const U = n => gl.getUniformLocation(prog, n);
    this.u = { res: U('res'), imgSize: U('imgSize'), t: U('t'), light: U('light'), view: U('view'), energy: U('energy'), water: U('water') };

    this.tex = [gl.createTexture(), gl.createTexture()];
    gl.uniform1i(U('img'), 0); gl.uniform1i(U('msk'), 1);
    await this._loadVariant(this.variant);

    // 420px をまたいだら画像を差し替える
    this._mqs = this.opt.variants.map(v => matchMedia(v.media));
    this._onMedia = () => {
      const next = this._pickVariant();
      if (next !== this.variant) this._loadVariant(next).catch(err => console.warn('[prism]', err));
    };
    this._mqs.forEach(mq => mq.addEventListener('change', this._onMedia));

    addEventListener('pointermove', this._onMove, { passive: true });
    addEventListener('resize', this._onResize);
    this._io = new IntersectionObserver(([e]) => { this.visible = e.isIntersecting; this._sync(); });
    this._io.observe(this.el);
    this._onVis = () => this._sync();
    document.addEventListener('visibilitychange', this._onVis);

    this._onResize();
    this.start = performance.now();
    this.el.classList.add('is-ready');
    this._sync();
    return this;
  }

  /** いま使っている画像のアーチ範囲 */
  get arch() { return this.variant.arch; }

  /** 画面上の座標 → 画像上の位置(0〜1)。object-fit: cover 相当 */
  toImageUV(clientX, clientY) {
    const r = this.el.getBoundingClientRect();
    let x = (clientX - r.left) / r.width, y = (clientY - r.top) / r.height;
    const rs = r.width / r.height, ri = this.imgW / this.imgH;
    if (rs > ri) y = (y - .5) * (ri / rs) + .5; else x = (x - .5) * (rs / ri) + .5;
    return [x, y];
  }

  /** 画像上の位置(0〜1) → ヒーロー内のpx。コンテンツをアーチに合わせるのに使う */
  toScreen(u, v) {
    const r = this.el.getBoundingClientRect();
    const rs = r.width / r.height, ri = this.imgW / this.imgH;
    let x = u, y = v;
    if (rs > ri) y = (v - .5) / (ri / rs) + .5; else x = (u - .5) / (rs / ri) + .5;
    return [x * r.width, y * r.height];
  }

  /** 外部から光の位置を動かしたいとき(例:中央オブジェクトの位置に光を寄せる) */
  setLight(u, v, boost = 0) {
    this.target = [u, v];
    this.energy = Math.min(1, this.energy + boost);
  }

  destroy() {
    cancelAnimationFrame(this._raf);
    removeEventListener('pointermove', this._onMove);
    removeEventListener('resize', this._onResize);
    document.removeEventListener('visibilitychange', this._onVis);
    this._mqs?.forEach(mq => mq.removeEventListener('change', this._onMedia));
    this._io?.disconnect();
    this.canvas?.remove();
  }

  // ---- internal ----
  _onMove(e) {
    if (e.pointerType === 'touch') return;   // スマホのタップでは自動のゆらめきを続ける
    const [x, y] = this.toImageUV(e.clientX, e.clientY);
    const d = Math.hypot(x - this.target[0], y - this.target[1]);
    this.energy = Math.min(1, this.energy + d * 6);
    this.target = [x, y];
    this.lastMove = performance.now();
  }

  /** カーソルを動かしていないときの光源の位置と、うねりの強さ */
  _idle(sec) {
    const o = this.opt.idle, home = this.variant.home;
    const w = (Math.PI * 2) / o.drift;
    // 周期の違う波を重ねて、同じ軌道を繰り返さない水面のような漂い方にする
    const x = home[0] + o.rangeX * (Math.sin(sec * w) * .7 + Math.sin(sec * w * 2.3 + 1.7) * .3);
    const y = home[1] + o.rangeY * (Math.cos(sec * w * 1.3 + .6) * .7 + Math.sin(sec * w * 3.1) * .3);
    const s = .5 + .5 * Math.sin((sec / o.swell) * Math.PI * 2 - Math.PI / 2);
    const swell = o.swellMin + (o.swellMax - o.swellMin) * s * s * (3 - 2 * s);
    return { x, y, swell };
  }

  _onResize() {
    const gl = this.gl; if (!gl) return;
    const dpr = Math.min(devicePixelRatio || 1, this.opt.maxDpr);
    this.canvas.width = Math.round(this.el.clientWidth * dpr);
    this.canvas.height = Math.round(this.el.clientHeight * dpr);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.uniform2f(this.u.res, this.canvas.width, this.canvas.height);
    this.el.dispatchEvent(new CustomEvent('prism:layout', { detail: this, bubbles: true }));
  }

  _sync() {
    const should = this.visible && !document.hidden;
    if (should && !this.running) { this.running = true; this._raf = requestAnimationFrame(this._frame); }
    if (!should && this.running) { this.running = false; cancelAnimationFrame(this._raf); }
  }

  _frame(now) {
    if (!this.running) return;
    const gl = this.gl, k = this.reduce ? .02 : this.opt.follow;
    const sec = (now - this.start) / 1000;

    // カーソルが止まって一定時間たったら、なめらかに自動のゆらめきへ移る
    const o = this.opt.idle;
    const idleTarget = Math.min(1, Math.max(0, (now - this.lastMove - o.delay) / o.fade));
    this.idleW += (idleTarget - this.idleW) * .05;
    const idle = this._idle(this.reduce ? sec * .3 : sec);
    const tx = this.target[0] + (idle.x - this.target[0]) * this.idleW;
    const ty = this.target[1] + (idle.y - this.target[1]) * this.idleW;
    const follow = k * (1 - this.idleW * .7);   // 自動のときはさらにゆっくり追う

    this.cur[0] += (tx - this.cur[0]) * follow;
    this.cur[1] += (ty - this.cur[1]) * follow;
    this.energy *= this.reduce ? .9 : this.opt.decay;
    const energy = Math.max(this.energy, idle.swell * this.idleW);

    gl.uniform1f(this.u.t, sec * (this.reduce ? .3 : 1));
    gl.uniform2f(this.u.light, this.cur[0], this.cur[1]);
    const home = this.variant.home;
    gl.uniform2f(this.u.view, this.cur[0] - home[0], this.cur[1] - home[1]);
    gl.uniform1f(this.u.energy, this.reduce ? energy * .3 : energy);
    const sw = (idle.swell - o.swellMin) / (o.swellMax - o.swellMin);   // 0〜1
    const water = this.opt.water.base + this.opt.water.swell * sw;
    gl.uniform1f(this.u.water, this.reduce ? water * .4 : water);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    this._raf = requestAnimationFrame(this._frame);
  }

  _program(vs, fs) {
    const gl = this.gl;
    const sh = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    return p;
  }

  _pickVariant() {
    const vs = this.opt.variants;
    return vs.find(v => matchMedia(v.media).matches) || vs[vs.length - 1];
  }

  async _loadVariant(v) {
    const [scene, masks] = await Promise.all([load(v.scene), load(v.masks)]);
    this.variant = v;
    this.imgW = scene.width; this.imgH = scene.height;
    this._texture(0, scene); this._texture(1, masks);
    this.gl.uniform2f(this.u.imgSize, scene.width, scene.height);
    this.target = [...v.home]; this.cur = [...v.home];
    this.el.dispatchEvent(new CustomEvent('prism:layout', { detail: this, bubbles: true }));
  }

  _texture(unit, image) {
    const gl = this.gl, tex = this.tex[unit];
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }
}

function load(src) {
  return new Promise((ok, ng) => {
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = () => ng(new Error('画像を読み込めません: ' + src));
    i.src = src;
  });
}
