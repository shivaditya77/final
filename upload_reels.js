require('dotenv').config();
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const REELS_DIR = path.join(__dirname, 'public/assets/reels');
const MANIFEST_PATH = path.join(__dirname, 'reels_list.json');

async function uploadReels() {
    console.log("🚀 Starting Cloudinary Upload...");
    
    if (!fs.existsSync(REELS_DIR)) {
        console.error("❌ Reels directory not found!");
        return;
    }

    const files = fs.readdirSync(REELS_DIR).filter(f => f.endsWith('.mp4'));
    console.log(`📂 Found ${files.length} videos to upload.`);

    const cloudReels = [];

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const filePath = path.join(REELS_DIR, file);
        
        console.log(`[${i+1}/${files.length}] Uploading ${file}...`);
        
        try {
            const result = await cloudinary.uploader.upload(filePath, {
                folder: 'bhondu_reels',
                resource_type: 'video'
            });
            
            cloudReels.push({
                name: file,
                url: result.secure_url
            });
            
            console.log(`✅ Success: ${result.secure_url}`);
        } catch (err) {
            console.error(`❌ Failed to upload ${file}:`, err.message);
        }
    }

    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(cloudReels, null, 2));
    console.log("\n✨ ALL DONE! Cloud Manifest updated in reels_list.json");
    console.log("You can now safely delete the local videos folder if you want.");
}

uploadReels();
