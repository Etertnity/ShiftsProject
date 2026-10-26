import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { settingsApi } from '../../../api';
import Badge from '../../../components/ui/Badge';
import Button from '../../../components/ui/Button';
import IconButton from '../../../components/ui/IconButton';
import { colorClasses, iconFor } from '../../../constants/palette';
import { useCatalog } from '../../../context/CatalogContext';
import { useConfirm } from '../../../context/ConfirmContext';
import { Category } from '../../../types';
import { getErrorMessage } from '../../../utils/errors';
import { pluralize } from '../../../utils/strings';
import CategoryEditorModal from './CategoryEditorModal';

const CategoriesSettings: React.FC = () => {
  const { categories, reload } = useCatalog();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<Category | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const openEditor = (category: Category | null) => {
    setEditing(category);
    setEditorOpen(true);
  };

  const move = async (index: number, delta: number) => {
    const ids = categories.map((c) => c.id);
    const [id] = ids.splice(index, 1);
    ids.splice(index + delta, 0, id);
    setBusy(true);
    try {
      await settingsApi.reorderCategories(ids);
      await reload();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Не удалось изменить порядок'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (category: Category) => {
    const ok = await confirm({ title: `Удалить категорию «${category.name}»?`, message: 'Категория пустая, данные не пострадают.' });
    if (!ok) return;
    try {
      await settingsApi.deleteCategory(category.id);
      toast.success('Категория удалена');
      reload();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Не удалось удалить категорию'));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-500">Категории определяют, какие активы ведёт смена и какие поля у них заполняются.</p>
        <Button icon={Plus} onClick={() => openEditor(null)} className="sm:shrink-0">Новая категория</Button>
      </div>

      <ul className="space-y-2">
        {categories.map((category, index) => {
          const Icon = iconFor(category.icon);
          return (
            <li key={category.id} className={`card flex items-center gap-3 p-3 ${category.is_active ? '' : 'opacity-60'}`}>
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${colorClasses(category.color).soft}`}>
                <Icon className="h-5 w-5" />
              </span>
              <button type="button" onClick={() => openEditor(category)} className="min-w-0 flex-1 text-left">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="line-clamp-2 font-semibold text-gray-900 [overflow-wrap:anywhere]">{category.name}</span>
                  {!category.is_active && <Badge>Отключена</Badge>}
                </span>
                <span className="block truncate text-xs text-gray-500">
                  {category.asset_count} {pluralize(category.asset_count, ['актив', 'актива', 'активов'])} ·{' '}
                  {category.fields.length} {pluralize(category.fields.length, ['поле', 'поля', 'полей'])}
                </span>
              </button>
              <div className="flex shrink-0 items-center">
                <span className="flex">
                  <IconButton icon={ArrowUp} label="Выше" size="sm" disabled={busy || index === 0} onClick={() => move(index, -1)} className="disabled:opacity-30" />
                  <IconButton icon={ArrowDown} label="Ниже" size="sm" disabled={busy || index === categories.length - 1} onClick={() => move(index, 1)} className="disabled:opacity-30" />
                </span>
                <IconButton icon={Pencil} label="Редактировать" tone="primary" size="sm" onClick={() => openEditor(category)} />
                {category.asset_count === 0 && (
                  <IconButton icon={Trash2} label="Удалить" tone="danger" size="sm" onClick={() => remove(category)} />
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <CategoryEditorModal
        open={editorOpen}
        category={editing}
        onClose={() => setEditorOpen(false)}
        onSaved={() => {
          setEditorOpen(false);
          reload();
        }}
      />
    </div>
  );
};

export default CategoriesSettings;
