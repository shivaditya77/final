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
const helmet = require("helmet");
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const webpush = require("web-push");

const app = express();

// ========== WEB PUSH CONFIG ==========
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
        process.env.VAPID_EMAIL || 'mailto:admin@bhondu.me',
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
    );
}

// ========== MODELS ==========
const Journal = require("./models/Journal");
const Question = require("./models/Question");
const Message = require("./models/Message");
const User = require("./models/User");
const Notification = require("./models/Notification");
const Subscription = require("./models/Subscription");

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
    console.error("❌ CRITICAL ERROR: MONGODB_URI is missing! Please add it to your Vercel Environment Variables.");
}

mongoose.connect(MONGODB_URI || "mongodb://localhost:27017/birthday_db")
    .then(() => console.log("🍃 Connected to MongoDB"))
    .catch(err => {
        console.error("❌ MongoDB connection error:", err.message);
    });

// ========== MIDDLEWARE ==========
app.use(cors({
    origin: true, // 1000% Assurity: Allow all origins to prevent any CORS blocks in production
    credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Security Headers
app.use(helmet({
    contentSecurityPolicy: false, // Disable CSP for now as it often breaks CDNs/inline scripts if not perfectly configured
    crossOriginEmbedderPolicy: false
}));

// Serve static files from the root public directory
const publicDir = "public"; 
app.use(express.static(path.join(__dirname, publicDir)));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.set('trust proxy', 1);

// ========== SESSION ==========
app.use(session({
    secret: process.env.SESSION_SECRET || "birthday_secret",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: MONGODB_URI || "mongodb://localhost:27017/birthday_db" }),
    cookie: {
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        maxAge: 1000 * 60 * 60 * 24 * 7 // 7 days
    }
}));

const isAuth = (req, res, next) => {
    if (req.session.isAuth) return next();
    if (req.xhr || req.path.startsWith('/api')) return res.status(401).json({ error: "Please login" });
    res.redirect("/login");
};

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
        username: req.session.username,
        pusherKey: process.env.PUSHER_KEY, 
        pusherCluster: process.env.PUSHER_CLUSTER 
    });
});

// ========== LOVE CHAT API ==========
app.get("/chat", isAuth, async (req, res) => {
    try {
        const username = req.session.username || "Bhondu";
        const history = await Message.find({ 
            deletedBy: { $ne: username },
            isDeletedForEveryone: false 
        }).sort({ timestamp: 1 }).populate('replyTo');
        
        const user = await User.findOne({ username: username.toLowerCase() });
        const wallpaper = user ? user.chatWallpaper : '';

        res.render("chat", { 
            history, 
            username,
            wallpaper,
            pusherKey: process.env.PUSHER_KEY, 
            pusherCluster: process.env.PUSHER_CLUSTER 
        });
    } catch (err) { res.status(500).send("Chat error 💔"); }
});

app.post("/api/chat/send", isAuth, async (req, res) => {
    try {
        const { text, fileUrl, fileType, replyTo, expiresAt, isSecret } = req.body;
        const sender = req.session.username || "Bhondu";
        const msg = new Message({
            sender,
            text, fileUrl, fileType, replyTo, expiresAt, isSecret
        });
        await msg.save();

        // Create Notification for recipient
        const recipient = sender.toLowerCase() === 'bhondu' ? 'vishu' : 'bhondu';
        const notif = new Notification({
            recipient, sender,
            type: fileType === 'audio' ? 'call' : 'message',
            content: text || (fileType === 'audio' ? 'Sent a voice note 🎙️' : 'Sent a photo/video 🖼️'),
            link: '/chat'
        });
        await notif.save();
        await pusher.trigger("private-notifications-" + recipient.toLowerCase(), "new-notification", notif);

        // Send Background Push
        sendWebPush(recipient, {
            title: `New message from ${sender}`,
            content: text || `Sent a ${fileType} 📎`,
            link: '/chat',
            sender: sender
        });

        const populated = await Message.findById(msg._id).populate('replyTo');
        await pusher.trigger("presence-bhondu-chat", "new-message", populated);
        res.json({ success: true, message: populated });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/chat/upload", isAuth, chatUpload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file" });
    let type = 'image';
    if (req.file.mimetype.startsWith('video')) type = 'video';
    if (req.file.mimetype.startsWith('audio')) type = 'audio';
    res.json({ fileUrl: req.file.path, fileType: type });
});

app.post("/api/chat/typing", isAuth, async (req, res) => {
    await pusher.trigger("presence-bhondu-chat", "user-typing", { username: req.session.username });
    res.json({ success: true });
});

