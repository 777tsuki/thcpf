const { MongoClient } = require('mongodb');
const axios = require('axios');
const https = require("https");
const fs = require('fs');
const toml = require('toml');

const data = toml.parse(fs.readFileSync('./server.toml'));
const func = require('./func');
axios.defaults.withCredentials = true;
axios.defaults.crossDomain = true;
axios.defaults.headers.post['Content-Type'] = 'application/x-www-form-urlencoded';
const agent = new https.Agent({
  rejectUnauthorized: false,
});
module.exports = {
  show: async (info, head, callback) => {
    const emit = [];
    let val;
    if (info != undefined) val = (info.cookie != undefined && info.uid != undefined && info.cookie != null && info.uid != null);
    if (val) {
      MongoClient.connect(data.mongodb.url, { useUnifiedTopology: true }, async (err, db) => {
        const account = db.db(data.mongodb.db).collection('account');
        let res = func.getCookie(info.cookie);
        const requestor = await account.findOne({ uuid: res.uuid });
        const target = await account.findOne({ 'uid': (info.uid === false) ? requestor.uid : info.uid });
        emit.push({
          'to': [head.sid],
          'type': 'accounttap',
          'info': {
            'name': target.name,
            'avatar': target.avatar,
            'background': target.background,
            'uid': target.uid,
            'coin': target.coin,
            'self': (requestor.mail == target.mail) ? true : false
          }
        });
        await db.close();
        await callback(emit);
      });
    }
    else {
      emit.push({
        'to': [head.sid],
        'type': 'cookie',
        'info': 'invalidCookie'
      });
      await callback(emit);
    }
  },
  upload: (info, cookie, callback) => {
    MongoClient.connect(data.mongodb.url, { useUnifiedTopology: true }, async (err, db) => {
      const account = db.db(data.mongodb.db).collection('account');
      let res = func.getCookie(cookie.info);
      let user = await account.findOne({ uuid: res.uuid });
      const emit = [];
      let base64Data = info.info.replace(/^data:image\/\w+;base64,/, "");
      let dataBuffer = Buffer.from(base64Data, 'base64');
      const allowExtname = ['png', 'jpg', 'jpeg', 'webp'];
      let filterResult = allowExtname.filter(item => {
        return info.info.includes(item)
      });
      if (info.info.length / 1.312 > 5242880) {
        db.close();
        callback('imgExceed');
      }
      else if (filterResult == null) {
        db.close();
        callback('imgInvalid');
      }
      else {
        let link;
        let time = new Date().getTime();
        (data.image.method == 'post') ? await axios({
          method: 'post',
          url: `${data.image.upload}${user.uid}-${info.type}`,
          httpsAgent: agent,
          data: { data: info.info }
        }).then(async (res) => {
          let i = {};
          i[info.type] = res.data;
          await account.updateOne({ 'mail': user.mail }, {
            $set: i
          });
          await db.close();
          await callback({
            type: info.type,
            info: res.data
          })
        }) : fs.writeFile(`${data.image.dist}${user.uid}-${info.type}-${time}.${filterResult[0]}`, dataBuffer, async (err) => {
          if (err) console.log(err)
          link = `${data.image.url}${user.uid}-${info.type}-${time}.${filterResult[0]}`
          let i = {};
          i[info.type] = link;
          user[info.type].indexOf(data.image.url) != -1 && fs.unlinkSync(`${data.image.dist}${user[info.type].replace(data.image.url, '')}`);
          await account.updateOne({ 'mail': user.mail }, {
            $set: i
          });
          await db.close();
          await callback({
            type: info.type,
            info: link
          });
        });
      }
    });
  },
  msg: (msg, head, callback) => {
    if (msg.type == 'room' && head.room[1]) {
      MongoClient.connect(data.mongodb.url, { useUnifiedTopology: true }, async (err, db) => {
        const account = db.db(data.mongodb.db).collection('account');
        let res = func.getCookie(head.cookie.info);
        const user = await account.findOne({ uuid: res.uuid });
        callback([{
          room: [head.room[1]],
          except: [head.sid],
          type: 'msg',
          info: {
            name: user.name,
            avatar: user.avatar,
            msg: msg.info
          }
        }]);
      })
    }
  }
}