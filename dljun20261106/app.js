(function () {
    'use strict';

    var DEFAULT_TEXTS = [
        '今天的你，值得一份不期而遇的好运。',
        '有人正悄悄把你写进他的计划里。',
        '别急，好事正在慢悠悠地赶来。',
        '你远比自己想象的要更被喜欢。',
        '这周末，会有一顿很香的饭等你。',
        '把烦恼留在这里，轻一点往前走。',
        '一个很久没联系的人，会想起你。',
        '你种下的那颗种子，快要发芽了。',
        ''
    ];

    var KEY_CARDS = 'blindbox.web.cards.v1';
    var KEY_ORDER = 'blindbox.web.order.v1';
    var KEY_PREV_ORDER = 'blindbox.web.prevorder.v1';
    var KEY_OPENED = 'blindbox.web.opened.v1';
    var KEY_MODE = 'blindbox.web.mode.v1';
    var KEY_B_POOL = 'blindbox.web.b.pool.v1';
    var KEY_B_DRAW = 'blindbox.web.b.draw.v1';
    var KEY_B_OPENED = 'blindbox.web.b.opened.v1';
    var KEY_SOUND = 'blindbox.web.sound.v1';
    var SOUND_SRC = 'assets/audio/surprise.wav';
    var SOUND_VOLUME = 0.38;
    var DB_NAME = 'blindbox-web-files';

    // 体系 B 的内置清单库：一行一件事，随机抽 9 件放进盲盒。
    var POOL_MAX = 100;

    var DEFAULT_POOL = [
        '今天请我喝一杯你最爱的饮料',
        '给我发一张你今天看到的天空',
        '陪我散一次步，不走回头路',
        '今晚的电影由你来选',
        '给我一个十秒以上的拥抱',
        '一起吃一顿不看手机的饭',
        '告诉我一件你从没说过的小事',
        '下次见面带一份小零食给我',
        '为我挑一首歌，并说明理由',
        '陪我去看一次日落',
        '今天由你决定我们吃什么',
        '给我写一句只属于我的话',
        '一起拍一张没对好焦的合照',
        '提醒我早睡，然后自己也要做到',
        '把今天最开心的瞬间讲给我听',
        '下次下雨，一起踩一次水坑',
        '给我起一个只有你能叫的称呼',
        '陪我逛一次书店，各选一本书',
        '今天不可以说「随便」',
        '为我做一件你擅长的小事',
        '一起数今晚能看见几颗星',
        '给我看一张你小时候的照片',
        '下次见面，先给我一个笑',
        '陪我坐一趟没有目的地的车',
        '今天夸我三次，不能重复',
        '手机壁纸换成我们的合照一天',
        '给我讲一个你最近做过的梦',
        '一起试一家从没去过的店',
        '为我留一份你舍不得吃的东西',
        '今天由你来讲睡前故事',
        '陪我把一首歌从头听到尾',
        '下次见面带一朵花，不拘什么花',
        '告诉我你最想和我去的地方',
        '今天不许说「改天」，就今天',
        '给我一个突然的拥抱，不许预告',
        '一起把这件小事写进日历'
    ];

    var state = {
        mode: 'A',
        cards: [],
        order: [],
        opened: [],
        pool: [],
        draw: [],
        view: 'home',
        activeEditor: 0,
        result: null,
        audioPlaying: false,
        shuffling: false,
        shared: false,
        soundOn: true,
        timers: [],
        pendingPick: null
    };

    var els = {};
    var audioEl = null;
    var soundEl = null;
    var soundFadeTimer = null;
    var toastTimer = null;
    var urlCache = {};

    function $(id) { return document.getElementById(id); }

    function pad2(n) { return n < 10 ? '0' + n : '' + n; }

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function safeSrc(src) {
        var value = String(src || '');
        return /^(https?:\/\/|data:|blob:|assets\/|\.\/|\/)/i.test(value) ? value : '';
    }

    function toast(message) {
        els.toast.textContent = message;
        els.toast.hidden = false;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { els.toast.hidden = true; }, 1900);
    }

    /* ---------------- 拆盒惊喜音效 ---------------- */
    // 语音优先：播放语音或关闭弹层时，音效短淡出后让路，避免两段声音叠在一起。
    function stopSurpriseSound(fade) {
        if (!soundEl) { return; }
        if (soundFadeTimer) { clearTimeout(soundFadeTimer); soundFadeTimer = null; }
        if (!fade) {
            try {
                soundEl.pause();
                soundEl.volume = SOUND_VOLUME;
                soundEl.currentTime = 0;
            } catch (error) { /* ignore */ }
            return;
        }
        var volume = soundEl.volume;
        var tick = function () {
            if (!soundEl || soundEl.paused) { return; }
            volume -= 0.1;
            if (volume <= 0) {
                soundEl.volume = SOUND_VOLUME;
                soundEl.pause();
                try { soundEl.currentTime = 0; } catch (error) { /* ignore */ }
                soundFadeTimer = null;
                return;
            }
            soundEl.volume = volume;
            soundFadeTimer = setTimeout(tick, 15);
        };
        tick();
    }

    function playSurpriseSound() {
        if (!state.soundOn) { return; }
        if (state.audioPlaying) { stopAudio(); }
        if (soundFadeTimer) { clearTimeout(soundFadeTimer); soundFadeTimer = null; }
        try {
            if (!soundEl) {
                soundEl = new Audio(SOUND_SRC);
                soundEl.preload = 'auto';
            }
            soundEl.volume = SOUND_VOLUME;
            soundEl.currentTime = 0;
            var playing = soundEl.play();
            if (playing && playing.catch) {
                playing.catch(function () { /* 自动播放受限时静默跳过 */ });
            }
        } catch (error) { /* 音频不可用时静默跳过 */ }
    }

    function updateSoundBtn() {
        if (!els.soundBtn) { return; }
        els.soundBtn.textContent = state.soundOn ? '♫ 音效开' : '♫ 音效关';
        els.soundBtn.classList.toggle('off', !state.soundOn);
    }

    function toggleSound() {
        state.soundOn = !state.soundOn;
        writeJSON(KEY_SOUND, state.soundOn);
        if (!state.soundOn) { stopSurpriseSound(false); }
        updateSoundBtn();
        toast(state.soundOn ? '拆盒音效已开启' : '拆盒音效已关闭');
    }

    function readJSON(key, fallback) {
        try {
            var raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch (error) {
            return fallback;
        }
    }

    function writeJSON(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (error) {
            toast('浏览器存储不可用，本次修改只在当前页面有效');
        }
    }

    function removeKey(key) {
        try { localStorage.removeItem(key); } catch (error) { /* storage unavailable */ }
    }

    // A shared link carries its own content; don't let it overwrite this
    // browser's saved "opened" progress.
    function persistOpened() {
        if (!state.shared || state.mode === 'B') { writeJSON(openedKey(), state.opened); }
    }

    function later(callback, delay) {
        state.timers.push(setTimeout(callback, delay));
    }

    function clearTimers() {
        state.timers.forEach(function (id) { clearTimeout(id); });
        state.timers = [];
    }

    /* ---------------- Data ---------------- */

    function defaultCards() {
        return DEFAULT_TEXTS.map(function (text, position) {
            var number = position + 1;
            var isAudio = number === 9;
            return {
                id: 'card-' + pad2(number),
                label: pad2(number),
                image: 'assets/cards/card-' + pad2(number) + '.png',
                type: isAudio ? 'audio' : 'text',
                text: text,
                audio: isAudio ? 'assets/audio/special.wav' : '',
                audioName: isAudio ? '默认惊喜铃声' : ''
            };
        });
    }

    /* ---------------- Mode B: 清单库与随机抽取 ---------------- */

    function openedKey() {
        return state.mode === 'B' ? KEY_B_OPENED : KEY_OPENED;
    }

    function validIds() {
        if (state.mode === 'B') {
            return state.draw.map(function (item, index) { return 'b-' + pad2(index + 1); });
        }
        return state.cards.map(function (card) { return card.id; });
    }

    function loadOpened() {
        var ids = validIds();
        var opened = readJSON(openedKey(), []);
        state.opened = Array.isArray(opened)
            ? opened.filter(function (id) { return ids.indexOf(id) !== -1; })
            : [];
    }

    function readMode() {
        return readJSON(KEY_MODE, 'A') === 'B' ? 'B' : 'A';
    }

    function normalizePool(list) {
        var source = Array.isArray(list) ? list : DEFAULT_POOL;
        var seen = {};
        var result = [];
        source.forEach(function (item) {
            if (typeof item !== 'string') { return; }
            var line = item.trim().slice(0, 60);
            if (!line || seen[line]) { return; }
            seen[line] = true;
            result.push(line);
        });
        return result.length ? result.slice(0, POOL_MAX) : DEFAULT_POOL.slice();
    }

    // 从清单库随机抽 9 件：多轮采样，优先挑与上一批重叠最少的一组，
    // 让「重新抽取」真的像换了一批，而不是大半还都是原来那几件。
    function drawNine() {
        var pool = state.pool.length ? state.pool : DEFAULT_POOL.slice();
        var previous = state.draw.slice();
        var best = null;
        var bestScore = Infinity;
        for (var attempt = 0; attempt < 40; attempt += 1) {
            var picked = randomPermutation(pool).slice(0, 9);
            while (picked.length < 9) {
                picked.push(pool[Math.floor(Math.random() * pool.length)]);
            }
            var overlap = 0;
            if (previous.length) {
                picked.forEach(function (item) {
                    if (previous.indexOf(item) !== -1) { overlap += 1; }
                });
            }
            // 重叠权重远大于随机扰动；同重叠度下仍保持随机，不收敛成固定组合。
            var score = overlap * 10 + Math.random();
            if (score < bestScore) {
                bestScore = score;
                best = picked;
            }
        }
        return best;
    }

    function redraw() {
        state.draw = drawNine();
        writeJSON(KEY_B_DRAW, state.draw);
        state.opened = [];
        persistOpened();
        renderHome();
        toast('重新抽了 9 件事，尽量避开上一批');
    }

    // B 的九个盒子是按位置固定的伪卡片，内容来自本轮抽取结果。
    function cardForId(id) {
        if (state.mode === 'B') {
            var index = Number(String(id).replace('b-', '')) - 1;
            if (index < 0 || index > 8) { return null; }
            return {
                id: id,
                label: pad2(index + 1),
                type: 'text',
                text: state.draw[index] || '',
                audio: ''
            };
        }
        return findCard(id);
    }

    function switchMode(next) {
        if (next !== 'A' && next !== 'B') { return; }
        if (next === state.mode) { return; }
        stopAudio();
        closeResult();
        state.mode = next;
        writeJSON(KEY_MODE, next);
        loadOpened();
        showView('home');
        renderHome();
        renderEditor();
        toast(next === 'B' ? '已切到惊喜清单 B' : '已切到固定盲盒 A');
    }

    function normalizeCards(list) {
        var defaults = defaultCards();
        var source = Array.isArray(list) ? list : [];
        return defaults.map(function (base, position) {
            var raw = source[position] || {};
            var card = {
                id: base.id,
                label: base.label,
                image: base.image,
                type: (raw.type === 'audio' || raw.type === 'text') ? raw.type : base.type,
                text: typeof raw.text === 'string' ? raw.text : base.text,
                audio: typeof raw.audio === 'string' ? raw.audio : base.audio,
                audioName: typeof raw.audioName === 'string' ? raw.audioName : base.audioName
            };
            if (card.type === 'audio') { card.text = ''; }
            return card;
        });
    }

    function sanitizeOrder(order, ids) {
        var source = Array.isArray(order) ? order : [];
        var result = source.filter(function (id) { return ids.indexOf(id) !== -1; });
        ids.forEach(function (id) {
            if (result.indexOf(id) === -1) { result.push(id); }
        });
        return result;
    }

    function randomPermutation(source) {
        var shuffled = source.slice();
        for (var i = shuffled.length - 1; i > 0; i -= 1) {
            var j = Math.floor(Math.random() * (i + 1));
            var swap = shuffled[i];
            shuffled[i] = shuffled[j];
            shuffled[j] = swap;
        }
        return shuffled;
    }

    // Grid distance in the 3x3 layout, used to make a shuffle feel like a
    // real reshuffle instead of two neighbouring cards quietly swapping.
    function gridDistance(from, to) {
        return Math.abs(from % 3 - to % 3)
            + Math.abs(Math.floor(from / 3) - Math.floor(to / 3));
    }

    // 更强力的打乱：先随机生成大量候选，再按「整体位移 + 远距离张数 +
    // 与上一局的错位程度」打分，取最乱的一组；分数里带随机扰动，
    // 保证每次结果都不同，又不会退化成两张三张悄悄换位的假洗牌。
    function shuffleOrder(order, previous, specialIds) {
        var source = order.slice();
        var n = source.length;
        if (n < 2) { return source; }
        var prev = Array.isArray(previous) && previous.length === n ? previous.slice() : [];
        var specials = Array.isArray(specialIds) ? specialIds : [];
        var best = null;
        var bestScore = -Infinity;
        var fallback = null;
        var attempts = Math.max(240, n * 30);
        for (var attempt = 0; attempt < attempts; attempt += 1) {
            var candidate = randomPermutation(source);
            var totalMove = 0;
            var farMoves = 0;
            var prevSame = 0;
            var fixed = false;
            for (var i = 0; i < n; i += 1) {
                var distance = gridDistance(source.indexOf(candidate[i]), i);
                if (distance === 0) { fixed = true; break; }
                totalMove += distance;
                if (distance >= 2) { farMoves += 1; }
                if (prev.length && candidate[i] === prev[i]) { prevSame += 1; }
            }
            if (fixed) { continue; }
            // 特殊盲盒必须离开原位至少两格，也不许停在上一局的老位置。
            var specialOk = specials.every(function (id) {
                var from = source.indexOf(id);
                var to = candidate.indexOf(id);
                if (from === -1 || to === -1) { return true; }
                if (gridDistance(from, to) < 2) { return false; }
                if (prev.length && to === prev.indexOf(id)) { return false; }
                return true;
            });
            if (!specialOk) { continue; }
            if (!fallback) { fallback = candidate; }
            var score = totalMove * 2 + farMoves * 3
                + (n - prevSame) * 2 + Math.random() * (n * 2);
            if (score > bestScore) {
                bestScore = score;
                best = candidate;
            }
        }
        if (best) { return best; }
        if (fallback) { return fallback; }
        // Sattolo：单循环，兜底保证没有任何卡片留在原位。
        var cycle = source.slice();
        for (var k = n - 1; k > 0; k -= 1) {
            var j = Math.floor(Math.random() * k);
            var tmp = cycle[k];
            cycle[k] = cycle[j];
            cycle[j] = tmp;
        }
        return cycle;
    }

    function serializeCard(card) {
        return {
            id: card.id,
            label: card.label,
            image: card.image,
            type: card.type,
            text: card.text,
            audio: card.audio,
            audioName: card.audioName
        };
    }

    function loadState() {
        state.soundOn = readJSON(KEY_SOUND, true) !== false;
        state.mode = readMode();
        state.cards = normalizeCards(readJSON(KEY_CARDS, null));
        var ids = state.cards.map(function (card) { return card.id; });
        var savedOrder = readJSON(KEY_ORDER, null);
        if (Array.isArray(savedOrder) && savedOrder.length) {
            state.order = sanitizeOrder(savedOrder, ids);
        } else {
            // 第一次打开就先彻底洗一次，特殊盲盒不会固定待在右下角。
            var firstSpecials = state.cards.filter(function (card) {
                return card.type === 'audio';
            }).map(function (card) { return card.id; });
            state.order = shuffleOrder(ids, [], firstSpecials);
            writeJSON(KEY_ORDER, state.order);
        }
        state.pool = normalizePool(readJSON(KEY_B_POOL, null));
        writeJSON(KEY_B_POOL, state.pool);
        var saved = readJSON(KEY_B_DRAW, null);
        var valid = Array.isArray(saved) && saved.length === 9
            && saved.every(function (item) { return typeof item === 'string'; });
        state.draw = valid ? saved : [];
        if (!state.draw.length) {
            state.draw = drawNine();
            writeJSON(KEY_B_DRAW, state.draw);
        }
        loadOpened();
    }

    function shortText(text) {
        if (!text) { return '还没写内容'; }
        return text.length > 16 ? text.slice(0, 16) + '…' : text;
    }

    function sourceLabel(src) {
        if (!src) { return '未设置'; }
        if (src.indexOf('assets/') === 0) { return '内置素材'; }
        if (src.indexOf('idb:') === 0 || src.indexOf('data:') === 0) { return '本机文件'; }
        if (src.indexOf('http') === 0) { return '外链'; }
        return '本机文件';
    }

    // 九张封面统一使用同一张图，按格子位置取图，
    // 打乱时只换盒子里的卡片内容，封面不受影响。
    function coverForPosition(position) {
        return 'assets/cards/card-' + pad2(position + 1) + '.png';
    }

    function displayImage(card) {
        return coverForPosition(Number(card.label) - 1);
    }

    function displayAudio(card) {
        return safeSrc(card._audio || card.audio);
    }

    function findCard(id) {
        return state.cards.filter(function (card) { return card.id === id; })[0] || null;
    }

    /* ---------------- Local files (IndexedDB) ---------------- */

    function openDB() {
        return new Promise(function (resolve, reject) {
            if (!window.indexedDB) { reject(new Error('IndexedDB unavailable')); return; }
            var settled = false;
            // 部分安卓 WebView / 隐私模式下 indexedDB.open 会一直不回调，
            // 超时后直接走 FileReader 兜底，避免上传永远没有反馈。
            var timer = setTimeout(function () {
                if (settled) { return; }
                settled = true;
                reject(new Error('IndexedDB timeout'));
            }, 2500);
            var request;
            try {
                request = indexedDB.open(DB_NAME, 1);
            } catch (error) {
                clearTimeout(timer); settled = true; reject(error); return;
            }
            request.onupgradeneeded = function () {
                if (!request.result.objectStoreNames.contains('files')) {
                    request.result.createObjectStore('files');
                }
            };
            request.onsuccess = function () {
                if (settled) { return; }
                settled = true; clearTimeout(timer); resolve(request.result);
            };
            request.onerror = function () {
                if (settled) { return; }
                settled = true; clearTimeout(timer); reject(request.error);
            };
        });
    }

    function putFile(file) {
        return openDB().then(function (db) {
            return new Promise(function (resolve, reject) {
                var key = 'f-' + Date.now() + '-' + Math.random().toString(36).slice(2);
                var tx = db.transaction('files', 'readwrite');
                tx.objectStore('files').put(file, key);
                tx.oncomplete = function () { resolve('idb:' + key); };
                tx.onerror = function () { reject(tx.error); };
            });
        });
    }

    function getFile(key) {
        return openDB().then(function (db) {
            return new Promise(function (resolve, reject) {
                var tx = db.transaction('files', 'readonly');
                var request = tx.objectStore('files').get(key);
                request.onsuccess = function () { resolve(request.result || null); };
                request.onerror = function () { reject(request.error); };
            });
        });
    }

    var AUDIO_EXT_MIME = {
        mp3: 'audio/mpeg', wav: 'audio/wav', wave: 'audio/wav',
        m4a: 'audio/mp4', m4b: 'audio/mp4', aac: 'audio/aac',
        ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg',
        flac: 'audio/flac', amr: 'audio/amr', '3gp': 'audio/3gpp',
        '3gpp': 'audio/3gpp', mp4: 'audio/mp4', webm: 'audio/webm',
        wma: 'audio/x-ms-wma', aif: 'audio/aiff', aiff: 'audio/aiff',
        mid: 'audio/midi', midi: 'audio/midi', caf: 'audio/x-caf'
    };

    function guessAudioMime(name) {
        var match = /\.([a-z0-9]+)$/i.exec(name || '');
        return (match && AUDIO_EXT_MIME[match[1].toLowerCase()]) || 'audio/mpeg';
    }

    // 安卓录音 / content:// 常返回空类型或 application/octet-stream，
    // 补一个音频 MIME，避免存进浏览器后 blob 无法被 <audio> 解码。
    function normalizeAudioFile(file) {
        var type = (file.type || '').toLowerCase();
        if (type && type !== 'application/octet-stream') { return file; }
        try {
            return new File([file], file.name || 'recording', {
                type: guessAudioMime(file.name),
                lastModified: file.lastModified || Date.now()
            });
        } catch (error) { return file; }
    }

    function isClearlyNotAudio(file) {
        var type = (file.type || '').toLowerCase();
        if (/^(image|text)\//.test(type)) { return true; }
        if (/^application\/(pdf|zip|x-zip|json|xml|msword|vnd\.)/.test(type)) { return true; }
        return false;
    }

    function fileToRef(file) {
        return putFile(file).catch(function () {
            return new Promise(function (resolve, reject) {
                var reader = new FileReader();
                reader.onload = function () { resolve(reader.result); };
                reader.onerror = function () { reject(reader.error); };
                reader.readAsDataURL(file);
            });
        });
    }

    function resolveSrc(src) {
        if (!src || src.indexOf('idb:') !== 0) { return Promise.resolve(src); }
        var key = src.slice(4);
        if (urlCache[key]) { return Promise.resolve(urlCache[key]); }
        return getFile(key).then(function (blob) {
            if (!blob) { return ''; }
            var url = URL.createObjectURL(blob);
            urlCache[key] = url;
            return url;
        }).catch(function () { return ''; });
    }

    function hydrate() {
        return Promise.all(state.cards.map(function (card) {
            return resolveSrc(card.audio).then(function (resolved) {
                card._audio = resolved || card.audio;
            });
        }));
    }

    /* ---------------- Share link ---------------- */

    function b64encode(text) {
        var bytes = new TextEncoder().encode(text);
        var binary = '';
        for (var i = 0; i < bytes.length; i += 1) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    function b64decode(text) {
        var value = text.replace(/-/g, '+').replace(/_/g, '/');
        while (value.length % 4) { value += '='; }
        var binary = atob(value);
        var bytes = new Uint8Array(binary.length);
        for (var i = 0; i < binary.length; i += 1) {
            bytes[i] = binary.charCodeAt(i);
        }
        return new TextDecoder().decode(bytes);
    }

    function buildShareUrl() {
        var defaults = defaultCards();
        var cards = state.cards.map(function (card) {
            var localAudio = card.audio.indexOf('idb:') === 0 || card.audio.indexOf('data:') === 0;
            return {
                id: card.id,
                type: card.type,
                text: card.type === 'audio' ? '' : card.text,
                audio: localAudio ? (card.type === 'audio' ? defaults[8].audio : '') : card.audio,
                audioName: card.audioName
            };
        });
        var url = location.href.split('#')[0] + '#box=' + b64encode(JSON.stringify({ cards: cards, order: state.order }));
        return url;
    }

    // B 的分享链接只带清单库，抽中的 9 件不进链接，朋友打开会重新抽。
    function buildPoolShareUrl() {
        return location.href.split('#')[0] + '#pool='
            + b64encode(JSON.stringify({ pool: state.pool }));
    }

    function applyPoolFromHash() {
        var match = /^#pool=([A-Za-z0-9_-]+)$/.exec(location.hash);
        if (!match) { return false; }
        try {
            var payload = JSON.parse(b64decode(match[1]));
            state.pool = normalizePool(payload.pool);
            writeJSON(KEY_B_POOL, state.pool);
            state.mode = 'B';
            writeJSON(KEY_MODE, 'B');
            state.draw = drawNine();
            writeJSON(KEY_B_DRAW, state.draw);
            state.opened = [];
            persistOpened();
            state.shared = false;
            return true;
        } catch (error) {
            return false;
        }
    }

    function applyHash() {
        if (applySharedFromHash()) { return true; }
        if (applyPoolFromHash()) { return true; }
        return false;
    }

    function applySharedFromHash() {
        var match = /^#box=([A-Za-z0-9_-]+)$/.exec(location.hash);
        if (!match) { return false; }
        try {
            var payload = JSON.parse(b64decode(match[1]));
            var defaults = defaultCards();
            state.cards = defaults.map(function (base, index) {
                var raw = (payload.cards || [])[index] || {};
                return {
                    id: base.id,
                    label: base.label,
                    image: base.image,
                    type: (raw.type === 'audio' || raw.type === 'text') ? raw.type : base.type,
                    text: typeof raw.text === 'string' ? raw.text : base.text,
                    audio: typeof raw.audio === 'string' ? safeSrc(raw.audio) : base.audio,
                    audioName: typeof raw.audioName === 'string' ? raw.audioName : base.audioName
                };
            });
            state.cards.forEach(function (card) {
                if (card.type === 'audio') { card.text = ''; }
            });
            state.order = sanitizeOrder(payload.order, state.cards.map(function (card) { return card.id; }));
            state.mode = 'A';
            writeJSON(KEY_MODE, 'A');
            state.opened = [];
            state.shared = true;
            return true;
        } catch (error) {
            return false;
        }
    }

    function copyText(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(text);
        }
        return new Promise(function (resolve, reject) {
            var helper = document.createElement('textarea');
            helper.value = text;
            document.body.appendChild(helper);
            helper.select();
            try {
                if (document.execCommand('copy')) { resolve(); }
                else { reject(new Error('copy blocked')); }
            } catch (error) {
                reject(error);
            } finally {
                document.body.removeChild(helper);
            }
        });
    }

    /* ---------------- Rendering ---------------- */

    function renderHome() {
        var isB = state.mode === 'B';
        var list;
        if (isB) {
            list = state.draw.map(function (text, position) {
                return {
                    id: 'b-' + pad2(position + 1),
                    label: pad2(position + 1),
                    type: 'text',
                    text: text
                };
            });
        } else {
            var byId = {};
            state.cards.forEach(function (card) { byId[card.id] = card; });
            list = state.order.map(function (id) { return byId[id]; }).filter(Boolean);
        }
        var total = list.length || 1;

        els.grid.innerHTML = list.map(function (card, position) {
            var opened = state.opened.indexOf(card.id) !== -1;
            // B 的盒子背面不显示事件内容，拆开之前谁都不会提前看到。
            var backLabel = isB
                ? '已开启 · 点击重看'
                : (card.type === 'audio'
                    ? '♫ 语音盲盒'
                    : (card.text ? (card.text.length > 11 ? card.text.slice(0, 11) + '…' : card.text) : '空白盲盒'));
            return '<div class="cell shuffle-' + (position % 3) + '"'
                + ' style="animation-delay:' + ((position % 5) * 24) + 'ms"'
                + ' data-id="' + escapeHtml(card.id) + '">'
                + '<div class="card-inner ' + (opened ? 'is-open' : '') + '">'
                + '<div class="face front">'
                + '<img class="card-image" src="' + escapeHtml(coverForPosition(position)) + '" alt="盲盒卡面">'
                + '<div class="front-gloss"></div>'
                + '</div>'
                + '<div class="face back"><div class="back-star">✦</div>'
                + '<div class="back-label">' + escapeHtml(backLabel) + '</div>'
                + '<div class="back-hint">点击重看</div></div>'
                + '</div></div>';
        }).join('');

        els.openedCount.textContent = state.opened.length;
        els.totalCount.textContent = list.length;
        els.progressFill.style.width = Math.round(state.opened.length * 100 / total) + '%';

        els.modeA.classList.toggle('active', !isB);
        els.modeB.classList.toggle('active', isB);
        els.editBtn.textContent = isB ? '编辑清单库' : '编辑内容';
        els.shuffleBtn.textContent = isB ? '重新抽取' : '随机打乱';
        els.shuffleBtn.dataset.action = isB ? 'redraw' : 'shuffle';
        els.tipLine.textContent = isB
            ? '九个盲盒里装的是从清单库随机抽出的 9 件事，拆开之前谁都不知道是什么。点「重新抽取」换一批，封面始终不变。'
            : '「随机打乱」会让九个盲盒全部换位置并盖上，特殊盲盒也跟着藏起来；九张封面已固定，打乱也不会变。飘字和语音可以在「编辑内容」里换。';
        els.shareTip.hidden = !state.shared || isB;
        if (state.shared && !isB) {
            els.shareTip.textContent = '已载入朋友分享的这一套盲盒内容；在「编辑内容」里保存，就会变成你自己的版本。';
        }
    }

    function renderEditor() {
        var isB = state.mode === 'B';
        els.noticeA.hidden = isB;
        els.editorList.hidden = isB;
        els.poolEditor.hidden = !isB;
        els.editorTitle.textContent = isB ? '维护你的清单库' : '把盲盒变成你的样子';
        els.editorDesc.textContent = isB
            ? '一行写一件事。体系 B 每次随机抽 9 件放进盲盒，纯文字，不设单个盲盒内容。'
            : '9 张卡，每张都能换文字，或改成「文字留空 + 一段声音」的语音盲盒；封面已固定为统一封面，不用再换。';
        els.saveBtn.textContent = isB ? '保存清单库' : '保存修改';
        els.resetContentBtn.textContent = isB ? '恢复默认清单' : '恢复默认内容';
        els.actionsHint.textContent = isB
            ? '「复制分享链接」会把整套清单库发给朋友，对方打开会重新随机抽 9 件，谁都提前不知道内容；抽中的组合不会写进链接。清单最多 100 条。'
            : '「复制分享链接」会把你写的文字、类型和排列顺序一起写进链接，朋友打开就是这一套盲盒；本机上传的音频不会跟着链接走，会回退成默认声音，封面始终是统一封面。';
        els.poolCount.textContent = '共 ' + state.pool.length + ' 条 / 最多 ' + POOL_MAX + ' 条';
        if (isB) {
            els.poolInput.value = state.pool.join('\n');
            return;
        }
        els.editorList.innerHTML = state.cards.map(function (card, index) {
            var expanded = state.activeEditor === index;
            var summary = card.type === 'audio'
                ? (card.audio ? '语音 · ' + (card.audioName || sourceLabel(card.audio)) : '语音 · 未设置音频')
                : shortText(card.text);
            var html = '<div class="item"><div class="item-head" data-action="toggle-item" data-index="' + index + '">'
                + '<img class="thumb" src="' + escapeHtml(displayImage(card)) + '" alt="">'
                + '<div class="meta"><div class="meta-title">第 ' + card.label + ' 张 · '
                + (card.type === 'audio' ? '语音盲盒' : '文字盲盒') + '</div>'
                + '<div class="meta-summary">' + escapeHtml(summary) + '</div></div>'
                + '<div class="arrow">' + (expanded ? '−' : '+') + '</div></div>';
            if (!expanded) { return html + '</div>'; }

            html += '<div class="item-body">';
            html += '<div class="field"><div class="field-label">盲盒类型</div><div class="type-switch">'
                + '<button class="type-opt ' + (card.type === 'text' ? 'active' : '') + '" data-action="set-type" data-index="' + index + '" data-type="text">文字盲盒</button>'
                + '<button class="type-opt ' + (card.type === 'audio' ? 'active' : '') + '" data-action="set-type" data-index="' + index + '" data-type="audio">语音盲盒</button>'
                + '</div><div class="field-help">语音盲盒的飘字内容为空，拆开时只播放音频。</div></div>';

            if (card.type === 'text') {
                html += '<div class="field"><div class="field-label">飘出来的那行字</div>'
                    + '<textarea class="text-input" data-index="' + index + '" maxlength="60" placeholder="写一句想说的话…">'
                    + escapeHtml(card.text) + '</textarea>'
                    + '<div class="counter" data-index="' + index + '">' + card.text.length + ' / 60</div></div>';
            }

            html += '<div class="field"><div class="field-label">封面 · 第 ' + card.label + ' 格（固定）</div>'
                + '<img class="preview" src="' + escapeHtml(displayImage(card)) + '" alt="">'
                + '<div class="field-help">封面已固定为统一封面，不能更换。</div></div>';

            if (card.type === 'audio') {
                var audioLabel = card.audio ? (card.audioName || sourceLabel(card.audio)) : '未设置音频';
                html += '<div class="field"><div class="field-label">音频 · ' + escapeHtml(audioLabel) + '</div>'
                    + '<div class="btn-row">'
                    + '<button data-action="pick-audio" data-index="' + index + '">选音频文件</button>'
                    + '<button data-action="url-audio" data-index="' + index + '">用音频链接</button>'
                    + '<button data-action="preview-audio" data-index="' + index + '">试听</button>'
                    + '</div><div class="field-help">留空文字、只留声音，这就是特殊盲盒。</div></div>';
            }

            return html + '</div></div>';
        }).join('');
    }

    function renderConfetti() {
        var colors = ['#FF7EB6', '#FFD166', '#7C5CFF', '#5BD6C0', '#FFFFFF'];
        var html = '';
        for (var i = 0; i < 16; i += 1) {
            html += '<div class="confetti dir-' + (i % 4) + '" style="left:' + (12 + (i % 8) * 10) + '%;'
                + 'top:' + (34 + (i % 3) * 9) + '%;animation-delay:' + (i * 42) + 'ms;'
                + 'background:' + colors[i % colors.length] + '"></div>';
        }
        els.confettiLayer.innerHTML = html;
    }

    function renderWave() {
        var html = '';
        for (var i = 0; i < 9; i += 1) {
            html += '<div class="wave-bar" style="height:' + (11 + (i % 4) * 7) + 'px;'
                + 'animation-delay:' + (i * 80) + 'ms"></div>';
        }
        els.wave.innerHTML = html;
    }

    function showView(name) {
        state.view = name;
        els.home.hidden = name !== 'home';
        els.editor.hidden = name !== 'editor';
        if (name === 'editor') { renderEditor(); }
        window.scrollTo(0, 0);
    }

    /* ---------------- Audio ---------------- */

    function ensureAudio() {
        if (!audioEl) {
            audioEl = new Audio();
            audioEl.preload = 'auto';
            audioEl.addEventListener('ended', function () {
                state.audioPlaying = false;
                updateAudioUI('重播语音');
            });
            audioEl.addEventListener('error', function () {
                state.audioPlaying = false;
                updateAudioUI('重播语音');
                toast('音频播放失败，请换一个文件或链接');
            });
        }
        return audioEl;
    }

    function updateAudioUI(forcedText) {
        var card = state.result ? findCard(state.result.id) : null;
        var hasAudio = !!(card && card.type === 'audio' && displayAudio(card));
        els.audioBtn.textContent = forcedText
            || (state.audioPlaying ? '停止播放' : (hasAudio ? '播放语音' : '暂无音频'));
        var bars = els.wave.querySelectorAll('.wave-bar');
        Array.prototype.forEach.call(bars, function (bar) {
            bar.classList.toggle('playing', state.audioPlaying);
        });
    }

    // Browsers only allow autoplay after a user gesture. Unlock the media element
    // inside the tap handler (silent), then play for real when the box opens.
    function primeAudio(src) {
        var audio = ensureAudio();
        audio.src = src;
        audio.volume = 0;
        var pending = audio.play();
        if (pending && typeof pending.then === 'function') {
            pending.then(function () {
                if (!state.audioPlaying) {
                    audio.pause();
                    try { audio.currentTime = 0; } catch (error) { /* metadata not ready */ }
                }
                audio.volume = 1;
            }).catch(function () { audio.volume = 1; });
        } else {
            audio.volume = 1;
        }
    }

    function startAudio(src) {
        stopSurpriseSound(true);
        var audio = ensureAudio();
        audio.src = src;
        audio.volume = 1;
        try { audio.currentTime = 0; } catch (error) { /* metadata not ready */ }
        var pending = audio.play();
        state.audioPlaying = true;
        updateAudioUI();
        if (pending && typeof pending.catch === 'function') {
            pending.catch(function () {
                state.audioPlaying = false;
                updateAudioUI('点击播放语音');
            });
        }
    }

    function stopAudio() {
        if (audioEl) {
            audioEl.pause();
            try { audioEl.currentTime = 0; } catch (error) { /* metadata not ready */ }
        }
        state.audioPlaying = false;
        updateAudioUI();
    }

    /* ---------------- Open a box ---------------- */

    function randomizeGift() {
        var dx = Math.round((Math.random() * 2 - 1) * 23);
        var dy = Math.round((Math.random() * 2 - 1) * 7);
        var rotate = Math.round((Math.random() * 2 - 1) * 7);
        els.gift.style.marginLeft = dx + 'px';
        els.gift.style.transform = 'translateX(-50%) translateY(' + dy + 'px) rotate(' + rotate + 'deg)';
        els.giftGlow.style.marginLeft = dx + 'px';
        els.giftShadow.style.marginLeft = dx + 'px';
    }

    function onCardTap(id) {
        if (state.view !== 'home' || !els.overlay.hidden || state.shuffling) { return; }
        var card = cardForId(id);
        if (!card) { return; }

        playSurpriseSound();

        if (card.type === 'audio' && displayAudio(card)) {
            stopAudio();
            primeAudio(displayAudio(card));
        }

        if (state.opened.indexOf(id) !== -1) {
            openResult(card, false);
            return;
        }
        var cell = els.grid.querySelector('.cell[data-id="' + id + '"]');
        var inner = cell ? cell.querySelector('.card-inner') : null;
        if (inner) { inner.classList.add('is-flipping'); }
        later(function () { openResult(card, true); }, 520);
    }

    function openResult(card) {
        clearTimers();
        stopAudio();

        state.result = { id: card.id, label: card.label, type: card.type };
        var isAudio = card.type === 'audio';
        var audioSrc = isAudio ? displayAudio(card) : '';

        els.resultLabel.textContent = state.mode === 'B'
            ? 'DL俊专属 · 抽到一件事'
            : 'DL俊专属 · 一份惊喜';
        els.textReveal.hidden = isAudio;
        els.audioReveal.hidden = !isAudio;
        els.panelHint.textContent = isAudio
            ? '这一张没有文字，只有声音'
            : (state.mode === 'B' ? '这件事，拆开才算数' : '送给此刻的你');
        els.textReveal.classList.remove('visible');
        els.audioReveal.classList.remove('visible');
        els.gift.classList.remove('opened');
        els.giftGlow.classList.remove('on');
        void els.gift.offsetWidth;
        renderConfetti();
        renderWave();

        if (isAudio) {
            updateAudioUI(audioSrc ? '播放语音' : '暂无音频');
        } else {
            els.revealText.textContent = card.text || '这张卡还是空白，去编辑页写一句话吧。';
        }

        els.overlay.hidden = false;
        randomizeGift();

        if (state.opened.indexOf(card.id) === -1) {
            state.opened.push(card.id);
            persistOpened();
        }
        renderHome();

        later(function () {
            els.gift.classList.add('opened');
            els.giftGlow.classList.add('on');
            Array.prototype.forEach.call(els.confettiLayer.querySelectorAll('.confetti'), function (piece) {
                piece.classList.add('fly');
            });
        }, 80);

        later(function () {
            (isAudio ? els.audioReveal : els.textReveal).classList.add('visible');
            if (isAudio && audioSrc) { startAudio(audioSrc); }
        }, 620);
    }

    function closeResult() {
        clearTimers();
        stopAudio();
        stopSurpriseSound(true);
        els.overlay.hidden = true;
        state.result = null;
    }

    /* ---------------- Actions ---------------- */

    function onFilePicked(event) {
        var file = event.target.files && event.target.files[0];
        var pick = state.pendingPick;
        state.pendingPick = null;
        event.target.value = '';
        if (!file || !pick) { return; }
        if (isClearlyNotAudio(file)) {
            toast('这个文件看起来不是音频，请选 mp3 / m4a / wav 等音频文件');
            return;
        }
        var audioFile = normalizeAudioFile(file);
        toast('正在读取音频…');
        fileToRef(audioFile).then(function (ref) {
            var card = state.cards[pick.index];
            if (!card) { return; }
            card.audio = ref;
            card.audioName = audioFile.name || file.name;
            toast('已添加 ' + (audioFile.name || file.name));
            return hydrate();
        }).then(function () {
            renderEditor();
            renderHome();
        }).catch(function () {
            toast('文件保存失败，请换一个试试');
        });
    }

    function handleAction(action, element) {
        var index = Number(element.dataset.index);
        var card = state.cards[index];

        switch (action) {
            case 'set-mode':
                switchMode(element.dataset.mode);
                break;
            case 'redraw':
                if (state.mode === 'B') { redraw(); }
                break;
            case 'go-editor':
                stopAudio();
                showView('editor');
                break;
            case 'go-home':
                stopAudio();
                showView('home');
                break;
            case 'toggle-item':
                state.activeEditor = state.activeEditor === index ? -1 : index;
                renderEditor();
                break;
            case 'set-type':
                if (card) {
                    card.type = element.dataset.type;
                    renderEditor();
                }
                break;
            case 'pick-audio':
                state.pendingPick = {
                    index: index,
                    kind: 'audio'
                };
                // 不设 accept：安卓会把它当成系统文件 Intent 的过滤条件，只列出「录音 / 文件」等少数应用。
                // 放开后由 JS 判断类型，用户能看到完整来源（文件、下载、网盘、聊天 App 等）。
                els.filePicker.accept = '';
                els.filePicker.click();
                break;
            case 'url-audio': {
                if (!card) { break; }
                var value = null;
                try {
                    value = window.prompt('粘贴音频链接（http/https）', '');
                } catch (error) {
                    toast('当前环境不支持弹窗输入，请改用本机文件');
                }
                if (value === null) { break; }
                value = value.trim();
                if (!/^https?:\/\//i.test(value)) {
                    toast('请填写 http(s) 链接');
                    break;
                }
                card.audio = value;
                card.audioName = '外链音频';
                hydrate().then(function () { renderEditor(); renderHome(); });
                break;
            }
            case 'preview-audio': {
                if (!card) { break; }
                var src = displayAudio(card);
                if (!src) { toast('请先添加音频'); break; }
                startAudio(src);
                break;
            }
            case 'save':
                if (state.mode === 'B') {
                    var rawLines = els.poolInput.value.split('\n').filter(function (line) { return line.trim(); });
                    var nextPool = normalizePool(rawLines);
                    if (nextPool.length < 9) {
                        toast('清单库至少要 9 条事件');
                        break;
                    }
                    var overLimit = rawLines.length > POOL_MAX;
                    state.pool = nextPool;
                    writeJSON(KEY_B_POOL, state.pool);
                    state.draw = drawNine();
                    writeJSON(KEY_B_DRAW, state.draw);
                    state.opened = [];
                    persistOpened();
                    toast(overLimit ? '清单最多 100 条，已保存前 100 条' : '清单已保存，并重新抽了 9 件事');
                    showView('home');
                    renderHome();
                    renderEditor();
                    break;
                }
                state.cards.forEach(function (item) {
                    if (item.type === 'audio') { item.text = ''; }
                    else { item.audio = ''; }
                });
                writeJSON(KEY_CARDS, state.cards.map(serializeCard));
                writeJSON(KEY_ORDER, state.order);
                if (state.shared) {
                    try { history.replaceState(null, '', location.pathname + location.search); } catch (error) { /* file:// */ }
                    state.shared = false;
                }
                toast('已保存');
                showView('home');
                hydrate().then(function () { renderHome(); renderEditor(); });
                break;
            case 'reset-content':
                if (state.mode === 'B') {
                    if (!window.confirm('清单库会恢复成内置默认事件，当前抽中的 9 件也会重新抽取。')) { break; }
                    state.pool = DEFAULT_POOL.slice();
                    writeJSON(KEY_B_POOL, state.pool);
                    state.draw = drawNine();
                    writeJSON(KEY_B_DRAW, state.draw);
                    state.opened = [];
                    persistOpened();
                    toast('已恢复默认清单');
                    showView('home');
                    renderHome();
                    renderEditor();
                    break;
                }
                if (!window.confirm('九张卡的文字和音频都会恢复为内置内容，自定义内容会被清除。')) { break; }
                removeKey(KEY_CARDS);
                removeKey(KEY_ORDER);
                removeKey(KEY_PREV_ORDER);
                removeKey(KEY_OPENED);
                state.cards = defaultCards();
                state.order = state.cards.map(function (item) { return item.id; });
                state.opened = [];
                state.shared = false;
                state.activeEditor = 0;
                try { history.replaceState(null, '', location.pathname + location.search); } catch (error) { /* file:// */ }
                toast('已恢复默认');
                hydrate().then(function () { renderHome(); renderEditor(); });
                break;
            case 'share': {
                var local = location.protocol === 'file:'
                    || location.hostname === 'localhost'
                    || location.hostname === '127.0.0.1';
                var url = state.mode === 'B' ? buildPoolShareUrl() : buildShareUrl();
                copyText(url).then(function () {
                    toast(local ? '链接已复制，但这是本地地址，发布后再复制才有效' : '分享链接已复制，发给朋友就能打开');
                }).catch(function () {
                    window.prompt('复制这个链接发给朋友：', url);
                });
                break;
            }
            case 'shuffle':
                if (state.shuffling || !els.overlay.hidden) { break; }
                state.shuffling = true;
                els.grid.classList.add('shuffling');
                var specialIds = state.cards.filter(function (card) {
                    return card.type === 'audio';
                }).map(function (card) { return card.id; });
                var next = shuffleOrder(state.order, readJSON(KEY_PREV_ORDER, []), specialIds);
                later(function () {
                    writeJSON(KEY_PREV_ORDER, state.order);
                    state.order = next;
                    writeJSON(KEY_ORDER, next);
                    state.opened = [];
                    persistOpened();
                    els.grid.classList.remove('shuffling');
                    state.shuffling = false;
                    renderHome();
                    toast('洗得更彻底了，特殊盲盒也藏好了');
                }, 420);
                break;
            case 'reset-boxes':
                if (!window.confirm(state.mode === 'B'
                    ? '九个盲盒会重新盖上，已抽到的事件不变，可以再拆一次。'
                    : '九张卡会重新盖上，已编辑的文字和音频不会丢失。')) { break; }
                state.opened = [];
                persistOpened();
                renderHome();
                toast('已重新封盒');
                break;
            case 'toggle-sound':
                toggleSound();
                break;
            case 'move-box':
                randomizeGift();
                toast('盒子换了个位置');
                break;
            case 'toggle-audio': {
                if (!state.result) { break; }
                var resultCard = cardForId(state.result.id);
                var audioSrc = resultCard && resultCard.type === 'audio' ? displayAudio(resultCard) : '';
                if (!audioSrc) { toast('请先添加音频'); break; }
                if (state.audioPlaying) { stopAudio(); }
                else { startAudio(audioSrc); }
                break;
            }
            case 'close-result':
                closeResult();
                break;
            default:
                break;
        }
    }

    function bindEvents() {
        document.addEventListener('click', function (event) {
            if (!event.target || !event.target.closest) { return; }
            if (event.target === els.overlay) {
                closeResult();
                return;
            }
            var actionEl = event.target.closest('[data-action]');
            if (actionEl) {
                handleAction(actionEl.dataset.action, actionEl);
                return;
            }
            var cell = event.target.closest('.cell');
            if (cell && state.view === 'home') { onCardTap(cell.dataset.id); }
        });

        document.addEventListener('input', function (event) {
            if (!event.target.classList || !event.target.classList.contains('text-input')) { return; }
            var index = Number(event.target.dataset.index);
            if (!state.cards[index]) { return; }
            state.cards[index].text = event.target.value;
            var counter = els.editorList.querySelector('.counter[data-index="' + index + '"]');
            if (counter) { counter.textContent = event.target.value.length + ' / 60'; }
            var items = els.editorList.querySelectorAll('.item');
            var summary = items[index] ? items[index].querySelector('.meta-summary') : null;
            if (summary) { summary.textContent = shortText(event.target.value); }
        });

        els.poolInput.addEventListener('input', function () {
            var count = els.poolInput.value.split('\n').filter(function (line) {
                return line.trim();
            }).length;
            els.poolCount.textContent = count > POOL_MAX
                ? '共 ' + count + ' 条，超出上限，只会保存前 ' + POOL_MAX + ' 条'
                : '共 ' + count + ' 条 / 最多 ' + POOL_MAX + ' 条';
            els.poolCount.classList.toggle('over', count > POOL_MAX);
        });
        els.filePicker.addEventListener('change', onFilePicked);
        window.addEventListener('hashchange', function () {
            if (applyHash()) {
                hydrate().then(function () { renderHome(); renderEditor(); showView('home'); });
            }
        });
    }

    function init() {
        els = {
            home: $('home'),
            editor: $('editor'),
            grid: $('grid'),
            editorList: $('editorList'),
            openedCount: $('openedCount'),
            totalCount: $('totalCount'),
            progressFill: $('progressFill'),
            shareTip: $('shareTip'),
            modeA: $('modeA'),
            modeB: $('modeB'),
            editBtn: $('editBtn'),
            shuffleBtn: $('shuffleBtn'),
            tipLine: $('tipLine'),
            noticeA: $('noticeA'),
            poolEditor: $('poolEditor'),
            poolInput: $('poolInput'),
            poolCount: $('poolCount'),
            editorTitle: $('editorTitle'),
            editorDesc: $('editorDesc'),
            saveBtn: $('saveBtn'),
            resetContentBtn: $('resetContentBtn'),
            actionsHint: $('actionsHint'),
            overlay: $('overlay'),
            resultLabel: $('resultLabel'),
            textReveal: $('textReveal'),
            audioReveal: $('audioReveal'),
            revealText: $('revealText'),
            audioBtn: $('audioBtn'),
            wave: $('wave'),
            confettiLayer: $('confettiLayer'),
            gift: $('gift'),
            giftGlow: $('giftGlow'),
            giftShadow: $('giftShadow'),
            panelHint: $('panelHint'),
            filePicker: $('filePicker'),
            toast: $('toast'),
            soundBtn: $('soundBtn')
        };

        try {
            soundEl = new Audio(SOUND_SRC);
            soundEl.volume = SOUND_VOLUME;
            soundEl.preload = 'auto';
            soundEl.load();
        } catch (error) { soundEl = null; }

        loadState();
        updateSoundBtn();
        applyHash();
        renderConfetti();
        renderWave();
        hydrate().then(function () {
            renderHome();
            renderEditor();
        });
        bindEvents();
    }

    init();
})();
