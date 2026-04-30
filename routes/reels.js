const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const isAuth = require('../middleware/auth');

router.get('/reels', isAuth, (req, res) => {
    const username = req.session.username || "Bhondu";
    
    let reels = [];
    try {
        reels = require('../reels_list.json');
    } catch (err) {
        console.error("Error loading reels_list.json:", err);
    }

    res.render('reels', { 
        reels: reels,
        username,
        pusherKey: process.env.PUSHER_KEY, 
        pusherCluster: process.env.PUSHER_CLUSTER 
    });
});

module.exports = router;
