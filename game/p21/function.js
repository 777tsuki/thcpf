function p21origin(info) {
  lclick.clear('p21');
  for (let i of [0, 1]) {
    $(`#p21-p${i}effect`).html('');
    $(`#p21-p${i}card`).html('');
    $(`#p21-p${i}info .p21-life`).text('✪✪✪✪✪');
    $('.p21-items').html('');
  }
  $('.p21-excard>div').html('');
  show('p21', 500);
  $('.p21-body').attr('class', 'p21-body');
  if (info.observe) {
    sessionStorage.setItem('p21.observe', 1);
    machine.re('#p21-p1info', JSON.parse(sessionStorage.getItem(`room.ready`)));
    machine.re('#p21-p0info', JSON.parse(sessionStorage.getItem(`room.host`)));
    $('.p21-body').addClass('p21-observe');
  }
  else {
    sessionStorage.setItem('p21.observe', '');
    let s = sessionStorage.getItem('roomStatus');
    machine.re('#p21-p1info', JSON.parse(sessionStorage.getItem(`room.${s}`)));
    machine.re('#p21-p0info', JSON.parse(sessionStorage.getItem(`room.${s == 'host' ? 'ready' : 'host'}`)));
    $('.p21-body').addClass('p21-joiner');
    setTimeout(_ => p21start(info), 1000);
  }
}
function p21start(info) {
  p21cd(1);
  if (info.observe) {
    for (let a of [0, 1]) {
      p21state(a);
      p21cover(info.card[a][0]);
      p21cardAdd(info.card[a][1]);
    }
    p21state(+info.state);
  }
  else {
    let t = 500;
    setTimeout(_ => {
      $('.p21').attr('state', 0);
      p21cardAdd(0);
    }, t);
    setTimeout(_ => {
      $('.p21').attr('state', 1);
      p21cover(info.card[0][0]);
    }, 2 * t);
    setTimeout(_ => {
      $('.p21').attr('state', 0);
      p21cardAdd(info.card[1]);
    }, 3 * t);
    setTimeout(_ => {
      $('.p21').attr('state', 1);
      p21cardAdd(info.card[0][1]);
    }, 4 * t);
    setTimeout(_ => {
      p21state(+info.state);
      p21option((info.state) ? 'round' : 'wait');
    }, 5 * t);
  }
}
function p21result(info) {
  p21option('result');
  setTimeout(_ => {
    if (!info.cover) for (let i of [0, 1]) p21publish(i);
    else {
      p21publish(1);
      setTimeout(_ => p21publish(0, info.cover), 1600);
    }
    if (info.draw) {
      setTimeout(_ => p21option('draw'), 2500);
      setTimeout(_ => p21clear(), 5500);
      setTimeout(_ => emit('p21.start'), 8000);
    }
    else {
      setTimeout(_ => {
        p21option(info.fail ? 'fail' : 'win');
        $(`#p21-p${(info.loser) ? info.loser : +info.fail}info .p21-life`).css('color', 'red');
        $(`#p21-p${(info.loser) ? info.loser : +info.fail}info`).css('box-shadow', '0 0 10px 8px #ff4c4c');
        setTimeout(_ => {
          if (info.loser) {
            $(`#p21-p${info.loser}info .p21-life`).text($(`#p21-p${info.loser}info .p21-life`).text().slice(info.wager));
            setTimeout(_ => info.shift && p21final(info), 2000);
          }
          else {
            $(`#p21-p${+info.fail}info .p21-life`).text($(`#p21-p${+info.fail}info .p21-life`).text().slice(info.wager));
            setTimeout(_ => (info.shift) ? p21final(info) : emit('p21.start'), 4000);
          }
          setTimeout(_ => {
            $('.p21-life').css('color', '#904242');
            $(`#p21-p${(info.loser) ? info.loser : +info.fail}info`).css('box-shadow', 'none');
            setTimeout(_ => p21clear(), 1500);
          }, 400);
        }, 400);
      }, 3000);
    }
  }, 1500);
}
function p21final(info) {
  p21output(info.loser ? `<n><a>${$(`#p21-p${!info.loser & 1}info p21-name`).text()}</a><a>+${info.shift}G</a></n>` : `<div class="p21-${info.fail ? 'loser' : 'winner'}"></div>`);
  !info.loser && msg({
    title: '二十一点',
    detail: `${info.shift}月币已${info.fail ? '转出' : '到账'}`
  });
  lclick.add('p21', _ => {
    roomJoinReq(info.rid);
    lclick.clear('p21');
  });
}

function p21excard(info) {
  let obs = sessionStorage.getItem('p21.observe');
  if (!obs && p21state() == 0) p21exShow(info);
  const p21ex = {
    delete: _ => {
      let c = `#p21-p${!+p21state() & 1}card>card`,
        l = $(c).length;
      if (l > 1) {
        $(c).eq(l - 1).css({ animation: 'p21-delete 0.4s forwards' });
        setTimeout(_ => $(c).eq(l - 1).remove(), 500);
      }
    },
    back: _ => {
      let c = `#p21-p${p21state()}card>card`,
        l = $(c).length;
      if (l > 1) {
        $(c).eq(l - 1).css({ animation: 'p21-delete 0.4s forwards' });
        setTimeout(_ => $(c).eq(l - 1).remove(), 500);
      }
    },
    input: num => p21cardAdd(num),
    protect: _ => p21exPut(info.type),
    rule: _ => p21exPut(info.type),
    plus: _ => p21exPut(info.type),
    break: _ => {
      $(`#p21-p${!+p21state() & 1}effect>a`).css({ animation: 'p21-broken 0.8s forwards' });
      setTimeout(_ => $(`#p21-p${!+p21state() & 1}effect>a`).remove(), 800);
    },
    place: _ => {
      $('.p21-desk card').css({
        transition: 'unset',
        'z-index': 100
      });
      let c0 = $(`#p21-p0card>card`).eq($(`#p21-p0card>card`).length - 1),
        c1 = $(`#p21-p1card>card`).eq($(`#p21-p1card>card`).length - 1),
        p0 = c0.offset(),
        p1 = c1.offset(),
        class0 = c0.attr('class'),
        class1 = c1.attr('class')
      setTimeout(_ => {
        c0.attr('class', class1);
        c1.attr('class', class0);
        c0.css({
          left: 0,
          top: 0
        });
        c1.css({
          left: 0,
          top: 0
        });
        setTimeout(_ => $('.p21-desk card').css({
          transition: '0.4s',
          'z-index': 'unset'
        }), 100);
      }, 350);
      c0.animate({
        left: p1.left - p0.left,
        top: p1.top - p0.top
      }, 300);
      c1.animate({
        left: p0.left - p1.left,
        top: p0.top - p1.top
      }, 300);
    }
  }
  info.type in p21ex && p21ex[info.type](info.num);
}

function p21exPut(type, amount) {
  let ex = `#p21-p${p21state()}effect>.p21-${type}`;
  if ($(ex).length || amount) {
    if ($(`${ex}>span`).length || amount > 1) $(ex).html(`<span>${Number($(`${ex}>span`).text()) + 1}<span>`);
    else $(ex).append('<span>2<span>');
  }
  else {
    $(`#p21-p${p21state()}effect`).append(`<a class="p21-${type}"></a>`);
    $(ex).dblclick(_ => p21exShow({ type: type, num: '' }));
  }
}
function p21exShow(info) {
  p21output(`<a class="p21-${info.type}" num="${info.num}"><n>${info.num}</n></a>`);
}
function p21exAdd(info) {
  let observe = sessionStorage.getItem('p21.observe');
  if (Object.keys(info).length == 2) {
    let s = observe ? p21state() : 1;
    $(`#p21-p${s}effect`).append('<e class="p21-cover"></e>');
    setTimeout(_ => {
      $(`#p21-p${s}effect>e`).eq(0).remove();
      if (!observe) {
        $('.p21-items').append(`<a class="p21-${info.type}" num="${info.num}"><n>${info.num}</n></a>`);
        let ex = $('.p21-items').children().eq(-1);
        ex.on('dblclick', _ => {
          if (p21state() == 0) msg({
            title: '提示',
            detail: '还没轮到你'
          });
          else if (p21cd() == 0) msg({
            title: '提示',
            detail: '操作太频繁'
          });
          else {
            emit('p21.excard', {
              type: $(ex).attr('class').slice(4),
              num: $(ex).attr('num')
            });
            //emit('p21.ex');
            $('#p21-items').click();
            ex.animate({ zoom: 0 }, 250);
            setTimeout(_ => ex.remove(), 250);
            p21cd(0);
            setTimeout(_ => p21cd(1), 1000);
          }
        });
      }
    }, 1000);
  }
  else if (!observe) {
    $(`#p21-p0effect`).append('<e class="p21-cover"></e>');
    setTimeout(_ => $(`#p21-p0effect>e`).eq(0).remove(), 1000)
  }
}
function p21exNote(info) {
  machine.pre('[sample="p21-excardNote"]', {
    type: info.type,
    num: info.num,
    sign: $(`#p21-p${p21state()}info .p21-name`).text().slice(0, 1)
  }, '.p21-excard>div');
  let ex = `.p21-excard>div>.p21-${info.type}[num="${info.num}"]`;
  $(ex).dblclick(_ => p21exShow(info));
}

function p21cover(num) {
  let state = p21state();
  p21cardAdd(0);
  setTimeout(_ => $(`#p21-p${state}card>.p21-0`).addClass(`p21-${num}`), 800);
}
function p21cardAdd(num) {
  $(`#p21-p${p21state()}card`).append(`<card class="p21-${num}"></card>`);
}
function p21clear() {
  $(`#p21-p0effect>a`).css({ animation: 'p21-broken 0.8s forwards' });
  $(`#p21-p1effect>a`).css({ animation: 'p21-broken 0.8s forwards' });
  setTimeout(_ => $(`#p21-p0effect>a`).remove(), 800);
  setTimeout(_ => $(`#p21-p1effect>a`).remove(), 800);
  for (let i of [0, 1]) {
    let p = `#p21-p${i}card`;
    let x = $(`${p}>card`).eq(0).offset().left;
    $(`${p}>card`).each((i, c) => $(c).animate({ left: x - $(c).offset().left }, 300));
    setTimeout(_ => {
      let l = $(`${p}>card`).length;
      $(`${p}>card`).each((i, c) => (i != l - 1) && $(c).css('opacity', 0));
      setTimeout(_ => {
        $(`${p}>card`).eq(l - 1).addClass('p21-result');
        $(`${p}>card`).eq(l - 1).css({ animation: 'p21-result 0.8s steps(29) forwards' });
        setTimeout(_ => $(p).html(''), 800);
      }, 300);
    }, 500);
  }
}
function p21publish(who, num) {
  let p = `#p21-p${who}card`;
  $(`${p}>card`).eq(0).css('transform', 'rotateY(180deg)');
  setTimeout(_ => {
    (num) ? $(`${p}>card`).eq(0).attr('class', `p21-${num}`) : $(`${p}>card`).eq(0).removeClass('p21-0');
    $(`${p}>card`).eq(0).css('transform', '');
  }, 400);
}
function p21option(type) {
  if (type == 'round') {
    $('#p21-ops').html(`<a type="yes"></a>`);
    $('#p21-ops').append(`<a type="no"></a>`);
  }
  else $('#p21-ops').html(`<a type="${type}"></a>`);
  p21opHold(1000, {
    yes: _ => {
      p21option('wait');
      emit('p21.yes');
    },
    no: _ => {
      p21option('wait');
      emit('p21.no');
    },
    wait: _ => p21option('wait'),
    result: _ => p21option('result'),
    draw: _ => p21option('draw'),
    fail: _ => p21option('fail'),
    win: _ => p21option('win'),
  });
}
function p21opHold(time, event) {
  $('#p21-ops>a').off();
  $('#p21-ops>a').on('mousedown', e => {
    let progress = 100 / ((time - 100) / 25);
    let opsInter = setInterval(_ => {
      $(`#p21-ops>a[type="${e.target.type}"]`).css('background-image', `linear-gradient(90deg, white ${progress}%, transparent ${progress}% 100%)`);
      progress += 100 / ((time - 100) / 25);
    }, 25);
    let opsTimer = setTimeout(_ => {
      clearInterval(opsInter);
      $(`#p21-ops>a`).each((i, op) => ($(op).attr('type') == e.target.type) ? $(op).animate({ zoom: 0 }, 250, _ => event[e.target.type]()) : $(op).animate({ zoom: 0 }, 250));
    }, time);
    $(document).on('mouseup', _ => {
      clearTimeout(opsTimer);
      clearInterval(opsInter);
      $('#p21-ops>a').css('background-image', '');
    });
  });
}

function p21state(v) {
  if (v != null) {
    $(`#p21-p${p21state()}info>a`).css('opacity', 0);
    $(`#p21-p${v}info>a`).css('opacity', 1);
    $('.p21').attr('state', v);
  }
  else return $('.p21').attr('state');
}
function p21output(info) {
  if ($('.p21-output').css('opacity') == 0) {
    $('.p21-output').html(info);
    $('#p21-output').click();
  }
  else {
    $('#p21-output').click();
    setTimeout(_ => {
      $('.p21-output').html(info);
      $('#p21-output').click();
    }, 300);
  }
}
function p21tip(info) {
  let t = {
    excess: '你不能持有更多了',
    last: '最后一张不能动',
    nofound: '该数字不在牌堆里'
  }
  msg({
    title: '提示',
    detail: t[info]
  });
  if (info == 'excess') p21option('round');
}
function p21turn() {
  p21state(!Number(p21state()) & 1);
  if (!sessionStorage.getItem('p21.observe') && p21state() == 1) p21option('round');
}
function p21cd(v) {
  if (v != null) $('.p21').attr('cd', v);
  else return $('.p21').attr('cd');
}
function p21suspend(info) {
  roomJoinReq(info.rid);
  msg({
    title: '提示',
    detail: `参与者退出，返回符台`
  });
}