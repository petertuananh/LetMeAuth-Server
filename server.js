const express = require('express');
const app = express()
const path = require('path')
const bodyParser = require('body-parser')
const cookieParser = require('cookie-parser');
const config = require("./config.json")
const mysql = require("mysql");
const crypto = require("crypto")
const twofactor = require("node-2fa");
const nodemailer = require('nodemailer');
const axios = require("axios")
var expressSession = require('express-session');
const DiscordOauth2 = require("discord-oauth2");
const DiscOauth = new DiscordOauth2();
var passport = require('passport');
var passportLocal = require('passport-local');
const rateLimitMap = new Map();
const ms = require("ms")
const multer = require("multer")
const mysqlInfo = {
    host: config.database.mysql.host,
    user: config.database.mysql.user,
    password: config.database.mysql.password,
    database: config.database.mysql.database,
    supportBigNumbers: config.database.mysql.supportBigNumbers,
    bigNumberStrings: config.database.mysql.bigNumberStrings,
    multipleStatements: config.database.mysql.multipleStatements,
    charset: config.database.mysql.charset,
    connectionLimit: config.database.mysql.connectionLimit
}

const con = mysql.createPool(mysqlInfo)

// uses
app.locals.ms = ms
app.set('title', 'Let Me Auth');
app.use(cookieParser())
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(bodyParser.raw());
app.set('view engine', 'ejs');
const dataDir = path.resolve(`${process.cwd()}${path.sep}views`);
app.use("/assets", express.static(path.resolve(`${dataDir}${path.sep}assets`)));
app.use("/avatar", express.static(path.resolve(`${dataDir}${path.sep}assets${path.sep}data${path.sep}avatar`)));
app.use("/banner", express.static(path.resolve(`${dataDir}${path.sep}assets${path.sep}data${path.sep}banner`)));
app.use("/icon", express.static(path.resolve(`${dataDir}${path.sep}assets${path.sep}data${path.sep}icon`)));

app.use(expressSession({
    secret: '#@*#&%#%^%#$##@*#&%#%^%#$##@*#&%#%^%#$#',
    resave: true,
    saveUninitialized: true
}))
app.use(passport.initialize());
app.use(passport.session());
app.use(async (req, res, next) => {
    next()
    // const ip = await req.headers['x-forwarded-for'].split(",")[0]
    // con.query(`SELECT * FROM IP_BANNED WHERE ip="${ip}"`, async function (err, data) {
    //     if (data[0]) {
    //         if ((parseFloat(data[0].bannedAT) + parseInt(data[0].duration)) <= Date.now()) con.query(`DELETE FROM IP_BANNED WHERE ip="${ip}"`)
    //         return res.status(403).json({ code: 403, msg: `Your ip was banned from the API`, duration: ms(parseInt(data[0].duration)) })
    //     } else {
    //         next()
    //         if (rateLimitMap.has(ip)) {
    //             const guildData = rateLimitMap.get(ip);
    //             let rateCount = guildData.rateCount;
    //             ++rateCount
    //             if (parseInt(rateCount) == 10) {
    //                 con.query(`INSERT INTO IP_BANNED (ip, reason, bannedAT, duration) VALUES ("${ip}", "Rate limited", ${Date.now()}, ${ms('15m')})`)
    //                 rateLimitMap.delete(ip);
    //             } else {
    //                 guildData.rateCount = rateCount;
    //                 rateLimitMap.set(ip, guildData);
    //             }
    //         } else {
    //             setTimeout(() => {
    //                 rateLimitMap.delete(ip);
    //             }, 1000);
    //             rateLimitMap.set(ip, {
    //                 rateCount: 1,
    //             });
    //         }
    //     }
    // })
})
// raw
var scopes = ['identify', 'email', 'guilds', 'guilds.join', 'guilds.members.read'];
var prompt = 'consent'

