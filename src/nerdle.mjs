import fetch from "node-fetch";
import {
    convertDateForSQL,
    getCurrentDayInTimezone,
    getSpecificDay
} from "./helpers.mjs";

const Config = {
    number: 496,
    date: getSpecificDay('2023-05-30'),
    schedule: {
        h: 11,
        m: 0
    },
    tz: 'Indian/Maldives'
}

let ve = 16622496e5
    , je = 16426368e5
    , be = 16741728e5;

var ye = function(e, targetDate) {
    var t = arguments.length > 1 && void 0 !== arguments[1] && arguments[1]
        , s = je;
    "micro" === e && (s = ve),
    "maxi" === e && (s = be);
    var a = 13017;
    switch (e) {
        case "micro":
            a = 127;
            break;
        case "mini":
            a = 412;
            break;
        case "maxi":
            a = 2e4;
            break;
        case "midi":
            a = 6661;
            break;
        default:
            a = 13017
    }
    var n = targetDate
        , i = 864e5
        , l = Math.abs(Math.floor((n - s) / i) % a)
        , o = Math.abs(Math.floor((n - s) / i));
    if (t) {
        var r = 6e4 * (new Date).getTimezoneOffset()
            , c = n - r;
        l = Math.abs(Math.floor((c - s) / i) % a),
            o = Math.abs(Math.floor((c - s) / i))
    }
    
    return {
        filename: hasher.hashStr("".concat(l)),
        solutionIndex: l,
        externalIndex: o
    }
}
/*
let ye = function(e, targetDate) {
    var t = 16426368e5;
    "micro" === e && (t = ve),
    "maxi" === e && (t = be);
    var s = 13017;
    switch (e) {
        case "micro":
            s = 127;
            break;
        case "mini":
            s = 412;
            break;
        case "maxi":
            s = 2e4;
            break;
        case "midi":
            s = 6661;
            break;
        default:
            s = 13017
    }

    var a = targetDate;
    var  n = 864e5
        , i = Math.abs(Math.floor((a - t) / n) % s)
        , l = Math.abs(Math.floor((a - t) / n));
    return {
        filename: hasher.hashStr("".concat(i)),
        solutionIndex: i,
        externalIndex: l
    }
}*/

var Se = function(e, t) {
    var s = arguments.length > 2 && void 0 !== arguments[2] ? arguments[2] : 126;
    return "number" !== typeof t || t % 1 !== 0 || "number" !== typeof t || t % 1 !== 0 ? e.toString() : Ce(e.toString(), s - t)
}

var Ce = function Ce(e, t) {
    var s = arguments.length > 2 && void 0 !== arguments[2] ? arguments[2] : 126;
    if ("number" !== typeof t || t % 1 !== 0)
        return e.toString();
    for (var a = e.toString().split(""), n = 0; n < a.length; n++) {
        var i = a[n].charCodeAt(0);
        i <= s && (a[n] = String.fromCharCode((a[n].charCodeAt(0) + t) % s))
    }
    return a.join("")
}

