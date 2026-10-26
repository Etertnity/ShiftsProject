import React from 'react';
import { m } from 'motion/react';
import { LogOut, ShieldAlert } from 'lucide-react';
import Logo from '../../components/layout/Logo';
import ChangePasswordForm from '../../components/users/ChangePasswordForm';
import SkyBackground from '../../components/visual/SkyBackground';
import { useAuth, useCurrentUser } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

/**
 * Пароль выдал администратор (новый сотрудник или сброс) — прежде чем работать,
 * сотрудник задаёт свой. Так временный пароль никто, кроме него, не будет знать.
 */
const ForcePasswordChange: React.FC = () => {
  const user = useCurrentUser();
  const { setUser, logout } = useAuth();
  const { isDark } = useTheme();

  return (
    <div className="relative isolate flex min-h-screen items-center justify-center px-4 py-10">
      <SkyBackground night={isDark} className="-z-10 !fixed" />
      <m.div
        className="w-full max-w-md"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        <Logo inverted className="mb-8 justify-center" />
        <div className="card space-y-5 p-6 shadow-pop sm:p-8">
          <div className="flex gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
              <ShieldAlert className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-lg font-bold text-gray-900">Задайте свой пароль</h1>
              <p className="mt-1 text-sm text-gray-500">
                {user.name}, вы вошли с временным паролем от администратора. Придумайте новый — его будете знать только вы.
              </p>
            </div>
          </div>
          <ChangePasswordForm currentLabel="Временный пароль" onChanged={() => setUser({ ...user, must_change_password: false })} />
        </div>
        <button type="button" onClick={logout} className="mx-auto mt-6 flex items-center gap-1.5 text-sm text-white/80 hover:text-white">
          <LogOut className="h-4 w-4" /> Выйти
        </button>
      </m.div>
    </div>
  );
};

export default ForcePasswordChange;
