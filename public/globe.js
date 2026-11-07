// TraceProof planetary renderer.
// WebGL point-cloud globe (GPU) with a lightweight Canvas 2D fallback.
// The overlay canvas draws the city beacon, hub arcs and moving packets.

const TAU = Math.PI * 2;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a));
const toRad = d => d * Math.PI / 180;

// x = cos(lat)·sin(lon), y = sin(lat), z = cos(lat)·cos(lon). lon 0 faces the viewer at yaw 0.
export const toVec = (lat, lon) => { const a = toRad(lat), b = toRad(lon), c = Math.cos(a); return [c * Math.sin(b), Math.sin(a), c * Math.cos(b)]; };

function rotation(yaw, pitch) {
  const c = Math.cos(yaw), s = Math.sin(yaw), ca = Math.cos(pitch), sa = Math.sin(pitch);
  // Row-major R = Rx(pitch) · Ry(yaw)
  return [c, 0, s, sa * s, ca, -sa * c, -ca * s, sa, ca * c];
}
const apply = (m, v) => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];

function buildGeometry(landPoints) {
  const landCount = landPoints.length / 2;
  const oceanCount = 7000;
  const grid = [];
  for (let lon = -180; lon < 180; lon += 20) for (let lat = -88; lat <= 88; lat += 1.1) grid.push(lat, lon);
  for (let lat = -60; lat <= 60; lat += 30) for (let lon = -180; lon < 180; lon += 0.9) grid.push(lat, lon);
  const gridCount = grid.length / 2;
  const total = landCount + oceanCount + gridCount;
  const pos = new Float32Array(total * 3), meta = new Float32Array(total * 2);
  let k = 0;
  const push = (v, shimmer, kind) => { pos[k * 3] = v[0]; pos[k * 3 + 1] = v[1]; pos[k * 3 + 2] = v[2]; meta[k * 2] = shimmer; meta[k * 2 + 1] = kind; k++; };
  for (let i = 0; i < landPoints.length; i += 2) push(toVec(landPoints[i + 1] / 100, landPoints[i] / 100), (Math.sin(i * 91.73) + 1) / 2, 1);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < oceanCount; i++) { const y = 1 - (i / (oceanCount - 1)) * 2, r = Math.sqrt(1 - y * y), a = golden * i; push([Math.cos(a) * r, y, Math.sin(a) * r], (Math.sin(i * 37.7) + 1) / 2, 0); }
  for (let i = 0; i < grid.length; i += 2) push(toVec(grid[i], grid[i + 1]), 0.5, 2);
  return { pos, meta, total, landCount };
}

