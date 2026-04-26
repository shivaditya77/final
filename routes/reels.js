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
            reels = JSON.parse(fs.readFileSync(listPath, 'utf8'));
        }
    } catch (err) {
        console.error("Error reading reels_list.json:", err);
    }

    // Shuffle for variety
    const shuffledReels = [...reels].sort(() => Math.random() - 0.5);

    res.render('reels', { 
        reels: shuffledReels,
        username,
        pusherKey: process.env.PUSHER_KEY, 
        pusherCluster: process.env.PUSHER_CLUSTER 
    });
});

module.exports = router;
