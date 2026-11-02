import React, { useEffect } from 'react';
import { useLocation, useOutlet } from 'react-router-dom';
import { AnimatePresence, m } from 'motion/react';
import BottomNav from './BottomNav';
import MobileTopBar from './MobileTopBar';
import Sidebar from './Sidebar';
import VsatBackdrop from '../visual/VsatBackdrop';

const AppLayout: React.FC = () => {
  const { pathname } = useLocation();
  // useOutlet «замораживает» уходящую страницу, чтобы она успела плавно исчезнуть
  const outlet = useOutlet();

  // При переходе между разделами начинаем страницу сверху
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="min-h-screen">
      <VsatBackdrop />
      <Sidebar />
      <MobileTopBar />
      <main className="lg:pl-64">
        <div className="mx-auto w-full max-w-7xl px-4 pb-28 pt-5 sm:px-6 sm:pt-6 lg:px-8 lg:pb-10 lg:pt-8">
          <AnimatePresence mode="wait" initial={false}>
            <m.div
              key={pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              {outlet}
            </m.div>
          </AnimatePresence>
        </div>
      </main>
      <BottomNav />
    </div>
  );
};

export default AppLayout;
