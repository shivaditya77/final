const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({
    recipient: { type: String, required: true }, // 'bhondu' or 'vishu'
    sender: { type: String, required: true },
    type: { type: String, enum: ["message", "reaction", "call", "journal", "general"], default: "general" },
    content: { type: String, required: true },
    link: { type: String, default: "" },
    isRead: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Notification", notificationSchema);
