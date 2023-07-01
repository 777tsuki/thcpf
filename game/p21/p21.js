const redisClient = require('redis');
const fs = require('fs');
const func = require('../../app/func');
const account = require('../../app/account');
const toml = require('toml');
const data = toml.parse(fs.readFileSync(process.cwd() + '/server.toml'));
const redis = redisClient.createClient(6379, data.redis.host, { auth_pass: data.redis.pwd });
redis.connect();
const db = require(`./p21.json`).redis_db;
redis.select(db);

const excard = {
  protect: room => room[`shield${room.state}`] += 1,
  rule: room => room[`p24${room.state}`] += 1,
  back: (room, callback) => {
    if (room[`c${room.state}`].length > 1) room.left.push(room[`c${room.state}`].pop());
    else callback(!0);
  },
  delete: (room, callback) => {
    if (room[`c${!room.state & 1}`].length > 1) room.left.push(room[`c${!room.state & 1}`].pop());
    else callback(!0);
  },
  place: (room, callback) => {
    if (room.c0.length < 2 || room.c1.length < 2) callback(!0);
    else {
      let c0 = room.c0.pop(), c1 = room.c1.pop();
      room.c0.push(c1);
      room.c1.push(c0);
    }
  },
  input: (room, num, callback) => {
    if (room.left.indexOf(num) != -1) {
      room.left.splice(room.left.indexOf(num), 1);
      room[`c${room.state}`].push(num);
    }
    else callback(!0);
  },
  break: (room) => {
    let o = !room.state & 1;
    room[`wager${o}`] = 0;
    room[`shield${o}`] = 0;
    room[`p24${o}`] = 0;
  }
}

