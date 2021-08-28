var express = require('express')
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs')
const path = require('path');
const intializeFirebase = require('./api/intializeFirebase');
const login = require('./api/login');
var app = express()
var port = process.env.PORT || 5000
var link = require('./config.json').link;
const {
  Router
} = require('express');
const register = require('./api/register');
const getUserData = require('./api/getUserDataSql');
const getUserUid = require('./api/getUserUid');
const {
  Socket
} = require('dgram');
const {
  FILE
} = require('dns');
var server = require("http").createServer(app)
var io = require('socket.io')(server, {
  cors: {
    origin: '*'
  }
})



//uses


app.use(express.json());
app.use(express.urlencoded({
  extended: false
}));

app.use(cookieParser('secret'))
app.use("/public", express.static(path.join(__dirname, '/html/public')));
app.use(bodyParser())
app.use(cors());
app.engine('html', require('ejs').renderFile);
app.set('view engine', 'html');
app.set('socketio', io)
app.set('trust proxy', 'loopback, linklocal, uniquelocal')
app.enable('trust proxy')
server.listen(port, '0.0.0.0', () => console.log('Listening on: ' + port))


app.get('/', async (req, res) => {
  //NGNIX MUSS NOCH EINGESTELLT WERDEN!
  var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  console.log(ip)
  //Check if already logged in
  var a = (await check(req.cookies.session)).login
  if (a) {
    //logged in
    var userObject;
    var uid = await (await getUserUid(req.cookies.session)).uid
    var newDb = (await getUserData(uid))
    newDb.db.query(newDb.sql, (err, result) => {
      //Query function --start--
      userObject = result[0]
      res.render(path.join(__dirname, 'html/index.html'), {
        link: link,
        username: userObject.username,
        email: userObject.email,
        uuid: userObject.uuid,
        rank: userObject.rang
      })
      //Query function --end--
    })


  } else {
    //Not logged in
    res.render(__dirname + '/html/login.html', {
      error: false,
      link: link,
      message: ""
    })
  }

})



//ticketSystem

app.post("/api/loadTicketSystem", async (req, res) => {
  var io = req.app.get("socketio")
  //Check if already logged in
  var a = (await check(req.cookies.session)).login
  if (a) {
    var userObject;
    var uid = await (await getUserUid(req.cookies.session)).uid
    var newDb = (await getUserData(uid))
    newDb.db.query(`SELECT * FROM ticketanträge`, (err, _result) => {
      if (err) throw err
      newDb.db.query(`SELECT * FROM ticketanträge WHERE uuid = '${uid}'`, (err, result_) => {
        if (err) throw err
        var ticket;
        if (result_[0] == undefined) {
          ticket = {
            exists: false
          }
        } else {
          ticket = {
            exists: true,
            uuid: result_[0].uuid,
            closed: result_[0].closed,
            claimedBy: result_[0].claimedBy,
            reason: result_[0].reason
          }
        }

        newDb.db.query(newDb.sql, (err, result) => {
          //Query function --start--
          userObject = result[0]
          res.render(__dirname + '/html/ticketSystem.html', {
            link: link,
            username: userObject.username,
            email: userObject.email,
            uuid: userObject.uuid,
            rank: userObject.rang,
            ticket: ticket,
            tickets: (userObject.rang > 0) ? _result : []
          })
          //Query function --end--
        })
      })

    })




  } else {
    res.render(__dirname + '/html/login.html', {
      error: false,
      link: link,
      message: ""
    })
  }

  io.on("connection", (socket) => {
    socket.removeAllListeners("newTicket")
    console.log("Connected: " + socket.id)
    socket.on("newTicket", (data) => {
      socket.broadcast.emit("newTicket", "a")
      console.log("newTicckettt!")
    })
  })
})


