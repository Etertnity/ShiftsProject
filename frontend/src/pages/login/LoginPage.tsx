import React, { useState } from 'react';
import axios from 'axios';
import { m } from 'motion/react';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import Logo from '../../components/layout/Logo';
import ThemeToggle from '../../components/layout/ThemeToggle';
import SkyBackground from '../../components/visual/SkyBackground';
import Button from '../../components/ui/Button';
import Field from '../../components/ui/Field';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { getErrorMessage } from '../../utils/errors';

const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const { isDark } = useTheme();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login({ username: username.trim(), password });
    } catch (err) {
      const isAuthError = axios.isAxiosError(err) && err.response?.status === 401;
      setError(isAuthError ? 'Неверный логин или пароль' : getErrorMessage(err, 'Не удалось войти'));
      setLoading(false);
    }
  };

  return (
    <div className="relative isolate flex min-h-screen items-center justify-center px-4 py-10">
      {/* Небо по времени суток — тот же шейдер, что в блоке «Сейчас на смене» */}
      <SkyBackground night={isDark} className="-z-10 !fixed" />
      <div className="absolute right-3 top-3">
        <ThemeToggle className="!text-white/80 hover:!bg-white/15 hover:!text-white" />
      </div>

      <m.div
        className="w-full max-w-sm"
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      >
        <Logo inverted className="mb-8 justify-center" />

        <m.form
          onSubmit={handleSubmit}
          className="card space-y-5 p-6 shadow-pop sm:p-8"
          noValidate
          // Лёгкое «покачивание» карточки при неверном пароле
          animate={error ? { x: [0, -8, 8, -5, 5, 0] } : { x: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div>
            <h1 className="text-xl font-bold text-gray-900">Вход в систему</h1>
            <p className="mt-1 text-sm text-gray-500">Используйте учётные данные, выданные администратором.</p>
          </div>

          {error && (
            <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
              {error}
            </div>
          )}

          <Field label="Логин" htmlFor="username">
            <input
              id="username"
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              autoFocus
              className="form-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </Field>

          <Field label="Пароль" htmlFor="password">
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                className="form-input pr-11"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-gray-400 hover:text-gray-600"
                aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </Field>

          <Button type="submit" icon={LogIn} loading={loading} disabled={!username.trim() || !password} fullWidth>
            Войти
          </Button>
        </m.form>

        <p className="mt-6 text-center text-xs text-white/70">Регистрация отключена — доступ выдаёт администратор.</p>
      </m.div>
    </div>
  );
};

export default LoginPage;
