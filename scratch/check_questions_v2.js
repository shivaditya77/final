const mongoose = require('mongoose');
const Question = require('../models/Question');
require('dotenv').config();

async function check() {
    await mongoose.connect(process.env.MONGODB_URI);
    const questions = await Question.find();
    questions.forEach(q => {
        console.log(`User: ${q.username}`);
        console.log(`Answers: ${JSON.stringify(q.answers, null, 2)}`);
        console.log('---');
    });
    await mongoose.connection.close();
}
check();
