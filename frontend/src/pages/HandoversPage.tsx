// Страница передачи смен: оставляем существующий функционал, но упрощаем повторяющиеся конструкции
import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Download, Trash2, Maximize2, X } from 'lucide-react';
import logo from '../assets/tserv-logo.svg';
import { handoversApi, shiftsApi, assetsApi } from '../api.ts';
import { Handover, Shift, Asset, CreateHandover } from '../types';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';

// Единая подсказка для заметок (по требованию — только слово "Наблюдения")
const buildStructuredNotes = () => 'Наблюдения';

// Описания групп активов используются в нескольких местах, поэтому храним их в одном массиве
const assetGroups = [
  { key: 'CASE', label: 'CASE', accent: 'from-primary-500 via-sky-400 to-cyan-200', ring: 'ring-blue-300', badge: 'bg-blue-100 text-blue-700', selection: 'border-blue-300', summary: 'Какие кейсы ведём, статусы и ближайшие шаги.' },
  { key: 'ORANGE_CASE', label: 'Orange CASE', accent: 'from-sky-500 via-primary-500 to-cyan-300', ring: 'ring-orange-300', badge: 'bg-orange-100 text-orange-700', selection: 'border-orange-300', summary: 'Новые инциденты Orange и кому переданы.' },
  { key: 'CHANGE_MANAGEMENT', label: 'Change Mgmt', accent: 'from-cyan-500 via-primary-500 to-sky-200', ring: 'ring-purple-300', badge: 'bg-purple-100 text-purple-700', selection: 'border-purple-300', summary: 'Окна, риски, ответственные и контрольные точки.' },
  { key: 'CLIENT_REQUESTS', label: 'Обращения клиентов', accent: 'from-primary-600 via-sky-400 to-blue-200', ring: 'ring-green-300', badge: 'bg-green-100 text-green-700', selection: 'border-green-300', summary: 'Ключевые тикеты, обещания и SLA-таймеры.' },
] as const;

// Быстрый помощник для разбиения активов по группам
const groupAssets = (items: Asset[]) =>
  assetGroups.map(group => ({
    ...group,
    items: items.filter(asset => asset.asset_type === group.key),
  }));

// Короткие напоминания: отдельный список, чтобы не размножать разметку
const quickReminders = [
  'Зафиксируйте, какие кейсы взяли/передали и итог по каждому.',
  'Проверьте Orange CASE: новые инциденты, исполнители и дедлайны.',
  'Обновите change management: окна, риски и контрольные действия.',
  'Отметьте клиентские обращения, ожидаемые ответы и SLA-таймеры.',
  'Опишите наблюдения по инфраструктуре, тревогам и стабильности смены.',
];