passport.use('letmeauth', new passportLocal.Strategy(
    {
        usernameField: 'username',
        passwordField: 'password',
        session: true,
    },
    function (username, password, done) {
        con.query(`SELECT * FROM USER WHERE email="${username}"`, async function (err, user) {
            if (!user[0]) return done(null, false, { message: 'Incorrect username or password.' })
            const tokenInput = makeToken({ id: user[0].id, password: password })
            if (tokenInput !== user[0].token) return done(null, false, { message: 'Incorrect username or password.' })

            return done(null, user[0])
        })
    }
));

passport.serializeUser((user, done) => {
    done(null, user)
})

passport.deserializeUser(function (user, done) {
    done(null, user);
});
app.get("/", async (req, res) => {
    res.render("pages/index", {
        req: req
    })
})
app.get("/home", checkAuth, async (req, res) => {
    let rawData = {}
    con.query(`SELECT * FROM AUTH_SOCIALNETWORK WHERE user_id=${req.user.id}`, async function (err, socialnetwork) {
        if (!socialnetwork) return
        socialnetwork.forEach(account => {
            rawData[account.name] = {
                id: account.socialnetwork_id,
                name: account.socialnetwork_name
            }
        })
        res.render("pages/home", {
            req: req,
            msg: req.query.msg || null,
            socialnetwork: rawData
        })
    })
})

app.post('/auth/callback', passport.authenticate('letmeauth', {
    failureRedirect: '/auth/login',
    failureMessage: true
}), function (req, res) {
    con.query(`SELECT * FROM USER WHERE id=${req.user.id}`, async function (err, user) {
        if (!user[0].twofactor) return res.redirect(req.cookies.redirect ? req.cookies.redirect : '/');
        const verifyToken = await twofactor.verifyToken(user[0].twofactor, req.body.twofactor);
        if (verifyToken) {
            con.query(`INSERT INTO 2FA(user_id, session_id, code) VALUES (${req.user.id}, "${req.session.id}", ${req.body.twofactor})`)
            return res.redirect(req.cookies.redirect ? req.cookies.redirect : '/');
        } else {
            return res.render("pages/auth/login", { msg: 'Invalid 2FA code' })
        }
    })
});

