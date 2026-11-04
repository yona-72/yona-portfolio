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

const ASPECT = 100 / 124;          // 枠の縦横比(sections.css の .crystal と同じ)
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
  camera.position.set(0, 0.08, 6.4);
  camera.lookAt(0, 0.08, 0);

  // ---- 映り込みの環境:トップの部屋の光(白い窓・ピンク・水色・ラベンダー)を、ぼかした光の箱で作る ----
  const envTex = makeEnvironment(renderer);

  // ---- クリスタルの形 ----
  const crystalGeo = makeCrystalGeometry();
  crystalGeo.computeBoundingBox();
  const cb = crystalGeo.boundingBox;
  // 画像を映す範囲(クリスタルの正面いっぱい。少しだけ内側に寄せる)
  const imgMin = new THREE.Vector2(cb.min.x + 0.06, cb.min.y + 0.04);
  const imgSize = new THREE.Vector2(cb.max.x - cb.min.x - 0.12, cb.max.y - cb.min.y - 0.12);

  // 表面をおおう、うすいガラスの膜:正面を向いた面は透け、斜めの面・ふちほど光を映して白く光る(フレネル)
  const shell = new THREE.MeshPhysicalMaterial({
    color: 0xf6f0ff, metalness: 0, roughness: 0.03,
    transparent: true, depthWrite: false,
    iridescence: 1, iridescenceIOR: 1.3, iridescenceThicknessRange: [240, 620],
    clearcoat: 1, clearcoatRoughness: 0.02,
    envMap: envTex, envMapIntensity: 1.3,
    flatShading: true,
  });
  fresnel(shell, 0.0, 0.5);
  // カットの稜線(白く光る細い線)
  const edgeGeo = new THREE.EdgesGeometry(crystalGeo, 12);
  const edgeMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 });

  // 光源:右上から白、左下からピンク、右下から水色(虹色の映り込みを出す)
  const lights = () => {
    const g = new THREE.Group();
    const key = new THREE.DirectionalLight(0xffffff, 1.1); key.position.set(2.5, 3.5, 4); g.add(key);
    const pink = new THREE.PointLight(0xffb8e0, 6, 12); pink.position.set(-2.6, -1.2, 2.6); g.add(pink);
    const cyan = new THREE.PointLight(0xb6e6ff, 5, 12); cyan.position.set(2.8, -1.8, 1.8); g.add(cyan);
    g.add(new THREE.AmbientLight(0xf1e8ff, 0.2));
    return g;
  };

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
    const edges = new THREE.LineSegments(edgeGeo, edgeMat); edges.renderOrder = 3; edges.scale.setScalar(1.007);
    rig.add(crystal, skin, edges);

    const canvas = document.createElement('canvas');
    canvas.className = 'crystal__canvas';
    canvas.setAttribute('aria-hidden', 'true');
    thumb.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    const v = { thumb, scene, rig, canvas, ctx, visible: false, hover: false, turn: 0, tilt: { x: 0, y: 0 }, tiltT: { x: 0, y: 0 }, phase: i * 1.7, ready: false };

    thumb.addEventListener('pointerenter', () => { v.hover = true; });
    thumb.addEventListener('pointerleave', () => { v.hover = false; v.tiltT.x = v.tiltT.y = 0; });
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

  const clock = new THREE.Clock();
  let last = 0;
  function frame() {
    const t = clock.getElapsedTime();
    const dt = Math.min(0.05, t - last); last = t;
    for (const v of views) {
      if (!v.visible) continue;
      sizeFor(v);
      // 回転:ホバー中は半回転(π)。やわらかく追いかける
      const target = v.hover ? Math.PI : 0;
      v.turn += (target - v.turn) * (1 - Math.pow(0.0025, dt));
      v.tilt.x += (v.tiltT.x - v.tilt.x) * (1 - Math.pow(0.01, dt));
      v.tilt.y += (v.tiltT.y - v.tilt.y) * (1 - Math.pow(0.01, dt));
      const s = reduce ? 0 : 1;
      const tt = t + v.phase;
      v.rig.rotation.y = v.turn + s * Math.sin(tt * 0.45) * 0.22 + v.tilt.y;
      v.rig.rotation.x = s * Math.sin(tt * 0.33) * 0.05 + v.tilt.x;
      v.rig.rotation.z = s * Math.sin(tt * 0.27) * 0.035;
      v.rig.position.y = s * Math.sin(tt * 0.8) * 0.06;
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
// クリスタルの形:横に何段かの「輪」を重ね、上は尖らせ、底は平らに切る。
// 輪の角の位置を不揃いにして、手で削ったような面にしている
function makeCrystalGeometry() {
  const N = 8;
  const ang = [0, 0.72, 1.5, 2.25, 3.14, 3.95, 4.72, 5.5];      // 角の向き(不揃い)
  const jit = [1.0, 0.93, 1.05, 0.96, 1.0, 0.94, 1.04, 0.97];   // 角ごとのふくらみ
  // [高さ, 横の半径, 奥行きの半径, 中心のずれx]
  const rings = [
    [-1.22, 0.60, 0.30, 0.00],   // 底(平ら)
    [-1.10, 0.74, 0.37, 0.00],   // 底の面取り
    [ 0.20, 0.80, 0.40, 0.03],   // 胴
    [ 0.78, 0.52, 0.27, 0.07],   // 肩
  ];
  const apex = new THREE.Vector3(0.12, 1.42, 0.0);
  const ringPts = rings.map(([y, rx, rz, ox], ri) => ang.map((a, k) => {
    const j = jit[(k + ri) % N];
    return new THREE.Vector3(ox + Math.cos(a) * rx * j, y + (ri === 3 ? Math.sin(a * 2) * 0.07 : 0), Math.sin(a) * rz * j);
  }));
  const pos = [];
  const tri = (a, b, c) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  // 側面
  for (let r = 0; r < rings.length - 1; r++) {
    for (let k = 0; k < N; k++) {
      const a = ringPts[r][k], b = ringPts[r][(k + 1) % N], c = ringPts[r + 1][(k + 1) % N], d = ringPts[r + 1][k];
      tri(a, b, c); tri(a, c, d);
    }
  }
  // 上の尖り
  const top = ringPts[rings.length - 1];
  for (let k = 0; k < N; k++) tri(top[k], top[(k + 1) % N], apex);
  // 底
  const bc = new THREE.Vector3(0, rings[0][0], 0);
  for (let k = 0; k < N; k++) tri(ringPts[0][(k + 1) % N], ringPts[0][k], bc);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  // 面の向きを外側にそろえる(輪の向きに合わせて、内向きなら反転)
  g.computeVertexNormals();
  const n = g.attributes.normal, p = g.attributes.position;
  let inward = 0;
  for (let i = 0; i < p.count; i += 3) {
    const cx = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3, cz = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
    if (cx * n.getX(i) + cz * n.getZ(i) < 0) inward++;
  }
  if (inward > p.count / 6) {
    for (let i = 0; i < p.count; i += 3) {
      const x = p.getX(i + 1), y = p.getY(i + 1), z = p.getZ(i + 1);
      p.setXYZ(i + 1, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2));
      p.setXYZ(i + 2, x, y, z);
    }
    g.computeVertexNormals();
  }
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
    uRefr: { value: 0.07 },       // 面ごとのずれ(屈折)の大きさ
    uEmis: { value: 0.30 },       // 画像の明るさ(内側から光っているように)
  };
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, metalness: 0, roughness: 0.12,
    iridescence: 0.7, iridescenceIOR: 1.3, iridescenceThicknessRange: [260, 600],
    clearcoat: 1, clearcoatRoughness: 0.03,
    sheen: 0.25, sheenColor: new THREE.Color(0xe7d6ff), sheenRoughness: 0.4,
    envMap: envTex, envMapIntensity: 0.55,
    flatShading: true,
  });
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
        uniform float uRefr; uniform float uEmis;
        vec3 crystalImg = vec3(0.);`)
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
          float w = smoothstep(0.12, 0.62, abs(on.z));          // 横を向いた面は画像が薄く、ガラスの色に
          vec3 glassTint = vec3(0.80, 0.74, 0.93);
          diffuseColor.rgb = mix(glassTint, img, w);
          crystalImg = img * w;
        }`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += crystalImg * uEmis;');
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
