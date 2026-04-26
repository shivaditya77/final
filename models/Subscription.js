const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
    username: { type: String, required: true, lowercase: true },
    subscription: {
        endpoint: { type: String, required: true },
        expirationTime: { type: Number, default: null },
        keys: {
            p256dh: { type: String, required: true },
            auth: { type: String, required: true }
        }
    },
    createdAt: { type: Date, default: Date.now }
});

// Unique index to prevent duplicate subscriptions for the same endpoint
subscriptionSchema.index({ "subscription.endpoint": 1 }, { unique: true });

module.exports = mongoose.model('Subscription', subscriptionSchema);