app.post('/api/createTicket', async (req, res) => {
  //Check if already logged in
  var a = (await check(req.cookies.session)).login
  if (a) {
    var userObject;
    var uid = await (await getUserUid(req.cookies.session)).uid
    var newDb = (await getUserData(uid))
    //0 -> not 1 -> yes
    newDb.db.query(`SELECT * FROM ticketanträge WHERE uuid = '${uid}'`, (err, resultExists) => {
      if (resultExists[0] == undefined) {} else {
        res.redirect('/')
        return

      }

      var data = {
        uuid: uid,
        claimedBy: "",
        reason: req.body.reason

      }
      newDb.db.query("INSERT INTO ticketanträge SET ?", data, (err, result) => {
        if (err) throw err
        newDb.db.query(newDb.sql, (err, result) => {
          //Query function --start--
          userObject = result[0]
          res.render(__dirname + '/html/ticketSystem.html', {
            link: link,
            username: userObject.username,
            email: userObject.email,
            uuid: userObject.uuid,
            rank: userObject.rang,
            ticket: {
              exists: true,
              uuid: data.uuid,
              claimedBy: data.claimedBy,
              closed: data.closed,
              reason: data.reason
            },
            tickets: []
          })
          //Query function --end--
        })
      })


    })






  } else {
    res.render(__dirname + '/html/login.html', {
      error: false,
      link: link,
      message: ""
    })
  }
})


app.get('/api/loadTicketChat/:uid', async (req, res) => {
  var io = req.app.get('socketio');

  //Check if already logged in
  var a = (await check(req.cookies.session)).login
  if (a) {
    var userObject;
    var uid = await (await getUserUid(req.cookies.session)).uid
    var newDb = (await getUserData(uid))
    newDb.db.query(`SELECT * FROM ticketanträge WHERE uuid = '${req.params.uid}'`, (err, result_) => {
      if (err) throw err
      var ticket;
      if (result_[0] == undefined) {
        res.redirect('/')
        return
      } else {

        ticket = {
          exists: true,
          uuid: result_[0].uuid,
          closed: result_[0].closed,
          claimedBy: result_[0].claimedBy,
          reason: result_[0].reason
        }
      }


      newDb.db.query(newDb.sql, (err, result) => {
        //Query function --start--
        userObject = result[0]
        if (userObject.rang == 0 && userObject.uuid != req.params.uid) {
          console.log(userObject)
          res.redirect('/')
        } else {
          //loadChat

          newDb.db.query(`SELECT * FROM ticketmessages WHERE uuid = '${req.params.uid}'`, (err, result) => {
            if (err) throw err

            var insertedMsg = []
            var insertMsg = () => {
              result.forEach((e) => {
                insertedMsg.push({
                  rang: e.rank,
                  username: e.username,
                  uuid: e.uuid,
                  message: e.message
                })
              })
            }
            insertMsg()
            console.log(insertedMsg)
            res.render(__dirname + '/html/ticketChat', {
              title: result_[0].reason,
              link: link,
              uid: uid,
              claimedBy: result_[0].claimedBy,
              chatMessages: insertedMsg,
              ticketUid: result_[0].uuid,
              support: (userObject.rang > 0) ? true : false,
              admin: (userObject.rang > 1) ? true : false,
              username: userObject.username,
              displayName: userObject.username

            })
          })




        }



        //Query function --end--
      })
    })



  } else {
    res.render(__dirname + '/html/login.html', {
      error: false,
      link: link,
      message: ""
    })
  }


  //Socket.io

  io.on("connection", (socket) => {

    socket.removeAllListeners(`message/${req.params.uid}`)



    socket.on(`close/${req.params.uid}`, () => {
      newDb.db.query(`SELECT * FROM ticketanträge WHERE uuid = '${req.params.uid}'`, (err, results) => {

        if (results[0] == undefined) {
          socket.emit(`close/${req.params.uid}`, "awdadw")
          return
        }
      })
    })




    socket.on(`message/${req.params.uid}`, (data) => {
      if (data.msg == "") {
        return
      }
      newDb.db.query(`SELECT * FROM ticketanträge WHERE uuid = '${req.params.uid}'`, (err, results) => {

        if (results[0] == undefined) {
          socket.emit(`message/${req.params.uid}`, {
            message: "Deine Nachricht wurde nicht abgeschickt, da das Ticket geschlossen wurde! Lade deine Seite neu!",
            username: "RushDevs | BOT",
            rank: 2
          })
          return
        }
        if (userObject.rang == 0 && userObject.uuid != req.params.uid) {
          socket.emit(`message/${req.params.uid}`, {
            message: "Deine Nachricht wurde nicht abgeschickt, da das Ticket geschlossen wurde! Lade deine Seite neu!",
            username: "RushDevs | BOT",
            rank: 2
          })
          return
        }
        var newData = {
          message: data.msg,
          username: userObject.username,
          rank: userObject.rang
        }
        var insertingData = {
          uuid: req.params.uid,
          username: userObject.username,
          rank: userObject.rang,
          id: 0,
          message: data.msg
        }
        socket.broadcast.emit(`message/${req.params.uid}`, newData)
        newDb.db.query(`INSERT INTO ticketmessages SET ?`, insertingData, (err) => {
          if (err) throw err
        })
      })







    })

  })



})

