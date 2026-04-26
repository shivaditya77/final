const mongoose = require("mongoose");

const questionSchema = new mongoose.Schema({
    username: { type: String, required: true },
    answers: {
        q1: { type: String, default: "" },
        q2: { type: String, default: "" },
        q3: { type: String, default: "" },
        q4: { type: String, default: "" },
        q5: { type: String, default: "" },
        q6: { type: String, default: "" },
        q7: { type: String, default: "" },
        q8: { type: String, default: "" },
        q9: { type: String, default: "" }
    },
    updatedAt: { type: Date, default: Date.now }
});

// Compound index to ensure one response per user
questionSchema.index({ username: 1 }, { unique: true });

module.exports = mongoose.model("Question", questionSchema);
