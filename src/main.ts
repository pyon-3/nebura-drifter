import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import "./style.css";

const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
const isMobileSafari = /iPhone|iPad|iPod/i.test(navigator.userAgent) && /WebKit/i.test(navigator.userAgent);
const useMobileSafe = isMobile;
const disableGlow = useMobileSafe;
const disableTrail = false;
const disableBleed = useMobileSafe;
const disableBloom = useMobileSafe;
const disableParticles = useMobileSafe;
const disableSprites = useMobileSafe;
const safeBlending = useMobileSafe ? THREE.NormalBlending : THREE.AdditiveBlending;
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: !useMobileSafe,
  alpha: false,
  premultipliedAlpha: false,
  powerPreference: "high-performance",
  precision: isMobileSafari ? "mediump" : "highp",
});
const pixelRatioLimit = useMobileSafe ? 1.25 : 1.7;
renderer.setPixelRatio(Math.min(devicePixelRatio, pixelRatioLimit));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = disableBloom ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = disableBloom ? 1 : 2.38;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05091a);
scene.fog = new THREE.FogExp2(0x05091a, 0.0016);
const camera = new THREE.PerspectiveCamera(69, innerWidth / innerHeight, 0.1, 1600);
const clock = new THREE.Clock();
const up = new THREE.Vector3(0, 1, 0);
const isMobileDevice = matchMedia("(pointer: coarse)").matches || isMobile;
let reducedEffects = false;
let fpsSampleStarted = performance.now();
let fpsSampleFrames = 0;
let slowFpsWindows = 0;
let fastFpsWindows = 0;

function setToneMappingExposure(value: number) {
  renderer.toneMappingExposure = disableBloom ? 1 : value;
}

function markEffect<T extends THREE.Object3D>(object: T, group: "glow" | "trail" | "bleed" | "particles", name: string) {
  object.name = name;
  object.userData.effectGroup = group;
  return object;
}

