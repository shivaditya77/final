/* 
  Service Worker for Bhondu Birthday Surprise
  Handles background push notifications.
*/

self.addEventListener('push', function(event) {
    if (event.data) {
        try {
            const data = event.data.json();
            const options = {
                body: data.content,
                icon: '/favicon.svg',
                badge: '/favicon.svg',
                data: {
                    url: data.link || '/'
                },
                vibrate: [100, 50, 100],
                actions: [
                    { action: 'open', title: 'Open ❤️' },
                    { action: 'close', title: 'Dismiss' }
                ]
            };

            event.waitUntil(
                self.registration.showNotification(data.title || `New from ${data.sender}`, options)
            );
        } catch (e) {
            console.error("Push data error:", e);
        }
    }
});

self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    
    if (event.action === 'close') return;

    const urlToOpen = event.notification.data.url;

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
            for (let i = 0; i < clientList.length; i++) {
                let client = clientList[i];
                if (client.url === urlToOpen && 'focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
        })
    );
});
