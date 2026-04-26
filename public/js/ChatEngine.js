/**
 * Soul Connect - Chat Engine v2.0
 * Professional Real-Time Communication Layer
 */
(function() {
    if (typeof Pusher === 'undefined') {
        console.error("Chat Engine: Pusher is missing! 💔");
        return;
    }

    // ========== CONFIGURATION ==========
    const config = {
        key: window.PUSHER_KEY,
        cluster: window.PUSHER_CLUSTER,
        user: window.CURRENT_USER,
        username: window.CURRENT_USER
    };

    const username = config.username;
    const otherUser = username.toLowerCase() === 'bhondu' ? 'vishu' : 'bhondu';
    
    // ========== DOM ELEMENTS ==========
    const statusText = document.getElementById('status-text');
    const statusDot = document.getElementById('status-dot');
    const container = document.getElementById('messages-container');
    const msgEnd = document.getElementById('messages-end');
    const chatForm = document.getElementById('chat-form');
    const chatInput = document.getElementById('chat-input');
    const typingIndicator = document.getElementById('typing-indicator');
    
    const pusher = typeof initGlobalPusher === 'function' ? initGlobalPusher() : window.globalPusher;
    const channel = window.globalChannel;

    if (!pusher || !channel) {
        console.error('Chat Engine: Credentials missing!');
        if (statusText) statusText.innerText = 'Setup Error 💔';
        return;
    }

    // ========== STATE ==========
    let lastTypingTime = 0;
    let currentReplyId = null;
    let currentEditId = null;
    let typingTimeout;

    // ========== UTILITIES ==========
    const haptic = (type) => {
        if (!navigator.vibrate) return;
        switch(type) {
            case 'click': navigator.vibrate(10); break;
            case 'success': navigator.vibrate([15, 30, 15]); break;
            case 'error': navigator.vibrate([50, 100, 50]); break;
            case 'longpress': navigator.vibrate(25); break;
        }
    };

    function scrollToBottom(smooth = true) {
        if (!container || !msgEnd) return;
        const behavior = smooth ? 'smooth' : 'auto';
        container.scrollTo({ top: container.scrollHeight, behavior });
        setTimeout(() => { container.scrollTop = container.scrollHeight; }, 100);
    }

    // ========== UI MANAGERS ==========
    function updateConnectionUI(state) {
        if (!statusText || !statusDot) return;
        const states = {
            'connected': { text: 'Online ✨', color: '#4caf50', dot: '#4caf50' },
            'connecting': { text: 'Connecting... 🔄', color: '#ffeb3b', dot: '#ffeb3b' },
            'unavailable': { text: 'Network Issue ⚠️', color: '#f44336', dot: '#f44336' },
            'failed': { text: 'Connection Failed ❌', color: '#f44336', dot: '#f44336' },
            'disconnected': { text: 'Offline 🌑', color: '#777', dot: '#777' }
        };
        const s = states[state] || states['disconnected'];
        statusText.innerText = s.text;
        statusText.style.color = s.color;
        statusDot.style.background = s.dot;
    }

    // ========== DEBUG SYSTEM ==========
    const debugPopup = document.getElementById('debug-popup');
    const debugLogs = document.getElementById('debug-logs');
    
    function logToDebug(msg) {
        if (!debugLogs) return;
        const line = document.createElement('div');
        line.innerText = `[${new Date().toLocaleTimeString()}] ${msg}`;
        debugLogs.appendChild(line);
        debugLogs.scrollTop = debugLogs.scrollHeight;
    }

    window.openDebug = () => { if (debugPopup) debugPopup.style.display = 'flex'; };
    window.closeDebug = () => { if (debugPopup) debugPopup.style.display = 'none'; };

    // Capture Pusher Logs
    Pusher.log = (msg) => {
        console.log(msg);
        logToDebug(msg);
    };

    async function updateStatusUI(isOnline) {
        if (statusDot) statusDot.style.background = isOnline ? '#4caf50' : '#f44336';
        if (statusText) {
            if (isOnline) {
                statusText.innerText = 'Online';
                statusText.style.color = '#4caf50';
            } else {
                logToDebug(`Connection state changed to: ${isOnline}`);
                try {
                    const res = await fetch(`/api/user/status/${otherUser}`);
                    const data = await res.json();
                    statusText.innerText = data.lastSeen ? `Last seen ${formatLastSeen(data.lastSeen)}` : 'Offline';
                    statusText.style.color = '#f44336';
                } catch (e) { statusText.innerText = 'Offline'; }
            }
        }
    }

    function formatLastSeen(dateStr) {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMins = Math.floor((now - date) / 60000);
        
        if (diffMins < 1) return 'just now';
        
        const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        
        // If today
        if (date.toDateString() === now.toDateString()) {
            return `today at ${timeStr}`;
        }
        
        // If yesterday
        const yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);
        if (date.toDateString() === yesterday.toDateString()) {
            return `yesterday at ${timeStr}`;
        }
        
        return `${date.toLocaleDateString()} at ${timeStr}`;
    }

    // ========== PUSHER BINDINGS ==========
    let connectionTimeout;
    function startConnectionCheck() {
        if (connectionTimeout) clearTimeout(connectionTimeout);
        connectionTimeout = setTimeout(() => {
            if (pusher.connection.state === 'connecting') {
                console.log("Chat Engine: Connection taking too long, retrying...");
                if (statusText) statusText.innerText = 'Retrying... 🔄';
                pusher.disconnect();
                setTimeout(() => pusher.connect(), 1000);
            }
        }, 8000); // 8 seconds retry
    }

    pusher.connection.bind('state_change', (sc) => {
        updateConnectionUI(sc.current);
        console.log(`Chat Engine: State changed to ${sc.current}`);
        if (sc.current === 'connecting') startConnectionCheck();
        else if (connectionTimeout) clearTimeout(connectionTimeout);
        
        // Force refresh status on reconnect
        if (sc.current === 'connected') checkOtherUserStatus();
    });

    pusher.connection.bind('error', (err) => {
        console.error('Chat Engine: Pusher Error', err);
        if (statusText) {
            statusText.innerText = 'Connection Error ⚠️';
            statusText.style.color = '#ff9800';
        }
    });
    
    updateConnectionUI(pusher.connection.state);
    if (pusher.connection.state === 'connecting') startConnectionCheck();

    channel.bind('pusher:subscription_succeeded', (members) => {
        updateStatusUI(members.count > 1);
        scrollToBottom(false);
    });

    channel.bind('pusher:member_added', (member) => {
        if (member.id !== username.toLowerCase()) updateStatusUI(true);
    });

    channel.bind('pusher:member_removed', (member) => {
        if (member.id !== username.toLowerCase()) updateStatusUI(false);
    });

    channel.bind('new-message', (msg) => {
        // Prevent duplicate messages if connection drops and reconnects
        if (document.getElementById('msg-' + msg._id)) return;

        const empty = document.getElementById('chat-empty');
        if (empty) empty.remove();

        if (msg.tempId && document.getElementById('msg-' + msg.tempId)) {
            const el = document.getElementById('msg-' + msg.tempId);
            el.id = 'msg-' + msg._id;
            el.classList.remove('optimistic');
            refreshDropdown(el, msg);
            return;
        }

        appendMessage(msg);
        if (msg.sender !== username) {
            if (window.createHeartBurst) createHeartBurst();
            haptic('success');
            fetch('/api/chat/mark-read', { method: 'POST' });
        }
        scrollToBottom(true);
    });

    function refreshDropdown(el, msg) {
        const dropdown = document.getElementById('dropdown-' + msg._id);
        if (!dropdown) return;
        dropdown.innerHTML = generateDropdownHtml(msg);
        const options = el.querySelector('.msg-options');
        if (options) options.dataset.id = msg._id;
    }

    function generateDropdownHtml(msg) {
        let html = `<button class="msg-action-btn" data-action="reply" data-id="${msg._id}" data-sender="${msg.sender.replace(/'/g, "\\'")}" data-text="${(msg.text || "Media").replace(/'/g, "\\'").replace(/\n/g, "\\n")}">⤴️ Reply</button>`;
        if (msg.sender === username && msg.fileType === 'text') {
            html += `<button class="msg-action-btn" data-action="edit" data-id="${msg._id}" data-text="${(msg.text || "").replace(/'/g, "\\'").replace(/\n/g, "\\n")}">✏️ Edit</button>`;
        }
        html += `<button class="msg-action-btn" data-action="star" data-id="${msg._id}" id="star-btn-${msg._id}">⭐ Star</button>`;
        html += '<div class="divider"></div>';
        html += `<button class="msg-action-btn delete-btn" data-action="delete-me" data-id="${msg._id}">🗑 Delete for me</button>`;
        if (msg.sender === username) {
            html += `<button class="msg-action-btn delete-btn" data-action="delete-everyone" data-id="${msg._id}">🚫 Delete for everyone</button>`;
        }
        return html;
    }

    function appendMessage(msg, isOptimistic = false) {
        if (!container || !msgEnd) return;
        const div = document.createElement('div');
        div.className = `chat-message ${msg.sender === username ? 'sent' : 'received'} ${isOptimistic ? 'optimistic' : ''}`;
        div.id = 'msg-' + (msg._id || msg.tempId);
        
        const time = new Date(msg.timestamp || Date.now()).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
        let mediaHtml = '';
        if (msg.fileUrl) {
            if (msg.fileType === 'image') mediaHtml = `<img src="${msg.fileUrl}" class="chat-media-img" data-action="lightbox" data-url="${msg.fileUrl}" data-type="image">`;
            else if (msg.fileType === 'video') mediaHtml = `<video src="${msg.fileUrl}" class="chat-media-video" data-action="lightbox" data-url="${msg.fileUrl}" data-type="video"></video>`;
            else if (msg.fileType === 'audio') mediaHtml = `<audio src="${msg.fileUrl}" class="chat-media-audio" controls></audio>`;
        }

        div.innerHTML = `
            <div class="msg-options" data-id="${msg._id || msg.tempId}">⋮</div>
            <div class="msg-dropdown" id="dropdown-${msg._id || msg.tempId}">
                ${generateDropdownHtml(msg)}
            </div>
            <div class="reaction-picker-btn" data-id="${msg._id || msg.tempId}">❤️+</div>
            <div class="reaction-picker" id="picker-${msg._id || msg.tempId}">
                <span class="react-btn" data-id="${msg._id || msg.tempId}" data-emoji="❤️">❤️</span>
                <span class="react-btn" data-id="${msg._id || msg.tempId}" data-emoji="😂">😂</span>
                <span class="react-btn" data-id="${msg._id || msg.tempId}" data-emoji="😮">😮</span>
                <span class="react-btn" data-id="${msg._id || msg.tempId}" data-emoji="😢">😢</span>
                <span class="react-btn" data-id="${msg._id || msg.tempId}" data-emoji="👍">👍</span>
            </div>
            <div class="sender-name">${msg.sender}</div>
            ${msg.replyTo ? `
                <div class="reply-quote">
                    <div class="reply-quote-sender">${msg.replyTo.sender}</div>
                    <div class="reply-quote-text">${msg.replyTo.text || "Media"}</div>
                </div>
            ` : ''}
            ${mediaHtml}
            ${msg.text ? `<div class="text">${msg.text}</div>` : ''}
            <div class="reactions-display" id="reactions-${msg._id || msg.tempId}"></div>
            <div class="msg-time">
                ${time}
                ${msg.sender === username ? `<span class="tick ${msg.status === 'read' ? 'read' : ''}">✔✔</span>` : ''}
                <span class="msg-star-icon" id="star-icon-${msg._id || msg.tempId}">⭐</span>
            </div>
        `;
        container.insertBefore(div, msgEnd);
    }

    // ========== GLOBAL LISTENERS ==========
    // ========== LONG PRESS (WHATSAPP STYLE) ==========
    let pressTimer;
    function startPress(e, id) {
        if (e.type === 'click') return;
        pressTimer = setTimeout(() => {
            haptic('heart');
            const picker = document.getElementById('picker-' + id);
            if (picker) {
                // Hide all other pickers
                document.querySelectorAll('.reaction-picker').forEach(p => p.classList.remove('show'));
                picker.classList.add('show');
            }
        }, 600); // 600ms hold
    }

    function cancelPress() {
        clearTimeout(pressTimer);
    }

    container.addEventListener('mousedown', (e) => {
        const msg = e.target.closest('.chat-message');
        if (msg) startPress(e, msg.id.replace('msg-', ''));
    });
    container.addEventListener('touchstart', (e) => {
        const msg = e.target.closest('.chat-message');
        if (msg) startPress(e, msg.id.replace('msg-', ''));
    }, { passive: true });
    
    window.addEventListener('mouseup', cancelPress);
    window.addEventListener('touchend', cancelPress);
    window.addEventListener('scroll', cancelPress, true);

    window.addEventListener('click', (e) => {
        const target = e.target;
        const id = target.dataset.id;

        if (target.classList.contains('msg-options')) {
            haptic('click');
            toggleDropdown(id);
            return;
        }

        if (!target.closest('.msg-options') && !target.closest('.msg-dropdown')) {
            document.querySelectorAll('.msg-dropdown').forEach(d => d.classList.remove('show'));
        }

        if (target.classList.contains('reaction-picker-btn')) {
            haptic('click');
            const p = document.getElementById('picker-' + id);
            if (p) p.classList.toggle('show');
            return;
        }

        if (target.classList.contains('react-btn')) {
            react(id, target.dataset.emoji);
            return;
        }

        if (target.dataset.action === 'lightbox') {
            if (window.openLightbox) window.openLightbox(target.dataset.url, target.dataset.type);
            return;
        }

        if (target.classList.contains('msg-action-btn')) {
            const action = target.dataset.action;
            if (action === 'reply') showReplyPreview(id, target.dataset.sender, target.dataset.text);
            else if (action === 'edit') startEditing(id, target.dataset.text);
            else if (action === 'star') toggleStar(id);
            else if (action === 'delete-me') deleteForMe(id);
            else if (action === 'delete-everyone') deleteForEveryone(id);
            document.querySelectorAll('.msg-dropdown').forEach(d => d.classList.remove('show'));
        }
    });

    // ========== ACTIONS ==========
    window.toggleDropdown = (id) => {
        const d = document.getElementById('dropdown-' + id);
        if (!d) return;
        const isOpen = d.classList.contains('show');
        document.querySelectorAll('.msg-dropdown').forEach(el => el.classList.remove('show'));
        if (!isOpen) d.classList.add('show');
    };

    window.react = async (msgId, emoji) => {
        try {
            await fetch('/api/chat/react', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ msgId, emoji })
            });
            const p = document.getElementById('picker-' + msgId);
            if (p) p.classList.remove('show');
            haptic('click');
        } catch (e) {}
    };

    window.showReplyPreview = (id, sender, text) => {
        currentReplyId = id;
        document.getElementById('reply-preview-sender').innerText = sender;
        document.getElementById('reply-preview-text').innerText = text;
        document.getElementById('reply-preview').style.display = 'flex';
        chatInput.focus();
    };

    window.cancelReply = () => {
        currentReplyId = null;
        document.getElementById('reply-preview').style.display = 'none';
    };

    window.startEditing = (id, text) => {
        currentEditId = id;
        chatInput.value = text;
        document.getElementById('edit-preview-text').innerText = text;
        document.getElementById('edit-preview').style.display = 'flex';
        chatInput.focus();
    };

    window.cancelEdit = () => {
        currentEditId = null;
        chatInput.value = '';
        document.getElementById('edit-preview').style.display = 'none';
    };

    window.openLightbox = (url, type) => {
        const lightbox = document.getElementById('lightbox');
        const img = document.getElementById('lightbox-img');
        const video = document.getElementById('lightbox-video');
        if (!lightbox || !img || !video) return;

        img.style.display = 'none';
        video.style.display = 'none';

        if (type === 'image') {
            img.src = url;
            img.style.display = 'block';
        } else {
            video.src = url;
            video.style.display = 'block';
        }
        lightbox.classList.add('show');
    };

    window.closeLightbox = () => {
        const lightbox = document.getElementById('lightbox');
        const video = document.getElementById('lightbox-video');
        if (!lightbox || !video) return;
        video.pause();
        video.src = "";
        lightbox.classList.remove('show');
    };

    window.deleteForMe = async (id) => {
        if (!confirm('Delete this message for you? ❤️')) return;
        try {
            await fetch('/api/chat/delete-for-me', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ msgId: id })
            });
            const el = document.getElementById('msg-' + id);
            if (el) {
                el.style.transform = 'scale(0.8)';
                el.style.opacity = '0';
                setTimeout(() => el.remove(), 300);
            }
        } catch (err) { alert('Delete failed'); }
    };

    window.deleteForEveryone = async (id) => {
        if (!confirm('Delete for everyone? 🚫')) return;
        try {
            await fetch('/api/chat/delete-for-everyone', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ msgId: id })
            });
        } catch (err) { console.error(err); }
    };

    window.toggleStar = async (msgId) => {
        try {
            const res = await fetch('/api/chat/star', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ msgId })
            });
            const data = await res.json();
            const icon = document.getElementById('star-icon-' + msgId);
            const btn = document.getElementById('star-btn-' + msgId);
            
            if (data.isStarred) {
                if (icon) icon.classList.add('active');
                if (btn) btn.innerText = '⭐ Unstar';
            } else {
                if (icon) icon.classList.remove('active');
                if (btn) btn.innerText = '⭐ Star';
            }
        } catch (e) {}
    };

    window.toggleStarredView = () => {
        const view = document.getElementById('starred-view');
        if (view.classList.contains('show')) {
            view.classList.remove('show');
        } else {
            view.classList.add('show');
            fetchStarredMessages();
        }
    };

    window.fetchStarredMessages = async () => {
        const list = document.getElementById('starred-list');
        list.innerHTML = '<p style="text-align:center; opacity:0.5; padding:20px;">Loading your favorites... ❤️</p>';
        try {
            const res = await fetch('/api/chat/starred');
            const data = await res.json();
            if (data.starred.length === 0) {
                list.innerHTML = '<p style="text-align:center; opacity:0.5; padding:20px;">No starred messages yet. ⭐</p>';
                return;
            }
            list.innerHTML = data.starred.map(msg => `
                <div class="starred-item">
                    <div class="starred-item-header">
                        <strong>${msg.sender}</strong>
                        <span>${new Date(msg.timestamp).toLocaleString()}</span>
                    </div>
                    <div class="starred-item-body">
                        ${msg.text ? `<div>${msg.text}</div>` : ''}
                        ${msg.fileUrl ? `<img src="${msg.fileUrl}" style="max-width:100px; border-radius:8px; margin-top:5px;">` : ''}
                    </div>
                </div>
            `).join('');
        } catch (e) {
            list.innerHTML = '<p style="text-align:center; color:red; padding:20px;">Failed to load. 💔</p>';
        }
    };


    // ========== MEDIA & VOICE MANAGEMENT ==========
    let mediaRecorder;
    let audioChunks = [];
    let isRecording = false;

    // File Attachment
    const attachBtn = document.getElementById('attach-btn');
    const fileInput = document.getElementById('chat-file-input');

    if (attachBtn && fileInput) {
        attachBtn.addEventListener('click', () => {
            haptic('click');
            fileInput.click();
        });

        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const formData = new FormData();
            formData.append('file', file);

            try {
                // Show uploading state
                const uploadContainer = document.getElementById('upload-progress-container');
                const uploadFill = document.getElementById('upload-progress-fill');
                if (uploadContainer) uploadContainer.style.display = 'block';
                
                const res = await fetch('/api/chat/upload', {
                    method: 'POST',
                    body: formData
                });
                const data = await res.json();
                
                if (data.fileUrl) {
                    // Send message with file
                    await fetch('/api/chat/send', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            fileUrl: data.fileUrl, 
                            fileType: data.fileType,
                            text: '' 
                        })
                    });
                }
                
                if (uploadContainer) uploadContainer.style.display = 'none';
                fileInput.value = '';
            } catch (err) {
                console.error("Upload error:", err);
                alert("Upload failed! 💔");
            }
        });
    }

    // Voice Recording
    const voiceBtn = document.getElementById('voice-btn');
    if (voiceBtn) {
        voiceBtn.addEventListener('click', async () => {
            if (!isRecording) {
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    mediaRecorder = new MediaRecorder(stream);
                    audioChunks = [];

                    mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);
                    mediaRecorder.onstop = async () => {
                        const audioBlob = new Blob(audioChunks, { type: 'audio/mp3' });
                        const formData = new FormData();
                        formData.append('file', audioBlob, 'voice-message.mp3');

                        // Show uploading
                        voiceBtn.innerHTML = '⏳';
                        
                        const res = await fetch('/api/chat/upload', {
                            method: 'POST',
                            body: formData
                        });
                        const data = await res.json();
                        
                        if (data.fileUrl) {
                            await fetch('/api/chat/send', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                    text: '' 
                                })
                            });
                        }
                        voiceBtn.innerHTML = '🎤';
                        haptic('success');
                    };

                    mediaRecorder.start();
                    isRecording = true;
                    voiceBtn.classList.add('recording');
                    voiceBtn.innerHTML = '🛑'; // Stop icon
                    haptic('click');
                } catch (err) {
                    console.error("Mic access denied:", err);
                    alert("Please allow microphone access! 🎤");
                }
            } else {
                mediaRecorder.stop();
                isRecording = false;
                voiceBtn.classList.remove('recording');
                haptic('click');
            }
        });
    }

    // ========== HEARTBEAT SYSTEM ==========
    // Send a heartbeat every 30 seconds to keep lastSeen accurate
    setInterval(async () => {
        if (pusher.connection.state === 'connected') {
            try { await fetch('/api/user/heartbeat', { method: 'POST' }); } catch (e) {}
        }
    }, 30000);

    // Initial status check
    setTimeout(() => {
        if (pusher.connection.state === 'connected') {
            // If we are alone, check the other user's last seen
            const members = channel.members;
            if (members && members.count === 1) updateStatusUI(false);
        }
    }, 2000);

    // ========== INITIALIZATION ==========
    scrollToBottom(false);
    setTimeout(() => scrollToBottom(false), 500);

    // Form logic
    if (chatForm) {
        chatForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const text = chatInput.value.trim();
            if (!text && !currentEditId) return;

            if (currentEditId) {
                const mid = currentEditId;
                cancelEdit();
                await fetch('/api/chat/edit', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ msgId: mid, newText: text })
                });
                return;
            }

            const tid = 'temp_' + Date.now();
            appendMessage({ sender: username, text, tempId: tid, timestamp: new Date().toISOString() }, true);
            chatInput.value = '';
            scrollToBottom(true);

            await fetch('/api/chat/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, tempId: tid, replyTo: currentReplyId })
            });
            cancelReply();
        });
    }
})();
