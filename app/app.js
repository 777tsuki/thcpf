//你最好已经读过README了setTimeout(() => io.in(sid).socketsLeave(sid), 100);
const express = require('express');
const { Server } = require('socket.io');
const https = require('https');
const http = require('http');
const fs = require('fs');
const cookie = require("cookie");
const path = require('path');
const redisClient = require('redis');
const rs = require('jsrsasign');
const CryptoJS = require("crypto-js");
const bodyParser = require('body-parser');
const toml = require('toml');

const data = toml.parse(fs.readFileSync('./server.toml'));
const func = require('./func');
const apps = {
  account: require('./account'),
  feature: require('./feature'),
  room: require('./room')
}
const app = express();
const server = (data.ssl.active) ? https.createServer({
  key: fs.readFileSync(data.ssl.key),
  cert: fs.readFileSync(data.ssl.cert)
}, app) : http.createServer(app);
server.listen(data.server.port, () => {
  console.log(`listening on *:${data.server.port}`);
});
const io = new Server(server, {
  cors: {
    allowedHeaders: ["aheader"],
    credentials: true
  }
});
let gameFiles = fs.readdirSync('./game');
const games = gameFiles.filter((f) => { return f });
games.forEach((game) => apps[game] = require(`../game/${game}/${game}.js`));
let appFiles = fs.readdirSync('./app');
//const importapp = appFiles.filter((f) => { return f });
//games.forEach((game) => app[game] = require(`../game/${game}/${game}.js`));

const redis = redisClient.createClient(6379, data.redis.host, { auth_pass: data.redis.pwd });
redis.connect();
redis.select(data.redis.account_db);
redis.del('key');
redis.del('iv');

app.use(bodyParser.urlencoded({ limit: '10mb', extended: false }));
app.use(bodyParser.json({ limit: '10mb' }));
app.get('/', (req, res) => {
  if (req.headers.cookie) {
    let info = cookie.parse(req.headers.cookie);
    info = func.getCookie(info.info);
    if (new Date().getTime() - info.time > data.cookie.over_time) {
      info = func.setCookie({
        uuid: info.uuid,
        time: new Date().getTime()
      });
      res.cookie('info', info, { expires: new Date(Date.now() + data.cookie.age) });
    }
  }
  res.sendFile(path.resolve(__dirname, '..') + '/view/index.html');
});
app.get('/user:id', (req, res) => { });
app.use('/source', express.static('./source'));
app.use('/game', express.static('./game'));
app.use('/addon', express.static('./addon'));
app.post('/upload/img', (req, res) => apps.feature.upload(req.body, cookie.parse(req.headers.cookie), (info) => res.send(info)));
app.get('/%7B%7Bavatar%7D%7D', (req, res) => res.end());

io.on('connection', (socket) => {
  socket.data.cache = {}
  socket.on('preload', (pub) => {
    if (pub) {
      let key = func.randomStr(32),
        iv = Math.random().toString().slice(-16),
        aes = rs.hextob64(rs.KJUR.crypto.Cipher.encrypt([key, iv].toString(), rs.KEYUTIL.getKey(pub))),
        crypted = CryptoJS.AES.encrypt(JSON.stringify({ domain: data.server.domain, games: games, addons: data.addon.default }), CryptoJS.enc.Utf8.parse(key), { iv: CryptoJS.enc.Utf8.parse(iv) }).toString();
      redis.hSet('key', socket.id, key);
      redis.hSet('iv', socket.id, iv);
      //redis.hSet('pub', socket.id, pub);
      io.in(socket.id).emit('preload', `${aes}?${crypted}`);
    }
    else {
      io.in(socket.id).emit('preload', data.server.domain);
    }
  });
  socket.on('?', async (req) => {
    const head = {
      ip: (socket.handshake.headers['x-forwarded-for'] != null) ? socket.handshake.headers['x-forwarded-for'] : socket.handshake.address,
      cookie: (socket.handshake.headers.cookie == null) ? null : cookie.parse(socket.handshake.headers.cookie),
      sid: socket.id,
      time: new Date().getTime(),
      cache: socket.data.cache,
      room: (socket.data.room) ? [socket.sid, socket.data.room] : [socket.sid]
    };
    let key = await redis.hGet('key', socket.id),
      iv = await redis.hGet('iv', socket.id),
      bytes = CryptoJS.AES.decrypt(req.toString(CryptoJS.enc.Utf8), CryptoJS.enc.Utf8.parse(key), { iv: CryptoJS.enc.Utf8.parse(iv) }),
      info = JSON.parse(bytes.toString(CryptoJS.enc.Utf8)),
      type = info.type.split('.');
    apps[type[0]][type[1]](info.info, head, async (info, cache, room, game) => handle(socket, head, info, cache, room, game));
    console.log('receive:' + info.type);
  });
  socket.on(':', async (req) => {
    const head = {
      ip: (socket.handshake.headers['x-forwarded-for'] != null) ? socket.handshake.headers['x-forwarded-for'] : socket.handshake.address,
      cookie: req.cookie,
      sid: socket.id,
      time: new Date().getTime(),
      cache: socket.data.cache,
      room: (socket.data.room) ? [socket.sid, socket.data.room] : [socket.sid]
    }
    let type = req.type.split('.'),
      info = req.info;
    apps[type[0]][type[1]](info, head, async (info, cache, room, game) => handle(socket, head, info, cache, room, game));
    console.log('receive:' + req.type);
  });
  socket.on('disconnect', _ => {
    const head = {
      cookie: (socket.handshake.headers.cookie == null) ? null : cookie.parse(socket.handshake.headers.cookie),
      sid: socket.id,
      room: (socket.data.room) ? [socket.sid, socket.data.room] : [socket.sid]
    };
    if (socket.data.room) apps.room.leave(_, head, async (info, _, room, game) => {
      info && await emit(info);
      room && socket[room.type](room.rid);
      game && apps[game.type][game.handle](game, head, async info => await emit(info));
    })
    apps.account.logout(head);
  })
});

process.on('uncaughtException', (err) => console.log(err));

async function handle(socket, head, info, cache, room, game) {
  if (cache) socket.data.cache[cache.key] = cache.info;
  info && await emit(info);
  if (room) {
    socket[room.type](room.rid);
    if (room.type == 'join') socket.data.room = room.rid;
    else delete socket.data.room;
  }
  game && apps[game.type][game.handle](game, head, async info => await emit(info));
}

async function emit(list) {
  for (let info of list) {
    console.log('send:' + info.type);
    const msg = {
      type: info.type,
      info: info.info
    };
    let e = async (sid, msg) => {
      let key = await redis.hGet('key', sid);
      if (key) {
        let iv = await redis.hGet('iv', sid);
        let crypted = CryptoJS.AES.encrypt(JSON.stringify(msg), CryptoJS.enc.Utf8.parse(key), { iv: CryptoJS.enc.Utf8.parse(iv) }).toString();
        io.in(sid).emit('!', crypted);
      }
      else io.in(sid).emit(';', msg);
    }
    if (info.room) for (let room of info.room) {
      let mates = await io.in(room).allSockets();
      for (let mate of mates) {
        if (info.except) info.except.indexOf(mate) == -1 && e(mate, msg);
        else e(mate, msg);
      }
    }
    else for (let to of info.to) e(to, msg);
  }
}
