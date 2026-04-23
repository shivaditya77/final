const mongoose = require("mongoose");

const memorySchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ["image", "video"],
        required: true
    },
    url: {
        type: String,
        required: true
    },
    caption: {
        type: String,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model("Memory", memorySchema);