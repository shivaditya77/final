const mongoose = require('mongoose');
const Journal = require('../models/Journal');
require('dotenv').config();

async function check() {
    await mongoose.connect(process.env.MONGODB_URI);
    const entries = await Journal.find();
    entries.forEach(e => {
        console.log(`Type: ${e.type}, Filename: ${e.filename}`);
    });
    await mongoose.connection.close();
}
check();
