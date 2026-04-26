const express = require('express');
const router = express.Router();
const { isAuth } = require('../middleware/auth');

const bhonduReels = [
    { url: 'https://www.youtube.com/embed/v-PfHeP_Pvs', type: 'youtube', title: '❤️' },
    { url: 'https://www.youtube.com/embed/zLfkU8S8wME', type: 'youtube', title: '✨' },
    { url: 'https://www.youtube.com/embed/JLHQ5ko3AbI', type: 'youtube', title: '💖' },
    { url: 'https://www.youtube.com/embed/0MbcB9blkq8', type: 'youtube', title: '🎀' },
    { url: 'https://www.youtube.com/embed/5Lq2LPzwqNE', type: 'youtube', title: '🌹' },
    { url: 'https://www.youtube.com/embed/4R7pFkNfdLw', type: 'youtube', title: '🦄' },
    { url: 'https://www.youtube.com/embed/0VXO4rWIO5Y', type: 'youtube', title: '🌈' },
    { url: 'https://www.youtube.com/embed/Fwp1bjphLxg', type: 'youtube', title: '🍭' },
    { url: 'https://www.youtube.com/embed/6Xojd9wJhhg', type: 'youtube', title: '🍓' },
    { url: 'https://www.youtube.com/embed/wEwrjsG6jo8', type: 'youtube', title: '🍒' },
    { url: 'https://www.youtube.com/embed/s530SavG2ns', type: 'youtube', title: 'Butterfly' },
    { url: 'https://www.youtube.com/embed/nWLdJ2w4S98', type: 'youtube', title: 'Sakura' },
    { url: 'https://www.youtube.com/embed/MLZTyJ0j8ZI', type: 'youtube', title: 'Teddy' },
    { url: 'https://www.youtube.com/embed/4RaHcxOsnKk', type: 'youtube', title: 'Love' },
    // New Reels
    { url: 'https://www.youtube.com/embed/Om6M6FshF4o', type: 'youtube', title: 'My Love ❤️' },
    { url: 'https://www.youtube.com/embed/yRUo1fGGuls', type: 'youtube', title: 'Sweet ✨' },
    { url: 'https://www.youtube.com/embed/Sss1GmO8fv8', type: 'youtube', title: 'Promise 💖' },
    { url: 'https://www.youtube.com/embed/y4CkZGgFDGA', type: 'youtube', title: 'Forever 🎀' },
    { url: 'https://www.youtube.com/embed/dxspnKfmnLE', type: 'youtube', title: 'Rose 🌹' },
    { url: 'https://www.youtube.com/embed/aU-qxXStXpg', type: 'youtube', title: 'Magic 🦄' },
    { url: 'https://www.youtube.com/embed/ssehPIoyBcE', type: 'youtube', title: 'Color 🌈' },
    { url: 'https://www.youtube.com/embed/-26p9QnMre0', type: 'youtube', title: 'Candy 🍭' },
    { url: 'https://www.youtube.com/embed/1k-Q67qRcGg', type: 'youtube', title: 'Berry 🍓' },
    { url: 'https://www.youtube.com/embed/dOfIofp2_Lw', type: 'youtube', title: 'Cherry 🍒' },
    { url: 'https://www.youtube.com/embed/FeM0OReYd4Q', type: 'youtube', title: 'Fly 🦋' },
    { url: 'https://www.youtube.com/embed/uE6fyVpAl1w', type: 'youtube', title: 'Bloom 🌸' },
    { url: 'https://www.youtube.com/embed/7MEdwp66mUA', type: 'youtube', title: 'Hug 🧸' },
    { url: 'https://www.youtube.com/embed/GERax6xfJQ8', type: 'youtube', title: 'Letter 💌' },
    { url: 'https://www.youtube.com/embed/xC5IDTeZLh0', type: 'youtube', title: 'Gaze 👀' },
    { url: 'https://www.youtube.com/embed/LzLczTaPWUA', type: 'youtube', title: 'Dance 💃' },
    { url: 'https://www.youtube.com/embed/SK9_ASjP_k8', type: 'youtube', title: 'Star 🌟' },
    { url: 'https://www.youtube.com/embed/k_fV8hjUONY', type: 'youtube', title: 'Cloud ☁️' },
    { url: 'https://www.youtube.com/embed/WHum6oZi6Dg', type: 'youtube', title: 'Moon 🌙' },
    { url: 'https://www.youtube.com/embed/811XCG1FKcQ', type: 'youtube', title: 'Sun ☀️' },
    { url: 'https://www.youtube.com/embed/8ISgcg_gAzE', type: 'youtube', title: 'Sky 🌌' },
    { url: 'https://www.youtube.com/embed/3UveaLyG3Fw', type: 'youtube', title: 'Ocean 🌊' },
    { url: 'https://www.youtube.com/embed/mndCrd-z-1o', type: 'youtube', title: 'Forest 🌳' },
    { url: 'https://www.youtube.com/embed/0y7tkkml2NI', type: 'youtube', title: 'Fire 🔥' },
    { url: 'https://www.youtube.com/embed/23f3-xKke14', type: 'youtube', title: 'Gold 👑' },
    { url: 'https://www.youtube.com/embed/PyJ7LZG5flM', type: 'youtube', title: 'Diamond 💎' },
    { url: 'https://www.youtube.com/embed/KZfnwgEV1Po', type: 'youtube', title: 'Pearl 🐚' },
    { url: 'https://www.youtube.com/embed/-wlZX_crecw', type: 'youtube', title: 'Crystal 🔮' },
    { url: 'https://www.youtube.com/embed/V3e7xS5aY7g', type: 'youtube', title: 'Wish 💫' },
    { url: 'https://www.youtube.com/embed/NEeDgy46DWc', type: 'youtube', title: 'Dream 💭' },
    { url: 'https://www.youtube.com/embed/-BF_RTJHdBY', type: 'youtube', title: 'Hope ⚓' },
    { url: 'https://www.youtube.com/embed/zjoOVB0Y2Xk', type: 'youtube', title: 'Soul 👻' },
    { url: 'https://www.youtube.com/embed/C9xjEVq4yIY', type: 'youtube', title: 'Mind 🧠' },
    { url: 'https://www.youtube.com/embed/Lo44rl8iY5Q', type: 'youtube', title: 'Song 🎶' },
    { url: 'https://www.youtube.com/embed/xTjxtoy_cCs', type: 'youtube', title: 'Beat 🥁' },
    { url: 'https://www.youtube.com/embed/ids5MmGo560', type: 'youtube', title: 'Rhythm 🎷' },
    { url: 'https://www.youtube.com/embed/6A0H8M4pOqQ', type: 'youtube', title: 'Tune 🎻' },
    { url: 'https://www.youtube.com/embed/6LkwI8aHnuY', type: 'youtube', title: 'Harmony 🎹' },
    { url: 'https://www.youtube.com/embed/tPhs8HlHhdQ', type: 'youtube', title: 'Melody 🎼' },
    { url: 'https://www.youtube.com/embed/iFO5610FC4A', type: 'youtube', title: 'Verse 📝' },
    { url: 'https://www.youtube.com/embed/KYlWYl59eKE', type: 'youtube', title: 'Poem 📜' },
    { url: 'https://www.youtube.com/embed/FNKK9ucRqpM', type: 'youtube', title: 'Story 📖' },
    { url: 'https://www.youtube.com/embed/mvlF-GFrjU8', type: 'youtube', title: 'Tale 🧚' },
    { url: 'https://www.youtube.com/embed/bZFOwNrHFk4', type: 'youtube', title: 'Myth 🐉' },
    { url: 'https://www.youtube.com/embed/L0HkvVrUndI', type: 'youtube', title: 'Legend 🗡️' },
    { url: 'https://www.youtube.com/embed/TVDDX6MyxPs', type: 'youtube', title: 'Fable 🦄' },
    { url: 'https://www.youtube.com/embed/ow9CYaFsq9o', type: 'youtube', title: 'Magic 🪄' },
    { url: 'https://www.youtube.com/embed/pI8IYm1ghCo', type: 'youtube', title: 'Miracle ✨' }
];

router.get('/reels', (req, res) => {
    const username = req.session.username || "Bhondu";
    // Shuffle the array
    const shuffledReels = [...bhonduReels].sort(() => Math.random() - 0.5);
    res.render('reels', { 
        username, 
        reels: shuffledReels,
        total: shuffledReels.length
    });
});

module.exports = router;
