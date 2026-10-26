// =============================================================
//  背景シェーダー(フラグメント)
//  - 画面は固定。カーソル位置(light)と動き(energy)で反射だけが変化する
//  - masks.png の R:虹色ガラス / G:縁のきらめき / B:光が落ちる面
// =============================================================
export const vertexShader = /* glsl */ `
attribute vec2 p;
varying vec2 v;
void main(){ v = p * .5 + .5; gl_Position = vec4(p, 0., 1.); }
`;

export const fragmentShader = /* glsl */ `
  precision highp float;
  varying vec2 v;
  uniform sampler2D img, msk;
  uniform vec2 res, imgSize;
  uniform vec2 light;     // カーソル位置(画像のUV)
  uniform vec2 view;      // 初期位置からのカーソルのずれ
  uniform float energy;   // カーソルの速さ(減衰する)
  uniform float t;
  uniform float water;    // 水面のような揺らめきの強さ(カーソルに関係なく常に動く)

  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
  float noise(vec2 p){
    vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
    return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
  }
  float fbm(vec2 p){ float a=.5, s=0.; for(int i=0;i<4;i++){ s+=a*noise(p); p*=2.03; a*=.5; } return s; }

  // 明るさを保ったまま色相だけ回す
  vec3 hueRot(vec3 c, float a){
    const mat3 toYIQ = mat3(.299,.596,.211, .587,-.274,-.523, .114,-.322,.312);
    const mat3 toRGB = mat3(1.,1.,1., .956,-.272,-1.106, .621,-.647,1.703);
    vec3 y = toYIQ * c; float cs = cos(a), sn = sin(a);
    y.yz = vec2(y.y*cs - y.z*sn, y.y*sn + y.z*cs);
    return toRGB * y;
  }

  float caustic(vec2 p, float time){
    vec2 i = p; float c = 1.;
    for (int n = 0; n < 4; n++) {
      float tt = time * (1. - 3.5/float(n+1));
      i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
      c += 1. / length(vec2(p.x / (sin(i.x + tt) / .006), p.y / (cos(i.y + tt) / .006)));
    }
    c /= 4.; c = 1.17 - pow(c, 1.4);
    return pow(abs(c), 8.);
  }

  vec2 coverUV(vec2 uv){
    float rs = res.x/res.y, ri = imgSize.x/imgSize.y;
    vec2 s = rs > ri ? vec2(1., ri/rs) : vec2(rs/ri, 1.);
    return (uv - .5) * s + .5;
  }

  void main(){
    vec2 uv = coverUV(v); uv.y = 1. - uv.y;
    vec4 m = texture2D(msk, uv);
    float irid = m.r, glint = m.g, recv = m.b;
    float aspect = imgSize.x / imgSize.y;
    vec2 q = vec2(uv.x*aspect, uv.y);
    vec2 L = vec2(light.x*aspect, light.y);
    float near = exp(-dot(q-L, q-L) * 3.2);          // カーソル周辺
    float wide = exp(-dot(q-L, q-L) * .9);

    // ガラスの中の屈折だけがわずかに揺らぐ(画面全体は動かない)
    float wob = (energy * .9 + .08 + water * .65) * irid;
    vec2 w = vec2(fbm(q*7. + t*.25) - .5, fbm(q*7. - t*.21 + 4.) - .5) * .0045 * wob;
    vec3 base = texture2D(img, uv).rgb;
    vec3 col = texture2D(img, uv + w).rgb;
    col = mix(base, col, irid);

    // 1) 見る角度が変わったように虹色がずれる(初期位置では元の色そのまま)
    float pf = fbm(q*2.4) * 6.2832 + (q.x*1.4 - q.y*.9) * 3.;
    float vp = dot(view, vec2(4.2, -3.1)) + length(view) * 1.5
             + water * .80 * sin(t * .26 + pf * .5)
             + sin(t*.18 + pf) * .12 + energy * sin(pf*1.7 + t*1.3) * .6;
    float ang = (sin(pf + vp) - sin(pf)) * 1.05;
    col = mix(col, hueRot(col, ang), irid);

    // 2) カーソルを光源に見立てて、ガラスの反射が強まる(元の色味のまま明るく)
    float facing = .5 + .5 * sin(pf*1.6 + vp*1.4);
    vec3 lit = col + (col - vec3(dot(col, vec3(.333)))) * .25;   // 彩度を少しだけ
    col = mix(col, lit, irid * near * .5);
    col += col * irid * (near * .10 + wide * .03) * facing;

    // 3) 床や壁に落ちる分光した光が、カーソルの近くで揺らぐ
    vec2 cp = q * 5.2 + view * 1.8 - 250.;
    float ct = t * .16 + length(view) * 2. + 23.;
    vec3 cs = vec3(caustic(cp + vec2(.016,0.), ct), caustic(cp, ct), caustic(cp - vec2(.016,0.), ct));
    vec3 tint = mix(vec3(1.), normalize(base + .05) * 1.7, .6);    // その場の色に合わせる
    col += cs * tint * recv * (near * .10 + energy * near * .10 + .012);

    // 5) 水面の反射光:水槽越しの光のような模様が、床や壁をゆっくり流れる
    //    カーソルに関係なく常に動き、数秒ごとに強まったり弱まったりする
    vec2 wp = q * 2.6 + vec2(t * .042, -t * .030) - 120.;
    float wt = t * .14 + 7.;
    vec3 wc = vec3(caustic(wp + vec2(.022, 0.), wt), caustic(wp, wt), caustic(wp - vec2(.022, 0.), wt));
    float breathe = .55 + .45 * sin(t * .5 + fbm(q * 1.4 + t * .05) * 6.2832);
    col += wc * tint * recv * water * breathe * .50;
    // ガラス面にも、ゆっくり動く明るい帯をうっすら重ねる
    float band = pow(.5 + .5 * sin((q.x * 1.2 + q.y * .8) * 5. - t * .35 + fbm(q * 2. + t * .04) * 4.), 6.);
    col += col * irid * band * water * .16;

    // 4) ガラスの縁のきらめきはカーソルに近いほど強く
    float tw = pow(noise(q*40. + view*30. + t*.6), 5.) * 3.;
    col += glint * (tw * (.25 + near + water * .35) + near * .2 + energy * .2) * .12;

    col += (hash(gl_FragCoord.xy + fract(t)) - .5) / 510.;
    gl_FragColor = vec4(col, 1.);
  }
`;
