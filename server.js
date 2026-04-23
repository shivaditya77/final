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

// Journal
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
    } catch (err) { res.status(500).json({ success: false }); }
});

// Chat
app.get("/chat", isAuth, async (req, res) => {
    const username = req.session.username || "Bhondu";
    const history = await Message.find({ isDeletedForEveryone: false, deletedBy: { $ne: username } }).sort({ timestamp: 1 }).limit(100);
    res.render("chat", { history, username, pusherKey: process.env.PUSHER_KEY, pusherCluster: process.env.PUSHER_CLUSTER });
});

app.post("/api/chat/send", isAuth, async (req, res) => {
    const { text, fileUrl, fileType, tempId } = req.body;
    const newMessage = new Message({ sender: req.session.username || "Bhondu", text: text || "", fileUrl: fileUrl || "", fileType: fileType || 'text' });
    const savedMsg = await newMessage.save();
    await pusher.trigger("bhondu-chat", "new-message", { ...savedMsg.toObject(), tempId: tempId || null });
    res.json({ success: true, message: savedMsg });
});

app.post("/api/chat/upload", isAuth, chatUpload.single("file"), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file" });
    let type = 'image';
    if (req.file.mimetype.includes('video')) type = 'video';
    if (req.file.mimetype.includes('audio')) type = 'audio';
    res.json({ fileUrl: req.file.path, fileType: type });
});

// Memories & Others
const memories = [
    { id: '01', icon: '💕', title: 'Chapter 1: The Beginning', img: '/assets/chapter1.jpeg', text: '“You know… this was the very first day after our confession, when you went to the mall. You clicked this photo for me, and ever since then, it has become one of the most special memories I hold close to my heart.” ❤️' },
    { id: '02', icon: '✨', title: 'Chapter 2: Your First Accidental Masterpiece', img: '/assets/chapter2.jpeg', text: '“Do you remember this? 📸 The first photo of yours you sent me—by mistake. 🤭 For a moment, I was so happy, thinking you were already sharing something so special with me. 💖 Even though it was unintentional, it became one of those early memories I’ll always treasure. ✨❤️”' },
    { id: '03', icon: '💖', title: 'Chapter 3: Falling for You', img: '/assets/chapter3.jpeg', text: '“Ahh… that Holi photo 🎨🌸 from our early days… oh my God, you looked so beautiful that day. 🥺✨ That was the moment I realized I have the most beautiful girlfriend in the entire world. 💖🌍”' },
    { id: '04', icon: '💑', title: 'Chapter 4: You opened up about your past so honestly', img: '/assets/chapter4.jpeg', text: '“This photo is from the day you opened up about your past so honestly. 🤍 That honesty made me love you even more… because you’re not only beautiful by face, but by heart too. 💖✨”' },
    { id: '05', icon: '😊', title: 'Chapter 5: Innocence', img: '/assets/chapter5.jpeg', text: '“In this photo, you look so innocent… 🥺 Anyone could fall in love with you at just one glance. You’re so beautiful, so pure—it’s all visible right on your face. 💖✨”' },
    { id: '06', icon: '💪', title: 'Chapter 6: Endlessly obsessed with your photo.', img: '/assets/chapter6.jpeg', text: '“I don’t know why, but I’m so obsessed with this photo of yours… 😍 Those beautiful eyes pull me in like a magnet. 🧲✨ And those specs—oh my God, they suit your face so perfectly. 🤓💖 Your lips are just perfectly shaped… everything about this picture has me completely, deeply obsessed. ✨❤️”' },
    { id: '07', icon: '🎵', title: 'Chapter 7: Hot Bhondu', img: '/assets/chapter7.jpeg', text: '“In this photo, you look so hot and incredibly attractive… 😍 And that’s when I realized—you’re not just innocent and cute… you’re a whole different level. 😏✨ You’re a complete package, honestly. 💖 Just thinking about it makes me realize how lucky I am to have you. ❤️”' },
    { id: '08', icon: '🌟', title: 'Chapter 8: Just one photo of us, yet it means everything to me.✨', img: '/assets/chapter8.jpeg', text: '“Even if this is the only photo we have together, and even if we don’t look perfect in it… the memory behind it means more to me than a thousand beautiful pictures. 🥺💖 This photo was taken at a moment when I truly felt we might never meet again… but today, here I am, making a whole website just for you and expressing everything I couldn’t say back then. ✨❤️ Thank God for this journey… and thank you, my dearest bhondu, for being in my life. 💫💕”' },
    { id: '09', icon: '💘', title: 'Chapter 9: Maybe unnoticed… but never unmeant.', video: '/assets/chapter9.mp4', text: '“Yes, bhondu… I truly loved that you sent me a cake 🎂 and brownies 🍫, it meant a lot to me. But that doesn’t mean I only valued the material things you did for me. 🥺🤍 That video and playlist you made for me are just as special—just as meaningful as everything else. 🎶💖 I’m really sorry I never expressed it before… so I’m saying it here, directly to you. I’m sorry, bhondu. 💔✨ And honestly, more than anything… it was you being there for me on my birthday that became the most beautiful gift of my life. 🎁❤️ It’s a memory I’ll carry with me forever. 💫 Once again, I’m sorry I never mentioned it… but please remember—those efforts may have gone unnoticed, but they were never unmeant. 🤍✨ I love you, my dearest bhondu. ❤️💖”' }
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

// Legacy Pages
app.get("/promise", isAuth, (req, res) => res.render("promise"));
app.get("/love-letter", isAuth, (req, res) => res.render("love-letter"));
app.get("/questions", isAuth, (req, res) => res.render("questions"));
app.get("/timeline", isAuth, (req, res) => res.render("timeline"));
app.get("/reasons", isAuth, (req, res) => res.render("reasons"));
app.get("/voice-memory", isAuth, (req, res) => res.render("voice-memory"));
app.get("/outfit", isAuth, (req, res) => res.render("outfit"));
app.get("/future-plans", isAuth, (req, res) => res.render("future-plans"));
app.get("/final", isAuth, (req, res) => res.render("final"));

// Error
app.get("/api/health", (req, res) => res.json({ status: "alive", mongodb: mongoose.connection.readyState === 1 }));
app.use((err, req, res, next) => { console.error(err); res.status(500).send("Something went wrong! 💔"); });

module.exports = app;