import React from 'react';
import clsx from 'clsx';
import { colorClasses, iconFor } from '../../constants/palette';
import { useCatalog } from '../../context/CatalogContext';
import Badge from '../ui/Badge';

export const AssetTypeBadge: React.FC<{ type: string }> = ({ type }) => {
  const category = useCatalog().getCategory(type);
  const colors = colorClasses(category.color);
  return <Badge className={colors.badge} dot={colors.dot}>{category.name}</Badge>;
};

export const AssetStatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const option = useCatalog().getStatus(status);
  return <Badge className={colorClasses(option.color).badge}>{option.name}</Badge>;
};

/** Иконка категории в цветной плашке. */
export const CategoryIcon: React.FC<{ type: string; size?: 'sm' | 'md' }> = ({ type, size = 'md' }) => {
  const category = useCatalog().getCategory(type);
  const Icon = iconFor(category.icon);
  return (
    <span
      title={category.name}
      className={clsx(
        'flex shrink-0 items-center justify-center rounded-lg',
        colorClasses(category.color).soft,
        size === 'sm' ? 'h-7 w-7' : 'h-9 w-9',
      )}
    >
      <Icon className="h-4 w-4" aria-hidden />
    </span>
  );
};
