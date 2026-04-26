/**
 * Global Notifications System for Bhondu App
 * Handles real-time message alerts across all pages
 */

(function() {
    // Audio context for the notification sound
    const notifSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3');
    notifSound.volume = 0.5;

    function showNotification(data) {
        // 1. Don't show if we're already on the chat page
        if (window.location.pathname === '/chat') return;

        // 2. Don't show if the message is from us (though Pusher presence usually handles this)
        if (data.sender === window.CURRENT_USER) return;

        const container = document.getElementById('global-notification-container');
        if (!container) return;

        // Create notification element
        const notif = document.createElement('div');
        notif.className = 'love-notification';
        
        // Handle message text (truncate and clean)
        let messageText = data.text || 'Sent a file 📎';
        if (data.fileUrl && !data.text) {
            if (data.fileType === 'image') messageText = 'Sent a photo 📸';
            else if (data.fileType === 'video') messageText = 'Sent a video 🎬';
            else if (data.fileType === 'audio') messageText = 'Sent a voice note 🎙️';
        }

        notif.innerHTML = `
            <div class="notif-avatar">${data.sender === 'Bhondu' ? '🐶' : '💖'}</div>
            <div class="notif-content">
                <div class="notif-header">
                    <span class="notif-name">${data.sender}</span>
                    <span class="notif-time">Just now</span>
                </div>
                <div class="notif-text">${messageText}</div>
            </div>
            <div class="notif-progress" style="animation: notifProgress 5s linear forwards"></div>
        `;

        // Add click event to go to chat
        notif.onclick = () => {
            if (typeof barba !== 'undefined') {
                barba.go('/chat');
            } else {
                window.location.href = '/chat';
            }
            notif.classList.remove('show');
            setTimeout(() => notif.remove(), 600);
        };

        container.appendChild(notif);

        // Play sound and Vibrate
        notifSound.play().catch(e => console.log('Audio play blocked by browser'));
        if (navigator.vibrate) navigator.vibrate([100, 50, 100]); 

        // Show with animation
        setTimeout(() => notif.classList.add('show'), 100);

        // Auto remove after 5 seconds
        setTimeout(() => {
            if (notif.parentNode) {
                notif.classList.remove('show');
                setTimeout(() => notif.remove(), 600);
            }
        }, 5000);
    }

    // Initialize Global Listener
    function initGlobalListener() {
        if (window.globalChannel) {
            // Unbind first to avoid duplicates if this script somehow re-runs
            window.globalChannel.unbind('new-message', showNotification);
            window.globalChannel.bind('new-message', showNotification);
        } else {
            // If globalChannel isn't ready yet, retry in a bit
            setTimeout(initGlobalListener, 1000);
        }
    }

    // Start listening
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initGlobalListener);
    } else {
        initGlobalListener();
    }

    // Exposed to window if needed
    window.showManualNotif = (title, text) => showNotification({ sender: title, text: text });
})();
