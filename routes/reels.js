const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { isAuth } = require('../middleware/auth');

router.get('/reels', (req, res) => {
    const username = req.session.username || "Bhondu";
    const reelsDir = path.join(__dirname, '../public/assets/reels');
    
    let reels = [];

    try {
        if (fs.existsSync(reelsDir)) {
            const files = fs.readdirSync(reelsDir);
            reels = files
                .filter(file => /\.(mp4|webm|mov)$/i.test(file))
                .map(file => ({
                    // We encode the filename so special characters like # and emojis work in the URL
                    url: `/assets/reels/${encodeURIComponent(file)}`,
                    // We clean up the title for the display (removing extension and long text)
                    title: file.split('.')[0].substring(0, 30) + (file.length > 30 ? '...' : '')
                }));
        }
    } catch (err) {
        console.error("Error reading reels directory:", err);
    }

    if (reels.length === 0) {
        reels = [{ url: '/assets/reels/sample.mp4', title: 'Add videos to assets/reels!' }];
    }

    // Shuffle for variety
    const shuffledReels = [...reels].sort(() => Math.random() - 0.5);

    res.render('reels', { 
        username, 
        reels: shuffledReels,
        total: shuffledReels.length
    });
});

module.exports = router;
