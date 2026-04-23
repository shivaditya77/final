const mongoose = require("mongoose");

const journalSchema = new mongoose.Schema({
    filename: { type: String, default: "" },
    type: { type: String, enum: ["image", "video", "text"], default: "text" },
    description: { type: String, default: "" },
    date: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Journal", journalSchema);
