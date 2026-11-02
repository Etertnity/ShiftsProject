import React, { useEffect, useRef } from 'react';
import clsx from 'clsx';
import createGlobe, { Arc, Marker } from 'cobe';

/** Порты, куда ходят суда флота: широта, долгота. Только для красоты — координаты судов мы не получаем. */
const PORTS: Record<string, [number, number]> = {
  novorossiysk: [44.72, 37.77],
  spb: [59.93, 30.31],
  ustluga: [59.68, 28.4],
  murmansk: [68.97, 33.07],
  kaliningrad: [54.71, 20.51],
  vladivostok: [43.12, 131.88],
  nakhodka: [42.82, 132.87],
  shanghai: [31.23, 121.47],
  singapore: [1.29, 103.85],
  dubai: [25.27, 55.3],
  rotterdam: [51.92, 4.48],
  suez: [29.97, 32.55],
};

const ROUTES: [string, string][] = [
  ['spb', 'rotterdam'],
  ['novorossiysk', 'suez'],
  ['suez', 'dubai'],
  ['dubai', 'singapore'],
  ['singapore', 'shanghai'],
  ['vladivostok', 'shanghai'],
  ['murmansk', 'rotterdam'],
  ['nakhodka', 'singapore'],
];

const GOLD: [number, number, number] = [0.96, 0.72, 0.19];
const CYAN: [number, number, number] = [0.35, 0.78, 1.0];

const MARKERS: Marker[] = Object.values(PORTS).map((location) => ({ location, size: 0.035 }));
const ARCS: Arc[] = ROUTES.map(([from, to]) => ({ from: PORTS[from], to: PORTS[to] }));

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Вращающийся глобус с портами и морскими маршрутами (библиотека cobe, MIT, ~19 КБ, WebGL).
 * Крутится только когда виден и вкладка активна; можно повернуть пальцем или мышью.
 * При уходе со страницы WebGL-контекст освобождается явно — браузер держит их ограниченное число.
 */
const FleetGlobe: React.FC<{ className?: string }> = ({ className }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    // Новый холст на каждый запуск эффекта: «отпущенный» WebGL-холст повторно не оживает
    const canvas = document.createElement('canvas');
    canvas.className = 'block aspect-square w-full cursor-grab touch-pan-y opacity-0 transition-opacity duration-1000 active:cursor-grabbing';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Глобус с портами и морскими маршрутами');
    container.appendChild(canvas);
    const reduced = prefersReducedMotion();
    let size = Math.max(1, canvas.offsetWidth);
    let phi = 1.4; // стартуем над Европой и Россией
    let frame = 0;
    let visible = true;
    let dragX: number | null = null;
    let dragPhi = 0;

    const globe = createGlobe(canvas, {
      devicePixelRatio: Math.min(window.devicePixelRatio || 1, 2),
      width: size,
      height: size,
      phi,
      theta: 0.32,
      dark: 1,
      diffuse: 1.15,
      mapSamples: 14000,
      mapBrightness: 5.5,
      baseColor: [0.16, 0.27, 0.45],
      markerColor: GOLD,
      glowColor: [0.12, 0.25, 0.48],
      markers: MARKERS,
      arcs: ARCS,
      arcColor: CYAN,
      arcWidth: 0.55,
      arcHeight: 0.22,
      markerElevation: 0.01,
      opacity: 0.92,
    });
    canvas.style.opacity = '1';

    const loop = () => {
      if (dragX === null && !reduced) phi += 0.0025;
      globe.update({ phi: phi + dragPhi });
      frame = visible && !document.hidden && (!reduced || dragX !== null) ? requestAnimationFrame(loop) : 0;
    };
    const kick = () => {
      if (!frame && visible && !document.hidden) frame = requestAnimationFrame(loop);
    };
    kick();

    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      kick();
    });
    observer.observe(canvas);
    const resizeObserver = new ResizeObserver(() => {
      const next = Math.max(1, canvas.offsetWidth);
      if (next !== size) {
        size = next;
        globe.update({ width: size, height: size });
        kick();
      }
    });
    resizeObserver.observe(canvas);
    document.addEventListener('visibilitychange', kick);

    // Поворот перетаскиванием: накопленный сдвиг остаётся после отпускания
    const onDown = (event: PointerEvent) => {
      dragX = event.clientX;
      canvas.setPointerCapture(event.pointerId);
      kick();
    };
    const onMove = (event: PointerEvent) => {
      if (dragX === null) return;
      dragPhi += (event.clientX - dragX) / 180;
      dragX = event.clientX;
    };
    const onUp = () => {
      dragX = null;
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      resizeObserver.disconnect();
      document.removeEventListener('visibilitychange', kick);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      globe.destroy();
      // cobe удаляет шейдеры, но не сам контекст — освобождаем его явно
      const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as WebGLRenderingContext | null;
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
      // cobe оборачивает холст в свой div и не убирает его — чистим контейнер целиком
      container.replaceChildren();
    };
  }, []);

  // Холст создаётся в эффекте; блок держит квадратную форму, пока его нет.
  // Поверх — наклонная орбита с двумя спутниками связи
  return (
    <div className={clsx('relative', className)}>
      <div ref={containerRef} className="aspect-square w-full" />
      <SatelliteOrbit />
    </div>
  );
};

const ORBIT = 'M 2 50 A 48 15 0 1 1 98 50 A 48 15 0 1 1 2 50 Z';

/** Орбита геостационарных спутников вокруг глобуса. При «уменьшить движение» спутники стоят на месте. */
const SatelliteOrbit: React.FC = () => {
  const moving = !prefersReducedMotion();
  return (
    <svg viewBox="0 0 100 100" aria-hidden focusable="false" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
      <g transform="rotate(-16 50 50)">
        <path d={ORBIT} fill="none" stroke="#7dd3fc" strokeOpacity={0.35} strokeWidth={0.4} strokeDasharray="1.2 1.6" />
        {[0, 1].map((index) => (
          <g key={index} transform={moving ? undefined : `translate(${index ? 98 : 2} 50)`}>
            {moving && (
              <animateMotion dur="22s" repeatCount="indefinite" begin={`${-index * 11}s`} rotate="0">
                <mpath href="#fleet-orbit" />
              </animateMotion>
            )}
            {/* Спутник: корпус и две панели */}
            <rect x={-1.2} y={-1.2} width={2.4} height={2.4} rx={0.3} fill="#f5b731" />
            <rect x={-5} y={-0.8} width={3.4} height={1.6} fill="#93c5fd" />
            <rect x={1.6} y={-0.8} width={3.4} height={1.6} fill="#93c5fd" />
            <circle r={3.2} fill="#7dd3fc" opacity={0.15} />
          </g>
        ))}
        <path id="fleet-orbit" d={ORBIT} fill="none" stroke="none" />
      </g>
    </svg>
  );
};

export default FleetGlobe;
