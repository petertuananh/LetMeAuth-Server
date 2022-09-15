const express = require('express');
const app = express()
const path = require('path')
const bodyParser = require('body-parser')
const cookieParser = require('cookie-parser');
const config = require("./config.json")
const mysql = require("mysql");
const crypto = require("crypto")
const twofactor = require("node-2fa");
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

// raw
const scopes = [
    "email",
    "identify"
]

// routes


// portal
app.get("/portal", checkAuth, async (req, res) => {
    res.send("hi")
})

app.get("/signup", async (req, res) => {
    return res.render("pages/signup")
})
app.post("/signup", async (req, res) => {
    const data = req.body
    if (!data.name) return res.json({ code : 400, msg : "Missing application name!" })
    if (!data.email) return res.json({ code : 400, msg : "Missing email addess!" })
    if (!data.username) return res.json({ code : 400, msg : "Missing username!" })
    if (!data.password) return res.json({ code : 400, msg : "Missing password!" })
    con.query(`SELECT * FROM ${data.name}`,async function (err, result) {
        if (result) return res.json({ code : 400, msg : "This application has been defined!" })
        const user_id = makeInt(17)
        const app_id = makeInt(17)
        con.query(`CREATE TABLE IF NOT EXISTS ${data.name} (id TEXT NOT NULL, flags TEXT NOT NULL, email TEXT NOT NULL, username TEXT NOT NULL, token TEXT NOT NULL, 2fa TEXT NOT NULL, createAT TEXT NOT NULL, avatar TEXT NOT NULL, banner TEXT NOT NULL, color TEXT NOT NULL)`,d => {
            const token = makeToken({ id : user_id , password : data.password, app_id : app_id })
            con.query(`INSERT INTO ${data.name}(id, flags, email, username, token, 2fa, createAT, avatar, banner, color) VALUES (${user_id}, "['admin']", "${data.email}", "${data.username}", "${token}", "", ${Date.now()}, "", "", "")`)
            con.query(`INSERT INTO application(id, name, createAT, icon) VALUES (${app_id}, "${data.name}", ${Date.now()}, "")`)
        })
    })
})
app.get("/login", async (req, res) => {
    return res.render(`pages/login`, {
        appShowEnter : req.query.application_id ? false : true
    })
})
app.get("/oauth2/checktoken", async (req, res) => {
    const query = req.query
    if (!query.token) return res.json({ code : 400, msg : "Invalid token!" })
    if (!query.application_id) return res.json({ code : 400, msg : "Invalid application id!" })
    con.query(`SELECT * FROM application WHERE id=${query.application_id} `,async function (err, res1) {
        if (!res1[0]) return res.json({ code : 400, msg : "Unknown application!" })
        con.query(`SELECT * FROM ${res1[0].name} WHERE token="${query.token}"`,async function (err, res2) {
            if (!res2[0]) return res.json({ code : 400, msg : "Can not find this user!" })
            const rawData = {
                id : res2[0].id,
                flags : res2[0].flags,
                email : res2[0].email,
                username : res2[0].username,
                // 2fa : res2[0].2fa
                createAT : res2[0].createAT,
                avatar : res2[0].avatar,
                banner : res2[0].banner,
                color : res2[0].color
            }
            return res.json(rawData)
        })
    })
})
app.get("/oauth2/authorize", async (req, res) => {
    const query = req.query
    const app_id = query.application_id
    if (!query.redirect) {
        return res.json({ code : 400, msg : "Invalid redirect url!" })
    // if (!scopes.includes(query.scope)) {
    //     return res.json({ code : 400, msg : "Invalid scope!" })
    } else {
        con.query(`SELECT * FROM application WHERE id=${app_id} `,async function (err, res1) {
            if (!res1[0]) return res.json({ code : 400, msg : "Unknown application!" })
            return res.render("pages/authorize")
        })
    }
})
app.post("/oauth2/authorize", async (req, res) => {
    const query = req.query
    const app_id = query.application_id
    if (!query.redirect) {
        return res.json({ code : 400, msg : "Invalid redirect url!" })
    // if (!scopes.includes(query.scope)) {
    //     return res.json({ code : 400, msg : "Invalid scope!" })
    } else {
        
        con.query(`SELECT * FROM application WHERE id=${app_id} `,async function (err, res1) {
            if (!res1[0]) return res.json({ code : 400, msg : "Unknown application!" })
            
            con.query(`SELECT * FROM ${res1[0].name} WHERE email="${req.body.email}"`,async function (err, res2) {
                if (!res2[0]) return res.json({ code : 400, msg : "Can not find this user!" })
                const tokenInput = makeToken({ id : res2[0].id, password : req.body.password, app_id : res1[0].id })
                if (tokenInput !== res2[0].token) return res.json({ code : 400, msg : "Invalid email or password!" })
                return res.redirect(`${query.redirect}?token=${res2[0].token}`)
            })
        })
    }
})


// functions
async function checkAuth(req, res, next) {
    // const token = req.cookies.token
    // if (!token) return res.redirect(`/login${req.query.application_id ? `?application_id=${req.query.application_id}` : ''}`)
    // const app_id = req.query.application_id
    // con.query(`SELECT * FROM application WHERE id=${app_id} `,async function (err, res1) {
    //     if (!res1[0]) return res.json({ code : 400, msg : "Unknown application!" })
    //     con.query(`SELECT * FROM ${res[0].name} WHERE token=${token}`,async function (err, res2) {
    //         if (!res2[0]) return res.redirect(`/login${req.query.application_id ? `?application_id=${req.query.application_id}` : ''}`)
    //         return next()
    //     })
    // })
}

function makeString(length) {
    var result           = '';
    var characters       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    var charactersLength = characters.length;
    for ( var i = 0; i < length; i++ ) {
    result += characters.charAt(Math.floor(Math.random() * 
        charactersLength));
    }
    return result;
}
function makeToken(target) {
    const token = crypto.createHmac("sha256", `${target.id}-${target.password}-${target.app_id}-#@*#&%#%^%#$#`).update(`${target.id}-${target.password}-${target.app_id}-#@*#&%#%^%#$#`).digest("hex");
    return token
}
function makeInt(length) {
    var result           = '';
    var characters       = '0123456789';
    var charactersLength = characters.length;
    for ( var i = 0; i < length; i++ ) {
    result += characters.charAt(Math.floor(Math.random() * 
        charactersLength));
    }
    return result;
}
app.listen(config.server.port)