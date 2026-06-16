import { useInstanceStore } from '../store/instanceStore';

export async function subscribeToPush(userId: string): Promise<void> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('[Push] Non supporté');
    return;
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    console.warn('[Push] Permission refusée:', permission);
    return;
  }

  const sw = await navigator.serviceWorker.ready;
  const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;

  if (!vapidKey) {
    console.error('[Push] VITE_VAPID_PUBLIC_KEY manquante');
    return;
  }

  // Vérifier si une souscription existe déjà
  // Forcer une nouvelle souscription propre à chaque fois
  const existing = await sw.pushManager.getSubscription();
  if (existing) {
    await existing.unsubscribe();
    console.log('[Push] Ancienne souscription supprimée');
  }

  const subscription = await sw.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidKey),
  });

  let baseUrl = useInstanceStore.getState().getCurrentInstance()?.socketUrl || window.location.origin;
  if (baseUrl.includes('file://') || baseUrl.includes('drocsid://')) {
    baseUrl = import.meta.env.VITE_BACKEND_URL || 'https://ais-pre-fcluti2ud4ygfukrtj5tcb-10217813119.europe-west1.run.app';
  }
  baseUrl = baseUrl.replace(/\/+$/, '');

  // Toujours envoyer au serveur (même si souscription existante)
  const res = await fetch(`${baseUrl}/api/push/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: subscription.toJSON(), userId }),
  });

  const text = await res.text();
  console.log('[Push] Status:', res.status, 'Réponse:', text);  
}

export async function unsubscribeFromPush(userId: string): Promise<void> {
  const sw = await navigator.serviceWorker.ready;
  const subscription = await sw.pushManager.getSubscription();
  if (subscription) await subscription.unsubscribe();

  let baseUrl = useInstanceStore.getState().getCurrentInstance()?.socketUrl || window.location.origin;
  if (baseUrl.includes('file://') || baseUrl.includes('drocsid://')) {
    baseUrl = import.meta.env.VITE_BACKEND_URL || 'https://ais-pre-fcluti2ud4ygfukrtj5tcb-10217813119.europe-west1.run.app';
  }
  baseUrl = baseUrl.replace(/\/+$/, '');

  await fetch(`${baseUrl}/api/push/unsubscribe`, {
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

export async function triggerPushNotification(
  userId: string,
  title: string,
  body: string,
  url: string = '/'
): Promise<void> {
  try {
    let baseUrl = useInstanceStore.getState().getCurrentInstance()?.socketUrl || window.location.origin;
    if (baseUrl.includes('file://') || baseUrl.includes('drocsid://')) {
      baseUrl = import.meta.env.VITE_BACKEND_URL || 'https://ais-pre-fcluti2ud4ygfukrtj5tcb-10217813119.europe-west1.run.app';
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