app.get("/auth/login", async (req, res) => {
    res.render("pages/auth/login", {
        msg: req.session.messages || 'no'
    })
});
app.get("/auth/logout", checkAuth, async (req, res) => {
    req.logout(function (err) {
        res.redirect('/');
    });
})
function make_config(authorization_token) { // Define the function
    data = { // Define "data"
        headers: { // Define "headers" of "data"
            "authorization": `Bearer ${authorization_token}` // Define the authorization
        }
    };
    return data; // Return the created object
};
app.get("/connections/auth/:target", checkAuth, async (req, res) => {
    const target = req.params.target
    const token = req.query.code || req.query.token || req.query.access_token
    if (req.query.action == 'disconnect') {
        await con.query(`DELETE FROM AUTH_SOCIALNETWORK WHERE user_id=${req.user.id} && name="${target}"`)
        return res.redirect(`/home?msg=Disconnected your ${target} account!`)
    }
    await con.query(`DELETE FROM AUTH_SOCIALNETWORK WHERE user_id=${req.user.id} && name="${target}"`)
    if (target == 'discord') {
        if (!token) return res.redirect("https://discord.com/oauth2/authorize?client_id=1023163031758311444&scope=identify&response_type=code&redirect_uri=https://letmeauth.xyz/connections/auth/discord")
        DiscOauth.tokenRequest({
            clientId: config.oauth.discord.id,
            clientSecret: config.oauth.discord.secret,
            code: token,
            scope: "identify email",
            grantType: "authorization_code",
            redirectUri: "http://localhost:1111/connections/auth/discord",
        })
            .catch(e => {
                return res.redirect("/connections/auth/discord")
            })
            .then(async (r) => {
                if (!r) return
                DiscOauth.getUser(r.access_token)
                    .catch(e => {
                        return res.redirect("/connections/auth/discord")
                    })
                    .then(async (u) => {
                        if (!u) return
                        await con.query(`INSERT INTO AUTH_SOCIALNETWORK(name, user_id, socialnetwork_id, socialnetwork_name) VALUES ("discord", ${req.user.id}, ${u.id}, "${u.username}")`)
                        return res.redirect(`/home?msg=Added your Discord account!`)
                    })
            })
    } else if (target == 'facebook') {
        if (!token) return res.redirect(`https://facebook.com/dialog/oauth?client_id=${config.oauth.facebook.id}&redirect_uri=http://localhost:1111/connections/auth/facebook&scope=public_profile`)
        axios.default.get(`https://graph.facebook.com/oauth/access_token?client_id=${config.oauth.facebook.id}&client_secret=${config.oauth.facebook.secret}&redirect_uri=http://localhost:1111/connections/auth/facebook&code=${token}`)
            .then(async (r) => {
                if (!r) return;
                axios.default.get(`https://graph.facebook.com/me?access_token=${r.data.access_token}`)
                    .then(async (r2) => {
                        if (!r2) return
                        await con.query(`INSERT INTO AUTH_SOCIALNETWORK(name, user_id, socialnetwork_id, socialnetwork_name) VALUES ("facebook", ${req.user.id}, ${r2.data.id}, "${r2.data.name}")`)
                        return res.redirect(`/home?msg=Added your Facebook account!`)
                    })
                    .catch(e => {
                        return res.sendStatus(500)
                    })
            })
            .catch(e => {
                return res.sendStatus(500)
            })
    } else if (target == 'google') {
        if (!token) return res.redirect(`https://accounts.google.com/o/oauth2/auth?scope=email&redirect_uri=http://localhost:1111/connections/auth/google&response_type=code&client_id=${config.oauth.google.id}&approval_prompt=force`)
        const r = await axios({
            url: 'https://oauth2.googleapis.com/token',
            method: 'POST',
            params: {
                client_id: config.oauth.google.id,
                client_secret: config.oauth.google.secret,
                redirect_uri: 'http://localhost:1111/connections/auth/google',
                code: token,
                grant_type: 'authorization_code',
            },
        })
        axios.default.get(`https://www.googleapis.com/oauth2/v1/userinfo?access_token=${r.data.access_token}`)
            .then(async (r2) => {
                if (!r2) return;
                await con.query(`INSERT INTO AUTH_SOCIALNETWORK(name, user_id, socialnetwork_id, socialnetwork_name) VALUES ("google", ${req.user.id}, ${r2.data.id}, "${r2.data.email}")`)
                return res.redirect(`/home?msg=Added your Google account!`)
            })
            .catch(e => {
                return res.sendStatus(500)
            })
    }
})

