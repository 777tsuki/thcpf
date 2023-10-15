/*
这里是与网站主要功能关系不大的js调用部分，目录：
1.预加载项
2.常用函数
  无注释，按顺序为
  addon引入组件
  testfor开头的三个表单数据格式检测
  longPressbtn长按按钮的js部分
  show用于更换显示页面的函数
  onshow返回当前显示页面或检测当前是否显示某页面
  machining简单的数据填充函数
  loadCss引入css
  rclick右键触发事件管理
  Interval定时事件管理
3.hash路由
4.南十字星盾
5.RSA+AES加密传输
爆破请善用CTRL+F
*/

//预加载项

console.log('自信点，你已经赢过绝大多数人了。');

window.onload = _ => {
  preloadReq();
  $('body').attr('onControl', 1);
  $(document).on("mousewheel DOMMouseScroll", e => {
    if ($('body').attr('onControl') == 1) control(e);
  });
  hashChange();
  $.getJSON('/source/json/notice.json', data => window.message = data);
  $(document).on('contextmenu', e => {
    e.preventDefault();
    for (let i in rclick.e) rclick.e[i](e);
  });
  $(document).on('click', e => {
    for (let i in lclick.e) lclick.e[i](e);
  });
  $(document).on('dblclick', e => {
    for (let i in dbclick.e) dbclick.e[i](e);
  });
  let sUserAgent = navigator.userAgent;
  if (sUserAgent.indexOf('Android') > -1 || sUserAgent.indexOf('iPhone') > -1 || sUserAgent.indexOf('iPad') > -1 || sUserAgent.indexOf('iPod') > -1 || sUserAgent.indexOf('Symbian') > -1) {
    alert("暂不支持手机端");
    location.href = "https://thwiki.cc";
  }
};

// document.addEventListener("touchmove", function (e) { e.preventDefault() }, { passive: false });

// window.addEventListener('resize', _ => {
//   let height = innerHeight / 680;
//   let width = innerWidth / 920;
//   let sUserAgent = navigator.userAgent;
//   if (sUserAgent.indexOf('Android') > -1 || sUserAgent.indexOf('iPhone') > -1 || sUserAgent.indexOf('iPad') > -1 || sUserAgent.indexOf('iPod') > -1 || sUserAgent.indexOf('Symbian') > -1);
//   else $('body').animate({ zoom: `${(height > width) ? innerWidth / 900 : innerHeight / 640}` }, 400);
// })

window.addons = [];

//常用函数

function addon(id) {
  $.getJSON(`/addon/${id}/data.json`, data => {
    if (window.addons.indexOf(id) == -1) {
      $('body').append(`<div class="${id} addon"></div>`);
      data.css.forEach(c => loadCss(`/addon/${id}/${c}`));
      $(`.${id}`).attr({
        from: data.prior,
        relay: data.relay,
        disableWheelControl: data.disableWheelControl
      });
      window.addons.push(id);
    }
    $(`.${id}`).load(`/addon/${id}/index.html`);
  });
}

const testfor = {
  verify: (x, y) => {
    let result = 0;
    let atpos = x.indexOf("@");
    let dotpos = x.lastIndexOf(".");
    if (!(atpos < 1 || dotpos < atpos + 2 || dotpos + 2 >= x.length)) result += 1;
    if (y.length > 1 && y.length < 12) result += 2;
    if (result < 3) msg({
      title: '提示',
      detail: window.message.account[`verify${result}`]
    });
    return result == 3;
  },
  log: (x, y) => {
    let result = 0;
    let atpos = x.indexOf("@");
    let dotpos = x.lastIndexOf(".");
    if (!(atpos < 1 || dotpos < atpos + 2 || dotpos + 2 >= x.length)) result += 1;
    if (y.length > 5 && y.length < 17) result += 2;
    if (result < 3) msg({
      title: '提示',
      detail: window.message.account[`log${result}`]
    });
    return result == 3;
  },
  reg: (x, y) => {
    let result = 0;
    if (y.length > 5 && y.length < 17) result += 1;
    if (x == y) result += 2;
    if (result < 3) msg({
      title: '提示',
      detail: window.message.account[`reg${result}`]
    });
    return result == 3;
  },
  prspwd: (x) => {
    let result = 0;
    let atpos = x.indexOf("@");
    let dotpos = x.lastIndexOf(".");
    if (!(atpos < 1 || dotpos < atpos + 2 || dotpos + 2 >= x.length)) result += 1;
    if (result < 1) msg({
      title: '提示',
      detail: window.message.account[`prspwd${result}`]
    });
    return result == 1;
  }
}

function longPressbtn(id, delay, callback) {
  [1, 2, 3].forEach((val) => $(`#${id}`).css(`--delay${val}`, `${delay / 3 * val}s`));
  $(`#${id}`).mousedown(() => time = setTimeout(() => callback(true), delay * 1000));
  $(`#${id}`).mouseup(() => clearTimeout(time));
}

