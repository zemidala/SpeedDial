// A notification in the corner of the screen; one at a time

export type NoticeKind = 'error' | 'info';

/** A button in the notification, e.g. "Undo" */
export interface NoticeAction {
  label: string;
  run: () => Promise<unknown> | void;
}

const INFO_DURATION = 3000; // Ms; errors stay until closed
const ACTION_DURATION = 8000; // A notification with a button stays longer — to have time to press it

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

/** Runs the notification's action and closes it; an action error is shown in its place */
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
