import React from 'react';
import clsx from 'clsx';
import SkyBackground from './SkyBackground';
import { HORIZON } from './skyShader';
import { ContainerShip, GroundStation, HarborCrane, Satellite, Wake } from './Vessel';

interface OceanSceneProps {
  night: boolean;
  className?: string;
  /** Компактная сцена (баннеры): судно меньше, без порта */
  compact?: boolean;
  /** Где идёт судно: справа (баннеры) или слева (экран входа — форма по центру) */
  shipSide?: 'left' | 'right';
}

/**
 * Морская сцена со спутниковой связью: анимированное море и небо (WebGL), спутник на орбите,
 * контейнеровоз с VSAT-антенной и наземная станция у порта. Силуэты стоят точно на линии горизонта
 * шейдера. Всё декоративное — скрыто от экранных дикторов.
 */
const OceanScene: React.FC<OceanSceneProps> = ({ night, className, compact, shipSide = 'right' }) => {
  const waterline = `${HORIZON * 100}%`;
  return (
    <div aria-hidden className={clsx('pointer-events-none absolute inset-0 overflow-hidden', className)}>
      <SkyBackground night={night} />

      {/* Спутник медленно плывёт по небу, луч смотрит вниз — на судно и на телепорт */}
      <div className="satellite-drift absolute left-[52%] top-[5%] w-[clamp(54px,7vw,92px)]">
        <Satellite className="block h-auto w-full drop-shadow-[0_0_8px_rgba(125,211,252,0.35)]" />
      </div>

      {/* Порт у правого края: тарелка наземной станции (телепорта) и кран */}
      {!compact && (
        <div className="absolute right-0 hidden translate-x-[12%] items-end sm:flex" style={{ bottom: waterline }}>
          <GroundStation className="mr-1 h-[clamp(70px,11vw,130px)] w-auto opacity-90" />
          <HarborCrane className="h-[clamp(120px,22vw,230px)] w-auto opacity-90" />
        </div>
      )}

      {/* Судно: ватерлиния (y=124 из 140) совпадает с горизонтом; лёгкая качка */}
      <div
        className={clsx(
          'absolute',
          compact
            ? 'right-[4%] w-[clamp(180px,34%,360px)]'
            : shipSide === 'left'
              ? 'left-[5%] w-[clamp(220px,30%,560px)]'
              : 'right-[14%] w-[clamp(240px,44%,600px)]',
        )}
        style={{ bottom: waterline }}
      >
        {/* Ватерлиния на y=124 из 140: опускаем судно на 16/140 его высоты, чтобы корпус «сидел» в воде */}
        <div className="vessel-bob translate-y-[11.4%]">
          <ContainerShip night={night} className="block h-auto w-full drop-shadow-[0_6px_12px_rgba(0,0,0,0.35)]" />
        </div>
        <Wake className="absolute -left-[38%] bottom-[2%] h-[10%] w-[45%]" />
      </div>
    </div>
  );
};

export default OceanScene;
