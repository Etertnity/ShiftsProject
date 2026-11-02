import React from 'react';

// Сцена в координатах viewBox; при любом размере окна прижата к правому нижнему углу
const W = 1600;
const H = 1000;
const GX = 1330; // центр глобуса
const GY = 860;
const R = 330;

const PARALLELS = [-60, -30, 0, 30, 60];
const MERIDIANS = 6; // через 30°: при вращении линии сужаются и расширяются
const TURN = 48; // секунд на пол-оборота

// rx меридиана за пол-оборота: R·|sin θ| с шагом 30°
const MERIDIAN_RX = [0, 0.5, 0.866, 1, 0.866, 0.5, 0].map((k) => Math.round(R * k)).join(';');

const ORBITS = [
  { rx: 470, ry: 120, tilt: -16, dur: 70, sats: 2 },
  { rx: 860, ry: 230, tilt: -9, dur: 140, sats: 1 },
];

// Наземные станции (телепорты) на видимой стороне глобуса
const STATIONS = [
  { x: GX - 190, y: GY - 210, delay: 0 },
  { x: GX - 60, y: GY - 300, delay: 2.6 },
  { x: GX - 270, y: GY - 60, delay: 5.1 },
];

const orbitPath = (rx: number, ry: number) =>
  `M ${GX - rx} ${GY} A ${rx} ${ry} 0 1 1 ${GX + rx} ${GY} A ${rx} ${ry} 0 1 1 ${GX - rx} ${GY} Z`;

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Фон всех страниц: тонкий каркасный глобус в правом нижнем углу, орбиты со спутниками связи
 * и редкие «пинги» наземных станций. Почти прозрачный и медленный — заметен только на полях вокруг
 * карточек. Чистый SVG без WebGL; при «уменьшить движение» всё стоит на месте.
 */
const VsatBackdrop: React.FC = () => {
  const moving = !reducedMotion();
  return (
    <div aria-hidden className="vsat-backdrop pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMaxYMax slice"
        className="h-full w-full text-navy-900/[0.10] dark:text-sky-300/[0.16]"
        focusable="false"
      >
        <defs>
          <radialGradient id="vsat-globe-glow" cx="35%" cy="30%" r="75%">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.5" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </radialGradient>
          {ORBITS.map((orbit, index) => (
            <path key={index} id={`vsat-orbit-${index}`} d={orbitPath(orbit.rx, orbit.ry)} />
          ))}
        </defs>

        {/* Глобус: свечение, контур, параллели и вращающиеся меридианы */}
        <g transform={`rotate(-14 ${GX} ${GY})`} fill="none" stroke="currentColor" strokeWidth={1.2}>
          <circle cx={GX} cy={GY} r={R} fill="url(#vsat-globe-glow)" stroke="none" />
          <circle cx={GX} cy={GY} r={R} strokeWidth={1.6} />
          {PARALLELS.map((lat) => {
            const rad = (lat * Math.PI) / 180;
            const rx = R * Math.cos(rad);
            return <ellipse key={lat} cx={GX} cy={GY - R * Math.sin(rad)} rx={rx} ry={rx * 0.16} />;
          })}
          {Array.from({ length: MERIDIANS }, (_, index) => (
            <ellipse key={index} cx={GX} cy={GY} rx={R * Math.abs(Math.sin((index * Math.PI) / MERIDIANS))} ry={R}>
              {moving && (
                <animate
                  attributeName="rx"
                  values={MERIDIAN_RX}
                  dur={`${TURN}s`}
                  begin={`${-(index * TURN) / MERIDIANS}s`}
                  repeatCount="indefinite"
                />
              )}
            </ellipse>
          ))}
        </g>

        {/* Орбиты и спутники */}
        {ORBITS.map((orbit, index) => (
          <g key={index} transform={`rotate(${orbit.tilt} ${GX} ${GY})`}>
            <use href={`#vsat-orbit-${index}`} fill="none" stroke="currentColor" strokeWidth={1.4} strokeOpacity={0.9} />
            {Array.from({ length: orbit.sats }, (_, sat) => (
              <g key={sat} transform={moving ? undefined : `translate(${GX - orbit.rx} ${GY})`}>
                {moving && (
                  <animateMotion dur={`${orbit.dur}s`} begin={`${-(sat * orbit.dur) / orbit.sats}s`} repeatCount="indefinite">
                    <mpath href={`#vsat-orbit-${index}`} />
                  </animateMotion>
                )}
                {/* Спутник: корпус, две солнечные панели и мягкое свечение */}
                <g transform="scale(1.7)">
                  <circle r={14} fill="currentColor" opacity={0.35} />
                  <g className="text-accent-500/50 dark:text-accent-400/70">
                    <rect x={-4} y={-4} width={8} height={8} rx={1.5} fill="currentColor" />
                  </g>
                  <rect x={-17} y={-2.5} width={11} height={5} fill="currentColor" />
                  <rect x={6} y={-2.5} width={11} height={5} fill="currentColor" />
                </g>
              </g>
            ))}
          </g>
        ))}

        {/* Наземные станции: точка и расходящееся кольцо раз в несколько секунд */}
        <g className="text-accent-500/40 dark:text-accent-400/45">
          {STATIONS.map((station) => (
            <g key={`${station.x}-${station.y}`}>
              <circle cx={station.x} cy={station.y} r={3.5} fill="currentColor" />
              {moving && (
                <circle cx={station.x} cy={station.y} r={4} fill="none" stroke="currentColor" strokeWidth={1.5}>
                  <animate attributeName="r" values="4;34" dur="7.5s" begin={`${station.delay}s`} repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.9;0" dur="7.5s" begin={`${station.delay}s`} repeatCount="indefinite" />
                </circle>
              )}
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
};

export default VsatBackdrop;
