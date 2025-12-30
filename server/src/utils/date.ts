/**
 * Date utilities for Sisyphus
 *
 * We use Wordle-style local time: client sends their local date string,
 * server just tracks whether they've pushed for that date string.
 */

/**
 * Check if two date strings are consecutive days
 * @param earlier - The earlier date (YYYY-MM-DD)
 * @param later - The later date (YYYY-MM-DD)
 * @returns true if later is exactly one day after earlier
 */
export function isConsecutiveDay(earlier: string, later: string): boolean {
  const d1 = new Date(earlier + 'T00:00:00Z');
  const d2 = new Date(later + 'T00:00:00Z');

  // Add one day to earlier date
  d1.setUTCDate(d1.getUTCDate() + 1);

  return d1.toISOString().split('T')[0] === d2.toISOString().split('T')[0];
}

/**
 * Check if two date strings are the same day
 */
export function isSameDay(date1: string, date2: string): boolean {
  return date1 === date2;
}

/**
 * Validate date string format (YYYY-MM-DD)
 */
export function isValidDateString(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return false;
  }

  const date = new Date(dateStr + 'T00:00:00Z');
  return !isNaN(date.getTime());
}

/**
 * Get the number of days between two dates
 * Returns positive if later > earlier, negative if earlier > later
 */
export function daysBetween(earlier: string, later: string): number {
  const d1 = new Date(earlier + 'T00:00:00Z');
  const d2 = new Date(later + 'T00:00:00Z');

  const diffTime = d2.getTime() - d1.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}
