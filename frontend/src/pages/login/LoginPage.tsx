import React, { useState } from 'react';
import axios from 'axios';
import { m } from 'motion/react';
import { ArrowRightLeft, CalendarDays, Eye, EyeOff, LogIn, SatelliteDish } from 'lucide-react';
import Logo from '../../components/layout/Logo';
import ThemeToggle from '../../components/layout/ThemeToggle';
import OceanScene from '../../components/visual/OceanScene';
import Button from '../../components/ui/Button';
import Field from '../../components/ui/Field';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { getErrorMessage } from '../../utils/errors';

const LoginPage: React.FC = () => {
  const { login } = useAuth();
  // Сцена по времени суток: днём закат над портом, ночью луна
  const { isNightTime } = useTheme();
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
    // dark — экран входа всегда «ночной» поверх морской сцены
    <div className="dark relative isolate min-h-screen text-white">
      <OceanScene night={isNightTime} shipSide="left" className="-z-20 !fixed" />
      {/* Затемнение к центру — под заголовком и формой */}
      <div aria-hidden className="fixed inset-0 -z-10 bg-[radial-gradient(ellipse_at_center,rgb(5_13_25/0.8)_0%,rgb(5_13_25/0.45)_45%,rgb(5_13_25/0.15)_100%)]" />
      <div className="absolute right-3 top-3 z-10">
        <ThemeToggle className="!text-white/80 hover:!bg-white/15 hover:!text-white" />
      </div>

      <m.div
        className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-5 py-10 text-center"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <Logo inverted />

        <h1 className="mt-8 font-display text-4xl font-bold uppercase leading-[0.98] tracking-wide [text-shadow:0_2px_16px_rgb(0_0_0/0.35)] sm:text-5xl">
          Журнал
          <span className="block text-accent-400">дежурной смены</span>
        </h1>
        <p className="mt-3 max-w-sm text-sm text-white/80">График дежурств, передачи смен, кейсы и потери на VSAT-каналах судов.</p>
        <ul className="mt-4 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-white/80">
          <li className="flex items-center gap-1.5"><CalendarDays className="h-4 w-4 text-accent-400" aria-hidden /> График смен</li>
          <li className="flex items-center gap-1.5"><ArrowRightLeft className="h-4 w-4 text-accent-400" aria-hidden /> Передачи</li>
          <li className="flex items-center gap-1.5"><SatelliteDish className="h-4 w-4 text-accent-400" aria-hidden /> Мониторинг каналов</li>
        </ul>

        <m.form
          onSubmit={handleSubmit}
          className="mt-8 w-full space-y-5 rounded-2xl bg-navy-950/70 text-left p-6 shadow-pop ring-1 ring-inset ring-white/10 backdrop-blur-md sm:p-7"
          noValidate
          // Лёгкое «покачивание» формы при неверном пароле
          animate={error ? { x: [0, -8, 8, -5, 5, 0] } : { x: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div>
            <h2 className="font-display text-xl font-semibold uppercase tracking-wide text-gray-900">Вход</h2>
            <p className="mt-1 text-sm text-gray-500">Логин и пароль выдаёт администратор.</p>
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

      </m.div>
    </div>
  );
};

export default LoginPage;