function finite(v: THREE.Vector3) {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

const hemisphere = new THREE.HemisphereLight(0xb7caff, 0x1a1e3d, 1.62);
scene.add(hemisphere);
const moon = new THREE.DirectionalLight(0xe1fbff, 2.18);
moon.position.set(-12, 18, -8);
scene.add(moon);
const duskSky = new THREE.Mesh(
  new THREE.SphereGeometry(1250, 32, 16),
  new THREE.ShaderMaterial({
    uniforms: {
      zenith: { value: new THREE.Color(0x10152d) },
      horizon: { value: new THREE.Color(0xc45f43) },
      low: { value: new THREE.Color(0x35162a) },
    },
    vertexShader: `varying float vHeight;void main(){vHeight=normalize(position).y;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `uniform vec3 zenith;uniform vec3 horizon;uniform vec3 low;varying float vHeight;void main(){float upper=smoothstep(-.05,.72,vHeight);float lower=smoothstep(-.72,-.02,vHeight);vec3 color=mix(low,horizon,lower);color=mix(color,zenith,upper);gl_FragColor=vec4(color,1.0);}`,
    side: THREE.BackSide,
    depthWrite: false,
  }),
);
duskSky.visible = false;
scene.add(duskSky);
const wireMaterials: THREE.LineBasicMaterial[] = [];
const gateMaterials: THREE.LineBasicMaterial[] = [];
let stageGroup = new THREE.Group();
let landmarkRing: THREE.Mesh | null = null;
scene.add(stageGroup);

function addQuietLakeEnvironment() {
  const treePositions: number[] = [];
  const addSegment = (a: THREE.Vector3, b: THREE.Vector3) => {
    treePositions.push(a.x, a.y, a.z, b.x, b.y, b.z);
  };
  for (let i = 0; i < 112; i++) {
    const f = trackFrame(i / 112);
    const side = i % 2 ? 1 : -1;
    const offset = TRACK_WIDTH * 0.5 + 10 + (i * 17 % 24);
    const base = f.point.clone().addScaledVector(f.right, side * offset).addScaledVector(f.normal, 0.08);
    const height = 5.5 + (i * 13 % 9);
    const trunkTop = base.clone().addScaledVector(f.normal, height * 0.42);
    addSegment(base, trunkTop);
    for (let tier = 0; tier < 3; tier++) {
      const tierY = height * (0.38 + tier * 0.2);
      const radius = height * (0.34 - tier * 0.075);
      const center = base.clone().addScaledVector(f.normal, tierY);
      const apex = base.clone().addScaledVector(f.normal, tierY + height * 0.3);
      const ring: THREE.Vector3[] = [];
      for (let j = 0; j < 6; j++) {
        const angle = j / 6 * Math.PI * 2;
        ring.push(center.clone().addScaledVector(f.right, Math.cos(angle) * radius).addScaledVector(f.tangent, Math.sin(angle) * radius));
      }
      for (let j = 0; j < ring.length; j++) {
        addSegment(ring[j], ring[(j + 1) % ring.length]);
        addSegment(ring[j], apex);
      }
    }
  }
  const treeMaterial = new THREE.LineBasicMaterial({ color: 0x58b5a1, transparent: true, opacity: 0.58 });
  wireMaterials.push(treeMaterial);
  const trees = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(treePositions, 3)),
    treeMaterial,
  );
  trees.name = "quiet-lake-wire-trees";
  stageGroup.add(trees);

  const sampled = oval.getSpacedPoints(192);
  const bounds = new THREE.Box3().setFromPoints(sampled);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const lakeY = TRACK_FLOOR_Y + 0.075;
  const lakePositions: number[] = [];
  const addLakeSegment = (ax: number, az: number, bx: number, bz: number) => {
    lakePositions.push(ax, lakeY, az, bx, lakeY, bz);
  };
  for (let ring = 0; ring < 15; ring++) {
    const scale = 0.22 + ring * 0.035;
    const radiusX = size.x * scale;
    const radiusZ = size.z * scale * 0.7;
    for (let i = 0; i < 96; i++) {
      const a = i / 96 * Math.PI * 2;
      const b = (i + 1) / 96 * Math.PI * 2;
      const rippleA = Math.sin(a * 5 + ring * 0.8) * (1.4 + ring * 0.08);
      const rippleB = Math.sin(b * 5 + ring * 0.8) * (1.4 + ring * 0.08);
      addLakeSegment(
        center.x + Math.cos(a) * (radiusX + rippleA),
        center.z + Math.sin(a) * (radiusZ + rippleA),
        center.x + Math.cos(b) * (radiusX + rippleB),
        center.z + Math.sin(b) * (radiusZ + rippleB),
      );
    }
  }
  for (let row = -8; row <= 8; row++) {
    const z = center.z + row * size.z * 0.027;
    const halfWidth = size.x * (0.26 + Math.cos(row * 0.34) * 0.035);
    for (let i = 0; i < 28; i++) {
      const ax = center.x - halfWidth + i / 28 * halfWidth * 2;
      const bx = center.x - halfWidth + (i + 1) / 28 * halfWidth * 2;
      addLakeSegment(ax, z + Math.sin(i * 0.9 + row) * 0.8, bx, z + Math.sin((i + 1) * 0.9 + row) * 0.8);
    }
  }
  const lakeMaterial = new THREE.LineBasicMaterial({ color: 0x65d7dd, transparent: true, opacity: 0.32, depthWrite: false });
  wireMaterials.push(lakeMaterial);
  const lake = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(lakePositions, 3)),
    lakeMaterial,
  );
  lake.name = "quiet-lake-wire-water";
  stageGroup.add(lake);
}

function addWireEnvironment() {
  if (stage.id === "quiet-lake") {
    addQuietLakeEnvironment();
    landmarkRing = null;
    return;
  }
  const city = new THREE.Group();
  const cyan = new THREE.LineBasicMaterial({ color: 0x70f2ff, transparent: true, opacity: 0.46 });
  const violet = new THREE.LineBasicMaterial({ color: 0xc997ff, transparent: true, opacity: 0.38 });
  wireMaterials.push(cyan, violet);
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
  stageGroup.add(city);

  for (let i = 0; i < 32; i++) {
    const f = trackFrame(i / 32);
    const gate = new THREE.Group();
    const material = new THREE.LineBasicMaterial({ color: i % 3 === 0 ? 0xff6a95 : 0x75f3ff, transparent: true, opacity: 0.55 });
    const glowMaterial = new THREE.LineBasicMaterial({ color: i % 3 === 0 ? 0xff4e82 : 0x48eaff, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false });
    gateMaterials.push(material);
    for (const side of [-1, 1]) {
      const pillar = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.16, 5.5, 0.16)), material);
      pillar.position.copy(f.point).addScaledVector(f.right, side * 8.5).addScaledVector(f.normal, 2.75);
      pillar.quaternion.setFromUnitVectors(up, f.normal);
      gate.add(pillar);
    }
    const top = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(17, 0.14, 0.14)), material);
    top.position.copy(f.point).addScaledVector(f.normal, 5.45);
    top.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(f.right, f.normal, f.tangent));
    gate.add(top);
    const glow = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(18.2, 6.4, 0.5)), glowMaterial);
    markEffect(glow, "glow", `gate-glow-${i}`);
    glow.position.copy(f.point).addScaledVector(f.normal, 3.2);
    glow.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(f.right, f.normal, f.tangent));
    gate.add(glow);
    stageGroup.add(gate);
  }

  const towerMat = new THREE.LineBasicMaterial({ color: 0xff4f86, transparent: true, opacity: 0.62 });
  const tower = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.CylinderGeometry(8, 20, 150, 6, 5)), towerMat);
  tower.position.set(230, 74, -310);
  stageGroup.add(tower);
  landmarkRing = new THREE.Mesh(
    new THREE.TorusGeometry(54, 0.8, 4, 48),
    new THREE.MeshBasicMaterial({ color: 0x66ecff, wireframe: true, transparent: true, opacity: 0.72, blending: THREE.AdditiveBlending }),
  );
  markEffect(landmarkRing, "glow", "landmark-glow-ring");
  landmarkRing.position.set(-320, 72, 230);
  landmarkRing.rotation.x = Math.PI * 0.4;
  stageGroup.add(landmarkRing);
}

function addAdvancedEnvironment() {
  if (stage.id !== "blue-neon-shift") return;

  const addWireBox = (group: THREE.Group, width: number, height: number, depth: number, color: number, opacity = 0.78) => {
    const wire = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(width, height, depth)),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending }),
    );
    group.add(wire);
    return wire;
  };

  const citySections: [number, number][] = [[0.015, 0.19], [0.49, 0.7], [0.78, 0.91]];
  let buildingIndex = 0;
  for (const [start, end] of citySections) {
    const count = Math.round((end - start) * 120);
    for (let i = 0; i < count; i++) {
      const u = THREE.MathUtils.lerp(start, end, i / Math.max(1, count - 1));
      const f = trackFrame(u);
      for (const side of [-1, 1]) {
        const seed = buildingIndex * 17 + (side > 0 ? 11 : 3);
        const width = 5 + (seed * 7 % 9);
        const depth = 5 + (seed * 13 % 11);
        const height = 12 + (seed * 19 % 38);
        const offset = TRACK_WIDTH * 0.5 + 7 + (seed * 5 % 12);
        const building = new THREE.Group();
        building.position.copy(f.point).addScaledVector(f.right, side * offset);
        building.position.y += height * 0.5 - 0.4;
        building.rotation.y = Math.atan2(f.tangent.x, f.tangent.z);
        addWireBox(building, width, height, depth, [0x53efff, 0xff4f9b, 0x8d74ff, 0xffd65a][seed % 4], 0.82);
        const latticeLevels = Math.max(3, Math.floor(height / 6));
        for (let level = 0; level < latticeLevels; level++) {
          const y = -height * 0.48 + (level + 1) * (height / (latticeLevels + 1));
          addWireBox(building, width * 0.82, 0.12, depth * 0.82, [0x37e8ff, 0xff3f93, 0xcab5ff, 0xf6d36a][(seed + level) % 4], 0.45);
        }
        for (let rib = 0; rib < 3; rib++) {
          const brace = new THREE.LineSegments(
            new THREE.EdgesGeometry(new THREE.BoxGeometry(width * 0.06, height * 0.94, depth * 0.06)),
            new THREE.LineBasicMaterial({
              color: seed % 2 ? 0xff5aa0 : 0x54efff,
              transparent: true,
              opacity: 0.52,
              blending: THREE.AdditiveBlending,
            }),
          );
          brace.position.set((rib - 1) * width * 0.24, 0, (seed % 3 - 1) * depth * 0.16);
          building.add(brace);
        }
        stageGroup.add(building);
      }
      buildingIndex++;
    }
  }

  const tunnelColors = [0x52efff, 0xff3d91, 0x8b7aff, 0xf8d65e];
  const tunnelStart = 0.285;
  const tunnelEnd = 0.405;
  const tunnelSegments = 34;
  for (let i = 0; i <= tunnelSegments; i++) {
    const u = THREE.MathUtils.lerp(tunnelStart, tunnelEnd, i / tunnelSegments);
    const f = trackFrame(u);
    const basis = new THREE.Matrix4().makeBasis(f.right, f.normal, f.tangent);
    const tunnelFrame = new THREE.Group();
    tunnelFrame.position.copy(f.point).addScaledVector(f.normal, 3.25);
    tunnelFrame.quaternion.setFromRotationMatrix(basis);
    for (const side of [-1, 1]) {
      const wallColumn = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(0.28, 6.7, 11.5)),
        new THREE.LineBasicMaterial({
          color: tunnelColors[(i + (side > 0 ? 2 : 0)) % tunnelColors.length],
          transparent: true,
          opacity: 0.88,
          blending: THREE.AdditiveBlending,
        }),
      );
      wallColumn.position.set(side * 6.7, -0.1, 0);
      tunnelFrame.add(wallColumn);
    }
    addWireBox(tunnelFrame, 13.8, 0.2, 11.5, tunnelColors[i % tunnelColors.length], 0.82);
    for (const side of [-1, 1]) {
      const light = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(0.2, 0.18, 9.5)),
        new THREE.LineBasicMaterial({
          color: side > 0 ? 0x52efff : 0xff3d91,
          transparent: true,
          opacity: 0.92,
          blending: THREE.AdditiveBlending,
        }),
      );
      light.position.set(side * 4.7, 2.7, 0);
      tunnelFrame.add(light);
    }
    stageGroup.add(tunnelFrame);
  }

  for (const u of [tunnelStart, tunnelEnd]) {
    const f = trackFrame(u);
    const portal = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(14.4, 7.4, 0.7)),
      new THREE.LineBasicMaterial({ color: 0x7ef6ff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending }),
    );
    portal.position.copy(f.point).addScaledVector(f.normal, 3.45);
    portal.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(f.right, f.normal, f.tangent));
    stageGroup.add(portal);
  }
}

type LapTheme = { sky: number; fog: number; grid: number; opacity: number };
type StageConfig = {
  id: string;
  name: string;
  controlPoints: [number, number, number][];
  tension: number;
  targetLengthMeters: number;
  worldToMeters: number;
  trackWidth: number;
  segments: number;
  laps: number;
  aiTopSpeedBaseKmh: number;
  bgmIndex: number;
  trackName: string;
  beatRate: number;
  themes: LapTheme[];
};

const STAGES: StageConfig[] = [{
  id: "neon-grid",
  name: "NEON GRID",
  controlPoints: [
    [-66, 0.0, -28], [66, 0.35, -28], [79, 0.75, -24], [86, 1.05, -13],
    [88, 1.2, 0], [86, 1.0, 13], [79, 0.55, 24], [66, 0.1, 28],
    [-66, -0.65, 28], [-79, -0.95, 24], [-86, -1.15, 13], [-88, -0.9, 0],
    [-86, -0.55, -13], [-79, -0.2, -24],
  ],
  tension: 0.18,
  targetLengthMeters: 2000,
  worldToMeters: 1.3,
  trackWidth: 11,
  segments: 280,
  laps: 5,
  aiTopSpeedBaseKmh: 218,
  bgmIndex: 0,
  trackName: "NEBURA DRIFTER",
  beatRate: 2.05,
  themes: [
    { sky: 0x09112c, fog: 0x09112c, grid: 0x246f91, opacity: 0.16 },
    { sky: 0x0c1836, fog: 0x0c1d39, grid: 0x3595b8, opacity: 0.36 },
    { sky: 0x1d1235, fog: 0x22143e, grid: 0x7b56c5, opacity: 0.27 },
    { sky: 0x0c281d, fog: 0x0d3027, grid: 0x38a589, opacity: 0.42 },
    { sky: 0x32101f, fog: 0x3a1020, grid: 0xc43d68, opacity: 0.5 },
  ],
}, {
  id: "ridge-helix",
  name: "RIDGE HELIX",
  controlPoints: [
    [-70, 0, -30], [-20, 2, -42], [40, 3.5, -38], [72, 2, -18], [60, 0, 6],
    [28, -2.5, 14], [34, -1.5, 34], [66, 1.5, 44], [50, 4, 62], [8, 5, 58],
    [-30, 3, 44], [-48, 0, 20], [-36, -2.5, 2], [-58, -3, -14], [-76, -1, -22],
  ],
  tension: 0.22,
  targetLengthMeters: 2400,
  worldToMeters: 1.3,
  trackWidth: 10,
  segments: 320,
  laps: 4,
  aiTopSpeedBaseKmh: 210,
  bgmIndex: 1,
  trackName: "MIDNIGHT RUN REMIX",
  beatRate: 2.18,
  themes: [
    { sky: 0x24112d, fog: 0x2d132d, grid: 0xc05b8f, opacity: 0.28 },
    { sky: 0x16102f, fog: 0x1c153b, grid: 0x745fc9, opacity: 0.35 },
    { sky: 0x0b1d31, fog: 0x102844, grid: 0x42b7cf, opacity: 0.42 },
    { sky: 0x2c0c32, fog: 0x35103d, grid: 0xec4fb0, opacity: 0.52 },
  ],
}, {
  id: "blue-neon-shift",
  name: "BLUE NEON SHIFT",
  controlPoints: [
    [-92, 0, -34], [-48, 3, -58], [12, 6, -62], [72, 4, -48],
    [98, 0, -18], [76, -4, 6], [38, -6, 0], [20, -3, 28],
    [66, 2, 42], [86, 6, 76], [42, 9, 94], [-18, 8, 84],
    [-62, 4, 62], [-78, 0, 30], [-50, -5, 10], [-88, -3, -12],
  ],
  tension: 0.2,
  targetLengthMeters: 3600,
  worldToMeters: 1.3,
  trackWidth: 9.2,
  segments: 400,
  laps: 2,
  aiTopSpeedBaseKmh: 226,
  bgmIndex: 2,
  trackName: "BLUE NEON SHIFT",
  beatRate: 2.25,
  themes: [
    { sky: 0x071531, fog: 0x081b38, grid: 0x279bd8, opacity: 0.42 },
    { sky: 0x15104a, fog: 0x171451, grid: 0x54d9ff, opacity: 0.58 },
  ],
}, {
  id: "quiet-lake",
  name: "QUIET LAKE",
  controlPoints: [
    [-112, 0, -42], [-72, 1, -66], [-24, 3, -72], [22, 2, -58],
    [58, -1, -72], [102, -3, -58], [118, 0, -26], [92, 4, -4],
    [48, 1, -16], [24, -4, 8], [66, -6, 26], [112, -2, 48],
    [94, 3, 82], [46, 7, 94], [4, 5, 72], [-28, 0, 92],
    [-72, -4, 80], [-106, -6, 52], [-78, -2, 24], [-38, 4, 42],
    [-4, 7, 24], [-32, 3, -2], [-82, -1, 2], [-122, -3, -18],
  ],
  tension: 0.12,
  targetLengthMeters: 4200,
  worldToMeters: 1.3,
  trackWidth: 8.2,
  segments: 480,
  laps: 2,
  aiTopSpeedBaseKmh: 232,
  bgmIndex: 3,
  trackName: "KAMIKAZE RUMBLE",
  beatRate: 2.25,
  themes: [
    { sky: 0x050d1a, fog: 0x071526, grid: 0x286d86, opacity: 0.3 },
    { sky: 0x0a1c22, fog: 0x0b252b, grid: 0x68c4bd, opacity: 0.46 },
  ],
}];
let stage = STAGES[0];
let oval = new THREE.CatmullRomCurve3([], true);
let TRACK_WIDTH = stage.trackWidth;
let SEGMENTS = stage.segments;
let TRACK_LENGTH_METERS = stage.targetLengthMeters;
let WORLD_TO_METERS = stage.worldToMeters;
let TOTAL_LAPS = stage.laps;
let TRACK_FLOOR_Y = -0.5;
function configureStage(config: StageConfig) {
  stage = config;
  const points = stage.controlPoints.map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const base = new THREE.CatmullRomCurve3(points, true, "catmullrom", stage.tension);
  const scale = stage.targetLengthMeters / (base.getLength() * stage.worldToMeters);
  oval = new THREE.CatmullRomCurve3(points.map(point => point.multiplyScalar(scale)), true, "catmullrom", stage.tension);
  TRACK_WIDTH = stage.trackWidth;
  SEGMENTS = stage.segments;
  TRACK_LENGTH_METERS = oval.getLength() * stage.worldToMeters;
  WORLD_TO_METERS = stage.worldToMeters;
  TOTAL_LAPS = stage.laps;
  TRACK_FLOOR_Y = Math.min(...oval.getSpacedPoints(160).map(point => point.y)) - 0.5;
}
configureStage(stage);
const MAX_SPEED_MPS = 288 / 3.6;

function trackFrame(u: number, lane = 0) {
  const wrapped = ((u % 1) + 1) % 1;
  const point = oval.getPointAt(wrapped);
  const tangent = oval.getTangentAt(wrapped).normalize();
  const right = new THREE.Vector3().crossVectors(up, tangent).normalize();
  const normal = new THREE.Vector3().crossVectors(tangent, right).normalize();
  return { point: point.addScaledVector(right, lane), tangent, right, normal };
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
      vertices.push(p.x, p.y, p.z);
      const stripe = i % 12 < 6 ? 0.105 : 0.078;
      colors.push(stripe, stripe * 1.08, stripe * 1.5);
      (side < 0 ? edgeL : edgeR).push(p.clone().addScaledVector(f.normal, 0.035));
    }
  }
  const indices: number[] = [];
  for (let i = 0; i < SEGMENTS; i++) indices.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  stageGroup.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.98, metalness: 0.05 })));

  const edgeMat = new THREE.LineBasicMaterial({ color: 0x31dcf4, transparent: true, opacity: 0.72 });
  stageGroup.add(new THREE.Line(edgeL.length ? new THREE.BufferGeometry().setFromPoints(edgeL) : new THREE.BufferGeometry(), edgeMat));
  stageGroup.add(new THREE.Line(edgeR.length ? new THREE.BufferGeometry().setFromPoints(edgeR) : new THREE.BufferGeometry(), edgeMat));

  for (let i = 0; i < 132; i++) {
    const f = trackFrame(i / 132);
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.025, 0.7, 4),
        new THREE.MeshBasicMaterial({ color: i % 2 ? 0x18a9bd : 0xd21d6c }),
      );
      post.position.copy(f.point).addScaledVector(f.right, side * 6.25).addScaledVector(f.normal, 0.35);
      post.quaternion.setFromUnitVectors(up, f.normal);
      stageGroup.add(post);
    }
  }

  const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xb7f8ff, transparent: true, opacity: 0.72 });
  const curbRed = new THREE.MeshBasicMaterial({ color: 0xff3157 });
  const curbWhite = new THREE.MeshBasicMaterial({ color: 0xd9faff });
  const addRoadBox = (u: number, lane: number, width: number, length: number, material: THREE.Material) => {
    const f = trackFrame(u, lane);
    const marker = new THREE.Mesh(new THREE.BoxGeometry(width, 0.035, length), material);
    marker.position.copy(f.point).addScaledVector(f.normal, 0.055);
    marker.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(f.right, f.normal, f.tangent));
    stageGroup.add(marker);
  };
  for (let i = 0; i < 12; i++) addRoadBox(0.002 + i * 0.0008, (i - 5.5) * TRACK_WIDTH / 12, TRACK_WIDTH / 13, 0.42, i % 2 ? curbRed : curbWhite);
  for (let section = 0; section < 8; section++) {
    const u = section / 8 + 0.071;
    for (let row = 0; row < 3; row++) {
      const offset = (row - 1) * 1.25;
      addRoadBox(u + row * 0.0016, offset - 0.6, 0.18, 2.2, markerMaterial);
      addRoadBox(u + row * 0.0016, offset + 0.6, 0.18, 2.2, markerMaterial);
    }
  }
  for (let i = 0; i < 72; i++) {
    const u = i / 72;
    for (const side of [-1, 1]) addRoadBox(u, side * (TRACK_WIDTH * 0.5 - 0.24), 0.44, 1.6, i % 2 ? curbRed : curbWhite);
  }
}
makeRoad();
addWireEnvironment();
addAdvancedEnvironment();

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(3000, 3000),
  new THREE.MeshBasicMaterial({ color: 0x070b1c }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = TRACK_FLOOR_Y;
stageGroup.add(floor);
const grid = new THREE.GridHelper(2200, 110, 0x31dff4, 0x174b69);
grid.position.y = TRACK_FLOOR_Y + 0.04;
const gridMaterials = (Array.isArray(grid.material) ? grid.material : [grid.material]) as THREE.LineBasicMaterial[];
gridMaterials.forEach(material => {
  material.transparent = true;
  material.opacity = 0.16;
  material.depthWrite = false;
});
stageGroup.add(grid);

const starGeo = new THREE.BufferGeometry();
const starPos: number[] = [];
for (let i = 0; i < 260; i++) {
  const a = Math.random() * Math.PI * 2;
  const r = 650 + Math.random() * 700;
  starPos.push(Math.cos(a) * r, 8 + Math.random() * 42, Math.sin(a) * r);
}
starGeo.setAttribute("position", new THREE.Float32BufferAttribute(starPos, 3));
const starMaterial = new THREE.PointsMaterial({ color: 0x9ac7ff, size: 1.15, transparent: true, opacity: 0.55 });
const stars = markEffect(new THREE.Points(starGeo, starMaterial), "particles", "background-stars");
scene.add(stars);
const finalRings = new THREE.Group();
const finalRingMaterials: THREE.MeshBasicMaterial[] = [];
for (let i = 0; i < 3; i++) {
  const material = new THREE.MeshBasicMaterial({
    color: 0xff3f7c,
    wireframe: true,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(190 + i * 92, 0.5 + i * 0.18, 4, 80), material);
  markEffect(ring, "glow", `final-glow-ring-${i}`);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 16 + i * 18;
  finalRingMaterials.push(material);
  finalRings.add(ring);
}
scene.add(finalRings);

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
  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
})();
const tailSpillTexture = (() => {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = textureCanvas.height = 128;
  const context = textureCanvas.getContext("2d")!;
  const gradient = context.createRadialGradient(64, 38, 2, 64, 52, 68);
  gradient.addColorStop(0, "rgba(255,225,225,.92)");
  gradient.addColorStop(0.12, "rgba(255,55,85,.56)");
  gradient.addColorStop(0.42, "rgba(255,25,62,.18)");
  gradient.addColorStop(0.72, "rgba(185,8,38,.045)");
  gradient.addColorStop(1, "rgba(90,0,20,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
})();
const smokeParticles: SmokeParticle[] = Array.from({ length: 34 }, () => {
  const material = new THREE.SpriteMaterial({ map: smokeTexture, transparent: true, opacity: 0, depthWrite: false, blending: safeBlending, alphaTest: 0.02 });
  const sprite = new THREE.Sprite(material);
  sprite.name = "drift-smoke-sprite";
  sprite.userData.effectGroup = "particles";
  sprite.visible = false;
  scene.add(sprite);
  return { sprite, velocity: new THREE.Vector3(), life: 0, maxLife: 1 };
});
let smokeCursor = 0;
let lastSmokeEmit = 0;

type FireworkParticle = { index: number; position: THREE.Vector3; velocity: THREE.Vector3; color: THREE.Color; size: number; life: number; maxLife: number; rocket: boolean };
const FIREWORK_PARTICLE_COUNT = 700;
const fireworkPositions = new Float32Array(FIREWORK_PARTICLE_COUNT * 3);
const fireworkColors = new Float32Array(FIREWORK_PARTICLE_COUNT * 3);
const fireworkSizes = new Float32Array(FIREWORK_PARTICLE_COUNT);
const fireworkAlphas = new Float32Array(FIREWORK_PARTICLE_COUNT);
const fireworkGeometry = new THREE.BufferGeometry();
fireworkGeometry.setAttribute("position", new THREE.BufferAttribute(fireworkPositions, 3));
fireworkGeometry.setAttribute("color", new THREE.BufferAttribute(fireworkColors, 3));
fireworkGeometry.setAttribute("aSize", new THREE.BufferAttribute(fireworkSizes, 1));
fireworkGeometry.setAttribute("aAlpha", new THREE.BufferAttribute(fireworkAlphas, 1));
const fireworkMaterial = new THREE.ShaderMaterial({
  vertexShader: `attribute float aSize;attribute float aAlpha;attribute vec3 color;varying float vAlpha;varying vec3 vColor;void main(){vec4 mv=modelViewMatrix*vec4(position,1.0);vAlpha=aAlpha;vColor=color;gl_PointSize=aSize*(260.0/max(1.0,-mv.z));gl_Position=projectionMatrix*mv;}`,
  fragmentShader: `varying float vAlpha;varying vec3 vColor;void main(){float d=length(gl_PointCoord-vec2(.5));float glow=smoothstep(.5,0.0,d);float alpha=glow*glow*vAlpha;if(alpha<.01)discard;gl_FragColor=vec4(vColor,alpha);}`,
  transparent: true,
  depthWrite: false,
  blending: safeBlending,
  vertexColors: true,
});
const fireworkPoints = new THREE.Points(fireworkGeometry, fireworkMaterial);
markEffect(fireworkPoints, "particles", "firework-points");
fireworkPoints.frustumCulled = false;
scene.add(fireworkPoints);
const fireworkParticles: FireworkParticle[] = Array.from({ length: 700 }, (_, i) => {
  const color = new THREE.Color([0xff4878, 0x51eaff, 0xffd45a, 0xb36cff][i % 4]);
  color.toArray(fireworkColors, i * 3);
  return { index: i, position: new THREE.Vector3(), velocity: new THREE.Vector3(), color, size: 0, life: 0, maxLife: 1, rocket: false };
});
let fireworkCursor = 0;
let lastFirework = 0;
let finalLapFireworkCount = 0;
let lastTouchEnd = 0;

function makeCarSection(
  frontZ: number,
  rearZ: number,
  bottomY: number,
  topY: number,
  frontBottomHalfWidth: number,
  rearBottomHalfWidth: number,
  frontTopHalfWidth: number,
  rearTopHalfWidth: number,
) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([
    -frontBottomHalfWidth, bottomY, frontZ, frontBottomHalfWidth, bottomY, frontZ,
    -frontTopHalfWidth, topY, frontZ, frontTopHalfWidth, topY, frontZ,
    -rearBottomHalfWidth, bottomY, rearZ, rearBottomHalfWidth, bottomY, rearZ,
    -rearTopHalfWidth, topY, rearZ, rearTopHalfWidth, topY, rearZ,
  ], 3));
  geometry.setIndex([
    0, 1, 3, 0, 3, 2,
    5, 4, 6, 5, 6, 7,
    4, 0, 2, 4, 2, 6,
    1, 5, 7, 1, 7, 3,
    2, 3, 7, 2, 7, 6,
    4, 5, 1, 4, 1, 0,
  ]);
  geometry.computeVertexNormals();
  return geometry;
}

function mergeCarBodyParts(car: THREE.Group) {
  const groups = new Map<THREE.Material, THREE.Mesh[]>();
  for (const child of [...car.children]) {
    if (!(child instanceof THREE.Mesh) || Array.isArray(child.material)) continue;
    const material = child.material;
    if (material.transparent || material instanceof THREE.ShaderMaterial || "map" in material && material.map) continue;
    const group = groups.get(material) ?? [];
    group.push(child);
    groups.set(material, group);
  }
  for (const [material, meshes] of groups) {
    if (meshes.length < 2) continue;
    const geometries = meshes.map(mesh => {
      mesh.updateMatrix();
      const geometry = mesh.geometry.clone().toNonIndexed();
      geometry.applyMatrix4(mesh.matrix);
      for (const name of Object.keys(geometry.attributes)) {
        if (name !== "position" && name !== "normal") geometry.deleteAttribute(name);
      }
      if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
      return geometry;
    });
    const merged = mergeGeometries(geometries, false);
    geometries.forEach(geometry => geometry.dispose());
    if (!merged) continue;
    meshes.forEach(mesh => {
      car.remove(mesh);
      mesh.geometry.dispose();
    });
    car.add(new THREE.Mesh(merged, material));
  }
}

type CarType = "grip" | "drift";
type CarModel = "simple" | "detailed";

function makeDetailedCar(bodyColor: number, rival = false, carType: CarType = "grip") {
  const car = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.34, metalness: 0.68, flatShading: true });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x09131d, roughness: 0.5, metalness: 0.72, flatShading: true });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x163f5e, roughness: 0.18, metalness: 0.72, flatShading: true });
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x080a0d, roughness: 0.9, metalness: 0.08, flatShading: true });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0x8da4b0, roughness: 0.3, metalness: 0.9, flatShading: true });
  const darkMat = new THREE.MeshBasicMaterial({ color: 0x020507 });
  const brakeMat = new THREE.MeshStandardMaterial({ color: rival ? 0xff405c : 0x39dff5, roughness: 0.4, metalness: 0.5, flatShading: true });

  car.add(new THREE.Mesh(makeCarSection(1.78, -1.72, 0.23, 0.57, 0.69, 0.79, 0.87, 0.9), bodyMat));
  car.add(new THREE.Mesh(makeCarSection(1.72, 0.82, 0.56, 0.67, 0.79, 0.88, 0.58, 0.79), bodyMat));
  car.add(new THREE.Mesh(makeCarSection(0.82, 0.17, 0.57, 0.72, 0.88, 0.88, 0.79, 0.8), bodyMat));
  car.add(new THREE.Mesh(makeCarSection(-0.72, -1.68, 0.56, 0.73, 0.88, 0.77, 0.82, 0.7), bodyMat));

  const cabin = new THREE.Mesh(makeCarSection(0.23, -1.08, 0.7, 1.12, 0.74, 0.77, 0.49, 0.59), glassMat);
  car.add(cabin);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.055, 0.77), bodyMat);
  roof.position.set(0, 1.14, -0.43);
  car.add(roof);
  const rearHatch = new THREE.Mesh(makeCarSection(-0.7, -1.34, 0.72, 0.88, 0.8, 0.72, 0.66, 0.61), glassMat);
  car.add(rearHatch);
  for (const x of [-0.57, 0.57]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.42, 0.08), trimMat);
    pillar.position.set(x, 0.89, -0.46);
    pillar.rotation.x = -0.04;
    car.add(pillar);

    const mirrorStem = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.055, 0.08), trimMat);
    mirrorStem.position.set(x > 0 ? 0.79 : -0.79, 0.82, 0.23);
    car.add(mirrorStem);
    const mirror = new THREE.Mesh(makeCarSection(0.34, 0.17, 0.78, 0.88, 0.13, 0.13, 0.1, 0.1), bodyMat);
    mirror.position.x = x > 0 ? 0.84 : -0.84;
    car.add(mirror);
  }

  for (const z of [-0.9, 1.03]) {
    for (const x of [-0.94, 0.94]) {
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.25, 16), tireMat);
      tire.rotation.z = Math.PI / 2;
      tire.position.set(x, 0.34, z);
      car.add(tire);
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.265, 12), rimMat);
      rim.rotation.z = Math.PI / 2;
      rim.position.set(x, 0.34, z);
      car.add(rim);
      const brake = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.125, 0.272, 12), brakeMat);
      brake.rotation.z = Math.PI / 2;
      brake.position.set(x, 0.34, z);
      car.add(brake);
    }
  }

  for (const x of [-0.94, 0.94]) {
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 2.45), trimMat);
    skirt.position.set(x, 0.27, 0);
    car.add(skirt);
    for (const z of [-0.9, 1.03]) {
      const fender = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.18, 0.78), bodyMat);
      fender.position.set(x, 0.61, z);
      car.add(fender);
    }
    const sideIntake = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.24, 0.64), darkMat);
    sideIntake.position.set(x, 0.61, -0.48);
    car.add(sideIntake);
  }

  const stripeMat = new THREE.MeshBasicMaterial({ color: rival ? 0xffd744 : 0xf0f3e9 });
  for (const x of [-0.16, 0.16]) {
    const hoodStripe = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.014, 1.28), stripeMat);
    hoodStripe.position.set(x, 0.7, 0.92);
    hoodStripe.rotation.x = -0.035;
    car.add(hoodStripe);
    const roofStripe = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.014, 0.7), stripeMat);
    roofStripe.position.set(x, 1.175, -0.42);
    car.add(roofStripe);
  }
  const splitter = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.09, 0.38), trimMat);
  splitter.position.set(0, 0.22, 1.68);
  car.add(splitter);
  const rearDiffuser = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.18, 0.3), trimMat);
  rearDiffuser.position.set(0, 0.29, -1.7);
  car.add(rearDiffuser);
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.16, 0.025), darkMat);
  grille.position.set(0, 0.4, 1.805);
  car.add(grille);
  for (const x of [-0.5, 0.5]) {
    const intake = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.1, 0.03), darkMat);
    intake.position.set(x, 0.34, 1.81);
    car.add(intake);
    const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.18, 10), trimMat);
    exhaust.rotation.x = Math.PI / 2;
    exhaust.position.set(x, 0.3, -1.85);
    car.add(exhaust);
  }

  const wing = new THREE.Mesh(new THREE.BoxGeometry(rival ? 1.72 : 1.66, 0.075, 0.38), trimMat);
  wing.position.set(0, rival ? 1.1 : 1.05, -1.45);
  wing.rotation.x = -0.08;
  car.add(wing);
  for (const x of [-0.48, 0.48]) {
    const wingStay = new THREE.Mesh(new THREE.BoxGeometry(0.06, rival ? 0.45 : 0.4, 0.08), trimMat);
    wingStay.position.set(x, rival ? 0.88 : 0.85, -1.45);
    car.add(wingStay);
  }

  const rearPanel = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.29, 0.07), darkMat);
  rearPanel.position.set(0, 0.55, -1.765);
  car.add(rearPanel);
  const tailCoreMaterials: THREE.SpriteMaterial[] = [];
  const tailHaloMaterials: THREE.SpriteMaterial[] = [];
  const tailSprites: THREE.Sprite[] = [];
  for (const x of [-0.61, -0.39, -0.17, 0.17, 0.39, 0.61]) {
    const housing = new THREE.Mesh(
      new THREE.BoxGeometry(0.17, 0.115, 0.045),
      new THREE.MeshBasicMaterial({ color: useMobileSafe ? 0xff2244 : 0x5b0716 }),
    );
    housing.name = "taillight-basic-core";
    housing.position.set(x, 0.57, -1.815);
    car.add(housing);
    const haloMaterial = new THREE.SpriteMaterial({
      map: smokeTexture,
      color: 0xff2349,
      blending: safeBlending,
      transparent: true,
      opacity: rival ? 0.18 : 0.15,
      depthWrite: false,
      alphaTest: 0.02,
    });
    const halo = new THREE.Sprite(haloMaterial);
    halo.name = "taillight-glow-sprite";
    halo.userData.effectGroup = "glow";
    halo.userData.requiresTexture = true;
    halo.position.set(x, 0.57, -1.855);
    halo.scale.setScalar(0.72);
    halo.visible = !disableSprites && !disableGlow;
    car.add(halo);
    const coreMaterial = new THREE.SpriteMaterial({
      map: smokeTexture,
      color: 0xffe0e4,
      blending: safeBlending,
      transparent: true,
      opacity: rival ? 0.72 : 0.62,
      depthWrite: false,
      alphaTest: 0.02,
    });
    const core = new THREE.Sprite(coreMaterial);
    core.name = "taillight-core-sprite";
    core.userData.effectGroup = "glow";
    core.userData.requiresTexture = true;
    core.position.set(x, 0.57, -1.87);
    core.scale.setScalar(0.22);
    core.visible = !disableSprites && !disableGlow;
    car.add(core);
    tailCoreMaterials.push(coreMaterial);
    tailHaloMaterials.push(haloMaterial);
    tailSprites.push(halo, core);
  }
  const spillMaterial = new THREE.MeshBasicMaterial({
    map: tailSpillTexture,
    color: 0xff183d,
    blending: safeBlending,
    transparent: true,
    opacity: 0.08,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const tailSpill = new THREE.Mesh(
    new THREE.PlaneGeometry(2.8, 4.2),
    spillMaterial,
  );
  markEffect(tailSpill, "bleed", "taillight-ground-bleed");
  tailSpill.userData.requiresTexture = true;
  tailSpill.position.set(0, 0.045, -2.85);
  tailSpill.rotation.x = -Math.PI / 2;
  tailSpill.visible = !disableBleed;
  car.add(tailSpill);
  car.userData.tailLights = { coreMaterials: tailCoreMaterials, haloMaterials: tailHaloMaterials, sprites: tailSprites, spillMaterial, intensity: 0.45, rival };

  for (const x of [-0.57, 0.57]) {
    const headlampHousing = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.055, 0.25), trimMat);
    headlampHousing.position.set(x, 0.67, 1.35);
    headlampHousing.rotation.x = -0.035;
    car.add(headlampHousing);
    const hoodLamp = new THREE.Mesh(
      new THREE.BoxGeometry(0.38, 0.025, 0.17),
      new THREE.MeshBasicMaterial({ color: 0xbffaff }),
    );
    hoodLamp.position.set(x, 0.704, 1.36);
    hoodLamp.rotation.x = -0.035;
    car.add(hoodLamp);
    const headlamp = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.07, 0.055),
      new THREE.MeshBasicMaterial({ color: 0xbffaff }),
    );
    headlamp.position.set(x, 0.47, 1.795);
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
        blending: safeBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    markEffect(beam, "glow", "headlight-glow-plane");
    beam.visible = !disableGlow;
    car.add(beam);
  }
  if (carType === "grip") {
    const roofFin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.68), trimMat);
    roofFin.position.set(0, 1.28, -0.58);
    roofFin.rotation.x = -0.12;
    car.add(roofFin);
    car.scale.set(0.96, 1.04, 1);
  } else if (carType === "drift") {
    const aeroMat = new THREE.MeshBasicMaterial({ color: rival ? 0xffd744 : 0xff3157 });
    for (const x of [-1.02, 1.02]) {
      const canard = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.045, 0.44), aeroMat);
      canard.position.set(x, 0.25, 1.52);
      canard.rotation.y = x < 0 ? -0.24 : 0.24;
      car.add(canard);
    }
    const driftWing = new THREE.Mesh(new THREE.BoxGeometry(2.12, 0.055, 0.46), aeroMat);
    driftWing.position.set(0, 1.28, -1.5);
    driftWing.rotation.x = -0.12;
    car.add(driftWing);
    car.scale.set(1.08, 0.92, 1.04);
  }
  car.userData.carType = carType;
  mergeCarBodyParts(car);
  return car;
}

function makeCar(bodyColor: number, rival = false, carType: CarType = "grip") {
  const car = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.38, metalness: 0.58, flatShading: true });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x101928, roughness: 0.2, metalness: 0.48, flatShading: true });
  const darkMat = new THREE.MeshBasicMaterial({ color: 0x08090c });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0x7e858b, roughness: 0.45, metalness: 0.65, flatShading: true });
  const accentMat = new THREE.MeshBasicMaterial({ color: rival ? 0xffd744 : carType === "drift" ? 0xffffff : 0x52efff });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2244 });

  car.add(new THREE.Mesh(makeCarSection(1.82, -1.72, 0.22, 0.6, 0.68, 0.77, 0.89, 0.88), bodyMat));
  car.add(new THREE.Mesh(makeCarSection(1.7, 0.38, 0.57, 0.72, 0.86, 0.88, 0.64, 0.78), bodyMat));
  car.add(new THREE.Mesh(makeCarSection(0.34, -1.22, 0.66, 1.18, 0.77, 0.78, 0.48, 0.58), glassMat));
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.06, 0.7), bodyMat);
  roof.position.set(0, 1.2, -0.48);
  car.add(roof);

  const bumper = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.13, 0.22), darkMat);
  bumper.position.set(0, 0.25, 1.76);
  car.add(bumper);
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.15, 0.03), darkMat);
  grille.position.set(0, 0.4, 1.88);
  car.add(grille);

  for (const x of [-0.54, 0.54]) {
    const headlight = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.12, 0.04), new THREE.MeshBasicMaterial({ color: 0xc9f8ff }));
    headlight.position.set(x, 0.58, 1.84);
    car.add(headlight);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.13, 0.04), tailMat);
    tail.position.set(x, 0.57, -1.76);
    car.add(tail);
  }

  for (const z of [-0.92, 1.02]) {
    for (const x of [-0.91, 0.91]) {
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.24, 12), darkMat);
      tire.rotation.z = Math.PI / 2;
      tire.position.set(x, 0.34, z);
      car.add(tire);
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.25, 8), rimMat);
      rim.rotation.z = Math.PI / 2;
      rim.position.set(x, 0.34, z);
      car.add(rim);
    }
  }

  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.018, 1.12), accentMat);
  stripe.position.set(0, 0.72, 1.02);
  car.add(stripe);
  const wingWidth = carType === "drift" ? 2.28 : 1.82;
  const wing = new THREE.Mesh(new THREE.BoxGeometry(wingWidth, 0.075, carType === "drift" ? 0.48 : 0.34), darkMat);
  wing.position.set(0, carType === "drift" ? 1.24 : 1.04, -1.42);
  car.add(wing);
  for (const x of [-0.48, 0.48]) {
    const stayHeight = carType === "drift" ? 0.54 : 0.3;
    const stay = new THREE.Mesh(new THREE.BoxGeometry(0.065, stayHeight, 0.08), darkMat);
    stay.position.set(x, carType === "drift" ? 0.96 : 0.88, -1.42);
    car.add(stay);
  }
  if (carType === "drift") {
    car.scale.set(1.05, 0.94, 1.03);
  }

  const spillMaterial = new THREE.MeshBasicMaterial({ color: 0xff183d, transparent: true, opacity: 0, depthWrite: false });
  car.userData.tailLights = { coreMaterials: [], haloMaterials: [], sprites: [], spillMaterial, intensity: 0.45, rival, solidMaterials: [tailMat] };
  car.userData.carType = carType;
  mergeCarBodyParts(car);
  return car;
}

let selectedCarType: CarType = "grip";
let playerCar = makeCar(0x0a5164, false, selectedCarType);
scene.add(playerCar);
const ghostCar = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.82, 0.72, 3.25)),
  new THREE.LineBasicMaterial({ color: 0x72efff, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending }),
);
ghostCar.visible = false;
scene.add(ghostCar);
type Rival = { car: THREE.Group; carType: CarType; carModel: CarModel; progress: number; lane: number; speedMps: number; topSpeedMps: number; acceleration: number; phase: number; tailIntensity: number };
const rivalColors = [0xe0b321, 0x6d3fb5, 0x2767c7, 0xc43d78, 0x2b9a67, 0xd66a24, 0xaeb8c2];
const rivalCarTypes: CarType[] = ["drift", "drift", "grip", "grip", "drift", "drift", "grip"];
const rivalCarModels: CarModel[] = ["simple", "detailed", "simple", "detailed", "simple", "detailed", "simple"];
const rivals: Rival[] = rivalColors.map((color, i) => {
  const carType = rivalCarTypes[i];
  const carModel = rivalCarModels[i];
  const car = carModel === "detailed" ? makeDetailedCar(color, true, carType) : makeCar(color, true, carType);
  scene.add(car);
  return {
    car,
    carType,
    carModel,
    progress: 0.045 - i * 0.014,
    lane: (i % 2 ? 1 : -1) * (0.65 + (i % 3) * 0.65),
    speedMps: 0,
    topSpeedMps: (stage.aiTopSpeedBaseKmh + (i % 4) * 7 + Math.floor(i / 4) * 4) / 3.6,
    acceleration: 5.1 + (i % 3) * 0.42,
    phase: i * 1.7,
    tailIntensity: 0.45,
  };
});

type TrailSample = { left: THREE.Vector3; right: THREE.Vector3; tangent: THREE.Vector3; normal: THREE.Vector3; born: number; strength?: number };
const samples: TrailSample[] = [];
const playerSamples: TrailSample[] = [];
const rivalTailSamples: TrailSample[][] = rivals.map(() => []);
const TRAIL_LIFE = 1.38;
const PLAYER_TRAIL_LIFE = 0.46;
const RIVAL_TAIL_LIFE = 0.28;
const trailMaterial = new THREE.ShaderMaterial({
  uniforms: { tint: { value: new THREE.Color(0xff193c) } },
  vertexShader: `attribute float aAlpha; varying float vAlpha; void main(){vAlpha=aAlpha;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
  fragmentShader: `uniform vec3 tint; varying float vAlpha; void main(){float soft=sin(vAlpha*1.5708);gl_FragColor=vec4(tint,soft*vAlpha);}`,
  transparent: true, depthWrite: false, blending: safeBlending, side: THREE.DoubleSide,
});
const bleedMaterial = trailMaterial.clone();
bleedMaterial.uniforms.tint.value = new THREE.Color(0xb80b24);
const playerTrailMaterial = trailMaterial.clone();
playerTrailMaterial.uniforms.tint.value = new THREE.Color(0xff2445);
const playerBleedMaterial = trailMaterial.clone();
playerBleedMaterial.uniforms.tint.value = new THREE.Color(0x9d0b20);

function makeTrailMesh(material: THREE.Material, group: "trail" | "bleed", name: string) {
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
  markEffect(mesh, group, name);
  mesh.frustumCulled = false;
  scene.add(mesh);
  return mesh;
}
const mainLeft = makeTrailMesh(trailMaterial, "trail", "lead-tail-trail-left");
const mainRight = makeTrailMesh(trailMaterial, "trail", "lead-tail-trail-right");
const bleedLeft = makeTrailMesh(bleedMaterial, "bleed", "lead-ground-bleed-left");
const bleedRight = makeTrailMesh(bleedMaterial, "bleed", "lead-ground-bleed-right");
const playerMainLeft = makeTrailMesh(playerTrailMaterial, "trail", "player-tail-trail-left");
const playerMainRight = makeTrailMesh(playerTrailMaterial, "trail", "player-tail-trail-right");
const playerBleedLeft = makeTrailMesh(playerBleedMaterial, "bleed", "player-ground-bleed-left");
const playerBleedRight = makeTrailMesh(playerBleedMaterial, "bleed", "player-ground-bleed-right");
const rivalTailMeshes = rivals.map((_, i) => ({
  left: makeTrailMesh(trailMaterial.clone(), "trail", `rival-${i}-tail-trail-left`),
  right: makeTrailMesh(trailMaterial.clone(), "trail", `rival-${i}-tail-trail-right`),
}));

function objectMaterials(object: THREE.Object3D) {
  const material = (object as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
  return material ? Array.isArray(material) ? material : [material] : [];
}

function patchEffectTexturesAndVisibility() {
  scene.traverse(object => {
    const group = object.userData.effectGroup as "glow" | "trail" | "bleed" | "particles" | undefined;
    if (disableSprites && object instanceof THREE.Sprite) object.visible = false;
    if (disableGlow && group === "glow") object.visible = false;
    if (disableTrail && group === "trail") object.visible = false;
    if (disableBleed && group === "bleed") object.visible = false;
    if (disableParticles && group === "particles") object.visible = false;
    const materials = objectMaterials(object);
    for (const material of materials) {
      const textures = Object.values(material).filter((value): value is THREE.Texture => value instanceof THREE.Texture);
      if (group || object instanceof THREE.Sprite) {
        for (const texture of textures) {
          texture.wrapS = THREE.ClampToEdgeWrapping;
          texture.wrapT = THREE.ClampToEdgeWrapping;
          texture.minFilter = THREE.LinearFilter;
          texture.magFilter = THREE.LinearFilter;
          texture.generateMipmaps = false;
          texture.needsUpdate = true;
        }
      }
      if (useMobileSafe && group && material.transparent) {
        if ("color" in material && material.color instanceof THREE.Color && material.color.getHex() === 0xffffff) material.color.setHex(0xff2244);
        material.opacity = THREE.MathUtils.clamp(material.opacity, 0, 0.98);
        material.depthWrite = false;
      }
      if ((object instanceof THREE.Sprite || object.userData.requiresTexture) && !("map" in material && material.map instanceof THREE.Texture)) {
        object.visible = false;
        console.warn("Hidden object with missing texture", object.name || object.type);
      }
    }
  });
}

patchEffectTexturesAndVisibility();

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
  if (reducedEffects || disableTrail && !bleed || disableBleed && bleed) {
    mesh.visible = false;
    return;
  }
  const positions: number[] = [];
  const alphas: number[] = [];
  const indices: number[] = [];
  const usable = source.filter(s => now - s.born < life && finite(s.left) && finite(s.right) && finite(s.tangent) && finite(s.normal) && s.tangent.lengthSq() > 1e-8 && s.normal.lengthSq() > 1e-8);
  const safeWidth = THREE.MathUtils.clamp(Number.isFinite(width) ? width : 0, 0.01, 1);
  let validPointCount = 0;
  for (let i = 0; i < usable.length; i++) {
    const s = usable[i];
    const age = Math.min(1, (now - s.born) / life);
    const fadePower = bleed ? 3.2 : 2.65;
    const alpha = THREE.MathUtils.clamp(Math.pow(1 - age, fadePower) * (bleed ? 0.18 : 0.72) * strength * (s.strength ?? 1), 0, 1);
    const center = s[side].clone();
    if (bleed) center.addScaledVector(s.normal, -0.535);
    const across = new THREE.Vector3().crossVectors(s.normal, s.tangent);
    if (!finite(center) || !finite(across) || across.lengthSq() < 1e-8) continue;
    across.normalize().multiplyScalar(safeWidth * 0.5);
    const values = [center.x - across.x, center.y, center.z - across.z, center.x + across.x, center.y, center.z + across.z];
    positions.push(...values.map(value => Number.isFinite(value) ? value : 0));
    alphas.push(alpha, alpha);
    if (validPointCount > 0) {
      const n = validPointCount * 2;
      indices.push(n - 2, n - 1, n, n - 1, n + 1, n);
    }
    validPointCount++;
  }
  if (positions.length < 12) {
    mesh.visible = false;
    return;
  }
  mesh.visible = true;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aAlpha", new THREE.Float32BufferAttribute(alphas, 1));
  geometry.setIndex(indices);
  mesh.geometry.dispose();
  mesh.geometry = geometry;
}

function updateTailLights(car: THREE.Group, targetIntensity: number, dt: number, distanceScale = 1) {
  const lights = car.userData.tailLights as {
    coreMaterials: THREE.SpriteMaterial[];
    haloMaterials: THREE.SpriteMaterial[];
    sprites: THREE.Sprite[];
    spillMaterial: THREE.MeshBasicMaterial;
    solidMaterials?: THREE.MeshBasicMaterial[];
    intensity: number;
    rival: boolean;
  } | undefined;
  if (!lights) return;
  lights.intensity = THREE.MathUtils.lerp(lights.intensity, targetIntensity, 1 - Math.pow(0.001, dt));
  const intensity = lights.intensity;
  lights.coreMaterials.forEach(material => { material.opacity = (lights.rival ? 0.66 : 0.58) * intensity; });
  lights.haloMaterials.forEach(material => { material.opacity = (lights.rival ? 0.24 : 0.2) * intensity; });
  lights.sprites.forEach((sprite, index) => {
    const base = index % 2 === 0 ? 0.72 : 0.22;
    const brakeGrowth = index % 2 === 0 ? 0.34 : 0.16;
    sprite.scale.setScalar((base + brakeGrowth * intensity) * distanceScale);
  });
  lights.solidMaterials?.forEach(material => {
    material.color.setRGB(1, 0.035 + intensity * 0.12, 0.07 + intensity * 0.1);
  });
  lights.spillMaterial.opacity = 0.035 + intensity * 0.11;
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
let paused = false;
let pauseStarted = 0;
let resumeBgm = false;
let resumeFinishBgm = false;
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
let playerTailIntensity = 0.45;
let lastEmit = 0;
let lastPlayerEmit = 0;
let lastReplayCapture = 0;
let lastRivalCollision = -10;
type ReplayFrame = { time: number; progress: number; lane: number; lateralVelocity: number; yawError: number; yawRate: number };
const replayFrames: ReplayFrame[] = [];
type GhostFrame = { time: number; progress: number; lane: number; yaw: number };
type BestLap = { duration: number; frames: GhostFrame[] };
let bestLap: BestLap | null = null;
let lapFrames: GhostFrame[] = [];
let lapStartedAt = 0;
let wasOffRoad = false;
let previousDriftState: "grip" | "entry" | "hold" | "recovery" = "grip";
const title = document.querySelector("#title")!;
const courseSelect = document.querySelector<HTMLElement>("#courseSelect")!;
const speedEl = document.querySelector("#speed")!;
const speedBarEl = document.querySelector<HTMLElement>("#speedBar")!;
const scoreEl = document.querySelector("#score")!;
const positionEl = document.querySelector("#position")!;
const lapEl = document.querySelector("#lap")!;
const totalLapsEl = document.querySelector("#totalLaps")!;
const statusEl = document.querySelector<HTMLElement>("#status")!;
const radioCallEl = document.querySelector<HTMLElement>("#radioCall")!;
const radioCallTextEl = radioCallEl.querySelector<HTMLElement>("b")!;
const minimapTrackEl = document.querySelector<SVGPathElement>("#minimapTrack")!;
const minimapPlayerEl = document.querySelector<SVGCircleElement>("#minimapPlayer")!;
const minimapLeadEl = document.querySelector<SVGCircleElement>("#minimapLead")!;
const offroadVignetteEl = document.querySelector<HTMLElement>("#offroadVignette")!;
const announcementEl = document.querySelector<HTMLElement>("#announcement")!;
const skipReplayEl = document.querySelector<HTMLButtonElement>("#skipReplay")!;
const restartRaceEl = document.querySelector<HTMLButtonElement>("#restartRace")!;
const steeringEl = document.querySelector<HTMLElement>("#steering")!;
const steeringKnobEl = document.querySelector<HTMLElement>("#steeringKnob")!;
const gasEl = document.querySelector<HTMLButtonElement>("#gas")!;
const brakeEl = document.querySelector<HTMLButtonElement>("#brake")!;
const bgmTracks = [
  document.querySelector<HTMLAudioElement>("#bgm1")!,
  document.querySelector<HTMLAudioElement>("#bgm2")!,
  document.querySelector<HTMLAudioElement>("#bgm3")!,
  document.querySelector<HTMLAudioElement>("#bgm4")!,
];
const duskBgm = document.querySelector<HTMLAudioElement>("#duskBgm")!;
const allRaceBgmTracks = [...bgmTracks, duskBgm];
let bgm = bgmTracks[stage.bgmIndex];
const finishBgm = document.querySelector<HTMLAudioElement>("#finishBgm")!;
const audioToggleEl = document.querySelector<HTMLButtonElement>("#audioToggle")!;
const pauseButtonEl = document.querySelector<HTMLButtonElement>("#pauseButton")!;
const pauseScreenEl = document.querySelector<HTMLElement>("#pauseScreen")!;
const resumeButtonEl = document.querySelector<HTMLButtonElement>("#resumeButton")!;
const restartButtonEl = document.querySelector<HTMLButtonElement>("#restartButton")!;
const settingsScreenEl = document.querySelector<HTMLElement>("#settingsScreen")!;
const closeSettingsEl = document.querySelector<HTMLButtonElement>("#closeSettings")!;
const bgmVolumeEl = document.querySelector<HTMLInputElement>("#bgmVolume")!;
const sfxVolumeEl = document.querySelector<HTMLInputElement>("#sfxVolume")!;
const bgmValueEl = document.querySelector<HTMLOutputElement>("#bgmValue")!;
const sfxValueEl = document.querySelector<HTMLOutputElement>("#sfxValue")!;
const goCourseSelectEl = document.querySelector<HTMLButtonElement>("#goCourseSelect")!;
const enterGridEl = document.querySelector<HTMLButtonElement>("#enterGrid")!;
const backToTitleEl = document.querySelector<HTMLButtonElement>("#backToTitle")!;
const stageCards = [...document.querySelectorAll<HTMLButtonElement>(".stage-card")];
const timeCards = [...document.querySelectorAll<HTMLButtonElement>(".time-card")];
const carCards = [...document.querySelectorAll<HTMLButtonElement>(".car-card")];
let touchGas = false;
let touchBrake = false;
let audioContext: AudioContext | null = null;
let sfxMaster: GainNode | null = null;
let bgmVolume = Number(localStorage.getItem("nebura-bgm-volume") ?? 68) / 100;
let sfxVolume = Number(localStorage.getItem("nebura-sfx-volume") ?? 48) / 100;
let finishBgmWarmed = false;
let finishBgmPlaybackAllowed = false;
let radioCallTimer = 0;
let menuScreen: "title" | "course" | "none" = "title";
let timeMode: "night" | "dusk" = "night";
bgmVolumeEl.value = String(Math.round(bgmVolume * 100));
sfxVolumeEl.value = String(Math.round(sfxVolume * 100));
bgmValueEl.value = bgmVolumeEl.value;
sfxValueEl.value = sfxVolumeEl.value;
allRaceBgmTracks.forEach(track => { track.volume = bgmVolume; });
finishBgm.volume = bgmVolume;
totalLapsEl.textContent = String(TOTAL_LAPS);
let engineOsc: OscillatorNode | null = null;
let engineGain: GainNode | null = null;
let windSource: AudioBufferSourceNode | null = null;
let windGain: GainNode | null = null;
let tireSource: AudioBufferSourceNode | null = null;
let tireGain: GainNode | null = null;

function haptic(pattern: number | number[]) {
  navigator.vibrate?.(pattern);
}

function minimapPoint(progress: number) {
  const point = oval.getPointAt(((progress % 1) + 1) % 1);
  return {
    x: 8 + (point.x - minimapBounds.minX) / Math.max(1, minimapBounds.maxX - minimapBounds.minX) * 84,
    y: 8 + (point.z - minimapBounds.minZ) / Math.max(1, minimapBounds.maxZ - minimapBounds.minZ) * 84,
  };
}

const minimapBounds = { minX: 0, maxX: 1, minZ: 0, maxZ: 1 };
function updateMinimapTrack() {
  const source = oval.getSpacedPoints(120);
  minimapBounds.minX = Math.min(...source.map(point => point.x));
  minimapBounds.maxX = Math.max(...source.map(point => point.x));
  minimapBounds.minZ = Math.min(...source.map(point => point.z));
  minimapBounds.maxZ = Math.max(...source.map(point => point.z));
  const points = Array.from({ length: 81 }, (_, i) => minimapPoint(i / 80));
  minimapTrackEl.setAttribute("d", points.map((point, i) => `${i ? "L" : "M"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" "));
}

function loadBestLap() {
  try {
    bestLap = JSON.parse(localStorage.getItem(`nebura.bestLap.${stage.id}`) ?? "null") as BestLap | null;
  } catch {
    bestLap = null;
  }
  ghostCar.visible = Boolean(bestLap?.frames.length);
}

function saveLap(now: number) {
  const duration = now - lapStartedAt;
  if (duration < 20 || lapFrames.length < 20 || bestLap && duration >= bestLap.duration) return;
  bestLap = { duration, frames: lapFrames.slice() };
  localStorage.setItem(`nebura.bestLap.${stage.id}`, JSON.stringify(bestLap));
  showRadioCall("PERSONAL SIGNAL // STORED", 200);
}

function updateGhost(now: number) {
  if (!bestLap?.frames.length || !running) {
    ghostCar.visible = false;
    return;
  }
  ghostCar.visible = true;
  const time = Math.min(bestLap.duration, Math.max(0, now - lapStartedAt));
  let index = 0;
  while (index < bestLap.frames.length - 2 && bestLap.frames[index + 1].time < time) index++;
  const a = bestLap.frames[index];
  const b = bestLap.frames[Math.min(index + 1, bestLap.frames.length - 1)];
  const blend = THREE.MathUtils.clamp((time - a.time) / Math.max(0.001, b.time - a.time), 0, 1);
  const progress = currentLap - 1 + THREE.MathUtils.lerp(a.progress, b.progress, blend);
  const ghostFrame = trackFrame(progress, THREE.MathUtils.lerp(a.lane, b.lane, blend));
  ghostCar.position.copy(ghostFrame.point).addScaledVector(ghostFrame.normal, 0.42);
  const yaw = a.yaw + wrapAngle(b.yaw - a.yaw) * blend;
  const tangent = ghostFrame.tangent.clone().applyAxisAngle(ghostFrame.normal, yaw);
  const right = ghostFrame.right.clone().applyAxisAngle(ghostFrame.normal, yaw);
  ghostCar.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, ghostFrame.normal, tangent));
}
updateMinimapTrack();
loadBestLap();

function playerPosition() {
  return 1 + rivals.filter(rival => rival.progress > playerProgress).length;
}

function playVocoderCall(text: string) {
  if (!audioContext || !sfxMaster || sfxVolume < 0.02) return;
  const start = audioContext.currentTime + 0.02;
  const output = audioContext.createGain();
  const highpass = audioContext.createBiquadFilter();
  const delay = audioContext.createDelay(0.25);
  const echo = audioContext.createGain();
  highpass.type = "highpass";
  highpass.frequency.value = 180;
  output.gain.value = 0.24;
  delay.delayTime.value = 0.105;
  echo.gain.value = 0.16;
  output.connect(highpass).connect(sfxMaster);
  highpass.connect(delay).connect(echo).connect(sfxMaster);

  const seed = [...text].reduce((value, char) => (value * 31 + char.charCodeAt(0)) >>> 0, 7);
  const formants = [430, 1080, 2280];
  const syllables = Math.min(7, Math.max(4, Math.ceil(text.length / 7)));
  for (let i = 0; i < syllables; i++) {
    const at = start + i * 0.135;
    const length = i === syllables - 1 ? 0.24 : 0.105;
    const carrier = audioContext.createOscillator();
    const pulse = audioContext.createGain();
    carrier.type = i % 3 === 0 ? "square" : "sawtooth";
    carrier.frequency.setValueAtTime(82 + ((seed >> (i % 16)) & 7) * 7, at);
    carrier.frequency.exponentialRampToValueAtTime(68 + ((seed >> ((i + 5) % 16)) & 7) * 6, at + length);
    pulse.gain.setValueAtTime(0.001, at);
    pulse.gain.exponentialRampToValueAtTime(0.19, at + 0.018);
    pulse.gain.exponentialRampToValueAtTime(0.001, at + length);
    carrier.connect(pulse);
    formants.forEach((frequency, band) => {
      const filter = audioContext!.createBiquadFilter();
      const bandGain = audioContext!.createGain();
      filter.type = "bandpass";
      filter.frequency.value = frequency * (0.88 + (((seed >> ((i + band) % 20)) & 3) * 0.08));
      filter.Q.value = 5.5 + band * 1.8;
      bandGain.gain.value = [0.65, 0.38, 0.2][band];
      pulse.connect(filter).connect(bandGain).connect(output);
    });
    carrier.start(at);
    carrier.stop(at + length + 0.03);
  }
}

function showRadioCall(text: string, delayMs = 0) {
  clearTimeout(radioCallTimer);
  radioCallEl.classList.remove("show");
  radioCallTimer = window.setTimeout(() => {
    radioCallTextEl.textContent = text;
    radioCallEl.classList.add("show");
    playVocoderCall(text);
    radioCallTimer = window.setTimeout(() => radioCallEl.classList.remove("show"), 2600);
  }, delayMs);
}

function lapAnnouncement(lap: number, position: number) {
  if (lap === 1) return `${stage.trackName} // LIVE`;
  const prefix = lap === TOTAL_LAPS ? "FINAL TRANSMISSION" : `LAP ${String(lap).padStart(2, "0")}`;
  if (position === 1) return `${prefix} // P1`;
  if (position <= 5) return `${prefix} // HOLD FREQUENCY`;
  return `${prefix} // CLOSE THE GAP`;
}

function finishAnnouncement(position: number) {
  if (position === 1) return "P1 // AFTERGLOW";
  if (position <= 5) return `P${position} // SIGNAL COMPLETE`;
  return `P${position} // LOST FREQUENCY`;
}

function applyLapTheme(lap: number) {
  const theme = stage.themes[Math.min(lap - 1, stage.themes.length - 1)];
  if (timeMode === "dusk") {
    scene.background = new THREE.Color(0x25152b);
    scene.fog = new THREE.FogExp2(0x552738, 0.00135);
    gridMaterials.forEach(material => {
      material.color.setHex(0xd88755);
      material.opacity = 0.28 + Math.min(lap, 3) * 0.025;
    });
    return;
  }
  scene.background = new THREE.Color(theme.sky);
  scene.fog = new THREE.FogExp2(theme.fog, 0.0016);
  gridMaterials.forEach(material => {
    material.color.setHex(theme.grid);
    material.opacity = theme.opacity;
  });
}
applyLapTheme(1);

function resetVisualTheme() {
  const dusk = timeMode === "dusk";
  document.body.classList.toggle("dusk", dusk);
  duskSky.visible = dusk;
  setToneMappingExposure(dusk ? 2.05 : 2.38);
  hemisphere.intensity = dusk ? 1.35 : 1.62;
  hemisphere.color.setHex(dusk ? 0x8f789e : 0xb7caff);
  hemisphere.groundColor.setHex(dusk ? 0x32152d : 0x1a1e3d);
  moon.intensity = dusk ? 3.1 : 2.18;
  moon.color.setHex(dusk ? 0xff9b5e : 0xe1fbff);
  moon.position.set(dusk ? 180 : -12, dusk ? 22 : 18, dusk ? -60 : -8);
  wireMaterials.forEach((material, i) => {
    material.color.setHex(dusk ? (i === 0 ? 0xffaa66 : 0xc26d65) : (i === 0 ? 0x70f2ff : 0xc997ff));
    material.opacity = dusk ? 0.34 : i === 0 ? 0.46 : 0.38;
  });
  gateMaterials.forEach((material, i) => {
    material.color.setHex(dusk ? (i % 3 === 0 ? 0xff6a78 : 0xffb16b) : (i % 3 === 0 ? 0xff6a95 : 0x75f3ff));
    material.opacity = dusk ? 0.45 : 0.55;
  });
  starMaterial.color.setHex(dusk ? 0xffd3a1 : 0x9ac7ff);
  starMaterial.opacity = dusk ? 0.2 : 0.55;
  starMaterial.size = 1.15;
  finalRingMaterials.forEach(material => { material.opacity = 0; });
  announcementEl.style.filter = "";
  announcementEl.style.transform = "";
  applyLapTheme(1);
}

const finalSkyColor = new THREE.Color();
const finalFogColor = new THREE.Color();
const finalAccentColor = new THREE.Color();
function updateFinalLapVisuals(now: number) {
  if (!running) return;
  if (currentLap !== TOTAL_LAPS) {
    const remaining = TOTAL_LAPS - currentLap;
    if (remaining <= 2) {
      const anticipation = Math.pow(Math.sin(now * (remaining === 1 ? 2.8 : 1.8)) * 0.5 + 0.5, 4);
      const baseOpacity = timeMode === "dusk" ? 0.3 : stage.themes[Math.min(currentLap - 1, stage.themes.length - 1)].opacity;
      gridMaterials.forEach(material => { material.opacity = baseOpacity + anticipation * (remaining === 1 ? 0.075 : 0.035); });
      gateMaterials.forEach(material => { material.opacity = 0.55 + anticipation * 0.12; });
    }
    return;
  }
  const pulse = getBgmPulse();
  if (timeMode === "dusk") {
    scene.background = new THREE.Color(0x25152b);
    if (scene.fog instanceof THREE.FogExp2) {
      scene.fog.color.setHex(0x552738);
      scene.fog.density = 0.0013 + pulse * 0.00016;
    }
    setToneMappingExposure(2.05 + pulse * 0.42);
    hemisphere.intensity = 1.35 + pulse * 0.55;
    moon.intensity = 3.1 + pulse * 2.1;
    gridMaterials.forEach(material => {
      material.color.setHex(pulse > 0.55 ? 0xffa15e : 0xd88755);
      material.opacity = 0.34 + pulse * 0.24;
    });
    gateMaterials.forEach((material, i) => {
      material.color.setHex(i % 3 === 0 ? 0xff566e : 0xffb06a);
      material.opacity = 0.5 + pulse * 0.28;
    });
    return;
  }
  const wave = Math.sin(bgm.currentTime * 1.15) * 0.5 + 0.5;
  const hue = (bgm.currentTime * 0.025 + wave * 0.08) % 1;
  finalSkyColor.setHSL(hue, 0.7, 0.075 + pulse * 0.075);
  finalFogColor.setHSL((hue + 0.055) % 1, 0.82, 0.09 + pulse * 0.08);
  finalAccentColor.setHSL((hue + 0.48 + pulse * 0.08) % 1, 0.95, 0.58 + pulse * 0.18);
  scene.background = finalSkyColor;
  if (scene.fog instanceof THREE.FogExp2) {
    scene.fog.color.copy(finalFogColor);
    scene.fog.density = 0.00145 + pulse * 0.00028;
  }
  setToneMappingExposure(2.42 + pulse * 0.72);
  hemisphere.intensity = 1.75 + pulse * 1.15;
  hemisphere.color.copy(finalAccentColor);
  moon.intensity = 2.35 + pulse * 3.1;
  moon.color.setHSL((hue + 0.12) % 1, 0.72, 0.72);
  gridMaterials.forEach((material, i) => {
    material.color.setHSL((hue + i * 0.08) % 1, 0.9, 0.52 + pulse * 0.18);
    material.opacity = 0.48 + pulse * 0.34;
  });
  wireMaterials.forEach((material, i) => {
    material.color.setHSL((hue + 0.22 + i * 0.28) % 1, 0.94, 0.58 + pulse * 0.2);
    material.opacity = 0.48 + pulse * 0.38;
  });
  gateMaterials.forEach((material, i) => {
    material.color.setHSL((hue + i * 0.07 + pulse * 0.12) % 1, 0.98, 0.58 + pulse * 0.22);
    material.opacity = 0.58 + pulse * 0.4;
  });
  starMaterial.color.copy(finalAccentColor);
  starMaterial.opacity = 0.62 + pulse * 0.38;
  starMaterial.size = 1.15 + pulse * 1.45;
  finalRings.rotation.y = bgm.currentTime * 0.06;
  finalRings.children.forEach((ring, i) => {
    const phase = Math.sin(bgm.currentTime * (0.42 + i * 0.08) + i * 1.7) * 0.5 + 0.5;
    const scale = 1 + pulse * (0.025 + i * 0.008) + phase * 0.012;
    ring.scale.setScalar(scale);
    finalRingMaterials[i].color.setHSL((hue + i * 0.24 + pulse * 0.08) % 1, 1, 0.58 + pulse * 0.22);
    finalRingMaterials[i].opacity = 0.16 + phase * 0.16 + pulse * 0.44;
  });
  announcementEl.style.filter = `hue-rotate(${Math.round((hue + pulse * 0.2) * 360)}deg) brightness(${1.05 + pulse * 0.65})`;
  announcementEl.style.transform = `translate(-50%,-50%) scale(${1 + pulse * 0.08})`;
  if (pulse > 0.72 && now - lastFirework > 0.34) lastFirework = 0;
}

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
function showTitleScreen() {
  menuScreen = "title";
  title.classList.remove("hidden");
  courseSelect.classList.add("hidden");
}
function showCourseSelect() {
  stopFinishBgm();
  menuScreen = "course";
  title.classList.add("hidden");
  courseSelect.classList.remove("hidden");
}
function hideMenus() {
  menuScreen = "none";
  title.classList.add("hidden");
  courseSelect.classList.add("hidden");
}
function arm() { armed = true; }
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
  if (running || replaying || countdownEnd > 0 || playerProgress >= TOTAL_LAPS) return;
  stopFinishBgm();
  armed = true;
  hideMenus();
  startSfx();
  bgm.load();
  warmFinishBgm();
  countdownEnd = performance.now() / 1000 + 3.8;
}
function warmFinishBgm() {
  if (finishBgmWarmed) return;
  finishBgmWarmed = true;
  finishBgm.pause();
  finishBgm.currentTime = 0;
  finishBgm.muted = false;
  finishBgm.volume = bgmVolume;
  finishBgm.load();
}
function stopFinishBgm() {
  finishBgmPlaybackAllowed = false;
  finishBgm.pause();
  finishBgm.currentTime = 0;
}
function playFinishBgm() {
  finishBgmPlaybackAllowed = true;
  const tryPlay = () => {
    if (finishBgmPlaybackAllowed) void finishBgm.play().catch(() => {});
  };
  void finishBgm.play().catch(() => {
    if (!finishBgmPlaybackAllowed) return;
    finishBgm.load();
    finishBgm.addEventListener("canplay", tryPlay, { once: true });
  });
}
let selectedStageIndex = 0;
function bindMenuPress(element: HTMLElement, handler: () => void) {
  let lastPress = -Infinity;
  const press = (event: Event) => {
    const now = performance.now();
    if (now - lastPress < 500) return;
    lastPress = now;
    event.stopPropagation();
    if (event.cancelable) event.preventDefault();
    handler();
  };
  element.addEventListener("touchstart", press, { passive: false });
  element.addEventListener("click", press);
}
bindMenuPress(goCourseSelectEl, () => {
  showCourseSelect();
});
stageCards.forEach((card, index) => {
  bindMenuPress(card, () => {
    selectedStageIndex = index;
    stageCards.forEach((item, itemIndex) => item.classList.toggle("selected", itemIndex === selectedStageIndex));
  });
});
timeCards.forEach(card => {
  bindMenuPress(card, () => {
    timeMode = card.dataset.time === "dusk" ? "dusk" : "night";
    timeCards.forEach(item => item.classList.toggle("selected", item === card));
    resetVisualTheme();
  });
});
carCards.forEach(card => {
  bindMenuPress(card, () => {
    selectedCarType = card.dataset.car === "drift" ? "drift" : "grip";
    carCards.forEach(item => item.classList.toggle("selected", item === card));
    applySelectedCarType();
  });
});
bindMenuPress(enterGridEl, () => {
  switchStage(selectedStageIndex);
  requestStart();
});
bindMenuPress(backToTitleEl, () => {
  showTitleScreen();
});
addEventListener("pointerdown", e => {
  if (!replaying && menuScreen === "none") arm();
});
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
  if (e.code === "Escape" && armed && !finishHandled) { setPaused(!paused); return; }
  if (menuScreen === "title" && (e.code === "Enter" || e.code === "Space")) { showCourseSelect(); return; }
  if (menuScreen === "course" && e.code === "Enter") { switchStage(selectedStageIndex); requestStart(); return; }
  if (menuScreen !== "none") return;
  if (["ArrowLeft", "ArrowRight", "KeyZ", "KeyX"].includes(e.code)) e.preventDefault();
  keys.add(e.code);
  if (paused) return;
  if (e.code === "KeyZ") requestStart(); else arm();
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
restartRaceEl.addEventListener("pointerdown", e => { e.stopPropagation(); e.preventDefault(); restartRace(); });
pauseButtonEl.addEventListener("pointerdown", e => { e.stopPropagation(); e.preventDefault(); setPaused(true); });
resumeButtonEl.addEventListener("pointerdown", e => { e.stopPropagation(); e.preventDefault(); setPaused(false); });
restartButtonEl.addEventListener("pointerdown", e => { e.stopPropagation(); e.preventDefault(); restartRace(); });
document.addEventListener("visibilitychange", () => {
  if (document.hidden && (running || countdownEnd > 0 || replaying)) setPaused(true);
});
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
  allRaceBgmTracks.forEach(track => { track.volume = bgmVolume; });
  finishBgm.volume = bgmVolume;
  localStorage.setItem("nebura-bgm-volume", bgmVolumeEl.value);
});
sfxVolumeEl.addEventListener("input", () => {
  sfxVolume = Number(sfxVolumeEl.value) / 100;
  sfxValueEl.value = sfxVolumeEl.value;
  if (sfxMaster && audioContext) sfxMaster.gain.setTargetAtTime(sfxVolume, audioContext.currentTime, 0.04);
  localStorage.setItem("nebura-sfx-volume", sfxVolumeEl.value);
});

function setPaused(value: boolean) {
  if (value === paused || !armed || finishHandled) return;
  paused = value;
  if (paused) {
    pauseStarted = performance.now() / 1000;
    resumeBgm = !bgm.paused;
    resumeFinishBgm = !finishBgm.paused;
    bgm.pause();
    finishBgm.pause();
    void audioContext?.suspend();
    touchGas = false;
    touchBrake = false;
    gasEl.classList.remove("active");
    brakeEl.classList.remove("active");
    pauseScreenEl.classList.add("show");
  } else {
    const pauseDuration = performance.now() / 1000 - pauseStarted;
    if (countdownEnd > 0) countdownEnd += pauseDuration;
    if (replaying) replayStart += pauseDuration;
    if (finalLapUntil > 0) finalLapUntil += pauseDuration;
    lastEmit += pauseDuration;
    lastPlayerEmit += pauseDuration;
    lastReplayCapture += pauseDuration;
    lastFirework += pauseDuration;
    void audioContext?.resume();
    if (resumeBgm) void bgm.play().catch(() => {});
    if (resumeFinishBgm) playFinishBgm();
    pauseScreenEl.classList.remove("show");
    clock.getDelta();
  }
}

function resetRace() {
  clearTimeout(radioCallTimer);
  radioCallEl.classList.remove("show");
  paused = false;
  pauseScreenEl.classList.remove("show");
  settingsScreenEl.classList.remove("show");
  running = false;
  replaying = false;
  finishHandled = false;
  countdownEnd = 0;
  lastCountdownValue = "";
  currentLap = 1;
  finalLapUntil = 0;
  finalLapFireworkCount = 0;
  replayStart = 0;
  replayCursor = 0;
  playerProgress = 0;
  playerSpeed = 0;
  lane = 0;
  lateralVelocity = 0;
  yawError = 0;
  yawRate = 0;
  steerAngle = 0;
  longitudinalAccel = 0;
  steer = 0;
  score = 0;
  playerTailIntensity = 0.45;
  touchGas = false;
  touchBrake = false;
  driftState = "grip";
  driftDirection = 0;
  driftStateTime = 0;
  gasReleaseTime = 0;
  previousAccelerating = false;
  neutralSteerTime = 0;
  replayFrames.length = 0;
  lapFrames.length = 0;
  lapStartedAt = 0;
  lastRivalCollision = -10;
  wasOffRoad = false;
  previousDriftState = "grip";
  ghostCar.visible = Boolean(bestLap?.frames.length);
  offroadVignetteEl.style.opacity = "0";
  samples.length = 0;
  playerSamples.length = 0;
  rivalTailSamples.forEach(source => { source.length = 0; });
  rivals.forEach((rival, i) => {
    rival.progress = 0.045 - i * 0.014;
    rival.speedMps = 0;
    rival.tailIntensity = 0.45;
  });
  for (const particle of smokeParticles) {
    particle.life = 0;
    particle.sprite.visible = false;
  }
  for (const particle of fireworkParticles) particle.life = 0;
  fireworkAlphas.fill(0);
  fireworkGeometry.attributes.aAlpha.needsUpdate = true;
  allRaceBgmTracks.forEach(track => {
    track.pause();
    track.currentTime = 0;
  });
  stopFinishBgm();
  skipReplayEl.classList.remove("show");
  restartRaceEl.classList.remove("show");
  announcementEl.className = "";
  announcementEl.textContent = "";
  statusEl.style.opacity = "0";
  steeringKnobEl.style.transform = "translateX(0)";
  steeringEl.classList.remove("active");
  gasEl.classList.remove("active");
  brakeEl.classList.remove("active");
  resetVisualTheme();
  if (!finishHandled) showTitleScreen();
}

function restartRace() {
  resetRace();
  requestStart();
}

function switchStage(index: number) {
  const nextStage = STAGES[index] ?? STAGES[0];
  if (nextStage !== stage) {
    stageGroup.traverse(object => {
      if (object === floor || object === grid) return;
      if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.LineSegments) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach(material => material.dispose());
      }
    });
    scene.remove(stageGroup);
    stageGroup = new THREE.Group();
    scene.add(stageGroup);
    wireMaterials.length = 0;
    gateMaterials.length = 0;
    configureStage(nextStage);
    makeRoad();
    addWireEnvironment();
    addAdvancedEnvironment();
    patchEffectTexturesAndVisibility();
    floor.position.y = TRACK_FLOOR_Y;
    grid.position.y = TRACK_FLOOR_Y + 0.04;
    stageGroup.add(floor, grid);
    rivals.forEach((rival, i) => {
      rival.topSpeedMps = (stage.aiTopSpeedBaseKmh + (i % 4) * 7 + Math.floor(i / 4) * 4) / 3.6;
    });
    updateMinimapTrack();
    loadBestLap();
  }
  allRaceBgmTracks.forEach(track => {
    track.pause();
    track.currentTime = 0;
  });
  bgm = timeMode === "dusk" ? duskBgm : bgmTracks[stage.bgmIndex];
  bgm.volume = bgmVolume;
  bgm.load();
  totalLapsEl.textContent = String(TOTAL_LAPS);
  resetRace();
}

function startFinish(now: number) {
  if (finishHandled) return;
  saveLap(now);
  haptic([25, 35, 55]);
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
  showRadioCall(finishAnnouncement(playerPosition()), 550);
  announcementEl.textContent = "FINISH";
  announcementEl.className = "show final";
  skipReplayEl.classList.toggle("show", replaying);
  restartRaceEl.classList.add("show");
}
function endReplay() {
  replaying = false;
  skipReplayEl.classList.remove("show");
  restartRaceEl.classList.add("show");
  announcementEl.textContent = "FINISH";
  announcementEl.className = "show final";
}

const cameraTarget = new THREE.Vector3();
const cameraPos = new THREE.Vector3();
function placeCar(car: THREE.Group, u: number, offset: number, slip = 0, roll = 0) {
  const f = trackFrame(u, offset);
  car.position.copy(f.point);
  const tangent = f.tangent.clone().applyAxisAngle(f.normal, slip).normalize();
  const right = f.right.clone().applyAxisAngle(f.normal, slip).normalize();
  car.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, f.normal, tangent));
  car.rotateZ(THREE.MathUtils.clamp(roll, -0.07, 0.07));
  return { point: f.point, tangent, right, normal: f.normal };
}

