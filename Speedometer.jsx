import React, { useEffect, useRef } from 'react';
import { telemetry } from '../state/store.js';

const MAX_KMH = 220;
const START = 150; // degrees, 0 points right and angles run clockwise
const SWEEP = 240;
const R = 84;
const CX = 100;
const CY = 100;

const rad = (deg) => (deg * Math.PI) / 180;
const pointOn = (radius, deg) => [CX + radius * Math.cos(rad(deg)), CY + radius * Math.sin(rad(deg))];

function arcPath(radius, fromDeg, toDeg) {
  const [x0, y0] = pointOn(radius, fromDeg);
  const [x1, y1] = pointOn(radius, toDeg);
  const large = Math.abs(toDeg - fromDeg) > 180 ? 1 : 0;
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${radius} ${radius} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

const ARC_LENGTH = R * rad(SWEEP);
const REDLINE_FROM = START + (170 / MAX_KMH) * SWEEP;

const ticks = [];
for (let v = 0; v <= MAX_KMH; v += 10) {
  const deg = START + (v / MAX_KMH) * SWEEP;
  const major = v % 40 === 0;
  const [x0, y0] = pointOn(R - (major ? 13 : 7), deg);
  const [x1, y1] = pointOn(R - 1, deg);
  ticks.push({ v, deg, x0, y0, x1, y1, major });
}

export default function Speedometer() {
  const needleRef = useRef(null);
  const fillRef = useRef(null);
  const digitsRef = useRef(null);
  const gearRef = useRef(null);
  const rpmRef = useRef(null);

  useEffect(() => {
    let frame = 0;
    let shown = 0;

    const tick = () => {
      frame = requestAnimationFrame(tick);
      // Needle inertia: the dial always lags the raw value slightly.
      shown += (telemetry.kmh - shown) * 0.18;
      const clamped = Math.max(0, Math.min(MAX_KMH, shown));
      const deg = START + (clamped / MAX_KMH) * SWEEP;

      if (needleRef.current) {
        needleRef.current.setAttribute('transform', `rotate(${(deg + 90).toFixed(2)} ${CX} ${CY})`);
      }
      if (fillRef.current) {
        const len = (clamped / MAX_KMH) * ARC_LENGTH;
        fillRef.current.setAttribute('stroke-dasharray', `${len.toFixed(1)} ${ARC_LENGTH.toFixed(1)}`);
      }
      if (digitsRef.current) digitsRef.current.textContent = String(Math.round(telemetry.kmh));
      if (gearRef.current) gearRef.current.textContent = telemetry.gear;
      if (rpmRef.current) {
        const pct = Math.max(0, Math.min(1, (telemetry.rpm - 800) / 6100));
        rpmRef.current.style.transform = `scaleX(${pct.toFixed(3)})`;
        rpmRef.current.style.background = pct > 0.86 ? 'var(--redline)' : 'var(--xenon)';
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="cluster">
      <svg viewBox="0 0 200 200" className="cluster-dial" aria-hidden="true">
        <circle cx={CX} cy={CY} r={94} className="dial-face" />
        <path d={arcPath(R, START, START + SWEEP)} className="dial-track" />
        <path d={arcPath(R, REDLINE_FROM, START + SWEEP)} className="dial-redline" />
        <path
          ref={fillRef}
          d={arcPath(R, START, START + SWEEP)}
          className="dial-fill"
          strokeDasharray={`0 ${ARC_LENGTH}`}
        />
        {ticks.map((t) => (
          <line
            key={t.v}
            x1={t.x0}
            y1={t.y0}
            x2={t.x1}
            y2={t.y1}
            className={t.major ? 'tick major' : 'tick'}
          />
        ))}
        {ticks
          .filter((t) => t.major)
          .map((t) => {
            const [lx, ly] = pointOn(R - 26, t.deg);
            return (
              <text key={`l-${t.v}`} x={lx} y={ly + 4} className="tick-label">
                {t.v}
              </text>
            );
          })}
        <g ref={needleRef} transform={`rotate(${START + 90} ${CX} ${CY})`}>
          <polygon points={`${CX - 3.2},${CY} ${CX + 3.2},${CY} ${CX},${CY - R + 8}`} className="needle" />
        </g>
        <circle cx={CX} cy={CY} r={9} className="needle-hub" />
      </svg>

      <div className="cluster-readout">
        <span ref={digitsRef} className="cluster-speed">
          0
        </span>
        <span className="cluster-unit">km/h</span>
      </div>

      <div className="cluster-gear">
        <span className="cluster-gear-label">gear</span>
        <span ref={gearRef} className="cluster-gear-value">
          N
        </span>
        <div className="rpm-track">
          <div ref={rpmRef} className="rpm-fill" />
        </div>
      </div>
    </div>
  );
}