app.get("/user/setting/:target", checkAuth, async (req, res) => {
    const target = req.query.target
    if (req.params.target == '2fa') {
        if (target == 'enable') {
            con.query(`SELECT * FROM USER WHERE id=${req.user.id}`, async function (err, user) {
                if (user[0].twofactor) return res.send("This account aready enabled 2FA!")
                const newSecret = twofactor.generateSecret({ name: "Let Me Auth", account: req.user.id });
                res.render('pages/auth/2fa', {
                    twofactor: newSecret,
                    msg: 'no'
                })
            })
        }
    }
})
let avtStorage = multer.diskStorage({
    destination: function (req, file, callback) {
        callback(null, './views/assets/data/avatar')
    },
    filename: async function (req, file, callback) {
        const avt = `avt-${makeString(10)}${path.extname(file.originalname)}`
        await con.query(`UPDATE USER SET avatar = "${avt}" WHERE id=${req.user.id}`)
        callback(null, avt)
    }
})
let iconStorage = multer.diskStorage({
    destination: function (req, file, callback) {
        callback(null, './views/assets/data/icon')
    },
    filename: async function (req, file, callback) {
        const avt = `avt-${makeString(10)}${path.extname(file.originalname)}`
        await con.query(`UPDATE APPLICATION SET icon = "${avt}" WHERE id=${req.params.app_id}`)
        callback(null, avt)
    }
})
app.post("/user/setting/:target", checkAuth, async (req, res) => {

    const target = req.query.target
    if (req.params.target == '2fa') {
        if (target == 'enable') {
            const secret = req.query.secret
            const verifyToken = await twofactor.verifyToken(secret, req.body.twofactor);
            if (!verifyToken) return res.redirect("/user/setting/2fa", { msg: 'Invalid 2FA token!' })
            con.query(`UPDATE USER SET twofactor = '${secret}' WHERE id=${req.user.id}`)
            return res.redirect("/home")
        } else if (target == 'disable') {
            con.query(`SELECT * FROM USER WHERE id=${req.user.id}`, async function (err, user) {
                const verifyToken = await twofactor.verifyToken(user[0].twofactor, req.body.token);
                if (verifyToken) {
                    await con.query(`UPDATE USER SET twofactor = '' WHERE id=${req.user.id}`)
                }
            })
        }
    } else if (req.params.target == 'avatar') {
        let upload = multer({
            storage: avtStorage,
            fileFilter: function (req, file, callback) {
                if (!file) return;
                let ext = path.extname(file.originalname)
                if (ext !== '.png' && ext !== '.jpg' && ext !== '.gif' && ext !== '.jpeg') {
                    return res.send("<script>alert(`Only images are allowed!`);")
                }
                callback(null, true)
            }

        }).single('userFile');
        upload(req, res, function (err) {
            res.redirect("/home")
        })
    }
})

app.get("/register", async (req, res) => {
    res.render("pages/auth/register", { msg: null })
});

app.post("/register", async (req, res) => {
    const data = req.body
    con.query(`SELECT * FROM USER WHERE email="${data.email}"`, async function (err, email) {
        if (email[0]) return res.render("pages/auth/register", { msg: "This email is aready in use!" })// ừa
        con.query(`SELECT * FROM USER WHERE username="${data.username}"`, async function (err, username) {
            if (username[0]) return res.render("pages/auth/register", { msg: "This username is aready in use!" })
            const user_id = makeInt(17)
            const token = makeToken({ id: user_id, password: data.password })
            const newSecret = twofactor.generateSecret({ name: "Let Me Auth", account: user_id });
            con.query(`INSERT INTO USER(id, flags, email, username, token, twofactor, createAT, avatar, banner, color) VALUES (${user_id}, "", "${data.email}", "${data.username}", "${token}", "", ${Date.now()}, "", "", "")`)
            return res.redirect("/auth/login")
            // return res.send(`Please setup your 2 factor authentication with this code : ${newSecret.secret} <img src="${newSecret.qr}" alt="">`)
        })
    })
});
app.get("/oauth2/checktoken", async (req, res) => {
    const query = req.query
    if (!query.app_id) {
        return res.send("Unknown application!")
    } else if (!query.token) {
        return res.send("Unknown token!")
    } else {
        con.query(`SELECT * FROM APPLICATION WHERE id="${query.app_id}"`, async function (err, application) {
            if (!application[0]) return res.send("Unknown application!")
            con.query(`SELECT * FROM ACCESS_TOKEN WHERE access_token="${query.token}"`, async function (err, access_token) {
                if (!access_token[0]) return res.send("Unknown token!")
                con.query(`SELECT * FROM USER WHERE id="${access_token[0].user_id}"`, async function (err, user) {
                    if (!user[0]) return res.send("Unknown user!")
                    const rawData = {
                        id: user[0].id,
                        username: user[0].username,
                        email: user[0].email,
                        twofactor: user[0].twofactor ? true : false,
                        createAT: user[0].createAT,
                        avatar: user[0].avatar,
                        banner: user[0].banner,
                        color: user[0].color
                    }
                    return res.json(rawData)
                })
            })
        })
    }
})
app.post("/oauth2/authorized", checkAuth, async (req, res) => {
    const query = req.query
    if (!query.app_id) {
        return res.send("Unknown application!")
    } else if (!query.redirect_url) {
        return res.send("Unknown redirect url!")
    } else {
        con.query(`SELECT * FROM APPLICATION WHERE id="${query.app_id}"`, async function (err, application) {
            if (!application[0]) return res.send("Unknown application!")
            if (!application[0].allow_authorize) return res.send("This application no longer allow authorize!")
            const access_token = makeTokenApp({ id: req.user.id, app_id: application[0].id })
            con.query(`INSERT INTO ACCESS_TOKEN(user_id, app_id, createAT, access_token) VALUES (${req.user.id}, ${application[0].id}, ${Date.now()}, "${access_token}")`)
            return res.redirect(`${query.redirect_url}?token=${access_token}`)
        })
    }
})
app.get("/oauth2/authorize", checkAuth, async (req, res) => {
    const query = req.query
    if (!query.app_id) {
        return res.send("Unknown application!")
    } else if (!query.redirect_url) {
        return res.send("Unknown redirect url!")
    } else {
        con.query(`SELECT * FROM APPLICATION WHERE id="${query.app_id}"`, async function (err, application) {
            if (!application[0]) return res.send("Unknown application!")
            if (!application[0].allow_authorize) return res.send("This application no longer allow authorize!")
            res.render("pages/oauth2/authorize", {
                req: req,
                application: application[0],
                msg: null,
                callback_url: query.redirect_url,
            })
        })
    }
});
app.get("/application", checkAuth, async (req, res) => {
    con.query(`SELECT * FROM PERMISSION WHERE user_id=${req.user.id}`, async function (err, application) {
        const raw = []
        application.forEach(a => {
            con.query(`SELECT * FROM APPLICATION WHERE id=${a.app_id}`, async function (err, app) {
                raw.push(app[0])
            })
        })
        setTimeout(() => {
            res.render("pages/application/apps", { msg: req.query.msg, application: raw, req: req })
        }, 1000)
    })
})

