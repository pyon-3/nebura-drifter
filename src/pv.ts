import * as THREE from "three";

const film = document.querySelector<HTMLElement>("#film")!;
const startButton = document.querySelector<HTMLButtonElement>("#startFilm")!;
const bgm = document.querySelector<HTMLAudioElement>("#pvBgm")!;
const eyebrow = document.querySelector<HTMLElement>("#eyebrow")!;
const headline = document.querySelector<HTMLElement>("#headline")!;
const subline = document.querySelector<HTMLElement>("#subline")!;
const courseCard = document.querySelector<HTMLElement>("#courseCard")!;
const courseNumber = document.querySelector<HTMLElement>("#courseNumber")!;
const courseName = document.querySelector<HTMLElement>("#courseName")!;
const courseMeta = document.querySelector<HTMLElement>("#courseMeta")!;
const progress = document.querySelector<HTMLElement>("#progress")!;

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.3;
film.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x010208);
scene.fog = new THREE.FogExp2(0x02050d, 0.019);
const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.1, 800);
scene.add(new THREE.HemisphereLight(0x5686b8, 0x06030a, 1.7));
const keyLight = new THREE.DirectionalLight(0xcdefff, 4);
keyLight.position.set(8, 18, 10);
scene.add(keyLight);

const world = new THREE.Group();
scene.add(world);
const grid = new THREE.GridHelper(500, 100, 0x15405b, 0x091522);
grid.position.y = -0.03;
world.add(grid);
const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
const road = new THREE.Mesh(
  new THREE.RingGeometry(20, 31, 128),
  new THREE.MeshStandardMaterial({ color: 0x080c14, roughness: 0.82, metalness: 0.25, side: THREE.DoubleSide }),
);
road.rotation.x = -Math.PI / 2;
world.add(road);
for (const radius of [20.4, 30.6]) {
  const line = new THREE.Mesh(
    new THREE.RingGeometry(radius - 0.09, radius + 0.09, 128),
    new THREE.MeshBasicMaterial({ color: radius < 25 ? 0x24eaff : 0xff3157, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
  );
  line.rotation.x = -Math.PI / 2;
  line.position.y = 0.02;
  world.add(line);
}

const skyline = new THREE.Group();
for (let i = 0; i < 70; i++) {
  const angle = i / 70 * Math.PI * 2;
  const radius = 48 + Math.random() * 60;
  const height = 3 + Math.random() * 18;
  const building = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(3 + Math.random() * 6, height, 3 + Math.random() * 6)),
    new THREE.LineBasicMaterial({ color: i % 4 === 0 ? 0xff3157 : 0x1d8eb4, transparent: true, opacity: 0.38 }),
  );
  building.position.set(Math.cos(angle) * radius, height / 2, Math.sin(angle) * radius);
  skyline.add(building);
}
world.add(skyline);

function carSection(frontZ: number, rearZ: number, bottomY: number, topY: number, frontHalf: number, rearHalf: number) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute([
    -frontHalf, bottomY, frontZ, frontHalf, bottomY, frontZ, -rearHalf, bottomY, rearZ, rearHalf, bottomY, rearZ,
    -frontHalf * .82, topY, frontZ, frontHalf * .82, topY, frontZ, -rearHalf * .82, topY, rearZ, rearHalf * .82, topY, rearZ,
  ], 3));
  g.setIndex([0,1,3,0,3,2,5,4,6,5,6,7,4,0,2,4,2,6,1,5,7,1,7,3,2,3,7,2,7,6,4,5,1,4,1,0]);
  g.computeVertexNormals();
  return g;
}

function makeCar(color: number, sixLights = false) {
  const car = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color, roughness: .3, metalness: .72, flatShading: true });
  const dark = new THREE.MeshStandardMaterial({ color: 0x05070b, roughness: .6, metalness: .5 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x0b263b, roughness: .18, metalness: .7 });
  car.add(new THREE.Mesh(carSection(1.8, -1.72, .22, .63, .86, .9), body));
  car.add(new THREE.Mesh(carSection(.52, -1.1, .62, 1.18, .72, .58), glass));
  for (const z of [-.95, 1.03]) for (const x of [-.92, .92]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(.35, .35, .24, 12), dark);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, .34, z);
    car.add(wheel);
  }
  const wing = new THREE.Mesh(new THREE.BoxGeometry(2.05, .08, .4), dark);
  wing.position.set(0, 1.08, -1.42);
  car.add(wing);
  for (const x of [-.47, .47]) {
    const stay = new THREE.Mesh(new THREE.BoxGeometry(.06, .42, .08), dark);
    stay.position.set(x, .86, -1.42);
    car.add(stay);
  }
  const lightCount = sixLights ? 6 : 2;
  const glowMaterial = new THREE.MeshBasicMaterial({ color: 0xff1748 });
  for (let i = 0; i < lightCount; i++) {
    const x = lightCount === 6 ? -.62 + i * .248 : -.52 + i * 1.04;
    const light = new THREE.Mesh(new THREE.BoxGeometry(lightCount === 6 ? .16 : .43, .12, .045), glowMaterial);
    light.position.set(x, .58, -1.77);
    car.add(light);
  }
  car.userData.glowMaterial = glowMaterial;
  return car;
}

const hero = makeCar(0x8a1439, true);
world.add(hero);
const rival = makeCar(0x126485);
world.add(rival);
const packColors = [0xe4aa28, 0x7c45b8, 0x2874d0, 0xc9437e, 0x31a06b, 0xe06c24];
const pack = packColors.map((color, i) => {
  const car = makeCar(color, i % 2 === 0);
  world.add(car);
  return car;
});

