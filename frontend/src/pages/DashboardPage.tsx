import React, { useState, useEffect } from 'react';
import { Calendar, Users, ArrowRightLeft, Clock, AlertCircle } from 'lucide-react';
import { shiftsApi, usersApi, handoversApi, assetsApi } from '../api.ts';
import { Shift, Handover, Asset } from '../types';

const DashboardPage: React.FC = () => {
  const [stats, setStats] = useState({
    todayShifts: 0,
    totalUsers: 0,
    activeCases: 0,
    totalHandovers: 0
  });
  const [todayShifts, setTodayShifts] = useState<Shift[]>([]);
  const [recentHandovers, setRecentHandovers] = useState<Handover[]>([]);
  const [activeCases, setActiveCases] = useState<Asset[]>([]);
  const [nextShifts, setNextShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

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

  // Функция для получения следующих смен
  const getNextShifts = (allShifts: Shift[]) => {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    // Получаем все смены на сегодня и завтра
    const todayAndTomorrowShifts = allShifts.filter(shift => 
      shift.date === today || shift.date === tomorrowStr
    );

    // Фильтруем будущие смены и сортируем по времени
    const futureShifts = todayAndTomorrowShifts.filter(shift => {
      const shiftDate = new Date(shift.date);
      const [startHour, startMinute] = shift.start_time.split(':').map(Number);
      const shiftStart = new Date(shiftDate);
      shiftStart.setHours(startHour, startMinute, 0, 0);
      
      return shiftStart > now;
    }).sort((a, b) => {
      const dateA = new Date(`${a.date} ${a.start_time}`);
      const dateB = new Date(`${b.date} ${b.start_time}`);
      return dateA.getTime() - dateB.getTime();
    });

    return futureShifts.slice(0, 5); // Показываем только 5 ближайших
  };

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const today = new Date().toISOString().split('T')[0];
      
      const [shifts, users, handovers, todayShiftsData, assets] = await Promise.all([
        shiftsApi.getAll(),
        usersApi.getAllPublic(),
        handoversApi.getAll(),
        shiftsApi.getAll(today),
        assetsApi.getAll()
      ]);

      // Фильтруем активные кейсы (CASE и ORANGE_CASE со статусом Active)
      const activeAssets = assets.filter(asset => 
        (asset.asset_type === 'CASE' || asset.asset_type === 'ORANGE_CASE') && 
        asset.status === 'Active'
      );

      setStats({
        todayShifts: todayShiftsData.length,
        totalUsers: users.length,
        activeCases: activeAssets.length,
        totalHandovers: handovers.length
      });

      setTodayShifts(todayShiftsData.slice(0, 5));
      setRecentHandovers(handovers.slice(0, 5));
      setActiveCases(activeAssets.slice(0, 5));
      setNextShifts(getNextShifts(shifts));
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const StatCard: React.FC<{
    title: string;
    value: number;
    icon: React.ReactNode;
    color: string;
  }> = ({ title, value, icon, color }) => (
    <div className="card">
      <div className="flex items-center">
        <div className={`p-3 rounded-full ${color}`}>
          {icon}
        </div>
        <div className="ml-4">
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
        </div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Дашборд</h1>
        <p className="mt-1 text-sm text-gray-500">
          Обзор системы управления сменами
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Смены сегодня"
          value={stats.todayShifts}
          icon={<Calendar className="w-6 h-6 text-white" />}
          color="bg-blue-500"
        />
        <StatCard
          title="Всего сотрудников"
          value={stats.totalUsers}
          icon={<Users className="w-6 h-6 text-white" />}
          color="bg-green-500"
        />
        <StatCard
          title="Активные кейсы"
          value={stats.activeCases}
          icon={<AlertCircle className="w-6 h-6 text-white" />}
          color="bg-yellow-500"
        />
        <StatCard
          title="Всего передач"
          value={stats.totalHandovers}
          icon={<ArrowRightLeft className="w-6 h-6 text-white" />}
          color="bg-purple-500"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Today's Shifts */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Смены сегодня</h2>
            <Calendar className="w-5 h-5 text-gray-400" />
          </div>
          <div className="space-y-3">
            {todayShifts.length > 0 ? (
              todayShifts.map((shift) => {
                const status = getShiftStatus(shift);
                return (
                  <div key={shift.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium text-gray-900">{shift.user_name}</p>
                      <p className="text-sm text-gray-500">{shift.position}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-gray-900">
                        {shift.start_time}-{shift.end_time}
                      </p>
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(status)}`}>
                        {status}
                      </span>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-gray-500 text-center py-4">Смен на сегодня нет</p>
            )}
          </div>
        </div>

        {/* Next Shifts */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Следующие смены</h2>
            <Clock className="w-5 h-5 text-gray-400" />
          </div>
          <div className="space-y-3">
            {nextShifts.length > 0 ? (
              nextShifts.map((shift) => {
                const status = getShiftStatus(shift);
                const isToday = shift.date === new Date().toISOString().split('T')[0];
                return (
                  <div key={shift.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{shift.user_name}</p>
                      <p className="text-sm text-gray-500">{shift.position}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {isToday ? 'Сегодня' : 'Завтра'} {shift.start_time}-{shift.end_time}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        shift.shift_type === 'day' 
                          ? 'bg-yellow-100 text-yellow-800' 
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {shift.shift_type === 'day' ? 'Дневная' : 'Ночная'}
                      </span>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-gray-500 text-center py-4">Следующих смен нет</p>
            )}
          </div>
        </div>
      </div>

      {/* Active Cases Section */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Активные кейсы</h2>
          <AlertCircle className="w-5 h-5 text-gray-400" />
        </div>
        <div className="space-y-3">
          {activeCases.length > 0 ? (
            activeCases.map((asset) => (
              <div key={asset.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{asset.title}</p>
                  <p className="text-sm text-gray-500 break-words whitespace-pre-wrap line-clamp-2">
                    {asset.description?.substring(0, 80)}
                    {(asset.description?.length || 0) > 80 ? '...' : ''}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {new Date(asset.created_at).toLocaleDateString('ru-RU')}
                  </p>
                </div>
                <span className={`ml-3 inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                  asset.asset_type === 'CASE' 
                    ? 'bg-blue-100 text-blue-800' 
                    : 'bg-orange-100 text-orange-800'
                }`}>
                  {asset.asset_type === 'CASE' ? 'CASE' : 'Orange CASE'}
                </span>
              </div>
            ))
          ) : (
            <p className="text-gray-500 text-center py-4">Активных кейсов нет</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
