const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    sender: {
        type: String,
        required: true
    },
    text: {
        type: String,
        required: false
    },
    fileUrl: String,
    fileType: {
        type: String,
        enum: ['text', 'image', 'video', 'audio'],
        default: 'text'
    },
    timestamp: {
        type: Date,
        default: Date.now
    },
    deletedBy: [String], // Array of usernames who deleted it for themselves
    isDeletedForEveryone: {
        type: Boolean,
        default: false
    }
});

module.exports = mongoose.model('Message', messageSchema);
