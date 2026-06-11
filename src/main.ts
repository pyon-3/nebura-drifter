import * as THREE from "three";
import "./style.css";

const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.5;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05091a);
scene.fog = new THREE.FogExp2(0x05091a, 0.0016);
const camera = new THREE.PerspectiveCamera(69, innerWidth / innerHeight, 0.1, 1600);
const clock = new THREE.Clock();
const up = new THREE.Vector3(0, 1, 0);

scene.add(new THREE.HemisphereLight(0x4b69a8, 0x030308, 0.72));
const moon = new THREE.DirectionalLight(0x8eeaff, 1.15);
moon.position.set(-12, 18, -8);
scene.add(moon);

function addWireEnvironment() {
  const city = new THREE.Group();
  const cyan = new THREE.LineBasicMaterial({ color: 0x2cc9e8, transparent: true, opacity: 0.22 });
  const violet = new THREE.LineBasicMaterial({ color: 0x9354ff, transparent: true, opacity: 0.16 });
  for (let i = 0; i < 72; i++) {
    const angle = (i / 72) * Math.PI * 2;
    const radius = 580 + Math.sin(i * 2.17) * 90;
    const height = 18 + (i * 37 % 70);
    const width = 12 + (i * 19 % 28);
    const building = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(width, height, width * 0.7)),
      i % 4 === 0 ? violet : cyan,
    );
    building.position.set(Math.cos(angle) * radius, height * 0.5 - 1, Math.sin(angle) * radius);
    building.rotation.y = -angle;
    city.add(building);
  }
  const mountainPoints: THREE.Vector3[] = [];
  for (let i = 0; i <= 96; i++) {
    const angle = (i / 96) * Math.PI * 2;
    const radius = 720 + Math.sin(i * 1.9) * 55;
    mountainPoints.push(new THREE.Vector3(Math.cos(angle) * radius, 30 + Math.sin(i * 2.7) * 28, Math.sin(angle) * radius));
  }
  city.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(mountainPoints), violet));
  scene.add(city);

  for (let i = 0; i < 32; i++) {
    const f = trackFrame(i / 32);
    const gate = new THREE.Group();
    const material = new THREE.LineBasicMaterial({ color: i % 3 === 0 ? 0xff3370 : 0x35dff4, transparent: true, opacity: 0.28 });
    for (const side of [-1, 1]) {
      const pillar = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.16, 5.5, 0.16)), material);
      pillar.position.copy(f.point).addScaledVector(f.right, side * 8.5).setY(2.75);
      gate.add(pillar);
    }
    const top = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(17, 0.14, 0.14)), material);
    top.position.copy(f.point).setY(5.45);
    top.rotation.y = Math.atan2(f.right.x, f.right.z);
    gate.add(top);
    scene.add(gate);
  }
}

const trackPoints = [
    new THREE.Vector3(-66, 0, -28), new THREE.Vector3(66, 0, -28),
    new THREE.Vector3(79, 0, -24), new THREE.Vector3(86, 0, -13),
    new THREE.Vector3(88, 0, 0), new THREE.Vector3(86, 0, 13),
    new THREE.Vector3(79, 0, 24), new THREE.Vector3(66, 0, 28),
    new THREE.Vector3(-66, 0, 28), new THREE.Vector3(-79, 0, 24),
    new THREE.Vector3(-86, 0, 13), new THREE.Vector3(-88, 0, 0),
    new THREE.Vector3(-86, 0, -13), new THREE.Vector3(-79, 0, -24),
];
const baseOval = new THREE.CatmullRomCurve3(trackPoints, true, "catmullrom", 0.18);
const COURSE_SCALE = 2000 / (baseOval.getLength() * 1.3);
const oval = new THREE.CatmullRomCurve3(
  trackPoints.map(point => point.clone().multiplyScalar(COURSE_SCALE)),
  true,
  "catmullrom",
  0.18,
);
const TRACK_WIDTH = 11;
const SEGMENTS = 280;
const TRACK_LENGTH_METERS = oval.getLength() * 1.3;
const MAX_SPEED = 288 / (TRACK_LENGTH_METERS * 3.6);