app.post('/api/claimTicket', async (req, res) => {
  //Check if already logged in
  var a = (await check(req.cookies.session)).login
  if (a) {
    var userObject;
    var uid = await (await getUserUid(req.cookies.session)).uid
    var newDb = (await getUserData(uid))

    //--------


    newDb.db.query(newDb.sql, (err, result) => {
      newDb.db.query(`SELECT * FROM ticketanträge WHERE uuid = '${req.body.uid}'`, (err, result2) => {
        var userObject = result[0]

        var data = {
          claimedBy: uid
        }

        if (userObject.rang > 1) {
          newDb.db.query(`UPDATE ticketanträge SET ? WHERE uuid = '${req.body.uid}'`, data, (err, result1) => {
            if (err) throw err
            res.redirect(`${link}api/loadTicketChat/${req.body.uid}`)
          })
        } else if (userObject.rang == 1) {
          if (result2[0].claimedBy == '' || result2[0].claimedBy === null) {
            newDb.db.query(`UPDATE ticketanträge SET ? WHERE uuid = '${req.body.uid}'`, data, (err, result1) => {
              if (err) throw err
              res.redirect(`${link}api/loadTicketChat/${req.body.uid}`)
            })
          } else {
            res.redirect('/')
          }
        } else {
          res.redirect('/')
        }
      })


    })



    //--------


  } else {
    res.render(__dirname + '/html/login.html', {
      error: false,
      link: link,
      message: ""
    })
  }

})


app.post('/api/closeTicket', async (req, res) => {
  var io = req.app.get("socketio")
  //Check if already logged in
  var a = (await check(req.cookies.session)).login
  if (a) {
    var userObject;
    var uid = await (await getUserUid(req.cookies.session)).uid
    var newDb = (await getUserData(uid))

    //--------


    newDb.db.query(newDb.sql, (err, result) => {
      newDb.db.query(`SELECT * FROM ticketanträge WHERE uuid = '${req.body.uid}'`, (err, result2) => {
        var userObject = result[0]


        if (userObject.rang > 1) {
          newDb.db.query(`DELETE ticketanträge WHERE uuid = '${req.body.uid}'`, (err, result1) => {
            if (err) throw err
            newDb.db.query(`DELETE FROM ticketmessages WHERE uuid = '${req.body.uid}'`)
            res.redirect('/')
          })
          io.on("connection", (socket) => {
            socket.emit(`close/${req.body.uid}`, "adwwda")
          })
        } else if (userObject.rang == 1) {
          if (result2[0].claimedBy == uid) {
            newDb.db.query(`DELETE FROM ticketanträge WHERE uuid = '${req.body.uid}'`, (err, result1) => {
              if (err) throw err
              newDb.db.query(`DELETE FROM ticketmessages WHERE uuid = '${req.body.uid}'`)
              res.redirect("/")
            })
            io.on("connection", (socket) => {
              socket.emit(`close/${req.body.uid}`, "awdadw")
            })

          } else {
            res.redirect('/')
          }
        } else {
          res.redirect('/')
        }
      })


    })



    //--------


  } else {
    res.render(__dirname + '/html/login.html', {
      error: false,
      link: link,
      message: ""
    })
  }
})





//Settings
app.post('/api/loadSettings', async (req, res) => {
  //Check if already logged in
  var userObject;
  var a = (await check(req.cookies.session)).login
  if (a) {
    var uid = (await getUserUid(req.cookies.session)).uid
    var newDb = (await getUserData(uid))

    newDb.db.query(`SELECT * FROM securitynotify WHERE uuid = '${uid}'`, (err, result1) => {
      var securityNotifyObj = result1[0]
      if (err) throw err
      newDb.db.query(`SELECT * FROM emailnotify WHERE uuid = '${uid}'`, (err, result2) => {
        var emailNotifyObj = result2[0]
        if (err) throw err
        newDb.db.query(newDb.sql, (err, result) => {
          //Query function --start--
          userObject = result[0]
          try {
            res.render(__dirname + '/html/settings.html', {
              notifyButton: false,
              userButton: false,
              link: link,
              username: userObject.username,
              email: userObject.email,
              uuid: userObject.uuid,
              rank: userObject.rang,
              err: false,
              errEmail: false,
              name: userObject.name,
              motivation: userObject.motivation,
              usernameChanged: userObject.changedUsername,
              securityNotify: {
                pwChanged: securityNotifyObj.passwordChanged,
                newLogin: securityNotifyObj.newLogin
              },
              emailNotify: {
                events: emailNotifyObj.events,
                news: emailNotifyObj.news,
                offers: emailNotifyObj.offers,
                adverts: emailNotifyObj.adverts
              }
            })
          } catch (err) {
            throw err
          }
          //Query function --end--
        })
      })
    })



  } else {
    res.render(__dirname + '/html/login.html', {
      error: false,
      link: link,
      message: ""
    })
  }
})


