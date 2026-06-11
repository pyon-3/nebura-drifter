# NEBURA DRIFTER

A lightweight low-poly neon 3D racer built with TypeScript, Vite, Three.js, and WebGL.

## Play

The GitHub Pages deployment is generated automatically from `main`.

## Controls

- Steer: `A` / `D` or arrow keys
- Accelerate: `W` / up arrow
- Brake: `S` / down arrow
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