var hasher = function() {
    function e() {
        this._dataLength = 0,
            this._bufferLength = 0,
            this._state = new Int32Array(4),
            this._buffer = new ArrayBuffer(68),
            this._buffer8 = new Uint8Array(this._buffer,0,68),
            this._buffer32 = new Uint32Array(this._buffer,0,17),
            this.start()
    }
    return e.hashStr = function(e, t) {
        return void 0 === t && (t = !1),
            this.onePassHasher.start().appendStr(e).end(t)
    }
        ,
        e.hashAsciiStr = function(e, t) {
            return void 0 === t && (t = !1),
                this.onePassHasher.start().appendAsciiStr(e).end(t)
        }
        ,
        e._hex = function(t) {
            var n, r, i, o, a = e.hexChars, s = e.hexOut;
            for (o = 0; o < 4; o += 1)
                for (r = 8 * o,
                         n = t[o],
                         i = 0; i < 8; i += 2)
                    s[r + 1 + i] = a.charAt(15 & n),
                        n >>>= 4,
                        s[r + 0 + i] = a.charAt(15 & n),
                        n >>>= 4;
            return s.join("")
        }
        ,
        e._md5cycle = function(e, t) {
            var n = e[0]
                , r = e[1]
                , i = e[2]
                , o = e[3];
            r = ((r += ((i = ((i += ((o = ((o += ((n = ((n += (r & i | ~r & o) + t[0] - 680876936 | 0) << 7 | n >>> 25) + r | 0) & r | ~n & i) + t[1] - 389564586 | 0) << 12 | o >>> 20) + n | 0) & n | ~o & r) + t[2] + 606105819 | 0) << 17 | i >>> 15) + o | 0) & o | ~i & n) + t[3] - 1044525330 | 0) << 22 | r >>> 10) + i | 0,
                r = ((r += ((i = ((i += ((o = ((o += ((n = ((n += (r & i | ~r & o) + t[4] - 176418897 | 0) << 7 | n >>> 25) + r | 0) & r | ~n & i) + t[5] + 1200080426 | 0) << 12 | o >>> 20) + n | 0) & n | ~o & r) + t[6] - 1473231341 | 0) << 17 | i >>> 15) + o | 0) & o | ~i & n) + t[7] - 45705983 | 0) << 22 | r >>> 10) + i | 0,
                r = ((r += ((i = ((i += ((o = ((o += ((n = ((n += (r & i | ~r & o) + t[8] + 1770035416 | 0) << 7 | n >>> 25) + r | 0) & r | ~n & i) + t[9] - 1958414417 | 0) << 12 | o >>> 20) + n | 0) & n | ~o & r) + t[10] - 42063 | 0) << 17 | i >>> 15) + o | 0) & o | ~i & n) + t[11] - 1990404162 | 0) << 22 | r >>> 10) + i | 0,
                r = ((r += ((i = ((i += ((o = ((o += ((n = ((n += (r & i | ~r & o) + t[12] + 1804603682 | 0) << 7 | n >>> 25) + r | 0) & r | ~n & i) + t[13] - 40341101 | 0) << 12 | o >>> 20) + n | 0) & n | ~o & r) + t[14] - 1502002290 | 0) << 17 | i >>> 15) + o | 0) & o | ~i & n) + t[15] + 1236535329 | 0) << 22 | r >>> 10) + i | 0,
                r = ((r += ((i = ((i += ((o = ((o += ((n = ((n += (r & o | i & ~o) + t[1] - 165796510 | 0) << 5 | n >>> 27) + r | 0) & i | r & ~i) + t[6] - 1069501632 | 0) << 9 | o >>> 23) + n | 0) & r | n & ~r) + t[11] + 643717713 | 0) << 14 | i >>> 18) + o | 0) & n | o & ~n) + t[0] - 373897302 | 0) << 20 | r >>> 12) + i | 0,
                r = ((r += ((i = ((i += ((o = ((o += ((n = ((n += (r & o | i & ~o) + t[5] - 701558691 | 0) << 5 | n >>> 27) + r | 0) & i | r & ~i) + t[10] + 38016083 | 0) << 9 | o >>> 23) + n | 0) & r | n & ~r) + t[15] - 660478335 | 0) << 14 | i >>> 18) + o | 0) & n | o & ~n) + t[4] - 405537848 | 0) << 20 | r >>> 12) + i | 0,
                r = ((r += ((i = ((i += ((o = ((o += ((n = ((n += (r & o | i & ~o) + t[9] + 568446438 | 0) << 5 | n >>> 27) + r | 0) & i | r & ~i) + t[14] - 1019803690 | 0) << 9 | o >>> 23) + n | 0) & r | n & ~r) + t[3] - 187363961 | 0) << 14 | i >>> 18) + o | 0) & n | o & ~n) + t[8] + 1163531501 | 0) << 20 | r >>> 12) + i | 0,
                r = ((r += ((i = ((i += ((o = ((o += ((n = ((n += (r & o | i & ~o) + t[13] - 1444681467 | 0) << 5 | n >>> 27) + r | 0) & i | r & ~i) + t[2] - 51403784 | 0) << 9 | o >>> 23) + n | 0) & r | n & ~r) + t[7] + 1735328473 | 0) << 14 | i >>> 18) + o | 0) & n | o & ~n) + t[12] - 1926607734 | 0) << 20 | r >>> 12) + i | 0,
                r = ((r += ((i = ((i += ((o = ((o += ((n = ((n += (r ^ i ^ o) + t[5] - 378558 | 0) << 4 | n >>> 28) + r | 0) ^ r ^ i) + t[8] - 2022574463 | 0) << 11 | o >>> 21) + n | 0) ^ n ^ r) + t[11] + 1839030562 | 0) << 16 | i >>> 16) + o | 0) ^ o ^ n) + t[14] - 35309556 | 0) << 23 | r >>> 9) + i | 0,
                r = ((r += ((i = ((i += ((o = ((o += ((n = ((n += (r ^ i ^ o) + t[1] - 1530992060 | 0) << 4 | n >>> 28) + r | 0) ^ r ^ i) + t[4] + 1272893353 | 0) << 11 | o >>> 21) + n | 0) ^ n ^ r) + t[7] - 155497632 | 0) << 16 | i >>> 16) + o | 0) ^ o ^ n) + t[10] - 1094730640 | 0) << 23 | r >>> 9) + i | 0,
                r = ((r += ((i = ((i += ((o = ((o += ((n = ((n += (r ^ i ^ o) + t[13] + 681279174 | 0) << 4 | n >>> 28) + r | 0) ^ r ^ i) + t[0] - 358537222 | 0) << 11 | o >>> 21) + n | 0) ^ n ^ r) + t[3] - 722521979 | 0) << 16 | i >>> 16) + o | 0) ^ o ^ n) + t[6] + 76029189 | 0) << 23 | r >>> 9) + i | 0,
                r = ((r += ((i = ((i += ((o = ((o += ((n = ((n += (r ^ i ^ o) + t[9] - 640364487 | 0) << 4 | n >>> 28) + r | 0) ^ r ^ i) + t[12] - 421815835 | 0) << 11 | o >>> 21) + n | 0) ^ n ^ r) + t[15] + 530742520 | 0) << 16 | i >>> 16) + o | 0) ^ o ^ n) + t[2] - 995338651 | 0) << 23 | r >>> 9) + i | 0,
                r = ((r += ((o = ((o += (r ^ ((n = ((n += (i ^ (r | ~o)) + t[0] - 198630844 | 0) << 6 | n >>> 26) + r | 0) | ~i)) + t[7] + 1126891415 | 0) << 10 | o >>> 22) + n | 0) ^ ((i = ((i += (n ^ (o | ~r)) + t[14] - 1416354905 | 0) << 15 | i >>> 17) + o | 0) | ~n)) + t[5] - 57434055 | 0) << 21 | r >>> 11) + i | 0,
                r = ((r += ((o = ((o += (r ^ ((n = ((n += (i ^ (r | ~o)) + t[12] + 1700485571 | 0) << 6 | n >>> 26) + r | 0) | ~i)) + t[3] - 1894986606 | 0) << 10 | o >>> 22) + n | 0) ^ ((i = ((i += (n ^ (o | ~r)) + t[10] - 1051523 | 0) << 15 | i >>> 17) + o | 0) | ~n)) + t[1] - 2054922799 | 0) << 21 | r >>> 11) + i | 0,
                r = ((r += ((o = ((o += (r ^ ((n = ((n += (i ^ (r | ~o)) + t[8] + 1873313359 | 0) << 6 | n >>> 26) + r | 0) | ~i)) + t[15] - 30611744 | 0) << 10 | o >>> 22) + n | 0) ^ ((i = ((i += (n ^ (o | ~r)) + t[6] - 1560198380 | 0) << 15 | i >>> 17) + o | 0) | ~n)) + t[13] + 1309151649 | 0) << 21 | r >>> 11) + i | 0,
                r = ((r += ((o = ((o += (r ^ ((n = ((n += (i ^ (r | ~o)) + t[4] - 145523070 | 0) << 6 | n >>> 26) + r | 0) | ~i)) + t[11] - 1120210379 | 0) << 10 | o >>> 22) + n | 0) ^ ((i = ((i += (n ^ (o | ~r)) + t[2] + 718787259 | 0) << 15 | i >>> 17) + o | 0) | ~n)) + t[9] - 343485551 | 0) << 21 | r >>> 11) + i | 0,
                e[0] = n + e[0] | 0,
                e[1] = r + e[1] | 0,
                e[2] = i + e[2] | 0,
                e[3] = o + e[3] | 0
        }
        ,
        e.prototype.start = function() {
            return this._dataLength = 0,
                this._bufferLength = 0,
                this._state.set(e.stateIdentity),
                this
        }
        ,
        e.prototype.appendStr = function(t) {
            var n, r, i = this._buffer8, o = this._buffer32, a = this._bufferLength;
            for (r = 0; r < t.length; r += 1) {
                if ((n = t.charCodeAt(r)) < 128)
                    i[a++] = n;
                else if (n < 2048)
                    i[a++] = 192 + (n >>> 6),
                        i[a++] = 63 & n | 128;
                else if (n < 55296 || n > 56319)
                    i[a++] = 224 + (n >>> 12),
                        i[a++] = n >>> 6 & 63 | 128,
                        i[a++] = 63 & n | 128;
                else {
                    if ((n = 1024 * (n - 55296) + (t.charCodeAt(++r) - 56320) + 65536) > 1114111)
                        throw new Error("Unicode standard supports code points up to U+10FFFF");
                    i[a++] = 240 + (n >>> 18),
                        i[a++] = n >>> 12 & 63 | 128,
                        i[a++] = n >>> 6 & 63 | 128,
                        i[a++] = 63 & n | 128
                }
                a >= 64 && (this._dataLength += 64,
                    e._md5cycle(this._state, o),
                    a -= 64,
                    o[0] = o[16])
            }
            return this._bufferLength = a,
                this
        }
        ,
        e.prototype.appendAsciiStr = function(t) {
            for (var n, r = this._buffer8, i = this._buffer32, o = this._bufferLength, a = 0; ; ) {
                for (n = Math.min(t.length - a, 64 - o); n--; )
                    r[o++] = t.charCodeAt(a++);
                if (o < 64)
                    break;
                this._dataLength += 64,
                    e._md5cycle(this._state, i),
                    o = 0
            }
            return this._bufferLength = o,
                this
        }
        ,
        e.prototype.appendByteArray = function(t) {
            for (var n, r = this._buffer8, i = this._buffer32, o = this._bufferLength, a = 0; ; ) {
                for (n = Math.min(t.length - a, 64 - o); n--; )
                    r[o++] = t[a++];
                if (o < 64)
                    break;
                this._dataLength += 64,
                    e._md5cycle(this._state, i),
                    o = 0
            }
            return this._bufferLength = o,
                this
        }
        ,
        e.prototype.getState = function() {
            var e = this._state;
            return {
                buffer: String.fromCharCode.apply(null, Array.from(this._buffer8)),
                buflen: this._bufferLength,
                length: this._dataLength,
                state: [e[0], e[1], e[2], e[3]]
            }
        }
        ,
        e.prototype.setState = function(e) {
            var t, n = e.buffer, r = e.state, i = this._state;
            for (this._dataLength = e.length,
                     this._bufferLength = e.buflen,
                     i[0] = r[0],
                     i[1] = r[1],
                     i[2] = r[2],
                     i[3] = r[3],
                     t = 0; t < n.length; t += 1)
                this._buffer8[t] = n.charCodeAt(t)
        }
        ,
        e.prototype.end = function(t) {
            void 0 === t && (t = !1);
            var n = this._bufferLength
                , r = this._buffer8
                , i = this._buffer32
                , o = 1 + (n >> 2);
            this._dataLength += n;
            var a = 8 * this._dataLength;
            if (r[n] = 128,
                r[n + 1] = r[n + 2] = r[n + 3] = 0,
                i.set(e.buffer32Identity.subarray(o), o),
            n > 55 && (e._md5cycle(this._state, i),
                i.set(e.buffer32Identity)),
            a <= 4294967295)
                i[14] = a;
            else {
                var s = a.toString(16).match(/(.*?)(.{0,8})$/);
                if (null === s)
                    return;
                var u = parseInt(s[2], 16)
                    , c = parseInt(s[1], 16) || 0;
                i[14] = u,
                    i[15] = c
            }
            return e._md5cycle(this._state, i),
                t ? this._state : e._hex(this._state)
        }
        ,
        e.stateIdentity = new Int32Array([1732584193, -271733879, -1732584194, 271733878]),
        e.buffer32Identity = new Int32Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
        e.hexChars = "0123456789abcdef",
        e.hexOut = [],
        e.onePassHasher = new e,
        e
}();

