import React from 'react';
import clsx from 'clsx';
import { Mail, Phone, Send } from 'lucide-react';

/** Контакты, как их отдаёт сервер: скрытые сотрудником поля приходят пустыми. */
export interface Contacts {
  phone?: string | null;
  telegram_id?: string | null;
  email?: string | null;
}

const telegramName = (contacts: Contacts) => contacts.telegram_id?.trim().replace(/^@/, '') || '';

export const hasContacts = (contacts: Contacts) => !!(contacts.phone || telegramName(contacts) || contacts.email);

const links = (contacts: Contacts) => {
  const telegram = telegramName(contacts);
  return [
    contacts.phone && { key: 'phone', href: `tel:${contacts.phone.replace(/[^\d+]/g, '')}`, icon: Phone, text: contacts.phone, action: 'Позвонить' },
    telegram && { key: 'telegram', href: `https://t.me/${telegram}`, icon: Send, text: `@${telegram}`, action: 'Написать в Telegram' },
    contacts.email && { key: 'email', href: `mailto:${contacts.email}`, icon: Mail, text: contacts.email, action: 'Написать письмо' },
  ].filter(Boolean) as { key: string; href: string; icon: React.ElementType; text: string; action: string }[];
};

const external = (href: string) => (href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {});

/** Список контактов в карточке сотрудника: иконка + значение, каждый — ссылка. */
export const ContactList: React.FC<{ contacts: Contacts; empty?: string }> = ({ contacts, empty = 'Контакты не указаны' }) => {
  const items = links(contacts);
  if (items.length === 0) return <p className="text-sm text-gray-400">{empty}</p>;
  return (
    <div className="space-y-2">
      {items.map(({ key, href, icon: Icon, text, action }) => (
        <a key={key} href={href} {...external(href)} title={action} className="flex min-w-0 items-center gap-2 text-sm text-gray-600 hover:text-primary-700">
          <Icon className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
          <span className="truncate">{text}</span>
        </a>
      ))}
    </div>
  );
};

interface ContactButtonsProps {
  contacts: Contacts;
  /** Чьи контакты — для подписей кнопок */
  name: string;
  /** Кнопки на цветном фоне (блок «Сейчас на смене») */
  variant?: 'default' | 'glass';
  className?: string;
}

/** Кнопки «Позвонить / Telegram / Почта» — там, где нужно быстро связаться с дежурным. */
export const ContactButtons: React.FC<ContactButtonsProps> = ({ contacts, name, variant = 'default', className }) => {
  const items = links(contacts);
  if (items.length === 0) return null;
  return (
    <div className={clsx('flex shrink-0 gap-1', className)}>
      {items.map(({ key, href, icon: Icon, text, action }) => (
        <a
          key={key}
          href={href}
          {...external(href)}
          title={`${action}: ${text}`}
          aria-label={`${action} — ${name}`}
          onClick={(event) => event.stopPropagation()}
          className={clsx(
            'inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2',
            variant === 'glass'
              ? 'bg-white/15 text-white hover:bg-white/30 focus-visible:ring-white/70'
              : 'bg-gray-100 text-gray-600 hover:bg-primary-50 hover:text-primary-700 focus-visible:ring-primary-500',
          )}
        >
          <Icon className="h-4 w-4" aria-hidden />
        </a>
      ))}
    </div>
  );
};
