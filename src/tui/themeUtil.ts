import type { Color, Theme } from '../theme.js';
import type { StatusRole } from '../sessions.js';

export function statusColor(role: StatusRole, theme: Theme): Color {
  switch (role) {
    case 'ok':
      return theme.running;
    case 'input':
      return theme.input;
    case 'approval':
      return theme.approval;
    default:
      return undefined;
  }
}