app.post('/api/updateProfile', async (req, res) => {
  //Check if already logged in
  var a = (await check(req.cookies.session)).login
  if (a) {
    var userObject;
    var uid = (await getUserUid(req.cookies.session)).uid
    var newDb = (await getUserData(uid))
    var newProfile = {
      name: req.body.name,
      motivation: req.body.motivation
    }
    if (req.body.name == "") {
      res.redirect('/')
    } else newDb.db.query("UPDATE users SET ? WHERE uuid = '" + uid + "'", newProfile, (err, result) => {
      newDb.db.query(`SELECT * FROM securitynotify WHERE uuid = '${uid}'`, (err, result1) => {
        var securityNotifyObj = result1[0]
        if (err) throw err
        newDb.db.query(`SELECT * FROM emailnotify WHERE uuid = '${uid}'`, (err, result2) => {
          var emailNotifyObj = result2[0]
          if (err) throw err
          newDb.db.query(newDb.sql, (err, result) => {
            //Query function --start--
            userObject = result[0]
            res.render(__dirname + '/html/settings.html', {
              notifyButton: false,
              userButton: false,
              link: link,
              username: userObject.username,
              email: userObject.email,
              uuid: userObject.uuid,
              rank: userObject.rang,
              err: false,
              errEmail: false,
              name: userObject.name,
              motivation: userObject.motivation,
              usernameChanged: userObject.changedUsername,
              securityNotify: {
                pwChanged: securityNotifyObj.passwordChanged,
                newLogin: securityNotifyObj.newLogin
              },
              emailNotify: {
                events: emailNotifyObj.events,
                news: emailNotifyObj.news,
                offers: emailNotifyObj.offers,
                adverts: emailNotifyObj.adverts
              }
            })
            //Query function --end--
          })
        })
      })
    })



  } else res.render(__dirname + '/html/login.html', {
      error: false,
      link: link,
      message: ""
    })
  
})


app.post('/api/changeUsername', async (req, res) => {
  if (req.body.username == "") {
    res.redirect('/')
  } else {
    //Check if already logged in
    var a = (await check(req.cookies.session)).login
    if (a) {
      var userObject;
      var uid = await (await getUserUid(req.cookies.session)).uid
      var newDb = (await getUserData(uid))
      newDb.db.query(newDb.sql, (err, result) => {
        //Query function --start--
        userObject = result[0]
        if (userObject.changedUsername == 0) {
          var changes = {
            username: req.body.username,
            changedUsername: 1
          }
          newDb.db.query("UPDATE users SET ? WHERE uuid = '" + uid + "'", changes, (err, result) => {
            newDb.db.query(`SELECT * FROM securitynotify WHERE uuid = '${uid}'`, (err, result1) => {
              var securityNotifyObj = result1[0]
              if (err) throw err
              newDb.db.query(`SELECT * FROM emailnotify WHERE uuid = '${uid}'`, (err, result2) => {
                var emailNotifyObj = result2[0]
                if (err) throw err
                newDb.db.query(newDb.sql, (err, result) => {
                  //Query function --start--
                  userObject = result[0]
                  res.render(__dirname + '/html/settings.html', {
                    notifyButton: false,
                    userButton: true,
                    link: link,
                    username: userObject.username,
                    email: userObject.email,
                    uuid: userObject.uuid,
                    rank: userObject.rang,
                    err: false,
                    errEmail: false,
                    name: userObject.name,
                    motivation: userObject.motivation,
                    usernameChanged: userObject.changedUsername,
                    securityNotify: {
                      pwChanged: securityNotifyObj.passwordChanged,
                      newLogin: securityNotifyObj.newLogin
                    },
                    emailNotify: {
                      events: emailNotifyObj.events,
                      news: emailNotifyObj.news,
                      offers: emailNotifyObj.offers,
                      adverts: emailNotifyObj.adverts
                    }
                  })
                  //Query function --end--
                })
              })
            })

          })

        } else res.redirect('/')
        //Query function --end--
      })


    } else res.render(__dirname + '/html/login.html', {
        error: false,
        link: link,
        message: ""
      })
  }
})