const gripVehicle = {
  mass: 1200,
  inertia: 2050,
  frontAxle: 1.25,
  rearAxle: 1.25,
  cgHeight: 0.55,
  frontCornerStiffness: 86000,
  rearCornerStiffness: 90000,
  frontGrip: 1.52,
  rearGrip: 1.58,
  engineForce: 9200,
  brakeForce: 15500,
  rollingResistance: 45,
  aerodynamicDrag: 0.21,
  maxSteer: 0.46,
};
const driftVehicle = {
  ...gripVehicle,
  mass: 1160,
  inertia: 1880,
  frontCornerStiffness: 68000,
  rearCornerStiffness: 61000,
  frontGrip: 1.3,
  rearGrip: 1.14,
  engineForce: 9700,
  brakeForce: 14800,
  aerodynamicDrag: 0.24,
  maxSteer: 0.52,
};
const vehicle = { ...gripVehicle };

function applySelectedCarType() {
  Object.assign(vehicle, selectedCarType === "drift" ? driftVehicle : gripVehicle);
  const replacement = makeCar(selectedCarType === "drift" ? 0x7b183d : 0x0a5164, false, selectedCarType);
  replacement.position.copy(playerCar.position);
  replacement.quaternion.copy(playerCar.quaternion);
  scene.add(replacement);
  scene.remove(playerCar);
  playerCar.traverse(object => {
    if (!(object instanceof THREE.Mesh || object instanceof THREE.Sprite)) return;
    if (object instanceof THREE.Mesh) object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach(material => material.dispose());
  });
  playerCar = replacement;
  patchEffectTexturesAndVisibility();
}

