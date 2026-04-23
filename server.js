require("dotenv").config();
const express = require("express");
const cors = require("cors");
const session = require("express-session");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
const mongoose = require("mongoose");

// Models
const Journal = require("./models/Journal");
const Question = require("./models/Question");
const Message = require("./models/Message");

const app = express();

// Pusher Configuration
const Pusher = require("pusher");
const pusher = new Pusher({
    appId: process.env.PUSHER_APP_ID,
    key: process.env.PUSHER_KEY,
    secret: process.env.PUSHER_SECRET,
    cluster: process.env.PUSHER_CLUSTER,
    useTLS: true
});

// Cloudinary Configuration
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// ========== MONGODB CONNECTION ==========
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/birthday_db";
mongoose.connect(MONGODB_URI)
    .then(() => console.log("🍃 Connected to MongoDB"))
    .catch(err => console.error("❌ MongoDB connection error:", err));


// ========== MIDDLEWARE ==========
const allowedOrigins = [
    process.env.FRONTEND_URL, 
    "http://localhost:5173", 
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000"
];
app.use(cors({
    origin: function (origin, callback) {
        // allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        
        // If the origin is in our allowed list, or if it's the same origin as the server
        if (allowedOrigins.indexOf(origin) !== -1 || origin.includes('localhost:3000') || origin.includes('127.0.0.1:3000')) {
            return callback(null, true);
        } else {
            var msg = 'The CORS policy for this site does not allow access from the specified Origin: ' + origin;
            return callback(new Error(msg), false);
        }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"]
}));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Set EJS as view engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// ========== SESSION ==========
// When running behind a proxy (Render, Heroku), trust the first proxy
app.set('trust proxy', 1);

app.use(session({
    secret: process.env.SESSION_SECRET || 'fallback-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24,
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
    },
    name: 'loveSessionId'
}));

// ========== GLOBAL VARS ==========
app.use((req, res, next) => {
    res.locals.isAuthenticated = req.session.isAuth;
    res.locals.username = req.session.username || "Bhondu";
    next();
});

// ========== IN-MEMORY MEMORIES ==========
const memories = [
    {
        id: '01',
        icon: '💕',
        title: 'Chapter 1: The Beginning',
        img: '/assets/chapter1.jpeg',
        text: '“You know… this was the very first day after our confession, when you went to the mall. You clicked this photo for me, and ever since then, it has become one of the most special memories I hold close to my heart.” ❤️'
    },
    {
        id: '02',
        icon: '✨',
        title: 'Chapter 2: Your First Accidental Masterpiece',
        img: '/assets/chapter2.jpeg',
        text: '“Do you remember this? 📸 The first photo of yours you sent me—by mistake. 🤭 For a moment, I was so happy, thinking you were already sharing something so special with me. 💖 Even though it was unintentional, it became one of those early memories I’ll always treasure. ✨❤️”'
    },
    {
        id: '03',
        icon: '💖',
        title: 'Chapter 3: Falling for You',
        img: '/assets/chapter3.jpeg',
        text: '“Ahh… that Holi photo 🎨🌸 from our early days… oh my God, you looked so beautiful that day. 🥺✨ That was the moment I realized I have the most beautiful girlfriend in the entire world. 💖🌍”'
    },
    {
        id: '04',
        icon: '💑',
        title: 'Chapter 4: You opened up about your past so honestly',
        img: '/assets/chapter4.jpeg',
        text: '“This photo is from the day you opened up about your past so honestly. 🤍 That honesty made me love you even more… because you’re not only beautiful by face, but by heart too. 💖✨”'
    },
    {
        id: '05',
        icon: '😊',
        title: 'Chapter 5: Innocence',
        img: '/assets/chapter5.jpeg',
        text: '“In this photo, you look so innocent… 🥺 Anyone could fall in love with you at just one glance. You’re so beautiful, so pure—it’s all visible right on your face. 💖✨”'
    },
    {
        id: '06',
        icon: '💪',
        title: 'Chapter 6: Endlessly obsessed with your photo.',
        img: '/assets/chapter6.jpeg',
        text: '“I don’t know why, but I’m so obsessed with this photo of yours… 😍 Those beautiful eyes pull me in like a magnet. 🧲✨ And those specs—oh my God, they suit your face so perfectly. 🤓💖 Your lips are just perfectly shaped… everything about this picture has me completely, deeply obsessed. ✨❤️”'
    },
    {
        id: '07',
        icon: '🎵',
        title: 'Chapter 7: Hot Bhondu',
        img: '/assets/chapter7.jpeg',
        text: '“In this photo, you look so hot and incredibly attractive… 😍 And that’s when I realized—you’re not just innocent and cute… you’re a whole different level. 😏✨ You’re a complete package, honestly. 💖 Just thinking about it makes me realize how lucky I am to have you. ❤️”'
    },
    {
        id: '08',
        icon: '🌟',
        title: 'Chapter 8: Just one photo of us, yet it means everything to me.✨',
        img: '/assets/chapter8.jpeg',
        text: '“Even if this is the only photo we have together, and even if we don’t look perfect in it… the memory behind it means more to me than a thousand beautiful pictures. 🥺💖 This photo was taken at a moment when I truly felt we might never meet again… but today, here I am, making a whole website just for you and expressing everything I couldn’t say back then. ✨❤️ Thank God for this journey… and thank you, my dearest bhondu, for being in my life. 💫💕”'
    },
    {
        id: '09',
        icon: '💘',
        title: 'Chapter 9: Maybe unnoticed… but never unmeant.',
        video: '/assets/chapter9.mp4',
        text: '“Yes, bhondu… I truly loved that you sent me a cake 🎂 and brownies 🍫, it meant a lot to me. But that doesn’t mean I only valued the material things you did for me. 🥺🤍 That video and playlist you made for me are just as special—just as meaningful as everything else. 🎶💖 I’m really sorry I never expressed it before… so I’m saying it here, directly to you. I’m sorry, bhondu. 💔✨ And honestly, more than anything… it was you being there for me on my birthday that became the most beautiful gift of my life. 🎁❤️ It’s a memory I’ll carry with me forever. 💫 Once again, I’m sorry I never mentioned it… but please remember—those efforts may have gone unnoticed, but they were never unmeant. 🤍✨ I love you, my dearest bhondu. ❤️💖”'
    }
];

