const mongoose = require('mongoose');

const CricketGameSchema = new mongoose.Schema({
    gameId: { type: String, required: true, unique: true },
    status: { type: String, default: 'toss' }, // 'toss', 'choosing', 'playing', 'finished'
    tossWinner: String,
    tossChoice: String, // 'bat' or 'bowl'
    inning: { type: Number, default: 1 },
    target: Number,
    players: [{
        username: String,
        score: { type: Number, default: 0 },
        wickets: { type: Number, default: 0 },
        isBatting: { type: Boolean, default: false },
        highFive: { type: Boolean, default: false }
    }],
    currentPicks: {
        player1: Number,
        player2: Number
    },
    lastMove: {
        batsmanRun: Number,
        bowlerRun: Number,
        result: String // 'run', 'out', 'win', 'gameover'
    }
}, { timestamps: true });

module.exports = mongoose.model('CricketGame', CricketGameSchema);
