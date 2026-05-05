const mongoose = require('mongoose');
const Question = require('../models/Question');
require('dotenv').config();

async function check() {
    await mongoose.connect(process.env.MONGODB_URI);
    const questions = await Question.find();
    console.log(JSON.stringify(questions, null, 2));
    await mongoose.connection.close();
}
check();