function show(addon, delay) {
  let from = $('body').attr('onshow');
  $('.screen').css('display', 'block');
  if ($(`.${addon}`).attr('from') == null) (!$(`.${from}`).attr('relay')) ? $('body').attr('from', from) : 0;
  else $('body').attr('from', $(`.${addon}`).attr('from'));
  setTimeout(() => {
    $('body').attr('onshow', addon);
    $(`.${from}`).fadeOut('250', () => {
      $('.screen').css('display', 'none');
      $(`.${addon}`).fadeIn('250');
    });
  }, delay);
}

function onshow(addon) {
  return addon ? ($('body').attr('onshow') == addon) : $('body').attr('onshow');
}

const machine = {
  add: (material, process, container) => machining(material, process, (model) => $(container).append(model)),
  pre: (material, process, container) => machining(material, process, (model) => $(container).prepend(model)),
  re: (material, process) => machining(material, process, (model) => $(material).html(model))
}

async function machining(material, process, callback) {
  let model = $(material).html();
  for (let steps in process) model = model.replaceAll(`{{${steps}}}`, process[steps]);
  await callback(model);
}

function loadCss(href) {
  let css = document.createElement('link');
  css.rel = 'stylesheet';
  css.type = 'text/css';
  css.href = href;
  $('head').append(css);
}

const rclick = {
  e: {},
  add: (k, f) => {
    if (k in rclick.e);
    else rclick.e[k] = f;
  },
  clear: k => delete rclick.e[k],
  clearAll: k => {
    for (let i in rclick.e) {
      if (i.indexOf(k) > -1) delete rclick.e[i];
    }
  }
}

const lclick = {
  e: {},
  add: (k, f) => {
    if (k in lclick.e);
    else lclick.e[k] = f;
  },
  clear: k => delete lclick.e[k],
  clearAll: k => {
    for (let i in lclick.e) {
      if (i.indexOf(k) > -1) delete lclick.e[i];
    }
  }
}

const dbclick = {
  e: {},
  add: (k, f) => {
    if (k in lclick.e);
    else lclick.e[k] = f;
  },
  clear: k => delete lclick.e[k],
  clearAll: k => {
    for (let i in lclick.e) {
      if (i.indexOf(k) > -1) delete lclick.e[i];
    }
  }
}

const pulse = {
  e: {},
  add: (k, f, t) => {
    if (k in pulse.e);
    else pulse.e[k] = setInterval(f, t);
  },
  clear: k => {
    clearInterval(pulse.e[k]);
    delete pulse.e[k];
  },
  clearAll: _ => {
    for (let i in pulse.e) pulse.clear(pulse.e[i]);
  }
}

function touch(el, p) {
  let z = $('body').css('zoom');
  let res = 0;
  $(el).each((i, e) => {
    let offset = $(e).offset();
    res = 0 < p.clientX - offset.left * z && p.clientX - offset.left * z < $(e).width() * z && 0 < p.clientY - offset.top * z && p.clientY - offset.top * z < $(e).height() * z ? i + 1 : res;
  })
  return res;
}

function model() {
  $('btn').each((i, b) => {
    let s = $(b).attr('size');
    $(b).css({
      height: s,
      fontSize: `${s}px`,
      padding: `${s / 4}px ${s / 2}px`,
      borderRadius: `${s / 3}px`,
      borderWidth: `${s / 6}px`
    });
  });
}

//hash路由

function hashChange() {
  switch (location.hash) {
    case '#index':
      break;
    case '#account':
      let a = setInterval(() => {
        if (window.addons.indexOf('accounttap') != -1) {
          accounttapShow();
          clearInterval(a);
        };
      }, 50);
      break;
    case '#game':
      let g = setInterval(() => {
        if (window.addons.indexOf('gametap') != -1) {
          gametapShow();
          clearInterval(g);
        };
      }, 50);
      break;
    default:
      break;
  }
}
window.onhashchange = hashChange

//滚轮控制

function control(e) {
  // const delta = (e.originalEvent.wheelDelta && (e.originalEvent.wheelDelta > 0 ? 1 : -1)) || (e.originalEvent.detail && (e.originalEvent.detail > 0 ? -1 : 1));
  const delta = e;
  if (delta != 0) {
    $('body').attr('onControl', 2);
    if ($(`.${onshow()}`).attr('disableWheelControl'));
    else if ($(`.${onshow()}`).hasClass('Game'));
    else if (onshow('option')) $('.menu-dots').click();
    else {
      if (delta < 0) switch (onshow()) {
        case 'usertap': $(($('.right-panel-active').css('overflow') != undefined) ? '#signIn' : '#signUp').click(); break;
        case 'accounttap':
          let n;
          [0, 1, 2].forEach((val) => n = $('[name="accountSwitch"]').eq(val).is(':checked') ? val : n);
          $('[name="accountSwitch"]').eq((n == 2) ? 0 : n + 1).click();
          break;
      }
      if (delta > 0) show($('body').attr('from'));
    }
    setTimeout(_ => $('body').attr('onControl', 1), 500);
  }
};

