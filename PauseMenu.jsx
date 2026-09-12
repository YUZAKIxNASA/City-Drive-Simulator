import React from 'react';
import { useGameState } from './store.js';

export default function PauseMenu({ game }) {
  const state = useGameState();

  return (
    <div className="overlay dim">
      <div className="card">
        <span className="label">paused</span>
        <h2 className="card-title">Engine idling</h2>

        <div className="stat-row">
          <div className="stat">
            <span className="label">balance</span>
            <strong>${state.money.toLocaleString('en-US')}</strong>
          </div>
          <div className="stat">
            <span className="label">level</span>
            <strong>{state.level}</strong>
          </div>
          <div className="stat">
            <span className="label">jobs done</span>
            <strong>{state.missionsDone}</strong>
          </div>
        </div>

        <div className="card-actions">
          <button type="button" className="btn primary" onClick={() => game.resume()}>
            Resume
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              game.resetCar();
              game.resume();
            }}
          >
            Reset car
          </button>
          <button type="button" className="btn ghost" onClick={() => game.toggleNight()}>
            {state.night ? 'Switch to day' : 'Switch to night'}
          </button>
          <button type="button" className="btn ghost" onClick={() => game.toggleMute()}>
            {state.muted ? 'Unmute' : 'Mute'}
          </button>
          <button type="button" className="btn danger" onClick={() => game.restart()}>
            Restart shift
          </button>
        </div>
      </div>
    </div>
  );
}
