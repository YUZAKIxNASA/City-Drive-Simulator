import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

// StrictMode is deliberately not used here: it mounts effects twice in
// development, which would build the whole 3D world twice.
createRoot(document.getElementById('root')).render(<App />);
