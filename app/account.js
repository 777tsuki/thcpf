const { MongoClient } = require('mongodb');
const bcryptjs = require('bcryptjs');
const nodemailer = require('nodemailer');
const fs = require('fs');
const axios = require('axios');
const crypto = require('crypto');
const redisClient = require('redis');
const toml = require('toml');

const data = toml.parse(fs.readFileSync('./server.toml'));
const func = require('./func');

const redis = redisClient.createClient(6379, data.redis.host, { auth_pass: data.redis.pwd });
redis.connect();
redis.select(data.redis.account_db);
// const transporter = nodemailer.createTransport(data.mail.nodemailer);
let transporter = nodemailer.createTransport({
  host: 'smtp.163.com',
  port: 25,
  secure: false,
  auth: {
    user: 'touhoucpf@163.com',
    pass: 'XBOBZIONBZHNUXMW'
  }
});
axios.defaults.withCredentials = true;
axios.defaults.crossDomain = true;
axios.defaults.headers.post['Content-Type'] = 'application/x-www-form-urlencoded';

module.exports = {
  autoLog: (cookie, head, callback) => {
    if (cookie) head.cookie.info = cookie;
    if (head.cookie != undefined && head.cookie != null) if (head.cookie.info != undefined && head.cookie.info != null) {
      const emit = [];
      MongoClient.connect(data.mongodb.url, { useUnifiedTopology: true }, async (err, db) => {
        const account = db.db(data.mongodb.db).collection('account');
        let res = func.getCookie(head.cookie.info);
        const info = await account.findOne({ uuid: res.uuid });
        if (info != false) {
          let sid = await redis.hGet(info.name, 'sid');
          if (sid) {
            emit.push({
              to: [head.sid],
              type: 'accountInfo',
              info: false
            })
          }
          else {
            emit.push({
              to: [head.sid],
              type: 'accountInfo',
              info: {
                name: info.name,
                uid: info.uid,
                avatar: info.avatar,
                coin: info.coin
              }
            });
            await account.updateOne({ mail: info.mail }, {
              $set: {
                lastTime: head.time,
                lastIp: head.ip
              }
            });
            redis.hSet(res.uuid, 'sid', head.sid);
          }
        } else emit.push({
          to: [head.sid],
          type: 'cookie',
          info: 'invalidCookie'
        });
        await db.close();
        await callback(emit);
      });
    }
  },
  log: (info, head, callback) => {
    const emit = [];
    MongoClient.connect(data.mongodb.url, { useUnifiedTopology: true }, async (err, db) => {
      const account = db.db(data.mongodb.db).collection('account');
      const res = await account.findOne({ mail: info.mail });
      if (res != null) {
        let val = await bcryptjs.compare(info.password, res.password);
        emit.push({
          to: [head.sid],
          type: 'user',
          info: (val) ? 'logSuccess' : 'logFail'
        });
        if (val) {
          let sid = await redis.hGet(res.name, 'sid');
          if (sid) {
            emit.push({
              to: [head.sid],
              type: 'accountInfo',
              info: false
            })
          }
          else {
            const cookie = func.setCookie({
              uuid: res.uuid,
              time: head.time
            });
            emit.push({
              to: [head.sid],
              type: 'updataCookie',
              info: cookie
            });
            emit.push({
              to: [head.sid],
              type: 'accountInfo',
              info: {
                name: res.name,
                uid: res.uid,
                avatar: res.avatar
              }
            });
            await account.updateOne({ mail: info.mail }, {
              $set: {
                lastTime: head.time,
                lastIp: head.ip,
              }
            });
          }
        }
      }
      else emit.push({
        to: [head.sid],
        type: 'user',
        info: 'accountUnexist',
      });
      await db.close();
      await callback(emit);
    });
  },
  verify: (info, head, callback) => {
    const emit = [];
    MongoClient.connect(data.mongodb.url, { useUnifiedTopology: true }, async (err, db) => {
      const account = db.db(data.mongodb.db).collection('account');
      let res = await account.findOne({ mail: info.mail });
      let name = await account.findOne({ name: info.name });
      let code = false;
      let signed = false;
      if (name != null) emit.push({
        to: [head.sid],
        type: 'user',
        info: 'nameExist'
      });
      else if (res != null) emit.push({
        to: [head.sid],
        type: 'user',
        info: 'emailExist'
      });
      else {
        emit.push({
          to: [head.sid],
          type: 'user',
          info: 'verifySuccess'
        });
        code = Math.random().toString().slice(-5);
        let priv_key = fs.readFileSync(data.server.priv_key);
        let sign = crypto.createSign("RSA-SHA256");
        sign.update(code);
        signed = sign.sign(priv_key, "hex");
        let html = fs.readFileSync('./view/mail.html', 'utf-8');
        html = html.replace('{{title}}', '验证码').replace('{{detail}}', code);
        // if (data.mail.method == 'post') await axios.post(data.mail.postmailer.url, Object.assign(data.mail.postmailer.info, {
        //   info: {
        //     subject: '东方祈符宴 注册验证码',
        //     to: info.mail,
        //     html: html
        //   }
        // }));
        // else await transporter.sendMail({
        //   from: `东方祈符宴<${data.mail.nodemailer.auth.user}>`,
        //   subject: '东方祈符宴 注册验证码',
        //   to: info.mail,
        //   html: html
        // });
        await transporter.sendMail({
          from: `东方祈符宴<touhoucpf@163.com>`,
          subject: '东方祈符宴 注册验证码',
          to: info.mail,
          html: html
        });
      }
      await db.close();
      await callback(emit, (code == false) ? false : {
        key: 'verifyCode',
        info: {
          mail: info.mail,
          name: info.name,
          signed: signed,
          time: head.time
        }
      });
    });
  },
  reg: (info, head, callback) => {
    const emit = [];
    MongoClient.connect(data.mongodb.url, { useUnifiedTopology: true }, async (err, db) => {
      const account = db.db(data.mongodb.db).collection('account');
      let pub_key = fs.readFileSync(data.server.pub_key);
      const verify = crypto.createVerify("RSA-SHA256");
      verify.update(info.code);
      const result = verify.verify(pub_key, head.cache['verifyCode'].signed, "hex");
      if (head.time - head.cache['verifyCode'].time > 600000) emit.push({
        to: [head.sid],
        type: 'user',
        info: 'codeOverdue'
      });
      else if (!result) emit.push({
        to: [head.sid],
        type: 'user',
        info: 'codeError'
      });
      else {
        const count = db.db(data.mongodb.db).collection('count');
        let uid = await count.findOne({ type: 'account' });
        uid = uid.value;
        account.insertOne({
          uid: uid,
          mail: head.cache['verifyCode'].mail,
          name: head.cache['verifyCode'].name,
          avatar: '/source/svg/avatar.svg',
          password: bcryptjs.hashSync(info.password, 10),
          uuid: func.randomStr(19),
          lastIp: head.ip,
          coin: 0
        });
        await count.updateOne({ 'type': 'account' }, { $set: { 'value': ++uid } });
        emit.push({
          to: [head.sid],
          type: 'user',
          info: 'regSuccess'
        });
      }
      await db.close();
      await callback(emit);
    });
  },
  logout: (head) => {
    if (head.cookie) if (head.cookie.info) {
      let info = func.getCookie(head.cookie.info);
      redis.del(info.uuid);
    }
    console.log('clear:' + head.sid);
    redis.hDel('key', head.sid);
    redis.hDel('iv', head.sid);
  },
  squeeze: (empty, head, callback) => {
    const emit = [];
    MongoClient.connect(data.mongodb.url, { useUnifiedTopology: true }, async (err, db) => {
      let account = db.db(data.mongodb.db).collection('account');
      info = func.getCookie(head.cookie.info);
      info = await account.findOne({ uuid: info.uuid });
      let sid = await redis.hGet(info.name, 'sid');
      emit.push({
        to: [head.sid],
        type: 'reload',
        info: {}
      });
      emit.push({
        to: sid,
        type: 'squeeze',
        info: {}
      });
      callback(emit, sid);
    });
  },
  prspwd: async (info, head, callback) => {
    const emit = [];
    let code = false;
    let signed = false;
    emit.push({
      to: [head.sid],
      type: 'user',
      info: 'prspwdSuccess'
    });
    code = Math.random().toString().slice(-5);
    let priv_key = fs.readFileSync(data.server.priv_key);
    let sign = crypto.createSign("RSA-SHA256");
    sign.update(code);
    signed = sign.sign(priv_key, "hex");
    let html = fs.readFileSync('./view/mail.html', 'utf-8');
    html = html.replace('{{title}}', '验证码').replace('{{detail}}', code);
    // if (data.mail.method == 'post') await axios.post(data.mail.postmailer.url, Object.assign(data.mail.postmailer.info, {
    //   info: {
    //     subject: '东方祈符宴 修改密码 验证码',
    //     to: info.mail,
    //     html: html
    //   }
    // }));
    // else await transporter.sendMail({
    //   from: `东方祈符宴<${data.mail.nodemailer.auth.user}>`,
    //   subject: '东方祈符宴 修改密码 验证码',
    //   to: info.mail,
    //   html: html
    // });
    await transporter.sendMail({
      from: `东方祈符宴<touhoucpf@163.com>`,
      subject: '东方祈符宴 修改密码 验证码',
      to: info.mail,
      html: html
    });
    await callback(emit, (code == false) ? false : {
      key: 'rspwdCode',
      info: {
        mail: info.mail,
        signed: signed,
        time: head.time
      }
    });
  },
  rspwd: (info, head, callback) => {
    const emit = [];
    MongoClient.connect(data.mongodb.url, { useUnifiedTopology: true }, async (err, db) => {
      const account = db.db(data.mongodb.db).collection('account');
      let pub_key = fs.readFileSync(data.server.pub_key);
      const verify = crypto.createVerify("RSA-SHA256");
      verify.update(info.code);
      const result = verify.verify(pub_key, head.cache['rspwdCode'].signed, "hex");
      if (head.time - head.cache.time > 600000) emit.push({
        to: [head.sid],
        type: 'user',
        info: 'codeOverdue'
      });
      else if (!result) emit.push({
        to: [head.sid],
        type: 'user',
        info: 'codeError'
      });
      else {
        await account.updateOne({ mail: head.cache['rspwdCode'].mail }, {
          $set: { password: bcryptjs.hashSync(info.password, 10) }
        });
        emit.push({
          to: [head.sid],
          type: 'user',
          info: 'rspwdSuccess'
        });
      }
      await db.close();
      await callback(emit);
    });
  },
  coin: (uuid, amount) => MongoClient.connect(data.mongodb.url, { useUnifiedTopology: true }, async (err, db) => {
    let account = db.db(data.mongodb.db).collection('account');
    account.updateOne({ uuid: uuid }, {
      $inc: { coin: amount }
    });
  })
}
