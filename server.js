require("dotenv").config();

// Global Error Handlers for Vercel Debugging
process.on('uncaughtException', (err) => {
    console.error('🔥 CRITICAL UNCAUGHT EXCEPTION:', err);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('🔥 CRITICAL UNHANDLED REJECTION:', reason);
});

const express = require("express");
const cors = require("cors");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const mongoose = require("mongoose");
const Pusher = require("pusher");
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const app = express();

// ========== MODELS ==========
const Journal = require("./models/Journal");
const Question = require("./models/Question");
const Message = require("./models/Message");

// ========== CONFIGURATIONS ==========
const pusher = new Pusher({
    appId: process.env.PUSHER_APP_ID,
    key: process.env.PUSHER_KEY,
    secret: process.env.PUSHER_SECRET,
    cluster: process.env.PUSHER_CLUSTER,
    useTLS: true
});

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// ========== MONGODB ==========
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/birthday_db";
mongoose.connect(MONGODB_URI)
    .then(() => console.log("🍃 Connected to MongoDB"))
    .catch(err => console.error("❌ MongoDB connection error:", err));

// ========== MIDDLEWARE ==========
const allowedOrigins = [
    process.env.FRONTEND_URL, 
    "http://localhost:3000",
    "http://127.0.0.1:3000"
];

app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        const isVercel = origin.endsWith('.vercel.app');
        if (allowedOrigins.indexOf(origin) !== -1 || isVercel || origin.includes('localhost')) {
            return callback(null, true);
        }
        callback(new Error('CORS not allowed'), false);
    },
    credentials: true
}));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.set('trust proxy', 1);

// ========== SESSION ==========
let sessionStore = MongoStore.create({
    mongoUrl: MONGODB_URI,
    ttl: 14 * 24 * 60 * 60
});

app.use(session({
    secret: process.env.SESSION_SECRET || 'love-secret',
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
        secure: true,
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24,
        sameSite: 'none'
    },
    name: 'loveSessionId'
}));

app.use((req, res, next) => {
    res.locals.isAuthenticated = req.session.isAuth;
    res.locals.username = req.session.username || "Bhondu";
    next();
});

function isAuth(req, res, next) {
    if (req.session.isAuth) return next();
    if (req.xhr || req.path.startsWith('/api')) return res.status(401).json({ error: "Please login" });
    res.redirect("/login");
}

// ========== STORAGE ==========
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: { folder: 'journal_memories', resource_type: 'auto' }
});
const upload = multer({ storage });

const chatStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: { folder: 'chat_uploads', resource_type: 'auto' }
});
const chatUpload = multer({ storage: chatStorage });

// ========== ROUTES ==========
const authRoutes = require("./routes/auth");
app.use("/", authRoutes);

app.get("/", isAuth, (req, res) => res.render("home"));
app.get("/login", (req, res) => {
    if (req.session.isAuth) return res.redirect("/");
    res.render("login", { error: req.session.error });
    req.session.error = null;
});

// Journal API
app.get("/journal", isAuth, async (req, res) => {
    try {
        const entries = await Journal.find().sort({ createdAt: -1 });
        res.render("journal", { entries, name: req.session.username || "Bhondu" });
    } catch (err) { res.status(500).send("Error"); }
});

app.get("/api/journal", isAuth, async (req, res) => {
    const entries = await Journal.find().sort({ createdAt: -1 });
    res.json({ entries, name: req.session.username || "Bhondu" });
});

