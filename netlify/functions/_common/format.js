export const formatDateParts = (iso) => {
  if (!iso) return { date: 'sin fecha', time: '' };
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
    time: d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  };
};

export const formatHumanList = (items = []) => {
  const filtered = items.filter(Boolean);
  if (filtered.length <= 1) return filtered.join('');
  if (filtered.length === 2) return `${filtered[0]} y ${filtered[1]}`;
  return `${filtered.slice(0, -1).join(', ')} y ${filtered[filtered.length - 1]}`;
};
