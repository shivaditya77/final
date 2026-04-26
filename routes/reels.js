const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { isAuth } = require('../middleware/auth');

router.get('/reels', (req, res) => {
    const username = req.session.username || "Bhondu";
    const listPath = path.join(__dirname, '../reels_list.json');
    
    let reels = [];

    try {
        if (fs.existsSync(listPath)) {
            const files = JSON.parse(fs.readFileSync(listPath, 'utf8'));
            reels = files.map(file => ({
                url: `/assets/reels/${encodeURIComponent(file)}`,
                title: file.split('.')[0].substring(0, 30) + (file.length > 30 ? '...' : '')
            }));
        }
    } catch (err) {
        console.error("Error reading reels list:", err);
    }

    if (reels.length === 0) {
        reels = [{ url: '/assets/reels/r_1.mp4', title: 'Loading Bhondu Feed...' }];
    }

    const shuffledReels = [...reels].sort(() => Math.random() - 0.5);

    res.render('reels', { 
        username, 
        reels: shuffledReels,
        total: shuffledReels.length
    });
});

module.exports = router;
