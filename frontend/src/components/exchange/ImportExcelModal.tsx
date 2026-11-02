import React, { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, RotateCcw, Upload } from 'lucide-react';
import { exchangeApi } from '../../api';
import { useCatalog } from '../../context/CatalogContext';
import { ImportPreview, ImportRow } from '../../types';
import { getErrorMessage } from '../../utils/errors';
import { pluralize } from '../../utils/strings';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import Spinner from '../ui/Spinner';

const BASE_TARGETS = [
  { value: 'date', label: 'Дата смены' },
  { value: 'person', label: 'Сотрудник' },
  { value: 'notes', label: 'Разное (заметки)' },
  { value: 'id', label: '№ на сайте' },
  { value: 'skip', label: 'Не загружать' },
];

const MAX_SIZE = 5 * 1024 * 1024;

const formatPeriod = (row: ImportRow) => {
  if (!row.start) return '—';
  const fmt = (iso: string) => {
    const [date, time] = iso.split('T');
    const [, month, day] = date.split('-');
    return { day: `${day}.${month}`, time };
  };
  const start = fmt(row.start);
  const end = row.end ? fmt(row.end) : null;
  return end ? `${start.day} ${start.time}–${end.day !== start.day ? `${end.day} ` : ''}${end.time}` : `${start.day} ${start.time}`;
};

const itemsTotal = (row: ImportRow) => Object.values(row.items).reduce((sum, n) => sum + n, 0);

