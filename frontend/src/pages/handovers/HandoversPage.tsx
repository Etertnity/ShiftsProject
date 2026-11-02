import React, { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { AnimatePresence } from 'motion/react';
import { ArrowRightLeft, FileDown, FileUp, Plus, Trash2 } from 'lucide-react';
import { assetsApi, handoversApi, shiftsApi, usersApi } from '../../api';
import AssetDetailModal from '../../components/assets/AssetDetailModal';
import ClearDataModal from '../../components/exchange/ClearDataModal';
import ExportExcelModal from '../../components/exchange/ExportExcelModal';
import ImportExcelModal from '../../components/exchange/ImportExcelModal';
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
import { Asset, Handover, Wave, WAVE_LABELS } from '../../types';
import { formatDateTime } from '../../utils/datetime';
import { getErrorMessage } from '../../utils/errors';
import HandoverCard from './components/HandoverCard';
import HandoverChecklist from './components/HandoverChecklist';
import HandoverFormModal from './components/HandoverFormModal';

const PAGE_SIZE = 10;

const HandoversPage: React.FC = () => {
  // Передача — журнал работы смены; удалять её может только администратор
  const isAdmin = useCurrentUser().is_admin;
  const canDelete = isAdmin;
  const confirm = useConfirm();
  const { activeCategories, isOpenStatus } = useCatalog();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Handover | null>(null);
  const [viewAsset, setViewAsset] = useState<Asset | null>(null);
  // Передачи, догруженные кнопкой «Показать ещё» (первая страница — в data)
  const [more, setMore] = useState<Handover[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  // Фильтр журнала по волне; 0 — все передачи (обе волны видят друг друга)
  const [waveFilter, setWaveFilter] = useState<0 | Wave>(0);

  const { data, loading, refreshing, reload } = useAsyncData(
    async () => {
      const [page, shifts, assets, users, lastFirst, lastSecond] = await Promise.all([
        handoversApi.list(PAGE_SIZE, 0, waveFilter || undefined),
        shiftsApi.getAll(),
        assetsApi.getAll(),
        usersApi.getAllPublic(),
        // Последняя передача каждой волны — для формы новой передачи
        handoversApi.list(1, 0, 1),
        handoversApi.list(1, 0, 2),
      ]);
      setMore([]);
      return {
        handovers: page.items,
        total: page.total,
        shifts,
        assets,
        users,
        lastByWave: { 1: lastFirst.items[0] ?? null, 2: lastSecond.items[0] ?? null },
      };
    },
    [waveFilter],
    'Не удалось загрузить передачи смен',
  );

  const shiftsById = useMemo(() => new Map((data?.shifts ?? []).map((s) => [s.id, s])), [data]);

  const openCounts = useMemo(
    () =>
      activeCategories.map((category) => ({
        ...category,
        count: (data?.assets ?? []).filter((a) => a.asset_type === category.key && isOpenStatus(a.status)).length,
      })),
    [data, activeCategories, isOpenStatus],
  );

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (handover: Handover) => {
    setEditing(handover);
    setFormOpen(true);
  };

  const handleDelete = async (handover: Handover) => {
    const ok = await confirm({
      title: `Удалить передачу #${handover.id}?`,
      message: `Запись от ${formatDateTime(handover.created_at)} будет удалена. Сами активы останутся.`,
    });
    if (!ok) return;
    try {
      await handoversApi.delete(handover.id);
      toast.success('Передача удалена');
      reload();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Не удалось удалить передачу'));
    }
  };

  const showMore = async (loaded: number) => {
    setLoadingMore(true);
    try {
      const page = await handoversApi.list(PAGE_SIZE, loaded, waveFilter || undefined);
      setMore((prev) => [...prev, ...page.items]);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Не удалось загрузить передачи'));
    } finally {
      setLoadingMore(false);
    }
  };

  if (loading || !data) return <PageLoader />;

  const visible = [...data.handovers, ...more];

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        title="Передачи смен"
        description="Что передавала каждая смена"
        actions={
          <>
            <Button variant="secondary" icon={FileDown} onClick={() => setExportOpen(true)}>Excel</Button>
            {/* Загрузка журнала создаёт передачи и кейсы пачкой — только администратор */}
            {isAdmin && <Button variant="secondary" icon={FileUp} onClick={() => setImportOpen(true)}>Загрузить</Button>}
            {isAdmin && <Button variant="secondary" icon={Trash2} onClick={() => setClearOpen(true)}>Очистить</Button>}
            <Button icon={Plus} onClick={openCreate}>Передать смену</Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {openCounts.map((category) => (
          <Link key={category.key} to="/assets" className="card flex min-w-0 items-center gap-3 p-3 transition-shadow hover:shadow-pop">
            <span className={`h-9 w-1.5 shrink-0 rounded-full ${colorClasses(category.color).dot}`} aria-hidden />
            <div className="min-w-0">
              <p className="text-xl font-bold leading-none text-gray-900">{category.count}</p>
              <p className="mt-1 truncate text-xs text-gray-500" title={category.description ?? undefined}>{category.name}</p>
            </div>
          </Link>
        ))}
      </div>

      <HandoverChecklist />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-gray-100 p-1" role="radiogroup" aria-label="Волна">
          {([0, 1, 2] as const).map((wave) => (
            <button
              key={wave}
              type="button"
              role="radio"
              aria-checked={waveFilter === wave}
              onClick={() => setWaveFilter(wave)}
              className={clsx(
                'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                waveFilter === wave ? 'bg-surface text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900',
              )}
            >
              {wave ? WAVE_LABELS[wave] : 'Все'}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-500">
          1 волна — сменные день/ночь, 2 волна — дневные «2 через 2». Передачи видят все.
        </p>
      </div>

      {data.handovers.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={ArrowRightLeft}
            title={waveFilter ? `Передач ${WAVE_LABELS[waveFilter].replace('волна', 'волны')} пока нет` : 'Передач пока нет'}
            description="Когда смена закончится, зафиксируйте здесь, что важно знать следующей."
            action={<Button icon={Plus} onClick={openCreate}>Передать смену</Button>}
          />
        </div>
      ) : (
        <div className={clsx('space-y-3 sm:space-y-4', refreshing && 'opacity-60 transition-opacity')}>
          <AnimatePresence mode="popLayout">
            {visible.map((handover, index) => (
              <MotionItem key={handover.id} index={index}>
                <HandoverCard
                  handover={handover}
                  shiftsById={shiftsById}
                  onEdit={openEdit}
                  onDelete={canDelete ? handleDelete : undefined}
                  onOpenAsset={setViewAsset}
                />
              </MotionItem>
            ))}
          </AnimatePresence>
          {visible.length < data.total && (
            <div className="flex justify-center">
              <Button variant="secondary" loading={loadingMore} onClick={() => showMore(visible.length)}>
                Показать ещё ({data.total - visible.length})
              </Button>
            </div>
          )}
        </div>
      )}

      <HandoverFormModal
        open={formOpen}
        handover={editing}
        shifts={data.shifts}
        assets={data.assets}
        users={data.users}
        lastByWave={data.lastByWave}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          reload();
        }}
      />

      <ExportExcelModal open={exportOpen} onClose={() => setExportOpen(false)} />
      <ImportExcelModal open={importOpen} onClose={() => setImportOpen(false)} onImported={reload} />
      <ClearDataModal open={clearOpen} initial="handovers" onClose={() => setClearOpen(false)} onCleared={reload} />
      <AssetDetailModal asset={viewAsset} onClose={() => setViewAsset(null)} onChanged={reload} />
    </div>
  );
};

export default HandoversPage;