const HandoversPage: React.FC = () => {
  const [handovers, setHandovers] = useState<Handover[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingHandover, setEditingHandover] = useState<Handover | null>(null);
  const [selectedAssets, setSelectedAssets] = useState<number[]>([]);
  const [assetDrafts, setAssetDrafts] = useState<Record<number, { status: Asset['status']; description: string }>>({});
  const [showAssetDetail, setShowAssetDetail] = useState(false);
  const [selectedAssetDetail, setSelectedAssetDetail] = useState<Asset | null>(null);
  const [fullscreenNotes, setFullscreenNotes] = useState<string | null>(null);

  const [suggestedToShift, setSuggestedToShift] = useState<Shift | null>(null);
  const [selectedActiveShift, setSelectedActiveShift] = useState<Shift | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<CreateHandover>();
  const watchedFromShift = watch('from_shift_id');

  useEffect(() => {
    loadData();
  }, []);

  // Функция для поиска следующей смены по графику
  const findNextShift = useCallback((fromShift: Shift): Shift | null => {
    const fromDate = new Date(fromShift.date);
    let targetDate: Date;
    let targetType: string;

    if (fromShift.shift_type === 'day') {
      // Если дневная смена, ищем ночную того же дня
      targetDate = new Date(fromDate);
      targetType = 'night';
    } else {
      // Если ночная смена, ищем дневную следующего дня
      targetDate = new Date(fromDate);
      targetDate.setDate(targetDate.getDate() + 1);
      targetType = 'day';
    }

    const targetDateStr = targetDate.toISOString().split('T')[0];
    
    // Ищем смену на целевую дату с целевым типом
    const candidateShifts = shifts.filter(shift => 
      shift.date === targetDateStr && 
      shift.shift_type === targetType
    );

    // Возвращаем первую найденную смену (можно добавить дополнительную логику выбора)
    return candidateShifts.length > 0 ? candidateShifts[0] : null;
  }, [shifts]);

  // Отслеживаем изменение выбранной "передающей смены" и предлагаем следующую
  useEffect(() => {
    if (watchedFromShift && shifts.length > 0) {
      const fromShift = shifts.find(s => s.id === parseInt(watchedFromShift.toString()));
      if (fromShift) {
        const nextShift = findNextShift(fromShift);
        setSuggestedToShift(nextShift);
        if (nextShift) {
          setValue('to_shift_id', nextShift.id);
        }
      }
    }
  }, [watchedFromShift, shifts, setValue, findNextShift]);

  // Функция для поиска активной смены
  const findActiveShift = (): Shift | null => {
    const now = new Date();
    
    // Проходим по всем сменам и ищем активную
    for (const shift of shifts) {
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

      // Проверяем, активна ли смена сейчас
      if (now >= shiftStart && now <= shiftEnd) {
        return shift;
      }
    }
    
    return null;
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const [handoversData, shiftsData, assetsData] = await Promise.all([
        handoversApi.getAll(),
        shiftsApi.getAll(),
        assetsApi.getAll()
      ]);
      setHandovers(handoversData);
      setShifts(shiftsData);
      setAssets(assetsData);
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Ошибка загрузки данных');
    } finally {
      setLoading(false);
    }
  };

  const preselectActiveCases = () => {
    const activeCaseIds = assets
      .filter(asset => asset.asset_type === 'CASE' && asset.status === 'Active')
      .map(asset => asset.id);

    const drafts = activeCaseIds.reduce((acc, assetId) => {
      const asset = assets.find(a => a.id === assetId);
      if (asset) {
        acc[assetId] = { status: asset.status, description: asset.description };
      }
      return acc;
    }, {} as Record<number, { status: Asset['status']; description: string }>);

    setSelectedAssets(activeCaseIds);
    setAssetDrafts(drafts);

    return activeCaseIds;
  };

  const openCreateModal = () => {
    setEditingHandover(null);
    setAssetDrafts({});

    // Ищем активную смену и автоматически выбираем её
    const activeShift = findActiveShift();
    setSelectedActiveShift(activeShift);

    const defaultCaseIds = preselectActiveCases();

    reset({
      from_shift_id: activeShift ? activeShift.id : undefined,
      to_shift_id: undefined,
      handover_notes: buildStructuredNotes(),
      asset_ids: defaultCaseIds
    });
    
    // Если есть активная смена, сразу предлагаем следующую
    if (activeShift) {
      const nextShift = findNextShift(activeShift);
      setSuggestedToShift(nextShift);
      if (nextShift) {
        setValue('to_shift_id', nextShift.id);
      }
    }
    
    setShowModal(true);
  };

  const openEditModal = (handover: Handover) => {
    setEditingHandover(handover);
    setSelectedAssets(handover.assets.map(asset => asset.id));
    setAssetDrafts(
      handover.assets.reduce((acc, asset) => ({
        ...acc,
        [asset.id]: {
          status: asset.status,
          description: asset.description,
        }
      }), {})
    );
    reset({
      from_shift_id: handover.from_shift_id || undefined,
      to_shift_id: handover.to_shift_id || undefined,
      handover_notes: handover.handover_notes,
      asset_ids: handover.assets.map(asset => asset.id)
    });
    setShowModal(true);
  };

  const formatMoscow = (iso: string) => {
    const normalized = iso.endsWith('Z') ? iso : `${iso}Z`;
    return new Date(normalized).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
  };

  const handleDeleteHandover = async (handoverId: number) => {
    if (!window.confirm('Удалить эту запись передачи смены?')) return;

    try {
      await handoversApi.delete(handoverId);
      toast.success('Запись удалена');
      loadData();
    } catch (error) {
      console.error('Error deleting handover:', error);
      toast.error('Не удалось удалить запись');
    }
  };

  const handleDeleteAsset = async (assetId: number, event?: React.MouseEvent) => {
    if (event) {
      event.stopPropagation();
    }

    if (!window.confirm('Удалить этот актив?')) return;

    try {
      await assetsApi.delete(assetId);
      toast.success('Актив удалён');
      loadData();
    } catch (error) {
      console.error('Error deleting asset:', error);
      toast.error('Не удалось удалить актив');
    }
  };

  const appendShiftStamp = (baseDescription: string, fromShift?: Shift | null) => {
    const now = new Date();
    const timestamp = now.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
    const shiftLabel = fromShift
      ? `${fromShift.user_name} (${fromShift.date} ${fromShift.start_time}-${fromShift.end_time})`
      : 'Смена не указана';

    const trimmed = baseDescription.trimEnd();
    return `${trimmed}\n\nОбновлено ${timestamp} — смена: ${shiftLabel}`;
  };

  const handleCreateHandover = async (data: CreateHandover) => {
    try {
      const handoverData = {
        ...data,
        asset_ids: selectedAssets
      };

      const fromShift = data.from_shift_id
        ? shifts.find(s => s.id === Number(data.from_shift_id))
        : selectedActiveShift;

      await Promise.all(
        selectedAssets.map(assetId => {
          const asset = assets.find(a => a.id === assetId);
          if (!asset) return Promise.resolve();

          const draft = assetDrafts[assetId] || { status: asset.status, description: asset.description };

          const hasChanges = draft.status !== asset.status || draft.description !== asset.description;
          if (!hasChanges) return Promise.resolve();

          return assetsApi.update(assetId, {
            status: draft.status,
            description: appendShiftStamp(draft.description, fromShift)
          });
        })
      );

      if (editingHandover) {
        await handoversApi.update(editingHandover.id, handoverData);
        toast.success('Передача смены обновлена');
      } else {
        await handoversApi.create(handoverData);
        toast.success('Передача смены создана');
      }
      
      setShowModal(false);
      setEditingHandover(null);
      setSelectedAssets([]);
      setSelectedActiveShift(null);
      setSuggestedToShift(null);
      reset();
      loadData();
    } catch (error) {
      console.error('Error creating/updating handover:', error);
      toast.error('Ошибка при сохранении передачи смены');
    }
  };

  const toggleAssetSelection = (assetId: number) => {
    const asset = assets.find(a => a.id === assetId);
    if (!asset) return;

    setSelectedAssets(prev => {
      if (prev.includes(assetId)) {
        setAssetDrafts(drafts => {
          const { [assetId]: _, ...rest } = drafts;
          return rest;
        });
        return prev.filter(id => id !== assetId);
      }

      setAssetDrafts(drafts => ({
        ...drafts,
        [assetId]: drafts[assetId] || { status: asset.status, description: asset.description }
      }));

      return [...prev, assetId];
    });
  };

  const openAssetDetail = (asset: Asset) => {
    setSelectedAssetDetail(asset);
    setShowAssetDetail(true);
  };

  const getShiftInfo = (shiftId: number | null | undefined) => {
    if (!shiftId) return 'Не указана';
    const shift = shifts.find(s => s.id === shiftId);
    if (!shift) return 'Не найдена';
    return `${shift.user_name} (${shift.date} ${shift.start_time}-${shift.end_time})`;
  };

  const getAssetTypeDisplay = (type: string) => {
    switch (type) {
      case 'CASE': return 'CASE';
      case 'CHANGE_MANAGEMENT': return 'Change Management';
      case 'ORANGE_CASE': return 'Orange CASE';
      case 'CLIENT_REQUESTS': return 'Обращения клиентов';
      default: return type;
    }
  };

  const getAssetStatusColor = (status: string) => {
    switch (status) {
      case 'Active': return 'bg-green-100 text-green-800';
      case 'Completed': return 'bg-blue-100 text-blue-800';
      case 'On Hold': return 'bg-blue-100 text-blue-800';
      case 'Closed': return 'bg-gray-200 text-gray-900';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getAssetStatusLabel = (status: string) => {
    switch (status) {
      case 'Active':
        return 'Активен';
      case 'Completed':
        return 'Завершён';
      case 'On Hold':
        return 'На удержании';
      case 'Closed':
        return 'Закрыт';
      default:
        return status;
    }
  };

  // Функция экспорта данных
  const handleExport = async () => {
    try {
      setIsExporting(true);
      console.log('Starting export...');
      const exportData = await handoversApi.export();
      console.log('Export response:', exportData);
      
      if (!exportData || !exportData.data || exportData.data.length === 0) {
        toast('Нет данных для экспорта', { icon: 'ℹ️' });
        return;
      }
      
      // Подготавливаем данные для CSV из простых логов
      const csvData = exportData.data.map((log: any) => ({
        'ID': log.id || 'Не указано',
        'Дата': log.date || 'Не указано',
        'Время': log.time || 'Не указано',
        'Передающий': log.from_shift_user || 'Не указано',
        'Время смены (от)': log.from_shift_time || 'Не указано',
        'Принимающий': log.to_shift_user || 'Не указано',
        'Время смены (до)': log.to_shift_time || 'Не указано',
        'Описание передачи': log.handover_notes || 'Не указано',
        'Активы': log.assets_info || 'Нет активов'
      }));

      if (csvData.length === 0) {
        toast('Нет данных для экспорта', { icon: 'ℹ️' });
        return;
      }

      // Создаем CSV строку
      const headers = Object.keys(csvData[0] || {});
      const csvContent = [
        headers.join(','),
        ...csvData.map(row => 
          headers.map(header => `"${String((row as any)[header] || '').replace(/"/g, '""')}"`).join(',')
        )
      ].join('\n');

      // Скачиваем файл
      const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `handovers_export_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      
      toast.success(`Экспортировано ${exportData.total} передач смен`);
    } catch (error: any) {
      console.error('Error exporting data:', error);
      if (error.response?.status === 422) {
        toast.error('Ошибка обработки данных на сервере. Проверьте данные передач.');
      } else if (error.response?.status === 403) {
        toast.error('Недостаточно прав для экспорта данных');
      } else {
        toast.error('Ошибка при экспорте данных');
      }
    } finally {
      setIsExporting(false);
    }
  };

  // Краткая сводка по активам: считаем количество по каждой группе
  const assetSummary = assetGroups.map(group => ({
    ...group,
    count: assets.filter(asset => asset.asset_type === group.key).length,
  }));

  // Активы, доступные для выбора в передаче (без завершённых)
  const groupedSelectableAssets = groupAssets(assets.filter(asset => asset.status !== 'Completed'));

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-stretch">
        <div className="lg:col-span-2 bg-white/90 backdrop-blur border border-blue-100 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <img src={logo} alt="IN-SERV" className="w-10 h-10 rounded-xl shadow-inner border border-blue-100 bg-white" />
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-gray-500">In-serv</p>
              <h3 className="text-lg font-bold text-gray-900">Передача смен без потерь</h3>
            </div>
          </div>
          <p className="text-sm text-gray-600 mb-3">Сине-голубой акцент помогает быстрее ориентироваться. Фокус — кейсы, Orange, change management и клиентские обязательства.</p>
          <div className="space-y-2 text-sm text-gray-700">
            {quickReminders.map(item => (
              <div key={item} className="flex items-start gap-2">
                <span className="mt-1 h-2 w-2 rounded-full bg-primary-500"></span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-4">
          {assetSummary.map(item => (
            <div key={item.key} className="relative overflow-hidden rounded-2xl border border-blue-100 bg-white/90 backdrop-blur shadow-md transition-transform duration-200 hover:-translate-y-1">
              <div className={`absolute inset-0 opacity-60 bg-gradient-to-br ${item.accent}`}></div>
              <div className="relative p-4 space-y-1">
                <p className="text-xs uppercase tracking-[0.2em] text-gray-700">{item.label}</p>
                <div className="flex items-center justify-between">
                  <h4 className="text-xl font-bold text-gray-900">{item.count}</h4>
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-white/80 text-primary-700 border border-blue-100">в фокусе</span>
                </div>
                <p className="text-sm text-gray-700">{item.summary}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Передачи смен</h1>
        <div className="flex gap-2">
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-blue-200 bg-white/80 text-primary-700 hover:bg-blue-50 transition-colors"
            title="Экспорт всех передач в CSV"
          >
            <Download size={20} />
            {isExporting ? 'Экспорт...' : 'Экспорт'}
          </button>
            <button
              onClick={openCreateModal}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-white bg-gradient-to-r from-primary-500 to-sky-500 hover:from-primary-600 hover:to-sky-600 shadow-lg transition-all"
            >
              <Plus size={20} />
              Записать смену
            </button>
        </div>
      </div>

      {/* Handover Cards */}
      <div className="grid gap-6">
        {handovers.map((handover) => (
          <div key={handover.id} className="card">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Передача смены #{handover.id}
              </h3>
              <div className="flex gap-2">
                <button
                  onClick={() => openEditModal(handover)}
                  className="text-blue-600 hover:text-blue-800 text-sm"
                >
                  Редактировать
                </button>
                <button
                  onClick={() => handleDeleteHandover(handover.id)}
                  className="text-red-600 hover:text-red-800 text-sm"
                >
                  Удалить
                </button>
              </div>
            </div>

            {/* Shift Information */}
            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
              <h4 className="font-medium text-gray-900 mb-2">Информация о сменах</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="font-medium">Передающая смена:</span>
                  <p className="text-gray-600">{getShiftInfo(handover.from_shift_id)}</p>
                </div>
                <div>
                  <span className="font-medium">Принимающая смена:</span>
                  <p className="text-gray-600">{getShiftInfo(handover.to_shift_id)}</p>
                </div>
              </div>
            </div>

            {/* Handover Notes */}
            <div className="mb-4">
              <h4 className="font-medium text-gray-900 mb-2">Заметки по передаче:</h4>
              <div className="relative">
                <p className="text-gray-600 whitespace-pre-wrap break-words text-wrap-force line-clamp-5">
                  {handover.handover_notes}
                </p>
                <button
                  className="mt-2 text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
                  onClick={() => setFullscreenNotes(handover.handover_notes)}
                >
                  <Maximize2 size={16} /> Открыть
                </button>
              </div>
            </div>

            {/* Assets */}
            <div className="mb-4">
              <h4 className="font-medium text-gray-900 mb-2">
                Активы ({handover.assets.length})
              </h4>
              <div className="grid gap-3">
                {groupAssets(handover.assets).map(group => (
                  <div key={group.key}>
                    <div className="text-sm font-semibold text-gray-700 mb-2">{group.label}</div>
                    {group.items.map(asset => (
                      <div
                        key={asset.id}
                        onClick={() => openAssetDetail(asset)}
                        className={`flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors ring-2 ${group.ring}`}
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-gray-900 break-words">{asset.title}</span>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getAssetStatusColor(asset.status)} ${group.badge}`}>
                              {getAssetStatusLabel(asset.status)}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 break-words whitespace-pre-wrap">
                            {asset.description.length > 100
                              ? `${asset.description.substring(0, 100)}...`
                              : asset.description}
                          </p>
                          <span className="text-xs text-gray-500">
                            {getAssetTypeDisplay(asset.asset_type)}
                          </span>
                        </div>
                        <button
                          className="ml-3 text-red-600 hover:text-red-800 text-xs font-semibold flex items-center gap-1"
                          onClick={(event) => handleDeleteAsset(asset.id, event)}
                        >
                          <Trash2 size={14} />
                          Удалить
                        </button>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            {/* Created Date */}
            <div className="text-xs text-gray-500">
              Создано: {formatMoscow(handover.created_at)}
            </div>
          </div>
        ))}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 modal-overlay">
          <div className="bg-white rounded-lg p-6 w-full max-w-none overflow-auto resizable-modal modal-panel modal-wide">
            <h2 className="text-xl font-bold mb-4">
              {editingHandover ? 'Редактировать передачу смены' : 'Записать смену'}
            </h2>
            <form onSubmit={handleSubmit(handleCreateHandover)}>
              {/* Shift Selection */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Передающая смена
                    {selectedActiveShift && (
                      <span className="text-blue-600 text-xs ml-2">
                        (выбрана активная: {selectedActiveShift.user_name})
                      </span>
                    )}
                  </label>
                  <select
                    {...register('from_shift_id')}
                    className="w-full border rounded-lg px-3 py-2"
                  >
                    <option value="">Выберите смену</option>
                    {shifts.map((shift) => (
                      <option 
                        key={shift.id} 
                        value={shift.id}
                        className={selectedActiveShift?.id === shift.id ? 'bg-blue-50' : ''}
                      >
                        {shift.user_name} - {shift.date} ({shift.start_time}-{shift.end_time})
                        {selectedActiveShift?.id === shift.id ? ' ⭐ Активная' : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Принимающая смена
                    {suggestedToShift && (
                      <span className="text-green-600 text-xs ml-2">
                        (автопредложение: {suggestedToShift.user_name})
                      </span>
                    )}
                  </label>
                  <select
                    {...register('to_shift_id')}
                    className="w-full border rounded-lg px-3 py-2"
                  >
                    <option value="">Выберите смену</option>
                    {shifts.map((shift) => (
                      <option 
                        key={shift.id} 
                        value={shift.id}
                        className={suggestedToShift?.id === shift.id ? 'bg-green-50' : ''}
                      >
                        {shift.user_name} - {shift.date} ({shift.start_time}-{shift.end_time})
                        {suggestedToShift?.id === shift.id ? ' ⭐ Рекомендуется' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Notes */}
              <div className="mb-6">
                <label className="block text-sm font-medium mb-2">Наблюдения *</label>
                <textarea
                  {...register('handover_notes', { required: 'Заметки обязательны' })}
                  rows={10}
                  className="w-full border rounded-lg px-3 py-3 textarea-wrap resize-vertical min-h-[280px] bg-white/80 focus:ring-2 focus:ring-primary-400"
                  style={{
                    wordWrap: 'break-word',
                    overflowWrap: 'break-word',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    overflowX: 'hidden'
                  }}
                  placeholder="Наблюдения"
                />
                {errors.handover_notes && (
                  <p className="text-red-500 text-sm mt-1">{errors.handover_notes.message}</p>
                )}
              </div>

              {/* Asset Selection */}
              <div className="mb-6">
                <label className="block text-sm font-medium mb-2">Выберите активы</label>
                <div className="max-h-64 overflow-y-auto border rounded-lg p-3 space-y-4 bg-white/70">
                  {groupedSelectableAssets.map(group => (
                    <div key={group.key}>
                      <div className="text-sm font-semibold text-gray-700 mb-2">{group.label}</div>
                      {group.items.map(asset => (
                        <div
                          key={asset.id}
                          className={`flex items-center p-2 rounded-lg mb-2 cursor-pointer transition-colors border ${
                            selectedAssets.includes(asset.id) ? `${group.selection} bg-white` : 'bg-gray-50 hover:bg-gray-100'
                          }`}
                          onClick={() => toggleAssetSelection(asset.id)}
                        >
                          <input
                            type="checkbox"
                            checked={selectedAssets.includes(asset.id)}
                            onChange={() => toggleAssetSelection(asset.id)}
                            className="mr-3"
                          />
                          <div className="flex-1">
                            <div className="font-medium text-sm break-words">{asset.title}</div>
                            <div className="text-xs text-gray-600 break-words">{getAssetTypeDisplay(asset.asset_type)}</div>
                          </div>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getAssetStatusColor(asset.status)} ${group.badge}`}>
                            {getAssetStatusLabel(asset.status)}
                          </span>
                        </div>
                      ))}
                    </div>
                    ))}
                </div>
              </div>

              {selectedAssets.length > 0 && (
                <div className="mb-6 border border-blue-100 rounded-xl bg-white/80 shadow-sm p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-800">Быстрое обновление по кейсам</p>
                      <p className="text-xs text-gray-500">Изменения сохранятся в активах до отправки передачи.</p>
                    </div>
                    <span className="text-xs px-3 py-1 rounded-full bg-primary-100 text-primary-700">
                      {selectedAssets.length} в работе
                    </span>
                  </div>
                  <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                    {selectedAssets.map((assetId) => {
                      const asset = assets.find(a => a.id === assetId);
                      if (!asset) return null;

                      const draft = assetDrafts[assetId] || { status: asset.status, description: asset.description };

                      return (
                        <div key={assetId} className="border border-gray-100 rounded-lg p-3 bg-white/70 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <p className="text-sm font-semibold text-gray-800 break-words">{asset.title}</p>
                              <p className="text-xs text-gray-500">{getAssetTypeDisplay(asset.asset_type)}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`px-2 py-1 rounded-full text-[11px] font-medium ${getAssetStatusColor(draft.status)}`}>
                                {getAssetStatusLabel(draft.status)}
                              </span>
                              <select
                                value={draft.status}
                                onChange={(e) => setAssetDrafts(prev => ({
                                  ...prev,
                                  [assetId]: {
                                    ...draft,
                                    status: e.target.value as Asset['status']
                                  }
                                }))}
                                className="border rounded-lg px-2 py-1 text-xs"
                              >
                                <option value="Active">Активен</option>
                                <option value="On Hold">На удержании</option>
                                <option value="Completed">Завершён</option>
                                <option value="Closed">Закрыт</option>
                              </select>
                            </div>
                          </div>
                          <div>
                            <label className="text-xs text-gray-600">Что изменилось</label>
                            <textarea
                              value={draft.description}
                              onChange={(e) => setAssetDrafts(prev => ({
                                ...prev,
                                [assetId]: {
                                  ...draft,
                                  description: e.target.value
                                }
                              }))}
                              rows={3}
                              className="w-full border rounded-lg px-3 py-2 text-sm resize-vertical focus:ring-2 focus:ring-primary-300"
                              placeholder="Кратко опишите изменения и статус по кейсу"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 rounded-xl text-white bg-gradient-to-r from-primary-500 to-sky-500 hover:from-primary-600 hover:to-sky-600 shadow-md"
                >
                  {editingHandover ? 'Сохранить изменения' : 'Записать смену'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setSelectedActiveShift(null);
                    setSuggestedToShift(null);
                  }}
                  className="flex-1 border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-50"
                >
                  Отмена
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Asset Detail Modal */}
      {showAssetDetail && selectedAssetDetail && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 modal-overlay">
          <div className="bg-white rounded-lg p-6 w-full max-w-none resizable-modal modal-panel">
            <h2 className="text-xl font-bold mb-4">Детали актива</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Название</label>
                <p className="text-gray-900">{selectedAssetDetail.title}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Описание</label>
                <p className="text-gray-900 whitespace-pre-wrap break-words text-wrap-force">
                  {selectedAssetDetail.description}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Тип</label>
                <p className="text-gray-900">{getAssetTypeDisplay(selectedAssetDetail.asset_type)}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Статус</label>
                <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${getAssetStatusColor(selectedAssetDetail.status)}`}>
                  {getAssetStatusLabel(selectedAssetDetail.status)}
                </span>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Создан</label>
                <p className="text-gray-600 text-sm">
                  {formatMoscow(selectedAssetDetail.created_at)}
                </p>
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <button
                onClick={(event) => handleDeleteAsset(selectedAssetDetail.id, event)}
                className="w-full bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700"
              >
                Удалить актив
              </button>
              <button
                onClick={() => setShowAssetDetail(false)}
                className="w-full bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Полноэкранный просмотр заметок */}
      {fullscreenNotes && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 modal-overlay">
          <div className="bg-white rounded-lg p-6 w-full max-w-none max-h-[85vh] overflow-y-auto resizable-modal modal-panel">
            <div className="flex items-start justify-between mb-4">
              <h2 className="text-xl font-bold">Заметки по передаче</h2>
              <button className="text-gray-600 hover:text-gray-800" onClick={() => setFullscreenNotes(null)}>
                <X size={20} />
              </button>
            </div>
            <p className="text-gray-700 whitespace-pre-wrap break-words text-wrap-force">{fullscreenNotes}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default HandoversPage;