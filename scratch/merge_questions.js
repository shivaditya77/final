const mongoose = require('mongoose');
const Question = require('../models/Question');
require('dotenv').config();

async function merge() {
    await mongoose.connect(process.env.MONGODB_URI);
    
    const usernames = ['vishu', 'bhondu'];
    
    for (const name of usernames) {
        const all = await Question.find({ username: { $regex: new RegExp(`^${name}$`, 'i') } }).sort({ updatedAt: 1 });
        
        if (all.length > 1) {
            console.log(`Found ${all.length} entries for ${name}. Merging...`);
            let mergedAnswers = {};
            
            // Start with the oldest and overlay newer ones (if they have content)
            all.forEach(doc => {
                const answers = doc.answers || {};
                Object.keys(answers).forEach(q => {
                    if (answers[q] && answers[q].trim() !== '') {
                        mergedAnswers[q] = answers[q];
                    }
                });
            });
            
            // Keep the newest document and update it with merged answers
            const newest = all[all.length - 1];
            newest.username = name.toLowerCase();
            newest.answers = mergedAnswers;
            newest.updatedAt = new Date();
            await newest.save();
            
            // Delete others
            const others = all.slice(0, -1);
            for (const other of others) {
                await Question.deleteOne({ _id: other._id });
            }
            console.log(`Merged ${name} into ${newest._id}`);
        } else if (all.length === 1) {
            // Just normalize name
            all[0].username = name.toLowerCase();
            await all[0].save();
        }
    }
    
    await mongoose.connection.close();
}
merge();