app.post('/api/deleteAccount', async (req, res) => {

  //Check if already logged in
  var a = (await check(req.cookies.session)).login
  if (a) {
    var userObject;
    var adminF = intializeFirebase().admin
    var uid = await (await getUserUid(req.cookies.session)).uid
    var newDb = (await getUserData(uid))
    newDb.db.query("DELETE FROM users WHERE uuid = '" + uid + "'", async (err, result) => {
      res.clearCookie("session")
      var del = await adminF.auth().deleteUser(uid)
      res.redirect('/')
    })


  } else res.render(__dirname + '/html/login.html', {
      error: false,
      link: link,
      message: ""
    })
})

app.post('/api/changePassword', async (req, res) => {
  var a = await (await check(req.cookies.session)).login
  try {
    var userObject;
    var uid = await (await getUserUid(req.cookies.session)).uid
    var newDb = (await getUserData(uid))
    check(req.cookies.session)
    if (a) {

    } else {
      res.render(__dirname + '/html/login.html', {
        error: false,
        link: link,
        message: ""
      })
      return
    }


    newDb.db.query(`SELECT * FROM securitynotify WHERE uuid = '${uid}'`, (err, result1) => {
      var securityNotifyObj = result1[0]
      if (err) throw err
      newDb.db.query(`SELECT * FROM emailnotify WHERE uuid = '${uid}'`, async (err, result2) => {
        var emailNotifyObj = result2[0]
        if (err) throw err
        newDb.db.query(newDb.sql, async (err, result) => {
          //Query function --start--
          userObject = result[0]

          if (req.body.password != req.body.password2) {
            res.render(__dirname + '/html/settings.html', {
              notifyButton: false,
              userButton: false,
              link: link,
              username: userObject.username,
              email: userObject.email,
              uuid: userObject.uuid,
              rank: userObject.rang,
              err: true,
              message: "Deine Passwörter stimmen nicht überein!",
              errEmail: true,
              name: userObject.name,
              motivation: userObject.motivation,
              usernameChanged: userObject.changedUsername,
              securityNotify: {
                pwChanged: securityNotifyObj.passwordChanged,
                newLogin: securityNotifyObj.newLogin
              },
              emailNotify: {
                events: emailNotifyObj.events,
                news: emailNotifyObj.news,
                offers: emailNotifyObj.offers,
                adverts: emailNotifyObj.adverts
              }
            })
          } else if (req.body.password.length < 7) {
            res.render(__dirname + '/html/settings.html', {
              notifyButton: false,
              userButton: false,
              link: link,
              username: userObject.username,
              email: userObject.email,
              uuid: userObject.uuid,
              rank: userObject.rang,
              err: true,
              message: "Dein Passwort muss mindestens 7 Zeichen haben!",
              errEmail: true,
              name: userObject.name,
              motivation: userObject.motivation,
              usernameChanged: userObject.changedUsername,
              securityNotify: {
                pwChanged: securityNotifyObj.passwordChanged,
                newLogin: securityNotifyObj.newLogin
              },
              emailNotify: {
                events: emailNotifyObj.events,
                news: emailNotifyObj.news,
                offers: emailNotifyObj.offers,
                adverts: emailNotifyObj.adverts
              }
            })
          } else {
            var a = (await check(req.cookies.session)).login
            //Check again for login
            if (a) {
              //Change password
              var admin = intializeFirebase().admin
              var newPw = await admin.auth().updateUser(uid, {
                password: req.body.password
              })
              //logout
              res.clearCookie("session")
              res.redirect('/')
            } else {
              res.render(__dirname + '/html/login.html', {
                error: false,
                link: link,
                message: ""
              })
            }
          }

        })
        //Query function --end--
      })
    })
  } catch (err) {
    if (err) throw err
  }
})



