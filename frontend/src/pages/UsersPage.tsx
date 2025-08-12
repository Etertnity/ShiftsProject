import React, { useState, useEffect } from 'react';
import { Plus, Mail, User as UserIcon, Phone, MessageCircle, Edit, Trash2, Shield } from 'lucide-react';
import { usersApi, profileApi } from '../api.ts';
import { authService } from '../services/auth.ts';
import { User, CreateUser, UpdateProfile } from '../types';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';

const UsersPage: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [editingProfile, setEditingProfile] = useState<User | null>(null); // eslint-disable-line @typescript-eslint/no-unused-vars

  const { register, handleSubmit, reset, formState: { errors } } = useForm<CreateUser>();
  const { register: registerProfile, handleSubmit: handleSubmitProfile, reset: resetProfile, formState: { errors: errorsProfile } } = useForm<UpdateProfile>();

  useEffect(() => {
    loadCurrentUser();
  }, []);

  useEffect(() => {
    if (currentUser) {
      loadUsers();
    }
  }, [currentUser]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadCurrentUser = async () => {
    try {
      const user = await authService.getCurrentUser();
      setCurrentUser(user);
    } catch (error) {
      console.error('Error loading current user:', error);
    }
  };

  const loadUsers = async () => {
    try {
      setLoading(true);
      // Если пользователь админ - используем полный API, иначе публичный
      const data = currentUser?.is_admin 
        ? await usersApi.getAll()
        : await usersApi.getAllPublic();
      setUsers(data);
    } catch (error: any) {
      console.error('Error loading users:', error);
      if (error.response?.status === 403) {
        toast.error('Недостаточно прав для управления пользователями');
      } else {
        toast.error('Ошибка загрузки сотрудников');
      }
    } finally {
      setLoading(false);
    }
  };

  const openCreateModal = () => {
    // Проверяем права администратора
    if (!currentUser?.is_admin) {
      toast.error('Недостаточно прав для создания пользователей');
      return;
    }
    
    setEditingUser(null);
    reset({
      username: '',
      password: '',
      name: '',
      position: '',
      phone: '',
      telegram_id: '',
      email: '',
      is_admin: false
    });
    setShowModal(true);
  };

  const openEditModal = (user: User) => {
    // Проверяем права администратора
    if (!currentUser?.is_admin) {
      toast.error('Недостаточно прав для редактирования пользователей');
      return;
    }
    
    setEditingUser(user);
    reset({
      username: user.username,
      password: '', // Пароль не показываем для безопасности
      name: user.name,
      position: user.position,
      phone: user.phone || '',
      telegram_id: user.telegram_id || '',
      email: user.email || '',
      is_admin: user.is_admin
    });
    setShowModal(true);
  };

  const handleCreateUser = async (data: CreateUser) => {
    try {
      if (editingUser) {
        // При редактировании, если пароль пустой - не отправляем его
        const updateData = { ...data };
        if (!updateData.password || updateData.password.trim() === '') {
          updateData.password = ''; // Отправляем пустую строку, backend обработает это
        }
        await usersApi.update(editingUser.id, updateData);
        toast.success('Сотрудник обновлен');
      } else {
        await usersApi.create(data);
        toast.success('Сотрудник создан');
      }
      
      setShowModal(false);
      setEditingUser(null);
      reset();
      loadUsers();
    } catch (error: any) {
      console.error('Error creating/updating user:', error);
      if (error.response?.status === 400) {
        const detail = error.response?.data?.detail || '';
        if (detail.includes('Username already registered')) {
          toast.error('Пользователь с таким логином уже существует');
        } else if (detail.includes('Cannot delete yourself')) {
          toast.error('Нельзя удалить самого себя');
        } else {
          toast.error(`Ошибка: ${detail}`);
        }
      } else {
        toast.error('Ошибка при сохранении сотрудника');
      }
    }
  };

  const handleDeleteUser = async (userId: number) => {
    // Проверяем права администратора
    if (!currentUser?.is_admin) {
      toast.error('Недостаточно прав для удаления пользователей');
      return;
    }
    
    if (!window.confirm('Вы уверены, что хотите удалить этого сотрудника?')) {
      return;
    }

    try {
      await usersApi.delete(userId);
      toast.success('Сотрудник удален');
      loadUsers();
    } catch (error) {
      console.error('Error deleting user:', error);
      toast.error('Ошибка при удалении сотрудника');
    }
  };

  const openEditProfile = (user: User) => {
    setEditingProfile(user);
    resetProfile({
      name: user.name,
      position: user.position,
      phone: user.phone || '',
      telegram_id: user.telegram_id || '',
      email: user.email || ''
    });
    setShowProfileModal(true);
  };

  const handleUpdateProfile = async (data: UpdateProfile) => {
    try {
      const updatedUser = await profileApi.updateProfile(data);
      toast.success('Профиль обновлен');
      setShowProfileModal(false);
      setEditingProfile(null);
      resetProfile();
      
      // Обновляем currentUser если он редактировал свой профиль
      setCurrentUser(updatedUser);
      loadUsers();
    } catch (error: any) {
      console.error('Error updating profile:', error);
      toast.error('Ошибка при обновлении профиля');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Сотрудники</h1>
        {currentUser && currentUser.is_admin && (
          <button
            onClick={openCreateModal}
            className="btn btn-primary flex items-center gap-2"
          >
            <Plus size={20} />
            Добавить сотрудника
          </button>
        )}
      </div>

      {/* Users Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {users.map((user) => (
          <div key={user.id} className="card hover:shadow-lg transition-shadow">
            <div className="flex items-center space-x-3 mb-4">
              <div className="bg-primary-100 p-2 rounded-full">
                <UserIcon size={24} className="text-primary-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{user.name}</h3>
                <p className="text-sm text-gray-600">{user.position}</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center space-x-2 text-sm text-gray-600">
                <UserIcon size={16} />
                <span><strong>Логин:</strong> {user.username}</span>
              </div>

              {user.phone && (
                <div className="flex items-center space-x-2 text-sm text-gray-600">
                  <Phone size={16} />
                  <span>{user.phone}</span>
                </div>
              )}

              {user.telegram_id && (
                <div className="flex items-center space-x-2 text-sm text-gray-600">
                  <MessageCircle size={16} />
                  <span>@{user.telegram_id}</span>
                </div>
              )}

              {user.email && (
                <div className="flex items-center space-x-2 text-sm text-gray-600">
                  <Mail size={16} />
                  <span>{user.email}</span>
                </div>
              )}

              <div className="pt-2 border-t border-gray-200">
                <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                  <span>Статус: {user.is_active ? 'Активен' : 'Неактивен'}</span>
                  <span>Создан: {new Date(user.created_at).toLocaleDateString('ru-RU')}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center text-xs text-gray-500">
                    {user.is_admin && (
                      <div className="flex items-center space-x-1">
                        <Shield size={14} className="text-yellow-500" />
                        <span>Администратор</span>
                      </div>
                    )}
                  </div>
                  {currentUser && (
                    <div className="flex items-center space-x-2">
                      {currentUser.is_admin ? (
                        /* Админ видит: кнопку профиля для себя + админские кнопки для всех */
                        <>
                          {currentUser.id === user.id && (
                            <button
                              onClick={() => openEditProfile(user)}
                              className="text-green-600 hover:text-green-800 p-1"
                              title="Редактировать профиль"
                            >
                              <Edit size={16} />
                            </button>
                          )}
                          <button
                            onClick={() => openEditModal(user)}
                            className="text-blue-600 hover:text-blue-800 p-1"
                            title="Редактировать (админ)"
                          >
                            <Edit size={16} />
                          </button>
                          <button
                            onClick={() => handleDeleteUser(user.id)}
                            className="text-red-600 hover:text-red-800 p-1"
                            title="Удалить"
                          >
                            <Trash2 size={16} />
                          </button>
                        </>
                      ) : (
                        /* Обычные пользователи видят только кнопку профиля для себя */
                        currentUser.id === user.id && (
                          <button
                            onClick={() => openEditProfile(user)}
                            className="text-green-600 hover:text-green-800 p-1"
                            title="Редактировать профиль"
                          >
                            <Edit size={16} />
                          </button>
                        )
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-96 overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">
              {editingUser ? 'Редактировать сотрудника' : 'Добавить сотрудника'}
            </h2>
            <form onSubmit={handleSubmit(handleCreateUser)}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Логин *</label>
                  <input
                    type="text"
                    {...register('username', { required: 'Логин обязателен' })}
                    className="w-full border rounded-lg px-3 py-2"
                    placeholder="Введите логин"
                  />
                  {errors.username && (
                    <p className="text-red-500 text-sm mt-1">{errors.username.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    Пароль {editingUser ? '(оставьте пустым, чтобы не изменять)' : '*'}
                  </label>
                  <input
                    type="password"
                    {...register('password', { 
                      required: editingUser ? false : 'Пароль обязателен',
                      minLength: editingUser ? 0 : { value: 6, message: 'Пароль должен быть не менее 6 символов' }
                    })}
                    className="w-full border rounded-lg px-3 py-2"
                    placeholder={editingUser ? "Оставьте пустым, чтобы не изменять" : "Введите пароль"}
                  />
                  {errors.password && (
                    <p className="text-red-500 text-sm mt-1">{errors.password.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Имя *</label>
                  <input
                    type="text"
                    {...register('name', { required: 'Имя обязательно' })}
                    className="w-full border rounded-lg px-3 py-2"
                    placeholder="Введите имя"
                  />
                  {errors.name && (
                    <p className="text-red-500 text-sm mt-1">{errors.name.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Должность *</label>
                  <input
                    type="text"
                    {...register('position', { required: 'Должность обязательна' })}
                    className="w-full border rounded-lg px-3 py-2"
                    placeholder="Введите должность"
                  />
                  {errors.position && (
                    <p className="text-red-500 text-sm mt-1">{errors.position.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Телефон</label>
                  <input
                    type="tel"
                    {...register('phone')}
                    className="w-full border rounded-lg px-3 py-2"
                    placeholder="+7 (999) 123-45-67"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Telegram ID</label>
                  <input
                    type="text"
                    {...register('telegram_id')}
                    className="w-full border rounded-lg px-3 py-2"
                    placeholder="username (без @)"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Email</label>
                  <input
                    type="email"
                    {...register('email')}
                    className="w-full border rounded-lg px-3 py-2"
                    placeholder="user@example.com"
                  />
                </div>

                {currentUser && currentUser.is_admin && (
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      {...register('is_admin')}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      id="is_admin"
                    />
                    <label htmlFor="is_admin" className="text-sm font-medium text-gray-700">
                      Права администратора
                    </label>
                  </div>
                )}
              </div>

              <div className="flex gap-2 mt-6">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {editingUser ? 'Сохранить изменения' : 'Создать сотрудника'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-50"
                >
                  Отмена
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Profile Edit Modal */}
      {showProfileModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-96 overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">
              Редактировать профиль
            </h2>
            <form onSubmit={handleSubmitProfile(handleUpdateProfile)}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Имя *</label>
                  <input
                    type="text"
                    {...registerProfile('name', { required: 'Имя обязательно' })}
                    className="w-full border rounded-lg px-3 py-2"
                    placeholder="Введите имя"
                  />
                  {errorsProfile.name && (
                    <p className="text-red-500 text-sm mt-1">{errorsProfile.name.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Должность *</label>
                  <input
                    type="text"
                    {...registerProfile('position', { required: 'Должность обязательна' })}
                    className="w-full border rounded-lg px-3 py-2"
                    placeholder="Введите должность"
                  />
                  {errorsProfile.position && (
                    <p className="text-red-500 text-sm mt-1">{errorsProfile.position.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Телефон</label>
                  <input
                    type="tel"
                    {...registerProfile('phone')}
                    className="w-full border rounded-lg px-3 py-2"
                    placeholder="+7 (xxx) xxx-xx-xx"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Telegram ID</label>
                  <input
                    type="text"
                    {...registerProfile('telegram_id')}
                    className="w-full border rounded-lg px-3 py-2"
                    placeholder="username (без @)"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Email</label>
                  <input
                    type="email"
                    {...registerProfile('email')}
                    className="w-full border rounded-lg px-3 py-2"
                    placeholder="user@example.com"
                  />
                </div>
              </div>

              <div className="flex gap-2 mt-6">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  Сохранить профиль
                </button>
                <button
                  type="button"
                  onClick={() => setShowProfileModal(false)}
                  className="flex-1 border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-50"
                >
                  Отмена
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UsersPage;