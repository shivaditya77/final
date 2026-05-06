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
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;


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
const CricketGame = require("./models/CricketGame");


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

// ========== PUSHER HEALTH CHECK ==========
if (!process.env.PUSHER_KEY || !process.env.PUSHER_APP_ID) {
    console.error("🔥 CRITICAL: Pusher credentials missing! Chat will NOT work.");
} else {
    console.log("✅ Pusher credentials detected for cluster:", process.env.PUSHER_CLUSTER);
}

// ========== MONGODB ==========
const MONGODB_URI = process.env.MONGODB_URI;
function connectDB() {
    if (!MONGODB_URI) {
        console.error("❌ CRITICAL ERROR: MONGODB_URI is missing!");
        return;
    }
    mongoose.connect(MONGODB_URI)
        .then(() => console.log("🍃 Connected to MongoDB"))
        .catch(err => console.error("❌ MongoDB connection error:", err.message));
}
connectDB();

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

// ========== PASSPORT CONFIG ==========
app.use(passport.initialize());
app.use(passport.session());

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "/auth/google/callback",
    proxy: true
}, (accessToken, refreshToken, profile, done) => {
    const email = profile.emails[0].value.toLowerCase();
    let username = null;

    if (email === process.env.VISHU_EMAIL.toLowerCase()) username = "Vishu";
    else if (email === process.env.BHONDU_EMAIL.toLowerCase()) username = "Bhondu";

    if (username) {
        return done(null, { username, email });
    } else {
        return done(null, false, { message: "Access Denied: Not an authorized user." });
    }
}));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));


// Global locals for Pusher/Auth
app.use(async (req, res, next) => {
    res.locals.pusherKey = process.env.PUSHER_KEY || "";
    res.locals.pusherCluster = process.env.PUSHER_CLUSTER || "ap2";
    res.locals.username = req.session.username || "";

    // Update Last Seen for authenticated users
    if (req.session.isAuth && req.session.username) {
        try {
            await User.findOneAndUpdate(
                { username: req.session.username.toLowerCase() },
                { lastSeen: new Date() },
                { upsert: true }
            );
        } catch (e) { /* ignore */ }
    }
    next();
});