app.post("/api/chat/mark-read", isAuth, async (req, res) => {
    const reader = req.session.username;
    await Message.updateMany({ sender: { $ne: reader }, status: 'sent' }, { status: 'read' });
    await pusher.trigger("presence-bhondu-chat", "messages-read", { reader });
    res.json({ success: true });
});

app.post("/api/chat/react", isAuth, async (req, res) => {
    try {
        const { msgId, emoji } = req.body;
        const username = req.session.username || "Bhondu";
        const message = await Message.findById(msgId);
        if (!message) return res.status(404).json({ success: false });
        const existingIndex = message.reactions.findIndex(r => r.emoji === emoji && r.username === username);
        if (existingIndex > -1) message.reactions.splice(existingIndex, 1);
        else {
            message.reactions.push({ emoji, username });
            
            // Notify recipient if they are not the sender
            if (message.sender !== username) {
                const notif = new Notification({
                    recipient: message.sender.toLowerCase(),
                    sender: username,
                    type: 'reaction',
                    content: `Reacted ${emoji} to your message`,
                    link: '/chat'
                });
                await notif.save();
                await pusher.trigger("private-notifications-" + message.sender.toLowerCase(), "new-notification", notif);
                
                // Send Background Push
                sendWebPush(message.sender, {
                    title: `New reaction ❤️`,
                    content: `${username} reacted ${emoji} to your message`,
                    link: '/chat',
                    sender: username
                });
            }
        }
        await message.save();
        await pusher.trigger("presence-bhondu-chat", "message-reaction", { msgId, reactions: message.reactions });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/chat/star", isAuth, async (req, res) => {
    try {
        const { msgId } = req.body;
        const username = req.session.username || "Bhondu";
        const msg = await Message.findById(msgId);
        if (!msg.isStarredBy) msg.isStarredBy = [];
        const idx = msg.isStarredBy.indexOf(username);
        if (idx > -1) msg.isStarredBy.splice(idx, 1);
        else msg.isStarredBy.push(username);
        await msg.save();
        res.json({ success: true, isStarred: msg.isStarredBy.includes(username) });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.get("/api/chat/starred", isAuth, async (req, res) => {
    const username = req.session.username || "Bhondu";
    const starred = await Message.find({ isStarredBy: username }).sort({ timestamp: -1 });
    res.json({ success: true, starred });
});

app.post("/api/chat/delete-for-me", isAuth, async (req, res) => {
    try {
        const username = req.session.username || "Bhondu";
        await Message.findByIdAndUpdate(req.body.msgId, { $addToSet: { deletedBy: username } });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/chat/delete-for-everyone", isAuth, async (req, res) => {
    try {
        const username = req.session.username || "Bhondu";
        const msg = await Message.findById(req.body.msgId);
        if (msg && msg.sender === username) {
            await Message.findByIdAndUpdate(req.body.msgId, { isDeletedForEveryone: true });
            await pusher.trigger("presence-bhondu-chat", "message-deleted", req.body.msgId);
            res.json({ success: true });
        } else res.status(403).json({ success: false });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/chat/edit", isAuth, async (req, res) => {
    try {
        const { msgId, newText } = req.body;
        const username = req.session.username || "Bhondu";
        const msg = await Message.findById(msgId);
        if (msg && msg.sender === username) {
            msg.text = newText;
            msg.isEdited = true;
            await msg.save();
            await pusher.trigger("presence-bhondu-chat", "message-edited", { msgId, newText });
            res.json({ success: true });
        } else res.status(403).json({ success: false });
    } catch (err) { res.status(500).json({ success: false }); }
});

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
        const username = (req.session.username || "Bhondu").toLowerCase();
        await User.findOneAndUpdate({ username }, { chatWallpaper: wallpaperUrl }, { upsert: true });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

// ========== PUSHER AUTH ==========
app.post("/pusher/auth", isAuth, (req, res) => {
    const socketId = req.body.socket_id;
    const channel = req.body.channel_name;
    const username = req.session.username || "Bhondu";
    const presenceData = { user_id: username.toLowerCase(), user_info: { name: username } };
    const authResponse = pusher.authorizeChannel(socketId, channel, presenceData);
    res.send(authResponse);
});

// ========== PUSH NOTIFICATION UTILITY ==========
async function sendWebPush(recipient, data) {
    try {
        const subscriptions = await Subscription.find({ username: recipient.toLowerCase() });
        const payload = JSON.stringify(data);
        
        const pushPromises = subscriptions.map(sub => 
            webpush.sendNotification(sub.subscription, payload)
                .catch(async (err) => {
                    if (err.statusCode === 410 || err.statusCode === 404) {
                        // Expired or invalid subscription, remove it
                        await Subscription.deleteOne({ _id: sub._id });
                    }
                })
        );
        await Promise.all(pushPromises);
    } catch (err) {
        console.error("WebPush Error:", err);
    }
}

// ========== VIDEO CALL SIGNALING ==========
app.post("/api/video/signal", isAuth, async (req, res) => {
    try {
        const { to, signal, type } = req.body;
        const from = req.session.username || "Bhondu";

        // Create notification for incoming call
        if (type === 'offer') {
             const notif = new Notification({
                recipient: to.toLowerCase(),
                sender: from,
                type: 'call',
                content: `Incoming ${req.body.isVoiceOnly ? 'Voice' : 'Video'} Call 📞`,
                link: '/chat'
            });
            await notif.save();
            await pusher.trigger("private-notifications-" + to.toLowerCase(), "new-notification", notif);
            
            // Send Background Push
            sendWebPush(to, {
                title: `Incoming Call 📞`,
                content: `${from} is calling you...`,
                link: '/chat',
                sender: from
            });
        }

        await pusher.trigger("presence-bhondu-chat", "video-signal", { from, to, ...req.body });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

// ========== NOTIFICATION API ==========
app.get("/api/notifications", isAuth, async (req, res) => {
    try {
        const username = req.session.username.toLowerCase();
        const notifications = await Notification.find({ recipient: username }).sort({ createdAt: -1 }).limit(20);
        const unreadCount = await Notification.countDocuments({ recipient: username, isRead: false });
        res.json({ success: true, notifications, unreadCount });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post("/api/notifications/read-all", isAuth, async (req, res) => {
    try {
        const username = req.session.username.toLowerCase();
        await Notification.updateMany({ recipient: username }, { isRead: true });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/notifications/mark-read", isAuth, async (req, res) => {
    try {
        await Notification.findByIdAndUpdate(req.body.id, { isRead: true });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.delete("/api/notifications/clear", isAuth, async (req, res) => {
    try {
        const username = req.session.username.toLowerCase();
        await Notification.deleteMany({ recipient: username });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/notifications/subscribe", isAuth, async (req, res) => {
    try {
        const { subscription } = req.body;
        const username = req.session.username.toLowerCase();
        
        await Subscription.findOneAndUpdate(
            { "subscription.endpoint": subscription.endpoint },
            { username, subscription },
            { upsert: true }
        );
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

// ========== WATCHING TOGETHER API ==========
app.post("/api/reels/watching", isAuth, async (req, res) => {
    try {
        const { reelIndex } = req.body;
        const username = req.session.username || "Bhondu";
        await pusher.trigger("presence-bhondu-chat", "user-watching-reel", { username, reelIndex });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/reels/comment", isAuth, async (req, res) => {
    try {
        const { reelIndex, text } = req.body;
        const username = req.session.username || "Bhondu";
        await pusher.trigger("presence-bhondu-chat", "user-reel-comment", { username, reelIndex, text });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/reels/heart", isAuth, async (req, res) => {
    try {
        const { reelIndex } = req.body;
        const username = req.session.username || "Bhondu";
        await pusher.trigger("presence-bhondu-chat", "user-hearted-reel", { username, reelIndex });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/reels/sync-scroll", isAuth, async (req, res) => {
    try {
        const { reelIndex } = req.body;
        const username = req.session.username || "Bhondu";
        await pusher.trigger("presence-bhondu-chat", "user-scrolled-reel", { username, reelIndex });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/reels/gift", isAuth, async (req, res) => {
    try {
        const { reelIndex } = req.body;
        const username = req.session.username || "Bhondu";
        await pusher.trigger("presence-bhondu-chat", "user-gifted-reel", { username, reelIndex });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/reels/play", isAuth, async (req, res) => {
    try {
        const { reelIndex, currentTime } = req.body;
        const username = req.session.username || "Bhondu";
        await pusher.trigger("presence-bhondu-chat", "user-played-reel", { username, reelIndex, currentTime });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/reels/pause", isAuth, async (req, res) => {
    try {
        const { reelIndex } = req.body;
        const username = req.session.username || "Bhondu";
        await pusher.trigger("presence-bhondu-chat", "user-paused-reel", { username, reelIndex });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/reels/seek", isAuth, async (req, res) => {
    try {
        const { reelIndex, currentTime } = req.body;
        const username = req.session.username || "Bhondu";
        await pusher.trigger("presence-bhondu-chat", "user-seeked-reel", { username, reelIndex, currentTime });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/reels/request-state", isAuth, async (req, res) => {
    try {
        const username = req.session.username || "Bhondu";
        await pusher.trigger("presence-bhondu-chat", "request-reel-state", { username });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/reels/send-state", isAuth, async (req, res) => {
    try {
        const { to, reelIndex, currentTime, isPaused } = req.body;
        const username = req.session.username || "Bhondu";
        await pusher.trigger("presence-bhondu-chat", "receive-reel-state", { username, to, reelIndex, currentTime, isPaused });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/reels/invite", isAuth, async (req, res) => {
    try {
        const username = req.session.username || "Bhondu";
        await pusher.trigger("presence-bhondu-chat", "together-invitation", { username });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

// ========== OTHER JOURNEY ROUTES ==========
const reelsRouter = require('./routes/reels');
app.use('/', reelsRouter);

app.get("/journal", isAuth, async (req, res) => {
    try {
        const entries = await Journal.find().sort({ date: -1, createdAt: -1 });
        res.render("journal", { entries });
    } catch (err) { res.status(500).send("Journal error 💔"); }
});

app.post("/api/journal/add", isAuth, upload.single('media'), async (req, res) => {
    try {
        const { description, date } = req.body;
        let type = 'text';
        if (req.file) {
            type = req.file.mimetype.startsWith('video') ? 'video' : 'image';
        }
        const entry = new Journal({
            description, date,
            filename: req.file ? req.file.path : "",
            type,
            username: req.session.username || "Bhondu"
        });
        await entry.save();
        res.json({ success: true, entry });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.put("/api/journal/edit/:id", isAuth, upload.single('media'), async (req, res) => {
    try {
        const { description, date } = req.body;
        const updateData = { description, date };
        if (req.file) {
            updateData.filename = req.file.path;
            updateData.type = req.file.mimetype.startsWith('video') ? 'video' : 'image';
        }
        await Journal.findByIdAndUpdate(req.params.id, updateData);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.delete("/api/journal/delete/:id", isAuth, async (req, res) => {
    try {
        await Journal.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

const memories = [
    { id: '01', icon: '💕', title: 'Chapter 1: The Beginning', img: '/assets/chapter1.jpeg', text: '“You know… this was the very first day after our confession...”' },
    { id: '02', icon: '✨', title: 'Chapter 2: Your First Accidental Masterpiece', img: '/assets/chapter2.jpeg', text: '“Do you remember this? 📸 The first photo of yours you sent me...”' },
    { id: '03', icon: '💖', title: 'Chapter 3: Falling for You', img: '/assets/chapter3.jpeg', text: '“Ahh… that Holi photo 🎨🌸 from our early days...”' },
    { id: '04', icon: '💑', title: 'Chapter 4: You opened up about your past so honestly', img: '/assets/chapter4.jpeg', text: '“This photo is from the day you opened up about your past so honestly. 🤍”' },
    { id: '05', icon: '😊', title: 'Chapter 5: Innocence', img: '/assets/chapter5.jpeg', text: '“In this photo, you look so innocent… 🥺”' },
    { id: '06', icon: '💪', title: 'Chapter 6: Endlessly obsessed with your photo.', img: '/assets/chapter6.jpeg', text: '“I don’t know why, but I’m so obsessed with this photo of yours… 😍”' },
    { id: '07', icon: '💖', title: 'Chapter 7: Hot Bhondu', img: '/assets/chapter7.jpeg', text: '“In this photo, you look so hot and incredibly attractive… 😍”' },
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
        await Question.findOneAndUpdate({ username }, { answers: req.body }, { upsert: true });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.get("/questions", isAuth, (req, res) => res.render("questions"));
app.get("/promise", isAuth, (req, res) => res.render("promise"));
app.get("/love-letter", isAuth, (req, res) => res.render("love-letter"));
app.get("/timeline", isAuth, (req, res) => res.render("timeline"));
app.get("/reasons", isAuth, (req, res) => res.render("reasons"));
app.get("/voice-memory", isAuth, (req, res) => res.render("voice-memory"));
app.get("/outfit", isAuth, (req, res) => res.render("outfit"));
app.get("/future-plans", isAuth, (req, res) => res.render("future-plans"));
app.get("/final", isAuth, (req, res) => res.render("final"));

// Error & Health
app.get("/api/ping", (req, res) => res.send("pong root production final"));
app.get("/api/health", (req, res) => res.json({ status: "alive", mongodb: mongoose.connection.readyState === 1 }));
app.use((err, req, res, next) => { 
    console.error("🔥 DETAILED ERROR LOG:", err);
    res.status(500).send("Something went wrong! 💔 Error: " + err.message); 
});

// Only start the server locally (Vercel will ignore this)
if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 3001;
    app.listen(PORT, () => {
        console.log(`🚀 Local server running at http://localhost:${PORT}`);
    });
}

module.exports = app;