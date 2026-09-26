// Уведомление в углу экрана; одновременно показывается одно

export type NoticeKind = 'error' | 'info';

/** Кнопка в уведомлении, например «Отменить» */
export interface NoticeAction {
  label: string;
  run: () => Promise<unknown> | void;
}

const INFO_DURATION = 3000; // Мс; ошибки висят, пока их не закроют
const ACTION_DURATION = 8000; // Уведомление с кнопкой висит дольше — чтобы успеть нажать

export const notice = $state<{message: string | null; kind: NoticeKind; action: NoticeAction | null}>({
  message: null,
  kind: 'error',
  action: null,
});

let hideTimer: ReturnType<typeof setTimeout> | undefined;

export function showNotice(message: string, kind: NoticeKind = 'error', action: NoticeAction | null = null): void {
  clearTimeout(hideTimer);
  notice.message = message;
  notice.kind = kind;
  notice.action = action;
  if (kind === 'info') hideTimer = setTimeout(hideNotice, action ? ACTION_DURATION : INFO_DURATION);
}

/** Выполняет действие уведомления и закрывает его; ошибка действия показывается вместо него */
export async function runNoticeAction(): Promise<void> {
  const action = notice.action;
  hideNotice();
  try {
    await action?.run();
  } catch (error) {
    showNotice(error instanceof Error ? error.message : String(error));
  }
}

export function hideNotice(): void {
  clearTimeout(hideTimer);
  notice.message = null;
  notice.action = null;
}
