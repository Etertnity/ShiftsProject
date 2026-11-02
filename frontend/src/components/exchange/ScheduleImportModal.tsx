import React, { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { AlertTriangle, FileSpreadsheet, RotateCcw, Upload } from 'lucide-react';
import { exchangeApi } from '../../api';
import { ScheduleImportPreview } from '../../types';
import { getErrorMessage } from '../../utils/errors';
import { pluralize } from '../../utils/strings';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import Spinner from '../ui/Spinner';

const MAX_SIZE = 5 * 1024 * 1024;
const SHIFT_FORMS: [string, string, string] = ['смену', 'смены', 'смен'];

interface ScheduleImportModalProps {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

/** Загрузка графика из файла «График сменных»: файл → какие месяцы и что изменится → загрузка. Только для администратора. */
const ScheduleImportModal: React.FC<ScheduleImportModalProps> = ({ open, onClose, onImported }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ScheduleImportPreview | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<'update' | 'fill'>('update');
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    if (!open) {
      setFile(null);
      setPreview(null);
      setSelected(new Set());
      setMode('update');
    }
  }, [open]);

  useEffect(() => {
    if (!file) return undefined;
    let cancelled = false;
    setLoading(true);
    exchangeApi
      .schedulePreview(file)
      .then((result) => {
        if (cancelled) return;
        setPreview(result);
        // По умолчанию отмечены месяцы, где есть что загрузить
        setSelected(new Set(result.months.filter((m) => m.new + m.changed > 0).map((m) => m.month)));
      })
      .catch((error) => {
        if (cancelled) return;
        toast.error(getErrorMessage(error, 'Не удалось прочитать файл'));
        setFile(null);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [file]);

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
    setFile(picked);
  };

  const toggle = (month: string) => {
    const next = new Set(selected);
    if (next.has(month)) next.delete(month);
    else next.add(month);
    setSelected(next);
  };

  const months = preview?.months ?? [];
  const chosen = months.filter((m) => selected.has(m.month));
  const total = chosen.reduce((sum, m) => sum + m.new + (mode === 'update' ? m.changed : 0), 0);
  const allSelected = months.length > 0 && chosen.length === months.length;

  const runImport = async () => {
    if (!file) return;
    setImporting(true);
    try {
      const result = await exchangeApi.scheduleImport(file, chosen.map((m) => m.month), mode);
      const parts = [`добавлено ${result.created}`, `изменено ${result.updated}`];
      if (result.skipped) parts.push(`не тронуто ${result.skipped}`);
      toast.success(`График загружен: ${parts.join(', ')}`, { duration: 6000 });
      onImported();
      onClose();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Не удалось загрузить график'));
    } finally {
      setImporting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title="Загрузка графика"
      description="Файл графика сменных — тот, что ведёте в Excel, или выгрузка с этого сайта"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Отмена</Button>
          <Button icon={Upload} loading={importing} disabled={!preview || loading || total === 0} onClick={runImport}>
            {total ? `Загрузить ${total} ${pluralize(total, SHIFT_FORMS)}` : 'Загрузить'}
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
            Читаем лист «Общее»: блоки месяцев, строки сотрудников, часы в колонках д/н. Берём строку «отработано», а если
            её нет — «станд.график». Файл можно загружать повторно.
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
              {preview.unknown_people.length > 0 && (
                <div className="flex gap-2 rounded-xl border border-amber-300/60 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <p>
                    Не нашли на сайте: {preview.unknown_people.join(', ')}. Их смены не загрузятся — добавьте сотрудников
                    или поправьте имя в файле.
                  </p>
                </div>
              )}

              <section>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-gray-900">Месяцы в файле</h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelected(allSelected ? new Set() : new Set(months.map((m) => m.month)))}
                  >
                    {allSelected ? 'Снять все' : 'Выбрать все'}
                  </Button>
                </div>
                <div className="max-h-72 divide-y divide-gray-100 overflow-auto rounded-xl border border-gray-200">
                  {[...months].reverse().map((month) => (
                    <label key={month.month} className="flex cursor-pointer items-start gap-3 px-3 py-2 hover:bg-gray-50">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 accent-accent-500"
                        checked={selected.has(month.month)}
                        onChange={() => toggle(month.month)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                          <span className="font-medium text-gray-900">{month.label}</span>
                          <span className="text-xs text-gray-500">
                            {[
                              month.new && `новых ${month.new}`,
                              month.changed && `изменится ${month.changed}`,
                              month.same && `без изменений ${month.same}`,
                            ].filter(Boolean).join(' · ') || 'смен нет'}
                          </span>
                        </span>
                        <span className="block truncate text-xs text-gray-500" title={month.people.join(', ')}>
                          {month.people.join(', ')}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </section>

              <fieldset className="grid gap-2 sm:grid-cols-2">
                <legend className="sr-only">Режим загрузки</legend>
                {([
                  ['update', 'Как в файле', 'Новые смены добавятся, отличающиеся — поменяются под файл'],
                  ['fill', 'Только новые', 'Смены, которые уже есть на сайте, не трогаем'],
                ] as const).map(([value, title, hint]) => (
                  <label
                    key={value}
                    className={clsx(
                      'flex cursor-pointer gap-2.5 rounded-xl border px-3 py-2.5',
                      mode === value ? 'border-accent-400 bg-accent-400/10' : 'border-gray-200 hover:bg-gray-50',
                    )}
                  >
                    <input type="radio" name="schedule-mode" className="mt-1 accent-accent-500" checked={mode === value} onChange={() => setMode(value)} />
                    <span>
                      <span className="block text-sm font-medium text-gray-900">{title}</span>
                      <span className="block text-xs text-gray-500">{hint}</span>
                    </span>
                  </label>
                ))}
              </fieldset>

              <p className="text-xs text-gray-500">
                Смены, которых нет в файле, остаются на месте. Если у двоих стоит по 12 часов в одну смену — это два
                человека на смене одновременно; 4 + 4 + 4 — одна смена по очереди.
              </p>
              {preview.warnings.map((warning) => (
                <p key={warning} className="flex items-center gap-1.5 text-xs text-amber-700">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden /> {warning}
                </p>
              ))}
            </>
          )}
        </div>
      )}
    </Modal>
  );
};

export default ScheduleImportModal;
