import React from 'react';
import { m } from 'motion/react';
import { LogOut, ShieldAlert } from 'lucide-react';
import Logo from '../../components/layout/Logo';
import ChangePasswordForm from '../../components/users/ChangePasswordForm';
import OceanScene from '../../components/visual/OceanScene';
import { useAuth, useCurrentUser } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

/**
 * Пароль выдал администратор (новый сотрудник или сброс) — прежде чем работать,
 * сотрудник задаёт свой. Так временный пароль никто, кроме него, не будет знать.
 */
const ForcePasswordChange: React.FC = () => {
  const user = useCurrentUser();
  const { setUser, logout } = useAuth();
  const { isNightTime } = useTheme();

  return (
    <div className="dark relative isolate min-h-screen text-white">
      <OceanScene night={isNightTime} className="-z-20 !fixed" />
      <div aria-hidden className="fixed inset-0 -z-10 bg-gradient-to-r from-navy-950/85 via-navy-950/45 to-transparent" />
      <m.div
        className="flex min-h-screen w-full max-w-xl flex-col justify-center px-5 py-10 sm:px-10 lg:px-16"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        <Logo inverted className="mb-8" />
        <div className="space-y-5 rounded-2xl bg-navy-950/60 p-6 shadow-pop ring-1 ring-inset ring-white/10 backdrop-blur-md sm:p-7">
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
        <button type="button" onClick={logout} className="mt-6 flex items-center gap-1.5 self-start text-sm text-white/80 hover:text-white">
          <LogOut className="h-4 w-4" /> Выйти
        </button>
      </m.div>
    </div>
  );
};

export default ForcePasswordChange;