const trail = new THREE.Line(
  new THREE.BufferGeometry(),
  new THREE.LineBasicMaterial({ color: 0xff3157, transparent: true, opacity: .7 }),
);
world.add(trail);
const trailPoints: THREE.Vector3[] = [];
const clock = new THREE.Clock();
const duration = 36;
let started = false;
let filmTime = 0;

const courses = [
  ["01", "NEON GRID", "2.0 KM // HIGH SPEED"],
  ["02", "RIDGE HELIX", "2.4 KM // TECHNICAL"],
  ["03", "BLUE NEON SHIFT", "3.6 KM // EXPERT"],
  ["04", "QUIET LAKE", "4.2 KM // EXTREME"],
];

function setCaption(kicker: string, title: string, detail: string) {
  eyebrow.textContent = kicker;
  headline.textContent = title;
  subline.textContent = detail;
}

function placeOnCircle(car: THREE.Object3D, angle: number, radius: number, slide = 0) {
  car.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
  car.rotation.y = -angle + Math.PI / 2 + slide;
}

function lookAtCar(car: THREE.Object3D, offset: THREE.Vector3, lerp = 1) {
  const target = car.position.clone().add(new THREE.Vector3(0, .6, 0));
  const desired = offset.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), car.rotation.y).add(car.position);
  camera.position.lerp(desired, lerp);
  camera.lookAt(target);
}

function updateFilm(t: number, dt: number) {
  const section = t < 5 ? 0 : t < 13 ? 1 : t < 20 ? 2 : t < 30 ? 3 : 4;
  courseCard.style.opacity = section === 3 ? "1" : "0";
  hero.visible = section !== 3 || Math.floor((t - 20) / 2.5) === 3;
  rival.visible = section === 2 || section === 4;
  pack.forEach(car => car.visible = section === 4);
  skyline.rotation.y += dt * .012;

  if (section === 0) {
    setCaption("REALTIME CONCEPT FILM", "WAKE THE NIGHT", "SIX LIGHTS // ONE SIGNAL");
    hero.visible = true;
    hero.position.set(0, 0, 0);
    hero.rotation.y = 0;
    const pulse = .7 + Math.sin(t * 7) * .3;
    (hero.userData.glowMaterial as THREE.MeshBasicMaterial).color.setRGB(1, .02 + pulse * .09, .12 + pulse * .15);
    camera.position.set(Math.sin(t * .2) * 2.3, .7, -6.2 + t * .42);
    camera.lookAt(0, .58, -1);
  } else if (section === 1) {
    setCaption("DRIFT SEQUENCE", "CONTROL THE CHAOS", "CONSTANT RADIUS // FULL COMMIT");
    const p = t - 5;
    const angle = p * .72;
    placeOnCircle(hero, angle, 25, -.43);
    trailPoints.push(hero.position.clone().setY(.08));
    if (trailPoints.length > 150) trailPoints.shift();
    trail.geometry.setFromPoints(trailPoints);
    trail.visible = true;
    const close = Math.sin(p * .55) > .15;
    lookAtCar(hero, close ? new THREE.Vector3(4.5, 1.1, -5.5) : new THREE.Vector3(11, 4.2, -12), .09);
  } else if (section === 2) {
    setCaption("RIVAL CONTACT", "NO ROOM LEFT", "IMPACT // RECOVER // ATTACK");
    trail.visible = false;
    const p = t - 13;
    const angle = .4 + p * .48;
    placeOnCircle(hero, angle, 25, -.18);
    placeOnCircle(rival, angle + .055 - Math.max(0, p - 2.3) * .015, 23.7, -.06);
    const impact = Math.abs(p - 2.3) < .15;
    const shake = impact ? .45 : 0;
    lookAtCar(hero, new THREE.Vector3(-5.8 + (Math.random() - .5) * shake, 1.3, -7), .2);
  } else if (section === 3) {
    const index = Math.min(3, Math.floor((t - 20) / 2.5));
    const local = (t - 20) % 2.5;
    const [number, name, meta] = courses[index];
    courseNumber.textContent = `COURSE ${number}`;
    courseName.textContent = name;
    courseMeta.textContent = meta;
    setCaption("", "", "");
    world.rotation.y = index * 1.35 + local * .12;
    camera.position.set(32 - local * 5, 11 + index * 2.5, 38 - index * 9);
    camera.lookAt(0, 0, 0);
    gridMaterials.forEach(material => {
      material.color.setHex(index === 3 ? 0x225c71 : 0x16334c);
      material.transparent = true;
      material.opacity = .5;
    });
  } else {
    setCaption("NEBURA DRIFTER", "CHASE THE AFTERGLOW", "FOUR COURSES // EIGHT RACERS");
    world.rotation.y = 0;
    trail.visible = false;
    const p = t - 30;
    const allCars = [hero, rival, ...pack];
    allCars.forEach((car, i) => {
      car.visible = true;
      const lane = (i % 2 ? 1 : -1) * (22.5 + Math.floor(i / 2) * 1.6);
      placeOnCircle(car, 4.2 + p * (.42 + i * .006) - i * .06, lane, -.1);
    });
    lookAtCar(hero, new THREE.Vector3(8 + p * 1.2, 3.2, -11), .07);
  }
  progress.style.width = `${t / duration * 100}%`;
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), .05);
  if (started) {
    filmTime = (filmTime + dt) % duration;
    updateFilm(filmTime, dt);
  } else {
    camera.position.set(0, 2.2, -7);
    camera.lookAt(0, .5, 0);
    hero.rotation.y += dt * .12;
  }
  renderer.render(scene, camera);
}

startButton.addEventListener("click", () => {
  started = true;
  filmTime = 0;
  startButton.classList.add("hidden");
  bgm.volume = .65;
  void bgm.play();
});

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

animate();