// ========== DATA MIGRATION (One-time) ==========
const JOURNAL_FILE = path.join(__dirname, "data", "journal.json");
if (fs.existsSync(JOURNAL_FILE)) {
    (async () => {
        try {
            const count = await Journal.countDocuments();
            if (count === 0) {
                const raw = fs.readFileSync(JOURNAL_FILE, "utf-8");
                const data = JSON.parse(raw || "[]");
                if (data.length > 0) {
                    await Journal.insertMany(data);
                    console.log(`✅ Migrated ${data.length} entries from journal.json to MongoDB`);
                }
            }
        } catch (err) {
            console.error("Migration error:", err);
        }
    })();
}

// ========== CLOUDINARY STORAGE SETUP ==========
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'journal_memories',
        resource_type: 'auto', // Detects image or video automatically
        allowed_formats: ['jpg', 'png', 'jpeg', 'gif', 'mp4', 'mov', 'webm']
    },
});

const upload = multer({
    storage,
    limits: { fileSize: 100 * 1024 * 1024 } // 100MB
});

const chatStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'chat_uploads',
        resource_type: 'auto',
        allowed_formats: ['jpg', 'png', 'jpeg', 'gif', 'mp4', 'mov', 'webm', 'mp3', 'wav']
    },
});

const chatUpload = multer({
    storage: chatStorage,
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

// ========== AUTH MIDDLEWARE ==========
const isAuth = (req, res, next) => {
    // Check if user is authenticated via session
    if (req.session.isAuth) return next();

    // For API requests, return 401 Unauthorized
    if (req.originalUrl.startsWith('/api') || req.xhr || (req.headers['content-type'] && req.headers['content-type'].includes('application/json'))) {
        return res.status(401).json({ success: false, message: "Please login first ❤️" });
    }

    // For other requests, redirect to login page
    req.session.error = "Please login first ❤️";
    return res.redirect("/login");
};

// ========== AUTH ROUTES ==========
const authRoutes = require("./routes/auth");
app.use("/", authRoutes);
// ========== HOME ==========
app.get("/", isAuth, (req, res) => {
    res.render("home");
});

app.get("/login", (req, res) => {
    if (req.session.isAuth) return res.redirect("/");
    res.render("login", { error: req.session.error });
    req.session.error = null;
});

// ========== JOURNAL API ==========
app.get("/api/journal", isAuth, async (req, res) => {
    try {
        const entries = await Journal.find().sort({ createdAt: -1 });
        res.json({ entries, name: req.session.username || "Bhondu" });
    } catch (err) {
        res.status(500).json({ error: "Database error" });
    }
});

app.post("/api/journal/add", isAuth, upload.single("media"), async (req, res) => {
    try {
        console.log("📝 Adding journal entry...", req.body);

        // Check MongoDB Connection
        if (mongoose.connection.readyState !== 1) {
            console.error("❌ MongoDB not connected! Current state:", mongoose.connection.readyState);
            return res.status(500).json({ success: false, error: "Database not connected. Please check internet/whitelist." });
        }

        let filename = "";
        let type = "text";

        if (req.file) {
            console.log("📁 File uploaded to Cloudinary:", req.file.path);
            const isVideo = /mp4|mov|webm/i.test(path.extname(req.file.originalname));
            filename = req.file.path; // Store the full URL
            type = isVideo ? "video" : "image";
        }

        const newEntry = new Journal({
            filename,
            type,
            description: req.body.description || "",
            date: req.body.date || new Date().toISOString().split("T")[0]
        });
        await newEntry.save();
        console.log("✅ Journal entry saved!");
        res.json({ success: true, entry: newEntry });
    } catch (err) {
        console.error("❌ Journal add error:", err);
        res.status(500).json({ success: false, error: "Error saving to database" });
    }
});

app.put("/api/journal/edit/:id", isAuth, upload.single("media"), async (req, res) => {
    try {
        const entry = await Journal.findById(req.params.id);
        if (!entry) return res.status(404).json({ success: false, error: "Entry not found" });

        let updateData = {
            description: req.body.description,
            date: req.body.date
        };

        if (req.file) {
            const isVideo = /mp4|mov|webm/i.test(path.extname(req.file.originalname));
            updateData.filename = req.file.path; // Store the full URL
            updateData.type = isVideo ? "video" : "image";
        }

        const updated = await Journal.findByIdAndUpdate(req.params.id, updateData, { new: true });
        res.json({ success: true, entry: updated });
    } catch (err) {
        console.error("Journal edit error:", err);
        res.status(500).json({ success: false, error: "Error updating entry" });
    }
});

app.delete("/api/journal/delete/:id", isAuth, async (req, res) => {
    try {
        const entry = await Journal.findById(req.params.id);
        if (entry) {
            // Deleting from Cloudinary requires more complex setup (public_id extraction)
            // For now, we just delete the entry from the database.
            await Journal.findByIdAndDelete(req.params.id);
            return res.json({ success: true });
        }
        res.json({ success: false });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// API endpoint (JSON)
app.get("/memories", isAuth, (req, res) => {
    res.render("memories", { memories, name: req.session.username || "Bhondu" });
});

app.get("/journal", isAuth, async (req, res) => {
    try {
        const entries = await Journal.find().sort({ createdAt: -1 });
        res.render("journal", { entries, name: req.session.username || "Bhondu" });
    } catch (err) {
        console.error("Journal fetch error:", err);
        res.status(500).send("Database error");
    }
});


// ========== QUESTIONS API ==========
app.get("/api/questions", isAuth, async (req, res) => {
    try {
        const username = req.session.username || "Bhondu";
        let response = await Question.findOne({ username });
        if (!response) {
            response = new Question({ username, answers: {} });
            await response.save();
        }
        res.json(response.answers);
    } catch (err) {
        console.error("Questions fetch error:", err);
        res.status(500).json({ error: "Failed to fetch questions" });
    }
});

app.post("/api/questions/save", isAuth, async (req, res) => {
    try {
        const username = req.session.username || "Bhondu";
        const { answers } = req.body;
        await Question.findOneAndUpdate(
            { username },
            { answers, updatedAt: new Date() },
            { upsert: true, new: true }
        );
        res.json({ success: true });
    } catch (err) {
        console.error("Questions save error:", err);
        res.status(500).json({ error: "Failed to save questions" });
    }
});

// ========== EMOTIONAL PAGES (LEGACY/BACKUP) ==========
app.get("/promise", isAuth, (req, res) => res.render("promise", { name: req.session.username || "Bhondu" }));
app.get("/love-letter", isAuth, (req, res) => res.render("love-letter", { name: req.session.username || "Bhondu" }));
app.get("/questions", isAuth, (req, res) => res.render("questions", { name: req.session.username || "Bhondu" }));
app.get("/timeline", isAuth, (req, res) => res.render("timeline", { name: req.session.username || "Bhondu" }));
app.get("/reasons", isAuth, (req, res) => res.render("reasons", { name: req.session.username || "Bhondu" }));
app.get("/voice-memory", isAuth, (req, res) => res.render("voice-memory", { name: req.session.username || "Bhondu" }));
app.get("/outfit", isAuth, (req, res) => res.render("outfit", { name: req.session.username || "Bhondu" }));
app.get("/future-plans", isAuth, (req, res) => res.render("future-plans", { name: req.session.username || "Bhondu" }));
app.get("/final", isAuth, (req, res) => res.render("final", { name: req.session.username || "Bhondu" }));

// ========== CHAT SYSTEM API ==========
app.post("/api/chat/upload", isAuth, chatUpload.single("file"), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "No file uploaded" });

        let type = 'image';
        if (req.file.mimetype.includes('video')) type = 'video';
        if (req.file.mimetype.includes('audio')) type = 'audio';

        res.json({
            fileUrl: req.file.path, // Cloudinary full URL
            fileType: type
        });
    } catch (err) {
        console.error("Chat upload error:", err);
        res.status(500).json({ error: "Upload failed" });
    }
});

app.get("/api/chat/history", isAuth, async (req, res) => {
    try {
        const username = req.session.username || "Bhondu";
        const history = await Message.find({
            isDeletedForEveryone: false,
            deletedBy: { $ne: username }
        }).sort({ timestamp: 1 }).limit(100);
        res.json(history);
    } catch (err) {
        console.error("Chat history error:", err);
        res.status(500).json({ error: "Failed to fetch history" });
    }
});

app.get("/chat", isAuth, async (req, res) => {
    try {
        const username = req.session.username || "Bhondu";
        const history = await Message.find({
            isDeletedForEveryone: false,
            deletedBy: { $ne: username }
        })
            .sort({ timestamp: 1 })
            .limit(100);

        res.render("chat", { history, username });
    } catch (err) {
        console.error("Chat error:", err);
        res.status(500).send("Chat system error");
    }
});

// ========== CHAT SYSTEM API (PUSHER) ==========
app.post("/api/chat/send", isAuth, async (req, res) => {
    try {
        const { text, fileUrl, fileType, tempId } = req.body;
        const username = req.session.username || "Bhondu";

        const newMessage = new Message({
            sender: username,
            text: text || "",
            fileUrl: fileUrl || "",
            fileType: fileType || 'text'
        });

        const savedMsg = await newMessage.save();

        // Trigger Pusher Event
        await pusher.trigger("bhondu-chat", "new-message", {
            _id: savedMsg._id,
            sender: savedMsg.sender,
            text: savedMsg.text,
            fileUrl: savedMsg.fileUrl,
            fileType: savedMsg.fileType,
            timestamp: savedMsg.timestamp,
            tempId: tempId || null
        });

        res.json({ success: true, message: savedMsg });
    } catch (err) {
        console.error("Pusher send error:", err);
        res.status(500).json({ error: "Failed to send message" });
    }
});

app.post("/api/chat/delete-everyone", isAuth, async (req, res) => {
    try {
        const { msgId } = req.body;
        const msg = await Message.findById(msgId);
        if (!msg) return res.status(404).json({ error: "Message not found" });

        if (msg.sender !== (req.session.username || "Bhondu")) {
            return res.status(403).json({ error: "Unauthorized" });
        }

        await Message.findByIdAndUpdate(msgId, { isDeletedForEveryone: true });
        
        // Trigger Pusher Event
        await pusher.trigger("bhondu-chat", "message-deleted", msgId);
        
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Delete failed" });
    }
});

app.post("/api/chat/delete-me", isAuth, async (req, res) => {
    try {
        const { msgId } = req.body;
        const username = req.session.username || "Bhondu";
        await Message.findByIdAndUpdate(msgId, { $addToSet: { deletedBy: username } });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Delete failed" });
    }
});

// ========== CATCH-ALL FOR REACT ==========
// No React catch-all needed anymore

// ========== GLOBAL ERROR HANDLER ==========
app.use((err, req, res, next) => {
    console.error("💥 Server Error:", err);
    if (req.path.startsWith('/api')) {
        return res.status(500).json({ success: false, error: err.message || "Internal server error" });
    }
    res.status(500).send("Something went wrong! 💔");
});

// ========== 404 (Legacy) ==========
app.use((req, res) => {
    res.status(404).send(`<div style="text-align:center;padding:50px;background:#0a0a0a;color:white;height:100vh;"><h1 style="color:#ff4d6d;">404 💔</h1><p>Page not found</p><a href="/" style="color:#ff4d6d;">Go back home</a></div>`);
});

// ========== START ==========
const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`📡 URL: http://localhost:${PORT}`);
    });
}

module.exports = app;