type DriftState = "grip" | "entry" | "hold" | "recovery";
let driftState: DriftState = "grip";
let driftDirection = 0;
let driftStateTime = 0;
let gasReleaseTime = 0;
let previousAccelerating = false;
let neutralSteerTime = 0;

function updateArcadeDrift(dt: number, accelerating: boolean, braking: boolean) {
  const speedKmh = playerSpeed * 3.6;
  const driftCar = selectedCarType === "drift";
  const turned = Math.abs(steer) > (driftCar ? 0.26 : 0.34);
  const gasSnap = accelerating && !previousAccelerating && gasReleaseTime > 0.06 && gasReleaseTime < 0.42;
  if (!accelerating) gasReleaseTime = Math.min(1, gasReleaseTime + dt);
  else if (!gasSnap) gasReleaseTime = 0;

  if (driftState === "grip" && speedKmh > (driftCar ? 78 : 100) && turned && (braking || gasSnap || driftCar && accelerating)) {
    driftState = "entry";
    driftDirection = -Math.sign(steer);
    driftStateTime = 0;
    neutralSteerTime = 0;
  }

  driftStateTime += dt;
  if (driftState === "entry") {
    const target = driftDirection * THREE.MathUtils.lerp(driftCar ? 0.34 : 0.3, driftCar ? 0.5 : 0.42, Math.abs(steer));
    yawError = THREE.MathUtils.lerp(yawError, target, 1 - Math.pow(0.003, dt));
    lateralVelocity = THREE.MathUtils.lerp(lateralVelocity, Math.sin(target) * playerSpeed * 0.45, 1 - Math.pow(0.02, dt));
    if (driftStateTime > 0.2) {
      driftState = "hold";
      driftStateTime = 0;
    }
  } else if (driftState === "hold") {
    const target = driftDirection * THREE.MathUtils.lerp(driftCar ? 0.38 : 0.32, driftCar ? 0.58 : 0.48, Math.abs(steer));
    yawError = THREE.MathUtils.lerp(yawError, target, 1 - Math.pow(0.11, dt));
    lateralVelocity = THREE.MathUtils.lerp(lateralVelocity, Math.sin(target) * playerSpeed * 0.5, 1 - Math.pow(0.18, dt));
    neutralSteerTime = Math.abs(steer) < 0.14 ? neutralSteerTime + dt : 0;
    const counterSteering = Math.sign(steer) === driftDirection && Math.abs(steer) > 0.32;
    if (counterSteering || neutralSteerTime > (driftCar ? 0.7 : 0.5) || driftStateTime > (driftCar ? 4.2 : 3.2) || speedKmh < (driftCar ? 58 : 72)) {
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
  const gripCar = selectedCarType === "grip";
  const assistStrength = THREE.MathUtils.lerp(gripCar ? 1.22 : 1, driftState === "hold" ? 0.52 : gripCar ? 0.48 : 0.3, Math.abs(steer));
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
    const stability = THREE.MathUtils.lerp(gripCar ? 3.1 : 2.2, gripCar ? 5.8 : 4.4, speedRatio) * (driftState === "hold" ? 0.2 : driftState === "entry" ? 0.35 : 1);
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

function resolveRivalCollisions(now: number) {
  if (!running || replaying || now - lastRivalCollision < 0.22) return;
  for (const rival of rivals) {
    let progressDelta = rival.progress - playerProgress;
    progressDelta -= Math.round(progressDelta);
    const longitudinalDistance = progressDelta * TRACK_LENGTH_METERS;
    const lateralDistance = rival.lane - lane;
    const halfLength = selectedCarType === "drift" ? 2.05 : 1.9;
    const halfWidth = selectedCarType === "drift" ? 1.14 : 1.02;
    if (Math.abs(longitudinalDistance) > halfLength * 2 || Math.abs(lateralDistance) > halfWidth * 1.75) continue;
    const side = Math.abs(lateralDistance) > 0.12 ? -Math.sign(lateralDistance) : Math.sign(steer || 1);
    const overlap = 1 - Math.abs(lateralDistance) / (halfWidth * 1.75);
    lane += side * (0.28 + overlap * 0.34);
    lateralVelocity += side * (2.2 + overlap * 2.8);
    yawError += side * (selectedCarType === "drift" ? 0.055 : 0.035);
    const impactSpeed = Math.max(0, playerSpeed - rival.speedMps);
    playerSpeed *= longitudinalDistance > 0 ? THREE.MathUtils.clamp(0.78 - impactSpeed * 0.004, 0.58, 0.78) : 0.88;
    rival.speedMps *= longitudinalDistance < 0 ? 0.76 : 0.9;
    rival.lane = THREE.MathUtils.clamp(rival.lane - side * 0.2, -TRACK_WIDTH * 0.42, TRACK_WIDTH * 0.42);
    lane = THREE.MathUtils.clamp(lane, -TRACK_WIDTH * 0.68, TRACK_WIDTH * 0.68);
    lastRivalCollision = now;
    haptic([18, 22, 18]);
    return;
  }
}

function emitDriftSmoke(frame: ReturnType<typeof placeCar>, now: number) {
  if (disableParticles || disableSprites) return;
  if (now - lastSmokeEmit < 0.035) return;
  lastSmokeEmit = now;
  for (const side of [-1, 1]) {
    const particle = smokeParticles[smokeCursor++ % smokeParticles.length];
    particle.life = particle.maxLife = 0.7 + Math.random() * 0.45;
    particle.sprite.visible = true;
    particle.sprite.position.copy(frame.point).addScaledVector(frame.tangent, -1.55).addScaledVector(frame.right, side * 0.62).addScaledVector(frame.normal, 0.18);
    particle.sprite.scale.setScalar(0.8);
    particle.velocity.copy(frame.tangent).multiplyScalar(-0.8 - Math.random() * 0.8).addScaledVector(frame.right, side * (Math.random() - 0.5)).setY(0.35 + Math.random() * 0.35);
  }
}
function spawnFirework(frame: ReturnType<typeof placeCar>, now: number) {
  if (disableParticles || reducedEffects || finalLapFireworkCount >= 20) return;
  const beatPulse = getBgmPulse();
  if (now - lastFirework < THREE.MathUtils.lerp(0.5, 0.34, beatPulse)) return;
  lastFirework = now;
  const shot = finalLapFireworkCount++;
  const sidePattern = [-0.72, 0.68, -0.28, 0.32, -0.94, 0.92, 0];
  const center = frame.point.clone()
    .addScaledVector(frame.tangent, 150 + (shot % 4) * 16 + Math.random() * 14)
    .addScaledVector(frame.right, sidePattern[shot % sidePattern.length] * (54 + Math.random() * 12))
    .addScaledVector(frame.normal, 34 + (shot % 3) * 11 + Math.random() * 8);
  burstFirework(center, 1.35 + beatPulse * 0.3);
}
function burstFirework(center: THREE.Vector3, size = 1) {
  const beatPulse = getBgmPulse();
  const count = 54 + Math.round(beatPulse * 38);
  const hueOffset = fireworkCursor;
  for (let i = 0; i < count; i++) {
    const particle = fireworkParticles[fireworkCursor++ % fireworkParticles.length];
    const y = 1 - (i / Math.max(1, count - 1)) * 2;
    const radius = Math.sqrt(Math.max(0, 1 - y * y));
    const angle = i * Math.PI * (3 - Math.sqrt(5)) + Math.random() * 0.12;
    const speed = (8 + Math.random() * 6 + beatPulse * 5) * size;
    particle.life = particle.maxLife = 1.7 + Math.random() * 0.9;
    particle.rocket = false;
    particle.position.copy(center);
    particle.size = (0.34 + Math.random() * 0.3 + beatPulse * 0.18) * size;
    particle.velocity.set(Math.cos(angle) * radius * speed, y * speed, Math.sin(angle) * radius * speed);
    updateFireworkColor(particle, beatPulse, hueOffset + Math.floor(i / 12));
  }
  const ringCount = 28;
  for (let i = 0; i < ringCount; i++) {
    const particle = fireworkParticles[fireworkCursor++ % fireworkParticles.length];
    const angle = (i / ringCount) * Math.PI * 2;
    const speed = (15 + beatPulse * 6) * size;
    particle.life = particle.maxLife = 1.4 + Math.random() * 0.45;
    particle.rocket = false;
    particle.position.copy(center);
    particle.size = (0.48 + beatPulse * 0.2) * size;
    particle.velocity.set(Math.cos(angle) * speed, Math.sin(angle) * speed, (Math.random() - 0.5) * 1.2);
    updateFireworkColor(particle, 1, hueOffset + 18);
  }
}
function getBgmPulse() {
  if (bgm.paused || !Number.isFinite(bgm.currentTime)) return 0.25;
  const beat = (bgm.currentTime * stage.beatRate) % 1;
  return Math.pow(1 - beat, 4.2);
}
function updateFireworkColor(particle: FireworkParticle, pulse: number, offset: number) {
  const hue = (bgm.currentTime * 0.07 + offset * 0.11 + pulse * 0.18) % 1;
  particle.color.setHSL(hue, 0.9, 0.58 + pulse * 0.24);
}
function updateEffects(dt: number) {
  if (!disableParticles && !disableSprites) for (const particle of smokeParticles) {
    if (particle.life <= 0) continue;
    particle.life -= dt;
    particle.sprite.position.addScaledVector(particle.velocity, dt);
    particle.velocity.multiplyScalar(Math.pow(0.25, dt));
    const age = 1 - Math.max(0, particle.life) / particle.maxLife;
    particle.sprite.scale.setScalar(0.8 + age * 2.4);
    (particle.sprite.material as THREE.SpriteMaterial).opacity = Math.sin(Math.min(1, age) * Math.PI) * 0.24;
    if (particle.life <= 0) particle.sprite.visible = false;
  }
  if (disableParticles || reducedEffects) return;
  for (const particle of fireworkParticles) {
    if (particle.life <= 0) continue;
    particle.life -= dt;
    particle.velocity.y -= (particle.rocket ? 8.5 : 2.6) * dt;
    particle.position.addScaledVector(particle.velocity, dt);
    let opacity: number;
    if (particle.rocket) {
      const pulse = getBgmPulse();
      opacity = 0.65 + pulse * 0.35;
      particle.size = 0.22 + pulse * 0.22;
      updateFireworkColor(particle, pulse, fireworkCursor);
    } else {
      const remaining = Math.max(0, particle.life) / particle.maxLife;
      opacity = Math.min(1, remaining * 1.65) * (0.78 + Math.sin(particle.life * 34) * 0.22);
      particle.size *= Math.pow(0.84, dt);
    }
    particle.position.toArray(fireworkPositions, particle.index * 3);
    particle.color.toArray(fireworkColors, particle.index * 3);
    fireworkSizes[particle.index] = particle.size * 18;
    fireworkAlphas[particle.index] = opacity;
    if (particle.life <= 0) {
      if (particle.rocket) burstFirework(particle.position.clone());
      particle.rocket = false;
      fireworkAlphas[particle.index] = 0;
    }
  }
  fireworkGeometry.attributes.position.needsUpdate = true;
  fireworkGeometry.attributes.color.needsUpdate = true;
  fireworkGeometry.attributes.aSize.needsUpdate = true;
  fireworkGeometry.attributes.aAlpha.needsUpdate = true;
}

function setReducedEffects(enabled: boolean) {
  if (reducedEffects === enabled) return;
  reducedEffects = enabled;
  renderer.setPixelRatio(Math.min(devicePixelRatio, enabled ? 1.1 : pixelRatioLimit));
  renderer.setSize(innerWidth, innerHeight);
  fireworkPoints.visible = !enabled && !disableParticles;
  finalRings.visible = !enabled && !disableGlow;
  for (const particle of smokeParticles) {
    if (enabled) {
      particle.life = 0;
      particle.sprite.visible = false;
    }
  }
  if (enabled) {
    for (const particle of fireworkParticles) particle.life = 0;
    fireworkAlphas.fill(0);
    fireworkGeometry.attributes.aAlpha.needsUpdate = true;
    samples.length = 0;
    playerSamples.length = 0;
    rivalTailSamples.forEach(source => { source.length = 0; });
  }
  for (const mesh of [mainLeft, mainRight, playerMainLeft, playerMainRight]) mesh.visible = !enabled && !disableTrail;
  for (const mesh of [bleedLeft, bleedRight, playerBleedLeft, playerBleedRight]) mesh.visible = !enabled && !disableBleed;
  rivalTailMeshes.forEach(meshes => {
    meshes.left.visible = !enabled && !disableTrail;
    meshes.right.visible = !enabled && !disableTrail;
  });
}

function monitorMobilePerformance(nowMs: number) {
  if (!isMobileDevice) return;
  fpsSampleFrames++;
  const elapsed = nowMs - fpsSampleStarted;
  if (elapsed < 2000) return;
  const fps = fpsSampleFrames * 1000 / elapsed;
  fpsSampleFrames = 0;
  fpsSampleStarted = nowMs;
  slowFpsWindows = fps < 45 ? slowFpsWindows + 1 : 0;
  fastFpsWindows = fps > 52 ? fastFpsWindows + 1 : 0;
  if (!reducedEffects && slowFpsWindows >= 2) setReducedEffects(true);
  if (reducedEffects && fastFpsWindows >= 3) setReducedEffects(false);
}

let lastMenuRender = 0;
function animate() {
  requestAnimationFrame(animate);
  const frameNow = performance.now();
  const dt = Math.min(clock.getDelta(), 0.04);
  if (menuScreen !== "none") {
    if (frameNow - lastMenuRender > 100) {
      lastMenuRender = frameNow;
      renderer.render(scene, camera);
    }
    return;
  }
  monitorMobilePerformance(frameNow);
  const now = frameNow / 1000;
  if (paused) {
    renderer.render(scene, camera);
    return;
  }
  const keySteer = (keys.has("ArrowRight") ? 1 : 0) - (keys.has("ArrowLeft") ? 1 : 0);
  const accelerating = touchGas || keys.has("KeyZ");
  const braking = touchBrake || keys.has("KeyX");
  if (countdownEnd > 0) {
    const remaining = countdownEnd - now;
    const value = remaining > 2.8 ? "3" : remaining > 1.8 ? "2" : remaining > 0.8 ? "1" : remaining > 0 ? "GO" : "";
    if (value !== lastCountdownValue) {
      lastCountdownValue = value;
      if (value) playCountdownBeep(value === "GO");
      if (value === "GO") {
        running = true;
        lapStartedAt = now;
        lapFrames.length = 0;
        bgm.volume = bgmVolume;
        void bgm.play().catch(() => {});
        showRadioCall(lapAnnouncement(1, playerPosition()), 520);
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
    lapFrames.push({
      time: now - lapStartedAt,
      progress: THREE.MathUtils.clamp(playerProgress - (currentLap - 1), 0, 1),
      lane,
      yaw: yawError,
    });
  }
  if (running && driftState === "entry" && previousDriftState === "grip") haptic(12);
  if (running && dynamics.offRoad && !wasOffRoad) haptic([18, 24, 18]);
  previousDriftState = driftState;
  wasOffRoad = dynamics.offRoad;
  const offroadStrength = dynamics.offRoad ? THREE.MathUtils.clamp((Math.abs(lane) - TRACK_WIDTH * 0.46) / (TRACK_WIDTH * 0.2), 0.18, 1) : 0;
  offroadVignetteEl.style.opacity = String(offroadStrength * (0.55 + Math.sin(now * 36) * 0.15));

  let playerFrame = placeCar(playerCar, playerProgress, lane, yawError, -lateralVelocity * 0.012);
  playerCar.rotateX(THREE.MathUtils.clamp(-longitudinalAccel * 0.004, -0.032, 0.032));
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
  const playerTailTarget = braking ? 1 : accelerating ? 0.42 : 0.68;
  playerTailIntensity = THREE.MathUtils.lerp(playerTailIntensity, playerTailTarget, 1 - Math.pow(0.001, dt));
  updateTailLights(playerCar, playerTailIntensity, dt);
  if (!disableParticles && !disableSprites && !reducedEffects && running && drifting) emitDriftSmoke(playerFrame, now);
  if (running && currentLap === TOTAL_LAPS) spawnFirework(playerFrame, now);
  updateEffects(dt);
  let leadFrame = trackFrame(0);
  const rivalFrames: ReturnType<typeof placeCar>[] = [];
  rivals.forEach((rival, i) => {
    const gap = rival.progress - playerProgress;
    const rubberBand = THREE.MathUtils.clamp(-gap * 3.2, -0.06, 0.045);
    const targetSpeed = rival.topSpeedMps * (1 + rubberBand + Math.sin(now * 0.32 + rival.phase) * 0.008);
    const previousSpeed = rival.speedMps;
    if (running) {
      const speedDelta = targetSpeed - rival.speedMps;
      const maxDelta = (speedDelta > 0 ? rival.acceleration : 8.5) * dt;
      rival.speedMps += THREE.MathUtils.clamp(speedDelta, -maxDelta, maxDelta);
      rival.progress += rival.speedMps * dt / TRACK_LENGTH_METERS;
    }
    const rivalLane = rival.lane + Math.sin(now * 0.46 + rival.phase) * 0.38;
    const weave = Math.sin(now * 0.6 + rival.phase);
    const frame = placeCar(rival.car, rival.progress, rivalLane, weave * 0.018, -weave * 0.012);
    rivalFrames.push(frame);
    const decelerating = rival.speedMps < previousSpeed - 0.015 || targetSpeed < rival.speedMps - 1.5;
    const rivalTarget = decelerating ? 1 : rival.speedMps < 2 ? 0.72 : 0.46;
    rival.tailIntensity = THREE.MathUtils.lerp(rival.tailIntensity, rivalTarget, 1 - Math.pow(0.001, dt));
    const distanceScale = THREE.MathUtils.clamp(camera.position.distanceTo(rival.car.position) / 40, 1, 2.2);
    updateTailLights(rival.car, rival.tailIntensity, dt, distanceScale);
    if (i === 0) leadFrame = frame;
  });
  resolveRivalCollisions(now);
  const playerMap = minimapPoint(playerProgress);
  const leadMap = minimapPoint(Math.max(...rivals.map(rival => rival.progress)));
  minimapPlayerEl.setAttribute("cx", String(playerMap.x));
  minimapPlayerEl.setAttribute("cy", String(playerMap.y));
  minimapLeadEl.setAttribute("cx", String(leadMap.x));
  minimapLeadEl.setAttribute("cy", String(leadMap.y));
  updateGhost(now);
  if (landmarkRing) {
    landmarkRing.rotation.z += dt * 0.16;
    landmarkRing.rotation.y += dt * 0.08;
  }

  if (!reducedEffects && now - lastEmit > 0.035) {
    lastEmit = now;
    const rear = leadFrame.point.clone().addScaledVector(leadFrame.tangent, -1.78).addScaledVector(leadFrame.normal, 0.56);
    samples.push({
      left: rear.clone().addScaledVector(leadFrame.right, -0.57),
      right: rear.clone().addScaledVector(leadFrame.right, 0.57),
      tangent: leadFrame.tangent.clone(),
      normal: leadFrame.normal.clone(),
      born: now,
    });
  }
  if (!reducedEffects && now - lastPlayerEmit > (replaying ? 0.018 : 0.028)) {
    lastPlayerEmit = now;
    const rear = playerFrame.point.clone().addScaledVector(playerFrame.tangent, -1.8).addScaledVector(playerFrame.normal, 0.56);
    playerSamples.push({
      left: rear.clone().addScaledVector(playerFrame.right, -0.57),
      right: rear.clone().addScaledVector(playerFrame.right, 0.57),
      tangent: playerFrame.tangent.clone(),
      normal: playerFrame.normal.clone(),
      born: now,
      strength: THREE.MathUtils.clamp(speedRatio, 0.15, 1) * playerTailIntensity,
    });
    rivalFrames.forEach((frame, i) => {
      const rear = frame.point.clone().addScaledVector(frame.tangent, -1.8).addScaledVector(frame.normal, 0.56);
      rivalTailSamples[i].push({
        left: rear.clone().addScaledVector(frame.right, -0.57),
        right: rear.clone().addScaledVector(frame.right, 0.57),
        tangent: frame.tangent.clone(),
        normal: frame.normal.clone(),
        born: now,
        strength: THREE.MathUtils.clamp(rivals[i].speedMps / rivals[i].topSpeedMps, 0.15, 1) * rivals[i].tailIntensity,
      });
    });
  }
  while (samples.length && now - samples[0].born > TRAIL_LIFE) samples.shift();
  while (playerSamples.length && now - playerSamples[0].born > PLAYER_TRAIL_LIFE) playerSamples.shift();
  rivalTailSamples.forEach(source => {
    while (source.length && now - source[0].born > RIVAL_TAIL_LIFE) source.shift();
  });
  updateRibbon(mainLeft, samples, "left", 0.13, now, TRAIL_LIFE);
  updateRibbon(mainRight, samples, "right", 0.13, now, TRAIL_LIFE);
  updateRibbon(bleedLeft, samples, "left", 0.286, now, TRAIL_LIFE, 1, true);
  updateRibbon(bleedRight, samples, "right", 0.286, now, TRAIL_LIFE, 1, true);
  updateRibbon(playerMainLeft, playerSamples, "left", 0.1, now, PLAYER_TRAIL_LIFE, 0.52);
  updateRibbon(playerMainRight, playerSamples, "right", 0.1, now, PLAYER_TRAIL_LIFE, 0.52);
  updateRibbon(playerBleedLeft, playerSamples, "left", 0.22, now, PLAYER_TRAIL_LIFE, 0.38, true);
  updateRibbon(playerBleedRight, playerSamples, "right", 0.22, now, PLAYER_TRAIL_LIFE, 0.38, true);
  rivalTailSamples.forEach((source, i) => {
    updateRibbon(rivalTailMeshes[i].left, source, "left", 0.1, now, RIVAL_TAIL_LIFE, 0.55);
    updateRibbon(rivalTailMeshes[i].right, source, "right", 0.1, now, RIVAL_TAIL_LIFE, 0.55);
  });

  const cameraShake = running ? Math.sin(now * 43) * (0.008 + speedRatio * 0.035) : 0;
  if (replaying) {
    const orbit = Math.sin((now - replayStart) * 0.32);
    cameraPos.copy(playerFrame.point).addScaledVector(playerFrame.tangent, -8 + orbit * 2).addScaledVector(playerFrame.right, 7 + orbit * 4).addScaledVector(playerFrame.normal, 4.2 + Math.abs(orbit) * 1.8);
    camera.position.lerp(cameraPos, 1 - Math.pow(0.018, dt));
    const replayLook = playerFrame.point.clone().addScaledVector(playerFrame.tangent, 5).addScaledVector(playerFrame.normal, 0.65);
    cameraTarget.lerp(replayLook, 1 - Math.pow(0.008, dt));
  } else {
    const cameraSlip = THREE.MathUtils.clamp(lateralVelocity * 0.16, -2.2, 2.2);
    cameraPos.copy(playerFrame.point).addScaledVector(playerFrame.tangent, -5.55 - speedRatio * 0.65).addScaledVector(playerFrame.right, -cameraSlip).addScaledVector(playerFrame.normal, 2.3 + cameraShake);
    camera.position.lerp(cameraPos, 1 - Math.pow(0.0012, dt));
    cameraTarget.copy(playerFrame.point).addScaledVector(playerFrame.tangent, 14 + speedRatio * 5).addScaledVector(playerFrame.right, lateralVelocity * 0.11).addScaledVector(playerFrame.normal, 0.48);
  }
  camera.lookAt(cameraTarget);

  const targetFov = running ? 68 + speedRatio * 14 + Math.abs(lateralVelocity) * 0.45 : 68;
  camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 1 - Math.pow(0.01, dt));
  camera.updateProjectionMatrix();
  const displaySpeed = Math.round(playerSpeed * 3.6);
  speedEl.textContent = String(displaySpeed).padStart(3, "0");
  speedBarEl.style.width = `${speedRatio * 100}%`;
  const position = playerPosition();
  positionEl.textContent = String(position);
  const lap = Math.min(TOTAL_LAPS, Math.floor(playerProgress) + 1);
  lapEl.textContent = String(lap);
  if (lap !== currentLap) {
    saveLap(now);
    lapFrames.length = 0;
    lapStartedAt = now;
    currentLap = lap;
    applyLapTheme(lap);
    showRadioCall(lapAnnouncement(lap, position), lap === TOTAL_LAPS ? 300 : 120);
    if (lap === TOTAL_LAPS) {
      finalLapUntil = now + 3;
      finishBgm.load();
    }
  }
  updateFinalLapVisuals(now);
  scoreEl.textContent = String(Math.floor(score)).padStart(6, "0");
  const finished = playerProgress >= TOTAL_LAPS;
  if (finished) startFinish(now);
  if (audioContext && engineOsc && engineGain && windGain && tireGain) {
    const t = audioContext.currentTime;
    engineOsc.frequency.setTargetAtTime(42 + speedRatio * 92 + (accelerating ? 12 : 0), t, 0.08);
    engineGain.gain.setTargetAtTime(running ? 0.08 + speedRatio * 0.18 : 0, t, 0.12);
    windGain.gain.setTargetAtTime(running ? speedRatio * speedRatio * 0.11 : 0, t, 0.18);
    tireGain.gain.setTargetAtTime(dynamics.offRoad ? 0.18 + speedRatio * 0.12 : drifting ? Math.min(0.22, Math.abs(lateralVelocity) * 0.032) : 0, t, 0.06);
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
  renderer.setPixelRatio(Math.min(devicePixelRatio, reducedEffects ? 1.1 : pixelRatioLimit));
  renderer.setSize(innerWidth, innerHeight);
});
