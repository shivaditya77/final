const mongoose = require('mongoose');

const GameStateSchema = new mongoose.Schema({
    gameId: { type: String, required: true, unique: true }, 
    gameType: { type: String, required: true }, // 'dash-duel' or 'ludo'
    players: [{
        username: String,
        color: String,
        tokens: [{
            id: Number,
            pathIndex: { type: Number, default: 0 },
            status: { type: String, default: 'home' } // 'home', 'track', 'finished'
        }],
        score: { type: Number, default: 0 }
    }],
    currentPlayerIdx: { type: Number, default: 0 },
    currentRoll: { type: Number, default: 0 },
    isRolling: { type: Boolean, default: false },
    waitingForMove: { type: Boolean, default: false },
    sixCount: { type: Number, default: 0 },
    lastUpdated: { type: Date, default: Date.now }
});

module.exports = mongoose.model('GameState', GameStateSchema);
