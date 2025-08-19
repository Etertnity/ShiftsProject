import React, { useState, useEffect, useCallback } from 'react';
import { Plus, ChevronLeft, ChevronRight, Edit, Trash2 } from 'lucide-react';
import { shiftsApi, usersApi } from '../api.ts';
import { Shift, User, CreateShift } from '../types';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';

const ShiftsPage: React.FC = () => {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedUsers, setSelectedUsers] = useState<number[]>([]);
  const [isMultipleMode, setIsMultipleMode] = useState(false);

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<CreateShift>();
  const watchedShiftType = watch('shift_type');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [shiftsData, usersData] = await Promise.all([
        shiftsApi.getAll(),
        usersApi.getAllPublic()
      ]);
      setShifts(shiftsData);
      setUsers(usersData);
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Ошибка загрузки данных');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Принудительный ререндер при изменении месяца
  useEffect(() => {
    // Заставляем React полностью перерисовать календарь
    const timer = setTimeout(() => {
      // Пустой эффект для принудительного обновления
    }, 0);
    return () => clearTimeout(timer);
  }, [currentMonth]);

  // Функция для определения статуса смены
  const getShiftStatus = (shift: Shift) => {
    const now = new Date();
    const shiftDate = new Date(shift.date);
    const [startHour, startMinute] = shift.start_time.split(':').map(Number);
    const [endHour, endMinute] = shift.end_time.split(':').map(Number);
    
    // Создаем даты начала и конца смены
    const shiftStart = new Date(shiftDate);
    shiftStart.setHours(startHour, startMinute, 0, 0);
    
    let shiftEnd = new Date(shiftDate);
    shiftEnd.setHours(endHour, endMinute, 0, 0);
    
    // Если время окончания меньше времени начала - смена переходит на следующий день
    if (endHour < startHour) {
      shiftEnd.setDate(shiftEnd.getDate() + 1);
    }

    if (now < shiftStart) {
      return 'ожидание';
    } else if (now >= shiftStart && now <= shiftEnd) {
      return 'активна';
    } else {
      return 'завершена';
    }
  };

  // Функция для получения цвета статуса
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'активна':
        return 'bg-green-100 text-green-800';
      case 'ожидание':
        return 'bg-yellow-100 text-yellow-800';
      case 'завершена':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Получение дней месяца
  const getDaysInMonth = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    
    // Определяем день недели первого дня месяца (0 = воскресенье, корректируем на понедельник = 0)
    const firstDayOfWeek = (firstDay.getDay() + 6) % 7;
    
    // Отладочная информация
    console.log(`Месяц: ${month + 1}/${year}, Первый день: ${firstDay.toDateString()}, День недели: ${firstDayOfWeek}`);
    
    const days: (number | null)[] = [];
    
    // Добавляем пустые ячейки для предыдущего месяца
    for (let i = 0; i < firstDayOfWeek; i++) {
      days.push(null);
    }
    
    // Добавляем дни текущего месяца
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(day);
    }
    
    // Добавляем пустые ячейки для следующего месяца, чтобы получить полные 6 недель (42 дня)
    while (days.length < 42) {
      days.push(null);
    }
    
    console.log(`Дни: ${days.slice(0, 14).map(d => d || 'X').join(' ')}`);
    
    return days;
  };

  // Получение смен для конкретного дня
  const getShiftsForDay = (day: number) => {
    if (!day) return [];
    const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return shifts.filter(shift => shift.date === dateStr);
  };

  // Открытие модального окна создания смены
  const openCreateModal = (day?: number) => {
    setEditingShift(null);
    setIsMultipleMode(false);
    setSelectedUsers([]);
    
    const date = day 
      ? `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      : new Date().toISOString().split('T')[0];
    
    reset({
      date,
      user_id: 0,
      start_time: '09:00',
      end_time: '21:00',
      shift_type: 'day'
    });
    setShowModal(true);
  };

  // Открытие модального окна для множественного создания
  const openMultipleModal = (day?: number) => {
    setEditingShift(null);
    setIsMultipleMode(true);
    setSelectedUsers([]);
    
    const date = day 
      ? `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      : new Date().toISOString().split('T')[0];
    
    reset({
      date,
      user_id: 0,
      start_time: '09:00',
      end_time: '21:00',
      shift_type: 'day'
    });
    setShowModal(true);
  };

  // Открытие модального окна редактирования
  const openEditModal = (shift: Shift) => {
    setEditingShift(shift);
    setIsMultipleMode(false);
    reset({
      date: shift.date,
      user_id: shift.user_id,
      start_time: shift.start_time,
      end_time: shift.end_time,
      shift_type: shift.start_time === '09:00' ? 'day' : 'night'
    });
    setShowModal(true);
  };

  // Создание/обновление смены
  const handleCreateShift = async (data: CreateShift) => {
    try {
      if (editingShift) {
        await shiftsApi.update(editingShift.id, data);
        toast.success('Смена обновлена');
      } else if (isMultipleMode && selectedUsers.length > 0) {
        const shiftsToCreate = selectedUsers.map(userId => ({
          ...data,
          user_id: userId
        }));
        await shiftsApi.createMultiple(shiftsToCreate);
        toast.success(`Создано ${selectedUsers.length} смен`);
      } else {
        await shiftsApi.create(data);
        toast.success('Смена создана');
      }
      
      setShowModal(false);
      setEditingShift(null);
      setSelectedUsers([]);
      reset();
      loadData();
    } catch (error) {
      console.error('Error creating/updating shift:', error);
      toast.error('Ошибка при сохранении смены');
    }
  };

  // Удаление смены
  const handleDeleteShift = async (shiftId: number) => {
    if (!window.confirm('Вы уверены, что хотите удалить эту смену?')) {
      return;
    }

    try {
      await shiftsApi.delete(shiftId);
      toast.success('Смена удалена');
      loadData();
    } catch (error) {
      console.error('Error deleting shift:', error);
      toast.error('Ошибка при удалении смены');
    }
  };

  // Отслеживание изменений типа смены
  useEffect(() => {
    if (watchedShiftType === 'day') {
      setValue('start_time', '09:00');
      setValue('end_time', '21:00');
    } else if (watchedShiftType === 'night') {
      setValue('start_time', '21:00');
      setValue('end_time', '09:00');
    }
  }, [watchedShiftType, setValue]);

  // Переключение месяца
  const changeMonth = (direction: number) => {
    setCurrentMonth(prev => {
      const newMonth = new Date(prev);
      newMonth.setMonth(newMonth.getMonth() + direction);
      return newMonth;
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const days = getDaysInMonth();
  const monthNames = [
    'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Управление сменами</h1>
        <div className="flex gap-2">
          <button
            onClick={() => openMultipleModal()}
            className="btn btn-secondary flex items-center gap-2"
          >
            <Plus size={20} />
            Создать несколько смен
          </button>
          <button
            onClick={() => openCreateModal()}
            className="btn btn-primary flex items-center gap-2"
          >
            <Plus size={20} />
            Создать смену
          </button>
        </div>
      </div>

      {/* Навигация по месяцам */}
      <div className="flex justify-between items-center bg-white p-4 rounded-lg shadow">
        <button
          onClick={() => changeMonth(-1)}
          className="p-2 hover:bg-gray-100 rounded-lg"
        >
          <ChevronLeft size={20} />
        </button>
        <h2 className="text-xl font-semibold">
          {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
        </h2>
        <button
          onClick={() => changeMonth(1)}
          className="p-2 hover:bg-gray-100 rounded-lg"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Календарная сетка */}
      <div key={`calendar-container-${currentMonth.getFullYear()}-${currentMonth.getMonth()}`} className="bg-white rounded-lg shadow overflow-hidden" style={{ height: '816px' }}>
        {/* Заголовки дней недели */}
        <div className="grid grid-cols-7 bg-gray-50" style={{ height: '48px' }}>
          {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(day => (
            <div key={`header-${day}`} className="p-3 text-center text-sm font-medium text-gray-700 border border-gray-200 flex items-center justify-center">
              {day}
            </div>
          ))}
        </div>

        {/* Дни месяца */}
        <div key={`calendar-${currentMonth.getFullYear()}-${currentMonth.getMonth()}`} className="grid grid-cols-7 grid-rows-6 gap-0" style={{ height: '768px' }}>
          {days.map((day, index) => {
            if (!day) {
              return <div key={`empty-${currentMonth.getFullYear()}-${currentMonth.getMonth()}-${index}`} className="border border-gray-200 bg-gray-50"></div>;
            }

            const dayShifts = getShiftsForDay(day);
            const isToday = new Date().toDateString() === new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day).toDateString();

            return (
              <div
                key={`day-${currentMonth.getFullYear()}-${currentMonth.getMonth()}-${day}`}
                className={`border border-gray-200 p-2 overflow-y-auto ${
                  isToday ? 'bg-blue-50' : 'bg-white'
                } hover:bg-gray-50`}
              >
                <div className="flex justify-between items-start mb-2">
                  <span className={`text-sm font-medium ${isToday ? 'text-blue-600' : 'text-gray-900'}`}>
                    {day}
                  </span>
                  <button
                    onClick={() => openCreateModal(day)}
                    className="text-gray-400 hover:text-blue-600 p-1"
                    title="Добавить смену"
                  >
                    <Plus size={14} />
                  </button>
                </div>

                {/* Смены */}
                <div className="space-y-1.5">
                  {dayShifts
                    .sort((a, b) => {
                      // Сортируем: дневные смены выше ночных
                      if (a.shift_type === 'day' && b.shift_type === 'night') return -1;
                      if (a.shift_type === 'night' && b.shift_type === 'day') return 1;
                      return 0;
                    })
                    .map(shift => {
                    const user = users.find(u => u.id === shift.user_id);
                    const status = getShiftStatus(shift);
                    const isDayShift = shift.shift_type === 'day';
                    
                    return (
                      <div
                        key={shift.id}
                        className={`text-xs p-2 rounded-lg border-2 hover:shadow-md transition-all duration-200 ${
                          isDayShift 
                            ? 'bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200' 
                            : 'bg-gradient-to-r from-purple-50 to-indigo-50 border-purple-200'
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-1">
                              <div className={`w-1.5 h-1.5 rounded-full ${
                                isDayShift ? 'bg-blue-500' : 'bg-purple-500'
                              }`}></div>
                              <p className="font-semibold text-gray-900 text-xs leading-tight truncate">
                                {user?.name || 'Неизвестно'}
                              </p>
                            </div>
                            <p className="text-gray-700 text-xs font-medium mb-1">
                              {shift.start_time} - {shift.end_time}
                            </p>
                            <div className="flex items-center gap-1.5">
                              <span className={`inline-block px-1.5 py-0.5 text-xs rounded-full font-medium ${getStatusColor(status)}`}>
                                {status}
                              </span>
                              <span className={`text-xs font-medium ${
                                isDayShift ? 'text-blue-700' : 'text-purple-700'
                              }`}>
                                {isDayShift ? 'День' : 'Ночь'}
                              </span>
                            </div>
                          </div>
                          <div className="flex gap-0.5 ml-1">
                            <button
                              onClick={() => openEditModal(shift)}
                              className="text-blue-600 hover:text-blue-800 p-0.5 rounded hover:bg-blue-50 transition-colors"
                              title="Редактировать"
                            >
                              <Edit size={10} />
                            </button>
                            <button
                              onClick={() => handleDeleteShift(shift.id)}
                              className="text-red-600 hover:text-red-800 p-0.5 rounded hover:bg-red-50 transition-colors"
                              title="Удалить"
                            >
                              <Trash2 size={10} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Модальное окно создания/редактирования смены */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 modal-overlay">
          <div className="bg-white rounded-lg p-6 w-full max-w-none resizable-modal modal-panel">
            <h2 className="text-xl font-bold mb-4">
              {editingShift ? 'Редактировать смену' : 
               isMultipleMode ? 'Создать несколько смен' : 'Создать смену'}
            </h2>
            <form onSubmit={handleSubmit(handleCreateShift)}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Дата *</label>
                  <input
                    type="date"
                    {...register('date', { required: 'Дата обязательна' })}
                    className="w-full border rounded-lg px-3 py-2"
                  />
                  {errors.date && (
                    <p className="text-red-500 text-sm mt-1">{errors.date.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Тип смены *</label>
                  <select
                    {...register('shift_type', { required: 'Тип смены обязателен' })}
                    className="w-full border rounded-lg px-3 py-2"
                  >
                    <option value="day">Дневная (09:00-21:00)</option>
                    <option value="night">Ночная (21:00-09:00)</option>
                  </select>
                  {errors.shift_type && (
                    <p className="text-red-500 text-sm mt-1">{errors.shift_type.message}</p>
                  )}
                </div>

                {isMultipleMode ? (
                  <div>
                    <label className="block text-sm font-medium mb-2">Сотрудники *</label>
                    <div className="max-h-40 overflow-y-auto border rounded-lg p-2">
                      {users.map(user => (
                        <label key={user.id} className="flex items-center space-x-2 p-1">
                          <input
                            type="checkbox"
                            checked={selectedUsers.includes(user.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedUsers(prev => [...prev, user.id]);
                              } else {
                                setSelectedUsers(prev => prev.filter(id => id !== user.id));
                              }
                            }}
                            className="rounded"
                          />
                          <span className="text-sm">{user.name} ({user.position})</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium mb-2">Сотрудник *</label>
                    <select
                      {...register('user_id', { 
                        required: 'Сотрудник обязателен',
                        valueAsNumber: true 
                      })}
                      className="w-full border rounded-lg px-3 py-2"
                    >
                      <option value={0}>Выберите сотрудника</option>
                      {users.map(user => (
                        <option key={user.id} value={user.id}>
                          {user.name} ({user.position})
                        </option>
                      ))}
                    </select>
                    {errors.user_id && (
                      <p className="text-red-500 text-sm mt-1">{errors.user_id.message}</p>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Начало смены</label>
                    <input
                      type="time"
                      {...register('start_time')}
                      className="w-full border rounded-lg px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Конец смены</label>
                    <input
                      type="time"
                      {...register('end_time')}
                      className="w-full border rounded-lg px-3 py-2"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-2 mt-6">
                <button
                  type="submit"
                  disabled={loading || (isMultipleMode && selectedUsers.length === 0)}
                  className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {editingShift ? 'Обновить' : 
                   isMultipleMode ? `Создать ${selectedUsers.length} смен` : 'Создать'}
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
    </div>
  );
};

export default ShiftsPage;