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
const User = require("./models/User");

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
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
    console.error("❌ WARNING: MONGODB_URI is missing from Environment Variables!");
}

mongoose.connect(MONGODB_URI || "mongodb://localhost:27017/birthday_db")
    .then(() => console.log("🍃 Connected to MongoDB"))
    .catch(err => {
        console.error("❌ MongoDB connection error:", err.message);
        // Do not crash the process, allow health check to run
    });

// ========== MIDDLEWARE ==========
const allowedOrigins = [
    process.env.FRONTEND_URL, 
    "https://bhondu.me",
    "http://localhost:3000",
    "http://127.0.0.1:3000"
];

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl)
        if (!origin) return callback(null, true);
        
        const isVercel = origin.endsWith('.vercel.app');
        const isCustomDomain = origin.includes('bhondu.me');
        const isLocal = origin.includes('localhost') || origin.includes('127.0.0.1');

        if (allowedOrigins.indexOf(origin) !== -1 || isVercel || isCustomDomain || isLocal) {
            return callback(null, true);
        }
        console.error(`🚫 CORS Blocked Origin: ${origin}`);
        callback(new Error('CORS not allowed'), false);
    },
    credentials: true
}));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
// Static assets are handled by Vercel routes in production.
// We only serve them manually for local development.
if (process.env.NODE_ENV !== 'production') {
    const publicDir = "public"; // Direct access at root
    app.use(express.static(path.join(__dirname, publicDir)));
}

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
        secure: process.env.NODE_ENV === 'production', // Only secure in production (Vercel)
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24 * 7, // 1 week
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
    },
    name: 'loveSessionId'
}));

app.use(async (req, res, next) => {
    res.locals.isAuthenticated = req.session.isAuth;
    res.locals.username = req.session.username || "Bhondu";
    
    // Update last seen if authenticated
    if (req.session.isAuth && req.session.username) {
        res.locals.pusherKey = process.env.PUSHER_KEY;
        res.locals.pusherCluster = process.env.PUSHER_CLUSTER;
        try {
            await User.findOneAndUpdate(
                { username: req.session.username.toLowerCase() },
                { lastSeen: new Date() },
                { upsert: true }
            );
        } catch (e) {
            console.error("Error updating last seen:", e.message);
        }
    }
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

app.get("/", isAuth, (req, res) => {
    res.render("home", {
        pusherKey: process.env.PUSHER_KEY, 
        pusherCluster: process.env.PUSHER_CLUSTER 
    });
});
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
    const history = await Message.find({ isDeletedForEveryone: false, deletedBy: { $ne: username } })
        .populate('replyTo')
        .sort({ timestamp: 1 })
        .limit(100);
    
    const user = await User.findOne({ username: username.toLowerCase() });
    const wallpaper = user ? user.chatWallpaper : '';

    res.render("chat", { 
        history, 
        username, 
        wallpaper,
        pusherKey: process.env.PUSHER_KEY, 
        pusherCluster: process.env.PUSHER_CLUSTER 
    });
});

// Helper for Link Previews
async function getLinkPreview(text) {
    if (!text) return null;
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const match = text.match(urlRegex);
    if (!match) return null;
    const url = match[0];
    try {
        const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(3000) });
        const html = await response.text();
        const title = html.match(/<meta property="og:title" content="([^"]+)"/i)?.[1] || 
                      html.match(/<title>([^<]+)<\/title>/i)?.[1];
        const description = html.match(/<meta property="og:description" content="([^"]+)"/i)?.[1];
        const image = html.match(/<meta property="og:image" content="([^"]+)"/i)?.[1];
        if (!title) return null;
        return { title, description, image, url };
    } catch (e) { return null; }
}

