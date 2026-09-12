import React from 'react';
import { useGameState } from './store.js';

const KEYS = [
  ['W', 'Accelerate'],
  ['S', 'Brake / reverse'],
  ['A', 'Steer left'],
  ['D', 'Steer right'],
  ['Space', 'Handbrake'],
  ['C', 'Camera'],
  ['R', 'Reset car'],
  ['Esc', 'Pause'],
];

export default function StartScreen({ game }) {
  const state = useGameState();

  return (
    <div className="overlay start">
      <div className="start-inner">
        <div className="start-brand">
          <span className="start-rule" />
          <span className="start-kicker">Night shift · downtown</span>
        </div>

        <h1 className="start-title">
          City<span>Drive</span>
        </h1>
        <p className="start-sub">
          Take the sedan out, work through checkpoint runs, parcel drops, timed routes and
          parking jobs. Watch the signals, watch the traffic, get paid.
        </p>

        <button type="button" className="btn primary big" onClick={() => game.startGame()}>
          Start driving
        </button>

        <div className="start-options">
          <button type="button" className="btn ghost" onClick={() => game.toggleNight()}>
            {state.night ? 'Night city' : 'Daylight'}
          </button>
          <button type="button" className="btn ghost" onClick={() => game.toggleMute()}>
            {state.muted ? 'Sound off' : 'Sound on'}
          </button>
        </div>

        {state.isTouch ? (
          <p className="start-hint">
            On screen pads appear once you start. Landscape gives you the most road.
          </p>
        ) : (
          <div className="start-keys">
            {KEYS.map(([key, description]) => (
              <div key={key} className="start-key">
                <kbd>{key}</kbd>
                <span>{description}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
