# City Drive Simulator

A 3D city driving game that runs in the browser. Built with React, Vite and Three.js.
Every asset is generated in code, so there are no textures, models or sound files to
download and the whole project is just three runtime dependencies.


## 1. Install the dependencies

You need [Node.js](https://nodejs.org) version 18 or newer.

```bash
npm install
```

## 2. Run it locally

```bash
npm run dev
```

Open the address Vite prints, normally <http://localhost:5173>. The page reloads
automatically while you edit files.

## 3. Build for production

```bash
npm run build
```

This creates a `dist/` folder with the finished site. To check the build before you
upload it:

```bash
npm run preview
```

## 4. Deploy to Hostinger

The project works on Hostinger's **Node.js hosting** and on ordinary **shared hosting**.
Pick whichever you have.

### Option A - Node.js hosting (uses the included server)

1. Push the project to a Git repository, or upload the whole folder with the File Manager
   or FTP (you can leave out `node_modules` and `dist`).
2. In hPanel open **Website → Node.js** and create an application.
3. Set these values:
   - **Application root**: the folder you uploaded
   - **Startup file**: `server.js`
   - **Node version**: 18 or newer
4. Run the install and build commands from the panel's terminal:
   ```bash
   npm install
   npm run build
   ```
5. Start the application. `server.js` serves the `dist/` folder, listens on the `PORT`
   that Hostinger provides and falls back to `index.html` for unknown paths.

### Option B - Shared hosting (static files only)

1. Run `npm run build` on your own computer.
2. Open the `dist/` folder and upload **its contents** (not the folder itself) into
   `public_html` using the File Manager or FTP.
3. That is all. `vite.config.js` sets `base: './'`, so the game also works from a
   subfolder such as `public_html/drive`.


## Controls

| Keyboard | Action |
| --- | --- |
| `W` / `↑` | Accelerate |
| `S` / `↓` | Brake, then reverse |
| `A` / `←` | Steer left |
| `D` / `→` | Steer right |
| `Space` | Handbrake |
| `C` | Switch chase and bonnet camera |
| `R` | Put the car back on the road |
| `N` | Day or night |
| `M` | Mute |
| `Esc` | Pause |

On phones and tablets the on screen pads appear automatically once you start driving.
They work in portrait and landscape.

## The jobs

Four job types repeat in a loop and pay more as your level rises:

- **Checkpoint run** - reach the marker.
- **Parcel run** - collect at the first marker, deliver at the second.
- **Beat the clock** - reach three checkpoints before the timer runs out.
- **Valet duty** - stop inside a marked parking bay and hold still.

You gain a level every three completed jobs. Crashing and running a red light cost money.

## Project structure

```
City-Drive-Simulator/
├── index.html                 Vite HTML shell and boot screen
├── package.json               Scripts and dependencies
├── vite.config.js             Vite configuration
├── server.js                  Production static server
├── README.md                  Project documentation
├── src/
│   ├── main.jsx               React entry point
│   ├── App.jsx                Canvas host and UI composition root
│   ├── styles.css             Global visual styles
│   ├── state/
│   │   └── store.js           Shared state and frame telemetry
│   ├── game/
│   │   ├── Game.js            Renderer, loop, and system coordinator
│   │   ├── config.js          Tuning values, colors, signals, and rewards
│   │   ├── City.js            Roads, buildings, props, and colliders
│   │   ├── Traffic.js         Non-player traffic and road following
│   │   ├── TrafficLights.js   Signal timing and light state
│   │   ├── Vehicle.js         Player vehicle scene object
│   │   ├── VehiclePhysics.js  Arcade movement calculations
│   │   ├── CameraRig.js       Chase and bonnet cameras
│   │   ├── Collision.js       Collision detection and response
│   │   ├── Missions.js        Mission generation and scoring
│   │   ├── Environment.js     Sky, fog, sun, and lighting
│   │   ├── Effects.js         Skid marks and objective markers
│   │   ├── AudioEngine.js     Synthesised audio
│   │   ├── Controls.js        Keyboard and touch input
│   │   ├── textures.js        Procedural textures
│   │   ├── carParts.js        Vehicle geometry and materials
│   │   ├── geometryUtils.js   Three.js geometry helpers
│   │   └── mathUtils.js       Shared math helpers
│   └── ui/
│       ├── HUD.jsx            In-game overlay
│       ├── Speedometer.jsx    Speed and driving telemetry
│       ├── Minimap.jsx        Player, target, and traffic map
│       ├── StartScreen.jsx    Initial game screen
│       ├── PauseMenu.jsx      Pause controls
│       ├── MissionResult.jsx  Mission outcome screen
│       ├── TouchControls.jsx  Mobile controls
│       └── Toasts.jsx         Status notifications
```

The source tree is separated by responsibility: `src/game/` owns simulation and
Three.js rendering, `src/ui/` owns React presentation, and `src/state/` is the
shared boundary between the two.

## Architecture and data flow

1. `index.html` loads `src/main.jsx`.
2. `main.jsx` mounts `App` with React.
3. `App.jsx` creates one `Game` instance against the canvas and selects overlays
    from the shared store.
4. `Game.init()` creates the renderer, scene, camera, city, traffic, vehicle,
    missions, controls, effects, and audio engine.
5. `Game.loop()` advances the fixed-step simulation and renders the scene.
6. Discrete values such as screen, money, mission, level, and settings are written
    to `src/state/store.js`.
7. Fast-changing values such as speed, RPM, position, and target distance are
    written to `telemetry`, which HUD components read without forcing a React tree
    render every frame.

The dependency direction is:

```text
src/main.jsx -> src/App.jsx -> src/game/Game.js
                                     └──> src/ui/* -> src/state/store.js
src/game/Game.js --------┘
```

### System responsibilities

- `City.js` builds the five-by-five road grid, buildings, props, and collision boxes.
- `Vehicle.js` owns the visible car; `VehiclePhysics.js` calculates its movement.
- `Traffic.js` advances AI cars; `TrafficLights.js` controls signal phases.
- `Missions.js` creates jobs and evaluates progress and rewards.
- `Environment.js` controls the scene atmosphere and day/night lighting.
- `Controls.js` normalizes keyboard and touch input into game commands.
- `AudioEngine.js` synthesizes engine and event sounds after user interaction.

## Development conventions

- Keep simulation and Three.js changes inside `src/game/`.
- Keep display and interaction components inside `src/ui/`.
- Put persistent cross-layer state in `src/state/store.js`.
- Put tunable gameplay values in `src/game/config.js` instead of scattering magic
   numbers through system code.
- Do not edit `dist/` directly; regenerate it with `npm run build`.

## Troubleshooting

### Vite cannot find `src/main.jsx`

Run commands from the project root and confirm `src/main.jsx` exists. The script
in `index.html` must point to `/src/main.jsx`.

### The page is blank or WebGL fails

Use a current browser, enable hardware acceleration, and check the browser console
for a WebGL error. Older mobile devices may not support every renderer feature.

### `npm start` says the build is missing

Run `npm run build` first. The production server serves only the generated `dist/`
folder and does not compile source files.

### Audio does not play

Click **Start driving** first. Browsers block Web Audio until the page receives a
user gesture.

### Deployment still shows an old version

Run a fresh build and upload the contents of `dist/`. Hashed assets are cached by
design, while `index.html` is served without caching.

## Known limitations

- The physics is an arcade handling model, not a full tire simulation.
- Traffic follows the prepared road network and does not understand every unusual
   player behavior.
- The city is fixed to a compact five-by-five grid.
- Procedural artwork is stylized rather than photorealistic.
- Money, score, level, and mission progress reset when the page reloads.
- Older phones may have a lower frame rate despite mobile renderer adjustments.
