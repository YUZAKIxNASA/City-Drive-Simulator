# City Drive Simulator

A 3D city driving game that runs in the browser. Built with React, Vite and Three.js.
Every asset is generated in code, so there are no textures, models or sound files to
download and the whole project is just three runtime dependencies.

---

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

---

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
- **Beat the clock** - three checkpoints before the timer runs out.
- **Valet duty** - stop inside a marked parking bay and hold still.

You gain a level every three completed jobs. Crashing and running a red light cost money.

## Project layout

```
index.html            page shell and boot splash
server.js             tiny static server for Hostinger Node hosting
vite.config.js        build configuration
src/
  main.jsx            React entry point
  App.jsx             canvas plus overlay screens
  styles.css          the whole visual style
  state/store.js      shared state and per frame telemetry
  game/
    Game.js           renderer, game loop, everything wired together
    config.js         all tuning numbers in one place
    City.js           roads, blocks, buildings, props
    Traffic.js        AI cars
    TrafficLights.js  signal timing
    Vehicle.js        player car model
    VehiclePhysics.js handling model
    CameraRig.js      chase and bonnet cameras
    Collision.js      broad phase and vehicle response
    Missions.js       job generation and scoring
    Environment.js    sky, sun, fog, reflections
    Effects.js        skid marks and objective marker
    AudioEngine.js    synthesised sound
    Controls.js       keyboard and touch input
    textures.js       procedural textures
    carParts.js       car geometry
    geometryUtils.js  geometry helpers
    mathUtils.js      small maths helpers
  ui/                 HUD, speedometer, minimap, menus
```

## Known limitations

- The physics is an arcade handling model, not a full tyre simulation. It is tuned to
  feel good rather than to be accurate.
- The AI cars follow the road network and stop for red lights and for the car in front,
  but they do not react to anything unusual you do. They will happily be pushed around.
- The city is a fixed five by five grid. It is compact on purpose so it stays fast.
- All artwork is procedural, so buildings and cars are stylised rather than photoreal.
- There is no save file. Money and level reset when you reload the page.
- Sound is synthesised with the Web Audio API and only starts after you press
  **Start driving**, because browsers require a click before playing audio.
- Older phones will run it, but expect a lower frame rate. The renderer already lowers
  the pixel ratio, shadow resolution and traffic count on mobile.
