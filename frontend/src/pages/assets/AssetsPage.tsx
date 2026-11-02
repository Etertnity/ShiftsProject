import React, { useMemo, useState } from 'react';
import clsx from 'clsx';
import { AnimatePresence } from 'motion/react';
import toast from 'react-hot-toast';
import { ArrowDown01, ArrowDown10, FileDown, Hash, Package, Plus, Search, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { assetsApi, usersApi } from '../../api';
import AssetDetailModal from '../../components/assets/AssetDetailModal';
import ClearDataModal from '../../components/exchange/ClearDataModal';
import ExportExcelModal from '../../components/exchange/ExportExcelModal';
import MotionItem from '../../components/motion/MotionItem';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import PageHeader from '../../components/ui/PageHeader';
import { PageLoader } from '../../components/ui/Spinner';
import { colorClasses } from '../../constants/palette';
import { useCurrentUser } from '../../context/AuthContext';
import { useCatalog } from '../../context/CatalogContext';
import { useConfirm } from '../../context/ConfirmContext';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { Asset } from '../../types';
import { getErrorMessage } from '../../utils/errors';
import AssetCard from './components/AssetCard';
import AssetExtraFilters, { activeExtraCount, DEFAULT_EXTRA, ExtraFilters, periodRange } from './components/AssetExtraFilters';
import AssetFormModal from './components/AssetFormModal';

// Особое значение фильтра: все незакрытые статусы. По умолчанию показываем именно их —
// закрытые кейсы не мешают работе, но доступны в один клик
const OPEN = '__open';

const AssetsPage: React.FC = () => {
  // Удалять кейсы может только администратор (сервер проверяет то же самое)
  const currentUser = useCurrentUser();
  const canDelete = currentUser.is_admin;
  const confirm = useConfirm();
  const { categories, statuses, isOpenStatus } = useCatalog();
  const [search, setSearch] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [type, setType] = useState('');
  const [status, setStatus] = useState(OPEN);
  const [extra, setExtra] = useState<ExtraFilters>(DEFAULT_EXTRA);
  const [extraOpen, setExtraOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Asset | null>(null);
  const [viewing, setViewing] = useState<Asset | null>(null);

  const debouncedSearch = useDebouncedValue(search.trim());

  const range = periodRange(extra);
  const { data, loading, refreshing, reload } = useAsyncData(
    () =>
      assetsApi.getAll({
        asset_type: type,
        status: status === OPEN ? '' : status,
        search: debouncedSearch,
        ...range,
        author_id: extra.author ? Number(extra.author) : undefined,
        sort: extra.sort,
      }),
    [type, status, debouncedSearch, range.updated_from, range.updated_to, extra.author, extra.sort],
    'Не удалось загрузить активы',
  );
  // Список коллег для фильтра «Кто работал» — загружаем, только когда фильтры открыты
  const { data: users } = useAsyncData(() => (extraOpen ? usersApi.getAllPublic() : Promise.resolve(null)), [extraOpen], 'Не удалось загрузить сотрудников');
  const extraCount = activeExtraCount(extra);
  const numberSort = extra.sort === 'number_desc' || extra.sort === 'number_asc';

  const assets = useMemo(
    () => (status === OPEN ? (data ?? []).filter((a) => isOpenStatus(a.status)) : data ?? []),
    [data, status, isOpenStatus],
  );

  // В фильтре показываем активные категории и отключённые, в которых ещё есть активы
  const filterCategories = categories.filter((c) => c.is_active || c.asset_count > 0);
  const hasFilters = !!(search || type || status !== OPEN || extraCount);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (asset: Asset) => {
    setViewing(null);
    setEditing(asset);
    setFormOpen(true);
  };

  const handleDelete = async (asset: Asset) => {
    const ok = await confirm({
      title: 'Удалить актив?',
      message: `«${asset.title}» будет удалён вместе с историей и из всех передач смен.`,
    });
    if (!ok) return;
    try {
      await assetsApi.delete(asset.id);
      toast.success('Актив удалён');
      setViewing(null);
      reload();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Не удалось удалить актив'));
    }
  };

  const resetFilters = () => {
    setSearch('');
    setType('');
    setStatus(OPEN);
    setExtra(DEFAULT_EXTRA);
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        title="Активы"
        description="Кейсы, change-запросы и обращения клиентов"
        actions={
          <>
            <Button variant="secondary" icon={FileDown} onClick={() => setExportOpen(true)}>Excel</Button>
            {canDelete && <Button variant="secondary" icon={Trash2} onClick={() => setClearOpen(true)}>Очистить</Button>}
            <Button icon={Plus} onClick={openCreate}>Новый актив</Button>
          </>
        }
      />

      <div className="card space-y-3 p-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
            <input
              type="search"
              aria-label="Поиск по активам"
              placeholder="Поиск: название, описание, поля, история"
              className="form-input pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <select aria-label="Статус" className="form-input min-w-0 flex-1 sm:w-52 sm:flex-none" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value={OPEN}>Открытые</option>
              <option value="">Все статусы</option>
              {statuses.map((s) => (
                <option key={s.key} value={s.key}>{s.name}</option>
              ))}
            </select>
            {/* Быстрая сортировка по номеру кейса: от большего → от меньшего → как было */}
            <Button
              variant={numberSort ? 'primary' : 'secondary'}
              icon={extra.sort === 'number_desc' ? ArrowDown10 : extra.sort === 'number_asc' ? ArrowDown01 : Hash}
              aria-label="Сортировка по номеру кейса"
              title={
                extra.sort === 'number_desc'
                  ? 'Номер кейса: от большего к меньшему'
                  : extra.sort === 'number_asc'
                    ? 'Номер кейса: от меньшего к большему'
                    : 'Сортировать по номеру кейса'
              }
              onClick={() =>
                setExtra((prev) => ({
                  ...prev,
                  sort: prev.sort === 'number_desc' ? 'number_asc' : prev.sort === 'number_asc' ? DEFAULT_EXTRA.sort : 'number_desc',
                }))
              }
              className="shrink-0"
            >
              №
            </Button>
            <Button
              variant={extraOpen || extraCount ? 'primary' : 'secondary'}
              icon={SlidersHorizontal}
              aria-expanded={extraOpen}
              onClick={() => setExtraOpen((v) => !v)}
              className="shrink-0"
            >
              Фильтры{extraCount > 0 ? ` · ${extraCount}` : ''}
            </Button>
          </div>
        </div>

        {extraOpen && <AssetExtraFilters value={extra} users={users ?? []} currentUserId={currentUser.id} onChange={setExtra} />}

        {/* Категории — горизонтальная лента, на узких экранах прокручивается пальцем */}
        <div className="-mx-3 flex gap-2 overflow-x-auto px-3 scrollbar-none">
          {[{ key: '', name: 'Все категории', color: 'slate' }, ...filterCategories].map((c) => (
            <button
              key={c.key || 'all'}
              type="button"
              onClick={() => setType(c.key)}
              className={clsx(
                'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                type === c.key ? 'border-primary-600 bg-primary-600 text-white' : 'border-gray-200 bg-surface text-gray-600 hover:bg-gray-50',
              )}
            >
              <span className={clsx('h-1.5 w-1.5 rounded-full', type === c.key ? 'bg-surface' : colorClasses(c.color).dot)} aria-hidden />
              {c.name}
            </button>
          ))}
          {hasFilters && (
            <button type="button" onClick={resetFilters} className="flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-sm text-gray-500 hover:text-gray-900">
              <X className="h-3.5 w-3.5" /> Сбросить
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <PageLoader />
      ) : assets.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Package}
            title={hasFilters ? 'Ничего не найдено' : 'Открытых активов нет'}
            description={hasFilters ? 'Попробуйте изменить запрос или фильтры.' : 'Создайте кейс, чтобы передавать его между сменами.'}
            action={hasFilters ? <Button variant="secondary" onClick={resetFilters}>Сбросить фильтры</Button> : <Button icon={Plus} onClick={openCreate}>Новый актив</Button>}
          />
        </div>
      ) : (
        <div className={clsx('grid gap-3 sm:gap-4 lg:grid-cols-2', refreshing && 'opacity-60 transition-opacity')}>
          <AnimatePresence mode="popLayout">
            {assets.map((asset, index) => (
              <MotionItem key={asset.id} index={index} className="flex min-w-0 flex-col [&>*]:flex-1">
                <AssetCard asset={asset} onOpen={setViewing} onEdit={openEdit} onDelete={canDelete ? handleDelete : undefined} />
              </MotionItem>
            ))}
          </AnimatePresence>
        </div>
      )}

      <AssetFormModal
        open={formOpen}
        asset={editing}
        defaultCategory={type || undefined}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          reload();
        }}
      />
      <ExportExcelModal open={exportOpen} onClose={() => setExportOpen(false)} />
      <ClearDataModal open={clearOpen} initial="assets" onClose={() => setClearOpen(false)} onCleared={reload} />
      <AssetDetailModal asset={viewing} onClose={() => setViewing(null)} onEdit={openEdit} onDelete={canDelete ? handleDelete : undefined} onChanged={reload} />
    </div>
  );
};

export default AssetsPage;