function trackFrame(u: number, lane = 0) {
  const wrapped = ((u % 1) + 1) % 1;
  const point = oval.getPointAt(wrapped);
  const tangent = oval.getTangentAt(wrapped).normalize();
  const right = new THREE.Vector3().crossVectors(up, tangent).normalize();
  return { point: point.addScaledVector(right, lane), tangent, right };
}

function makeRoad() {
  const vertices: number[] = [];
  const colors: number[] = [];
  const edgeL: THREE.Vector3[] = [];
  const edgeR: THREE.Vector3[] = [];
  for (let i = 0; i <= SEGMENTS; i++) {
    const f = trackFrame(i / SEGMENTS);
    for (const side of [-1, 1]) {
      const p = f.point.clone().addScaledVector(f.right, side * TRACK_WIDTH * 0.5);
      vertices.push(p.x, 0, p.z);
      const stripe = i % 12 < 6 ? 0.052 : 0.038;
      colors.push(stripe, stripe * 1.08, stripe * 1.5);
      (side < 0 ? edgeL : edgeR).push(p.clone().setY(0.035));
    }
  }
  const indices: number[] = [];
  for (let i = 0; i < SEGMENTS; i++) indices.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  scene.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.98, metalness: 0.05 })));

  const edgeMat = new THREE.LineBasicMaterial({ color: 0x31dcf4, transparent: true, opacity: 0.72 });
  scene.add(new THREE.Line(edgeL.length ? new THREE.BufferGeometry().setFromPoints(edgeL) : new THREE.BufferGeometry(), edgeMat));
  scene.add(new THREE.Line(edgeR.length ? new THREE.BufferGeometry().setFromPoints(edgeR) : new THREE.BufferGeometry(), edgeMat));

  for (let i = 0; i < 132; i++) {
    const f = trackFrame(i / 132);
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.025, 0.7, 4),
        new THREE.MeshBasicMaterial({ color: i % 2 ? 0x18a9bd : 0xd21d6c }),
      );
      post.position.copy(f.point).addScaledVector(f.right, side * 6.25).setY(0.35);
      scene.add(post);
    }
  }
}
makeRoad();
addWireEnvironment();

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(3000, 3000),
  new THREE.MeshBasicMaterial({ color: 0x010207 }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.035;
scene.add(floor);
const grid = new THREE.GridHelper(2200, 110, 0x31dff4, 0x174b69);
grid.position.y = 0.005;
const gridMaterials = (Array.isArray(grid.material) ? grid.material : [grid.material]) as THREE.LineBasicMaterial[];
gridMaterials.forEach(material => {
  material.transparent = true;
  material.opacity = 0.16;
  material.depthWrite = false;
});
scene.add(grid);

const starGeo = new THREE.BufferGeometry();
const starPos: number[] = [];
for (let i = 0; i < 260; i++) {
  const a = Math.random() * Math.PI * 2;
  const r = 650 + Math.random() * 700;
  starPos.push(Math.cos(a) * r, 8 + Math.random() * 42, Math.sin(a) * r);
}
starGeo.setAttribute("position", new THREE.Float32BufferAttribute(starPos, 3));
scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0x9ac7ff, size: 1.15, transparent: true, opacity: 0.55 })));