app.post("/api/journal/add", isAuth, upload.single("media"), async (req, res) => {
    try {
        const newEntry = new Journal({
            filename: req.file ? req.file.path : "",
            type: req.file && /mp4|mov|webm/i.test(path.extname(req.file.originalname)) ? "video" : (req.file ? "image" : "text"),
            description: req.body.description || "",
            date: req.body.date || new Date().toISOString().split("T")[0]
        });
        await newEntry.save();
        res.json({ success: true, entry: newEntry });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.put("/api/journal/edit/:id", isAuth, upload.single("media"), async (req, res) => {
    try {
        const updateData = {
            description: req.body.description,
            date: req.body.date
        };
        if (req.file) {
            updateData.filename = req.file.path;
            updateData.type = /mp4|mov|webm/i.test(path.extname(req.file.originalname)) ? "video" : "image";
        }
        await Journal.findByIdAndUpdate(req.params.id, updateData);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.delete("/api/journal/delete/:id", isAuth, async (req, res) => {
    try {
        await Journal.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Chat API
app.get("/chat", isAuth, async (req, res) => {
    const username = req.session.username || "Bhondu";
    const history = await Message.find({ isDeletedForEveryone: false, deletedBy: { $ne: username } }).sort({ timestamp: 1 }).limit(100);
    res.render("chat", { history, username, pusherKey: process.env.PUSHER_KEY, pusherCluster: process.env.PUSHER_CLUSTER });
});

app.post("/api/chat/send", isAuth, async (req, res) => {
    try {
        const { text, fileUrl, fileType, tempId } = req.body;
        const newMessage = new Message({ 
            sender: req.session.username || "Bhondu", 
            text: text || "", 
            fileUrl: fileUrl || "", 
            fileType: fileType || 'text',
            timestamp: new Date()
        });
        const savedMsg = await newMessage.save();
        await pusher.trigger("bhondu-chat", "new-message", { ...savedMsg.toObject(), tempId: tempId || null });
        res.json({ success: true, message: savedMsg });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post("/api/chat/upload", isAuth, chatUpload.single("file"), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file" });
    let type = 'image';
    if (req.file.mimetype.includes('video')) type = 'video';
    if (req.file.mimetype.includes('audio')) type = 'audio';
    res.json({ fileUrl: req.file.path, fileType: type });
});

app.post("/api/chat/delete-me", isAuth, async (req, res) => {
    try {
        const username = req.session.username || "Bhondu";
        await Message.findByIdAndUpdate(req.body.msgId, { $addToSet: { deletedBy: username } });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/chat/delete-everyone", isAuth, async (req, res) => {
    try {
        const msg = await Message.findById(req.body.msgId);
        if (msg.sender === (req.session.username || "Bhondu")) {
            await Message.findByIdAndUpdate(req.body.msgId, { isDeletedForEveryone: true });
            await pusher.trigger("bhondu-chat", "message-deleted", req.body.msgId);
            res.json({ success: true });
        } else {
            res.status(403).json({ success: false, error: "Not authorized" });
        }
    } catch (err) { res.status(500).json({ success: false }); }
});

// Memories & Others
const memories = [
    { id: '01', icon: '💕', title: 'Chapter 1: The Beginning', img: '/assets/chapter1.jpeg', text: '“You know… this was the very first day after our confession...”' },
    { id: '02', icon: '✨', title: 'Chapter 2: Your First Accidental Masterpiece', img: '/assets/chapter2.jpeg', text: '“Do you remember this? 📸 The first photo of yours you sent me...”' },
    { id: '03', icon: '💖', title: 'Chapter 3: Falling for You', img: '/assets/chapter3.jpeg', text: '“Ahh… that Holi photo 🎨🌸 from our early days...”' },
    { id: '04', icon: '💑', title: 'Chapter 4: You opened up about your past so honestly', img: '/assets/chapter4.jpeg', text: '“This photo is from the day you opened up about your past so honestly. 🤍”' },
    { id: '05', icon: '😊', title: 'Chapter 5: Innocence', img: '/assets/chapter5.jpeg', text: '“In this photo, you look so innocent… 🥺”' },
    { id: '06', icon: '💪', title: 'Chapter 6: Endlessly obsessed with your photo.', img: '/assets/chapter6.jpeg', text: '“I don’t know why, but I’m so obsessed with this photo of yours… 😍”' },
    { id: '07', icon: '🎵', title: 'Chapter 7: Hot Bhondu', img: '/assets/chapter7.jpeg', text: '“In this photo, you look so hot and incredibly attractive… 😍”' },
    { id: '08', icon: '🌟', title: 'Chapter 8: Just one photo of us, yet it means everything to me.✨', img: '/assets/chapter8.jpeg', text: '“Even if this is the only photo we have together...”' },
    { id: '09', icon: '💘', title: 'Chapter 9: Maybe unnoticed… but never unmeant.', video: '/assets/chapter9.mp4', text: '“Yes, bhondu… I truly loved that you sent me a cake 🎂...”' }
];

app.get("/memories", isAuth, (req, res) => res.render("memories", { memories, name: req.session.username || "Bhondu" }));
app.get("/api/questions", isAuth, async (req, res) => {
    const q = await Question.findOne({ username: req.session.username || "Bhondu" });
    res.json(q ? q.answers : {});
});
app.post("/api/questions/save", isAuth, async (req, res) => {
    await Question.findOneAndUpdate({ username: req.session.username || "Bhondu" }, { answers: req.body.answers }, { upsert: true });
    res.json({ success: true });
});

// Other Pages
app.get("/promise", isAuth, (req, res) => res.render("promise"));
app.get("/love-letter", isAuth, (req, res) => res.render("love-letter"));
app.get("/questions", isAuth, (req, res) => res.render("questions"));
app.get("/timeline", isAuth, (req, res) => res.render("timeline"));
app.get("/reasons", isAuth, (req, res) => res.render("reasons"));
app.get("/voice-memory", isAuth, (req, res) => res.render("voice-memory"));
app.get("/outfit", isAuth, (req, res) => res.render("outfit"));
app.get("/future-plans", isAuth, (req, res) => res.render("future-plans"));
app.get("/final", isAuth, (req, res) => res.render("final"));

// Error & Health
app.get("/api/health", (req, res) => res.json({ status: "alive", mongodb: mongoose.connection.readyState === 1 }));
app.use((err, req, res, next) => { console.error(err); res.status(500).send("Something went wrong! 💔"); });

module.exports = app;