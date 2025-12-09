import React, { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { LoginUser, CreateUser } from '../types';

interface LoginPageProps {
  onLogin: (credentials: LoginUser) => Promise<void>;
  onRegister: (userData: CreateUser) => Promise<void>;
}

export default function LoginPage({ onLogin, onRegister }: LoginPageProps) {
  const [formData, setFormData] = useState({
    username: '',
    password: '',
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await onLogin({
        username: formData.username,
        password: formData.password
      });
    } catch (error) {
      console.error('Authentication error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-white via-yellow-50 to-white py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl w-full grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
        <div className="space-y-4 bg-white/80 backdrop-blur border border-yellow-100 rounded-2xl p-8 shadow-lg">
          <div className="flex items-center space-x-3 text-primary-700">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary-500 via-amber-400 to-yellow-200 flex items-center justify-center shadow-inner">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-gray-500">T-serv</p>
              <h2 className="text-2xl font-bold text-gray-900">Shift Desk</h2>
            </div>
          </div>
          <p className="text-gray-600 leading-relaxed">
            Обновлённый фирменный стиль: бело-жёлтая палитра, плавные переходы и акцент на быстром входе в профиль. Регистрация отключена — вход только для сотрудников T-serv.
          </p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="p-4 rounded-xl bg-yellow-50 border border-yellow-100 shadow-inner">
              <p className="font-semibold text-gray-900">Быстрый старт</p>
              <p className="text-gray-600">Вход по логину и паролю без лишних шагов.</p>
            </div>
            <div className="p-4 rounded-xl bg-white border border-yellow-100 shadow-inner">
              <p className="font-semibold text-gray-900">Без регистрации</p>
              <p className="text-gray-600">Создание новых учёток выключено по требованию безопасности.</p>
            </div>
          </div>
        </div>

        <form className="bg-white/90 backdrop-blur border border-yellow-100 rounded-2xl p-8 shadow-xl space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-1">
            <p className="text-sm uppercase tracking-[0.2em] text-gray-500">Вход</p>
            <h3 className="text-2xl font-bold text-gray-900">Авторизация в профиле</h3>
            <p className="text-gray-600">Введите корпоративные учётные данные для доступа к сменам.</p>
          </div>

          <div className="space-y-4">
            <div>
              <label htmlFor="username" className="form-label">Логин</label>
              <input
                id="username"
                name="username"
                type="text"
                required
                className="form-input"
                placeholder="Введите логин"
                value={formData.username}
                onChange={handleInputChange}
              />
            </div>
            <div>
              <label htmlFor="password" className="form-label">Пароль</label>
              <input
                id="password"
                name="password"
                type="password"
                required
                className="form-input"
                placeholder="Введите пароль"
                value={formData.password}
                onChange={handleInputChange}
              />
            </div>
          </div>

          <div className="space-y-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-3 px-4 border border-transparent text-sm font-semibold rounded-xl text-white bg-gradient-to-r from-primary-500 to-amber-400 hover:from-primary-600 hover:to-amber-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 transition-all duration-200 shadow-lg"
            >
              {loading ? 'Загрузка...' : 'Войти в профиль'}
            </button>
            <p className="text-xs text-gray-500 text-center">Регистрация отключена — обращайтесь к администратору.</p>
          </div>
        </form>
      </div>
    </div>
  );
}
