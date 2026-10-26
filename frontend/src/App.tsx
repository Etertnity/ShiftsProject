import React, { Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { domMax, LazyMotion, MotionConfig } from 'motion/react';
import AppLayout from './components/layout/AppLayout';
import PageErrorBoundary from './components/ui/PageErrorBoundary';
import Spinner, { PageLoader } from './components/ui/Spinner';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CatalogProvider } from './context/CatalogContext';
import { ConfirmProvider } from './context/ConfirmContext';
import { ThemeProvider } from './context/ThemeContext';
import AssetsPage from './pages/assets/AssetsPage';
import DashboardPage from './pages/dashboard/DashboardPage';
import HandoversPage from './pages/handovers/HandoversPage';
import ForcePasswordChange from './pages/login/ForcePasswordChange';
import LoginPage from './pages/login/LoginPage';
import ProfilePage from './pages/profile/ProfilePage';
import ShiftsPage from './pages/shifts/ShiftsPage';
import TeamPage from './pages/team/TeamPage';
import { lazyWithRetry } from './utils/lazyWithRetry';

// Монитор с графиками (Chart.js) грузится отдельным чанком — остальные страницы от него не тяжелеют
const MonitorPage = lazyWithRetry(() => import('./pages/monitor/MonitorPage'));
// Разделы администратора — отдельными чанками: сотрудники их не открывают и не должны скачивать
const SettingsPage = lazyWithRetry(() => import('./pages/settings/SettingsPage'));
const UsersPage = lazyWithRetry(() => import('./pages/users/UsersPage'));

const lazyPage = (element: React.ReactElement) => (
  <PageErrorBoundary>
    <Suspense fallback={<PageLoader />}>{element}</Suspense>
  </PageErrorBoundary>
);

const AppRoutes: React.FC = () => {
  const { user, initializing } = useAuth();

  if (initializing) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!user) return <LoginPage />;
  // Временный пароль от администратора — сначала сотрудник задаёт свой
  if (user.must_change_password) return <ForcePasswordChange />;

  const adminOnly = (element: React.ReactElement) => (user.is_admin ? element : <Navigate to="/" replace />);

  return (
    <CatalogProvider>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="shifts" element={<ShiftsPage />} />
          <Route path="handovers" element={<HandoversPage />} />
          <Route path="assets" element={<AssetsPage />} />
          <Route
            path="monitor"
            element={
              <PageErrorBoundary>
                <Suspense fallback={<PageLoader />}>
                  <MonitorPage />
                </Suspense>
              </PageErrorBoundary>
            }
          />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="team" element={<TeamPage />} />
          <Route path="users" element={adminOnly(lazyPage(<UsersPage />))} />
          <Route path="settings" element={adminOnly(lazyPage(<SettingsPage />))} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </CatalogProvider>
  );
};

const App: React.FC = () => (
  // reducedMotion="user": если в системе включено «уменьшить движение», анимации отключаются
  <MotionConfig reducedMotion="user">
    <LazyMotion features={domMax} strict>
      <ThemeProvider>
        <BrowserRouter>
          <AuthProvider>
            <ConfirmProvider>
              <AppRoutes />
              <Toaster
                position="top-center"
                toastOptions={{
                  duration: 3500,
                  className: '!rounded-xl !text-sm !shadow-pop',
                  style: { background: 'rgb(var(--surface))', color: 'rgb(var(--gray-900))' },
                }}
              />
            </ConfirmProvider>
          </AuthProvider>
        </BrowserRouter>
      </ThemeProvider>
    </LazyMotion>
  </MotionConfig>
);

export default App;