module.exports = {
  excard: async (info, head, callback) => {
    const emit = [];
    let rid = head.room[1],
      uuid = func.getCookie(head.cookie.info).uuid,
      res = true;
    const room = await redis.hGetAll(rid);
    open(room);
    room[`${info.type}${room.state}`] = Number(room[`${info.type}${room.state}`]);
    if (uuid == room[`p${room.state}`] && room[`${info.type}${room.state}`] > 0 && room.playing == 1) {
      room[`${info.type}${room.state}`] -= 1;
      switch (info.type) {
        case 'back' || 'delete' || 'place': excard[info.type](room, v => {
          v && emit.push({
            to: [head.sid],
            type: 'p21-tip',
            info: 'last'
          });
          res = false;
        }); break;
        case 'input': excard.input(room, info.num, v => {
          v && emit.push({
            to: [head.sid],
            type: 'p21-tip',
            info: 'nofound'
          });
          res = false;
        }); break;
        case 'plus': 
        room[`wager${room.state}`] += 1;
        if (Math.floor(Math.random() * 3) != 0) {
          redis.select(data.redis.account_db);
          let op = await redis.hGet(room[`p${!room.state & 1}`], 'sid');
          await redis.select(db);
          emit.push({
            to: [head.sid],
            type: 'p21-addEx',
            info: getExcard(room)
          }, {
            to: [op],
            type: 'p21-addEx',
            info: {}
          });
        }
        break;
        default: excard[info.type](room);
      }
      res && emit.push({
        room: [rid],
        type: 'p21-excard',
        info: info
      });
      room.no = 0;
      close(room);
      await redis.hSet(rid, room);
      await callback(emit);
    }
  },
  yes: async (_, head, callback) => {
    const emit = [];
    let rid = head.room[1],
      uuid = func.getCookie(head.cookie.info).uuid;
    const room = await redis.hGetAll(rid);
    if (uuid == room[`p${room.state}`] && room.playing == 1) {
      open(room);
      let l = (Number(room.p240) > 0 || Number(room.p241) > 0) ? 24 : room.limit;
      if (eval(room[`c${room.state}`].join('+')) >= l) emit.push({
        to: [head.sid],
        type: 'p21-tip',
        info: 'excess'
      });
      else {
        if (!Math.floor(Math.random() * 3)) {
          redis.select(data.redis.account_db);
          let op = await redis.hGet(room[`p${!room.state & 1}`], 'sid');
          await redis.select(db);
          emit.push({
            to: [head.sid],
            type: 'p21-addEx',
            info: getExcard(room)
          }, {
            to: [op],
            type: 'p21-addEx',
            info: {}
          });
        }
        emit.push({
          room: [rid],
          type: 'p21-card',
          info: getCard(room)
        }, {
          room: [rid],
          type: 'p21-turn'
        })
        room.state = !room.state & 1;
        room.no = 0;
        close(room);
        await redis.hSet(rid, room);
      }
    }
    await callback(emit);
  },
  no: async (_, head, callback) => {
    const emit = [];
    let rid = head.room[1],
      uuid = func.getCookie(head.cookie.info).uuid;
    const room = await redis.hGetAll(rid);
    open(room);
    if (uuid == room[`p${room.state}`] && room.playing == 1) {
      if (room.no == 1) {
        //判断单局结果
        let a = eval(room.c1.join('+')), b = eval(room.c0.join('+')), l = (Number(room.p240) > 0 || Number(room.p241) > 0) ? 24 : room.limit;
        let r = (a == b) ? 2 : (((a > b) - (a <= l) == 0 || (a <= l && b > l)) & 1);
        r = Number(r);
        redis.select(data.redis.account_db);
        let winner = await redis.hGet(room[`p${(r < 2) ? r : 0}`], 'sid');
        let loser = await redis.hGet(room[`p${(r < 2) ? (!r & 1) : 1}`], 'sid');
        await redis.select(db);
        if (r != 2) {
          let wager = 1 + room[`wager${!r & 1}`] + room[`wager${r}`] - room[`shield${!r & 1}`];
          wager = (wager < 0) ? 0 : wager;
          room[`life${!r & 1}`] -= wager;
          if (room[`life${!r & 1}`] < 1) {
            //最终结算
            let coin = (6 - room[`life${r}`]) * room.unit;
            emit.push({
              room: [rid],
              except: [loser, winner],
              type: 'p21-result',
              info: {
                loser: !r & 1,
                wager: wager,
                shift: coin,
                rid: rid
              }
            }, {
              to: [loser],
              type: 'p21-result',
              info: {
                fail: !0,
                shift: coin,
                wager: wager,
                cover: room[`c${r}`][0],
                rid: rid
              }
            }, {
              to: [winner],
              type: 'p21-result',
              info: {
                fail: false,
                shift: coin,
                wager: wager,
                cover: room[`c${!r & 1}`][0],
                rid: rid
              }
            });
            account.coin(room[`p${r}`], coin);
            account.coin(room[`p${!r & 1}`], -coin);
            await redis.hGet(rid, 'ready').then(w => {
              w = JSON.parse(w);
              w.coin = Number(w.coin);
              w.coin += (r == 1) ? coin : -coin;
              redis.hSet(rid, 'ready', JSON.stringify(w))
            });
            await redis.hGet(rid, 'host').then(w => {
              w = JSON.parse(w);
              w.coin = Number(w.coin);
              w.coin += (r == 0) ? coin : -coin;
              redis.hSet(rid, 'host', JSON.stringify(w))
            });
            clear(room);
            room.playing = 0;
          }
          else {
            //单局结算
            emit.push({
              room: [rid],
              except: [winner, loser],
              type: 'p21-result',
              info: {
                loser: !r & 1,
                wager: wager,
              }
            }, {
              to: [loser],
              type: 'p21-result',
              info: {
                fail: true,
                wager: wager,
                cover: room[`c${r}`][0]
              }
            }, {
              to: [winner],
              type: 'p21-result',
              info: {
                fail: false,
                wager: wager,
                cover: room[`c${!r & 1}`][0]
              }
            });
          }
        }
        //平局
        else emit.push({
          room: [rid],
          except: [loser, winner],
          type: 'p21-result',
          info: {
            draw: !0,
          }
        }, {
          to: [loser],
          type: 'p21-result',
          info: {
            draw: !0,
            cover: room.c0[0]
          }
        }, {
          to: [winner],
          type: 'p21-result',
          info: {
            draw: !0,
            cover: room.c1[0]
          }
        });
      }
      else {
        //只有一方不要，尚未进入结算
        room.state = !room.state & 1;
        room.no = 1;
        emit.push({
          room: [rid],
          type: 'p21-turn'
        });
      }
    }
    close(room);
    await redis.hSet(rid, room);
    await callback(emit);
  },
  start: async (info, head, callback) => {
    const emit = [];
    let rid = head.room[1],
      s = info ? 'p21-origin' : 'p21-start',
      res = func.getCookie(head.cookie.info);
    const room = await redis.hGetAll(rid);
    if (info) {
      clear(room);
      room.p0 = info.p0;
      room.p1 = info.p1;
      room.life0 = 5;
      room.life1 = 5;
    }
    if (res.uuid == room.p0) {
      for (let i in ['idle', 'ready', 'host']) delete room[i];
      for (let t of ['shield', 'wager', 'p24']) for (let v of [0, 1]) room[`${t}${v}`] = 0;
      redis.select(data.redis.account_db);
      let p0 = await redis.hGet(room.p0, 'sid');
      let p1 = await redis.hGet(room.p1, 'sid');
      await redis.select(db);
      room.c0 = [];
      room.c1 = [];
      room.left = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
      room.limit = 21;
      room.no = 0;
      room.playing = 1;
      getCard(room, 0);
      getCard(room, 1);
      getCard(room, 0);
      getCard(room, 1);
      const ex0 = getExcard(room, 0);
      const ex1 = getExcard(room, 1);
      room.state = Math.floor(Math.random() * 2);
      emit.push({
        to: [p0],
        type: s,
        info: {
          card: [room.c0, room.c1[1]],
          state: !room.state
        }
      }, {
        to: [p1],
        type: s,
        info: {
          card: [room.c1, room.c0[1]],
          state: room.state
        }
      }, {
        room: [rid],
        except: [p0, p1],
        type: s,
        info: {
          observe: true,
          card: [room.c0, room.c1],
          state: room.state
        }
      }, {
        to: [p0],
        type: 'p21-addEx',
        info: ex0
      }, {
        to: [p1],
        type: 'p21-addEx',
        info: ex1
      }, {
        to: [p0],
        type: 'p21-addEx',
        info: {}
      }, {
        to: [p1],
        type: 'p21-addEx',
        info: {}
      });
      close(room);
      await redis.hSet(rid, room);
      await callback(emit);
    }
  },
  leave: async (_, head, callback) => {
    //游戏中途离开
    let rid = head.room[1],
      res = func.getCookie(head.cookie.info);
    const room = await redis.hGetAll(rid);
    if (room.p1 == res.uuid || room.p0 == res.uuid) {
      open(room);
      clear(room);
      room.playing = 0;
      close(room);
      redis.hSet(rid, room);
      callback([{
        room: [rid],
        type: 'p21-suspend',
        info: {
          rid: rid
        }
      }]);
    }
  },
  join: async (info, head, callback) => {
    const room = await redis.hGetAll(info.rid);
    open(room);
    callback([{
      to: [head.sid],
      type: 'p21-join',
      info: join(room)
    }]);
  },
  ex: async (_, head, callback) => {
    const emit = [];
    let rid = head.room[1];
    const room = await redis.hGetAll(rid);
    open(room);
    redis.select(data.redis.account_db);
    let op = await redis.hGet(room[`p${!room.state & 1}`], 'sid');
    await redis.select(db);
    emit.push({
      to: [head.sid],
      type: 'p21-addEx',
      info: getExcard(room)
    }, {
      to: [op],
      type: 'p21-addEx',
      info: {}
    });
    callback(emit);
  }
}