async function getAnswer( targetDateTimestamp, type = 'default') {
    const timezone_offset = 8 * 60 * 60 * 1000;
    let timestamp = targetDateTimestamp + timezone_offset;
    let fileObject = ye( type, timestamp  );

    if ( fileObject ) {
        
        let url;
        let prefix = '';
        switch( type ) {
            
            case 'micro':
                url = "https://micro.nerdlegame.com";
                prefix = 'micro';
                break;
            
            case 'mini':
                url = "https://mini.nerdlegame.com";
                prefix = 'mini';
                break;
                
            case 'maxi':
                url = "https://maxi.nerdlegame.com";
                prefix = 'maxi';
                break;
            
            default:
                url = "https://nerdlegame.com";
                break;
            
        }
        
        return fetch(url + "/" + prefix + "words/" + fileObject.filename).then(
            (response) => response.text())
            .then((buffer) => {
                    
                    let answer = Se(buffer, 13);
                    return answer.replace(/([-+*\/=])/gi, " $1 ");
                    
                }
            );

    }
}

function capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

export async function getAnswers( date_string, number_to_get, type = 'default' ) {
    
    let date;
    if ( date_string === null ) {
        date = getCurrentDayInTimezone(Config.tz);
    } else {
        date = getSpecificDay(date_string);
    }
    
    const published = date.toString();
    const scheduled = convertDateForSQL( date.subtract({days: 1}), Config.schedule.h, Config.schedule.m );
    const diff = date.since(Config.date).days;
    const puzzleNumber = Config.number + diff;
    
    let answers = [];
    
    for( let i = 0; i < number_to_get; i++ ) {
        
        const ts = date
            .add({days: i})
            .toZonedDateTime({ timeZone: "UTC" }) // anchor at midnight UTC
            .toInstant()
            .epochMilliseconds;
        
        let answer = await getAnswer( ts, type );
        answers.push( answer );
    }
    
    let display_type = 'Nerdle';
    if ( type !== 'default' ) {
        display_type += ' ' + capitalizeFirstLetter(type);
    }
    
    return {
        'type': display_type,
        'publishedDate': published,
        'scheduledDate': scheduled,
        'startingNumber': puzzleNumber,
        'answers': answers
    };
}