function makeCar(bodyColor: number, rival = false) {
  const car = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.48, metalness: 0.55, flatShading: true });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x102b46, roughness: 0.25, metalness: 0.65, flatShading: true });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.42, 3.5), bodyMat);
  body.position.y = 0.45;
  car.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.48, 1.55), glassMat);
  cabin.position.set(0, 0.82, -0.15);
  cabin.scale.set(0.86, 1, 1);
  car.add(cabin);
  const bumper = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.15, 0.18), new THREE.MeshBasicMaterial({ color: 0x142738 }));
  bumper.position.set(0, 0.32, -1.73);
  car.add(bumper);
  for (const x of [-0.57, 0.57]) {
    const tailHousing = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.19, 0.12),
      new THREE.MeshBasicMaterial({ color: 0x5a0714 }),
    );
    tailHousing.position.set(x, 0.56, -1.78);
    car.add(tailHousing);
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(0.78, 0.32),
      new THREE.MeshBasicMaterial({ color: 0xff2448, blending: THREE.AdditiveBlending, transparent: true, opacity: rival ? 0.64 : 0.48, depthWrite: false, side: THREE.DoubleSide }),
    );
    glow.position.set(x, 0.56, -1.847);
    car.add(glow);
    const lamp = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.12, 0.08),
      new THREE.MeshBasicMaterial({ color: rival ? 0xff7180 : 0xff455c }),
    );
    lamp.position.set(x, 0.56, -1.86);
    car.add(lamp);

    const headlamp = new THREE.Mesh(
      new THREE.BoxGeometry(0.38, 0.11, 0.07),
      new THREE.MeshBasicMaterial({ color: 0xbffaff }),
    );
    headlamp.position.set(x, 0.5, 1.79);
    car.add(headlamp);

    const beamGeometry = new THREE.BufferGeometry();
    beamGeometry.setAttribute("position", new THREE.Float32BufferAttribute([
      x - 0.2, 0.035, 1.75,
      x + 0.2, 0.035, 1.75,
      x + 2.2, 0.035, 13,
      x - 2.2, 0.035, 13,
    ], 3));
    beamGeometry.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    beamGeometry.setIndex([0, 1, 2, 0, 2, 3]);
    const beam = new THREE.Mesh(
      beamGeometry,
      new THREE.ShaderMaterial({
        uniforms: {
          tint: { value: new THREE.Color(0x8eefff) },
          strength: { value: rival ? 0.16 : 0.24 },
        },
        vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
        fragmentShader: `uniform vec3 tint;uniform float strength;varying vec2 vUv;void main(){float edge=smoothstep(0.0,.34,vUv.x)*smoothstep(0.0,.34,1.0-vUv.x);float fade=pow(1.0-vUv.y,1.8)*smoothstep(0.0,.08,vUv.y);gl_FragColor=vec4(tint,edge*fade*strength);}`,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    car.add(beam);
  }
  return car;
}

const playerCar = makeCar(0x0a5164);
scene.add(playerCar);
type Rival = { car: THREE.Group; progress: number; lane: number; speed: number; phase: number };
const rivalColors = [0x171424, 0x42203e, 0x112c4a, 0x3f1623, 0x153d39, 0x422b12, 0x292044];
const rivals: Rival[] = rivalColors.map((color, i) => {
  const car = makeCar(color, true);
  scene.add(car);
  return {
    car,
    progress: 0.045 - i * 0.014,
    lane: (i % 2 ? 1 : -1) * (0.65 + (i % 3) * 0.65),
    speed: 0.032 + (i % 4) * 0.0018,
    phase: i * 1.7,
  };
});

type TrailSample = { left: THREE.Vector3; right: THREE.Vector3; tangent: THREE.Vector3; born: number };
const samples: TrailSample[] = [];
const playerSamples: TrailSample[] = [];
const TRAIL_LIFE = 1.38;
const PLAYER_TRAIL_LIFE = 0.46;
const trailMaterial = new THREE.ShaderMaterial({
  uniforms: { tint: { value: new THREE.Color(0xff193c) } },
  vertexShader: `attribute float aAlpha; varying float vAlpha; void main(){vAlpha=aAlpha;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
  fragmentShader: `uniform vec3 tint; varying float vAlpha; void main(){float soft=sin(vAlpha*1.5708);gl_FragColor=vec4(tint,soft*vAlpha);}`,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
});
const bleedMaterial = trailMaterial.clone();
bleedMaterial.uniforms.tint.value = new THREE.Color(0xb80b24);
const playerTrailMaterial = trailMaterial.clone();
playerTrailMaterial.uniforms.tint.value = new THREE.Color(0xff2445);
const playerBleedMaterial = trailMaterial.clone();
playerBleedMaterial.uniforms.tint.value = new THREE.Color(0x9d0b20);

function makeTrailMesh(material: THREE.Material) {
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
  mesh.frustumCulled = false;
  scene.add(mesh);
  return mesh;
}
const mainLeft = makeTrailMesh(trailMaterial);
const mainRight = makeTrailMesh(trailMaterial);
const bleedLeft = makeTrailMesh(bleedMaterial);
const bleedRight = makeTrailMesh(bleedMaterial);
const playerMainLeft = makeTrailMesh(playerTrailMaterial);
const playerMainRight = makeTrailMesh(playerTrailMaterial);
const playerBleedLeft = makeTrailMesh(playerBleedMaterial);
const playerBleedRight = makeTrailMesh(playerBleedMaterial);

function updateRibbon(
  mesh: THREE.Mesh,
  source: TrailSample[],
  side: "left" | "right",
  width: number,
  now: number,
  life: number,
  strength = 1,
  bleed = false,
) {
  const positions: number[] = [];
  const alphas: number[] = [];
  const indices: number[] = [];
  const usable = source.filter(s => now - s.born < life);
  for (let i = 0; i < usable.length; i++) {
    const s = usable[i];
    const age = Math.min(1, (now - s.born) / life);
    const fadePower = bleed ? 3.2 : 2.65;
    const alpha = Math.pow(1 - age, fadePower) * (bleed ? 0.18 : 0.72) * strength;
    const center = s[side].clone();
    if (bleed) center.y = 0.025;
    const across = new THREE.Vector3().crossVectors(up, s.tangent).normalize().multiplyScalar(width * 0.5);
    positions.push(center.x - across.x, center.y, center.z - across.z, center.x + across.x, center.y, center.z + across.z);
    alphas.push(alpha, alpha);
    if (i > 0) {
      const n = i * 2;
      indices.push(n - 2, n - 1, n, n - 1, n + 1, n);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aAlpha", new THREE.Float32BufferAttribute(alphas, 1));
  geometry.setIndex(indices);
  mesh.geometry.dispose();
  mesh.geometry = geometry;
}

let armed = false;
let running = false;
let countdownEnd = 0;
let lastCountdownValue = "";
let currentLap = 1;
let finalLapUntil = 0;
let replaying = false;
let replayStart = 0;
let replayCursor = 0;
let finishHandled = false;
let steer = 0;
let pointer = false;
let playerProgress = 0;
let playerSpeed = 0;
let lane = 0;
let lateralVelocity = 0;
let score = 0;
let lastEmit = 0;
let lastPlayerEmit = 0;
let lastReplayCapture = 0;
type ReplayFrame = { time: number; progress: number; lane: number; lateralVelocity: number };
const replayFrames: ReplayFrame[] = [];
const title = document.querySelector("#title")!;
const speedEl = document.querySelector("#speed")!;
const speedBarEl = document.querySelector<HTMLElement>("#speedBar")!;
const scoreEl = document.querySelector("#score")!;
const positionEl = document.querySelector("#position")!;
const lapEl = document.querySelector("#lap")!;
const statusEl = document.querySelector<HTMLElement>("#status")!;
const announcementEl = document.querySelector<HTMLElement>("#announcement")!;
const skipReplayEl = document.querySelector<HTMLButtonElement>("#skipReplay")!;
const gasEl = document.querySelector<HTMLButtonElement>("#gas")!;
const brakeEl = document.querySelector<HTMLButtonElement>("#brake")!;
const bgm = document.querySelector<HTMLAudioElement>("#bgm")!;
const finishBgm = document.querySelector<HTMLAudioElement>("#finishBgm")!;
let touchGas = false;
let touchBrake = false;
let audioContext: AudioContext | null = null;
let engineOsc: OscillatorNode | null = null;
let engineGain: GainNode | null = null;
let windSource: AudioBufferSourceNode | null = null;
let windGain: GainNode | null = null;
let tireSource: AudioBufferSourceNode | null = null;
let tireGain: GainNode | null = null;

const lapThemes = [
  { sky: 0x05091a, fog: 0x05091a, grid: 0x174b69, opacity: 0.1 },
  { sky: 0x070d20, fog: 0x071327, grid: 0x266b8c, opacity: 0.28 },
  { sky: 0x10091f, fog: 0x130b27, grid: 0x593b9c, opacity: 0.18 },
  { sky: 0x07170f, fog: 0x081c17, grid: 0x237b65, opacity: 0.34 },
  { sky: 0x190712, fog: 0x210811, grid: 0x9b274d, opacity: 0.42 },
];
function applyLapTheme(lap: number) {
  const theme = lapThemes[Math.min(lap - 1, lapThemes.length - 1)];
  scene.background = new THREE.Color(theme.sky);
  scene.fog = new THREE.FogExp2(theme.fog, 0.0016);
  gridMaterials.forEach(material => {
    material.color.setHex(theme.grid);
    material.opacity = theme.opacity;
  });
}
applyLapTheme(1);

function makeNoiseBuffer(context: AudioContext) {
  const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}
function startSfx() {
  if (audioContext) {
    void audioContext.resume();
    return;
  }
  audioContext = new AudioContext();
  const master = audioContext.createGain();
  master.gain.value = 0.24;
  master.connect(audioContext.destination);

  engineOsc = audioContext.createOscillator();
  engineOsc.type = "sawtooth";
  engineGain = audioContext.createGain();
  const engineFilter = audioContext.createBiquadFilter();
  engineFilter.type = "lowpass";
  engineFilter.frequency.value = 420;
  engineGain.gain.value = 0;
  engineOsc.connect(engineFilter).connect(engineGain).connect(master);
  engineOsc.start();

  const noise = makeNoiseBuffer(audioContext);
  windSource = audioContext.createBufferSource();
  windSource.buffer = noise;
  windSource.loop = true;
  windGain = audioContext.createGain();
  const windFilter = audioContext.createBiquadFilter();
  windFilter.type = "highpass";
  windFilter.frequency.value = 900;
  windGain.gain.value = 0;
  windSource.connect(windFilter).connect(windGain).connect(master);
  windSource.start();

  tireSource = audioContext.createBufferSource();
  tireSource.buffer = noise;
  tireSource.loop = true;
  tireGain = audioContext.createGain();
  const tireFilter = audioContext.createBiquadFilter();
  tireFilter.type = "bandpass";
  tireFilter.frequency.value = 1250;
  tireFilter.Q.value = 1.8;
  tireGain.gain.value = 0;
  tireSource.connect(tireFilter).connect(tireGain).connect(master);
  tireSource.start();
}

function setSteer(clientX: number) {
  steer = THREE.MathUtils.clamp((clientX / innerWidth - 0.5) * 2.7, -1, 1);
}
function arm() { armed = true; title.classList.add("hidden"); }
function playCountdownBeep(go = false) {
  if (!audioContext) return;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = go ? 880 : 520;
  gain.gain.setValueAtTime(go ? 0.16 : 0.1, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + (go ? 0.32 : 0.16));
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + (go ? 0.34 : 0.18));
}
function requestStart() {
  if (running || replaying || countdownEnd > 0 || playerProgress >= 5) return;
  armed = true;
  title.classList.add("hidden");
  startSfx();
  countdownEnd = performance.now() / 1000 + 3.8;
}
addEventListener("pointerdown", e => { if (replaying) return; pointer = true; setSteer(e.clientX); arm(); });
addEventListener("pointermove", e => { if (pointer) setSteer(e.clientX); });
addEventListener("pointerup", () => { pointer = false; steer = 0; });
addEventListener("pointercancel", () => { pointer = false; steer = 0; });
const keys = new Set<string>();
addEventListener("keydown", e => {
  if (replaying && e.code === "Escape") { endReplay(); return; }
  keys.add(e.code);
  if (e.code === "ArrowUp" || e.code === "KeyW") requestStart(); else arm();
});
addEventListener("keyup", e => keys.delete(e.code));
function bindPedal(el: HTMLButtonElement, set: (value: boolean) => void) {
  el.addEventListener("pointerdown", e => { e.stopPropagation(); e.preventDefault(); set(true); el.classList.add("active"); if (el === gasEl) requestStart(); else arm(); });
  const release = (e: PointerEvent) => { e.stopPropagation(); set(false); el.classList.remove("active"); };
  el.addEventListener("pointerup", release);
  el.addEventListener("pointercancel", release);
  el.addEventListener("pointerleave", release);
}
bindPedal(gasEl, value => { touchGas = value; });
bindPedal(brakeEl, value => { touchBrake = value; });
skipReplayEl.addEventListener("pointerdown", e => { e.stopPropagation(); e.preventDefault(); endReplay(); });

function startFinish(now: number) {
  if (finishHandled) return;
  finishHandled = true;
  while (replayFrames.length > 2 && replayFrames[0].time < now - 20) replayFrames.shift();
  running = false;
  replaying = replayFrames.length > 1;
  replayStart = now;
  replayCursor = 0;
  playerSpeed = 0;
  bgm.pause();
  finishBgm.volume = 0.72;
  void finishBgm.play().catch(() => {});
  announcementEl.textContent = "FINISH";
  announcementEl.className = "show final";
  skipReplayEl.classList.toggle("show", replaying);
}
function endReplay() {
  replaying = false;
  skipReplayEl.classList.remove("show");
  announcementEl.textContent = "FINISH";
  announcementEl.className = "show final";
}

const cameraTarget = new THREE.Vector3();
const cameraPos = new THREE.Vector3();
function placeCar(car: THREE.Group, u: number, offset: number, slip = 0, roll = 0) {
  const f = trackFrame(u, offset);
  car.position.copy(f.point);
  car.rotation.y = Math.atan2(f.tangent.x, f.tangent.z) + slip;
  car.rotation.z = roll;
  return f;
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.04);
  const now = performance.now() / 1000;
  const keySteer = (keys.has("ArrowRight") || keys.has("KeyD") ? 1 : 0) - (keys.has("ArrowLeft") || keys.has("KeyA") ? 1 : 0);
  const accelerating = touchGas || keys.has("ArrowUp") || keys.has("KeyW");
  const braking = touchBrake || keys.has("ArrowDown") || keys.has("KeyS");
  if (countdownEnd > 0) {
    const remaining = countdownEnd - now;
    const value = remaining > 2.8 ? "3" : remaining > 1.8 ? "2" : remaining > 0.8 ? "1" : remaining > 0 ? "GO" : "";
    if (value !== lastCountdownValue) {
      lastCountdownValue = value;
      if (value) playCountdownBeep(value === "GO");
      if (value === "GO") {
        running = true;
        bgm.volume = 0.68;
        void bgm.play().catch(() => {});
      }
    }
    announcementEl.textContent = value;
    announcementEl.className = value ? "show" : "";
    if (remaining <= 0) {
      countdownEnd = 0;
      announcementEl.className = "";
    }
  }
  if (!pointer && keySteer) steer = keySteer;
  if (!pointer && !keySteer) steer *= Math.pow(0.001, dt);

  if (running) {
    if (accelerating) playerSpeed += 0.00575 * dt;
    else playerSpeed -= 0.00066 * dt;
    if (braking) playerSpeed -= 0.0116 * dt;
    playerSpeed = THREE.MathUtils.clamp(playerSpeed, 0.002, MAX_SPEED);
  }
  if (running) playerProgress += playerSpeed * dt;
  const speedRatio = playerSpeed / MAX_SPEED;
  const steerAuthority = THREE.MathUtils.lerp(6.3, 4.3, speedRatio);
  const targetLateralVelocity = steer * steerAuthority;
  const steeringResponse = pointer || keySteer ? THREE.MathUtils.lerp(0.006, 0.022, speedRatio) : 0.00002;
  lateralVelocity = THREE.MathUtils.lerp(lateralVelocity, targetLateralVelocity, 1 - Math.pow(steeringResponse, dt));
  lane += lateralVelocity * dt;
  if (Math.abs(steer) < 0.04) lane *= Math.pow(0.78, dt);
  lane = THREE.MathUtils.clamp(lane, -3.9, 3.9);
  const drifting = speedRatio > 0.38 && Math.abs(lateralVelocity) > 1.25;
  if (running && drifting) score += Math.abs(lateralVelocity) * dt * 155;
  if (running && now - lastReplayCapture > 0.075) {
    lastReplayCapture = now;
    replayFrames.push({ time: now, progress: playerProgress, lane, lateralVelocity });
  }

  let playerFrame = placeCar(playerCar, playerProgress, lane, -lateralVelocity * 0.048, -lateralVelocity * 0.018);
  if (replaying) {
    const replayTime = replayFrames[0].time + (now - replayStart) * 0.78;
    while (replayCursor < replayFrames.length - 2 && replayFrames[replayCursor + 1].time < replayTime) replayCursor++;
    const frame = replayFrames[replayCursor];
    playerFrame = placeCar(playerCar, frame.progress, frame.lane, -frame.lateralVelocity * 0.048, -frame.lateralVelocity * 0.018);
    if (replayTime >= replayFrames[replayFrames.length - 1].time) endReplay();
  }
  let leadFrame = trackFrame(0);
  rivals.forEach((rival, i) => {
    const pace = rival.speed + Math.sin(now * 0.32 + rival.phase) * 0.00033;
    if (running) rival.progress += pace * dt;
    const rivalLane = rival.lane + Math.sin(now * 0.46 + rival.phase) * 0.38;
    const weave = Math.sin(now * 0.6 + rival.phase);
    const frame = placeCar(rival.car, rival.progress, rivalLane, weave * 0.018, -weave * 0.012);
    if (i === 0) leadFrame = frame;
  });

  if (now - lastEmit > 0.035) {
    lastEmit = now;
    const rear = leadFrame.point.clone().addScaledVector(leadFrame.tangent, -1.78).setY(0.56);
    samples.push({
      left: rear.clone().addScaledVector(leadFrame.right, -0.57),
      right: rear.clone().addScaledVector(leadFrame.right, 0.57),
      tangent: leadFrame.tangent.clone(),
      born: now,
    });
  }
  if (now - lastPlayerEmit > 0.028) {
    lastPlayerEmit = now;
    const rear = playerFrame.point.clone().addScaledVector(playerFrame.tangent, -1.8).setY(0.56);
    playerSamples.push({
      left: rear.clone().addScaledVector(playerFrame.right, -0.57),
      right: rear.clone().addScaledVector(playerFrame.right, 0.57),
      tangent: playerFrame.tangent.clone(),
      born: now,
    });
  }
  while (samples.length && now - samples[0].born > TRAIL_LIFE) samples.shift();
  while (playerSamples.length && now - playerSamples[0].born > PLAYER_TRAIL_LIFE) playerSamples.shift();
  updateRibbon(mainLeft, samples, "left", 0.13, now, TRAIL_LIFE);
  updateRibbon(mainRight, samples, "right", 0.13, now, TRAIL_LIFE);
  updateRibbon(bleedLeft, samples, "left", 0.286, now, TRAIL_LIFE, 1, true);
  updateRibbon(bleedRight, samples, "right", 0.286, now, TRAIL_LIFE, 1, true);
  updateRibbon(playerMainLeft, playerSamples, "left", 0.1, now, PLAYER_TRAIL_LIFE, 0.52);
  updateRibbon(playerMainRight, playerSamples, "right", 0.1, now, PLAYER_TRAIL_LIFE, 0.52);
  updateRibbon(playerBleedLeft, playerSamples, "left", 0.22, now, PLAYER_TRAIL_LIFE, 0.38, true);
  updateRibbon(playerBleedRight, playerSamples, "right", 0.22, now, PLAYER_TRAIL_LIFE, 0.38, true);

  const cameraShake = running ? Math.sin(now * 43) * (0.008 + speedRatio * 0.035) : 0;
  if (replaying) {
    const orbit = Math.sin((now - replayStart) * 0.32);
    cameraPos.copy(playerFrame.point).addScaledVector(playerFrame.tangent, -8 + orbit * 2).addScaledVector(playerFrame.right, 7 + orbit * 4).setY(4.2 + Math.abs(orbit) * 1.8);
    camera.position.lerp(cameraPos, 1 - Math.pow(0.006, dt));
    cameraTarget.copy(playerFrame.point).addScaledVector(playerFrame.tangent, 5).setY(0.65);
  } else {
    cameraPos.copy(playerFrame.point).addScaledVector(playerFrame.tangent, -5.55 - speedRatio * 0.65).addScaledVector(playerFrame.right, -lateralVelocity * 0.2).setY(2.3 + cameraShake);
    camera.position.lerp(cameraPos, 1 - Math.pow(0.0012, dt));
    cameraTarget.copy(playerFrame.point).addScaledVector(playerFrame.tangent, 14 + speedRatio * 5).addScaledVector(playerFrame.right, lateralVelocity * 0.11).setY(0.48);
  }
  camera.lookAt(cameraTarget);

  const targetFov = running ? 68 + speedRatio * 14 + Math.abs(lateralVelocity) * 0.45 : 68;
  camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 1 - Math.pow(0.01, dt));
  camera.updateProjectionMatrix();
  const displaySpeed = Math.round(playerSpeed * TRACK_LENGTH_METERS * 3.6);
  speedEl.textContent = String(displaySpeed).padStart(3, "0");
  speedBarEl.style.width = `${speedRatio * 100}%`;
  positionEl.textContent = String(1 + rivals.filter(rival => rival.progress > playerProgress).length);
  const lap = Math.min(5, Math.floor(playerProgress) + 1);
  lapEl.textContent = String(lap);
  if (lap !== currentLap) {
    currentLap = lap;
    applyLapTheme(lap);
    if (lap === 5) finalLapUntil = now + 3;
  }
  scoreEl.textContent = String(Math.floor(score)).padStart(6, "0");
  const finished = playerProgress >= 5;
  if (finished) startFinish(now);
  if (audioContext && engineOsc && engineGain && windGain && tireGain) {
    const t = audioContext.currentTime;
    engineOsc.frequency.setTargetAtTime(42 + speedRatio * 92 + (accelerating ? 12 : 0), t, 0.08);
    engineGain.gain.setTargetAtTime(running ? 0.08 + speedRatio * 0.18 : 0, t, 0.12);
    windGain.gain.setTargetAtTime(running ? speedRatio * speedRatio * 0.11 : 0, t, 0.18);
    tireGain.gain.setTargetAtTime(drifting ? Math.min(0.15, Math.abs(lateralVelocity) * 0.025) : 0, t, 0.06);
  }
  if (finishHandled) {
    announcementEl.textContent = "FINISH";
    announcementEl.className = "show final";
  } else if (now < finalLapUntil && running && countdownEnd === 0) {
    announcementEl.textContent = "FINAL LAP";
    announcementEl.className = "show final";
  } else if (countdownEnd === 0) {
    announcementEl.className = "";
  }
  statusEl.style.opacity = drifting || armed && !running && countdownEnd === 0 || finished ? "1" : "0";
  statusEl.textContent = replaying ? "REPLAY" : finished ? "RACE COMPLETE" : armed && !running ? "HOLD GAS TO START" : drifting ? "DRIFT // HOLD THE LINE" : "CHASE THE AFTERIMAGE";
  renderer.render(scene, camera);
}
animate();

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
  renderer.setSize(innerWidth, innerHeight);
});