function getCard(room, state) {
  let i = Math.floor(Math.random() * room.left.length);
  let s = (state != undefined) ? state : room.state;
  room[`c${s}`].push(room.left[i]);
  return room.left.splice(i, 1)[0];
};

function getExcard(room, state) {
  let s = (state != undefined) ? state : room.state;
  let ex = ['plus', 'protect', 'rule', 'back', 'input', 'delete', 'place', 'break'][Math.floor(Math.random() * 8)];
  room[`${ex}${s}`] = room[`${ex}${s}`] ? Number(room[`${ex}${s}`]) + 1 : 1;
  return {
    type: ex,
    num: ex == 'input' ? Math.floor(Math.random() * 11) + 1 : ''
  };
}

function open(room) {
  for (let e of ['protect', 'plus', 'rule', 'break', 'delete', 'place', 'input', 'back', 'wager', 'p24', 'shield']) for (let i of [0, 1]) room[`${e}${i}`] = Number(room[`${e}${i}`]);
  for (let i of ['left', 'c0', 'c1']) room[i] = room[i].split('+');
  for (let i of ['limit', 'state', 'no', 'life0', 'life1']) room[i] = Number(room[i]);
  for (let i of ['idle', 'ready', 'host']) delete room[i];
}

function close(room) {
  for (let i of ['left', 'c0', 'c1']) room[i] = room[i].join('+');
}

function clear(room) {
  for (let e of ['protect', 'plus', 'rule', 'break', 'delete', 'place', 'input', 'back']) for (let i of [0, 1]) room[e + i] = 0;
  delete room.p0;
  delete room.p1;
}

function join(room) {
  return {
    host: room.host,
    ready: room.ready,
    life0: room.life0,
    life1: room.life1,
    c0: room.c0,
    r1: room.c1,
    state: room.state
  }
}