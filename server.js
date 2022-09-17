const express = require('express');
const app = express()
const path = require('path')
const bodyParser = require('body-parser')
const cookieParser = require('cookie-parser');
const config = require("./config.json")
const mysql = require("mysql");
const crypto = require("crypto")
const twofactor = require("node-2fa");
var expressSession = require('express-session');
var passport = require('passport');
var passportLocal = require('passport-local');

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
app.set('title', 'Let Me Auth');
app.use(cookieParser())
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(bodyParser.raw()); app.set('view engine', 'ejs');
const dataDir = path.resolve(`${process.cwd()}${path.sep}views`);
app.use("/assets", express.static(path.resolve(`${dataDir}${path.sep}assets`)));
app.use(expressSession({ 
    secret: '#@*#&%#%^%#$##@*#&%#%^%#$##@*#&%#%^%#$#',
    resave: true,
    saveUninitialized: true
}))
app.use(passport.initialize());
app.use(passport.session());
// raw
var scopes = ['identify', 'email', 'guilds', 'guilds.join', 'guilds.members.read'];
var prompt = 'consent'

passport.use('letmeauth', new passportLocal.Strategy(
    {
        usernameField : 'username',
        passwordField : 'password',
        session : true,
    },
    function (username, password, done) {
        con.query(`SELECT * FROM USER WHERE email="${username}"`,async function (err, user) {
            if (!user[0]) return done(null, false, { message: 'Incorrect username or password.' })
            const tokenInput = makeToken({ id : user[0].id, password : password })
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

app.get("/", checkAuth, async (req, res) => {
    res.render("pages/home", {
        req : req
    })
})

app.post('/auth/callback',
    passport.authenticate('letmeauth', { 
        failureRedirect: '/auth/login',
        failureMessage: true
    }),function(req, res) {
        con.query(`SELECT * FROM USER WHERE id=${req.user.id}`,async function (err, user) {
            const verifyToken = await twofactor.verifyToken(user[0].twofactor, req.body.twofactor);
            if (verifyToken) {
                con.query(`INSERT INTO 2FA(user_id, session_id, code) VALUES (${req.user.id}, "${req.session.id}", ${req.body.twofactor})`)
                return res.redirect(req.cookies.redirect ? req.cookies.redirect : '/');
            } else {
                return res.render("pages/auth/login", { msg : 'Invalid 2FA code' })
            }
        })
        

        
});

app.get("/auth/login", async (req, res) => {
    res.render("pages/auth/login", {
        msg : req.session.messages || 'no'
    })
});

app.get("/register", async (req, res) => {
    res.render("pages/auth/register", { msg : null })
});
app.post("/register", async (req, res) => {
    const data = req.body
    con.query(`SELECT * FROM USER WHERE email="${data.email}"`,async function (err, email) {
        if (email[0]) return res.render("pages/auth/register", { msg : "This email is aready in use!" })
        con.query(`SELECT * FROM USER WHERE username="${data.username}"`,async function (err, username) {
            if (username[0]) return res.render("pages/auth/register", { msg : "This username is aready in use!" })
            const user_id = makeInt(17)
            const token = makeToken({ id : user_id , password : data.password })
            const newSecret = twofactor.generateSecret({ name: "Let Me Auth", account: user_id });
            con.query(`INSERT INTO USER(id, flags, email, username, token, twofactor, createAT, avatar, banner, color) VALUES (${user_id}, "", "${data.email}", "${data.username}", "${token}", "${newSecret.secret}", ${Date.now()}, "", "", "")`)
            return res.send(`Please setup your 2 factor authentication with this code : ${newSecret.secret} <img src="${newSecret.qr}" alt="">`)
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
        con.query(`SELECT * FROM APPLICATION WHERE id="${query.app_id}"`,async function (err, application) {
            if (!application[0]) return res.send("Unknown application!")
            con.query(`SELECT * FROM ACCESS_TOKEN WHERE access_token="${query.token}"`,async function (err, access_token) {
                if (!access_token[0]) return res.send("Unknown token!")
                con.query(`SELECT * FROM USER WHERE id="${access_token[0].user_id}"`,async function (err, user) {
                    if (!user[0]) return res.send("Unknown user!")
                    const rawData = {
                        id : user[0].id,
                        username : user[0].username,
                        email : user[0].email,
                        twofactor : user[0].twofactor ? true : false,
                        createAT: user[0].createAT,
                        avatar : user[0].avatar,
                        banner : user[0].banner,
                        color : user[0].color
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
        con.query(`SELECT * FROM APPLICATION WHERE id="${query.app_id}"`,async function (err, application) {
            if (!application[0]) return res.send("Unknown application!")
            const access_token = makeTokenApp({ id : req.user.id, app_id : application[0].id })
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
        con.query(`SELECT * FROM APPLICATION WHERE id="${query.app_id}"`,async function (err, application) {
            if (!application[0]) return res.send("Unknown application!")
            res.render("pages/oauth2/authorize", {
                app_id : application[0].id,
                app_name : application[0].name,
                msg : null,
                callback_url : query.redirect_url,
                app_icon : application[0].icon
            })
        })
    }
});
app.get("/application", checkAuth, async (req, res) => {
    res.render("pages/application/apps", { msg : req.query.msg })
})

app.post("/application/create", checkAuth, async (req, res) => {
    const data = req.body
    con.query(`SELECT * FROM APPLICATION WHERE name="${data.name}"`,async function (err, application) {
        if (application[0]) return res.redirect("/application?msg='This application name aready registered!'")
        const app_id = makeInt(17)
        await con.query(`DELETE FROM PERMISSION WHERE user_id=${req.user.id} && app_id=${app_id}`)
        con.query(`INSERT INTO APPLICATION(id, name, createAT, icon, redirect_url, icon_url, allow_authorize) VALUES (${app_id}, "${data.name}", ${Date.now()}, "", "", "", "true")`)
        con.query(`INSERT INTO PERMISSION(user_id, app_id, permission) VALUES (${req.user.id}, ${app_id}, 8)`)
        return res.redirect(`/application/${app_id}/overview`)
    })
})

app.get("/application/:app_id/:target", checkAuth, async (req, res) => {
    const app_id = req.params.app_id
    con.query(`SELECT * FROM APPLICATION WHERE id=${app_id}`,async function (err, application) {
        if (!application[0]) return res.redirect("/application?msg='Can't find this application!'")
        con.query(`SELECT * FROM PERMISSION WHERE user_id=${req.user.id} && app_id=${app_id}`,async function (err, perm) {
            if (!perm[0]) return res.redirect("/application?msg='You don't have permission to manage this applicstion!'")
            if (parseInt(perm[0]) < 8) return res.redirect("/application?msg='You don't have permission to manage this applicstion!'")
            if (req.params.target == 'overview') {
                return res.render("pages/application/overview")
            } else if (req.params.target == 'perms') {

            } else {
                return res.redirect(`/application/${app_id}/overview`)
            }
        })
    })
});
async function checkAuth(req, res, next) {
    if (req.isAuthenticated()) {
        con.query(`SELECT * FROM 2FA WHERE user_id=${req.user.id} && session_id="${req.session.id}"`,async function (err, tfa) {
            if (!tfa[0]) return res.redirect("/auth/login?msg=Invalid 2fa code")
            return next()
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
app.listen(config.server.port)