app.post("/api/chat/send", isAuth, async (req, res) => {
    try {
        const { text, fileUrl, fileType, tempId } = req.body;
        const linkPreview = await getLinkPreview(text);

        const newMessage = new Message({ 
            sender: req.session.username || "Bhondu", 
            text: text || "", 
            fileUrl: fileUrl || "", 
            fileType: fileType || 'text',
            replyTo: req.body.replyTo || null,
            linkPreview: linkPreview,
            timestamp: new Date()
        });
        let savedMsg = await newMessage.save();
        savedMsg = await Message.findById(savedMsg._id).populate('replyTo');
        await pusher.trigger("presence-bhondu-chat", "new-message", { ...savedMsg.toObject(), tempId: tempId || null });
        res.json({ success: true, message: savedMsg });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post("/api/chat/typing", isAuth, async (req, res) => {
    try {
        await pusher.trigger("presence-bhondu-chat", "user-typing", { 
            username: req.session.username || "Bhondu" 
        });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/chat/mark-read", isAuth, async (req, res) => {
    try {
        const username = req.session.username || "Bhondu";

        const result = await Message.updateMany(
            { sender: { $ne: username }, status: 'sent' },
            { $set: { status: 'read' } }
        );

        if (result.modifiedCount > 0) {
            await pusher.trigger("presence-bhondu-chat", "messages-read", { 
                reader: username
            });
        }
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/chat/edit", isAuth, async (req, res) => {
    try {
        const { msgId, newText } = req.body;
        const username = req.session.username || "Bhondu";
        
        const message = await Message.findById(msgId);
        if (!message) return res.status(404).json({ success: false });
        if (message.sender !== username) return res.status(403).json({ success: false });

        const linkPreview = await getLinkPreview(newText);
        
        message.text = newText;
        message.linkPreview = linkPreview;
        message.isEdited = true;
        await message.save();

        await pusher.trigger("presence-bhondu-chat", "message-edited", { 
            msgId, 
            newText, 
            linkPreview,
            isEdited: true 
        });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/chat/react", isAuth, async (req, res) => {
    try {
        const { msgId, emoji } = req.body;
        const username = req.session.username || "Bhondu";
        
        const message = await Message.findById(msgId);
        if (!message) return res.status(404).json({ success: false });

        // Find if user already reacted with this exact emoji
        const existingIndex = message.reactions.findIndex(r => r.emoji === emoji && r.username === username);

        if (existingIndex > -1) {
            // Remove reaction (toggle off)
            message.reactions.splice(existingIndex, 1);
        } else {
            // Add reaction
            message.reactions.push({ emoji, username });
        }

        await message.save();
        await pusher.trigger("presence-bhondu-chat", "message-reaction", { msgId, reactions: message.reactions });
        res.json({ success: true, reactions: message.reactions });
    } catch (err) { res.status(500).json({ success: false }); }
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
            await pusher.trigger("presence-bhondu-chat", "message-deleted", req.body.msgId);
            res.json({ success: true });
        } else {
            res.status(403).json({ success: false, error: "Not authorized" });
        }
    } catch (err) { res.status(500).json({ success: false }); }
});

// Pusher Auth
app.post("/pusher/auth", isAuth, (req, res) => {
    const socketId = req.body.socket_id;
    const channel = req.body.channel_name;
    const username = req.session.username || "Bhondu";
    
    const presenceData = {
        user_id: username.toLowerCase(),
        user_info: { name: username }
    };
    
    const authResponse = pusher.authorizeChannel(socketId, channel, presenceData);
    res.send(authResponse);
});

app.post("/api/chat/star", isAuth, async (req, res) => {
    try {
        const { msgId } = req.body;
        const username = req.session.username || "Bhondu";
        const message = await Message.findById(msgId);
        if (!message) return res.status(404).json({ success: false });

        const index = message.isStarredBy.indexOf(username);
        if (index > -1) {
            message.isStarredBy.splice(index, 1);
        } else {
            message.isStarredBy.push(username);
        }
        await message.save();
        res.json({ success: true, isStarred: message.isStarredBy.includes(username) });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/chat/delete-for-me", isAuth, async (req, res) => {
    try {
        const { msgId } = req.body;
        const username = req.session.username || "Bhondu";
        await Message.findByIdAndUpdate(msgId, { $addToSet: { deletedBy: username } });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/chat/delete-for-everyone", isAuth, async (req, res) => {
    try {
        const { msgId } = req.body;
        const username = req.session.username || "Bhondu";
        const message = await Message.findById(msgId);
        if (message.sender === username) {
            message.isDeletedForEveryone = true;
            await message.save();
            await pusher.trigger("presence-bhondu-chat", "message-deleted", msgId);
        }
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.get("/api/chat/starred", isAuth, async (req, res) => {
    try {
        const username = req.session.username || "Bhondu";
        const starred = await Message.find({ isStarredBy: username }).sort({ timestamp: -1 }).populate('replyTo');
        res.json({ success: true, starred });
    } catch (err) { res.status(500).json({ success: false }); }
});

// ========== VIDEO CALL SIGNALING ==========
app.post("/api/video/signal", isAuth, async (req, res) => {
    try {
        const { to, signal, type } = req.body;
        const from = req.session.username || "Bhondu";
        // Trigger event to the specific channel
        await pusher.trigger("presence-bhondu-chat", "video-signal", { 
            from, 
            to, 
            ...req.body 
        });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

// ========== WATCHING TOGETHER API ==========
app.post("/api/reels/watching", isAuth, async (req, res) => {
    try {
        const { reelIndex } = req.body;
        const username = req.session.username || "Bhondu";
        await pusher.trigger("presence-bhondu-chat", "user-watching-reel", { 
            username, 
            reelIndex 
        });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/reels/heart", isAuth, async (req, res) => {
    try {
        const { reelIndex } = req.body;
        const username = req.session.username || "Bhondu";
        await pusher.trigger("presence-bhondu-chat", "user-hearted-reel", { 
            username, 
            reelIndex 
        });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/reels/sync-scroll", isAuth, async (req, res) => {
    try {
        const { reelIndex } = req.body;
        const username = req.session.username || "Bhondu";
        await pusher.trigger("presence-bhondu-chat", "user-scrolled-reel", { 
            username, 
            reelIndex 
        });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/reels/poke", isAuth, async (req, res) => {
    try {
        const username = req.session.username || "Bhondu";
        await pusher.trigger("presence-bhondu-chat", "user-poked", { 
            username 
        });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/reels/comment", isAuth, async (req, res) => {
    try {
        const { reelIndex, text } = req.body;
        const username = req.session.username || "Bhondu";
        await pusher.trigger("presence-bhondu-chat", "user-reel-comment", { 
            username, 
            reelIndex, 
            text 
        });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

const reelsRouter = require('./routes/reels');
app.use('/', reelsRouter);

app.get("/api/chat/search", isAuth, async (req, res) => {
    try {
        const { q } = req.query;
        const username = req.session.username || "Bhondu";
        if (!q) return res.json({ success: true, results: [] });
        
        const results = await Message.find({
            text: { $regex: q, $options: 'i' },
            isDeletedForEveryone: false,
            deletedBy: { $ne: username }
        }).sort({ timestamp: -1 }).limit(50).populate('replyTo');
        
        res.json({ success: true, results });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.get("/api/chat/media", isAuth, async (req, res) => {
    try {
        const username = req.session.username || "Bhondu";
        const media = await Message.find({
            fileUrl: { $ne: "" },
            isDeletedForEveryone: false,
            deletedBy: { $ne: username }
        }).sort({ timestamp: -1 });
        res.json({ success: true, media });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/user/wallpaper", isAuth, async (req, res) => {
    try {
        const { wallpaperUrl } = req.body;
        const username = req.session.username || "Bhondu";
        await User.findOneAndUpdate(
            { username: username.toLowerCase() },
            { chatWallpaper: wallpaperUrl },
            { upsert: true }
        );
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.get("/api/user/status/:username", isAuth, async (req, res) => {
    try {
        const user = await User.findOne({ username: req.params.username.toLowerCase() });
        res.json({ lastSeen: user ? user.lastSeen : null });
    } catch (err) { res.status(500).json({ error: "Failed" }); }
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
    const username = (req.session.username || "Bhondu").toLowerCase();
    const q = await Question.findOne({ username });
    res.json(q ? q.answers : {});
});

app.post("/api/questions/save", isAuth, async (req, res) => {
    try {
        const username = (req.session.username || "Bhondu").toLowerCase();
        await Question.findOneAndUpdate(
            { username }, 
            { 
                answers: req.body.answers,
                updatedAt: new Date()
            }, 
            { upsert: true, new: true }
        );
        res.json({ success: true });
    } catch (err) {
        console.error("Error saving questions:", err);
        res.status(500).json({ success: false, error: "Failed to save" });
    }
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
app.get("/api/ping", (req, res) => res.send("pong root " + (process.env.NODE_ENV || "development")));
app.get("/api/health", (req, res) => res.json({ status: "alive", mongodb: mongoose.connection.readyState === 1 }));
app.use((err, req, res, next) => { 
    console.error("🔥 DETAILED ERROR LOG:", err);
    res.status(500).send("Something went wrong! 💔 Error: " + err.message); 
});


module.exports = app;

// Only start the server locally (Vercel will ignore this)
if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 3001;
    app.listen(PORT, () => {
        console.log(`🚀 Local server running at http://localhost:${PORT}`);
    });
}