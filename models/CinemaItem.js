const mongoose = require('mongoose');

const CinemaItemSchema = new mongoose.Schema({
    videoId: { type: String, required: true },
    title: { type: String, required: true },
    thumbnail: { type: String, required: true },
    type: { type: String, enum: ['favorite', 'history', 'playlist'], required: true },
    playlistName: { type: String }, // For 'Romantic Hits' etc.
    addedBy: { type: String },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('CinemaItem', CinemaItemSchema);
