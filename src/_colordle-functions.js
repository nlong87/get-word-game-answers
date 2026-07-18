
const colorsJson = await fetch('https://colordle.ryantanen.com/colors.json').then( r => r.json() );
const legacyColors = colorsJson.colors;
const colorPool = await fetch('https://colordle.ryantanen.com/color-pool.json').then( r => r.json() );

const pool = colorPool.colors;
const blocklist = colorPool.blocklist;


const CLUSTER_WINDOW = 3;
const NGRAM_SIZE = 4;

function normalizeColorName(name) {
    return name.toLowerCase().replace(/\s+/g, "").trim();
}

function computeGeneratedDay(dayIndex, pool, blocklist, priorNames, recentRaw) {
    const blocked = new Set(blocklist.map(normalizeColorName));
    const availablePool = pool.filter(
        (c) => !blocked.has(normalizeColorName(c))
    );
    if (availablePool.length === 0) {
        return null;
    }
    
    const used = new Set(priorNames);
    let candidates = availablePool.filter(
        (c) => !used.has(normalizeColorName(c))
    );
    
    if (candidates.length === 0) {
        const recentWindow = 60;
        const recentUsed = new Set(
            priorNames.slice(Math.max(0, priorNames.length - recentWindow))
        );
        candidates = availablePool.filter(
            (c) => !recentUsed.has(normalizeColorName(c))
        );
        if (candidates.length === 0) {
            candidates = availablePool;
        }
    }
    
    const recentNgrams = new Set();
    for (const n of recentRaw.slice(-CLUSTER_WINDOW)) {
        for (const g of nameNgrams(n)) recentNgrams.add(g);
    }
    if (recentNgrams.size > 0) {
        const nonClustered = candidates.filter(
            (c) => !sharesRecentNgram(c, recentNgrams)
        );
        if (nonClustered.length > 0) candidates = nonClustered;
    }
    
    return pickFromCandidates(dayIndex, candidates);
}

function sharesRecentNgram(candidate, recentNgrams) {
    for (const g of nameNgrams(candidate)) {
        if (recentNgrams.has(g)) return true;
    }
    return false;
}

function pickFromCandidates(dayIndex, candidates) {
    const sorted = [...candidates].sort((a, b) =>
        normalizeColorName(a).localeCompare(normalizeColorName(b))
    );
    const rng = mulberry32(dayIndex * 9973 + 42);
    return sorted[Math.floor(rng() * sorted.length)];
}

function nameNgrams(name) {
    const s = name.toLowerCase().replace(/[\s\-_]+/g, "");
    const set = new Set();
    for (let i = 0; i + NGRAM_SIZE <= s.length; i++) {
        set.add(s.slice(i, i + NGRAM_SIZE));
    }
    return set;
}


function mulberry32(seed) {
    return function () {
        let t = (seed += 0x6d2b79f5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}


export function getColorForDay(dayIndex, legacyColors, pool, blocklist = []) {
    if (dayIndex < 0) {
        return null;
    }
    
    const names = [];
    for (let i = 0; i <= dayIndex; i++) {
        if (i < legacyColors.length) {
            names.push(legacyColors[i]);
        } else {
            const priorNormalized = names.map(normalizeColorName);
            const generated = computeGeneratedDay(
                i,
                pool,
                blocklist,
                priorNormalized,
                names
            );
            if (!generated) {
                return null;
            }
            names.push(generated);
        }
    }
    
    return names[dayIndex];
}


export async function getColordleAnswer( dayIndex ) {
    return getColorForDay( dayIndex, legacyColors, pool, blocklist );
}

