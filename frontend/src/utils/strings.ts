/** Инициалы для аватара: "Мария Петрова" → "МП". */
export const getInitials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || '?';

/** Короткая форма для тесных мест: "Алексей Сидоров" → "Алексей С.". */
export const shortName = (name: string): string => {
  const [first, second] = name.split(/\s+/).filter(Boolean);
  return second ? `${first} ${second[0].toUpperCase()}.` : first ?? name;
};

export const pluralize = (count: number, forms: [string, string, string]): string => {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
};