const isAuth = (req, res, next) => {
    if (req.session.isAuth) return next();
    if (req.xhr || req.path.startsWith('/api') || req.path.startsWith('/pusher')) {
        return res.status(401).json({ error: "Please login" });
    }
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

        const otherUser = username.toLowerCase() === 'bhondu' ? 'Vishu' : 'Bhondu';

        res.render("chat", {
            history,
            username,
            otherUser,
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
        await pusher.trigger("presence-soul-connect", "new-message", populated);
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
    await pusher.trigger("presence-soul-connect", "user-typing", { username: req.session.username });
    res.json({ success: true });
});

app.post("/api/chat/mark-read", isAuth, async (req, res) => {
    const reader = req.session.username;
    await Message.updateMany({ sender: { $ne: reader }, status: 'sent' }, { status: 'read' });
    await pusher.trigger("presence-soul-connect", "messages-read", { reader });
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
        await pusher.trigger("presence-soul-connect", "message-reaction", { msgId, reactions: message.reactions });
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
            await pusher.trigger("presence-soul-connect", "message-deleted", req.body.msgId);
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
            await pusher.trigger("presence-soul-connect", "message-edited", { msgId, newText });
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
    try {
        const socketId = req.body.socket_id;
        const channel = req.body.channel_name;
        const username = req.session.username || "Bhondu";

        const presenceData = {
            user_id: username.toLowerCase(),
            user_info: { name: username }
        };

        const authResponse = pusher.authorizeChannel(socketId, channel, presenceData);
        console.log("📡 Auth Response Generated:", authResponse);
        res.setHeader('Content-Type', 'application/json');
        res.status(200).send(JSON.stringify(authResponse));
    } catch (err) {
        console.error("🔥 Pusher Auth Exception:", err.message);
        res.status(403).send("Forbidden");
    }
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

        await pusher.trigger("presence-soul-connect", "video-signal", { from, to, ...req.body });
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

// ========== USER STATUS API ==========
app.get("/api/user/status/:username", isAuth, async (req, res) => {
    try {
        const user = await User.findOne({ username: req.params.username.toLowerCase() });
        if (!user) return res.json({ lastSeen: null });
        res.json({ lastSeen: user.lastSeen });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/user/heartbeat", isAuth, async (req, res) => {
    try {
        await User.findOneAndUpdate(
            { username: req.session.username.toLowerCase() },
            { lastSeen: new Date() }
        );
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
        await pusher.trigger("presence-soul-connect", "user-watching-reel", { username, reelIndex });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/reels/comment", isAuth, async (req, res) => {
    try {
        const { reelIndex, text } = req.body;
        const username = req.session.username || "Bhondu";
        await pusher.trigger("presence-soul-connect", "user-reel-comment", { username, reelIndex, text });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/reels/heart", isAuth, async (req, res) => {
    try {
        const { reelIndex } = req.body;
        const username = req.session.username || "Bhondu";
        await pusher.trigger("presence-soul-connect", "user-hearted-reel", { username, reelIndex });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/reels/sync-scroll", isAuth, async (req, res) => {
    try {
        const { reelIndex } = req.body;
        const username = req.session.username || "Bhondu";
        await pusher.trigger("presence-soul-connect", "user-scrolled-reel", { username, reelIndex });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/reels/gift", isAuth, async (req, res) => {
    try {
        const { reelIndex } = req.body;
        const username = req.session.username || "Bhondu";
        await pusher.trigger("presence-soul-connect", "user-gifted-reel", { username, reelIndex });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/reels/play", isAuth, async (req, res) => {
    try {
        const { reelIndex, currentTime } = req.body;
        const username = req.session.username || "Bhondu";
        await pusher.trigger("presence-soul-connect", "user-played-reel", { username, reelIndex, currentTime });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/reels/pause", isAuth, async (req, res) => {
    try {
        const { reelIndex } = req.body;
        const username = req.session.username || "Bhondu";
        await pusher.trigger("presence-soul-connect", "user-paused-reel", { username, reelIndex });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/reels/seek", isAuth, async (req, res) => {
    try {
        const { reelIndex, currentTime } = req.body;
        const username = req.session.username || "Bhondu";
        await pusher.trigger("presence-soul-connect", "user-seeked-reel", { username, reelIndex, currentTime });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/reels/request-state", isAuth, async (req, res) => {
    try {
        const username = req.session.username || "Bhondu";
        await pusher.trigger("presence-soul-connect", "request-reel-state", { username });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/reels/send-state", isAuth, async (req, res) => {
    try {
        const { to, reelIndex, currentTime, isPaused } = req.body;
        const username = req.session.username || "Bhondu";
        await pusher.trigger("presence-soul-connect", "receive-reel-state", { username, to, reelIndex, currentTime, isPaused });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/reels/force-sync", isAuth, async (req, res) => {
    try {
        const { leader, reelIndex, currentTime, isPaused } = req.body;
        const username = req.session.username || "Bhondu";
        await pusher.trigger("presence-soul-connect", "force-sync", { leader, reelIndex, currentTime, isPaused });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/reels/invite", isAuth, async (req, res) => {
    try {
        const username = req.session.username || "Bhondu";
        await pusher.trigger("presence-soul-connect", "together-invitation", { username });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

// ========== YOUTUBE WATCH TOGETHER API ==========
const CinemaItem = require('./models/CinemaItem');

app.get("/watch-together", isAuth, async (req, res) => {
    try {
        const favorites = await CinemaItem.find({ type: 'favorite' }).sort({ createdAt: -1 }).limit(10);
        const history = await CinemaItem.find({ type: 'history' }).sort({ createdAt: -1 }).limit(10);

        res.render("watch-together", {
            username: req.session.username,
            pusherKey: process.env.PUSHER_KEY,
            pusherCluster: process.env.PUSHER_CLUSTER,
            youtubeApiKey: process.env.YOUTUBE_API_KEY || "",
            savedFavorites: favorites,
            savedHistory: history
        });
    } catch (err) {
        res.render("watch-together", {
            username: req.session.username,
            pusherKey: process.env.PUSHER_KEY,
            pusherCluster: process.env.PUSHER_CLUSTER,
            youtubeApiKey: process.env.YOUTUBE_API_KEY || "",
            savedFavorites: [],
            savedHistory: []
        });
    }
});

app.post("/api/cinema/save", isAuth, async (req, res) => {
    try {
        const { videoId, title, thumbnail, type, playlistName } = req.body;

        // If it's history, check if it already exists and update timestamp
        if (type === 'history') {
            await CinemaItem.findOneAndDelete({ videoId, type: 'history' });
        }

        const newItem = new CinemaItem({
            videoId, title, thumbnail, type, playlistName,
            addedBy: req.session.username
        });
        await newItem.save();
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/youtube/sync", isAuth, async (req, res) => {
    try {
        const { action, videoId, currentTime, state } = req.body;
        const username = req.session.username || "Bhondu";

        // Broadcast the action to the other user
        await pusher.trigger("presence-soul-connect", "youtube-sync", {
            username,
            action, // 'play', 'pause', 'seek', 'load'
            videoId,
            currentTime,
            state
        });

        res.json({ success: true });
    } catch (err) {
        console.error("YouTube Sync Error:", err);
        res.status(500).json({ success: false });
    }
});

app.post("/api/youtube/chat", isAuth, async (req, res) => {
    try {
        const { text } = req.body;
        const username = req.session.username || "Bhondu";
        await pusher.trigger("presence-soul-connect", "youtube-chat", { username, text });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/youtube/chat-message", isAuth, async (req, res) => {
    try {
        const { text } = req.body;
        const username = req.session.username || "Bhondu";
        await pusher.trigger("presence-soul-connect", "youtube-chat-message", { username, text });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

// ========== OTHER JOURNEY ROUTES ==========
const reelsRouter = require('./routes/reels');
app.use('/', reelsRouter);

// ========== GAMES SECTION ==========
app.get("/games", isAuth, (req, res) => {
    res.render("games", { username: req.session.username });
});

app.get("/games/ttt", isAuth, (req, res) => {
    res.render("game-ttt", {
        username: req.session.username,
        otherUser: (req.session.username || "Bhondu").toLowerCase() === 'bhondu' ? 'Vishu' : 'Bhondu'
    });
});

app.get("/games/heart-seeker", isAuth, (req, res) => {
    res.render("game-heart-seeker", {
        username: req.session.username,
        otherUser: (req.session.username || "Bhondu").toLowerCase() === 'bhondu' ? 'Vishu' : 'Bhondu'
    });
});

app.get("/games/sps", isAuth, (req, res) => {
    res.render("game-sps", {
        username: req.session.username,
        otherUser: (req.session.username || "Bhondu").toLowerCase() === 'bhondu' ? 'Vishu' : 'Bhondu',
        pusherKey: process.env.PUSHER_KEY,
        pusherCluster: process.env.PUSHER_CLUSTER
    });
});

app.get("/games/snake", isAuth, (req, res) => {
    res.render("game-snake", {
        username: req.session.username,
        otherUser: (req.session.username || "Bhondu").toLowerCase() === 'bhondu' ? 'Vishu' : 'Bhondu',
        pusherKey: process.env.PUSHER_KEY,
        pusherCluster: process.env.PUSHER_CLUSTER
    });
});

app.get("/games/cricket", isAuth, (req, res) => {
    res.render("game-cricket", {
        username: req.session.username,
        otherUser: (req.session.username || "Bhondu").toLowerCase() === 'bhondu' ? 'Vishu' : 'Bhondu',
        pusherKey: process.env.PUSHER_KEY,
        pusherCluster: process.env.PUSHER_CLUSTER
    });
});



// API for Tic Tac Toe sync
app.post("/api/games/ttt/move", isAuth, async (req, res) => {
    try {
        const { index, symbol, to } = req.body;
        const from = req.session.username || "Bhondu";
        await pusher.trigger("private-notifications-" + to.toLowerCase(), "ttt-move", { index, symbol, from });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/games/ttt/reset", isAuth, async (req, res) => {
    try {
        const { to } = req.body;
        const from = req.session.username || "Bhondu";
        await pusher.trigger("private-notifications-" + to.toLowerCase(), "ttt-reset", { from });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

// API for Heart Seeker sync
app.post("/api/games/heart-seeker/hide", isAuth, async (req, res) => {
    try {
        const { to } = req.body;
        const from = req.session.username || "Bhondu";
        await pusher.trigger("private-notifications-" + to.toLowerCase(), "heart-seeker-ready", { from });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/games/heart-seeker/attack", isAuth, async (req, res) => {
    try {
        const { index, to } = req.body;
        const from = req.session.username || "Bhondu";
        await pusher.trigger("private-notifications-" + to.toLowerCase(), "heart-seeker-attack", { index, from });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/games/heart-seeker/result", isAuth, async (req, res) => {
    try {
        const { index, isHit, to } = req.body;
        const from = req.session.username || "Bhondu";
        await pusher.trigger("private-notifications-" + to.toLowerCase(), "heart-seeker-result", { index, isHit, from });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/games/heart-seeker/reset", isAuth, async (req, res) => {
    try {
        const { to } = req.body;
        const from = req.session.username || "Bhondu";
        await pusher.trigger("private-notifications-" + to.toLowerCase(), "heart-seeker-reset", { from });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/games/heart-seeker/sync-request", isAuth, async (req, res) => {
    try {
        const { to } = req.body;
        const from = req.session.username || "Bhondu";
        // Send to the other user's notification channel
        await pusher.trigger("private-notifications-" + to.toLowerCase(), "heart-seeker-sync-request", { from });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/games/heart-seeker/sync-response", isAuth, async (req, res) => {
    try {
        const { to, phase, isReady } = req.body;
        const from = req.session.username || "Bhondu";
        await pusher.trigger("private-notifications-" + to.toLowerCase(), "heart-seeker-sync-response", { from, phase, isReady });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

// API for Stone Paper Scissors sync
app.post("/api/games/sps/move", isAuth, async (req, res) => {
    try {
        const { move, to } = req.body;
        const from = req.session.username || "Bhondu";
        await pusher.trigger("private-notifications-" + to.toLowerCase(), "sps-move", { move, from });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/games/sps/reset", isAuth, async (req, res) => {
    try {
        const { to } = req.body;
        const from = req.session.username || "Bhondu";
        await pusher.trigger("private-notifications-" + to.toLowerCase(), "sps-reset", { from });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

// API for Snake & Ladders sync
app.post("/api/games/snake/roll", isAuth, async (req, res) => {
    try {
        const { dice, path, finalPos, seq, to } = req.body;
        const from = req.session.username || "Bhondu";
        // Forward full roll payload so opponent can animate the pawn correctly
        await pusher.trigger("private-notifications-" + to.toLowerCase(), "snake-roll", { dice, path, finalPos, seq, from });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/games/snake/move", isAuth, async (req, res) => {
    try {
        const { fromPos, toPos, to } = req.body;
        const from = req.session.username || "Bhondu";
        await pusher.trigger("private-notifications-" + to.toLowerCase(), "snake-move", { fromPos, toPos, from });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/games/snake/reset", isAuth, async (req, res) => {
    try {
        const { to } = req.body;
        const from = req.session.username || "Bhondu";
        await pusher.trigger("private-notifications-" + to.toLowerCase(), "snake-reset", { from });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

// AUTHORITATIVE CRICKET ROUTES
const getCricketId = (u1, u2) => `cricket-${[u1.toLowerCase(), u2.toLowerCase()].sort().join('-')}`;

app.get("/api/games/cricket/state", isAuth, async (req, res) => {
    try {
        const { otherUser } = req.query;
        const from = req.session.username || "Bhondu";
        const gameId = getCricketId(from, otherUser);
        let game = await CricketGame.findOne({ gameId });
        if (!game) {
            const players = [
                { username: from, score: 0, isBatting: false },
                { username: otherUser, score: 0, isBatting: false }
            ];
            // Randomly shuffle so either player can be the toss caller
            if (Math.random() > 0.5) players.reverse();

            game = new CricketGame({
                gameId,
                status: 'toss',
                players: players
            });
            await game.save();
        }
        res.json({ success: true, game });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/games/cricket/toss", isAuth, async (req, res) => {
    try {
        const { to, choice } = req.body; // choice: 1 for Heads, 2 for Tails
        const from = req.session.username || "Bhondu";
        const gameId = getCricketId(from, to);
        let game = await CricketGame.findOne({ gameId });

        if (!game || game.status !== 'toss') return res.status(400).json({ error: "Invalid state" });

        const result = Math.floor(Math.random() * 2) + 1; // 1: Heads, 2: Tails
        const p1 = game.players[0];
        const p2 = game.players[1];

        // P1 always calls in this version
        const winner = (choice === result) ? p1.username : p2.username;

        game.status = 'choosing';
        game.tossWinner = winner;
        game.lastMove = { result: 'toss', bowlerRun: result };
        await game.save();

        // Broadcast TO BOTH that the toss has started and give the result
        // We trigger to the other user as usual, and return to the caller
        await pusher.trigger(`private-notifications-${to.toLowerCase()}`, "cricket-toss-started", { game, choice });
        res.json({ success: true, game, choice });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/games/cricket/choose", isAuth, async (req, res) => {
    try {
        const { to, choice } = req.body; // 'bat' or 'bowl'
        const from = req.session.username || "Bhondu";
        const gameId = getCricketId(from, to);
        let game = await CricketGame.findOne({ gameId });

        if (!game || game.status !== 'choosing' || game.tossWinner.toLowerCase() !== from.toLowerCase()) {
            return res.status(400).json({ error: "Not your choice" });
        }

        const p1 = game.players[0];
        const p2 = game.players[1];

        if (choice === 'bat') {
            const winner = p1.username.toLowerCase() === from.toLowerCase() ? p1 : p2;
            const loser = p1.username.toLowerCase() === from.toLowerCase() ? p2 : p1;
            winner.isBatting = true;
            loser.isBatting = false;
        } else {
            const winner = p1.username.toLowerCase() === from.toLowerCase() ? p1 : p2;
            const loser = p1.username.toLowerCase() === from.toLowerCase() ? p2 : p1;
            winner.isBatting = false;
            loser.isBatting = true;
        }

        game.status = 'playing';
        game.tossChoice = choice;
        await game.save();

        await pusher.trigger(`private-notifications-${to.toLowerCase()}`, "cricket-ball", { game });
        res.json({ success: true, game });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/games/cricket/pick", isAuth, async (req, res) => {
    try {
        const { to, run } = req.body;
        const from = req.session.username || "Bhondu";
        const gameId = getCricketId(from, to);

        // 1. Find game and determine which player is moving
        let game = await CricketGame.findOne({ gameId });
        if (!game || game.status !== 'playing') return res.status(400).json({ error: "Game not in progress" });

        const isPlayer1 = game.players[0].username.toLowerCase() === from.toLowerCase();
        const updateField = isPlayer1 ? 'currentPicks.player1' : 'currentPicks.player2';

        // 2. Atomic update of the pick
        game = await CricketGame.findOneAndUpdate(
            { gameId },
            { $set: { [updateField]: run } },
            { new: true }
        );

        // 3. Both ready? Process the ball
        if (game.currentPicks.player1 && game.currentPicks.player2) {
            // 4. Atomic "claim" to process the ball - only one request will succeed here
            const processingGame = await CricketGame.findOneAndUpdate(
                {
                    gameId,
                    'currentPicks.player1': { $gt: 0 },
                    'currentPicks.player2': { $gt: 0 }
                },
                { $set: { 'currentPicks.player1': null, 'currentPicks.player2': null } },
                { new: false } // return state BEFORE clearing picks
            );

            if (processingGame) {
                // We are the processor!
                const p1 = processingGame.players[0];
                const p2 = processingGame.players[1];
                const p1Run = processingGame.currentPicks.player1;
                const p2Run = processingGame.currentPicks.player2;

                const batsman = p1.isBatting ? p1 : p2;
                const bowler = p1.isBatting ? p2 : p1;
                const batsmanRun = p1.isBatting ? p1Run : p2Run;
                const bowlerRun = p1.isBatting ? p2Run : p1Run;

                const MAX_WICKETS = 3;
                let moveResult = 'runs';
                let inning = processingGame.inning;
                let target = processingGame.target;
                let status = processingGame.status;

                if (batsmanRun === bowlerRun) {
                    batsman.wickets += 1;
                    moveResult = 'out';

                    if (batsman.wickets >= MAX_WICKETS) {
                        if (inning === 1) {
                            target = batsman.score + 1;
                            inning = 2;
                            p1.isBatting = !p1.isBatting;
                            p2.isBatting = !p2.isBatting;
                            const newBatsman = p1.isBatting ? p1 : p2;
                            newBatsman.score = 0;
                            newBatsman.wickets = 0;
                        } else {
                            moveResult = 'gameover';
                            status = 'finished';
                        }
                    }
                } else {
                    batsman.score += batsmanRun;
                    moveResult = 'runs';
                    if (inning === 2 && batsman.score >= target) {
                        moveResult = 'win';
                        status = 'finished';
                    }
                }

                const finalGame = await CricketGame.findOneAndUpdate(
                    { gameId },
                    {
                        $set: {
                            players: [p1, p2],
                            lastMove: { batsmanRun, bowlerRun, result: moveResult },
                            inning, target, status,
                            lastUpdated: Date.now()
                        }
                    },
                    { new: true }
                );

                // Notify BOTH players to ensure all tabs are synced
                await Promise.all([
                    pusher.trigger(`private-notifications-${to.toLowerCase()}`, "cricket-ball", { game: finalGame }),
                    pusher.trigger(`private-notifications-${from.toLowerCase()}`, "cricket-ball", { game: finalGame })
                ]).catch(e => console.error("Pusher trigger error:", e));

                return res.json({ success: true, game: finalGame });
            } else {
                // Someone else already processed it, fetch latest state
                game = await CricketGame.findOne({ gameId });
                return res.json({ success: true, game });
            }
        }

        res.json({ success: true, waiting: true });
    } catch (err) {
        console.error("Cricket Pick Error:", err);
        res.status(500).json({ success: false });
    }
});

app.post("/api/games/cricket/highfive", isAuth, async (req, res) => {
    try {
        const { to } = req.body;
        const from = req.session.username;
        const gameId = getCricketId(from, to);
        let game = await CricketGame.findOne({ gameId });
        if (!game) return res.status(404).json({ error: "Game not found" });

        const player = game.players.find(p => p.username.toLowerCase() === from.toLowerCase());
        player.highFive = true;
        await game.save();

        // Notify other player that I high-fived
        await pusher.trigger(`private-notifications-${to.toLowerCase()}`, "cricket-highfive-tap", { from });

        // If both high-fived, trigger the big animation
        if (game.players.every(p => p.highFive)) {
            await pusher.trigger(`private-notifications-${to.toLowerCase()}`, "cricket-highfive-complete", {});
            await pusher.trigger(`private-notifications-${from.toLowerCase()}`, "cricket-highfive-complete", {});
        }
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/games/cricket/reset", isAuth, async (req, res) => {
    try {
        const { to } = req.body;
        const from = req.session.username || "Bhondu";
        const gameId = getCricketId(from, to);
        await CricketGame.deleteOne({ gameId });
        await pusher.trigger(`private-notifications-${to.toLowerCase()}`, "cricket-reset", { from });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/games/cricket/react", isAuth, async (req, res) => {
    try {
        const { to, emoji } = req.body;
        const from = req.session.username;
        await pusher.trigger(`private-notifications-${to.toLowerCase()}`, "cricket-reaction", { from, emoji });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});




app.post("/api/games/snake/sync", isAuth, async (req, res) => {
    try {
        const { to, myPos, oppPos, turn } = req.body;
        const from = req.session.username || "Bhondu";
        await pusher.trigger("private-notifications-" + to.toLowerCase(), "snake-sync", { myPos, oppPos, turn, from });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

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

app.post("/api/journal/comment/:id", isAuth, async (req, res) => {
    try {
        const { text } = req.body;
        const username = req.session.username || "Bhondu";
        if (!text) return res.status(400).json({ success: false, error: "Comment text is required" });

        const entry = await Journal.findById(req.params.id);
        if (!entry) return res.status(404).json({ success: false, error: "Journal entry not found" });

        entry.comments.push({ username, text });
        await entry.save();

        res.json({ success: true, comment: entry.comments[entry.comments.length - 1] });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.delete("/api/journal/comment/:journalId/:commentId", isAuth, async (req, res) => {
    try {
        const { journalId, commentId } = req.params;
        const username = req.session.username || "Bhondu";
        const entry = await Journal.findById(journalId);
        if (!entry) return res.status(404).json({ success: false, error: "Journal not found" });

        const comment = entry.comments.id(commentId);
        if (!comment) return res.status(404).json({ success: false, error: "Comment not found" });

        // Only author can delete
        if (comment.username !== username) return res.status(403).json({ success: false, error: "Unauthorized" });

        entry.comments.pull(commentId);
        await entry.save();
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.put("/api/journal/comment/:journalId/:commentId", isAuth, async (req, res) => {
    try {
        const { journalId, commentId } = req.params;
        const { text } = req.body;
        const username = req.session.username || "Bhondu";
        const entry = await Journal.findById(journalId);
        if (!entry) return res.status(404).json({ success: false, error: "Journal not found" });

        const comment = entry.comments.id(commentId);
        if (!comment) return res.status(404).json({ success: false, error: "Comment not found" });

        // Only author can edit
        if (comment.username !== username) return res.status(403).json({ success: false, error: "Unauthorized" });

        comment.text = text;
        await entry.save();
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
    try {
        // Use case-insensitive search and sort by updatedAt to get the latest/best data
        const vishu = await Question.findOne({ username: { $regex: /^vishu$/i } }).sort({ updatedAt: -1 });
        const bhondu = await Question.findOne({ username: { $regex: /^bhondu$/i } }).sort({ updatedAt: -1 });
        res.json({
            vishu: vishu ? vishu.answers : {},
            bhondu: bhondu ? bhondu.answers : {}
        });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/questions/save", isAuth, async (req, res) => {
    try {
        const username = (req.session.username || "Bhondu").toLowerCase();
        const answers = req.body.answers || req.body;

        // Find existing record case-insensitively to avoid duplicates like 'Bhondu' and 'bhondu'
        await Question.findOneAndUpdate(
            { username: { $regex: new RegExp(`^${username}$`, 'i') } },
            { username, answers, updatedAt: new Date() },
            { upsert: true, new: true }
        );
        res.json({ success: true });
    } catch (err) {
        console.error("Save Error:", err);
        res.status(500).json({ success: false });
    }
});

app.get("/questions", isAuth, (req, res) => res.render("questions"));
app.get("/promise", isAuth, (req, res) => res.render("promise"));
app.get("/love-letter", isAuth, (req, res) => res.render("love-letter"));
app.get("/timeline", isAuth, (req, res) => res.render("timeline"));
app.get("/reasons", isAuth, (req, res) => res.render("reasons"));
app.get("/voice-memory", isAuth, (req, res) => res.render("voice-memory"));
app.get("/outfit", isAuth, (req, res) => res.render("outfit"));
app.get("/future-plans", isAuth, (req, res) => res.render("future-plans"));
// --- Ludo Authoritative State ---
let ludoStates = {}; // Simple in-memory store: { "bhondu-vishu": { ...State } }

app.get("/games/ludo", isAuth, (req, res) => {
    res.render("game-ludo", {
        username: req.session.username,
        otherUser: (req.session.username || "Bhondu").toLowerCase() === 'bhondu' ? 'Vishu' : 'Bhondu',
        pusherKey: process.env.PUSHER_KEY,
        pusherCluster: process.env.PUSHER_CLUSTER
    });
});

app.get("/api/games/ludo/state", isAuth, (req, res) => {
    const from = (req.session.username || "Bhondu").toLowerCase();
    const to = req.query.otherUser.toLowerCase();
    const gameId = [from, to].sort().join('-');

    if (!ludoStates[gameId]) {
        ludoStates[gameId] = {
            phase: 'setup', // 'setup' or 'playing'
            mode: '2-house',
            assignments: {}, // { red: 'Bhondu', ... }
            turn: 'red',
            roll: 0,
            consecutiveSixes: 0,
            waitingForMove: false,
            tokens: {
                red: [null, null, null, null],
                blue: [null, null, null, null],
                yellow: [null, null, null, null],
                green: [null, null, null, null]
            }
        };
    }
    res.json({ success: true, state: ludoStates[gameId] });
});

app.post("/api/games/ludo/setup", isAuth, async (req, res) => {
    try {
        const { to, mode, assignments, phase } = req.body;
        const from = req.session.username || "Bhondu";
        const gameId = [from.toLowerCase(), to.toLowerCase()].sort().join('-');

        if (ludoStates[gameId]) {
            if (mode) ludoStates[gameId].mode = mode;
            if (assignments) ludoStates[gameId].assignments = assignments;
            if (phase) ludoStates[gameId].phase = phase;

            // If starting game, determine first turn color from assignments
            if (phase === 'playing') {
                const assignedColors = Object.keys(ludoStates[gameId].assignments);
                ludoStates[gameId].turn = assignedColors[0];
            }
        }

        await pusher.trigger(`private-notifications-${to.toLowerCase()}`, "ludo-setup-sync", { from, mode, assignments, phase });
        res.json({ success: true, state: ludoStates[gameId] });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/games/ludo/roll", isAuth, async (req, res) => {
    try {
        const { to } = req.body;
        const from = req.session.username || "Bhondu";
        const gameId = [from.toLowerCase(), to.toLowerCase()].sort().join('-');

        const roll = Math.floor(Math.random() * 6) + 1;

        // Update server state
        if (ludoStates[gameId]) {
            if (roll === 6) {
                ludoStates[gameId].consecutiveSixes++;
            } else {
                ludoStates[gameId].consecutiveSixes = 0;
            }

            if (ludoStates[gameId].consecutiveSixes === 3) {
                // 3 Sixes in a row -> Turn Cancelled
                ludoStates[gameId].roll = 0;
                ludoStates[gameId].consecutiveSixes = 0;
                ludoStates[gameId].waitingForMove = false;

                // Switch Turn
                const order = ['red', 'blue', 'yellow', 'green'];
                const assignedColors = Object.keys(ludoStates[gameId].assignments);
                let currentIdx = order.indexOf(ludoStates[gameId].turn);
                for (let i = 1; i <= 4; i++) {
                    let nextColor = order[(currentIdx + i) % 4];
                    if (assignedColors.includes(nextColor)) {
                        ludoStates[gameId].turn = nextColor;
                        break;
                    }
                }

                await pusher.trigger(`private-notifications-${to.toLowerCase()}`, "ludo-rolled", { from, roll: 6, cancelled: true, nextTurn: ludoStates[gameId].turn });
                return res.json({ success: true, roll: 6, cancelled: true, nextTurn: ludoStates[gameId].turn });
            }

            ludoStates[gameId].roll = roll;
            ludoStates[gameId].waitingForMove = true;
        }

        await pusher.trigger(`private-notifications-${to.toLowerCase()}`, "ludo-rolled", { from, roll });
        res.json({ success: true, roll });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/games/ludo/move", isAuth, async (req, res) => {
    try {
        const { to, tokenId, color, status, pos, isSkip, bonusTurn } = req.body;
        const from = req.session.username || "Bhondu";
        const gameId = [from.toLowerCase(), to.toLowerCase()].sort().join('-');

        if (ludoStates[gameId]) {
            if (!isSkip) {
                ludoStates[gameId].tokens[color][tokenId] = { status, pos };

                // Win detection
                const tokens = ludoStates[gameId].tokens[color];
                const finishedCount = tokens.filter(t => t && t.status === 'finished').length;
                if (finishedCount === 4) {
                    ludoStates[gameId].phase = 'finished';
                    ludoStates[gameId].winner = from;
                    await pusher.trigger(`private-notifications-${to.toLowerCase()}`, "ludo-win", { winner: from });
                    return res.json({ success: true, winner: from });
                }
            }

            ludoStates[gameId].waitingForMove = false;

            // Turn switching logic: Skip unassigned colors
            // If it's a 6, or a bonus turn (capture/home), stay on current turn
            if ((ludoStates[gameId].roll !== 6 && !bonusTurn) || isSkip) {
                ludoStates[gameId].consecutiveSixes = 0; // Reset on turn switch
                const order = ['red', 'blue', 'yellow', 'green'];
                const assignedColors = Object.keys(ludoStates[gameId].assignments);
                let currentIdx = order.indexOf(ludoStates[gameId].turn);

                // Find the next color that is actually assigned
                let foundNext = false;
                for (let i = 1; i <= 4; i++) {
                    let nextColor = order[(currentIdx + i) % 4];
                    if (assignedColors.includes(nextColor)) {
                        ludoStates[gameId].turn = nextColor;
                        foundNext = true;
                        break;
                    }
                }
            }
            ludoStates[gameId].roll = 0;
        }

        await pusher.trigger(`private-notifications-${to.toLowerCase()}`, "ludo-moved", { from, tokenId, color, status, pos, nextTurn: ludoStates[gameId].turn, isSkip, bonusTurn });
        res.json({ success: true, nextTurn: ludoStates[gameId].turn, bonusTurn });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/games/ludo/reset", isAuth, async (req, res) => {
    try {
        const { to } = req.body;
        const from = req.session.username || "Bhondu";
        const gameId = [from.toLowerCase(), to.toLowerCase()].sort().join('-');
        delete ludoStates[gameId];
        await pusher.trigger(`private-notifications-${to.toLowerCase()}`, "ludo-reset", {});
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});


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
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Server listening on all interfaces (0.0.0.0:${PORT})`);
        console.log(`🔗 Local: http://localhost:${PORT}`);
        connectDB();
    });
}

module.exports = app;