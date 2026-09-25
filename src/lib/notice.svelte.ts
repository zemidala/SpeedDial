// Уведомление в углу экрана; одновременно показывается одно

export type NoticeKind = 'error' | 'info';

const INFO_DURATION = 3000; // Мс; ошибки висят, пока их не закроют

export const notice = $state<{message: string | null; kind: NoticeKind}>({message: null, kind: 'error'});

let hideTimer: ReturnType<typeof setTimeout> | undefined;

export function showNotice(message: string, kind: NoticeKind = 'error'): void {
  clearTimeout(hideTimer);
  notice.message = message;
  notice.kind = kind;
  if (kind === 'info') hideTimer = setTimeout(hideNotice, INFO_DURATION);
}

export function hideNotice(): void {
  clearTimeout(hideTimer);
  notice.message = null;
}

export const RELOAD_EXTENSION_HINT = 'Откройте страницу расширений (chrome://extensions или edge://extensions) '
  + 'и нажмите «Перезагрузить» у SpeedDial.';