app.post('/api/updateNotifications', async (req, res) => {
  var notifyObj_ = {
    securityNotify: {
      passwordChanged: (req.body.pwChanged) ? 1 : 0,
      newLogin: (req.body.newLogin) ? 1 : 0,
    },
    emailNotify: {
      events: (req.body.events) ? 1 : 0,
      adverts: (req.body.adverts) ? 1 : 0,
      news: (req.body.news) ? 1 : 0,
      offers: (req.body.offers) ? 1 : 0
    }
  }

  //Check if already logged in
  var userObject;
  var a = (await check(req.cookies.session)).login
  if (a) {
    var uid = (await getUserUid(req.cookies.session)).uid
    var newDb = (await getUserData(uid))
    newDb.db.query(`UPDATE securitynotify SET ? WHERE uuid = '${uid}'`, notifyObj_.securityNotify, async (err, result0) => {
      if (err) throw err
      newDb.db.query(`UPDATE emailnotify SET ? WHERE uuid = '${uid}'`, notifyObj_.emailNotify, async (err, result12) => {
        if (err) throw err

        newDb.db.query(`SELECT * FROM securitynotify WHERE uuid = '${uid}'`, async (err, result1) => {
          var securityNotifyObj = result1[0]
          if (err) throw err
          newDb.db.query(`SELECT * FROM emailnotify WHERE uuid = '${uid}'`, async (err, result2) => {
            var emailNotifyObj = result2[0]
            if (err) throw err
            newDb.db.query(newDb.sql, (err, result) => {
              //Query function --start--
              userObject = result[0]
              res.render(__dirname + '/html/settings.html', {
                notifyButton: true,
                userButton: false,
                link: link,
                username: userObject.username,
                email: userObject.email,
                uuid: userObject.uuid,
                rank: userObject.rang,
                err: false,
                errEmail: false,
                name: userObject.name,
                motivation: userObject.motivation,
                usernameChanged: userObject.changedUsername,
                securityNotify: {
                  pwChanged: securityNotifyObj.passwordChanged,
                  newLogin: securityNotifyObj.newLogin
                },
                emailNotify: {
                  events: emailNotifyObj.events,
                  news: emailNotifyObj.news,
                  offers: emailNotifyObj.offers,
                  adverts: emailNotifyObj.adverts
                }
              })
              //Query function --end--
            })
          })
        })

      })
    })




  } else {
    res.render(__dirname + '/html/login.html', {
      error: false,
      link: link,
      message: ""
    })
  }


})




app.post('/api/loadNav', async (req, res) => {
  //Check if already logged in
  var a = (await check(req.cookies.session)).login
  if (a) {
    var userObject;
    var uid = await (await getUserUid(req.cookies.session)).uid
    var newDb = (await getUserData(uid))
    newDb.db.query(newDb.sql, (err, result) => {
      //Query function --start--
      userObject = result[0]
      res.render(__dirname + '/html/sidebar.html', {
        link: link,
        username: userObject.username,
        email: userObject.email,
        uuid: userObject.uuid,
        rank: userObject.rang,
        err: false
      })
      //Query function --end--
    })


  } else {
    res.render(__dirname + '/html/login.html', {
      error: false,
      link: link,
      message: ""
    })
  }
})



app.get('/login', async (req, res) => {
  //Check if already logged in
  var a = (await check(req.cookies.session)).login
  if (a) res.redirect('/')
  res.render(__dirname + '/html/login.html', {
    error: false,
    link: link,
    message: ""
  })
})
app.get('/register', async (req, res) => {
  //Check if already logged in
  var a = (await check(req.cookies.session)).login
  if (a) res.redirect('/')
  res.render(__dirname + '/html/register.html', {
    error: false,
    link: link,
    message: ""
  })
})


app.post('/api/login', async (req, res, next) => {
  //Check if already logged in
  var a = await (await check(req.cookies.session)).login
  if (a) {
    res.redirect('/')
  }
  //Firebase 
  var admin = intializeFirebase().admin

  //Cookie shit
  const expiresIn = 60 * 60 * 24 * 5 * 1000;

  const options = {
    maxAge: expiresIn,
    httpOnly: true,
    secure: false
  };

  var sessionCookie = (await login(req.body.email, req.body.password)).sessionCookie
  var isErr = await (await login(req.body.email, req.body.password)).isErr
  //Check for error
  if (isErr) {
    res.render(__dirname + '/html/login.html', {
      error: true,
      message: 'Die Daten stimmen nicht überein!',
      link: link
    })
  } else {
    res.cookie('session', sessionCookie, options);
    res.redirect('/')
  }
})

