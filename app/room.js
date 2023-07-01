const { MongoClient } = require('mongodb');
const redisClient = require('redis');
const fs = require('fs');
const toml = require('toml');

const data = toml.parse(fs.readFileSync('./server.toml'));
const func = require('./func');
const redis = redisClient.createClient(6379, data.redis.host, { auth_pass: data.redis.pwd });
redis.connect();

const handle = {
  list: async (type, head, callback) => {
    if (type) {
      redis.select(require(`../game/${type}/${type}.json`).redis_db);
      const emit = [], rooms = [];
      let list = await redis.sMembers('rooms');
      let l = list.length;
      if (l > 8) {
        for (let i = 1; i < 10; i++) {
          let room = await redis.hGetAll(`${type}-${list[l - i]}`);
          open(room);
          rooms.push(Object.assign(roomInfoList(room), {
            rid: `${type}-${list[l - i]}`,
            type: type
          }));
        }
      } else for (let val of list) {
        let room = await redis.hGetAll(`${type}-${val}`);
        open(room);
        rooms.push(Object.assign(roomInfoList(room), {
          rid: `${type}-${val}`,
          type: type
        }));
      }
      emit.push({
        to: [head.sid],
        type: 'roomList',
        info: rooms
      });
      await callback(emit);
    }
  },
  create: (info, head, callback) => {
    const emit = [];
    MongoClient.connect(data.mongodb.url, { useUnifiedTopology: true }, async (err, db) => {
      let res = func.getCookie(head.cookie.info);
      if (res) {
        let account = db.db(data.mongodb.db).collection('account');
        const user = await account.findOne({ uuid: res.uuid });
        let room = {
          host: [roomMate(user)],
          ready: [],
          idle: [],
          avatar: user.avatar,
          size: 1,
          playing: 0,
          online: 1
        };
        room = Object.assign(info, room);
        redis.select(require(`../game/${info.type}/${info.type}.json`).redis_db);
        let rid = await redis.get('rid');
        rid = Number(rid) + 1;
        emit.push({
          to: [head.sid],
          type: 'roomCreate',
          info: roomInfoJoin(room)
        });
        close(room);
        await redis.hSet(`${info.type}-${rid}`, room);
        await redis.sAdd('rooms', rid + '');
        await redis.set('rid', rid + '');
        await callback(emit, false, {
          type: 'join',
          rid: `${info.type}-${rid}`
        });
      }
      await db.close();
    });
  },
  join: async (type, head, callback) => {
    const emit = [];
    let room = await redis.hGetAll(type);
    if (room.playing == 1) callback(false, false, false, {
      type: type.split('-')[0],
      handle: 'join',
      rid: type
    });
    else {
      head.room.push(type);
      handle.mateUpdata('join', head, async (err, info, rec) => {
        if (!err) {
          room = await redis.hGetAll(type);
          open(room);
          !rec && emit.push({
            room: [type],
            except: [head.sid],
            type: 'roomMateUpdata',
            info: info[0]
          });
          emit.push({
            to: [head.sid],
            type: 'roomJoin',
            info: roomInfoJoin(room)
          });
          callback(emit, false, {
            type: 'join',
            rid: type
          });
        }
      });
    }
  },
  leave: async (_, head, callback) => {
    if (head.room[1]) {
      const emit = [],
        type = head.room[1].split('-')[0],
        rid = head.room[1];
      redis.select(require(`../game/${type}/${type}.json`).redis_db);
      let playing = await redis.hGet(rid, 'playing');
      handle.mateUpdata('leave', head, async (err, info, _, clear) => {
        if (!err) {
          if (clear) {
            await redis.del(rid);
            await redis.sRem('rooms', rid.split('-')[1]);
          }
          await handle.list(type, head, e => emit.push(e[0]));
          info && emit.push({
            room: [head.room[1]],
            except: [head.sid],
            type: 'roomMateUpdata',
            info: info[0]
          });
          emit.push({
            to: [head.sid],
            type: 'roomLeave'
          });
          callback(emit, false, {
            type: 'leave',
            rid: head.room[1]
          }, playing == 1 ? {
            type: type,
            handle: 'leave'
          } : false);
        }
      });
    }
  },
  close: async (_, head, callback) => {
    if (head.room[1]) {
      MongoClient.connect(data.mongodb.url, { useUnifiedTopology: true }, async (err, db) => {
        const emit = [];
        let account = db.db(data.mongodb.db).collection('account');
        let res = func.getCookie(head.cookie.info);
        const user = await account.findOne({ uuid: res.uuid });
        let rid = head.room[1],
          type = rid.split('-')[0];
        redis.select(require(`../game/${type}/${type}.json`).redis_db);
        const room = await redis.hGetAll(rid);
        open(room);
        if (user.uid == room.host[0].uid) {
          redis.del(rid);
          redis.sRem('rooms', rid.split('-')[1]);
          emit.push({
            room: [rid],
            type: 'roomClose'
          });
          await handle.list(type, head, e => emit.push({
            room: [rid],
            type: 'roomList',
            info: e[0].info
          }));
          await callback(emit, false, {
            type: 'leave',
            rid: rid
          });
        }
        await db.close();
      });
    }
  },
  ready: (_, head, callback) => {
    const emit = [];
    if (head.room[1]) {
      handle.mateUpdata('ready', head, async (err, info) => {
        if (!err) {
          emit.push({
            room: [head.room[1]],
            except: [head.sid],
            type: 'roomMateUpdata',
            info: info[0]
          });
          callback(emit);
        }
      });
    }
  },
  idle: (_, head, callback) => {
    if (head.room[1]) {
      const emit = [];
      handle.mateUpdata('idle', head, async (err, info) => {
        if (!err) {
          emit.push({
            room: [head.room[1]],
            except: [head.sid],
            type: 'roomMateUpdata',
            info: info[0]
          });
          callback(emit);
        }
      });
    }
  },
  start: (_, head, callback) => {
    if (head.room[1]) {
      MongoClient.connect(data.mongodb.url, { useUnifiedTopology: true }, async (err, db) => {
        let rid = head.room[1],
          type = rid.split('-')[0];
        redis.select(require(`../game/${type}/${type}.json`).redis_db);
        let account = db.db(data.mongodb.db).collection('account'),
          res = func.getCookie(head.cookie.info),
          user = await account.findOne({ uuid: res.uuid }),
          room = await redis.hGetAll(rid),
          o = status(room, user.uid);
        open(room);
        let p1 = await account.findOne({ uid: room.ready[0].uid });
        if (p1 && o == 'host') callback(false, false, false, {
          type: type,
          p0: res.uuid,
          p1: p1.uuid,
          handle: 'start'
        });
        await db.close();
      });
    }
  },
  kick: () => {

  },
  stop: () => {

  },
  invite: () => {

  },
  edit: () => {

  },
  transfer: () => {

  },
  mateUpdata: async (info, head, callback) => {
    MongoClient.connect(data.mongodb.url, { useUnifiedTopology: true }, async (err, db) => {
      let account = db.db(data.mongodb.db).collection('account'),
        res = func.getCookie(head.cookie.info),
        rid = head.room[1],
        type = rid.split('-')[0];
      const user = await account.findOne({ uuid: res.uuid });
      redis.select(require(`../game/${type}/${type}.json`).redis_db);
      let room = await redis.hGetAll(rid),
        o = status(room, user.uid),
        clear = (room.size == 2 && room.online == 0 && info == 'leave');
      open(room);
      if (o == 'host' && info == 'leave') {
        if (room.size == 1) {
          redis.del(rid);
          redis.sRem('rooms', rid.split('-')[1]);
          callback(false, false);
        }
        else {
          redis.hSet(rid, 'online', 0);
          callback(true);
        }
      }
      else if ((!o && info == 'leave') || (o == info) || (o != 'host' && info == 'transfer') || (o == 'host' && (info == 'idle' || info == 'ready'))) callback(true);
      else {
        let t = {
          ready: [{
            origin: o,
            uid: user.uid,
            status: 'ready'
          }],
          leave: [{
            origin: o,
            leave: true,
            uid: user.uid
          }],
          idle: [{
            origin: o,
            uid: user.uid,
            status: 'idle'
          }],
          join: [{
            add: {
              name: user.name,
              coin: user.coin,
              uid: Number(user.uid),
              avatar: user.avatar
            },
            status: 'idle'
          }],
        },
          rec = o && info == 'join';
        let updata = t[info];
        if (!rec) {
          for (let u of updata) room = await roomMateUpdata(room, u);
          delete room.info;
          count(room);
          close(room);
          await redis.hSet(rid, room);
        }
        await callback(false, updata, rec, clear);
      }
      await db.close();
    });
  }
}

