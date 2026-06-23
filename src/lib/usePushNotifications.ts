import { useInstanceStore } from '../store/instanceStore';

export async function subscribeToPush(userId: string): Promise<void> {
  // Desktop/Web PWA Push is disabled in favor of Native App pushes
  console.log('[Push] PWA Push is disabled.');
  return;
}

export async function unsubscribeFromPush(userId: string): Promise<void> {
  // Desktop/Web PWA Push is disabled in favor of Native App pushes
  console.log('[Push] PWA Push is disabled.');
  return;
}

export async function triggerPushNotification(
  userId: string,
  title: string,
  body: string,
  url: string = '/'
): Promise<void> {
  try {
    let baseUrl = useInstanceStore.getState().getCurrentInstance()?.socketUrl || window.location.origin;
    if (baseUrl.includes('file://') || baseUrl.includes('drocsid://')) {
      baseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';
    }
    baseUrl = baseUrl.replace(/\/+$/, '');

    const res = await fetch(`${baseUrl}/api/push/send-notification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, title, body, url }),
    });
    console.log('[Push Trigger] Sent push request to backend. Status:', res.status);
  } catch (err) {
    console.error('[Push Trigger] Failed to send push via API:', err);
  }
}
