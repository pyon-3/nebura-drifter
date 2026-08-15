# NEBURA DRIFTER

A lightweight low-poly neon 3D racer built with TypeScript, Vite, Three.js, and WebGL.

The current renderer uses textured asphalt and solid, lit environment geometry
for all four courses. Neon lines remain as restrained edge and gameplay accents
rather than the primary wireframe rendering mode.

## Play

The GitHub Pages deployment is generated automatically from `main`.

## Controls

- Steer: left / right arrow keys
- Accelerate: `Z`
- Brake: `X`
- Mobile: drag to steer and use the on-screen pedals

## Development

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
npm run inline
```

## Vehicle Dynamics

The lightweight dynamic bicycle model is informed by the MIT-licensed
[carphysics2d](https://github.com/spacejack/carphysics2d) project. It models
front/rear slip angles, axle load transfer, lateral tire-force limits,
aerodynamic drag, rolling resistance, and speed-sensitive steering.
