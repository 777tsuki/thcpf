const fs = require('fs');
const crypto = require('crypto');
const toml = require('toml');
const data = toml.parse(fs.readFileSync('./server.toml'));

module.exports = {
  randomStr: (n) => {
    let arr = [
      ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z'],
      ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'],
      ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']
    ]
    let a = [];//保存所有字符
    let s = '';//最终输出字符
    arr.forEach((item) => {
      a.push(...item)
    })
    for (let i = 1; i < n+1; i++) {
      let m = Math.floor(Math.random() * (a.length));//生成随机数
      s += a[m]
    }
    return s;
  },
  getIp: (req) => {
    var ip = req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || req.connection.remoteAddres || req.socket.remoteAddress || '';
    if (ip.split(',').length > 0) {
      ip = ip.split(',')[0];
    }
    return ip;
  },
  setCookie: (info) => {
    const pub_key = fs.readFileSync(data.server.pub_key);
    if (info) {
      const secret = crypto.publicEncrypt(pub_key, `${info.uuid}?${info.time}`);
      return secret.toString('base64');
    }
  },
  getCookie: (info) => {
    const priv_key = fs.readFileSync(data.server.priv_key);
    if (info) {
      const result = crypto.privateDecrypt(priv_key, new Buffer.from(info, 'base64')).toString();
      if (result) return {
        uuid: result.split('?')[0],
        time: result.split('?')[1]
      };
      else return false;
    }
    else return false;
  }
}