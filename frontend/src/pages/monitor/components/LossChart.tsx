import React, { useEffect, useRef, useState } from 'react';
import {
  Chart,
  Filler,
  LinearScale,
  LineController,
  LineElement,
  Plugin,
  PointElement,
  ScriptableContext,
  Tooltip,
} from 'chart.js';
import { LossPoint, MonitorConfig } from '../../../types';
import { fmtFull, fmtHM, localTicks, lossStats, niceMax, Period, TICK_STEP, toChartPoints } from '../monitorUtils';

// Регистрируем только нужное — так Chart.js заметно легче
Chart.register(LineController, LineElement, PointElement, LinearScale, Filler, Tooltip);
Chart.defaults.font.family = 'Inter, system-ui, sans-serif';

const COLORS = {
  ok: { line: '#10b981', fill: 'rgba(16, 185, 129, 0.22)' },
  warn: { line: '#f59e0b', fill: 'rgba(245, 158, 11, 0.22)' },
  crit: { line: '#ef4444', fill: 'rgba(239, 68, 68, 0.22)' },
};

/** Цвета осей и подсказки берём из темы (CSS-переменные), чтобы график совпадал со светлой/тёмной темой. */
const themeColors = () => {
  const style = getComputedStyle(document.documentElement);
  const rgb = (name: string, alpha = 1) => `rgb(${style.getPropertyValue(name).trim()} / ${alpha})`;
  return {
    grid: rgb('--gray-200', 0.8),
    border: rgb('--gray-300'),
    tick: rgb('--gray-500'),
    tooltipBg: rgb('--surface', 0.97),
    tooltipBorder: rgb('--gray-200'),
    tooltipTitle: rgb('--gray-500'),
    tooltipBody: rgb('--gray-900'),
  };
};

type Level = keyof typeof COLORS;

interface ChartWithLevel extends Chart<'line'> {
  $level?: Level;
}

/** Пунктирные линии порогов потерь (по умолчанию 40% и 60%). */
const thresholdPlugin: Plugin<'line'> = {
  id: 'thresholds',
  beforeDatasetsDraw(chart, _args, options: { values?: [number, string][] }) {
    const y = chart.scales.y;
    const area = chart.chartArea;
    const ctx = chart.ctx;
    for (const [value, color] of options.values ?? []) {
      if (value >= y.max) continue;
      const py = Math.round(y.getPixelForValue(value)) + 0.5;
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(area.left, py);
      ctx.lineTo(area.right, py);
      ctx.stroke();
      ctx.restore();
    }
  },
};

interface LossChartProps {
  points: LossPoint[];
  period: Period;
  config: MonitorConfig;
  level: Level;
  /** Смена темы — пересоздаём график с новыми цветами */
  isDark: boolean;
}

