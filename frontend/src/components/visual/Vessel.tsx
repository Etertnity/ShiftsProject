import React from 'react';
import clsx from 'clsx';

// Цвета контейнеров — приглушённые, как у настоящих «коробок» в порту
const CONTAINER_COLORS = ['#b4532a', '#1f6f6b', '#2d4f8a', '#9c2f2f', '#a77a1f', '#4b5b70', '#1c6481', '#7a3e8a'];
// Высоты штабелей по колонкам: «рваный» силуэт, как у загруженного контейнеровоза
const STACKS = [3, 4, 4, 5, 5, 4, 5, 5, 4, 4, 5, 3, 4, 4, 5, 4, 3, 4, 3, 2];

const COL_W = 21;
const ROW_H = 12;
const DECK_Y = 95;
const FIRST_X = 108;

/** Цвет контейнера из позиции — детерминированно, без случайностей при каждом рендере. */
const containerColor = (col: number, row: number) => CONTAINER_COLORS[(col * 7 + row * 3 + (col % 3)) % CONTAINER_COLORS.length];

interface VesselProps {
  night?: boolean;
  className?: string;
}

/**
 * Контейнеровоз сбоку (нос вправо). Нарисован вручную в SVG: без внешних картинок и лицензий,
 * масштабируется без потери качества. Ватерлиния — y=124 из 140, её ставим на горизонт.
 */
export const ContainerShip: React.FC<VesselProps> = ({ night, className }) => (
  <svg viewBox="0 0 600 140" className={className} aria-hidden focusable="false">
    <defs>
      <linearGradient id="vessel-hull" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#13213a" />
        <stop offset="1" stopColor="#070e1b" />
      </linearGradient>
      <linearGradient id="vessel-shade" x1="0" y1="0" x2="1" y2="0">
        {/* Солнце справа: левая (кормовая) часть в тени */}
        <stop offset="0" stopColor="#000" stopOpacity={night ? 0.55 : 0.35} />
        <stop offset="1" stopColor="#000" stopOpacity={night ? 0.35 : 0} />
      </linearGradient>
    </defs>

    {/* Контейнеры */}
    <g>
      {STACKS.map((rows, col) =>
        Array.from({ length: rows }, (_, row) => (
          <rect
            key={`${col}-${row}`}
            x={FIRST_X + col * COL_W}
            y={DECK_Y - (row + 1) * ROW_H}
            width={COL_W - 1.5}
            height={ROW_H - 1.2}
            rx={0.8}
            fill={containerColor(col, row)}
          />
        )),
      )}
      {/* Рёбра контейнеров — тонкие вертикальные линии */}
      {STACKS.map((rows, col) => (
        <line
          key={`rib-${col}`}
          x1={FIRST_X + col * COL_W + (COL_W - 1.5) / 2}
          x2={FIRST_X + col * COL_W + (COL_W - 1.5) / 2}
          y1={DECK_Y - rows * ROW_H}
          y2={DECK_Y}
          stroke="#000"
          strokeOpacity={0.18}
          strokeWidth={0.8}
        />
      ))}
    </g>

    {/* Надстройка на корме: мостик, окна, труба */}
    <rect x={44} y={38} width={56} height={57} rx={2} fill={night ? '#9fb0c4' : '#dfe6ee'} />
    <rect x={38} y={34} width={68} height={6} rx={1.5} fill={night ? '#8698ad' : '#c9d3df'} />
    {[46, 58, 70, 82].map((y) =>
      [50, 62, 74, 86].map((x) => <rect key={`${x}-${y}`} x={x} y={y} width={7} height={4} rx={0.6} fill={night ? '#ffd27a' : '#3b5576'} opacity={night ? 0.95 : 0.8} />),
    )}
    <rect x={62} y={18} width={16} height={17} rx={1.5} fill="#1d3557" />
    <rect x={62} y={22} width={16} height={4} fill="#c43c32" />
    <line x1={92} y1={34} x2={92} y2={14} stroke="#1d2a3d" strokeWidth={1.5} />

    {/* VSAT-антенна под белым радомом — через неё судно на связи со спутником.
        Кольца над ней — сигнал, расходятся вверх, к спутнику */}
    <rect x={44} y={26} width={3} height={9} fill="#1d2a3d" />
    <path d="M37.5 27 A8 8 0 0 1 53.5 27 Z" fill={night ? '#c9d4e2' : '#f4f7fb'} />
    <circle cx={45.5} cy={22.5} r={7} fill={night ? '#c9d4e2' : '#f4f7fb'} />
    <circle cx={43} cy={20} r={2.2} fill="#fff" opacity={0.6} />
    {[0, 1, 2].map((i) => (
      <circle
        key={i}
        cx={45.5}
        cy={22.5}
        r={10}
        fill="none"
        stroke="#7dd3fc"
        strokeWidth={1.2}
        className="vsat-ping"
        style={{ animationDelay: `${i * 0.9}s` }}
      />
    ))}

    {/* Корпус: нос справа, красная подводная часть у ватерлинии */}
    <path d="M14 95 L548 95 L588 84 L574 124 L46 124 Q26 118 14 95 Z" fill="url(#vessel-hull)" />
    <path d="M30 116 L578 116 L574 124 L46 124 Q36 121 30 116 Z" fill="#8a2323" />
    <path d="M14 95 L548 95 L588 84 L574 124 L46 124 Q26 118 14 95 Z" fill="url(#vessel-shade)" />
    <line x1={20} y1={99} x2={556} y2={99} stroke="#e8edf3" strokeOpacity={0.25} strokeWidth={1} />

    {/* Мачта на носу и ходовые огни */}
    <line x1={560} y1={88} x2={560} y2={58} stroke="#1d2a3d" strokeWidth={1.5} />
    <circle cx={560} cy={57} r={2.2} fill="#fff7d6" className="vessel-light" />
    <circle cx={92} cy={13} r={2} fill="#fff7d6" className="vessel-light" />
    <circle cx={584} cy={88} r={1.8} fill="#4ade80" className="vessel-light" />
  </svg>
);

