import { useSyncExternalStore } from 'react';

/**
 * A tiny external store.
 * Discrete state (screens, money, mission) lives here and re-renders React.
 * Per frame values live in `telemetry`, which the HUD reads inside its own
 * animation frame so the React tree is never re-rendered 60 times a second.
 */
let state = {
  ready: false,
  screen: 'start', // start | playing | paused | complete | failed
  money: 0,
  score: 0,
  level: 1,
  missionsDone: 0,
  night: false,
  muted: false,
  cameraMode: 'chase',
  isTouch: false,
  mission: null,
  result: null,
  toasts: [],
};

const listeners = new Set();

export const store = {
  getState: () => state,
  setState(patch) {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  },
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

let toastId = 0;

export function pushToast(text, kind = 'info') {
  const id = ++toastId;
  store.setState({ toasts: [...store.getState().toasts, { id, text, kind }] });
  setTimeout(() => {
    store.setState({ toasts: store.getState().toasts.filter((t) => t.id !== id) });
  }, 2400);
}

/** Mutable per frame values. Never triggers a React render. */
export const telemetry = {
  speed: 0,
  kmh: 0,
  rpm: 0,
  gear: 'N',
  slip: 0,
  x: 0,
  z: 0,
  heading: 0,
  hasTimer: false,
  timeLeft: 0,
  timeLimit: 0,
  hasTarget: false,
  targetX: 0,
  targetZ: 0,
  distance: 0,
  traffic: null,
};

export function useGameState() {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}
