// =============================================================
// works-crystal.js ― Works の画像枠を、宙に浮かぶ立体のクリスタルにする(three.js / WebGL)
//
// ・クリスタルは光を透す「ガラス」の素材(屈折・虹色の反射)。色はトップのラベンダー〜ピンク〜水色の光に合わせている
// ・クリスタルの中に、表側=ふだんの画像、裏側=ホバー画像 を背中合わせに入れている
// ・ホバーすると、クリスタルが半回転して裏側(ホバー画像)が見える。離れると戻る
// ・WebGL は1つだけ作り、見えている枠ごとに描いて、それぞれの <canvas> に写す(ブラウザの負担を減らすため)
// ・WebGL が使えない環境では、これまでの平面のクリスタル(CSS)がそのまま表示される
// =============================================================
import * as THREE from './vendor/three.module.min.js';

const ASPECT = 1;                  // 枠の縦横比(sections.css の .crystal と同じ。まるいミラーなので正方形)
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

export function initWorksCrystals() {
  const thumbs = [...document.querySelectorAll('.work .work__thumb.crystal')];
  if (!thumbs.length) return;

  // ---- WebGL(共有)----
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  } catch (e) { return; }          // 使えないときは CSS のクリスタルのまま
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;   // 画像の色をそのまま出す

  const camera = new THREE.PerspectiveCamera(26, ASPECT, 0.1, 50);
  camera.position.set(0, 0.04, 6.3);
  camera.lookAt(0, 0.04, 0);

  // ---- 映り込みの環境:トップの部屋の光(白い窓・ピンク・水色・ラベンダー)を、ぼかした光の箱で作る ----
  const envTex = makeEnvironment(renderer);

  // ---- クリスタルの形 ----
  const crystalGeo = makeMirrorGeometry();
  crystalGeo.computeBoundingBox();
  const cb = crystalGeo.boundingBox;
  // 画像を映す範囲(クリスタルの正面いっぱい。少しだけ内側に寄せる)
  const face = crystalGeo.userData.face;
  const fx = face.map(p => p[0]), fy = face.map(p => p[1]);
  const imgMin = new THREE.Vector2(Math.min(...fx), Math.min(...fy));
  const imgSize = new THREE.Vector2(Math.max(...fx) - imgMin.x, Math.max(...fy) - imgMin.y);

  // 表面をおおう、うすいガラスの膜:正面を向いた面は透け、斜めの面・ふちほど光を映して白く光る(フレネル)
  const shell = new THREE.MeshPhysicalMaterial({
    color: 0xf6f0ff, metalness: 0, roughness: 0.03,
    transparent: true, depthWrite: false,
    iridescence: 1, iridescenceIOR: 1.3, iridescenceThicknessRange: [240, 620],
    clearcoat: 1, clearcoatRoughness: 0.02,
    envMap: envTex, envMapIntensity: 1.3,
    flatShading: false,
  });
  fresnel(shell, 0.0, 0.8);

  // 光源:右上から白、左下からピンク、右下から水色(虹色の映り込みを出す)
  const lights = () => {
    const g = new THREE.Group();
    const key = new THREE.DirectionalLight(0xffffff, 1.1); key.position.set(2.5, 3.5, 4); g.add(key);
    const pink = new THREE.PointLight(0xffb8e0, 6, 12); pink.position.set(-2.6, -1.2, 2.6); g.add(pink);
    const cyan = new THREE.PointLight(0xb6e6ff, 5, 12); cyan.position.set(2.8, -1.8, 1.8); g.add(cyan);
    g.add(new THREE.AmbientLight(0xf1e8ff, 0.2));
    return g;
  };

  const clock = new THREE.Clock();
  const views = thumbs.map((thumb, i) => {
    const imgs = thumb.querySelectorAll('img');
    const scene = new THREE.Scene();
    scene.environment = envTex;
    scene.add(lights());

    const rig = new THREE.Group();          // 浮かぶ・回る
    scene.add(rig);
    // クリスタル本体:表側の面には ふだんの画像、裏側の面には ホバー画像が、中に閉じこめられたように映る
    const body = makeCrystalMaterial(envTex, imgMin, imgSize, imgs[0], imgs[1] || imgs[0]);
    const crystal = new THREE.Mesh(crystalGeo, body); crystal.renderOrder = 1;
    const skin = new THREE.Mesh(crystalGeo, shell); skin.scale.setScalar(1.006); skin.renderOrder = 2;
    rig.add(crystal, skin);

    const canvas = document.createElement('canvas');
    canvas.className = 'crystal__canvas';
    canvas.setAttribute('aria-hidden', 'true');
    thumb.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    // クリックしたときの「キラッ」:右上に光が当たる(3D)+ 星形のきらめき(CSS の .crystal__glint)
    const glint = document.createElement('span');
    glint.className = 'crystal__glint'; glint.setAttribute('aria-hidden', 'true');
    thumb.appendChild(glint);

    const v = { thumb, scene, rig, canvas, ctx, body, glint, visible: false, hover: false, base: 0, drag: 0, turn: 0, tilt: { x: 0, y: 0 }, tiltT: { x: 0, y: 0 }, phase: i * 1.7, ready: false, flashAt: -9 };
    const sparkle = () => {
      v.flashAt = clock.getElapsedTime();
      glint.classList.remove('is-on'); void glint.offsetWidth; glint.classList.add('is-on');
    };
    // マウスは押した瞬間、スマホはタップしたとき(スワイプで回したときは光らせない)
    thumb.addEventListener('pointerdown', e => { if (e.pointerType !== 'touch') sparkle(); });
    thumb.addEventListener('click', () => { if (v.touchTap) sparkle(); v.touchTap = false; });
    thumb.addEventListener('keydown', e => { if (e.key === 'Enter') sparkle(); });

    // マウス:ホバーで半回転。スマホ(指):横にスワイプすると、その向きにクルッと半回転(画像が切り替わる)
    thumb.addEventListener('pointerenter', e => { if (e.pointerType !== 'touch') v.hover = true; });
    thumb.addEventListener('pointerleave', e => { if (e.pointerType !== 'touch') { v.hover = false; v.tiltT.x = v.tiltT.y = 0; } });
    let sx = 0, sy = 0, swiping = false, moved = false;
    thumb.addEventListener('touchend', () => { v.touchTap = !moved; }, { capture: true });
    thumb.addEventListener('touchstart', e => { const t0 = e.touches[0]; sx = t0.clientX; sy = t0.clientY; swiping = true; moved = false; v.drag = 0; }, { passive: true });
    thumb.addEventListener('touchmove', e => {
      if (!swiping) return;
      const t0 = e.touches[0], dx = t0.clientX - sx, dy = t0.clientY - sy;
      if (!moved && Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) { swiping = false; v.drag = 0; return; }   // 縦のスクロールはそのまま
      if (Math.abs(dx) > 6) moved = true;
      v.drag = dx / thumb.clientWidth * Math.PI;      // 指に合わせて少し回る
    }, { passive: true });
    const endSwipe = () => {
      if (!swiping) return;
      swiping = false;
      if (Math.abs(v.drag) > 0.35) v.base += Math.sign(v.drag) * Math.PI;   // ある程度動かしたら、クルッと半回転
      v.drag = 0;
    };
    thumb.addEventListener('touchend', endSwipe);
    thumb.addEventListener('touchcancel', endSwipe);
    // スワイプしたときは、リンクを開かない(タップのときだけ開く)
    thumb.addEventListener('click', e => { if (moved) { e.preventDefault(); moved = false; } });
    thumb.addEventListener('focus', () => { v.hover = true; });
    thumb.addEventListener('blur', () => { v.hover = false; });
    thumb.addEventListener('pointermove', e => {
      const r = thumb.getBoundingClientRect();
      v.tiltT.y = ((e.clientX - r.left) / r.width - .5) * 0.35;
      v.tiltT.x = ((e.clientY - r.top) / r.height - .5) * 0.22;
    });
    return v;
  });

  // 見えている枠だけ描く
  const io = new IntersectionObserver(es => es.forEach(e => {
    const v = views.find(x => x.thumb === e.target);
    if (v) v.visible = e.isIntersecting;
  }), { rootMargin: '120px' });
  views.forEach(v => io.observe(v.thumb));

  // サイズ合わせ
  let W = 0, H = 0;
  function sizeFor(v) {
    const r = v.thumb.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = Math.max(2, Math.round(r.width * dpr)), h = Math.max(2, Math.round(r.height * dpr));
    if (v.canvas.width !== w || v.canvas.height !== h) { v.canvas.width = w; v.canvas.height = h; }
    if (w !== W || h !== H) { W = w; H = h; renderer.setSize(w, h, false); }
  }

  let last = 0;
  function frame() {
    const t = clock.getElapsedTime();
    const dt = Math.min(0.05, t - last); last = t;
    for (const v of views) {
      if (!v.visible) continue;
      sizeFor(v);
      // 回転:ホバー中は半回転(π)。やわらかく追いかける
      const target = (v.hover ? Math.PI : 0) + v.base + v.drag;
      v.turn += (target - v.turn) * (1 - Math.pow(0.0025, dt));
      v.tilt.x += (v.tiltT.x - v.tilt.x) * (1 - Math.pow(0.01, dt));
      v.tilt.y += (v.tiltT.y - v.tilt.y) * (1 - Math.pow(0.01, dt));
      const s = reduce ? 0 : 1;
      const tt = t + v.phase;
      v.rig.rotation.y = v.turn + s * Math.sin(tt * 0.45) * 0.22 + v.tilt.y;
      v.rig.rotation.x = s * Math.sin(tt * 0.33) * 0.05 + v.tilt.x;
      v.rig.rotation.z = s * Math.sin(tt * 0.27) * 0.035;
      v.rig.position.y = s * Math.sin(tt * 0.8) * 0.06;
      const bu = v.body.userData.u;
      bu.uTime.value = t;
      const ft = t - v.flashAt;                                       // クリックしてからの時間
      bu.uFlash.value = ft < 0 || ft > 1.6 ? 0 : Math.min(1, ft / 0.08) * Math.exp(-ft * 3.2);
      renderer.render(v.scene, camera);
      v.ctx.clearRect(0, 0, v.canvas.width, v.canvas.height);
      v.ctx.drawImage(renderer.domElement, 0, 0, v.canvas.width, v.canvas.height);
      if (!v.ready) { v.ready = true; v.thumb.classList.add('is-3d'); }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// 面の向きで透け具合を変える(正面:min 〜 ふち:max)
function fresnel(mat, min, max) {
  mat.onBeforeCompile = sh => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `#include <opaque_fragment>
      float fr = 1.0 - abs(dot(normalize(normal), normalize(vViewPosition)));
      gl_FragColor.a = mix(${min.toFixed(3)}, ${max.toFixed(3)}, pow(fr, 1.6));`);
  };
}

