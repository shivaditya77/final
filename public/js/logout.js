/**
 * Professional Romantic Logout Logic
 * Powered by GSAP
 */

window.confirmLogout = function(event) {
    if (event) event.preventDefault();
    
    // Create Modal Overlay
    const overlay = document.createElement('div');
    overlay.className = 'logout-overlay';
    overlay.innerHTML = `
        <div class="logout-modal">
            <div class="logout-heart">❤️</div>
            <h2>Leaving so soon?</h2>
            <p>I'll be right here waiting for you, my love. ✨</p>
            <div class="logout-actions">
                <button class="logout-stay-btn" onclick="closeLogoutModal()">Stay with me</button>
                <button class="logout-leave-btn" onclick="executeLogout()">Goodbye for now</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    // Animate In
    gsap.fromTo(overlay, { opacity: 0 }, { opacity: 1, duration: 0.3 });
    gsap.fromTo('.logout-modal', { scale: 0.8, y: 20, opacity: 0 }, { scale: 1, y: 0, opacity: 1, duration: 0.5, ease: "back.out(1.7)" });
};

window.closeLogoutModal = function() {
    const overlay = document.querySelector('.logout-overlay');
    if (!overlay) return;

    gsap.to('.logout-modal', { scale: 0.8, y: 20, opacity: 0, duration: 0.3, ease: "power2.in" });
    gsap.to(overlay, { opacity: 0, duration: 0.3, onComplete: () => overlay.remove() });
};

window.executeLogout = function() {
    const overlay = document.querySelector('.logout-overlay');
    if (!overlay) return;

    // Phase 1: Goodbye message
    const modal = document.querySelector('.logout-modal');
    modal.innerHTML = `
        <div class="logout-heart pulse">❤️</div>
        <h2>Goodbye, my love...</h2>
        <p>Closing our private world safely. See you soon! 💋</p>
    `;

    // Phase 2: Screen transition
    setTimeout(() => {
        const transition = document.querySelector('.transition-overlay') || document.createElement('div');
        if (!transition.parentNode) {
            transition.className = 'transition-overlay';
            document.body.appendChild(transition);
        }

        gsap.to(transition, { 
            scaleY: 1, 
            duration: 0.8, 
            ease: "power4.inOut",
            onComplete: () => {
                window.location.href = '/logout';
            }
        });
    }, 1500);
};

// Add CSS for Logout Modal
const logoutStyles = `
.logout-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.8);
    backdrop-filter: blur(10px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 99999;
}

.logout-modal {
    background: #1a1a1a;
    padding: 40px;
    border-radius: 30px;
    text-align: center;
    max-width: 400px;
    width: 90%;
    border: 1px solid rgba(255, 77, 109, 0.3);
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
}

.logout-heart {
    font-size: 50px;
    margin-bottom: 20px;
}

.logout-heart.pulse {
    animation: heartPulseLogout 1.5s infinite;
}

@keyframes heartPulseLogout {
    0% { transform: scale(1); }
    50% { transform: scale(1.3); }
    100% { transform: scale(1); }
}

.logout-modal h2 {
    color: white;
    font-family: 'Playfair Display', serif;
    font-size: 1.8rem;
    margin-bottom: 10px;
}

.logout-modal p {
    color: rgba(255, 255, 255, 0.7);
    margin-bottom: 30px;
}

.logout-actions {
    display: flex;
    gap: 15px;
    justify-content: center;
}

.logout-stay-btn {
    background: rgba(255, 255, 255, 0.1);
    color: white;
    border: 1px solid rgba(255, 255, 255, 0.2);
    padding: 12px 25px;
    border-radius: 50px;
    cursor: pointer;
    font-weight: 600;
    transition: all 0.3s ease;
}

.logout-stay-btn:hover {
    background: rgba(255, 255, 255, 0.2);
}

.logout-leave-btn {
    background: #ff4d6d;
    color: white;
    border: none;
    padding: 12px 25px;
    border-radius: 50px;
    cursor: pointer;
    font-weight: 600;
    transition: all 0.3s ease;
}

.logout-leave-btn:hover {
    background: #ff758f;
    transform: scale(1.05);
}
`;

const styleSheet = document.createElement("style");
styleSheet.innerText = logoutStyles;
document.head.appendChild(styleSheet);
