import React from 'react';
import { NavLink } from 'react-router-dom';
import clsx from 'clsx';
import { m } from 'motion/react';
import { NAV_ITEMS } from '../../constants/navigation';

/** Нижняя панель навигации для телефонов и планшетов — всегда под пальцем. */
const BottomNav: React.FC = () => (
  <nav
    className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-surface/95 backdrop-blur lg:hidden"
    aria-label="Основное меню"
  >
    <div className="mx-auto grid max-w-xl grid-cols-5">
      {NAV_ITEMS.map(({ path, shortLabel, icon: Icon }) => (
        <NavLink
          key={path}
          to={path}
          end={path === '/'}
          className={({ isActive }) =>
            clsx(
              'flex min-w-0 flex-col items-center gap-0.5 px-1 pb-2 pt-2.5 text-[11px] font-medium transition-colors',
              isActive ? 'text-primary-600' : 'text-gray-500 hover:text-gray-900',
            )
          }
        >
          {({ isActive }) => (
            <>
              <span className="relative flex h-7 w-12 items-center justify-center">
                {isActive && (
                  <m.span layoutId="bottomnav-active" className="absolute inset-0 rounded-full bg-primary-50" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />
                )}
                <Icon className="relative h-5 w-5" aria-hidden />
              </span>
              <span className="max-w-full truncate">{shortLabel}</span>
            </>
          )}
        </NavLink>
      ))}
    </div>
  </nav>
);

export default BottomNav;