/** Портовый контейнерный кран: опоры, стрела над водой, огонь на верхушке. Основание — низ viewBox. */
export const HarborCrane: React.FC<VesselProps & { flip?: boolean }> = ({ className, flip }) => (
  <svg viewBox="0 0 160 220" className={className} aria-hidden focusable="false" style={flip ? { transform: 'scaleX(-1)' } : undefined}>
    <g fill="#08111f" stroke="#08111f">
      {/* Опоры-портал */}
      <path d="M96 220 L104 96 L112 96 L106 220 Z" />
      <path d="M134 220 L128 96 L136 96 L144 220 Z" />
      <rect x={98} y={150} width={40} height={5} />
      <rect x={100} y={96} width={40} height={7} />
      {/* Кабина и стрела над водой (влево) */}
      <rect x={102} y={74} width={34} height={24} rx={2} />
      <rect x={4} y={86} width={156} height={6} />
      <path d="M118 74 L124 30 L130 74 Z" />
      <line x1={127} y1={34} x2={12} y2={86} strokeWidth={2.5} />
      <line x1={127} y1={34} x2={156} y2={86} strokeWidth={2.5} />
      {/* Трос и спредер */}
      <line x1={46} y1={92} x2={46} y2={132} strokeWidth={1.2} />
      <rect x={36} y={132} width={20} height={4} />
    </g>
    <rect x={108} y={80} width={8} height={5} fill="#ffd27a" opacity={0.85} />
    <circle cx={124} cy={29} r={3} fill="#ff4d4d" className="vessel-light" />
  </svg>
);

/** Полосы кильватерного следа за кормой — мерцают, пока судно «идёт». */
export const Wake: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 300 20" className={clsx('vessel-wake', className)} aria-hidden focusable="false" preserveAspectRatio="none">
    <path d="M300 4 C220 6 140 10 0 14" stroke="#e6f1ff" strokeOpacity={0.35} strokeWidth={1.4} fill="none" />
    <path d="M300 9 C210 11 120 14 20 18" stroke="#e6f1ff" strokeOpacity={0.22} strokeWidth={1} fill="none" />
  </svg>
);

/**
 * Геостационарный спутник связи: корпус, две солнечные панели, антенна смотрит вниз.
 * Под ним — слабый конус луча (зона покрытия), огонёк мигает.
 */
export const Satellite: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 120 120" className={className} aria-hidden focusable="false">
    <defs>
      <linearGradient id="sat-beam" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#7dd3fc" stopOpacity={0.35} />
        <stop offset="1" stopColor="#7dd3fc" stopOpacity={0} />
      </linearGradient>
      <pattern id="sat-cells" width="5" height="5" patternUnits="userSpaceOnUse">
        <rect width="5" height="5" fill="#1e3a8a" />
        <path d="M0 0 H5 M0 0 V5" stroke="#93c5fd" strokeOpacity={0.45} strokeWidth={0.6} />
      </pattern>
    </defs>
    {/* Луч к Земле */}
    <path d="M60 44 L94 120 L26 120 Z" fill="url(#sat-beam)" className="sat-beam" />
    {/* Солнечные панели */}
    <rect x={4} y={24} width={36} height={14} rx={1} fill="url(#sat-cells)" stroke="#cbd5e1" strokeWidth={0.8} />
    <rect x={80} y={24} width={36} height={14} rx={1} fill="url(#sat-cells)" stroke="#cbd5e1" strokeWidth={0.8} />
    <line x1={40} y1={31} x2={50} y2={31} stroke="#cbd5e1" strokeWidth={1.4} />
    <line x1={70} y1={31} x2={80} y2={31} stroke="#cbd5e1" strokeWidth={1.4} />
    {/* Корпус в «золотой» термоизоляции */}
    <rect x={50} y={20} width={20} height={22} rx={2} fill="#e8b84a" />
    <path d="M50 26 H70 M50 32 H70" stroke="#a87a1c" strokeWidth={0.8} />
    {/* Антенна-тарелка вниз */}
    <path d="M52 42 Q60 52 68 42 Z" fill="#e2e8f0" />
    <line x1={60} y1={46} x2={60} y2={50} stroke="#e2e8f0" strokeWidth={1.2} />
    <circle cx={60} cy={18} r={1.8} fill="#f87171" className="vessel-light" />
  </svg>
);

/** Наземная станция (телепорт): большая тарелка на опоре смотрит в небо. Основание — низ viewBox. */
export const GroundStation: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 140 160" className={className} aria-hidden focusable="false">
    <g fill="#08111f" stroke="#08111f">
      <rect x={52} y={118} width={36} height={42} />
      <rect x={40} y={152} width={60} height={8} />
      <path d="M70 118 L62 92 L78 92 Z" />
      {/* Тарелка наклонена вверх-влево, к спутнику */}
      <g transform="rotate(-35 70 80)">
        <path d="M18 80 Q70 128 122 80 Z" />
        <line x1={70} y1={86} x2={70} y2={46} strokeWidth={2.5} />
        <circle cx={70} cy={44} r={4} />
      </g>
    </g>
    <circle cx={46} cy={40} r={2.5} fill="#ff4d4d" className="vessel-light" />
  </svg>
);
