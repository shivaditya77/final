const express = require("express");
const router = express.Router();

const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");
const passport = require("passport");


// Credentials loaded from .env
const USERNAME = process.env.LOGIN_USERNAME || "Bhondu";
// Default hash is for '21feb' just in case .env is missing
const PASSWORD_HASH = process.env.LOGIN_PASSWORD_HASH || "$2b$10$yQ.Roiv7lbQIA05aBfWXg.hpJIHam7x8HsrUCjxT46QXwSXRJumGK";

// ========== SECURITY RATE LIMITER ==========
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit each IP to 5 login requests per window
    message: "Too many login attempts from this IP, please try again after 15 minutes",
    handler: (req, res) => {
        const errorMessage = "Too many failed attempts. Please wait 15 minutes. 💔";
        const isJson = req.headers['content-type'] === 'application/json' || req.xhr;
        if (isJson) {
            return res.status(429).json({ success: false, message: errorMessage });
        }
        req.session.error = errorMessage;
        res.redirect("/login");
    }
});

// Store failed attempts
const failedAttempts = new Map();

// ========== ROMANTIC ERROR MESSAGES ==========
const romanticErrors = [
    "Itna bhi yaad nahi? 😏 Try again",
    "Really? That day meant nothing to you? 😢",
    "Let me give you a hint... think of 'us' 💭",
    "Last try before I start crying... 🥺",
    "Okay, I'll forgive you... one more chance ❤️",
    "The universe is waiting for you to remember... ✨",
    "Close your eyes... think of our first moment... 🤔",
    "You're breaking my heart! (just kidding, try again) 💔",
    "Hint: It's the day my life changed forever 📅",
    "Should I just tell you? No... you got this! 💪"
];

// ========== LOGIN PAGE ==========
router.get("/login", (req, res) => {
    if (req.session.isAuth) return res.redirect("/");
    const error = req.session.error;
    req.session.error = null;
    res.render("login", { error });
});

// ========== GOOGLE AUTH ROUTES ==========
router.get("/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));

router.get("/auth/google/callback", passport.authenticate("google", { failureRedirect: "/login" }), (req, res) => {
    // Successfully authenticated
    req.session.isAuth = true;
    req.session.username = req.user.username;
    req.session.loginTime = new Date().toISOString();
    console.log(`❤️ ${req.user.username} logged in via Google at ${new Date().toLocaleString()}`);
    res.redirect("/");
});


// ========== LEGACY LOGIN PAGE ==========
router.get("/legacy/login", (req, res) => {
    if (req.session.isAuth) {
        return res.json({
            authenticated: true,
            username: req.session.username
        });
    }

    const error = req.session.error;
    req.session.error = null;
    const attempts = failedAttempts.get(req.ip) || 0;

    res.json({
        authenticated: false,
        error,
        attempts
    });
});

// ========== LOGIN LOGIC ==========
router.post("/login", loginLimiter, (req, res) => {
    const { username, password } = req.body;
    const isJson = req.headers['content-type'] === 'application/json' || req.xhr;
    console.log(`🔑 Login Attempt: user="${username}", format=${isJson ? 'JSON' : 'Form'}`);

    let attempts = failedAttempts.get(req.ip) || 0;

    const validUsernames = ["bhondu", "vishu"];
    const isUsernameCorrect = validUsernames.includes(username.toLowerCase());
    const isPasswordCorrect = bcrypt.compareSync(password, PASSWORD_HASH);

    // logic continues...

    if (isUsernameCorrect && isPasswordCorrect) {
        failedAttempts.delete(req.ip);
        req.session.isAuth = true;
        req.session.username = username;
        req.session.loginTime = new Date().toISOString();

        console.log(`❤️ ${username} logged in successfully at ${new Date().toLocaleString()}`);

        if (isJson) {
            return res.json({ success: true, username: req.session.username });
        }
        return res.redirect("/");
    }
    else {
        attempts++;
        failedAttempts.set(req.ip, attempts);

        let errorMessage;

        if (attempts === 1) {
            errorMessage = "Itna bhi yaad nahi? 😏 Try again";
        }
        else if (attempts === 2) {
            errorMessage = "Really? That day meant nothing to you? 😢";
        }
        else if (attempts === 3) {
            errorMessage = "Okay okay... think of our first moment 💋";
        }
        else if (attempts === 4) {
            errorMessage = "I believe in you! One more try... ❤️";
        }
        else if (attempts >= 5) {
            errorMessage = "Okay I'll give you a SUPER hint: It's the day we became 'us' 📅";
        }
        else {
            errorMessage = romanticErrors[Math.floor(Math.random() * romanticErrors.length)];
        }

        if (!isUsernameCorrect && (username.toLowerCase().includes("bhon") || username.toLowerCase().includes("vish"))) {
            errorMessage = "So close! Check the spelling of your name... try again 😘";
        }

        if (attempts > 3 && !isUsernameCorrect) {
            errorMessage = "Hmm... are you trying to hack my heart? You're already in it! ❤️ Try the right name";
        }

        req.session.error = errorMessage;
        console.log(`❌ Failed login attempt #${attempts} from ${req.ip}`);

        if (isJson) {
            return res.status(401).json({ success: false, message: errorMessage });
        }
        return res.redirect("/login");
    }
});

// ========== LOGOUT ==========
router.get("/logout", (req, res) => {
    const username = req.session.username;
    const isJson = req.headers['accept'] === 'application/json' ||
        req.headers['content-type'] === 'application/json' ||
        req.xhr;

    req.session.destroy((err) => {
        if (err) console.error("Logout error:", err);
        if (username) console.log(`💔 ${username} logged out`);
        if (isJson) {
            return res.json({ success: true, message: "Logged out" });
        }
        res.redirect("/login");
    });
});

// ========== SESSION STATUS ==========
router.get("/session-status", (req, res) => {
    if (req.session.isAuth) {
        res.json({
            authenticated: true,
            username: req.session.username,
            loginTime: req.session.loginTime
        });
    } else {
        res.json({ authenticated: false });
    }
});

// ========== ROMANTIC HINT ENDPOINT ==========
router.get("/hint", (req, res) => {
    const hints = [
        "💭 The day everything changed...",
        "📅 Think of our first date",
        "💕 The moment I knew you were the one",
        "🎂 Maybe it's a birthday?",
        "💏 The day we said 'I love you'",
        "🌟 The day the stars aligned for us"
    ];

    const randomHint = hints[Math.floor(Math.random() * hints.length)];
    res.json({ hint: randomHint });
});

// Note: Cleanup handled by serverless lifecycle (instance restarts)

module.exports = router;