//Register

app.post('/api/register', async (req, res) => {
  //Check if already logged in
  var a = await (await check(req.cookies.session)).login
  if (a) {
    res.redirect('/')
  }
  //Firebase
  var admin = intializeFirebase().admin

  //All errorcodes (server-side)
  if (req.body.name == "") {
    res.render(__dirname + '/html/register.html', {
      error: true,
      message: 'Fülle alle Felder aus!',
      link: link
    })
  }
  if (req.body.password == "" || req.body.password2 == "") {
    res.render(__dirname + '/html/register.html', {
      error: true,
      message: 'Fülle alle Felder aus!',
      link: link
    })
  } else if (req.body.email == "" || req.body.nutzername == "") {
    res.render(__dirname + '/html/register.html', {
      error: true,
      message: 'Fülle alle Felder aus!',
      link: link
    })
  } else if (req.body.password != req.body.password2) {
    res.render(__dirname + '/html/register.html', {
      error: true,
      message: 'Die Passwörter stimmen nich überein!',
      link: link
    })
    return
  } else if (req.body.password.length < 7) {
    res.render(__dirname + '/html/register.html', {
      error: true,
      message: 'Dein Passwort muss mindestens 7 Zeichen enthalten!',
      link: link
    })
    return
  } else if (req.body.nutzername.length > 10) {
    res.render(__dirname + '/html/register.html', {
      error: true,
      message: 'Dein Benutzername hat über 10 Charackter',
      link: link
    })
    return
  }


  try {
    var ip = req.ip
    var admin = intializeFirebase().admin
    var reg = (await register(req.body.email, req.body.password, req.body.nutzername, req.body.name, ip))

    //Some Cookie shit
    const expiresIn = 60 * 60 * 24 * 5 * 1000;

    const options = {
      maxAge: expiresIn,
      httpOnly: true,
      secure: false
    };
    var sessionCookieRegister = reg.sessionCookie
    res.cookie('session', sessionCookieRegister, options)




    //if error (firebase-side)
    var isErr = reg.isErr
    var err = reg.err
    if (isErr) {
      //error codes (firebase-side)
      if (err.code == "auth/weak-password") {
        res.render(__dirname + '/html/register.html', {
          error: true,
          message: 'Die Passwörter sollten mindestens 6 Zeichen haben!',
          link: link
        })
      }
      if (err.code == "auth/invalid-email") {
        res.render(__dirname + '/html/register.html', {
          error: true,
          message: 'Die E-Mail existiert nicht!',
          link: link
        })
      }
      if (err.code == "auth/email-already-exists") {
        res.render(__dirname + '/html/register.html', {
          error: true,
          message: 'Die E-Mail existiert bereits!',
          link: link
        })
      }




      return
    }
  } catch (err) {
    //other error (that werent predicted!)
    if (err.code == "auth/weak-password") {
      res.render(__dirname + '/html/register.html', {
        error: true,
        message: 'Die Passwörter sollten mindestens 6 Zeichen haben!',
        link: link
      })
    }
    if (err.code == "auth/invalid-email") {
      res.render(__dirname + '/html/register.html', {
        error: true,
        message: 'Die E-Mail existiert nicht!',
        link: link
      })
    }
    if (err.code == "auth/email-already-in-use") {
      res.render(__dirname + '/html/register.html', {
        error: true,
        message: 'Die E-Mail existiert bereits!',
        link: link
      })
    } else {
      res.render(__dirname + '/html/register.html', {
        error: true,
        message: 'Ein unbekannter Fehler ist aufgetreten, kontaktieren sie den Support unverzüglich! (' + err.message + ')',
        link: link
      })
    }
  }
  if (!isErr) {
    res.redirect('/')
  }


})

app.post('/api/logout', (req, res) => {
  res.clearCookie("session")
  res.redirect('/')
})


//functions

async function check(sessionCookie) {

  var admin = intializeFirebase().admin
  try {
    var decodedClaims = await admin.auth().verifySessionCookie(sessionCookie, true)
    var email
    email = decodedClaims.email
    return {
      login: true
    }
  } catch {
    return {
      login: false
    }
  }

}

//404 

app.get('*', (req, res) => {
  res.sendFile(__dirname + '/html/404.html')
})