//南十字星盾

// window.addEventListener('contextmenu', (e) => {
//   e.preventDefault();
// });

// window.addEventListener('selectstart', (e) => {
//   e.preventDefault();
// });

// window.addEventListener('keydown', (e) => {
//   if (e.key == 'F12' || e.key == 'u') e.preventDefault();
// });

// window.addEventListener('keydown', (e) => {
//   if (73 == e.keyCode && e.shiftKey && e.ctrlKey) window.close();
//   if (83 == e.keyCode && e.ctrlKey) window.close();
// });

// (function () {
//   'use strict';
//   var devtools = {
//     open: false,
//     orientation: null
//   };
//   var threshold = 160;
//   var testforDevtools=function() {
//     var widthThreshold = window.outerWidth - window.innerWidth > threshold;
//     var heightThreshold = window.outerHeight - window.innerHeight > threshold;
//     var orientation = widthThreshold ? 'vertical' : 'horizontal';
//     if (!(heightThreshold && widthThreshold) &&
//       ((window.Firebug && window.Firebug.chrome && window.Firebug.chrome.isInitialized) || widthThreshold || heightThreshold)) {
//       if (!devtools.open || devtools.orientation !== orientation) {
//         window.close();
//       }
//     }
//   }
//   window.addEventListener('resize', testforDevtools)
//   window.addEventListener('load', testforDevtools)
// })();

// !function () {
//   var _0x1cbb = ["tor", "struc", "call", "ger", "con", "bug", "de", "apply"];
//   setInterval(check, 100);
//   function check() {
//     function doCheck(_0x1834ff) {
//       if (('' + _0x1834ff / _0x1834ff)['length'] !== 0x1 || _0x1834ff % 0x14 === 0x0) {
//         (function () { return !![] }[
//           _0x1cbb[0x4] + _0x1cbb[0x1] + _0x1cbb[0x0]
//         ](
//           _0x1cbb[0x6] + _0x1cbb[0x5] + _0x1cbb[0x3]
//         )[_0x1cbb[0x2]]());
//       } else {
//         (function () { return ![] }[
//           _0x1cbb[0x4] + _0x1cbb[0x1] + _0x1cbb[0x0]
//         ](
//           _0x1cbb[0x6] + _0x1cbb[0x5] + _0x1cbb[0x3]
//         )[_0x1cbb[0x7]]());
//       }
//       doCheck(++_0x1834ff);
//     }
//     try {
//       doCheck(0)
//     } catch (err) { }
//   };
// }();

//RSA+AES加密传输

async function preloadReq() {
  let rsa = await KEYUTIL.generateKeypair("RSA", 1024);
  let pub = await KEYUTIL.getPEM(rsa.pubKeyObj);
  sessionStorage.setItem('priv', await KEYUTIL.getPEM(rsa.prvKeyObj, "PKCS8PRV"));
  sessionStorage.setItem('pub', pub);
  socket.emit('preload', pub);
}

async function preloadRes(info) {
  info = info.split('?');
  let aes = await KJUR.crypto.Cipher.decrypt(b64tohex(info[0]), KEYUTIL.getKey(sessionStorage.getItem('priv')));
  aes = aes.split(',');
  sessionStorage.setItem('key', aes[0]);
  sessionStorage.setItem('iv', aes[1]);
  let bytes = CryptoJS.AES.decrypt(info[1], CryptoJS.enc.Utf8.parse(aes[0]), { iv: CryptoJS.enc.Utf8.parse(aes[1]) }).toString(CryptoJS.enc.Utf8);
  let data = await JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
  emit('account.autoLog');
  machine.re('.footer', data);
  window.games = data.games;
  data.addons.forEach((id) => addon(id));
  data.games.forEach(g => {
    $('body').append(`<div class="${g} addon Game"></div>`);
    $.getJSON(`/game/${g}/${g}.json`, d => d && d.css.forEach(c => loadCss(`/game/${g}/${c}`)));
    $(`.${g}`).load(`/game/${g}/${g}.html`);
  });
}

function emit(type, info) {
  let crypted = CryptoJS.AES.encrypt(JSON.stringify({ type: type, info: info }), CryptoJS.enc.Utf8.parse(sessionStorage.getItem('key')), { iv: CryptoJS.enc.Utf8.parse(sessionStorage.getItem('iv')) }).toString();
  socket.emit('?', crypted.toString(CryptoJS.enc.Base64));
  console.log('send:' + type);
}