app.post("/application/create", checkAuth, async (req, res) => {
    const data = req.body
    if (!data.name) return res.redirect("/application?msg=Missing application name!")
    con.query(`SELECT * FROM APPLICATION WHERE name="${data.name}"`, async function (err, application) {
        if (application[0]) return res.redirect("/application?msg='This application name aready registered!'")
        const app_id = makeInt(17)
        await con.query(`DELETE FROM PERMISSION WHERE user_id=${req.user.id} && app_id=${app_id}`)
        con.query(`INSERT INTO APPLICATION(id, name, createAT, icon, redirect_url, allow_authorize) VALUES (${app_id}, "${data.name}", ${Date.now()}, "", "", "true")`)
        con.query(`INSERT INTO PERMISSION(user_id, app_id, permission) VALUES (${req.user.id}, ${app_id}, 8)`)
        return res.redirect(`/application/${app_id}/overview`)
    })
})
app.post("/application/:app_id/:target", checkAuth, async (req, res) => {
    const app_id = req.params.app_id
    con.query(`SELECT * FROM APPLICATION WHERE id=${app_id}`, async function (err, application) {
        if (!application[0]) return res.redirect("/application?msg='Can't find this application!'")
        con.query(`SELECT * FROM PERMISSION WHERE user_id=${req.user.id} && app_id=${app_id}`, async function (err, perm) {
            if (!perm[0]) return res.redirect("/application?msg='You don't have permission to manage this applicstion!'")
            if (parseInt(perm[0]) < 8) return res.redirect("/application?msg='You don't have permission to manage this applicstion!'")
            if (req.params.target == 'setting') {
                if (req.query.tab == 'allow_authorize') {
                    if (req.query.target == 'enable') return con.query(`UPDATE APPLICATION SET allow_authorize = 'true' WHERE id=${app_id}`)
                    if (req.query.target == 'disable') return con.query(`UPDATE APPLICATION SET allow_authorize = '' WHERE id=${app_id}`)
                }
            } else if (req.params.target == 'delete') {
                con.query(`SELECT * FROM USER WHERE id=${req.user.id}`, async function (err, user) {
                    if (user[0].twofactor) {
                        const verifyToken = await twofactor.verifyToken(user[0].twofactor, req.body.twofactor);
                        if (!verifyToken) return res.redirect("/application?msg=Deleted")
                        con.query(`DELETE FROM PERMISSION WHERE app_id=${app_id}`)
                        return con.query(`DELETE FROM APPLICATION WHERE id=${app_id}`)
                    } else {
                        con.query(`DELETE FROM PERMISSION WHERE app_id=${app_id}`)
                        return con.query(`DELETE FROM APPLICATION WHERE id=${app_id}`)
                    }
                })
            } else if (req.params.target == 'icon') {
                let upload = multer({
                    storage: iconStorage,
                    fileFilter: function (req, file, callback) {
                        if (!file) return;
                        let ext = path.extname(file.originalname)
                        if (ext !== '.png' && ext !== '.jpg' && ext !== '.gif' && ext !== '.jpeg') {
                            return res.send("<script>alert(`Only images are allowed!`);")
                        }
                        callback(null, true)
                    }

                }).single('userFile');
                upload(req, res, function (err) {
                    res.redirect(`/application/${app_id}/overview`)
                })
            }
        })
    })
});
app.get("/application/:app_id/:target", checkAuth, async (req, res) => {
    const app_id = req.params.app_id
    con.query(`SELECT * FROM APPLICATION WHERE id=${app_id}`, async function (err, application) {
        if (!application[0]) return res.redirect("/application?msg='Can't find this application!'")
        con.query(`SELECT * FROM PERMISSION WHERE user_id=${req.user.id} && app_id=${app_id}`, async function (err, perm) {
            if (!perm[0]) return res.redirect("/application?msg='You don't have permission to manage this applicstion!'")
            if (parseInt(perm[0]) < 8) return res.redirect("/application?msg='You don't have permission to manage this applicstion!'")
            if (req.params.target == 'overview') {
                return res.render("pages/application/overview", { req: req, application: application[0] })
            } else if (req.params.target == 'perm') {

            } else {
                return res.redirect(`/application/${app_id}/overview`)
            }
        })
    })
});
async function checkAuth(req, res, next) {
    if (req.isAuthenticated()) {
        con.query(`SELECT * FROM USER WHERE id=${req.user.id}`, async function (err, user) {
            if (!user[0]) return res.redirect("/auth/login")
            con.query(`SELECT * FROM USER_BANNED WHERE user_id=${req.user.id}`, async function (err, ban) {
                if (ban[0]) return res.send(`You have been banned with reason: ${ban[0].reason}`)
                if (!user[0].twofactor) return next()
                con.query(`SELECT * FROM 2FA WHERE user_id=${req.user.id} && session_id="${req.session.id}"`, async function (err, tfa) {
                    if (!tfa[0]) return res.redirect("/auth/login?msg=Invalid 2fa code")
                    return next()
                })
            })
        })
    } else {
        res.cookie("redirect", req.url)
        return res.redirect("/auth/login")
    }
}
// functions
function makeString(length) {
    var result = '';
    var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    var charactersLength = characters.length;
    for (var i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() *
            charactersLength));
    }
    return result;
}
function makeToken(target) {
    const token = crypto.createHmac("sha256", `${target.id}-${target.password}-#@*#&%#%^%#$#`).update(`${target.id}-${target.password}-#@*#&%#%^%#$#`).digest("hex");
    return token
}
function makeTokenApp(target) {
    const token = crypto.createHmac("sha256", `${target.id}-${target.app_id}-#@*#&%#%^%#$#`).update(`${target.id}-${target.app_id}-#@*#&%#%^%#$#`).digest("hex");
    return token
}
function makeInt(length) {
    var result = '';
    var characters = '0123456789';
    var charactersLength = characters.length;
    for (var i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() *
            charactersLength));
    }
    return result;
}
app.listen(config.server.port, () => {
    console.log(`Working at port ${config.server.port}`)
})