// ---------------------------------------------------------------
// まるいクリスタルのミラー:うすい円盤。正面と背面は平らで(ここに画像が映る)、ふちは丸く面取りされて光る
function makeMirrorGeometry() {
  const R = 1.12, D = 0.09, b = 0.12;      // 半径・厚み(半分)・ふちの丸みの幅
  const prof = [new THREE.Vector2(0, -D)];
  prof.push(new THREE.Vector2(R - b, -D));
  for (let i = 1; i <= 10; i++) {           // ふちの丸み(半円に近いカーブ)
    const a = -Math.PI / 2 + (i / 10) * Math.PI;
    prof.push(new THREE.Vector2(R - b + Math.cos(a) * b, Math.sin(a) * D));
  }
  prof.push(new THREE.Vector2(0, D));
  const g = new THREE.LatheGeometry(prof, 128);
  g.rotateX(Math.PI / 2);                   // 円盤の正面をカメラに向ける
  g.computeVertexNormals();
  const n = 48;
  g.userData.face = Array.from({ length: n }, (_, i) => [Math.cos(i / n * 6.2832) * (R - b), Math.sin(i / n * 6.2832) * (R - b)]);
  return g;
}

// (以前の形)クリスタルの形:記念の盾のような、厚みのある板。
// 正面と背面は平らな面(ここに画像が映る)、まわりは何段にもカットされた面取りで、光がきらきら反射する
const OUTLINE = [
  [0.10, 1.26], [0.62, 0.84], [0.93, 0.12], [0.86, -0.82], [0.70, -1.20],
  [-0.70, -1.20], [-0.90, -0.74], [-0.95, 0.12], [-0.52, 0.88],
];
// 輪郭を内側へ k だけ縮めた形(角の二等分線の向きにずらす)
function inset(pts, k) {
  const n = pts.length;
  return pts.map((p, i) => {
    const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    const e1 = [p[0] - a[0], p[1] - a[1]], e2 = [b[0] - p[0], b[1] - p[1]];
    const n1 = norm([e1[1], -e1[0]]), n2 = norm([e2[1], -e2[0]]);   // 外向き(反時計回りの輪郭)
    const m = norm([n1[0] + n2[0], n1[1] + n2[1]]);
    const c = Math.max(0.35, m[0] * n1[0] + m[1] * n1[1]);
    return [p[0] - m[0] * k / c, p[1] - m[1] * k / c];
  });
}
function norm(v) { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; }
// 点の並びを反時計回りにそろえる
function clockwise(pts) {
  let s = 0; pts.forEach((p, i) => { const q = pts[(i + 1) % pts.length]; s += (q[0] - p[0]) * (q[1] + p[1]); });
  return s > 0 ? pts.slice().reverse() : pts;   // 反時計回り(外向きの法線が [e.y, -e.x] になる向き)
}
function makeCrystalGeometry() {
  const O = clockwise(OUTLINE);
  // [内側へのずれ, 奥行き] 正面 → 面取り(2段) → 側面 → 面取り(2段) → 背面
  const D = 0.17;
  const loops = [
    [0.16, D], [0.02, D * 0.38],
    [0.02, -D * 0.38], [0.16, -D],
  ].map(([k, z]) => inset(O, k).map(([x, y]) => new THREE.Vector3(x, y, z)));
  const pos = [];
  const tri = (a, b, c) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  const n = O.length;
  for (let r = 0; r < loops.length - 1; r++) {
    for (let i = 0; i < n; i++) {
      const a = loops[r][i], b = loops[r][(i + 1) % n], c = loops[r + 1][(i + 1) % n], d = loops[r + 1][i];
      tri(a, b, c); tri(a, c, d);
    }
  }
  // 正面・背面(平らな面)
  const cap = (loop, flip) => {
    const c = loop.reduce((m, p) => m.add(p), new THREE.Vector3()).multiplyScalar(1 / loop.length);
    for (let i = 0; i < n; i++) flip ? tri(c, loop[(i + 1) % n], loop[i]) : tri(c, loop[i], loop[(i + 1) % n]);
  };
  cap(loops[0], false); cap(loops[loops.length - 1], true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  // 面が内向きになっていたら反転する(正面の面の向きで判定)
  const p = g.attributes.position;
  const frontNz = (() => { const i = (loops.length - 1) * n * 6; return g.attributes.normal.getZ(i); })();
  if (frontNz < 0) {
    for (let i = 0; i < p.count; i += 3) {
      const x = p.getX(i + 1), y = p.getY(i + 1), z = p.getZ(i + 1);
      p.setXYZ(i + 1, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2));
      p.setXYZ(i + 2, x, y, z);
    }
    g.computeVertexNormals();
  }
  g.userData.face = inset(O, 0.17);   // 画像を映す平らな面の形
  return g;
}

