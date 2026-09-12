import React, { useEffect, useRef } from 'react';
import { telemetry } from './store.js';

const SIZE = 156;
const SCALE = 0.6; // pixels per metre, so the disc covers roughly 130 m

export default function Minimap({ game }) {
  const canvasRef = useRef(null);
  const distanceRef = useRef(null);
  const northRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = SIZE * dpr;
    canvas.height = SIZE * dpr;
    ctx.scale(dpr, dpr);

    const map = game.getMapData();
    const cx = SIZE / 2;
    const cy = SIZE / 2;
    const radius = SIZE / 2 - 2;
    let frame = 0;

    // World point to canvas point, rotated so the car always faces up.
    const project = (wx, wz, px, pz, cos, sin) => {
      const dx = (wx - px) * SCALE;
      const dz = (wz - pz) * SCALE;
      return [cx + dx * cos - dz * sin, cy - (dx * sin + dz * cos)];
    };

    const draw = () => {
      frame = requestAnimationFrame(draw);
      const px = telemetry.x;
      const pz = telemetry.z;
      const cos = Math.cos(telemetry.heading);
      const sin = Math.sin(telemetry.heading);

      ctx.save();
      ctx.clearRect(0, 0, SIZE, SIZE);
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.clip();

      ctx.fillStyle = '#0a0e15';
      ctx.fillRect(0, 0, SIZE, SIZE);

      // Roads.
      ctx.strokeStyle = '#232a36';
      ctx.lineWidth = map.roadWidth * SCALE;
      ctx.lineCap = 'butt';
      ctx.beginPath();
      for (const z of map.coords) {
        const [ax, ay] = project(-map.roadEnd, z, px, pz, cos, sin);
        const [bx, by] = project(map.roadEnd, z, px, pz, cos, sin);
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
      }
      for (const x of map.coords) {
        const [ax, ay] = project(x, -map.roadEnd, px, pz, cos, sin);
        const [bx, by] = project(x, map.roadEnd, px, pz, cos, sin);
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
      }
      ctx.stroke();

      // Centre lines, drawn thin over the tarmac.
      ctx.strokeStyle = 'rgba(255,255,255,0.09)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Traffic.
      const traffic = telemetry.traffic;
      if (traffic) {
        ctx.fillStyle = '#7f8ea6';
        for (let i = 0; i < traffic.length; i += 2) {
          const [tx, ty] = project(traffic[i], traffic[i + 1], px, pz, cos, sin);
          if (tx < -8 || ty < -8 || tx > SIZE + 8 || ty > SIZE + 8) continue;
          ctx.beginPath();
          ctx.arc(tx, ty, 2.1, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Objective, clamped to the rim when it is off the disc.
      if (telemetry.hasTarget) {
        let [gx, gy] = project(telemetry.targetX, telemetry.targetZ, px, pz, cos, sin);
        const vx = gx - cx;
        const vy = gy - cy;
        const len = Math.hypot(vx, vy);
        const edge = len > radius - 10;
        if (edge) {
          const k = (radius - 10) / len;
          gx = cx + vx * k;
          gy = cy + vy * k;
        }
        ctx.fillStyle = '#ff9d3c';
        if (edge) {
          const angle = Math.atan2(vy, vx);
          ctx.save();
          ctx.translate(gx, gy);
          ctx.rotate(angle);
          ctx.beginPath();
          ctx.moveTo(7, 0);
          ctx.lineTo(-5, 5);
          ctx.lineTo(-5, -5);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        } else {
          ctx.beginPath();
          ctx.arc(gx, gy, 4.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,157,60,0.4)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(gx, gy, 8.5, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // Player.
      ctx.fillStyle = '#8fd8ff';
      ctx.beginPath();
      ctx.moveTo(cx, cy - 7);
      ctx.lineTo(cx + 5, cy + 6);
      ctx.lineTo(cx, cy + 3);
      ctx.lineTo(cx - 5, cy + 6);
      ctx.closePath();
      ctx.fill();

      ctx.restore();

      if (distanceRef.current) {
        distanceRef.current.textContent = telemetry.hasTarget
          ? `${Math.round(telemetry.distance)} m`
          : '--';
      }
      if (northRef.current) {
        northRef.current.style.transform = `rotate(${(-telemetry.heading).toFixed(3)}rad)`;
      }
    };

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [game]);

  return (
    <div className="minimap">
      <canvas ref={canvasRef} style={{ width: SIZE, height: SIZE }} />
      <div className="minimap-ring" />
      <div ref={northRef} className="minimap-north">
        <span>N</span>
      </div>
      <div className="minimap-distance">
        <span ref={distanceRef}>--</span>
      </div>
    </div>
  );
}
