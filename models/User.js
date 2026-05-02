const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        lowercase: true
    },
    lastSeen: {
        type: Date,
        default: Date.now
    },
    chatWallpaper: {
        type: String,
        default: '' // Default to empty (use CSS default)
    },
    passkeys: [{
        credentialID: Buffer,
        publicKey: Buffer,
        counter: Number,
        transports: [String],
    }]

});

module.exports = mongoose.model('User', userSchema);
