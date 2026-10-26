import React from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { LucideIcon } from 'lucide-react';
import AnimatedNumber from '../../../components/motion/AnimatedNumber';

interface StatCardProps {
  title: string;
  value: number;
  icon: LucideIcon;
  tone: string;
  to: string;
}

// На телефоне иконка над числом (подпись не обрезается), с 640px — в строку
const StatCard: React.FC<StatCardProps> = ({ title, value, icon: Icon, tone, to }) => (
  <Link to={to} className="card group flex min-w-0 flex-col gap-3 p-4 transition-shadow hover:shadow-pop sm:flex-row sm:items-center sm:p-5">
    <span className={clsx('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl sm:h-11 sm:w-11', tone)}>
      <Icon className="h-5 w-5" aria-hidden />
    </span>
    <div className="min-w-0">
      <p className="text-2xl font-bold leading-none text-gray-900"><AnimatedNumber value={value} /></p>
      <p className="mt-1 text-xs font-medium leading-snug text-gray-500 sm:text-sm">{title}</p>
    </div>
  </Link>
);

export default StatCard;
