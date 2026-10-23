import { icon, type IconName } from '../lib/ui';

/** Quiet public-site decoration; never an action, data state or keyboard stop. */
export function publicFloatingIcons(names: readonly IconName[], placement: 'visual' | 'explore' = 'visual'): string {
  return '<span class="public-floating-icons public-floating-icons-' + placement + '" aria-hidden="true">' + names.slice(0, 2).map(name => '<span class="public-floating-icon">' + icon(name) + '</span>').join('') + '</span>';
}
