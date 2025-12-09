import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { Toaster, toast } from 'react-hot-toast';
import { Calendar, Users, ArrowRightLeft, Clock, LogOut, Package, Sparkles } from 'lucide-react';
import ShiftsPage from './pages/ShiftsPage.tsx';
import UsersPage from './pages/UsersPage.tsx';
import HandoversPage from './pages/HandoversPage.tsx';
import DashboardPage from './pages/DashboardPage.tsx';
import AssetsPage from './pages/AssetsPage.tsx';
import LoginPage from './pages/LoginPage.tsx';
import { authService } from './services/auth.ts';
import { LoginUser, CreateUser, User } from './types';
import logo from './assets/tserv-logo.svg';

function Navigation({ currentUser, onLogout }: { currentUser: User | null; onLogout: () => void }) {
  const location = useLocation();
  
  const isActive = (path: string) => location.pathname === path;
  
  const navItems = [
    { path: '/', label: 'Дашборд', icon: Clock },
    { path: '/shifts', label: 'Смены', icon: Calendar },
    { path: '/users', label: 'Сотрудники', icon: Users },
    { path: '/handovers', label: 'Передачи смен', icon: ArrowRightLeft },
    { path: '/assets', label: 'Активы', icon: Package },
  ];

  return (
    <nav className="bg-white/90 backdrop-blur shadow-lg border-b border-yellow-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center space-x-6">
            <div className="flex-shrink-0 flex items-center space-x-2">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary-500 via-amber-400 to-yellow-200 flex items-center justify-center shadow-inner">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-widest text-gray-500">T-serv</p>
                <h1 className="text-lg font-bold text-gray-900">Shift Control</h1>
              </div>
            </div>
            <div className="hidden sm:flex sm:space-x-2">
              {navItems.map(({ path, label, icon: Icon }) => (
                <Link
                  key={path}
                  to={path}
                  className={`inline-flex items-center px-3 py-2 rounded-xl text-sm font-semibold transition-all duration-200 ${
                    isActive(path)
                      ? 'bg-gradient-to-r from-primary-500 to-amber-400 text-white shadow'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-yellow-50'
                  }`}
                >
                  <Icon className="w-4 h-4 mr-2" />
                  {label}
                </Link>
              ))}
            </div>
          </div>

          {/* User info and logout */}
          <div className="flex items-center space-x-4">
            {currentUser && (
              <>
                <span className="text-sm text-gray-700 bg-yellow-50 px-3 py-1 rounded-full border border-yellow-100">
                  {currentUser.name} ({currentUser.position})
                </span>
                <button
                  onClick={onLogout}
                  className="flex items-center space-x-1 text-primary-700 hover:text-primary-900 font-semibold"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="text-sm">Выйти</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      <div className="sm:hidden">
        <div className="pt-2 pb-3 space-y-1 px-2">
          {navItems.map(({ path, label, icon: Icon }) => (
            <Link
              key={path}
              to={path}
              className={`block px-3 py-3 rounded-xl text-base font-medium transition-colors duration-200 ${
                isActive(path)
                  ? 'bg-gradient-to-r from-primary-500 to-amber-400 text-white shadow'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-yellow-50'
              }`}
            >
              <div className="flex items-center">
                <Icon className="w-4 h-4 mr-3" />
                {label}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      if (authService.isAuthenticated()) {
        const user = await authService.getCurrentUser();
        setCurrentUser(user);
        setIsAuthenticated(true);
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      authService.logout();
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (credentials: LoginUser) => {
    try {
      await authService.login(credentials);
      const user = await authService.getCurrentUser();
      setCurrentUser(user);
      setIsAuthenticated(true);
      toast.success('Вход выполнен успешно!');
    } catch (error) {
      toast.error('Ошибка входа. Проверьте логин и пароль.');
      throw error;
    }
  };

  const handleRegister = async (userData: CreateUser) => {
    try {
      toast.error('Регистрация временно отключена. Обратитесь к администратору.');
      throw new Error('Registration disabled');
    } catch (error) {
      throw error;
    }
  };

  const handleLogout = () => {
    authService.logout();
    setCurrentUser(null);
    setIsAuthenticated(false);
    toast.success('Вы вышли из системы');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <>
        <LoginPage onLogin={handleLogin} onRegister={handleRegister} />
        <Toaster position="top-right" />
      </>
    );
  }

  return (
    <Router>
      <div className="min-h-screen">
        <Navigation currentUser={currentUser} onLogout={handleLogout} />
        <main className="max-w-7xl mx-auto py-10 sm:px-6 lg:px-8 space-y-6">
          <div className="bg-white/80 backdrop-blur rounded-2xl border border-yellow-100 shadow-sm p-6 flex items-center justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-gray-500">T-serv shift desk</p>
              <h2 className="text-2xl font-bold text-gray-900 mt-1">Умное управление сменами</h2>
              <p className="text-gray-600 mt-2">Белый и жёлтый фирменный стиль, плавные переходы и акцент на скорости передачи смен.</p>
            </div>
            <div className="hidden md:flex items-center space-x-3 text-sm text-primary-700 bg-yellow-50 border border-yellow-100 px-4 py-3 rounded-xl shadow-inner">
              <Sparkles className="w-4 h-4" />
              <span>Дизайн обновлён под T-serv</span>
            </div>
          </div>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/shifts" element={<ShiftsPage />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/handovers" element={<HandoversPage />} />
            <Route path="/assets" element={<AssetsPage />} />
          </Routes>
        </main>
        <Toaster 
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#363636',
              color: '#fff',
            },
          }}
        />
      </div>
    </Router>
  );
}

export default App;
