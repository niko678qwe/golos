/* 3D-человек для кадров 9, 11, 13 (Регина). Сетка — 3d/chelovek-dannye.js
   (window.CHELOVEK, собирает 3d/setka.mjs). Один холст на весь доклад: кадр
   при входе забирает его к себе (vstavit). WebGL1, рисуем только при
   изменении — ПК учителя в покое не нагружается; на медленном ПК при
   вращении разрешение ниже, отпустили — снова чётко.

   Местная температура: туловище = температура тела T, к кистям и стопам
   холоднее: t = T − e·(3 + 11·s) + kon·e, где e — удалённость от ядра (0…1),
   s — тяжесть (37 − T) / 9, kon — добавка к рукам и ногам (растирание).
   Иллюстрация, не тепловизор — так и подписано на кадрах. */
window.Chelovek3D = (function () {
  'use strict';
  const D = window.CHELOVEK;
  if (!D) return null;
  const dec = (s, T) => { const b = Uint8Array.from(atob(s), (c) => c.charCodeAt(0)); return new T(b.buffer); };
  const POS = dec(D.pos, Float32Array), NRM = dec(D.nrm, Float32Array), E = dec(D.e, Float32Array),
    PART = dec(D.part, Uint8Array), IDX = dec(D.idx, Uint16Array);

  const tyazhest = (T) => Math.max(0, (37 - T) / 9);
  const sost = { T: 37, kon: 0, svet: 0, yaw: 0.35, pitch: 0.08, dist: 3.6 };
  const mestnaya = (e) => sost.T - e * (3 + 11 * tyazhest(sost.T)) + sost.kon * e;

  const obertka = document.createElement('div');
  obertka.className = 'ch3d';
  obertka.innerHTML = '<canvas></canvas><div class="ch3d-metka"><i></i><b></b></div>';
  const cv = obertka.querySelector('canvas');
  const metkaEl = obertka.querySelector('.ch3d-metka');
  const gl = cv.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: false });
  if (!gl) return null;

  const VS = `attribute vec3 aPos; attribute vec3 aNrm; attribute float aE;
uniform mat4 uPV; uniform mat3 uViewRot; varying vec3 vN; varying float vE; varying vec3 vP;
void main(){ vN = uViewRot*aNrm; vE = aE; vP = aPos; gl_Position = uPV*vec4(aPos,1.); }`;
  // Тёплые точки (кадр 11): шея, грудь, подмышки — светятся карамелью.
  const FS = `precision mediump float;
varying vec3 vN; varying float vE; varying vec3 vP;
uniform float uT; uniform float uS; uniform float uKon; uniform float uSvet;
vec3 lin(vec3 c){ return c*c; }
vec3 pal(float w){
  vec3 c0=lin(vec3(.17,.31,.62)), c1=lin(vec3(.31,.64,.74)), c2=lin(vec3(.93,.86,.70)),
       c3=lin(vec3(.88,.54,.24)), c4=lin(vec3(.76,.22,.17));
  w=clamp(w,0.,1.)*4.;
  if(w<1.) return mix(c0,c1,w); if(w<2.) return mix(c1,c2,w-1.);
  if(w<3.) return mix(c2,c3,w-2.); return mix(c3,c4,w-3.);
}
float pyatno(vec3 c, float r){ vec3 d=vP-c; return exp(-dot(d,d)/(r*r)); }
void main(){
  vec3 n = normalize(vN);
  float t = uT - vE*(3. + 11.*uS) + uKon*vE;
  vec3 col = pal((t-20.)/17.);
  float p = pyatno(vec3(0.,1.48,.04),.08) + pyatno(vec3(.17,1.31,0.),.085) + pyatno(vec3(-.17,1.31,0.),.085)
          + pyatno(vec3(0.,1.27,.11),.09);
  col = mix(col, lin(vec3(1.,.93,.55)), clamp(p*1.3,0.,1.)*uSvet);
  vec3 L = normalize(vec3(-.5,.8,.6));
  float dif = max(dot(n,L),0.);
  float amb = .55 + .35*n.y;
  float rim = pow(1.-max(n.z,0.),3.);
  vec3 c = col*(.42*amb + .9*dif) + vec3(1.,.92,.78)*rim*.12;
  gl_FragColor = vec4(sqrt(c),1.);
}`;
  const GVS = `attribute vec2 aXZ; uniform mat4 uPV; varying vec2 v;
void main(){ v = aXZ; gl_Position = uPV*vec4(aXZ.x,0.,aXZ.y,1.); }`;
  const GFS = `precision mediump float; varying vec2 v;
void main(){ float r = dot(v*vec2(3.,4.5), v*vec2(3.,4.5)); gl_FragColor = vec4(.10,.20,.30,.30*exp(-r)); }`;
  function prog(vs, fs) {
    const p = gl.createProgram();
    for (const [t, s] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
      const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
      gl.attachShader(p, sh);
    }
    gl.linkProgram(p); return p;
  }
  const P = prog(VS, FS), G = prog(GVS, GFS);
  const buf = (data, target = gl.ARRAY_BUFFER) => { const b = gl.createBuffer(); gl.bindBuffer(target, b); gl.bufferData(target, data, gl.STATIC_DRAW); return b; };
  const bPos = buf(POS), bNrm = buf(NRM), bE = buf(E), bIdx = buf(IDX, gl.ELEMENT_ARRAY_BUFFER);
  const bG = buf(new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]));
  const attr = (p, name, b, n) => { const l = gl.getAttribLocation(p, name); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, n, gl.FLOAT, false, 0, 0); return l; };
  const U = (p, n) => gl.getUniformLocation(p, n);

  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const norm = (a) => { const l = Math.hypot(...a); return a.map((v) => v / l); };
  // Камера крутится и приближается вокруг живота (06.11.2026: было 0.84 — пах).
  // Сама фигура на общем плане стоит там же, что и раньше: сдвиг картинки вверх,
  // иначе обрежутся стопы; при приближении сдвиг сходит на нет — живот по центру.
  const FOV = 0.55, CEL = [0, 1.05, 0], BYLO_Y = 0.84, BLIZKO = 1.4, OBSHCHIJ = 3.6;
  const sdvigEkrana = (d) => Math.max(0, Math.min(1, (d - BLIZKO) / (OBSHCHIJ - BLIZKO)))
    * (CEL[1] - BYLO_Y) / (Math.max(d, OBSHCHIJ) * Math.tan(FOV / 2));
  let PV = null, baza = null;
  function matricy(aspect) {
    const sd = sdvigEkrana(sost.dist);
    const cp = Math.cos(sost.pitch);
    const eye = [CEL[0] + sost.dist * cp * Math.sin(sost.yaw), CEL[1] + sost.dist * Math.sin(sost.pitch), CEL[2] + sost.dist * cp * Math.cos(sost.yaw)];
    const f = norm(sub(CEL, eye)), r = norm(cross(f, [0, 1, 0])), u = cross(r, f);
    const view = [r[0], u[0], -f[0], 0, r[1], u[1], -f[1], 0, r[2], u[2], -f[2], 0, -dot(r, eye), -dot(u, eye), dot(f, eye), 1];
    const t = 1 / Math.tan(FOV / 2), n = 0.1, fa = 20;
    const proj = [t / aspect, 0, 0, 0, 0, t, 0, 0, 0, -sd, (fa + n) / (n - fa), -1, 0, 0, 2 * fa * n / (n - fa), 0];
    const pv = new Float32Array(16);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      let s = 0; for (let k = 0; k < 4; k++) s += proj[k * 4 + j] * view[i * 4 + k]; pv[i * 4 + j] = s;
    }
    return { pv, rot: new Float32Array([r[0], u[0], -f[0], r[1], u[1], -f[1], r[2], u[2], -f[2]]), eye, f, r, u, sd };
  }

  let vrashchaetsya = 0; // палец на пульте крутит — как мышь: на медленном ПК грубее
  let zhdu = false, tyanu = null, sdvig = 0, kachVrashcheniya = 1, tochka = null, slushatel = null;
  const pereris = () => { if (!zhdu) { zhdu = true; requestAnimationFrame(risovat); } };
  function risovat() {
    zhdu = false;
    if (!obertka.isConnected || !cv.clientWidth) return;
    const kach = tyanu || vrashchaetsya ? kachVrashcheniya : 1;
    const w = Math.round(cv.clientWidth * kach), h = Math.round(cv.clientHeight * kach);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const m = matricy(cv.clientWidth / cv.clientHeight); PV = m.pv; baza = m;
    gl.useProgram(G); gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniformMatrix4fv(U(G, 'uPV'), false, PV);
    const lg = attr(G, 'aXZ', bG, 2); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); gl.disableVertexAttribArray(lg);
    gl.disable(gl.BLEND); gl.enable(gl.DEPTH_TEST);
    gl.useProgram(P);
    gl.uniformMatrix4fv(U(P, 'uPV'), false, PV);
    gl.uniformMatrix3fv(U(P, 'uViewRot'), false, m.rot);
    gl.uniform1f(U(P, 'uT'), sost.T);
    gl.uniform1f(U(P, 'uS'), tyazhest(sost.T));
    gl.uniform1f(U(P, 'uKon'), sost.kon);
    gl.uniform1f(U(P, 'uSvet'), sost.svet);
    const ls = [attr(P, 'aPos', bPos, 3), attr(P, 'aNrm', bNrm, 3), attr(P, 'aE', bE, 1)];
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bIdx);
    gl.drawElements(gl.TRIANGLES, IDX.length, gl.UNSIGNED_SHORT, 0);
    ls.forEach((l) => gl.disableVertexAttribArray(l));
    metka();
    if (slushatel) slushatel(sost);
  }

  // Луч из камеры → ближайший треугольник → часть тела и её температура.
  function luch(px, py) {
    if (!baza) return null;
    const w = cv.clientWidth, h = cv.clientHeight, t = Math.tan(FOV / 2);
    const x = (px / w * 2 - 1) * t * (w / h), y = (1 - py / h * 2 - baza.sd) * t;
    const d = norm([0, 1, 2].map((i) => baza.f[i] + x * baza.r[i] + y * baza.u[i]));
    let best = Infinity, hit = null;
    for (let i = 0; i < IDX.length; i += 3) {
      const a = IDX[i], b = IDX[i + 1], c = IDX[i + 2];
      const A = [POS[a * 3], POS[a * 3 + 1], POS[a * 3 + 2]];
      const e1 = [POS[b * 3] - A[0], POS[b * 3 + 1] - A[1], POS[b * 3 + 2] - A[2]];
      const e2 = [POS[c * 3] - A[0], POS[c * 3 + 1] - A[1], POS[c * 3 + 2] - A[2]];
      const p = cross(d, e2), det = dot(e1, p);
      if (Math.abs(det) < 1e-9) continue;
      const s = sub(baza.eye, A), u = dot(s, p) / det; if (u < 0 || u > 1) continue;
      const q = cross(s, e1), v = dot(d, q) / det; if (v < 0 || u + v > 1) continue;
      const tt = dot(e2, q) / det;
      if (tt > 0 && tt < best) { best = tt; hit = { a, b, c, u, v }; }
    }
    if (!hit) return null;
    const { a, b, c, u, v } = hit, wa = 1 - u - v;
    const p = [0, 1, 2].map((i) => POS[a * 3 + i] * wa + POS[b * 3 + i] * u + POS[c * 3 + i] * v);
    const vr = [[wa, a], [u, b], [v, c]].sort((x, y) => y[0] - x[0])[0][1];
    return { p, e: E[a] * wa + E[b] * u + E[c] * v, part: PART[vr] };
  }
  const ZHEN = new Set(['кисть', 'голень', 'стопа']);
  const STORONA = new Set([3, 6, 7, 8, 9, 10, 11]);
  function imyaChasti(t) {
    let imya = D.chasti[t.part];
    // человек смотрит на +z, его левая сторона — x > 0
    if (STORONA.has(t.part)) imya = (t.p[0] > 0 ? (ZHEN.has(imya) ? 'левая ' : 'левое ') : (ZHEN.has(imya) ? 'правая ' : 'правое ')) + imya;
    return imya[0].toUpperCase() + imya.slice(1);
  }
  // Метки на теле (кадр 11: грелки, кружка): привязаны к точкам модели и
  // переставляются при каждом рисовании — крутится фигура, едут и они.
  const markEl = document.createElement('div');
  markEl.className = 'ch3d-markery';
  obertka.appendChild(markEl);
  let markery = [];
  function naEkran(p) {
    const m = PV, [x, y, z] = p;
    const cx = m[0] * x + m[4] * y + m[8] * z + m[12], cy = m[1] * x + m[5] * y + m[9] * z + m[13], cw = m[3] * x + m[7] * y + m[11] * z + m[15];
    return [(cx / cw * 0.5 + 0.5) * cv.clientWidth, (0.5 - cy / cw * 0.5) * cv.clientHeight];
  }
  function postavitMarkery() {
    if (!PV) return;
    for (const mk of markery) {
      const [x, y] = naEkran(mk.p);
      mk.el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
    }
  }
  // Поток крови (кадр 13): частицы бегут по дорожкам на теле (точки модели,
  // проецируются на экран каждый кадр — крутится фигура, едет и поток).
  // Свой 2D-холст поверх фигуры; рисуется, только пока поток включён.
  const potokCv = document.createElement('canvas');
  potokCv.className = 'ch3d-potok';
  obertka.insertBefore(potokCv, markEl);
  let potok = null, potokRaf = 0;
  function risovatPotok(t) {
    potokRaf = 0;
    const c = potokCv.getContext('2d'), dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = cv.clientWidth, H = cv.clientHeight;
    if (potokCv.width !== Math.round(W * dpr)) { potokCv.width = Math.round(W * dpr); potokCv.height = Math.round(H * dpr); }
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    if (!potok || !PV) return;
    // время кадра rAF бывает чуть раньше момента запуска — не уходим в минус
    const sek = Math.max(0, (performance.now() - potok.t0) / 1000);
    const gasnet = potok.gasnet ? Math.max(0, 1 - (performance.now() - potok.gasnet) / 600) : 1;
    if (potok.gasnet && gasnet <= 0) { potok = null; return; }
    const proyavl = Math.max(0.05, Math.min(1, sek / 0.6)) * gasnet;
    const r = Math.max(4, W * 0.013);
    for (const put of potok.puti) {
      const tochki = put.map(naEkran);
      const dliny = [0];
      for (let i = 1; i < tochki.length; i++) dliny.push(dliny[i - 1] + Math.hypot(tochki[i][0] - tochki[i - 1][0], tochki[i][1] - tochki[i - 1][1]));
      const L = dliny[dliny.length - 1] || 1;
      // дорожка — бледная синяя линия
      c.globalAlpha = 0.28 * proyavl; c.strokeStyle = '#2b6fb3'; c.lineWidth = r * 1.6; c.lineCap = 'round'; c.lineJoin = 'round';
      c.beginPath(); tochki.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.stroke();
      // частицы холодной крови
      const N = 11;
      for (let i = 0; i < N; i++) {
        const d = ((sek * 0.45 + i / N) % 1) * L;
        let k = 1;
        while (k < dliny.length - 1 && dliny[k] < d) k++;
        const q = (d - dliny[k - 1]) / Math.max(1, dliny[k] - dliny[k - 1]);
        const x = tochki[k - 1][0] + (tochki[k][0] - tochki[k - 1][0]) * q, y = tochki[k - 1][1] + (tochki[k][1] - tochki[k - 1][1]) * q;
        c.globalAlpha = proyavl * (0.55 + 0.45 * (d / L));
        c.fillStyle = 'rgba(80, 150, 230, .35)'; c.beginPath(); c.arc(x, y, r * 1.9, 0, 6.283); c.fill(); // свечение
        c.fillStyle = '#1f5fa8'; c.beginPath(); c.arc(x, y, r, 0, 6.283); c.fill();
        c.fillStyle = '#cfe6fb'; c.beginPath(); c.arc(x - r * 0.3, y - r * 0.3, r * 0.38, 0, 6.283); c.fill();
      }
      // стрелка перед сердцем: на последнем отрезке, остриём к сердцу
      const a = tochki[tochki.length - 2], b2 = tochki[tochki.length - 1];
      const ug = Math.atan2(b2[1] - a[1], b2[0] - a[0]), sx = a[0] + (b2[0] - a[0]) * 0.45, sy = a[1] + (b2[1] - a[1]) * 0.45, s = r * 2.4;
      c.globalAlpha = 0.9 * proyavl; c.fillStyle = '#1f5fa8';
      c.beginPath(); c.moveTo(sx + Math.cos(ug) * s, sy + Math.sin(ug) * s);
      c.lineTo(sx + Math.cos(ug + 2.5) * s, sy + Math.sin(ug + 2.5) * s); c.lineTo(sx + Math.cos(ug - 2.5) * s, sy + Math.sin(ug - 2.5) * s); c.closePath(); c.fill();
    }
    c.globalAlpha = 1;
    potokRaf = requestAnimationFrame(risovatPotok);
  }
  function metka() {
    postavitMarkery();
    if (!tochka || !PV) { metkaEl.classList.remove('on'); return; }
    const [x, y, z] = tochka.p, m = PV;
    const cx = m[0] * x + m[4] * y + m[8] * z + m[12], cy = m[1] * x + m[5] * y + m[9] * z + m[13],
      cw = m[3] * x + m[7] * y + m[11] * z + m[15];
    metkaEl.style.transform = 'translate(' + ((cx / cw * 0.5 + 0.5) * cv.clientWidth).toFixed(1) + 'px,' + ((0.5 - cy / cw * 0.5) * cv.clientHeight).toFixed(1) + 'px)';
    metkaEl.querySelector('b').textContent = imyaChasti(tochka) + ': ≈ ' + Math.round(mestnaya(tochka.e)) + ' °C';
    metkaEl.classList.add('on');
  }

  // Мышь на компьютере: тянуть — вращать, щелчок — градусы. Щелчок по фигуре
  // не листает кадр (движок пропускает .ch3d).
  cv.addEventListener('pointerdown', (e) => { tyanu = [e.clientX, e.clientY]; sdvig = 0; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', (e) => {
    if (!tyanu) return;
    const dx = e.clientX - tyanu[0], dy = e.clientY - tyanu[1];
    sdvig += Math.abs(dx) + Math.abs(dy);
    sost.yaw -= dx * 0.008;
    sost.pitch = Math.min(1.3, Math.max(-0.5, sost.pitch + dy * 0.006));
    tyanu = [e.clientX, e.clientY]; pereris();
  });
  cv.addEventListener('pointerup', (e) => {
    const bylClik = tyanu && sdvig < 6;
    tyanu = null;
    if (bylClik) {
      const r = cv.getBoundingClientRect();
      tochka = luch(e.clientX - r.left, e.clientY - r.top);
      if (tochka && api.naTochku) api.naTochku(tochka.p);
    }
    pereris();
  });
  cv.addEventListener('wheel', (e) => { e.preventDefault(); sost.dist = Math.min(5, Math.max(1.4, sost.dist * (e.deltaY > 0 ? 1.08 : 0.93))); pereris(); }, { passive: false });
  addEventListener('resize', pereris);

  // Плавная смена состояния: до цели за ms, по кадрам, потом рисование
  // прекращается.
  // Прерванная анимация (новая, «Сначала», смена кадра) всё равно сообщает,
  // что закончилась, — иначе цепочка шагов (кадр 11) повисала бы навсегда.
  // Вращение пальцем или мышью анимацию не прерывает (04.11.2026: покрутил
  // фигуру во время «Как греть» — температура и кружка не появились).
  let anim = 0, konecAnim = null;
  function prervat() {
    cancelAnimationFrame(anim);
    if (konecAnim) { const f = konecAnim; konecAnim = null; f(); }
  }
  function k(cel, ms) {
    prervat();
    const ot = Object.assign({}, sost), t0 = performance.now();
    return new Promise((gotovo) => {
      konecAnim = gotovo;
      const shag = (t) => {
        const q = Math.min(1, (t - t0) / ms), g = q < 0.5 ? 2 * q * q : 1 - Math.pow(-2 * q + 2, 2) / 2;
        for (const kl in cel) sost[kl] = ot[kl] + (cel[kl] - ot[kl]) * g;
        risovat();
        if (q < 1) anim = requestAnimationFrame(shag);
        else { konecAnim = null; gotovo(); }
      };
      anim = requestAnimationFrame(shag);
    });
  }

  let zamereno = false;
  function zamerit() {
    if (zamereno || !cv.clientWidth) return;
    zamereno = true;
    const px = new Uint8Array(4), t = [];
    for (let i = 0; i < 3; i++) { const s = performance.now(); risovat(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); t.push(performance.now() - s); }
    const ms = t.sort((a, b) => a - b)[1];
    if (ms > 25) kachVrashcheniya = ms > 60 ? 0.35 : 0.5;
    api.zamer = { ms: Math.round(ms), kachVrashcheniya };
  }

  const api = {
    sost, k, pereris, zamer: null,
    vstavit(kuda) { if (obertka.parentElement !== kuda) kuda.appendChild(obertka); tochka = null; requestAnimationFrame(() => { zamerit(); risovat(); }); },
    postavit(s) { prervat(); Object.assign(sost, s); tochka = null; pereris(); },
    // Указка с телефона: «щелчок» в точке экрана — градусы там, где фигура.
    tknut(clientX, clientY) {
      const r = cv.getBoundingClientRect();
      const t = luch(clientX - r.left, clientY - r.top);
      if (!t) return false;
      tochka = t; pereris(); return true;
    },
    tochkaVTele(clientX, clientY) {
      const r = cv.getBoundingClientRect();
      return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
    },
    povernut() { return k({ yaw: sost.yaw + Math.PI / 2 }, 1200); },
    tknutChast(p) { // точка на теле по координатам модели (кнопки пульта)
      const vr = { p, e: 0, part: 0 };
      let best = Infinity;
      for (let i = 0; i < E.length; i++) {
        const d = (POS[i * 3] - p[0]) ** 2 + (POS[i * 3 + 1] - p[1]) ** 2 + (POS[i * 3 + 2] - p[2]) ** 2;
        if (d < best) { best = d; vr.e = E[i]; vr.part = PART[i]; vr.p = [POS[i * 3], POS[i * 3 + 1], POS[i * 3 + 2]]; }
      }
      tochka = vr; pereris();
    },
    sbrositTochku() { tochka = null; pereris(); },
    // С телефона-пульта (04.11.2026: «сложно нажать и выделить температуру —
    // сделай и там 3D-модель»): камера как на телефоне, температура без сброса
    // точки (градусы под пальцем обновляются).
    kamera(kam) {
      if (!kam) return;
      for (const kl of ['yaw', 'pitch', 'dist']) if (Number.isFinite(+kam[kl])) sost[kl] = +kam[kl];
      sost.pitch = Math.min(1.3, Math.max(-0.5, sost.pitch)); sost.dist = Math.min(5, Math.max(1.4, sost.dist));
      vrashchaetsya && clearTimeout(vrashchaetsya);
      vrashchaetsya = setTimeout(() => { vrashchaetsya = 0; pereris(); }, 250);
      pereris();
    },
    zadat(s) { prervat(); Object.assign(sost, s); pereris(); },
    naTochku: null,
    // поток крови по путям (массив путей из точек модели); null — плавно погасить
    potok(puti) {
      if (puti) { potok = { puti, t0: performance.now(), gasnet: 0 }; }
      else if (potok) potok.gasnet = performance.now();
      if (!potokRaf) potokRaf = requestAnimationFrame(risovatPotok);
    },
    // [{ p: [x, y, z], tekst, ik (svg), storona: 'l'|'r', klass, zad (мс) }] — пустой список убирает
    markery(spisok) {
      markEl.textContent = '';
      markery = (spisok || []).map((m) => {
        const d = document.createElement('div');
        d.className = 'ch3d-mark ' + (m.storona === 'l' ? 'sleva ' : '') + (m.klass || '');
        d.innerHTML = '<span><i>' + (m.ik || '') + '</i><b></b></span>';
        d.querySelector('b').textContent = m.tekst || '';
        d.style.setProperty('--zad', (m.zad || 0) + 'ms');
        markEl.appendChild(d);
        return { el: d, p: m.p };
      });
      postavitMarkery();
    },
    // С пульта: vr — сдвиг пальца в долях площадки (вся ширина ≈ пол-оборота),
    // zum — во сколько раз раздвинули пальцы. Через 0,25 с без движения —
    // кадр снова в полном качестве.
    vrashchat(d) {
      if (Array.isArray(d.vr)) {
        const dx = Math.max(-1, Math.min(1, Number(d.vr[0]) || 0)), dy = Math.max(-1, Math.min(1, Number(d.vr[1]) || 0));
        sost.yaw -= dx * Math.PI;
        sost.pitch = Math.min(1.3, Math.max(-0.5, sost.pitch + dy * 1.6));
      }
      if (d.zum) sost.dist = Math.min(5, Math.max(1.4, sost.dist / Math.max(0.5, Math.min(2, Number(d.zum) || 1))));
      clearTimeout(vrashchaetsya);
      vrashchaetsya = setTimeout(() => { vrashchaetsya = 0; pereris(); }, 250);
      pereris();
    },
    set naIzmenenie(f) { slushatel = f; },
    mestnaya,
  };
  return api;
})();
