import * as THREE from "three";
import "./style.css";

const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 2.38;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05091a);
scene.fog = new THREE.FogExp2(0x05091a, 0.0016);
const camera = new THREE.PerspectiveCamera(69, innerWidth / innerHeight, 0.1, 1600);
const clock = new THREE.Clock();
const up = new THREE.Vector3(0, 1, 0);

scene.add(new THREE.HemisphereLight(0xb7caff, 0x1a1e3d, 1.62));
const moon = new THREE.DirectionalLight(0xe1fbff, 2.18);
moon.position.set(-12, 18, -8);
scene.add(moon);

function addWireEnvironment() {
  const city = new THREE.Group();
  const cyan = new THREE.LineBasicMaterial({ color: 0x70f2ff, transparent: true, opacity: 0.46 });
  const violet = new THREE.LineBasicMaterial({ color: 0xc997ff, transparent: true, opacity: 0.38 });
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
    const material = new THREE.LineBasicMaterial({ color: i % 3 === 0 ? 0xff6a95 : 0x75f3ff, transparent: true, opacity: 0.55 });
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
const WORLD_TO_METERS = 1.3;
const MAX_SPEED_MPS = 288 / 3.6;

function trackFrame(u: number, lane = 0) {
  const wrapped = ((u % 1) + 1) % 1;
  const point = oval.getPointAt(wrapped);
  const tangent = oval.getTangentAt(wrapped).normalize();
  const right = new THREE.Vector3().crossVectors(up, tangent).normalize();
  return { point: point.addScaledVector(right, lane), tangent, right };
}
function wrapAngle(angle: number) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}
function trackCurvature(u: number) {
  const du = 0.0005;
  const before = oval.getTangentAt(((u - du) % 1 + 1) % 1);
  const after = oval.getTangentAt(((u + du) % 1 + 1) % 1);
  const a0 = Math.atan2(before.x, before.z);
  const a1 = Math.atan2(after.x, after.z);
  return wrapAngle(a1 - a0) / (TRACK_LENGTH_METERS * du * 2);
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
      const stripe = i % 12 < 6 ? 0.105 : 0.078;
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
  new THREE.MeshBasicMaterial({ color: 0x070b1c }),
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

type SmokeParticle = { sprite: THREE.Sprite; velocity: THREE.Vector3; life: number; maxLife: number };
const smokeTexture = (() => {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = textureCanvas.height = 64;
  const context = textureCanvas.getContext("2d")!;
  const gradient = context.createRadialGradient(32, 32, 2, 32, 32, 30);
  gradient.addColorStop(0, "rgba(170,235,255,.55)");
  gradient.addColorStop(0.45, "rgba(110,150,190,.22)");
  gradient.addColorStop(1, "rgba(40,60,90,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(textureCanvas);
})();
const smokeParticles: SmokeParticle[] = Array.from({ length: 34 }, () => {
  const material = new THREE.SpriteMaterial({ map: smokeTexture, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const sprite = new THREE.Sprite(material);
  sprite.visible = false;
  scene.add(sprite);
  return { sprite, velocity: new THREE.Vector3(), life: 0, maxLife: 1 };
});
let smokeCursor = 0;
let lastSmokeEmit = 0;

type FireworkParticle = { sprite: THREE.Sprite; velocity: THREE.Vector3; life: number; maxLife: number; rocket: boolean };
const fireworkParticles: FireworkParticle[] = Array.from({ length: 140 }, (_, i) => {
  const material = new THREE.SpriteMaterial({
    map: smokeTexture,
    color: [0xff4878, 0x51eaff, 0xffd45a, 0xb36cff][i % 4],
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const sprite = new THREE.Sprite(material);
  sprite.visible = false;
  scene.add(sprite);
  return { sprite, velocity: new THREE.Vector3(), life: 0, maxLife: 1, rocket: false };
});
let fireworkCursor = 0;
let lastFirework = 0;
let lastTouchEnd = 0;

function makeCar(bodyColor: number, rival = false) {
  const car = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.34, metalness: 0.68, flatShading: true });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x09131d, roughness: 0.5, metalness: 0.72, flatShading: true });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x163f5e, roughness: 0.18, metalness: 0.72, flatShading: true });
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x080a0d, roughness: 0.9, metalness: 0.08, flatShading: true });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0x8da4b0, roughness: 0.3, metalness: 0.9, flatShading: true });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.38, 3.25), bodyMat);
  body.position.y = 0.48;
  car.add(body);
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.68, 0.16, 1.05), bodyMat);
  hood.position.set(0, 0.7, 1.05);
  hood.rotation.x = -0.055;
  car.add(hood);
  const trunk = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.16, 0.72), bodyMat);
  trunk.position.set(0, 0.68, -1.28);
  trunk.rotation.x = 0.035;
  car.add(trunk);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.52, 1.45, 1, 1, 1), glassMat);
  cabin.position.set(0, 0.91, -0.14);
  cabin.scale.set(0.88, 1, 0.94);
  car.add(cabin);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.08, 0.78), bodyMat);
  roof.position.set(0, 1.2, -0.18);
  car.add(roof);
  for (const z of [-0.9, 1.03]) {
    for (const x of [-0.91, 0.91]) {
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.22, 10), tireMat);
      tire.rotation.z = Math.PI / 2;
      tire.position.set(x, 0.34, z);
      car.add(tire);
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.235, 8), rimMat);
      rim.rotation.z = Math.PI / 2;
      rim.position.set(x, 0.34, z);
      car.add(rim);
    }
  }
  for (const x of [-0.93, 0.93]) {
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 2.45), trimMat);
    skirt.position.set(x, 0.27, 0);
    car.add(skirt);
  }
  const frontBumper = new THREE.Mesh(new THREE.BoxGeometry(1.84, 0.2, 0.22), trimMat);
  frontBumper.position.set(0, 0.3, 1.68);
  car.add(frontBumper);
  const bumper = new THREE.Mesh(new THREE.BoxGeometry(1.84, 0.2, 0.22), trimMat);
  bumper.position.set(0, 0.32, -1.73);
  car.add(bumper);
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.12, 0.025), new THREE.MeshBasicMaterial({ color: 0x020507 }));
  grille.position.set(0, 0.4, 1.805);
  car.add(grille);
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
type Rival = { car: THREE.Group; progress: number; lane: number; speedMps: number; topSpeedMps: number; acceleration: number; phase: number };
const rivalColors = [0x171424, 0x42203e, 0x112c4a, 0x3f1623, 0x153d39, 0x422b12, 0x292044];
const rivals: Rival[] = rivalColors.map((color, i) => {
  const car = makeCar(color, true);
  scene.add(car);
  return {
    car,
    progress: 0.045 - i * 0.014,
    lane: (i % 2 ? 1 : -1) * (0.65 + (i % 3) * 0.65),
    speedMps: 0,
    topSpeedMps: (218 + (i % 4) * 7 + Math.floor(i / 4) * 4) / 3.6,
    acceleration: 5.1 + (i % 3) * 0.42,
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
let steeringPointerId: number | null = null;
let playerProgress = 0;
let playerSpeed = 0;
let lane = 0;
let lateralVelocity = 0;
let yawError = 0;
let yawRate = 0;
let steerAngle = 0;
let longitudinalAccel = 0;
let score = 0;
let lastEmit = 0;
let lastPlayerEmit = 0;
let lastReplayCapture = 0;
type ReplayFrame = { time: number; progress: number; lane: number; lateralVelocity: number; yawError: number; yawRate: number };
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
const steeringEl = document.querySelector<HTMLElement>("#steering")!;
const steeringKnobEl = document.querySelector<HTMLElement>("#steeringKnob")!;
const gasEl = document.querySelector<HTMLButtonElement>("#gas")!;
const brakeEl = document.querySelector<HTMLButtonElement>("#brake")!;
const bgm = document.querySelector<HTMLAudioElement>("#bgm")!;
const finishBgm = document.querySelector<HTMLAudioElement>("#finishBgm")!;
const audioToggleEl = document.querySelector<HTMLButtonElement>("#audioToggle")!;
const settingsScreenEl = document.querySelector<HTMLElement>("#settingsScreen")!;
const closeSettingsEl = document.querySelector<HTMLButtonElement>("#closeSettings")!;
const bgmVolumeEl = document.querySelector<HTMLInputElement>("#bgmVolume")!;
const sfxVolumeEl = document.querySelector<HTMLInputElement>("#sfxVolume")!;
const bgmValueEl = document.querySelector<HTMLOutputElement>("#bgmValue")!;
const sfxValueEl = document.querySelector<HTMLOutputElement>("#sfxValue")!;
let touchGas = false;
let touchBrake = false;
let audioContext: AudioContext | null = null;
let sfxMaster: GainNode | null = null;
let bgmVolume = Number(localStorage.getItem("nebura-bgm-volume") ?? 68) / 100;
let sfxVolume = Number(localStorage.getItem("nebura-sfx-volume") ?? 48) / 100;
let finishBgmWarmed = false;
bgmVolumeEl.value = String(Math.round(bgmVolume * 100));
sfxVolumeEl.value = String(Math.round(sfxVolume * 100));
bgmValueEl.value = bgmVolumeEl.value;
sfxValueEl.value = sfxVolumeEl.value;
bgm.volume = bgmVolume;
finishBgm.volume = bgmVolume;
let engineOsc: OscillatorNode | null = null;
let engineGain: GainNode | null = null;
let windSource: AudioBufferSourceNode | null = null;
let windGain: GainNode | null = null;
let tireSource: AudioBufferSourceNode | null = null;
let tireGain: GainNode | null = null;

const lapThemes = [
  { sky: 0x09112c, fog: 0x09112c, grid: 0x246f91, opacity: 0.16 },
  { sky: 0x0c1836, fog: 0x0c1d39, grid: 0x3595b8, opacity: 0.36 },
  { sky: 0x1d1235, fog: 0x22143e, grid: 0x7b56c5, opacity: 0.27 },
  { sky: 0x0c281d, fog: 0x0d3027, grid: 0x38a589, opacity: 0.42 },
  { sky: 0x32101f, fog: 0x3a1020, grid: 0xc43d68, opacity: 0.5 },
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
  sfxMaster = audioContext.createGain();
  sfxMaster.gain.value = sfxVolume;
  sfxMaster.connect(audioContext.destination);

  engineOsc = audioContext.createOscillator();
  engineOsc.type = "sawtooth";
  engineGain = audioContext.createGain();
  const engineFilter = audioContext.createBiquadFilter();
  engineFilter.type = "lowpass";
  engineFilter.frequency.value = 420;
  engineGain.gain.value = 0;
  engineOsc.connect(engineFilter).connect(engineGain).connect(sfxMaster);
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
  windSource.connect(windFilter).connect(windGain).connect(sfxMaster);
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
  tireSource.connect(tireFilter).connect(tireGain).connect(sfxMaster);
  tireSource.start();
}

function setVirtualSteer(clientX: number) {
  const rect = steeringEl.getBoundingClientRect();
  const raw = THREE.MathUtils.clamp((clientX - (rect.left + rect.width * 0.5)) / (rect.width * 0.36), -1, 1);
  const deadZone = 0.08;
  const amount = Math.abs(raw) < deadZone ? 0 : Math.sign(raw) * Math.pow((Math.abs(raw) - deadZone) / (1 - deadZone), 1.15);
  steer = amount;
  steeringKnobEl.style.transform = `translateX(${amount * rect.width * 0.25}px)`;
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
  oscillator.connect(gain).connect(sfxMaster ?? audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + (go ? 0.34 : 0.18));
}
function requestStart() {
  if (running || replaying || countdownEnd > 0 || playerProgress >= 5) return;
  armed = true;
  title.classList.add("hidden");
  startSfx();
  bgm.load();
  warmFinishBgm();
  countdownEnd = performance.now() / 1000 + 3.8;
}
function warmFinishBgm() {
  if (finishBgmWarmed) return;
  finishBgmWarmed = true;
  finishBgm.load();
  finishBgm.muted = true;
  void finishBgm.play().then(() => {
    finishBgm.pause();
    finishBgm.currentTime = 0;
    finishBgm.muted = false;
    finishBgm.volume = bgmVolume;
  }).catch(() => {
    finishBgm.muted = false;
    finishBgmWarmed = false;
  });
}
function playFinishBgm() {
  const tryPlay = () => {
    void finishBgm.play().catch(() => {});
  };
  void finishBgm.play().catch(() => {
    finishBgm.load();
    finishBgm.addEventListener("canplay", tryPlay, { once: true });
  });
}
addEventListener("pointerdown", e => { if (!replaying) arm(); });
for (const gesture of ["gesturestart", "gesturechange", "gestureend"]) {
  document.addEventListener(gesture, e => e.preventDefault(), { passive: false });
}
document.addEventListener("touchmove", e => {
  if (e.touches.length > 1) e.preventDefault();
}, { passive: false });
document.addEventListener("dblclick", e => e.preventDefault(), { passive: false });
document.addEventListener("touchend", e => {
  const target = e.target as HTMLElement | null;
  if (target?.tagName === "INPUT") return;
  const now = performance.now();
  if (now - lastTouchEnd < 280) e.preventDefault();
  lastTouchEnd = now;
}, { passive: false });
steeringEl.addEventListener("pointerdown", e => {
  e.stopPropagation();
  e.preventDefault();
  if (replaying) return;
  steeringPointerId = e.pointerId;
  steeringEl.setPointerCapture(e.pointerId);
  steeringEl.classList.add("active");
  setVirtualSteer(e.clientX);
  arm();
});
steeringEl.addEventListener("pointermove", e => {
  if (steeringPointerId === e.pointerId) {
    e.preventDefault();
    setVirtualSteer(e.clientX);
  }
});
function releaseSteering(e: PointerEvent) {
  if (steeringPointerId !== e.pointerId) return;
  steeringPointerId = null;
  steer = 0;
  steeringKnobEl.style.transform = "translateX(0)";
  steeringEl.classList.remove("active");
}
steeringEl.addEventListener("pointerup", releaseSteering);
steeringEl.addEventListener("pointercancel", releaseSteering);
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
audioToggleEl.addEventListener("pointerdown", e => {
  e.stopPropagation();
  settingsScreenEl.classList.add("show");
});
closeSettingsEl.addEventListener("pointerdown", e => { e.stopPropagation(); settingsScreenEl.classList.remove("show"); });
settingsScreenEl.addEventListener("pointerdown", e => { if (e.target === settingsScreenEl) settingsScreenEl.classList.remove("show"); });
for (const input of [bgmVolumeEl, sfxVolumeEl]) input.addEventListener("pointerdown", e => e.stopPropagation());
bgmVolumeEl.addEventListener("input", () => {
  bgmVolume = Number(bgmVolumeEl.value) / 100;
  bgmValueEl.value = bgmVolumeEl.value;
  bgm.volume = bgmVolume;
  finishBgm.volume = bgmVolume;
  localStorage.setItem("nebura-bgm-volume", bgmVolumeEl.value);
});
sfxVolumeEl.addEventListener("input", () => {
  sfxVolume = Number(sfxVolumeEl.value) / 100;
  sfxValueEl.value = sfxVolumeEl.value;
  if (sfxMaster && audioContext) sfxMaster.gain.setTargetAtTime(sfxVolume, audioContext.currentTime, 0.04);
  localStorage.setItem("nebura-sfx-volume", sfxVolumeEl.value);
});

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
  finishBgm.pause();
  finishBgm.currentTime = 0;
  finishBgm.muted = false;
  finishBgm.volume = bgmVolume;
  playFinishBgm();
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
  car.rotation.z = THREE.MathUtils.clamp(roll, -0.07, 0.07);
  const tangent = f.tangent.clone().applyAxisAngle(up, slip).normalize();
  const right = new THREE.Vector3().crossVectors(up, tangent).normalize();
  return { point: f.point, tangent, right };
}

const vehicle = {
  mass: 1200,
  inertia: 2050,
  frontAxle: 1.25,
  rearAxle: 1.25,
  cgHeight: 0.55,
  frontCornerStiffness: 72000,
  rearCornerStiffness: 74000,
  frontGrip: 1.32,
  rearGrip: 1.36,
  engineForce: 9200,
  brakeForce: 15500,
  rollingResistance: 45,
  aerodynamicDrag: 0.22,
  maxSteer: 0.44,
};

type DriftState = "grip" | "entry" | "hold" | "recovery";
let driftState: DriftState = "grip";
let driftDirection = 0;
let driftStateTime = 0;
let gasReleaseTime = 0;
let previousAccelerating = false;
let neutralSteerTime = 0;

function updateArcadeDrift(dt: number, accelerating: boolean, braking: boolean) {
  const speedKmh = playerSpeed * 3.6;
  const turned = Math.abs(steer) > 0.34;
  const gasSnap = accelerating && !previousAccelerating && gasReleaseTime > 0.06 && gasReleaseTime < 0.42;
  if (!accelerating) gasReleaseTime = Math.min(1, gasReleaseTime + dt);
  else if (!gasSnap) gasReleaseTime = 0;

  if (driftState === "grip" && speedKmh > 100 && turned && (braking || gasSnap)) {
    driftState = "entry";
    driftDirection = -Math.sign(steer);
    driftStateTime = 0;
    neutralSteerTime = 0;
  }

  driftStateTime += dt;
  if (driftState === "entry") {
    const target = driftDirection * THREE.MathUtils.lerp(0.3, 0.42, Math.abs(steer));
    yawError = THREE.MathUtils.lerp(yawError, target, 1 - Math.pow(0.003, dt));
    lateralVelocity = THREE.MathUtils.lerp(lateralVelocity, Math.sin(target) * playerSpeed * 0.45, 1 - Math.pow(0.02, dt));
    if (driftStateTime > 0.2) {
      driftState = "hold";
      driftStateTime = 0;
    }
  } else if (driftState === "hold") {
    const target = driftDirection * THREE.MathUtils.lerp(0.32, 0.48, Math.abs(steer));
    yawError = THREE.MathUtils.lerp(yawError, target, 1 - Math.pow(0.11, dt));
    lateralVelocity = THREE.MathUtils.lerp(lateralVelocity, Math.sin(target) * playerSpeed * 0.5, 1 - Math.pow(0.18, dt));
    neutralSteerTime = Math.abs(steer) < 0.14 ? neutralSteerTime + dt : 0;
    const counterSteering = Math.sign(steer) === driftDirection && Math.abs(steer) > 0.32;
    if (counterSteering || neutralSteerTime > 0.5 || driftStateTime > 3.2 || speedKmh < 72) {
      driftState = "recovery";
      driftStateTime = 0;
    }
  } else if (driftState === "recovery") {
    yawError = THREE.MathUtils.lerp(yawError, 0, 1 - Math.pow(0.012, dt));
    lateralVelocity *= Math.pow(0.055, dt);
    if (driftStateTime > 0.42 || Math.abs(yawError) < 0.045) {
      driftState = "grip";
      driftStateTime = 0;
      driftDirection = 0;
    }
  }
  previousAccelerating = accelerating;
}

function updatePlayerPhysics(dt: number, accelerating: boolean, braking: boolean) {
  const speedRatio = THREE.MathUtils.clamp(playerSpeed / MAX_SPEED_MPS, 0, 1);
  const steerLimit = vehicle.maxSteer * THREE.MathUtils.lerp(1, 0.27, speedRatio);
  const stabilitySteer = THREE.MathUtils.clamp(-yawError * 0.58 - yawRate * 0.16, -0.22, 0.22) * speedRatio;
  const assistStrength = THREE.MathUtils.lerp(1, driftState === "hold" ? 0.52 : 0.3, Math.abs(steer));
  const laneAssist = THREE.MathUtils.clamp(-lane / (TRACK_WIDTH * 5.5), -0.12, 0.12) * speedRatio * assistStrength;
  const driverSteer = -steer * steerLimit;
  const targetSteer = THREE.MathUtils.clamp(driverSteer + stabilitySteer + laneAssist, -steerLimit, steerLimit);
  steerAngle = THREE.MathUtils.lerp(steerAngle, targetSteer, 1 - Math.pow(0.0008, dt));

  const wheelBase = vehicle.frontAxle + vehicle.rearAxle;
  const staticFront = vehicle.rearAxle / wheelBase;
  const staticRear = vehicle.frontAxle / wheelBase;
  const weightShift = vehicle.mass * longitudinalAccel * vehicle.cgHeight / wheelBase;
  const frontLoad = Math.max(1500, vehicle.mass * 9.81 * staticFront - weightShift);
  const rearLoad = Math.max(1500, vehicle.mass * 9.81 * staticRear + weightShift);
  const safeVx = Math.max(3, playerSpeed);
  const frontSlip = Math.atan2(lateralVelocity + vehicle.frontAxle * yawRate, safeVx) - steerAngle;
  const rearSlip = Math.atan2(lateralVelocity - vehicle.rearAxle * yawRate, safeVx);
  const offRoad = Math.abs(lane) > TRACK_WIDTH * 0.46;
  const throttleSlip = accelerating && speedRatio < 0.72 && Math.abs(steer) > 0.58 ? 0.94 : 1;
  const frontLimit = frontLoad * vehicle.frontGrip * (offRoad ? 0.8 : 1);
  const driftRearGrip = driftState === "entry" ? 0.7 : driftState === "hold" ? 0.76 : driftState === "recovery" ? 0.92 : 1;
  const rearLimit = rearLoad * vehicle.rearGrip * throttleSlip * driftRearGrip * (offRoad ? 0.74 : 1);
  const frontForce = THREE.MathUtils.clamp(-vehicle.frontCornerStiffness * frontSlip, -frontLimit, frontLimit);
  const rearForce = THREE.MathUtils.clamp(-vehicle.rearCornerStiffness * rearSlip, -rearLimit, rearLimit);

  const engine = accelerating ? vehicle.engineForce * (1 - speedRatio * speedRatio * 0.38) : 0;
  const brake = braking ? vehicle.brakeForce : 0;
  const drag = vehicle.rollingResistance * playerSpeed + vehicle.aerodynamicDrag * playerSpeed * playerSpeed;
  const previousSpeed = playerSpeed;
  const forwardForce = engine - brake - drag - (offRoad ? 3200 : 0);
  playerSpeed = THREE.MathUtils.clamp(playerSpeed + (forwardForce / vehicle.mass) * dt, 0, MAX_SPEED_MPS);
  longitudinalAccel = (playerSpeed - previousSpeed) / Math.max(dt, 0.001);

  if (playerSpeed < 1.5) {
    lateralVelocity *= Math.pow(0.0001, dt);
    yawRate *= Math.pow(0.0001, dt);
  } else {
    const lateralAccel = (frontForce * Math.cos(steerAngle) + rearForce) / vehicle.mass - playerSpeed * yawRate;
    const yawAccel = (frontForce * Math.cos(steerAngle) * vehicle.frontAxle - rearForce * vehicle.rearAxle) / vehicle.inertia;
    lateralVelocity += lateralAccel * dt;
    yawRate += yawAccel * dt;
    const stability = THREE.MathUtils.lerp(2.2, 4.4, speedRatio) * (driftState === "hold" ? 0.2 : driftState === "entry" ? 0.35 : 1);
    yawRate -= yawError * stability * dt;
    lateralVelocity -= lateralVelocity * THREE.MathUtils.lerp(0.35, 0.72, speedRatio) * (driftState === "hold" ? 0.18 : 1) * dt;
    yawRate *= Math.pow(offRoad ? 0.12 : 0.48, dt);
  }

  const alongSpeed = playerSpeed * Math.cos(yawError) - lateralVelocity * Math.sin(yawError);
  const acrossSpeed = playerSpeed * Math.sin(yawError) + lateralVelocity * Math.cos(yawError);
  playerProgress += Math.max(0, alongSpeed) * dt / TRACK_LENGTH_METERS;
  lane += acrossSpeed * dt / WORLD_TO_METERS;
  yawError = wrapAngle(yawError + (yawRate - trackCurvature(playerProgress) * alongSpeed) * dt);
  yawError = THREE.MathUtils.clamp(yawError, -0.62, 0.62);

  if (Math.abs(lane) > TRACK_WIDTH * 0.48) {
    const excess = Math.abs(lane) - TRACK_WIDTH * 0.48;
    const recovery = offRoad ? 5.2 : 2.5;
    lateralVelocity -= Math.sign(lane) * excess * recovery * dt;
    yawError -= Math.sign(lane) * excess * (offRoad ? 0.2 : 0.1) * dt;
  }
  lane = THREE.MathUtils.clamp(lane, -TRACK_WIDTH * 0.7, TRACK_WIDTH * 0.7);
  return { frontSlip, rearSlip, offRoad };
}

function emitDriftSmoke(frame: ReturnType<typeof placeCar>, now: number) {
  if (now - lastSmokeEmit < 0.035) return;
  lastSmokeEmit = now;
  for (const side of [-1, 1]) {
    const particle = smokeParticles[smokeCursor++ % smokeParticles.length];
    particle.life = particle.maxLife = 0.7 + Math.random() * 0.45;
    particle.sprite.visible = true;
    particle.sprite.position.copy(frame.point).addScaledVector(frame.tangent, -1.55).addScaledVector(frame.right, side * 0.62).setY(0.18);
    particle.sprite.scale.setScalar(0.8);
    particle.velocity.copy(frame.tangent).multiplyScalar(-0.8 - Math.random() * 0.8).addScaledVector(frame.right, side * (Math.random() - 0.5)).setY(0.35 + Math.random() * 0.35);
  }
}
function spawnFirework(frame: ReturnType<typeof placeCar>, now: number) {
  const beatPulse = getBgmPulse();
  if (now - lastFirework < THREE.MathUtils.lerp(1.2, 0.62, beatPulse)) return;
  lastFirework = now;
  const launch = frame.point.clone()
    .addScaledVector(frame.tangent, 45 + Math.random() * 28)
    .addScaledVector(frame.right, (Math.random() < 0.5 ? -1 : 1) * (22 + Math.random() * 22))
    .setY(0.4);
  const particle = fireworkParticles[fireworkCursor++ % fireworkParticles.length];
  particle.life = particle.maxLife = 0.72 + Math.random() * 0.25;
  particle.rocket = true;
  particle.sprite.visible = true;
  particle.sprite.position.copy(launch);
  particle.sprite.scale.setScalar(0.28 + beatPulse * 0.18);
  particle.velocity.set((Math.random() - 0.5) * 1.6, 21 + Math.random() * 7, (Math.random() - 0.5) * 1.6);
  updateFireworkColor(particle, beatPulse, fireworkCursor);
}
function burstFirework(center: THREE.Vector3) {
  const beatPulse = getBgmPulse();
  const count = 18 + Math.round(beatPulse * 16);
  for (let i = 0; i < count; i++) {
    const particle = fireworkParticles[fireworkCursor++ % fireworkParticles.length];
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.18;
    const elevation = (Math.random() - 0.36) * 0.72;
    const speed = 5 + Math.random() * 5 + beatPulse * 4;
    particle.life = particle.maxLife = 1.1 + Math.random() * 0.55;
    particle.rocket = false;
    particle.sprite.visible = true;
    particle.sprite.position.copy(center);
    particle.sprite.scale.setScalar(0.22 + Math.random() * 0.18 + beatPulse * 0.1);
    particle.velocity.set(Math.cos(angle) * speed, elevation * speed, Math.sin(angle) * speed);
    updateFireworkColor(particle, beatPulse, i);
  }
}
function getBgmPulse() {
  if (bgm.paused || !Number.isFinite(bgm.currentTime)) return 0.25;
  const beat = (bgm.currentTime * 2.05) % 1;
  return Math.pow(1 - beat, 4.2);
}
function updateFireworkColor(particle: FireworkParticle, pulse: number, offset: number) {
  const hue = (bgm.currentTime * 0.07 + offset * 0.11 + pulse * 0.18) % 1;
  (particle.sprite.material as THREE.SpriteMaterial).color.setHSL(hue, 0.9, 0.58 + pulse * 0.24);
}
function updateEffects(dt: number) {
  for (const particle of smokeParticles) {
    if (particle.life <= 0) continue;
    particle.life -= dt;
    particle.sprite.position.addScaledVector(particle.velocity, dt);
    particle.velocity.multiplyScalar(Math.pow(0.25, dt));
    const age = 1 - Math.max(0, particle.life) / particle.maxLife;
    particle.sprite.scale.setScalar(0.8 + age * 2.4);
    (particle.sprite.material as THREE.SpriteMaterial).opacity = Math.sin(Math.min(1, age) * Math.PI) * 0.24;
    if (particle.life <= 0) particle.sprite.visible = false;
  }
  for (const particle of fireworkParticles) {
    if (particle.life <= 0) continue;
    particle.life -= dt;
    particle.velocity.y -= (particle.rocket ? 8.5 : 2.6) * dt;
    particle.sprite.position.addScaledVector(particle.velocity, dt);
    const material = particle.sprite.material as THREE.SpriteMaterial;
    if (particle.rocket) {
      const pulse = getBgmPulse();
      material.opacity = 0.65 + pulse * 0.35;
      particle.sprite.scale.setScalar(0.22 + pulse * 0.22);
      updateFireworkColor(particle, pulse, fireworkCursor);
    } else {
      material.opacity = Math.pow(Math.max(0, particle.life) / particle.maxLife, 1.7);
    }
    if (particle.life <= 0) {
      if (particle.rocket) burstFirework(particle.sprite.position.clone());
      particle.rocket = false;
      particle.sprite.visible = false;
    }
  }
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
        bgm.volume = bgmVolume;
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
  if (steeringPointerId === null && keySteer) steer = keySteer;
  if (steeringPointerId === null && !keySteer) steer *= Math.pow(0.001, dt);

  let dynamics = { frontSlip: 0, rearSlip: 0, offRoad: false };
  if (running) {
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const step = dt / steps;
    for (let i = 0; i < steps; i++) {
      dynamics = updatePlayerPhysics(step, accelerating, braking);
      updateArcadeDrift(step, accelerating, braking);
    }
  }
  const speedRatio = playerSpeed / MAX_SPEED_MPS;
  const slipAngle = Math.atan2(lateralVelocity, Math.max(1, playerSpeed));
  const drifting = driftState !== "grip" || speedRatio > 0.3 && Math.abs(dynamics.rearSlip) > 0.09;
  if (running && drifting) score += Math.abs(lateralVelocity) * dt * 155;
  if (running && now - lastReplayCapture > 0.04) {
    lastReplayCapture = now;
    replayFrames.push({ time: now, progress: playerProgress, lane, lateralVelocity, yawError, yawRate });
  }

  let playerFrame = placeCar(playerCar, playerProgress, lane, yawError, -lateralVelocity * 0.012);
  playerCar.rotation.x = THREE.MathUtils.clamp(-longitudinalAccel * 0.004, -0.032, 0.032);
  if (replaying) {
    const replayTime = replayFrames[0].time + (now - replayStart) * 0.78;
    while (replayCursor < replayFrames.length - 2 && replayFrames[replayCursor + 1].time < replayTime) replayCursor++;
    const frameA = replayFrames[replayCursor];
    const frameB = replayFrames[Math.min(replayCursor + 1, replayFrames.length - 1)];
    const blend = THREE.MathUtils.smoothstep(
      THREE.MathUtils.clamp((replayTime - frameA.time) / Math.max(0.001, frameB.time - frameA.time), 0, 1),
      0,
      1,
    );
    const replayProgress = THREE.MathUtils.lerp(frameA.progress, frameB.progress, blend);
    const replayLane = THREE.MathUtils.lerp(frameA.lane, frameB.lane, blend);
    const replayLateralVelocity = THREE.MathUtils.lerp(frameA.lateralVelocity, frameB.lateralVelocity, blend);
    const replayYaw = frameA.yawError + wrapAngle(frameB.yawError - frameA.yawError) * blend;
    playerFrame = placeCar(playerCar, replayProgress, replayLane, replayYaw, -replayLateralVelocity * 0.012);
    if (replayTime >= replayFrames[replayFrames.length - 1].time) endReplay();
  }
  if (running && drifting) emitDriftSmoke(playerFrame, now);
  if (running && currentLap === 5) spawnFirework(playerFrame, now);
  updateEffects(dt);
  let leadFrame = trackFrame(0);
  rivals.forEach((rival, i) => {
    const gap = rival.progress - playerProgress;
    const rubberBand = THREE.MathUtils.clamp(-gap * 3.2, -0.06, 0.045);
    const targetSpeed = rival.topSpeedMps * (1 + rubberBand + Math.sin(now * 0.32 + rival.phase) * 0.008);
    if (running) {
      const speedDelta = targetSpeed - rival.speedMps;
      const maxDelta = (speedDelta > 0 ? rival.acceleration : 8.5) * dt;
      rival.speedMps += THREE.MathUtils.clamp(speedDelta, -maxDelta, maxDelta);
      rival.progress += rival.speedMps * dt / TRACK_LENGTH_METERS;
    }
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
  if (now - lastPlayerEmit > (replaying ? 0.018 : 0.028)) {
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
    camera.position.lerp(cameraPos, 1 - Math.pow(0.018, dt));
    const replayLook = playerFrame.point.clone().addScaledVector(playerFrame.tangent, 5).setY(0.65);
    cameraTarget.lerp(replayLook, 1 - Math.pow(0.008, dt));
  } else {
    const cameraSlip = THREE.MathUtils.clamp(lateralVelocity * 0.16, -2.2, 2.2);
    cameraPos.copy(playerFrame.point).addScaledVector(playerFrame.tangent, -5.55 - speedRatio * 0.65).addScaledVector(playerFrame.right, -cameraSlip).setY(2.3 + cameraShake);
    camera.position.lerp(cameraPos, 1 - Math.pow(0.0012, dt));
    cameraTarget.copy(playerFrame.point).addScaledVector(playerFrame.tangent, 14 + speedRatio * 5).addScaledVector(playerFrame.right, lateralVelocity * 0.11).setY(0.48);
  }
  camera.lookAt(cameraTarget);

  const targetFov = running ? 68 + speedRatio * 14 + Math.abs(lateralVelocity) * 0.45 : 68;
  camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 1 - Math.pow(0.01, dt));
  camera.updateProjectionMatrix();
  const displaySpeed = Math.round(playerSpeed * 3.6);
  speedEl.textContent = String(displaySpeed).padStart(3, "0");
  speedBarEl.style.width = `${speedRatio * 100}%`;
  positionEl.textContent = String(1 + rivals.filter(rival => rival.progress > playerProgress).length);
  const lap = Math.min(5, Math.floor(playerProgress) + 1);
  lapEl.textContent = String(lap);
  if (lap !== currentLap) {
    currentLap = lap;
    applyLapTheme(lap);
    if (lap === 5) {
      finalLapUntil = now + 3;
      finishBgm.load();
    }
  }
  scoreEl.textContent = String(Math.floor(score)).padStart(6, "0");
  const finished = playerProgress >= 5;
  if (finished) startFinish(now);
  if (audioContext && engineOsc && engineGain && windGain && tireGain) {
    const t = audioContext.currentTime;
    engineOsc.frequency.setTargetAtTime(42 + speedRatio * 92 + (accelerating ? 12 : 0), t, 0.08);
    engineGain.gain.setTargetAtTime(running ? 0.08 + speedRatio * 0.18 : 0, t, 0.12);
    windGain.gain.setTargetAtTime(running ? speedRatio * speedRatio * 0.11 : 0, t, 0.18);
    tireGain.gain.setTargetAtTime(drifting ? Math.min(0.22, Math.abs(lateralVelocity) * 0.032) : 0, t, 0.06);
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
