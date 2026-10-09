let Lr = (e, t, r) => {
    let n;
    const o = new dt(e);
    o.random_int31(),
        o.random_int31(),
        o.random_int31(),
        o.random_int31();
    do
        n = [
            t[o.random_int31() % t.length],
            t[o.random_int31() % t.length],
            t[o.random_int31() % t.length],
            t[o.random_int31() % t.length]
        ];
    while (n[0] === n[1] || n[0] === n[2] || n[0] === n[3] || n[1] === n[2] || n[1] === n[3] || n[2] === n[3] || r.has(n[0]) || r.has(n[1]) || r.has(n[2]) || r.has(n[3]));
    return n
}

var dt = function (e) {
    e == null && (e = new Date().getTime()),
        this.N = 624,
        this.M = 397,
        this.MATRIX_A = 2567483615,
        this.UPPER_MASK = 2147483648,
        this.LOWER_MASK = 2147483647,
        this.mt = new Array(this.N),
        this.mti = this.N + 1,
        e.constructor == Array ? this.init_by_array(e, e.length) : this.init_seed(e)
};
dt.prototype.init_seed = function (e) {
    for (this.mt[0] = e >>> 0,
             this.mti = 1; this.mti < this.N; this.mti++) {
        var e = this.mt[this.mti - 1] ^ this.mt[this.mti - 1] >>> 30;
        this.mt[this.mti] = (((e & 4294901760) >>> 16) * 1812433253 << 16) + (e & 65535) * 1812433253 + this.mti,
            this.mt[this.mti] >>>= 0
    }
}
;
dt.prototype.init_by_array = function (e, t) {
    var r, n, o;
    for (this.init_seed(19650218),
             r = 1,
             n = 0,
             o = this.N > t ? this.N : t; o; o--) {
        var i = this.mt[r - 1] ^ this.mt[r - 1] >>> 30;
        this.mt[r] = (this.mt[r] ^ (((i & 4294901760) >>> 16) * 1664525 << 16) + (i & 65535) * 1664525) + e[n] + n,
            this.mt[r] >>>= 0,
            r++,
            n++,
        r >= this.N && (this.mt[0] = this.mt[this.N - 1],
            r = 1),
        n >= t && (n = 0)
    }
    for (o = this.N - 1; o; o--) {
        var i = this.mt[r - 1] ^ this.mt[r - 1] >>> 30;
        this.mt[r] = (this.mt[r] ^ (((i & 4294901760) >>> 16) * 1566083941 << 16) + (i & 65535) * 1566083941) - r,
            this.mt[r] >>>= 0,
            r++,
        r >= this.N && (this.mt[0] = this.mt[this.N - 1],
            r = 1)
    }
    this.mt[0] = 2147483648
};

dt.prototype.random_int = function () {
    var e, t = new Array(0, this.MATRIX_A);
    if (this.mti >= this.N) {
        var r;
        for (this.mti == this.N + 1 && this.init_seed(5489),
                 r = 0; r < this.N - this.M; r++)
            e = this.mt[r] & this.UPPER_MASK | this.mt[r + 1] & this.LOWER_MASK,
                this.mt[r] = this.mt[r + this.M] ^ e >>> 1 ^ t[e & 1];
        for (; r < this.N - 1; r++)
            e = this.mt[r] & this.UPPER_MASK | this.mt[r + 1] & this.LOWER_MASK,
                this.mt[r] = this.mt[r + (this.M - this.N)] ^ e >>> 1 ^ t[e & 1];
        e = this.mt[this.N - 1] & this.UPPER_MASK | this.mt[0] & this.LOWER_MASK,
            this.mt[this.N - 1] = this.mt[this.M - 1] ^ e >>> 1 ^ t[e & 1],
            this.mti = 0
    }
    return e = this.mt[this.mti++],
        e ^= e >>> 11,
        e ^= e << 7 & 2636928640,
        e ^= e << 15 & 4022730752,
        e ^= e >>> 18,
    e >>> 0
};

dt.prototype.random_int31 = function () {
    return this.random_int() >>> 1
};

dt.prototype.random_incl = function () {
    return this.random_int() * (1 / 4294967295)
};
dt.prototype.random = function () {
    return this.random_int() * (1 / 4294967296)
};

dt.prototype.random_excl = function () {
    return (this.random_int() + .5) * (1 / 4294967296)
};

dt.prototype.random_long = function () {
    var e = this.random_int() >>> 5
        , t = this.random_int() >>> 6;
    return (e * 67108864 + t) * (1 / 9007199254740992)
};

/**
 * Picks a day's four answers exactly as the site's Dt() does.
 *
 * @param {number} puzzleNumber - Days since 2022-01-24, which the site uses as the seed.
 * @param {string[]} wordBank - The site's answer list.
 * @param {string[]} blacklist - Words the site never picks.
 * @returns {string[]} The four answers, in board order.
 */
export function getAnswer( puzzleNumber, wordBank, blacklist ) {
    return Lr( puzzleNumber, wordBank, new Set( blacklist ) );
}
