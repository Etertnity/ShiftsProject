/**
 * Коллега для всех сотрудников (график, «Команда»). Контакты — только разрешённые сотрудником:
 * скрытые сервер присылает пустыми. Логина здесь нет.
 */
export interface UserPublic {
  id: number;
  name: string;
  position: string;
  is_active: boolean;
  phone?: string | null;
  telegram_id?: string | null;
  email?: string | null;
}

/** Какие контакты сотрудник показывает коллегам. */
export interface ContactVisibility {
  show_phone: boolean;
  show_telegram: boolean;
  show_email: boolean;
}

/** Карточка сотрудника для администратора: все контакты, логина и пароля — нет. */
export interface UserAdmin extends UserPublic, ContactVisibility {
  is_admin: boolean;
  must_change_password: boolean;
  created_at: string;
}

/** Текущий пользователь — единственный, чей логин виден в интерфейсе. */
export interface User extends UserAdmin {
  username: string;
}

export interface UserCreateData {
  username: string;
  password: string;
  name: string;
  position: string;
  phone?: string;
  telegram_id?: string;
  email?: string;
  is_admin: boolean;
}

export interface UserUpdateData {
  /** Новый логин; пусто — оставить прежний */
  username?: string;
  name: string;
  position: string;
  phone?: string;
  telegram_id?: string;
  email?: string;
  is_admin: boolean;
  is_active?: boolean;
}

export interface UpdateProfile extends Partial<ContactVisibility> {
  name: string;
  position: string;
  phone?: string;
  telegram_id?: string;
  email?: string;
}

export interface PasswordChangeData {
  current_password: string;
  new_password: string;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface AuthToken {
  access_token: string;
  token_type: string;
}
