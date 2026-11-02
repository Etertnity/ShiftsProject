import React from 'react';
import Logo from './Logo';
import UserMenu from './UserMenu';

/** Верхняя панель для телефонов и планшетов: логотип и меню пользователя. */
const MobileTopBar: React.FC = () => (
  // dark — шапка всегда «ночная», в одном стиле с меню
  <header className="dark sticky top-0 z-30 border-b border-white/10 bg-navy-900/90 backdrop-blur lg:hidden">
    <div className="flex h-14 items-center justify-between gap-3 px-4">
      <Logo className="min-w-0" />
      <UserMenu />
    </div>
  </header>
);

export default MobileTopBar;
