const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/birthday_db";

console.log(`Attempting to connect to: ${MONGODB_URI}`);

mongoose.connect(MONGODB_URI)
    .then(() => {
        console.log("✅ SUCCESS: Connected to MongoDB successfully!");
        process.exit(0);
    })
    .catch(err => {
        console.error("❌ FAILURE: Could not connect to MongoDB.");
        console.error("Error details:", err.message);
        process.exit(1);
    });