const VERT = `
attribute vec3 aPos; attribute vec2 aMeta;
uniform mat3 uRot; uniform vec2 uRes; uniform vec2 uCenter; uniform float uRadius; uniform float uDpr;
uniform vec3 uCity; uniform float uTime; uniform float uScan; uniform float uBoot;
varying vec4 vColor;
void main(){
  vec3 p = uRot * aPos;
  float kind = aMeta.y; float sh = aMeta.x;
  float front = smoothstep(-0.2, 0.35, p.z);
  vec2 s = uCenter + vec2(p.x, -p.y) * uRadius * (0.86 + 0.14 * uBoot);
  gl_Position = vec4(s.x / uRes.x * 2.0 - 1.0, 1.0 - s.y / uRes.y * 2.0, 0.0, 1.0);
  float d = acos(clamp(dot(aPos, uCity), -1.0, 1.0));
  float core = exp(-d * d * 900.0);
  float halo = exp(-d * d * 60.0);
  float scan = exp(-pow((p.y - uScan) * 16.0, 2.0)) * step(0.0, p.z);
  vec3 col; float a; float size;
  if (kind > 1.5) {            // graticule
    col = vec3(0.30, 0.42, 1.0); a = 0.20 * front; size = 1.0;
  } else if (kind > 0.5) {     // land
    vec3 base = mix(vec3(0.18, 1.0, 0.82), vec3(0.24, 0.66, 1.0), sh);
    base = mix(base, vec3(0.92, 1.0, 1.0), step(0.93, sh) * 0.85);
    vec3 warm = mix(vec3(1.0, 0.24, 0.62), vec3(1.0, 0.86, 0.45), core);
    col = mix(base, warm, clamp(halo * 1.15, 0.0, 1.0));
    col += vec3(0.55, 1.0, 0.9) * scan * 0.55;
    a = mix(0.05, 1.0, front) * (0.72 + 0.28 * sin(uTime * 1.7 + sh * 40.0) * step(0.86, sh) + 0.28);
    a = min(a + halo * 0.6 * front, 1.0);
    size = (1.25 + 0.95 * front + halo * 2.4 + core * 2.0);
  } else {                     // ocean lattice
    col = mix(vec3(0.42, 0.30, 1.0), vec3(0.15, 0.55, 1.0), sh);
    a = 0.22 * front * front; size = 0.95 + front * 0.6;
    col += vec3(0.4, 0.9, 1.0) * scan * 0.4;
  }
  a *= uBoot;
  gl_PointSize = size * uDpr;
  vColor = vec4(col * a, a);
}`;
const FRAG = `
precision mediump float; varying vec4 vColor;
void main(){ vec2 c = gl_PointCoord - 0.5; float r = length(c); if (r > 0.5) discard; float f = smoothstep(0.5, 0.08, r); gl_FragColor = vColor * f; }`;
const ATMO_VERT = `attribute vec2 aQuad; void main(){ gl_Position = vec4(aQuad, 0.0, 1.0); }`;
const ATMO_FRAG = `
precision mediump float;
uniform vec2 uCenterPx; uniform float uRadiusPx; uniform float uTime; uniform float uBoot;
void main(){
  float r = distance(gl_FragCoord.xy, uCenterPx) / uRadiusPx;
  vec3 cyan = vec3(0.20, 1.0, 0.82); vec3 violet = vec3(0.55, 0.35, 1.0); vec3 pink = vec3(1.0, 0.24, 0.62);
  float ang = atan(gl_FragCoord.y - uCenterPx.y, gl_FragCoord.x - uCenterPx.x);
  vec3 tint = mix(cyan, violet, 0.5 + 0.5 * sin(ang + uTime * 0.25));
  float inner = smoothstep(0.6, 1.0, r) * step(r, 1.0);
  float rim = exp(-pow((r - 1.0) * 70.0, 2.0));
  float outer = step(1.0, r) * exp(-(r - 1.0) * 6.5);
  float ring = exp(-pow((r - 1.11) * 260.0, 2.0)) * (0.5 + 0.5 * step(0.0, sin(ang * 36.0 + uTime * 0.6)));
  vec3 col = tint * (inner * inner * 0.45 + rim * 0.75 + outer * 0.42) + pink * ring * 0.22;
  float a = clamp((inner * inner * 0.45 + rim * 0.75 + outer * 0.42 + ring * 0.22) * uBoot, 0.0, 1.0);
  gl_FragColor = vec4(col * uBoot, a);
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
  return s;
}
function program(gl, vs, fs) {
  const p = gl.createProgram(); gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs)); gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'link');
  return p;
}

function createWebGLRenderer(canvas, geometry) {
  const gl = canvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: true, powerPreference: 'high-performance' });
  if (!gl) return null;
  const points = program(gl, VERT, FRAG), atmo = program(gl, ATMO_VERT, ATMO_FRAG);
  const posBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, posBuf); gl.bufferData(gl.ARRAY_BUFFER, geometry.pos, gl.STATIC_DRAW);
  const metaBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, metaBuf); gl.bufferData(gl.ARRAY_BUFFER, geometry.meta, gl.STATIC_DRAW);
  const quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const U = (p, n) => gl.getUniformLocation(p, n);
  const u = { rot: U(points, 'uRot'), res: U(points, 'uRes'), center: U(points, 'uCenter'), radius: U(points, 'uRadius'), dpr: U(points, 'uDpr'), city: U(points, 'uCity'), time: U(points, 'uTime'), scan: U(points, 'uScan'), boot: U(points, 'uBoot') };
  const ua = { center: U(atmo, 'uCenterPx'), radius: U(atmo, 'uRadiusPx'), time: U(atmo, 'uTime'), boot: U(atmo, 'uBoot') };
  const aPos = gl.getAttribLocation(points, 'aPos'), aMeta = gl.getAttribLocation(points, 'aMeta'), aQuad = gl.getAttribLocation(atmo, 'aQuad');
  gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND);
  return {
    kind: 'webgl',
    draw(f) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(atmo);
      gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.enableVertexAttribArray(aQuad); gl.vertexAttribPointer(aQuad, 2, gl.FLOAT, false, 0, 0);
      gl.uniform2f(ua.center, f.cx * f.dpr, canvas.height - f.cy * f.dpr); gl.uniform1f(ua.radius, f.radius * f.dpr * (0.86 + 0.14 * f.boot)); gl.uniform1f(ua.time, f.time); gl.uniform1f(ua.boot, f.boot);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.disableVertexAttribArray(aQuad);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.useProgram(points);
      gl.bindBuffer(gl.ARRAY_BUFFER, posBuf); gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, metaBuf); gl.enableVertexAttribArray(aMeta); gl.vertexAttribPointer(aMeta, 2, gl.FLOAT, false, 0, 0);
      const m = f.matrix; // column-major for GLSL
      gl.uniformMatrix3fv(u.rot, false, [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]);
      gl.uniform2f(u.res, f.width, f.height); gl.uniform2f(u.center, f.cx, f.cy); gl.uniform1f(u.radius, f.radius); gl.uniform1f(u.dpr, f.dpr);
      gl.uniform3fv(u.city, f.city); gl.uniform1f(u.time, f.time); gl.uniform1f(u.scan, f.scan); gl.uniform1f(u.boot, f.boot);
      gl.drawArrays(gl.POINTS, 0, geometry.total);
    }
  };
}

function createCanvasRenderer(canvas, geometry) {
  const ctx = canvas.getContext('2d');
  const colors = ['rgba(230,255,255,.9)', 'rgba(61,255,208,.85)', 'rgba(64,170,255,.7)'];
  return {
    kind: 'canvas2d',
    draw(f) {
      ctx.setTransform(f.dpr, 0, 0, f.dpr, 0, 0); ctx.clearRect(0, 0, f.width, f.height);
      const m = f.matrix, P = geometry.pos, M = geometry.meta, R = f.radius * (0.86 + 0.14 * f.boot);
      const buckets = [[], [], []];
      for (let i = 0; i < geometry.landCount; i += 3) {
        const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
        const rz = m[6] * x + m[7] * y + m[8] * z; if (rz < 0) continue;
        const rx = m[0] * x + m[1] * y + m[2] * z, ry = m[3] * x + m[4] * y + m[5] * z, sh = M[i * 2];
        buckets[sh > .9 ? 0 : sh > .45 ? 1 : 2].push(f.cx + rx * R, f.cy - ry * R, 1 + rz * 1.2);
      }
      ctx.globalAlpha = f.boot;
      buckets.forEach((b, j) => { ctx.fillStyle = colors[j]; ctx.beginPath(); for (let i = 0; i < b.length; i += 3) ctx.rect(b[i], b[i + 1], b[i + 2], b[i + 2]); ctx.fill(); });
      ctx.globalAlpha = 1; ctx.strokeStyle = 'rgba(61,255,208,.45)'; ctx.beginPath(); ctx.arc(f.cx, f.cy, R + 1, 0, TAU); ctx.stroke();
    }
  };
}

export function createGlobe({ stage, canvas, overlay, label, landPoints, hubs = [], onFrameInfo = () => {} }) {
  const geometry = buildGeometry(landPoints);
  let renderer = null;
  try { renderer = createWebGLRenderer(canvas, geometry); } catch (error) { console.warn('WebGL globe unavailable, using 2D fallback', error); renderer = null; }
  if (!renderer) renderer = createCanvasRenderer(canvas, geometry);
  const fx = overlay.getContext('2d');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  const view = { yaw: 0, pitch: 0.18, targetYaw: 0, targetPitch: 0.18, vYaw: 0, vPitch: 0, dragging: false, focusing: false, lastInteraction: -1e9 };
  const pulses = [];
  let city = { name: 'Bogotá', country: 'Colombia', lat: 4.711, lon: -74.0721 }, cityVec = toVec(city.lat, city.lon);
  let visible = false, running = false, last = performance.now(), start = last, time = 0, lastInfo = 0;
  let size = { width: 0, height: 0, dpr: 1 };

  function resize() {
    const rect = stage.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (rect.width === size.width && rect.height === size.height && dpr === size.dpr) return;
    size = { width: rect.width, height: rect.height, dpr };
    for (const c of [canvas, overlay]) { c.width = Math.max(1, Math.round(rect.width * dpr)); c.height = Math.max(1, Math.round(rect.height * dpr)); }
  }
  const metrics = () => ({ cx: size.width / 2, cy: size.height / 2, radius: Math.min(size.width, size.height) * 0.4 });

  function focus(lat, lon, { immediate = false } = {}) {
    view.targetYaw = view.yaw + wrapAngle(-toRad(lon) - view.yaw);
    view.targetPitch = clamp(toRad(lat) * 0.85, -1.1, 1.1);
    view.focusing = true; view.vYaw = 0; view.vPitch = 0; view.lastInteraction = performance.now();
    if (immediate) { view.yaw = view.targetYaw; view.pitch = view.targetPitch; }
  }
  function setCity(next, options = {}) { city = { ...next }; cityVec = toVec(city.lat, city.lon); focus(city.lat, city.lon, options); }

  function project(v, m, mt) { const r = apply(m, v); return { x: mt.cx + r[0] * mt.radius, y: mt.cy - r[1] * mt.radius, z: r[2] }; }
  function slerp(a, b, t) {
    const d = Math.acos(clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1)); if (d < 1e-4) return a;
    const s = Math.sin(d), wa = Math.sin((1 - t) * d) / s, wb = Math.sin(t * d) / s;
    return [a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb, a[2] * wa + b[2] * wb];
  }

  function drawOverlay(m, mt, boot) {
    const { dpr, width, height } = size;
    fx.setTransform(dpr, 0, 0, dpr, 0, 0); fx.clearRect(0, 0, width, height);
    if (boot < 0.4) { label.classList.remove('visible'); return; }
    const R = mt.radius;
    const visibleAt = p => p.z > 0 || Math.hypot(p.x - mt.cx, p.y - mt.cy) > R * 1.005;
    fx.lineCap = 'round';
    hubs.forEach((hub, index) => {
      const hv = toVec(hub.lat, hub.lon);
      const dist = Math.acos(clamp(hv[0] * cityVec[0] + hv[1] * cityVec[1] + hv[2] * cityVec[2], -1, 1));
      const hp = project(hv, m, mt);
      if (hp.z > 0) {
        fx.fillStyle = 'rgba(160,140,255,.95)'; fx.fillRect(hp.x - 3, hp.y - 3, 6, 6);
        fx.strokeStyle = 'rgba(160,140,255,.55)'; fx.strokeRect(hp.x - 7, hp.y - 7, 14, 14);
        fx.font = '600 10px ui-monospace, SFMono-Regular, Menlo, monospace'; fx.fillStyle = 'rgba(214,206,255,.95)'; fx.fillText(hub.code, hp.x + 11, hp.y + 4);
      }
      if (dist < 0.03) return;
      const lift = 0.08 + dist * 0.16, steps = 56, pts = [];
      for (let i = 0; i <= steps; i++) { const t = i / steps, v = slerp(cityVec, hv, t), h = 1 + Math.sin(Math.PI * t) * lift; pts.push(project([v[0] * h, v[1] * h, v[2] * h], m, mt)); }
      fx.lineWidth = 1.3;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i]; if (!visibleAt(a) || !visibleAt(b)) continue;
        fx.strokeStyle = `rgba(${Math.round(255 - i * 2.4)},${Math.round(70 + i * 2.6)},${Math.round(170 + i)},${0.18 + 0.5 * Math.sin(Math.PI * i / steps)})`;
        fx.beginPath(); fx.moveTo(a.x, a.y); fx.lineTo(b.x, b.y); fx.stroke();
      }
      const t = ((time * 0.32 + index * 0.37) % 1), pi = Math.floor(t * steps), pk = pts[pi];
      if (pk && visibleAt(pk)) {
        fx.fillStyle = '#fff'; fx.shadowColor = '#ff3d9a'; fx.shadowBlur = 14; fx.beginPath(); fx.arc(pk.x, pk.y, 2.4, 0, TAU); fx.fill(); fx.shadowBlur = 0;
      }
    });
    const cp = project(cityVec, m, mt);
    if (cp.z > 0.02) {
      const pulse = (time * 0.8) % 1;
      fx.strokeStyle = `rgba(255,61,154,${0.8 * (1 - pulse)})`; fx.lineWidth = 1.5; fx.beginPath(); fx.arc(cp.x, cp.y, 6 + pulse * 26, 0, TAU); fx.stroke();
      fx.strokeStyle = 'rgba(255,214,120,.9)'; fx.lineWidth = 1; fx.beginPath(); fx.arc(cp.x, cp.y, 9, 0, TAU); fx.stroke();
      fx.fillStyle = '#fff6d8'; fx.shadowColor = '#ffb347'; fx.shadowBlur = 22; fx.beginPath(); fx.arc(cp.x, cp.y, 4, 0, TAU); fx.fill(); fx.shadowBlur = 0;
      // crosshair ticks
      fx.strokeStyle = 'rgba(255,214,120,.75)'; fx.beginPath();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { fx.moveTo(cp.x + dx * 13, cp.y + dy * 13); fx.lineTo(cp.x + dx * 18, cp.y + dy * 18); }
      fx.stroke();
      const flip = cp.x < width * 0.42;
      label.classList.toggle('flip', flip);
      label.style.transform = `translate3d(${Math.round(cp.x)}px, ${Math.round(cp.y)}px, 0)`;
      label.classList.add('visible');
    } else label.classList.remove('visible');
    // run pulses: shockwave at the city + bright packets along every hub arc
    for (let i = pulses.length - 1; i >= 0; i--) {
      const p = pulses[i], age = time - p.t0; if (age > 2.4) { pulses.splice(i, 1); continue; }
      const rgb = p.status === 'failed' ? '255,77,125' : '77,255,166';
      if (cp.z > 0.02) for (let k = 0; k < 3; k++) {
        const a = age - k * 0.22; if (a < 0 || a > 1.6) continue;
        fx.strokeStyle = `rgba(${rgb},${0.9 * (1 - a / 1.6)})`; fx.lineWidth = 2; fx.beginPath(); fx.arc(cp.x, cp.y, 8 + a * 70, 0, TAU); fx.stroke();
      }
      hubs.forEach(hub => {
        const hv = toVec(hub.lat, hub.lon), dist = Math.acos(clamp(hv[0] * cityVec[0] + hv[1] * cityVec[1] + hv[2] * cityVec[2], -1, 1)); if (dist < 0.03) return;
        const t = clamp(age / 1.4, 0, 1), lift = 0.08 + dist * 0.16, v = slerp(cityVec, hv, t), h = 1 + Math.sin(Math.PI * t) * lift, pt = project([v[0] * h, v[1] * h, v[2] * h], m, mt);
        if (t >= 1 || !visibleAt(pt)) return;
        fx.fillStyle = `rgb(${rgb})`; fx.shadowColor = `rgb(${rgb})`; fx.shadowBlur = 18; fx.beginPath(); fx.arc(pt.x, pt.y, 3.6, 0, TAU); fx.fill(); fx.shadowBlur = 0;
      });
    }
  }

  function frame(now) {
    if (!visible || document.hidden) { running = false; return; }
    const dt = Math.min((now - last) / 1000, 0.05); last = now; time += dt;
    resize();
    const idle = now - view.lastInteraction > 2600;
    if (view.dragging) { /* direct manipulation */ }
    else if (view.focusing) {
      const k = 1 - Math.pow(0.0015, dt);
      view.yaw += (view.targetYaw - view.yaw) * k; view.pitch += (view.targetPitch - view.pitch) * k;
      if (Math.abs(view.targetYaw - view.yaw) < 0.002 && Math.abs(view.targetPitch - view.pitch) < 0.002) view.focusing = false;
    } else {
      view.yaw += view.vYaw; view.pitch = clamp(view.pitch + view.vPitch, -1.25, 1.25);
      const decay = Math.pow(0.02, dt); view.vYaw *= decay; view.vPitch *= decay;
      if (idle && !reduced.matches) view.yaw += dt * 0.09;
    }
    const boot = reduced.matches ? 1 : clamp((now - start) / 1400, 0, 1), eased = 1 - Math.pow(1 - boot, 3);
    const m = rotation(view.yaw, view.pitch);
    const mt = metrics();
    renderer.draw({ ...mt, width: size.width, height: size.height, dpr: size.dpr, matrix: m, city: cityVec, time, scan: Math.sin(time * 0.45) * 1.05, boot: eased });
    drawOverlay(m, mt, eased);
    if (now - lastInfo > 120) {
      lastInfo = now;
      const lon = -wrapAngle(view.yaw) * 180 / Math.PI, lat = view.pitch / 0.85 * 180 / Math.PI;
      onFrameInfo({ lon, lat, renderer: renderer.kind });
    }
    requestAnimationFrame(frame);
  }
  function startLoop() { if (!running && visible && !document.hidden) { running = true; last = performance.now(); requestAnimationFrame(frame); } }

  // ---- interaction --------------------------------------------------------
  let pointer = null;
  const insideGlobe = event => { const r = stage.getBoundingClientRect(), mt = metrics(); return Math.hypot(event.clientX - r.left - mt.cx, event.clientY - r.top - mt.cy) <= mt.radius * 1.08; };
  stage.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.target.closest('button') || !insideGlobe(event)) return;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, t: performance.now(), captured: false, type: event.pointerType };
    view.focusing = false; view.vYaw = 0; view.vPitch = 0; view.lastInteraction = performance.now();
  });
  stage.addEventListener('pointermove', event => {
    if (!pointer) { stage.classList.toggle('can-drag', event.pointerType === 'mouse' && insideGlobe(event)); return; }
    if (event.pointerId !== pointer.id) return;
    if (event.pointerType === 'mouse' && event.buttons === 0) { release(event); return; }
    const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y, now = performance.now();
    if (!pointer.captured) {
      const totalX = Math.abs(event.clientX - pointer.startX), totalY = Math.abs(event.clientY - pointer.startY);
      // Mouse/pen: free rotation in every direction (dragging never scrolls the page anyway).
      // Touch: a gesture that starts vertically is handed back to the browser so the page keeps scrolling.
      if (pointer.type === 'touch' && totalY > totalX && totalY > 6) { pointer = null; return; }
      if (Math.max(totalX, totalY) < 4) return;
      pointer.captured = true; view.dragging = true; stage.classList.add('is-dragging');
      try { stage.setPointerCapture(event.pointerId); } catch { /* pointer already gone */ }
    }
    const R = metrics().radius, yawStep = dx / R * 0.9, pitchStep = dy / R * 0.9;
    view.yaw += yawStep; view.pitch = clamp(view.pitch + pitchStep, -1.25, 1.25);
    const frames = Math.max(now - pointer.t, 1) / 16.7;
    view.vYaw = yawStep / frames; view.vPitch = pitchStep / frames;
    pointer.x = event.clientX; pointer.y = event.clientY; pointer.t = now; view.lastInteraction = now;
  });
  const release = event => {
    if (!pointer || (event && event.pointerId !== undefined && event.pointerId !== pointer.id)) return;
    const wasCaptured = pointer.captured; const id = pointer.id; pointer = null;
    view.dragging = false; view.lastInteraction = performance.now(); stage.classList.remove('is-dragging');
    if (wasCaptured) { try { stage.releasePointerCapture(id); } catch { /* not captured */ } }
    view.vYaw = clamp(view.vYaw, -0.06, 0.06); view.vPitch = clamp(view.vPitch, -0.04, 0.04);
    if (!wasCaptured) { view.vYaw = 0; view.vPitch = 0; }
  };
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) stage.addEventListener(type, release);
  window.addEventListener('blur', () => release());
  stage.addEventListener('pointerleave', event => { if (!pointer?.captured) release(event); stage.classList.remove('can-drag'); });
  stage.addEventListener('dblclick', event => { if (!event.target.closest('button')) focus(city.lat, city.lon); });
  stage.addEventListener('keydown', event => {
    const step = event.shiftKey ? 0.35 : 0.12;
    const keys = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (keys[event.key]) { event.preventDefault(); view.focusing = false; view.yaw += keys[event.key][0]; view.pitch = clamp(view.pitch + keys[event.key][1], -1.25, 1.25); view.lastInteraction = performance.now(); }
    if ((event.key === 'Enter' || event.key === ' ') && event.target === stage) { event.preventDefault(); focus(city.lat, city.lon); }
  });

  new IntersectionObserver(entries => { visible = entries.some(e => e.isIntersecting); startLoop(); }, { threshold: 0.01 }).observe(stage);
  document.addEventListener('visibilitychange', startLoop);
  window.addEventListener('resize', () => { resize(); });
  resize();
  setCity(city, { immediate: true });

  return { setCity, focus: () => focus(city.lat, city.lon), pulse: status => { pulses.push({ status, t0: time }); startLoop(); }, get renderer() { return renderer.kind; } };
}