function roomMate(user) {
  return {
    name: user.name,
    coin: user.coin,
    uid: Number(user.uid),
    avatar: user.avatar
  }
}

function roomInfoJoin(room) {
  return {
    title: room.title,
    type: room.type,
    host: room.host,
    ready: room.ready,
    idle: room.idle,
    avatar: room.avatar,
    size: room.size,
    playing: room.playing,
    info: {
      observe: room.observe,
      pwd: room.pwd,
      unit: room.unit,
    }
  }
}

function roomInfoList(room) {
  return {
    title: room.title,
    unit: room.unit,
    observe: room.observe,
    pwd: room.pwd,
    type: room.type,
    host: room.host[0].name,
    avatar: room.avatar,
    size: room.size,
    playing: room.playing
  }
}

async function roomMateUpdata(room, info) {
  let mates = room, add = info.add;
  await info && !info.add && mates[info.origin].forEach((mate, i) => {
    if (mate.uid == info.uid) add = mates[info.origin].splice(i, 1)[0];
  });
  await info && !info.leave && mates[info.status].splice(0, 0, add);
  return mates;
}

function status(mates, uid) {
  let result = false,
    room = mates;
  for (let type of ['host', 'ready', 'idle']) {
    if (room[type].length) {
      if (room[type].indexOf(`"uid":${Number(uid)}`) > 0) result = type;
    }
  }
  return result;
}

function count(room) {
  room.size = [...room.host, ...room.ready, ...room.idle].length;
}

function open(room) {
  for (let t of ['host', 'ready', 'idle']) room[t] = room[t] ? room[t].split('?').map(m => JSON.parse(m)) : [];
}

function close(room) {
  for (let t of ['host', 'ready', 'idle']) room[t] = room[t].map(mate => JSON.stringify(mate)).join('?');
}

module.exports = handle;