import React, { useCallback, useEffect, useRef } from 'react';

/**
 * Pointer driven pads. Every pad releases on pointerup, pointercancel and
 * pointerleave so a finger sliding off a button never leaves it stuck on.
 */
function Pad({ game, action, className, children, label }) {
  const ref = useRef(null);

  const press = useCallback(
    (event) => {
      event.preventDefault();
      if (ref.current && event.pointerId !== undefined) {
        try {
          ref.current.setPointerCapture(event.pointerId);
        } catch (err) {
          /* capture is optional */
        }
      }
      game.controls.setTouch(action, true);
      if (ref.current) ref.current.classList.add('active');
    },
    [game, action]
  );

  const release = useCallback(
    (event) => {
      if (event) event.preventDefault();
      game.controls.setTouch(action, false);
      if (ref.current) ref.current.classList.remove('active');
    },
    [game, action]
  );

  useEffect(() => () => game.controls.setTouch(action, false), [game, action]);

  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      className={`pad ${className}`}
      onPointerDown={press}
      onPointerUp={release}
      onPointerCancel={release}
      onPointerLeave={release}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </button>
  );
}

export default function TouchControls({ game }) {
  return (
    <div className="touch">
      <div className="touch-left">
        <Pad game={game} action="left" className="pad-steer" label="Steer left">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 4 L7 12 L15 20" />
          </svg>
        </Pad>
        <Pad game={game} action="right" className="pad-steer" label="Steer right">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 4 L17 12 L9 20" />
          </svg>
        </Pad>
      </div>

      <div className="touch-right">
        <div className="touch-secondary">
          <Pad game={game} action="handbrake" className="pad-small" label="Handbrake">
            <span>HAND</span>
          </Pad>
          <button
            type="button"
            className="pad pad-small"
            onClick={() => game.toggleCamera()}
            onContextMenu={(e) => e.preventDefault()}
          >
            <span>CAM</span>
          </button>
          <button
            type="button"
            className="pad pad-small"
            onClick={() => game.resetCar()}
            onContextMenu={(e) => e.preventDefault()}
          >
            <span>RESET</span>
          </button>
        </div>
        <Pad game={game} action="down" className="pad-brake" label="Brake and reverse">
          <span>BRAKE</span>
        </Pad>
        <Pad game={game} action="up" className="pad-gas" label="Accelerate">
          <span>GO</span>
        </Pad>
      </div>
    </div>
  );
}