interface ImportExcelModalProps {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

/** Загрузка журнала передач из Excel: файл → проверка колонок и строк → загрузка. Только для администратора. */
const ImportExcelModal: React.FC<ImportExcelModalProps> = ({ open, onClose, onImported }) => {
  const { categories } = useCatalog();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mapping, setMapping] = useState<Record<number, string> | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    if (!open) {
      setFile(null);
      setPreview(null);
      setMapping(undefined);
    }
  }, [open]);

  // Предпросмотр при выборе файла и при каждой смене сопоставления колонок
  useEffect(() => {
    if (!file) return undefined;
    let cancelled = false;
    setLoading(true);
    exchangeApi
      .preview(file, mapping)
      .then((result) => !cancelled && setPreview(result))
      .catch((error) => {
        if (cancelled) return;
        toast.error(getErrorMessage(error, 'Не удалось прочитать файл'));
        if (!mapping) setFile(null);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [file, mapping]);

  const pickFile = (picked: File | undefined) => {
    if (!picked) return;
    if (!picked.name.toLowerCase().endsWith('.xlsx')) {
      toast.error('Нужен файл Excel в формате .xlsx');
      return;
    }
    if (picked.size > MAX_SIZE) {
      toast.error('Файл больше 5 МБ');
      return;
    }
    setPreview(null);
    setMapping(undefined);
    setFile(picked);
  };

  const changeTarget = (index: number, target: string) => {
    const current = Object.fromEntries((preview?.columns ?? []).map((c) => [c.index, c.target]));
    setMapping({ ...current, [index]: target });
  };

  const rows = preview?.rows ?? [];
  const fresh = rows.filter((r) => !r.duplicate && !r.error);
  const duplicates = rows.filter((r) => r.duplicate).length;
  const errors = rows.filter((r) => r.error).length;
  const canImport = !!file && !!preview && !preview.mapping_error && fresh.length > 0 && !loading;

  const runImport = async () => {
    if (!file || !preview) return;
    setImporting(true);
    try {
      const current = Object.fromEntries(preview.columns.map((c) => [c.index, c.target]));
      const result = await exchangeApi.import(file, current);
      toast.success(
        `Загружено ${result.handovers} ${pluralize(result.handovers, ['передача', 'передачи', 'передач'])}: ` +
          `новых кейсов ${result.assets_created}, обновлено ${result.assets_updated}`,
        { duration: 6000 },
      );
      if (result.last_handover && (result.assets_closed || result.assets_reopened)) {
        toast.success(
          `По последней передаче (${result.last_handover}): закрыто ${result.assets_closed}, снова открыто ${result.assets_reopened}`,
          { duration: 6000 },
        );
      }
      if (result.errors.length) toast.error(`Пропущено строк с ошибками: ${result.errors.length}`);
      onImported();
      onClose();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Не удалось загрузить файл'));
    } finally {
      setImporting(false);
    }
  };

  const targets = [...BASE_TARGETS, ...categories.map((c) => ({ value: `category:${c.key}`, label: `Категория: ${c.name}` }))];

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title="Загрузка из Excel"
      description="Журнал передач: строка — смена, колонки — дата, сотрудник, категории кейсов и «Разное»"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Отмена</Button>
          <Button icon={Upload} loading={importing} disabled={!canImport} onClick={runImport}>
            {fresh.length ? `Загрузить ${fresh.length} ${pluralize(fresh.length, ['передачу', 'передачи', 'передач'])}` : 'Загрузить'}
          </Button>
        </>
      }
    >
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="sr-only"
        onChange={(e) => {
          pickFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      {!file ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            pickFile(e.dataTransfer.files?.[0]);
          }}
          className={clsx(
            'flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-4 py-10 text-center transition-colors',
            dragOver ? 'border-primary-400 bg-primary-50' : 'border-gray-300 hover:border-primary-300 hover:bg-gray-50',
          )}
        >
          <FileSpreadsheet className="h-10 w-10 text-emerald-500" aria-hidden />
          <span className="font-medium text-gray-900">Выберите файл .xlsx или перетащите его сюда</span>
          <span className="max-w-md text-sm text-gray-500">
            Подойдёт журнал, который вели вручную, или выгрузка с этого сайта. Уже загруженные смены пропускаются —
            файл можно загружать повторно.
          </span>
        </button>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-xl border border-gray-200 px-3 py-2">
            <FileSpreadsheet className="h-5 w-5 shrink-0 text-emerald-500" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-gray-900">{file.name}</p>
              <p className="text-xs text-gray-500">{preview ? `Лист «${preview.sheet}»` : 'Читаем файл…'}</p>
            </div>
            {loading && <Spinner size="sm" />}
            <Button variant="ghost" size="sm" icon={RotateCcw} onClick={() => inputRef.current?.click()}>Другой файл</Button>
          </div>

          {preview && (
            <>
              <section>
                <h3 className="mb-2 text-sm font-semibold text-gray-900">Что в какой колонке</h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  {preview.columns.map((column) => (
                    <label key={column.index} className="flex min-w-0 items-center gap-2 rounded-xl border border-gray-200 px-2.5 py-2">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-xs font-semibold text-gray-600">
                        {column.letter}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm text-gray-700" title={column.header}>
                        {column.header.split('\n')[0] || 'Без заголовка'}
                      </span>
                      <select
                        className="form-input !h-9 w-40 shrink-0 !py-0 text-sm sm:w-44"
                        value={column.target}
                        aria-label={`Колонка ${column.letter}`}
                        onChange={(e) => changeTarget(column.index, e.target.value)}
                      >
                        {targets.map((t) => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
                {preview.mapping_error && (
                  <p className="mt-2 flex items-center gap-1.5 text-sm text-red-600">
                    <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden /> {preview.mapping_error}
                  </p>
                )}
              </section>

              <div className="flex flex-wrap gap-2 text-sm">
                <span className="rounded-lg bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">Новых смен: {fresh.length}</span>
                {duplicates > 0 && <span className="rounded-lg bg-gray-100 px-2.5 py-1 text-gray-600">Уже на сайте: {duplicates}</span>}
                {errors > 0 && <span className="rounded-lg bg-red-50 px-2.5 py-1 text-red-700">С ошибками: {errors}</span>}
              </div>

              {rows.length > 0 && (
                <div className="max-h-72 overflow-auto rounded-xl border border-gray-200">
                  <table className="w-full min-w-[34rem] text-sm">
                    <thead className="sticky top-0 bg-gray-50 text-xs text-gray-500">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Стр.</th>
                        <th className="px-3 py-2 text-left font-medium">Смена</th>
                        <th className="px-3 py-2 text-left font-medium">Сотрудник</th>
                        <th className="px-3 py-2 text-left font-medium">Кейсов</th>
                        <th className="px-3 py-2 text-left font-medium">Статус</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {rows.map((row) => (
                        <tr key={row.row} className={clsx(row.duplicate && 'text-gray-400')} title={row.sample || undefined}>
                          <td className="px-3 py-1.5 tabular-nums text-gray-400">{row.row}</td>
                          <td className="whitespace-nowrap px-3 py-1.5 tabular-nums">{formatPeriod(row)}</td>
                          <td className="max-w-[10rem] truncate px-3 py-1.5">{row.person || '—'}</td>
                          <td className="px-3 py-1.5 tabular-nums">{itemsTotal(row)}</td>
                          <td className="px-3 py-1.5">
                            {row.error ? (
                              <span className="inline-flex items-center gap-1 text-red-600"><AlertTriangle className="h-3.5 w-3.5" />{row.error}</span>
                            ) : row.duplicate ? (
                              'уже загружена'
                            ) : (
                              <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />новая</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-xs text-gray-500">
                Кейсы находятся по номеру CASE# внутри категории; новые создаются. Continue — запись в историю, если
                текст изменился. Открытыми остаются только кейсы из последней передачи в файле без пометки Close —
                остальные кейсы из файла закрываются.
              </p>
            </>
          )}
        </div>
      )}
    </Modal>
  );
};

export default ImportExcelModal;