// クリスタル本体の素材。画像を正面から投影して、面ごとに少しずらす(屈折して見える)
function makeCrystalMaterial(envTex, imgMin, imgSize, imgA, imgB) {
  const blank = new THREE.DataTexture(new Uint8Array([233, 222, 248, 255]), 1, 1);
  blank.colorSpace = THREE.SRGBColorSpace; blank.needsUpdate = true;
  const u = {
    uImgA: { value: blank }, uImgB: { value: blank },
    uFitA: { value: new THREE.Vector4(1, 1, 0, 0) }, uFitB: { value: new THREE.Vector4(1, 1, 0, 0) },
    uMin: { value: imgMin }, uSize: { value: imgSize },
    uRefr: { value: 0.22 },       // 面ごとのずれ(屈折)の大きさ
    uEmis: { value: 0.16 },       // 画像の明るさ(内側から光っているように)
    uTime: { value: 0 },
    uFlash: { value: 0 },         // クリックしたときの光(0〜1)
  };
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, metalness: 0, roughness: 0.06,
    iridescence: 0.7, iridescenceIOR: 1.3, iridescenceThicknessRange: [260, 600],
    clearcoat: 1, clearcoatRoughness: 0.03,
    sheen: 0.25, sheenColor: new THREE.Color(0xe7d6ff), sheenRoughness: 0.4,
    envMap: envTex, envMapIntensity: 0.55,
    transparent: true,
    flatShading: false,
  });
  mat.userData.u = u;
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vOP;\nvarying vec3 vON;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvOP = position; vON = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vOP; varying vec3 vON;
        uniform sampler2D uImgA; uniform sampler2D uImgB;
        uniform vec4 uFitA; uniform vec4 uFitB;
        uniform vec2 uMin; uniform vec2 uSize;
        uniform float uRefr; uniform float uEmis; uniform float uTime; uniform float uFlash;
        vec3 crystalImg = vec3(0.); float crystalFlat = 1.0; vec3 crystalHolo = vec3(1.);`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          vec3 on = normalize(vON);
          bool front = on.z >= 0.0;
          vec2 p = (vOP.xy - uMin) / uSize;
          if (!front) p.x = 1.0 - p.x;                       // 裏から見ても文字が反転しないように
          vec2 sh2 = on.xy * (1.0 - abs(on.z));
          if (!front) sh2.x = -sh2.x;
          p += sh2 * uRefr;                                    // 面の傾きに合わせてずらす
          p = clamp(p, 0.0, 1.0);
          vec3 img = front ? texture2D(uImgA, p * uFitA.xy + uFitA.zw).rgb
                           : texture2D(uImgB, p * uFitB.xy + uFitB.zw).rgb;
          float flatW = smoothstep(0.985, 0.999, abs(on.z));    // 正面・背面の平らな面
          crystalFlat = flatW;
          // 光がガラスを通って分かれたときの、やわらかな虹色(トップのガラスの置物と同じ質感)。
          // 面の向きと位置でなめらかに色が流れ、回ったり揺れたりすると、色がゆっくり移り変わる
          vec3 vn = normalize(vNormal);
          float t = vOP.x * 0.42 - vOP.y * 0.30 + vn.x * 0.55 + vn.y * 0.35 + uTime * 0.025;
          vec3 holo = 0.68 + 0.32 * cos(6.2831 * (t + vec3(0.0, 0.33, 0.67)));
          vec3 clear = vec3(0.95, 0.94, 1.0);
          float shade = 0.90 + 0.10 * vn.z + 0.06 * vn.y;            // ふちの丸みに沿った、なめらかな明暗
          vec3 bevel = mix(clear, holo, 0.75) * shade;
          // 中の画像が、面取りの面ではプリズムのように色ずれしてゆがんで映る(赤・緑・青を少しずつずらす)
          vec2 dp = sh2 * 0.05;
          vec4 fit = front ? uFitA : uFitB;
          vec2 q = clamp(p, 0.0, 1.0);
          vec3 disp = front
            ? vec3(texture2D(uImgA, clamp(q + dp, 0., 1.) * fit.xy + fit.zw).r, texture2D(uImgA, q * fit.xy + fit.zw).g, texture2D(uImgA, clamp(q - dp, 0., 1.) * fit.xy + fit.zw).b)
            : vec3(texture2D(uImgB, clamp(q + dp, 0., 1.) * fit.xy + fit.zw).r, texture2D(uImgB, q * fit.xy + fit.zw).g, texture2D(uImgB, clamp(q - dp, 0., 1.) * fit.xy + fit.zw).b);
          bevel = mix(bevel, disp, 0.2);
          // 厚みの見え方:面取りの内側(画像との境目)ほど少し暗く、外のふちほど明るい
          float depthK = clamp(abs(vOP.z) / 0.09, 0.0, 1.0);
          bevel *= mix(1.08, 0.80, depthK);
          crystalHolo = holo;
          // 平らな面:画像の上に、ガラスの表面の虹色の反射と、やわらかな光の筋をうっすら重ねる
          float d = p.x - p.y * 0.55;
          float streak = smoothstep(0.34, 0.0, abs(d - 0.10)) * 0.09 + smoothstep(0.10, 0.0, abs(d + 0.30)) * 0.05;
          // まるいガラスのミラー:ふちに向かって、うすいラベンダーの色と光がにじむ
          float rr = length((p - 0.5) * 2.0);
          vec3 face = img + (holo - 0.68) * 0.07 + streak * 0.8;
          face = mix(face, vec3(0.86, 0.80, 0.98), smoothstep(0.62, 1.0, rr) * 0.38);
          face += vec3(1.0, 0.97, 1.0) * exp(-dot(p - vec2(0.30, 0.74), p - vec2(0.30, 0.74)) * 18.0) * 0.16;   // 左上のやわらかな映り込み
          diffuseColor.rgb = mix(bevel, face, flatW);
          crystalImg = mix(bevel * 0.8, face, flatW);
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += crystalImg * uEmis;
        // クリックしたときの光:画面の右上あたりに強い光が当たり、光の帯が斜めに走る
        {
          vec2 vp = -vViewPosition.xy;
          float gd = length(vp - vec2(0.50, 0.86));
          float spot = exp(-gd * gd * 12.0) * 1.7;
          float band = smoothstep(0.20, 0.0, abs(vp.x * 0.8 + vp.y * 0.6 - mix(-0.7, 1.7, uFlash))) * 0.55;
          totalEmissiveRadiance += (vec3(1.0) + (crystalHolo - 0.68) * 0.9) * (spot + band) * uFlash;
        }`)
      // 面取りの面は透けて、うしろ(ページの背景)が見える
      .replace('#include <opaque_fragment>', '#include <opaque_fragment>\ngl_FragColor.a = mix(0.62, 1.0, crystalFlat);');
  };
  const load = (img, key, fitKey) => {
    if (!img) return;
    const apply = () => {
      if (!img.naturalWidth) return;
      const k = Math.min(1, 1024 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
      // cover:枠より横長の画像は左右を、縦長の画像は上下を切る
      const ia = c.width / c.height, fa = imgSize.x / imgSize.y;
      u[fitKey].value.set(...(ia > fa ? [fa / ia, 1, (1 - fa / ia) / 2, 0] : [1, ia / fa, 0, (1 - ia / fa) / 2]));
      u[key].value = tex;
    };
    if (img.complete && img.naturalWidth) apply(); else img.addEventListener('load', apply, { once: true });
  };
  load(imgA, 'uImgA', 'uFitA'); load(imgB, 'uImgB', 'uFitB');
  return mat;
}

