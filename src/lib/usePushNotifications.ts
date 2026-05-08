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
  let subscription = await sw.pushManager.getSubscription();

  if (!subscription) {
    console.log('[Push] Création nouvelle souscription...');
    subscription = await sw.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    });
  } else {
    console.log('[Push] Souscription existante trouvée, envoi au serveur...');
  }

  // Toujours envoyer au serveur (même si souscription existante)
  const res = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: subscription.toJSON(), userId }),
  });

  const text = await res.text();
  console.log('[Push] Status:', res.status, 'Réponse:', text);
  // Afficher aussi dans le debug
  const el = document.getElementById('pwa-debug');
  if (el) el.innerHTML += `<div>Push API: ${res.status} - ${text.slice(0, 100)}</div>`;
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