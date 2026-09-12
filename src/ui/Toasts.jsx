import React from 'react';
import { useGameState } from '../state/store.js';

export default function Toasts() {
  const { toasts } = useGameState();
  if (!toasts.length) return null;

  return (
    <div className="toasts">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast ${toast.kind}`}>
          {toast.text}
        </div>
      ))}
    </div>
  );
}