// 映り込み用の環境(部屋の光)
function makeEnvironment(renderer) {
  const env = new THREE.Scene();
  // まわりを包む、ラベンダー〜ピンクのグラデーションの球
  const sky = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {},
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: `varying vec3 vP;
      void main(){
        float y = vP.y * .5 + .5;
        vec3 low = vec3(.52,.44,.66), mid = vec3(.86,.78,.90), high = vec3(.97,.96,1.);
        vec3 c = mix(low, mid, smoothstep(0., .55, y));
        c = mix(c, high, smoothstep(.55, 1., y));
        c += vec3(.10,.02,.06) * smoothstep(.2,-.6, vP.x);   // 左はピンク寄り
        c += vec3(.0,.05,.09) * smoothstep(.2,.8, vP.x);     // 右は水色寄り
        gl_FragColor = vec4(c, 1.);
      }`,
  }));
  env.add(sky);
  // 光る板(窓の白い光・ピンク・水色・ラベンダー)
  const panel = (color, strength, w, h, x, y, z) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(strength), side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m);
  };
  panel(0xffffff, 8, 5, 3.5, 3, 5, 5);      // 右上の窓の光
  panel(0xffffff, 7, 0.6, 7, -2.2, 1, 6);   // 縦に細い光(面のふちが白く光る)
  panel(0x6f5a92, 1, 4, 6, 0, 0, 7);        // 正面のやや暗いプラム(面に濃淡をつける)
  panel(0xffc4e4, 3, 4, 4, -6, -1, 3);      // 左のピンク
  panel(0xbfe8ff, 3, 4, 3, 6, -2, 1);       // 右の水色
  panel(0xd8c8ff, 2.5, 6, 3, 0, -5, -4);    // 下・奥のラベンダー
  panel(0xffffff, 3, 2, 6, -4, 3, -5);      // 背中側の白
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(env, 0.035).texture;
  pm.dispose();
  return tex;
}
