import React from 'react';
import { useGameState } from '../state/store.js';

export default function MissionResult({ game }) {
  const state = useGameState();
  const failed = state.screen === 'failed';
  const result = state.result || {};

  return (
    <div className="overlay dim">
      <div className={`card ${failed ? 'card-fail' : 'card-win'}`}>
        <span className="label">{failed ? 'job failed' : 'job complete'}</span>
        <h2 className="card-title">{failed ? result.reason || 'Job failed' : result.title}</h2>

        {failed ? (
          <p className="card-note">
            The job is off the books. Take it again or pick up a fresh one from dispatch.
          </p>
        ) : (
          <div className="payout">
            <div className="payout-row">
              <span>Fare</span>
              <span>${result.reward}</span>
            </div>
            {result.timeBonus > 0 && (
              <div className="payout-row">
                <span>Time bonus</span>
                <span>+${result.timeBonus}</span>
              </div>
            )}
            <div className="payout-row total">
              <span>Paid</span>
              <span>${result.payout}</span>
            </div>
          </div>
        )}

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
          {failed ? (
            <>
              <button type="button" className="btn primary" onClick={() => game.retryMission()}>
                Try again
              </button>
              <button type="button" className="btn ghost" onClick={() => game.nextMission()}>
                New job
              </button>
            </>
          ) : (
            <button type="button" className="btn primary" onClick={() => game.nextMission()}>
              Next job
            </button>
          )}
          <button type="button" className="btn ghost" onClick={() => game.restart()}>
            Restart shift
          </button>
        </div>
      </div>
    </div>
  );
}
