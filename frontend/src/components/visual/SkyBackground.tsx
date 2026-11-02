import React, { useEffect, useRef } from 'react';
import clsx from 'clsx';
import { FRAGMENT_SHADER, VERTEX_SHADER } from './skyShader';

interface SkyBackgroundProps {
  /** Ночное небо вместо дневного; переход между ними плавный */
  night: boolean;
  className?: string;
}

const MAX_PIXEL_RATIO = 1.5;
const NIGHT_TRANSITION_MS = 1500;

// CSS-градиенты — то, что видно до первого кадра и там, где WebGL недоступен
// Горизонт на 66% сверху — как в шейдере (HORIZON = 0.34 от низа)
const FALLBACK = {
  day: 'linear-gradient(180deg, #0a1a3d 0%, #4d3f6b 42%, #ff9442 65.9%, #12294a 66%, #050f20 100%)',
  night: 'linear-gradient(180deg, #02070f 0%, #0b1a33 65.9%, #071224 66%, #02060e 100%)',
};

const compile = (gl: WebGLRenderingContext, type: number, source: string) => {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
};

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Анимированное небо на WebGL. Рисует только когда блок виден и вкладка активна,
 * разрешение ограничено — нагрузка минимальная даже на слабых ноутбуках и телефонах.
 */
const SkyBackground: React.FC<SkyBackgroundProps> = ({ night, className }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const nightTarget = useRef(night ? 1 : 0);

  nightTarget.current = night ? 1 : 0;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    // Холст создаётся заново при каждом запуске эффекта: на «отпущенном» холсте WebGL больше не работает,
    // а React (StrictMode, горячая перезагрузка) может перезапустить эффект на том же элементе
    const canvas = document.createElement('canvas');
    canvas.className = 'block h-full w-full opacity-0 transition-opacity duration-700';
    container.appendChild(canvas);
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' });
    if (!gl) {
      canvas.remove();
      return undefined; // остаётся CSS-градиент
    }

    // Контекст WebGL нужно освобождать явно: браузер держит не больше ~16 живых контекстов,
    // и без этого каждый заход на главную/экран входа оставлял бы ещё один до сборки мусора
    const releaseContext = () => {
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      container.replaceChildren();
    };

    const vs = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    const program = gl.createProgram();
    if (!vs || !fs || !program) {
      releaseContext();
      return undefined;
    }
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      releaseContext();
      return undefined;
    }
    gl.useProgram(program);

    // Один треугольник на весь экран
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const uResolution = gl.getUniformLocation(program, 'u_resolution');
    const uTime = gl.getUniformLocation(program, 'u_time');
    const uNight = gl.getUniformLocation(program, 'u_night');
    const uSeed = gl.getUniformLocation(program, 'u_seed');
    gl.uniform1f(uSeed, Math.random() * 100);

    const reduced = prefersReducedMotion();
    let nightValue = nightTarget.current;
    let frame = 0;
    let visible = true;
    let lastTs = performance.now();
    const start = lastTs;

    // Размер холста пересчитывается только при изменении размера (ResizeObserver),
    // а не в каждом кадре — чтение clientWidth 60 раз в секунду заставляет браузер пересчитывать вёрстку
    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
      const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
      const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);
      }
      gl.uniform2f(uResolution, canvas.width, canvas.height);
    };

    // Размер пересчитываем, только когда он мог измениться: при ResizeObserver и пока холст ещё не получил
    // реальные размеры (при монтировании во время перехода страницы ширина бывает нулевой)
    let sizeDirty = true;
    const draw = (ts: number) => {
      if (sizeDirty || canvas.width < 2 || canvas.height < 2) {
        resize();
        sizeDirty = canvas.clientWidth < 1 || canvas.clientHeight < 1;
      }
      const dt = ts - lastTs;
      lastTs = ts;
      const target = nightTarget.current;
      if (nightValue !== target) {
        const step = reduced ? 1 : dt / NIGHT_TRANSITION_MS;
        nightValue = target > nightValue ? Math.min(target, nightValue + step) : Math.max(target, nightValue - step);
      }
      gl.uniform1f(uTime, reduced ? 12 : (ts - start) / 1000);
      gl.uniform1f(uNight, nightValue);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const loop = (ts: number) => {
      draw(ts);
      // При «уменьшить движение» кадр перерисовываем только пока идёт смена день/ночь
      if (visible && !document.hidden && (!reduced || nightValue !== nightTarget.current)) {
        frame = requestAnimationFrame(loop);
      } else {
        frame = 0;
      }
    };

    const kick = () => {
      if (!frame && visible && !document.hidden) {
        lastTs = performance.now();
        frame = requestAnimationFrame(loop);
      }
    };

    draw(performance.now());
    canvas.style.opacity = '1';
    kick();

    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      kick();
    });
    observer.observe(canvas);
    document.addEventListener('visibilitychange', kick);
    const resizeObserver = new ResizeObserver(() => {
      sizeDirty = true;
      if (!frame) draw(performance.now());
    });
    resizeObserver.observe(canvas);
    // Смена дня/ночи при «уменьшить движение» тоже должна перерисоваться (без анимации цикл кадров стоит)
    const nightPoll = reduced
      ? window.setInterval(() => {
          if (nightValue !== nightTarget.current) kick();
        }, 1000)
      : 0;
    // Если браузер сам отобрал контекст — останавливаемся, остаётся CSS-градиент
    const onContextLost = (event: Event) => {
      event.preventDefault();
      cancelAnimationFrame(frame);
      frame = 0;
      visible = false;
      canvas.style.opacity = '0';
    };
    canvas.addEventListener('webglcontextlost', onContextLost);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      resizeObserver.disconnect();
      if (nightPoll) window.clearInterval(nightPoll);
      document.removeEventListener('visibilitychange', kick);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buffer);
      releaseContext();
    };
  }, []);

  return (
    // Холст добавляется в этот блок из эффекта; до первого кадра виден CSS-градиент
    <div
      ref={containerRef}
      aria-hidden
      className={clsx('pointer-events-none absolute inset-0 overflow-hidden', className)}
      style={{ background: night ? FALLBACK.night : FALLBACK.day, transition: 'background 1.5s ease' }}
    />
  );
};

export default SkyBackground;
