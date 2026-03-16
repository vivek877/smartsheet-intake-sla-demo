/**
 * Project Utility Helpers
 * 
 * Contains deterministic business logic for UI rendering and calculations.
 */

/**
 * Maps task status to specific CSS classes.
 */
export const getStatusClass = (status) => {
  const v = (String(status || '').toLowerCase());
  if (v.includes('progress')) return 'status-progress';
  if (v.includes('complete')) return 'status-complete';
  if (v.includes('hold')) return 'status-hold';
  return 'status-queue';
};

/**
 * Maps health indicators to specific CSS classes.
 */
export const getHealthClass = (health) => {
  const v = (String(health || '').toLowerCase());
  if (v.includes('green')) return 'health-green';
  if (v.includes('yellow')) return 'health-yellow';
  if (v.includes('red')) return 'health-red';
  return 'health-blue';
};

/**
 * Business Day Calculator
 * Calculates Mon-Fri delta between current time and target end date.
 */
export function calculateBusinessDays(endValue) {
  if (!endValue) return '';
  const d = new Date(endValue);
  if (isNaN(d.getTime())) return '';
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  
  const direction = d >= today ? 1 : -1;
  let count = 0;
  let current = new Date(today);
  
  while ((direction > 0 && current <= d) || (direction < 0 && current >= d)) {
    const day = current.getDay();
    if (day !== 0 && day !== 6) count += direction;
    current.setDate(current.getDate() + direction);
  }
  return direction > 0 ? count : -count;
}

/**
 * Specialized cell value accessor.
 */
export const getCellValue = (row, title) => (row?.cells?.[title]?.value ?? '');
