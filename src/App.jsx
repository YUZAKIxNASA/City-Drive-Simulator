import React, { useEffect, useRef, useState } from 'react';
import { Game } from './game/Game.js';
import { useGameState } from './state/store.js';
import HUD from './ui/HUD.jsx';
import StartScreen from './ui/StartScreen.jsx';
import PauseMenu from './ui/PauseMenu.jsx';
import MissionResult from './ui/MissionResult.jsx';
import TouchControls from './ui/TouchControls.jsx';
import Toasts from './ui/Toasts.jsx';

export default function App() {
  const canvasRef = useRef(null);
  const [game, setGame] = useState(null);
  const [error, setError] = useState(null);
  const state = useGameState();

  useEffect(() => {
    const boot = document.getElementById('boot');
    let instance = null;
    try {
      instance = new Game(canvasRef.current);
      instance.init();
      setGame(instance);
    } catch (err) {
      console.error(err);
      setError(err && err.message ? err.message : 'WebGL could not start');
    }
    if (boot) boot.remove();

    return () => {
      if (instance) instance.dispose();
    };
  }, []);

  return (
    <div className="app">
      <canvas ref={canvasRef} className="viewport" />

      {error && (
        <div className="fatal">
          <h1>This browser could not start the game</h1>
          <p>{error}</p>
          <p>Try a recent version of Chrome, Edge, Firefox or Safari with hardware acceleration on.</p>
        </div>
      )}

      {game && !error && (
        <>
          {state.screen === 'playing' && <HUD game={game} />}
          {state.screen === 'playing' && state.isTouch && <TouchControls game={game} />}
          {state.screen === 'start' && <StartScreen game={game} />}
          {state.screen === 'paused' && <PauseMenu game={game} />}
          {(state.screen === 'complete' || state.screen === 'failed') && <MissionResult game={game} />}
          <Toasts />
        </>
      )}
    </div>
  );
}
