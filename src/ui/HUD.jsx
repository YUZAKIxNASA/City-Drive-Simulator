import React, { useEffect, useRef } from 'react';
import { telemetry, useGameState } from '../state/store.js';
import Speedometer from './Speedometer.jsx';
import Minimap from './Minimap.jsx';

function formatTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

function MissionTimer() {
  const valueRef = useRef(null);
  const barRef = useRef(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      if (!wrapRef.current) return;
      if (!telemetry.hasTimer) {
        wrapRef.current.style.display = 'none';
        return;
      }
      wrapRef.current.style.display = '';
      const left = telemetry.timeLeft;
      if (valueRef.current) valueRef.current.textContent = formatTime(left);
      if (barRef.current) {
        const pct = Math.max(0, Math.min(1, left / Math.max(1, telemetry.timeLimit || left || 1)));
        barRef.current.style.transform = `scaleX(${pct.toFixed(3)})`;
        barRef.current.style.background = left < 10 ? 'var(--redline)' : 'var(--sodium)';
      }
      wrapRef.current.classList.toggle('urgent', left < 10);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div ref={wrapRef} className="mission-timer" style={{ display: 'none' }}>
      <span className="mission-timer-value" ref={valueRef}>
        0:00
      </span>
      <div className="mission-timer-track">
        <div ref={barRef} className="mission-timer-fill" />
      </div>
    </div>
  );
}

export default function HUD({ game }) {
  const state = useGameState();
  const mission = state.mission;

  useEffect(() => {
    telemetry.timeLimit = mission ? mission.timeLimit : 0;
  }, [mission]);

  return (
    <div className={`hud ${state.isTouch ? 'hud-touch' : ''}`}>
      <div className="hud-top">
        <div className="panel wallet">
          <span className="label">balance</span>
          <span className="wallet-value">
            <span className="wallet-currency">$</span>
            {state.money.toLocaleString('en-US')}
          </span>
          <div className="wallet-meta">
            <span>Level {state.level}</span>
            <span className="dot" />
            <span>{state.missionsDone} jobs</span>
          </div>
        </div>

        {mission && (
          <div className="panel mission">
            <div className="mission-head">
              <span className="label">{mission.title}</span>
              <span className="mission-pay">${mission.reward}</span>
            </div>
            <p className="mission-objective">{mission.objective}</p>
            {mission.steps > 1 && (
              <div className="mission-steps">
                {Array.from({ length: mission.steps }).map((_, i) => (
                  <span key={i} className={i < mission.step ? 'step done' : 'step'} />
                ))}
              </div>
            )}
            <MissionTimer />
          </div>
        )}

        <div className="hud-buttons">
          <button type="button" className="icon-btn" onClick={() => game.toggleCamera()} title="Camera (C)">
            {state.cameraMode === 'chase' ? 'CHASE' : 'HOOD'}
          </button>
          <button type="button" className="icon-btn" onClick={() => game.toggleNight()} title="Day / night (N)">
            {state.night ? 'NIGHT' : 'DAY'}
          </button>
          <button type="button" className="icon-btn" onClick={() => game.toggleMute()} title="Sound (M)">
            {state.muted ? 'MUTED' : 'SOUND'}
          </button>
          <button type="button" className="icon-btn" onClick={() => game.pause()} title="Pause (Esc)">
            PAUSE
          </button>
        </div>
      </div>

      <div className="hud-bottom">
        <Minimap game={game} />
        <Speedometer />
      </div>
    </div>
  );
}
