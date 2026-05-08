export async function subscribeToPush(userId: string): Promise<void> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('Push notifications non supportées sur ce navigateur');
    return;
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    console.warn('Permission notifications refusée');
    return;
  }

  const sw = await navigator.serviceWorker.ready;

  const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!vapidKey) {
    console.error('VITE_VAPID_PUBLIC_KEY manquant');
    return;
  }

  // Convertir la clé VAPID base64 en Uint8Array
  const applicationServerKey = urlBase64ToUint8Array(vapidKey);

  const subscription = await sw.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey,
  });

  await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription, userId }),
  });

  console.log('[Push] Souscription enregistrée');
}

export async function unsubscribeFromPush(userId: string): Promise<void> {
  const sw = await navigator.serviceWorker.ready;
  const subscription = await sw.pushManager.getSubscription();
  if (subscription) await subscription.unsubscribe();

  await fetch('/api/push/unsubscribe', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  });
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}