/** График потерь ICMP: создаётся, только когда карточка попадает в зону видимости. */
const LossChart: React.FC<LossChartProps> = ({ points, period, config, level, isDark }) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<ChartWithLevel | null>(null);
  const [visible, setVisible] = useState(false);

  // Ленивая инициализация: 100 графиков сразу браузеру тяжело, рисуем то, что видно
  useEffect(() => {
    const node = wrapRef.current;
    if (!node || visible) return undefined;
    const observer = new IntersectionObserver(([entry]) => entry.isIntersecting && setVisible(true), { rootMargin: '300px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [visible]);

  // Создание/пересоздание при смене темы или периода
  useEffect(() => {
    if (!visible || !canvasRef.current) return undefined;
    const theme = themeColors();
    const max = Date.now();
    const min = max - period * 3600e3;
    const chart = new Chart(canvasRef.current, {
      type: 'line',
      data: {
        datasets: [{
          data: toChartPoints(points) as unknown as { x: number; y: number }[],
          borderWidth: 1.5,
          pointRadius: 0,
          pointHoverRadius: 3,
          pointHitRadius: 6,
          tension: 0,
          spanGaps: false,
          fill: 'origin',
          borderColor: (ctx: ScriptableContext<'line'>) => COLORS[(ctx.chart as ChartWithLevel).$level ?? 'ok'].line,
          pointHoverBackgroundColor: (ctx: ScriptableContext<'line'>) => COLORS[(ctx.chart as ChartWithLevel).$level ?? 'ok'].line,
          // Заливка по текущему состоянию судна: зелёная / жёлтая / красная, к низу — прозрачная
          backgroundColor: (ctx: ScriptableContext<'line'>) => {
            const chartLevel = (ctx.chart as ChartWithLevel).$level ?? 'ok';
            const area = ctx.chart.chartArea;
            if (!area) return COLORS[chartLevel].fill;
            const gradient = ctx.chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
            gradient.addColorStop(0, COLORS[chartLevel].fill);
            gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
            return gradient;
          },
          segment: {
            // Участки выше порогов подсвечиваются цветом порога
            borderColor: (seg) => {
              const y = Math.max(seg.p0.parsed.y ?? 0, seg.p1.parsed.y ?? 0);
              return y >= config.crit_threshold ? COLORS.crit.line : y >= config.warn_threshold ? COLORS.warn.line : undefined;
            },
          },
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        normalized: true,
        interaction: { mode: 'nearest', axis: 'x', intersect: false },
        layout: { padding: { left: 2, right: 10, top: 8, bottom: 0 } },
        plugins: {
          legend: { display: false },
          // @ts-expect-error — опции собственного плагина
          thresholds: { values: [[config.warn_threshold, 'rgba(245, 158, 11, 0.55)'], [config.crit_threshold, 'rgba(239, 68, 68, 0.55)']] },
          tooltip: {
            backgroundColor: theme.tooltipBg,
            borderColor: theme.tooltipBorder,
            borderWidth: 1,
            titleColor: theme.tooltipTitle,
            bodyColor: theme.tooltipBody,
            displayColors: false,
            titleFont: { size: 10 },
            bodyFont: { size: 11, weight: 'bold' },
            callbacks: {
              title: (items) => fmtFull(items[0].parsed.x),
              label: (ctx) => `Потери ICMP: ${(ctx.parsed.y ?? 0).toFixed(1)}%`,
            },
          },
        },
        scales: {
          x: {
            type: 'linear',
            min,
            max,
            afterBuildTicks: (axis) => {
              axis.ticks = localTicks(axis.min, axis.max, TICK_STEP[period]);
            },
            ticks: { color: theme.tick, font: { size: 9 }, maxRotation: 0, callback: (value) => fmtHM(Number(value)) },
            grid: { color: theme.grid },
            border: { color: theme.border },
          },
          y: {
            min: 0,
            max: niceMax(lossStats(points).max),
            ticks: { color: theme.tick, font: { size: 9 }, maxTicksLimit: 5, callback: (value) => `${value}%` },
            grid: { color: theme.grid },
            border: { color: theme.border },
          },
        },
      },
      plugins: [thresholdPlugin],
    }) as ChartWithLevel;
    chart.$level = level;
    chart.update('none');
    chartRef.current = chart;
    return () => {
      chart.destroy();
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, isDark, period, config.warn_threshold, config.crit_threshold]);

  // Новые точки — обновляем данные без пересоздания графика
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const max = Date.now();
    chart.$level = level;
    // null в y — разрыв линии там, где не было данных; типы Chart.js этого не описывают
    chart.data.datasets[0].data = toChartPoints(points) as unknown as { x: number; y: number }[];
    const scales = chart.options.scales as { x: { min: number; max: number }; y: { max: number } };
    scales.x.min = max - period * 3600e3;
    scales.x.max = max;
    scales.y.max = niceMax(lossStats(points).max);
    chart.update('none');
  }, [points, level, period]);

  return (
    <div ref={wrapRef} className="absolute inset-0">
      <canvas ref={canvasRef} aria-label="График потерь ICMP" role="img" />
    </div>
  );
};

export default LossChart;
