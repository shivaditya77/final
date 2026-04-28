const mongoose = require('mongoose');

const GameStateSchema = new mongoose.Schema({
    gameId: { type: String, required: true, unique: true }, // e.g., 'dash-duel-bhondu-vishu'
    gameType: { type: String, required: true }, // 'dash-duel' or 'classic-ludo'
    players: [{
        username: String,
        color: String,
        pathIndex: { type: Number, default: 0 },
        score: { type: Number, default: 0 }
    }],
    currentPlayerIdx: { type: Number, default: 0 },
    currentRoll: { type: Number, default: 0 },
    isRolling: { type: Boolean, default: false },
    waitingForMove: { type: Boolean, default: false },
    lastUpdated: { type: Date, default: Date.now }
});

module.exports = mongoose.model('GameState', GameStateSchema);
