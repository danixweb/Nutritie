// ==========================================
// Storage Module - Local & Offline Persistence
// ==========================================

import { DEFAULT_ANALYZED_FOODS } from './defaultFoods.js';

const STORAGE_KEYS = {
    MEALS: 'nutritie_meals_history_v2',
    ACTIVITIES: 'nutritie_activities_v2',
    HEALTH_PROFILE: 'health_profile',
    USER_PROFILE: 'nutritie_user_profile',
    API_KEY: 'gemini_api_key',
    ACTIVE_MODEL: 'gemini_active_model',
    SELECTED_MODEL_TYPE: 'gemini_selected_model_type', // 'gemini-2.0-flash', 'gemini-1.5-flash', 'auto', 'custom', etc.
    CUSTOM_MODEL_NAME: 'gemini_custom_model_name',
    AI_ENABLED: 'gemini_ai_enabled',
    AI_CONNECTED: 'gemini_ai_connected',
    AI_NUTRIENT_CALC: 'gemini_ai_nutrient_calc',
    JOURNAL_FILTER: 'nutritie_journal_filter',
    ANALYZED_FOODS: 'nutritie_analyzed_foods_db_v2'
};

export { DEFAULT_ANALYZED_FOODS };

// =========================================================================
// Canonical Nutrients Standard Reference Dictionary (Romanian Medical / DZR)
// =========================================================================
export const CANONICAL_NUTRIENTS = {
    // --- Macronutrienți & Fibre ---
    'Proteine': { name: 'Proteine', type: 'Macro', unit: 'g', rda: 60, role: 'Construcție & refacere musculară și celulară', synonyms: ['proteine', 'protein', 'proteina', 'proteină', 'prot'] },
    'Carbohidrați': { name: 'Carbohidrați', type: 'Macro', unit: 'g', rda: 250, role: 'Sursă primară de energie pentru creier & mușchi', synonyms: ['carbohidrati', 'carbohidrați', 'glucide', 'carbs', 'carbohydrates', 'carbohidrat', 'glucid'] },
    'Grăsimi': { name: 'Grăsimi', type: 'Macro', unit: 'g', rda: 70, role: 'Echilibru celular, hormonal și asimilare vitamine', synonyms: ['grasimi', 'grăsimi', 'lipide', 'fat', 'fats', 'lipids', 'lipida', 'lipidă', 'grasime', 'grăsime'] },
    'Fibre': { name: 'Fibre', type: 'Macro', unit: 'g', rda: 30, role: 'Tranzit intestinal, digestie și microbiom sănătos', synonyms: ['fibre', 'fibra', 'fibră', 'fibre dietetice', 'fiber', 'dietary fiber'] },

    // --- Vitamine ---
    'Vitamina B9 (Acid folic)': { name: 'Vitamina B9 (Acid folic)', type: 'Micro', unit: 'µg', rda: 400, role: 'Sinteză ADN, formare celule roșii & diviziune celulară', synonyms: ['vitamina b9', 'vitamina b-9', 'b9', 'b-9', 'acid folic', 'acidul folic', 'folic acid', 'folat', 'folati', 'folați', 'folate', 'vitamin b9', 'vitamin b-9'] },
    'Vitamina B12 (Cobalamină)': { name: 'Vitamina B12 (Cobalamină)', type: 'Micro', unit: 'µg', rda: 2.5, role: 'Sistem nervos, mielinizare & formare eritrocite', synonyms: ['vitamina b12', 'vitamina b-12', 'b12', 'b-12', 'cobalamina', 'cobalamină', 'cianocobalamina', 'vitamin b12'] },
    'Vitamina C (Acid ascorbic)': { name: 'Vitamina C (Acid ascorbic)', type: 'Micro', unit: 'mg', rda: 80, role: 'Imunitate, sinteză colagen, absorbție fier & antioxidant', synonyms: ['vitamina c', 'acid ascorbic', 'ascorbic acid', 'vitamin c', 'acidul ascorbic'] },
    'Vitamina B1 (Tiamină)': { name: 'Vitamina B1 (Tiamină)', type: 'Micro', unit: 'mg', rda: 1.1, role: 'Metabolism glucidic & funcționare sistem nervos', synonyms: ['vitamina b1', 'vitamina b-1', 'b1', 'tiamina', 'tiamină', 'thiamine', 'thiamin', 'vitamin b1'] },
    'Vitamina B2 (Riboflavină)': { name: 'Vitamina B2 (Riboflavină)', type: 'Micro', unit: 'mg', rda: 1.4, role: 'Metabolism energetic celular & sănătate oculară', synonyms: ['vitamina b2', 'vitamina b-2', 'b2', 'riboflavina', 'riboflavină', 'riboflavin', 'vitamin b2'] },
    'Vitamina B3 (Niacină)': { name: 'Vitamina B3 (Niacină)', type: 'Micro', unit: 'mg', rda: 16, role: 'Producție ATP, sănătate piele & sistem digestiv', synonyms: ['vitamina b3', 'vitamina b-3', 'b3', 'niacina', 'niacină', 'niacin', 'vitamina pp', 'vitamin b3'] },
    'Vitamina B5 (Acid pantotenic)': { name: 'Vitamina B5 (Acid pantotenic)', type: 'Micro', unit: 'mg', rda: 6, role: 'Sinteză coenzima A, hormoni & acizi grași', synonyms: ['vitamina b5', 'vitamina b-5', 'b5', 'acid pantotenic', 'pantothenic acid', 'pantotenat', 'vitamin b5'] },
    'Vitamina B6 (Piridoxină)': { name: 'Vitamina B6 (Piridoxină)', type: 'Micro', unit: 'mg', rda: 1.4, role: 'Metabolism aminoacizi & sinteză neurotransmițători', synonyms: ['vitamina b6', 'vitamina b-6', 'b6', 'piridoxina', 'piridoxină', 'pyridoxine', 'vitamin b6'] },
    'Vitamina B7 (Biotină)': { name: 'Vitamina B7 (Biotină)', type: 'Micro', unit: 'µg', rda: 50, role: 'Sănătate păr, unghii, piele & metabolism lipide', synonyms: ['vitamina b7', 'vitamina b-7', 'b7', 'biotina', 'biotină', 'biotin', 'vitamina h', 'vitamin b7'] },
    'Vitamina A': { name: 'Vitamina A', type: 'Micro', unit: 'µg', rda: 800, role: 'Acuitate vizuală, sănătate piele & imunitate', synonyms: ['vitamina a', 'retinol', 'beta-caroten', 'beta caroten', 'caroten', 'vitamin a'] },
    'Vitamina D': { name: 'Vitamina D', type: 'Micro', unit: 'µg', rda: 15, role: 'Fixare calciu, densitate osoasă & imunitate', synonyms: ['vitamina d', 'vitamina d3', 'vitamina d2', 'colecalciferol', 'calciferol', 'vitamin d', 'vitamin d3'] },
    'Vitamina E': { name: 'Vitamina E', type: 'Micro', unit: 'mg', rda: 12, role: 'Antioxidant puternic & protecție membrane celulare', synonyms: ['vitamina e', 'tocoferol', 'alfa-tocoferol', 'vitamin e'] },
    'Vitamina K': { name: 'Vitamina K', type: 'Micro', unit: 'µg', rda: 75, role: 'Coagulare sanguină normală & mineralizare osoasă', synonyms: ['vitamina k', 'vitamina k1', 'vitamina k2', 'filochinona', 'menaquinona', 'vitamin k'] },

    // --- Minerale & Electroliți ---
    'Calciu': { name: 'Calciu', type: 'Micro', unit: 'mg', rda: 1000, role: 'Structură osoasă, dinți & contracție musculară', synonyms: ['calciu', 'calcium', 'ca'] },
    'Magneziu': { name: 'Magneziu', type: 'Micro', unit: 'mg', rda: 375, role: 'Relaxare musculară, somn, sinteză ATP & enzime', synonyms: ['magneziu', 'magnesium', 'mg'] },
    'Fier': { name: 'Fier', type: 'Micro', unit: 'mg', rda: 14, role: 'Transport de oxigen (hemoglobină) & energie celulară', synonyms: ['fier', 'iron', 'fe'] },
    'Potasiu': { name: 'Potasiu', type: 'Micro', unit: 'mg', rda: 3500, role: 'Reglare tensiune arterială & echilibru hidric', synonyms: ['potasiu', 'potassium', 'k'] },
    'Zinc': { name: 'Zinc', type: 'Micro', unit: 'mg', rda: 10, role: 'Imunitate, vindecare țesuturi & sinteză proteină', synonyms: ['zinc', 'zn'] },
    'Sodiu': { name: 'Sodiu', type: 'Micro', unit: 'mg', rda: 2000, role: 'Echilibru osmotic & transmitere impuls nervos', synonyms: ['sodiu', 'sodium', 'na', 'sare'] },
    'Fosfor': { name: 'Fosfor', type: 'Micro', unit: 'mg', rda: 700, role: 'Structură osoasă, fosfolipide & stocare ATP', synonyms: ['fosfor', 'phosphorus', 'p'] },
    'Seleniu': { name: 'Seleniu', type: 'Micro', unit: 'µg', rda: 55, role: 'Funcție tiroidiană normală & apărare antioxidantă', synonyms: ['seleniu', 'selenium', 'se'] },
    'Iod': { name: 'Iod', type: 'Micro', unit: 'µg', rda: 150, role: 'Sinteză hormoni tiroidieni (T3, T4) & metabolism', synonyms: ['iod', 'iodine', 'i'] },
    'Cupru': { name: 'Cupru', type: 'Micro', unit: 'mg', rda: 1, role: 'Metabolism fier, formare colagen & vase de sânge', synonyms: ['cupru', 'copper', 'cu'] },
    'Mangan': { name: 'Mangan', type: 'Micro', unit: 'mg', rda: 2, role: 'Enzime antioxidante & sănătate țesut conjunctiv', synonyms: ['mangan', 'manganese', 'mn'] },
    'Crom': { name: 'Crom', type: 'Micro', unit: 'µg', rda: 40, role: 'Metabolismul glucozei & sensibilitate la insulină', synonyms: ['crom', 'chromium', 'cr'] }
};

// Universal Diacritics & Accents Normalizer (Romanian & International)
export function removeDiacritics(str) {
    if (!str || typeof str !== 'string') return '';
    return str
        .replace(/ă|Ă|â|Â/g, 'a')
        .replace(/î|Î/g, 'i')
        .replace(/ș|Ș|ş|Ş/g, 's')
        .replace(/ț|Ț|ţ|Ţ/g, 't')
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[\(\)\[\],:\-_/\\#+]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// Normalize raw nutrient string to its single canonical standard name
export function normalizeNutrientName(rawName) {
    if (!rawName || typeof rawName !== 'string') return 'Altele';
    const clean = removeDiacritics(rawName);

    // 1. Direct match on canonical names
    for (const [canonName, def] of Object.entries(CANONICAL_NUTRIENTS)) {
        if (removeDiacritics(canonName) === clean) return canonName;
    }

    // 2. Match through synonyms
    for (const [canonName, def] of Object.entries(CANONICAL_NUTRIENTS)) {
        for (const syn of def.synonyms) {
            const synClean = removeDiacritics(syn);
            if (clean === synClean || clean.includes(synClean) || synClean.includes(clean)) {
                return canonName;
            }
        }
    }

    // Return cleaned original capitalized if no match found
    return rawName.trim().charAt(0).toUpperCase() + rawName.trim().slice(1);
}

// Normalize and deduplicate nutrients array
export function normalizeNutrientsArray(nutrients) {
    if (!Array.isArray(nutrients)) return [];
    const map = new Map();

    nutrients.forEach(n => {
        if (!n || typeof n !== 'object') return;
        const canonName = normalizeNutrientName(n.name);
        const def = CANONICAL_NUTRIENTS[canonName];

        const rawQty = parseFloat(n.qty) || 0;
        const unit = def ? def.unit : (n.unit || 'g');
        const type = def ? def.type : (n.type || 'Micro');
        const role = def ? def.role : (n.role || 'Nutrient');
        const rda = def ? def.rda : 100;

        if (map.has(canonName)) {
            const existing = map.get(canonName);
            existing.qty = parseFloat((existing.qty + rawQty).toFixed(2));
            existing.rda_percent = Math.round((existing.qty / rda) * 100);
        } else {
            const rdaPercent = (n.rda_percent !== undefined && !isNaN(parseFloat(n.rda_percent)))
                ? Math.round(parseFloat(n.rda_percent))
                : Math.round((rawQty / rda) * 100);

            map.set(canonName, {
                name: canonName,
                type: type,
                qty: parseFloat(rawQty.toFixed(2)),
                unit: unit,
                rda_percent: rdaPercent,
                role: role
            });
        }
    });

    return Array.from(map.values());
}

// Local food database for offline calorie / macro estimation (derived from DEFAULT_ANALYZED_FOODS)
export const localFoodDB = {
    "default": { cal: 100, pro: 5, carb: 10, fat: 5 }
};

// Seed localFoodDB from the canonical 155 foods
DEFAULT_ANALYZED_FOODS.forEach(f => {
    if (!f || !f.name) return;
    const key = f.name.toLowerCase().trim();
    const macros = f.macros || {};
    localFoodDB[key] = {
        cal: f.calories || 0,
        pro: macros.protein || 0,
        carb: macros.carbs || 0,
        fat: macros.fat || 0,
        fiber: macros.fiber || 0
    };
    const normKey = removeDiacritics(key);
    if (normKey && normKey !== key && !localFoodDB[normKey]) {
        localFoodDB[normKey] = localFoodDB[key];
    }
});

// Local food macro and nutrient estimator (Priority 1: Analyzed Food Cache, Priority 2: Baseline DB)
export function estimateFoodLocally(name, quantity, unit) {
    const qty = parseFloat(quantity) || 1;
    const uClean = removeDiacritics(unit || 'g');

    // 1. Check Analyzed Foods Database (Smart Offline Cache from previous AI analyses)
    const cached = Storage.findAnalyzedFood(name);
    if (cached) {
        return Storage.calculateFoodFromBase(cached, qty, unit);
    }

    // 2. Fallback to basic dictionary with diacritics-insensitive matching
    const nClean = removeDiacritics(name || '');
    let match = localFoodDB.default;
    for (const k in localFoodDB) {
        if (k !== 'default') {
            const kClean = removeDiacritics(k);
            if (nClean === kClean || nClean.includes(kClean) || kClean.includes(nClean)) {
                match = localFoodDB[k];
                break;
            }
        }
    }

    let factor = qty / 100;
    if (uClean.includes('buc') || uClean.includes('feli')) {
        factor = qty * 0.6; // ~60g
    } else if (uClean.includes('lingurit')) {
        factor = (qty * 5) / 100; // ~5g
    } else if (uClean.includes('lingur')) {
        factor = (qty * 15) / 100; // ~15g
    } else if (uClean.includes('can')) {
        factor = (qty * 250) / 100; // ~250g / 250ml
    } else if (uClean.includes('farfuri') || uClean.includes('bol') || uClean.includes('porti')) {
        factor = (qty * 350) / 100; // ~350g
    } else if (uClean === 'ml' || uClean.includes('mililitr')) {
        factor = qty / 100;
    } else if (uClean === 'kg' || uClean.includes('kilogram') || uClean === 'kilo') {
        factor = (qty * 1000) / 100;
    } else if (uClean === 'l' || uClean.includes('litr')) {
        factor = (qty * 1000) / 100;
    }

    const rawNuts = [];
    if (match.pro) rawNuts.push({ name: "Proteine", type: "Macro", qty: parseFloat((match.pro * factor).toFixed(1)), unit: "g" });
    if (match.carb) rawNuts.push({ name: "Carbohidrați", type: "Macro", qty: parseFloat((match.carb * factor).toFixed(1)), unit: "g" });
    if (match.fat) rawNuts.push({ name: "Grăsimi", type: "Macro", qty: parseFloat((match.fat * factor).toFixed(1)), unit: "g" });
    if (match.vitC) rawNuts.push({ name: "Vitamina C (Acid ascorbic)", type: "Micro", qty: parseFloat((match.vitC * factor).toFixed(1)), unit: "mg" });
    if (match.pot) rawNuts.push({ name: "Potasiu", type: "Micro", qty: parseFloat((match.pot * factor).toFixed(1)), unit: "mg" });
    if (match.mag) rawNuts.push({ name: "Magneziu", type: "Micro", qty: parseFloat((match.mag * factor).toFixed(1)), unit: "mg" });
    if (match.iron) rawNuts.push({ name: "Fier", type: "Micro", qty: parseFloat((match.iron * factor).toFixed(1)), unit: "mg" });
    if (match.calciu) rawNuts.push({ name: "Calciu", type: "Micro", qty: parseFloat((match.calciu * factor).toFixed(1)), unit: "mg" });

    return {
        name: name.trim(),
        quantity: qty,
        unit: unit || 'g',
        calories: Math.round((match.cal || 100) * factor),
        nutrients: normalizeNutrientsArray(rawNuts)
    };
}

// Deterministic Romanian Voice Food NLP Parser (Instant & Offline)
// STRICT REQUIREMENT: Only completes items when an explicit unit of measurement is heard
export function parseRomanianFoodVoiceInput(transcript, pendingContext = '') {
    if (!transcript || typeof transcript !== 'string') {
        return { isControlCommand: false, command: null, completedFoods: [], pendingFoodName: null };
    }
    
    let t = (' ' + transcript.toLowerCase().trim() + ' ').replace(/\s+/g, ' ');
    
    // Command words (stop, cancel, etc.)
    if (/\b(stop|gata|închide|inchide|oprește|opreste|gata masa|oprește microfonul|opreste microfonul)\b/i.test(t)) {
        return { isControlCommand: true, command: 'stop', completedFoods: [], pendingFoodName: null };
    }
    if (/\b(șterge ultimul|sterge ultimul|șterge ultima|sterge ultima|șterge ultimul aliment|sterge ultimul aliment|anulează ultimul|anuleaza ultimul)\b/i.test(t)) {
        return { isControlCommand: true, command: 'delete_last', completedFoods: [], pendingFoodName: null };
    }
    if (/\b(salvează masa|salveaza masa|salvează|salveaza|salvare masa|salvare|salvează meniul|salveaza meniul)\b/i.test(t)) {
        return { isControlCommand: true, command: 'save_meal', completedFoods: [], pendingFoodName: null };
    }

    // Word numbers mapping
    const numberWords = [
        { w: /\bjumătate\s+de\b|\bjumate\s+de\b|\bjumătate\b|\bjumate\b/gi, val: 0.5 },
        { w: /\bun\s+sfert\s+de\b|\bun\s+sfert\b/gi, val: 0.25 },
        { w: /\bo\s+mie\s+de\b|\bo\s+mie\b/gi, val: 1000 },
        { w: /\bo\s+sută\s+cincizeci\b|\bo\s+suta\s+cincizeci\b/gi, val: 150 },
        { w: /\bdouă\s+sute\b|\bdoua\s+sute\b/gi, val: 200 },
        { w: /\btrei\s+sute\b/gi, val: 300 },
        { w: /\bpatru\s+sute\b/gi, val: 400 },
        { w: /\bcinci\s+sute\b/gi, val: 500 },
        { w: /\bo\s+sută\b|\bo\s+suta\b/gi, val: 100 },
        { w: /\bcincizeci\b/gi, val: 50 },
        { w: /\bpatruzeci\b/gi, val: 40 },
        { w: /\btreizeci\b/gi, val: 30 },
        { w: /\bdouăzeci\b|\bdouazeci\b/gi, val: 20 },
        { w: /\bzece\b/gi, val: 10 },
        { w: /\bnouă\b|\bnoua\b/gi, val: 9 },
        { w: /\bopt\b/gi, val: 8 },
        { w: /\bșapte\b|\bsapte\b/gi, val: 7 },
        { w: /\bșase\b|\bsase\b/gi, val: 6 },
        { w: /\bcinci\b/gi, val: 5 },
        { w: /\bpatru\b/gi, val: 4 },
        { w: /\btrei\b/gi, val: 3 },
        { w: /\bdouă\b|\bdoua\b|\bdoi\b/gi, val: 2 },
        { w: /\bun\b|\bo\b/gi, val: 1 }
    ];

    for (const item of numberWords) {
        t = t.replace(item.w, ' ' + item.val + ' ');
    }

    const regex = /(?:(\d+(?:[.,]\d+)?)\s*(?:de\s+)?)?(?<![a-zA-ZăâîșțĂÂÎȘȚ])(kg|kilograme|kilogram|kilo|grame|gram|gr|g|ml|mililitri|mililitru|litri|litru|l|farfurii|farfurie|căni|cani|cană|cana|lingurițe|lingurite|linguriță|lingurita|linguri|lingură|lingura|bucăți|bucati|bucată|bucata|buc|felii|felie|pahare|pahar|boluri|bol|porții|portii|porție|portie|ouă|oua|ou|mere|măr|mar|banane|banană|banana)\b/gi;

    const completedFoods = [];
    let lastIdx = 0;
    let match;
    let currentPending = (pendingContext || '').trim();

    while ((match = regex.exec(t)) !== null) {
        const segment = t.substring(lastIdx, match.index);
        lastIdx = regex.lastIndex;

        let clean = segment
            .replace(/\b(adaugă|adauga|pune|trece|vreau|am mâncat|am mancat|de|cu|la|din|în|in|pentru|și|si|apoi|plus)\b/gi, ' ')
            .replace(/[^\wăâîșțĂÂÎȘȚ\s-]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        if (!clean && currentPending) {
            clean = currentPending;
        }

        let qty = match[1] ? parseFloat(match[1].replace(',', '.')) : null;
        const uRaw = match[2].toLowerCase();
        let unit = 'g';

        if (uRaw.startsWith('k')) { if (qty) qty *= 1000; unit = 'g'; }
        else if (uRaw === 'l' || uRaw.startsWith('litr')) { if (qty) qty *= 1000; unit = 'ml'; }
        else if (uRaw.startsWith('mililitr') || uRaw === 'ml') { unit = 'ml'; }
        else if (uRaw.startsWith('farfuri') || uRaw.startsWith('bol')) { unit = 'farfurie'; }
        else if (uRaw.startsWith('can') || uRaw.startsWith('căn')) { unit = 'cană'; }
        else if (uRaw.startsWith('lingurit')) { unit = 'linguriță'; }
        else if (uRaw.startsWith('lingur')) { unit = 'lingură'; }
        else if (uRaw.startsWith('pahar')) { if (qty) qty *= 200; unit = 'ml'; }
        else if (uRaw.startsWith('feli') || uRaw.startsWith('buc') || uRaw.startsWith('porti') || uRaw.startsWith('porți') || uRaw.startsWith('ou') || uRaw.startsWith('măr') || uRaw.startsWith('mar') || uRaw.startsWith('mere') || uRaw.startsWith('banan')) { unit = 'buc'; }
        else if (uRaw.startsWith('g')) { unit = 'g'; }

        if (!qty) {
            qty = (unit === 'g' || unit === 'ml') ? 100 : 1;
        }

        if (!clean) {
            if (uRaw.startsWith('ou')) clean = 'Ouă';
            else if (uRaw.startsWith('măr') || uRaw.startsWith('mar') || uRaw.startsWith('mere')) clean = 'Mere';
            else if (uRaw.startsWith('banan')) clean = 'Banane';
        }

        if (clean) {
            clean = clean.charAt(0).toUpperCase() + clean.slice(1);
            const foodData = estimateFoodLocally(clean, qty, unit);
            completedFoods.push(foodData);
            currentPending = '';
        }
    }

    const tail = t.substring(lastIdx)
        .replace(/\b(adaugă|adauga|pune|trece|vreau|am mâncat|am mancat|de|cu|la|din|în|in|pentru|și|si|apoi|plus)\b/gi, ' ')
        .replace(/[^\wăâîșțĂÂÎȘȚ\s-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    if (tail) {
        currentPending = tail.charAt(0).toUpperCase() + tail.slice(1);
    }

    return {
        isControlCommand: false,
        command: null,
        completedFoods,
        pendingFoodName: currentPending || null
    };
}

// Generic offline sports & physical activities database with MET coefficients
export const localActivityDB = {
    // 1. Gimnastică, Calisthenics & Exerciții cu Greutatea Corpului
    "flotari": { name: "Flotări (Push-ups)", category: "Gimnastică & Calisthenics", met: 8.0, icon: "dumbbell" },
    "genuflexiuni": { name: "Genuflexiuni (Squats / Greutatea Corpului)", category: "Gimnastică & Calisthenics", met: 6.0, icon: "user-check" },
    "squat": { name: "Squats / Genuflexiuni (Bodyweight)", category: "Gimnastică & Calisthenics", met: 6.0, icon: "user-check" },
    "genuflexiuni_greutati": { name: "Genuflexiuni cu Greutăți / Halteră (Squats)", category: "Fitness & Sală", met: 7.5, icon: "dumbbell" },
    "tractiuni": { name: "Tracțiuni la Bară (Pull-ups / Chin-ups)", category: "Gimnastică & Calisthenics", met: 8.0, icon: "user-check" },
    "flotari_paralele": { name: "Flotări la Paralele (Dips)", category: "Gimnastică & Calisthenics", met: 7.0, icon: "dumbbell" },
    "fandari": { name: "Fandări (Lunges)", category: "Gimnastică & Calisthenics", met: 5.5, icon: "user-check" },
    "abdomene_plank": { name: "Abdomene, Crunch & Plank (Scândură)", category: "Gimnastică & Calisthenics", met: 4.5, icon: "heart" },
    "burpees": { name: "Burpees / Circuit Calisthenic Intens", category: "Gimnastică & Calisthenics", met: 8.5, icon: "flame" },

    // 2. Atletism & Alergare
    "alergare_usoara": { name: "Alergare Ușoară / Jogging (~8 km/h)", category: "Atletism & Alergare", met: 8.0, icon: "footprints" },
    "alergare_moderata": { name: "Alergare Moderată (~10 km/h)", category: "Atletism & Alergare", met: 10.0, icon: "footprints" },
    "alergare_rapida": { name: "Alergare Rapidă / Sprint (>12 km/h)", category: "Atletism & Alergare", met: 12.5, icon: "zap" },
    "alergare_banda": { name: "Alergare pe Bandă / Înclinație", category: "Atletism & Alergare", met: 9.0, icon: "gauge" },
    "atletism_sarituri": { name: "Sărituri / Atletism Pistă", category: "Atletism & Alergare", met: 7.5, icon: "activity" },

    // 3. Sală, Fitness & Forță
    "fitness_greutati_moderat": { name: "Antrenament Forță / Greutăți (Moderat)", category: "Fitness & Sală", met: 5.0, icon: "dumbbell" },
    "fitness_greutati_intens": { name: "Antrenament Forță / Culturism (Intens)", category: "Fitness & Sală", met: 6.5, icon: "dumbbell" },
    "crossfit": { name: "CrossFit / Circuit Training", category: "Fitness & Sală", met: 8.5, icon: "flame" },
    "calisthenics": { name: "Calisthenics General / Exerciții Complexe", category: "Fitness & Sală", met: 6.5, icon: "user-check" },
    "pilates": { name: "Pilates / Core & Mobilitate", category: "Fitness & Sală", met: 3.5, icon: "heart" },
    "yoga": { name: "Yoga (Hatha / Vinyasa)", category: "Fitness & Sală", met: 3.0, icon: "sparkles" },
    "stretching": { name: "Stretching / Gimnastică Ușoară", category: "Fitness & Sală", met: 2.5, icon: "smile" },

    // 4. Cardio & Anduranță
    "ciclism_lejer": { name: "Ciclism Lejer (< 16 km/h)", category: "Cardio & Anduranță", met: 4.5, icon: "bike" },
    "ciclism_moderat": { name: "Ciclism Moderat / Spinning (16-20 km/h)", category: "Cardio & Anduranță", met: 7.0, icon: "bike" },
    "ciclism_intens": { name: "Ciclism Intens / Șosea (> 20 km/h)", category: "Cardio & Anduranță", met: 10.0, icon: "bike" },
    "inot_lejer": { name: "Înot Lejer / Recreativ", category: "Cardio & Anduranță", met: 6.0, icon: "waves" },
    "inot_intens": { name: "Înot Intens / Stil Liber / Fluture", category: "Cardio & Anduranță", met: 10.0, icon: "waves" },
    "sarit_coarda": { name: "Sărit Coarda (Ritm Alert)", category: "Cardio & Anduranță", met: 11.5, icon: "repeat" },
    "vaslit": { name: "Canotaj / Ergometru (Vâslit)", category: "Cardio & Anduranță", met: 7.0, icon: "anchor" },
    "urcat_scari": { name: "Urcat Scări / Stepper", category: "Cardio & Anduranță", met: 8.5, icon: "trending-up" },

    // 5. Sporturi & Jocuri
    "fotbal": { name: "Fotbal (Meci / Antrenament)", category: "Sporturi & Jocuri", met: 7.5, icon: "trophy" },
    "baschet": { name: "Baschet (Meci)", category: "Sporturi & Jocuri", met: 7.0, icon: "trophy" },
    "tenis_camp": { name: "Tenis de Câmp", category: "Sporturi & Jocuri", met: 7.0, icon: "activity" },
    "tenis_masa": { name: "Tenis de Masă (Ping-Pong)", category: "Sporturi & Jocuri", met: 4.0, icon: "activity" },
    "volei": { name: "Volei", category: "Sporturi & Jocuri", met: 4.5, icon: "activity" },
    "box_arte_martiale": { name: "Box / Kickboxing / Arte Marțiale", category: "Sporturi & Jocuri", met: 9.5, icon: "shield" },

    // 6. Activități Cotidiene & Mers
    "mers_lejer": { name: "Mers Lejer / Plimbare (3-4 km/h)", category: "Activități Cotidiene", met: 3.0, icon: "footprints" },
    "mers_alert": { name: "Mers Alert / Marș (5-6 km/h)", category: "Activități Cotidiene", met: 4.5, icon: "footprints" },
    "drumetie": { name: "Drumeție Montană / Hiking", category: "Activități Cotidiene", met: 6.5, icon: "mountain" },
    "dans_aerobic": { name: "Dans Aerobic / Zumba", category: "Activități Cotidiene", met: 6.5, icon: "music" },
    "munca_fizica": { name: "Muncă Fizică / Grădinărit Intens", category: "Activități Cotidiene", met: 5.0, icon: "hammer" }
};

export const Storage = {
    // --- Meals History CRUD ---
    getMeals() {
        try {
            const data = localStorage.getItem(STORAGE_KEYS.MEALS);
            return data ? JSON.parse(data) : [];
        } catch (e) {
            console.error("Failed to read meals from storage", e);
            return [];
        }
    },

    saveMeal(meal) {
        try {
            const meals = this.getMeals();
            const mealToSave = {
                ...meal,
                id: meal.id || 'meal_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                updatedAt: new Date().toISOString()
            };

            const existingIndex = meals.findIndex(m => m.id === mealToSave.id);
            if (existingIndex >= 0) {
                meals[existingIndex] = mealToSave;
            } else {
                meals.unshift(mealToSave); // Most recent first
            }

            localStorage.setItem(STORAGE_KEYS.MEALS, JSON.stringify(meals));
            return mealToSave;
        } catch (e) {
            console.error("Failed to save meal", e);
            throw e;
        }
    },

    deleteMeal(id) {
        try {
            const meals = this.getMeals().filter(m => m.id !== id);
            localStorage.setItem(STORAGE_KEYS.MEALS, JSON.stringify(meals));
            return true;
        } catch (e) {
            console.error("Failed to delete meal", e);
            return false;
        }
    },

    // --- Analyzed Foods Database (Smart Cache & Reanalysis) ---
    getAnalyzedFoods() {
        try {
            const data = localStorage.getItem(STORAGE_KEYS.ANALYZED_FOODS);
            let list = data ? JSON.parse(data) : null;
            if (!list || !Array.isArray(list) || list.length === 0) {
                list = JSON.parse(JSON.stringify(DEFAULT_ANALYZED_FOODS));
                localStorage.setItem(STORAGE_KEYS.ANALYZED_FOODS, JSON.stringify(list));
            }

            // Auto-deduplicate entries that only differ by diacritics / casing
            const deduped = [];
            const keyMap = new Map();
            let hasDuplicates = false;

            for (const item of list) {
                if (!item || !item.name) continue;
                const normKey = removeDiacritics(item.name);
                if (keyMap.has(normKey)) {
                    hasDuplicates = true;
                    const existingIdx = keyMap.get(normKey);
                    const existing = deduped[existingIdx];
                    
                    // Keep diacritic-rich name for display if available
                    const existingHasDiacritics = /[ăâîșțĂÂÎȘȚşţŞŢ]/.test(existing.name);
                    const itemHasDiacritics = /[ăâîșțĂÂÎȘȚşţŞŢ]/.test(item.name);
                    if (!existingHasDiacritics && itemHasDiacritics) {
                        existing.name = item.name;
                    }

                    // Keep richest nutrients array
                    if ((item.nutrients && item.nutrients.length > 0) && (!existing.nutrients || existing.nutrients.length === 0)) {
                        existing.nutrients = normalizeNutrientsArray(item.nutrients);
                        existing.calories = item.calories || existing.calories;
                        existing.macros = item.macros || existing.macros;
                    }
                } else {
                    keyMap.set(normKey, deduped.length);
                    deduped.push({
                        ...item,
                        nutrients: normalizeNutrientsArray(item.nutrients || [])
                    });
                }
            }

            if (hasDuplicates) {
                localStorage.setItem(STORAGE_KEYS.ANALYZED_FOODS, JSON.stringify(deduped));
            }
            return deduped;
        } catch (e) {
            console.error("Failed to read analyzed foods from storage", e);
            return JSON.parse(JSON.stringify(DEFAULT_ANALYZED_FOODS));
        }
    },

    resetAnalyzedFoodsDB() {
        try {
            const list = JSON.parse(JSON.stringify(DEFAULT_ANALYZED_FOODS));
            localStorage.setItem(STORAGE_KEYS.ANALYZED_FOODS, JSON.stringify(list));
            return list;
        } catch (e) {
            console.error("Failed to reset analyzed foods DB", e);
            return DEFAULT_ANALYZED_FOODS;
        }
    },

    getAnalyzedFood(idOrName) {
        if (!idOrName) return null;
        const list = this.getAnalyzedFoods();
        const idMatch = list.find(f => f.id === idOrName);
        if (idMatch) return idMatch;
        const cleanQuery = removeDiacritics(idOrName);
        return list.find(f => removeDiacritics(f.name) === cleanQuery) || null;
    },

    saveAnalyzedFood(foodItem) {
        if (!foodItem || !foodItem.name) return null;
        try {
            const list = this.getAnalyzedFoods();
            const cleanName = foodItem.name.trim();
            const normKey = removeDiacritics(cleanName);
            const existingIdx = list.findIndex(f => (foodItem.id && f.id === foodItem.id) || removeDiacritics(f.name) === normKey);

            const nowStr = new Date().toLocaleString('ro-RO', { 
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });

            const normalizedNutrients = normalizeNutrientsArray(foodItem.nutrients || []);
            
            // Extract macros if not provided
            let prot = 0, carbs = 0, fat = 0, fiber = 0;
            normalizedNutrients.forEach(n => {
                const nNorm = removeDiacritics(n.name);
                if (nNorm.includes('prot')) prot += n.qty || 0;
                if (nNorm.includes('carb')) carbs += n.qty || 0;
                if (nNorm.includes('gras')) fat += n.qty || 0;
                if (nNorm.includes('fibr')) fiber += n.qty || 0;
            });

            // If existing item has proper diacritics in name and incoming doesn't, preserve accented display name
            let finalName = cleanName;
            if (existingIdx >= 0) {
                const existingName = list[existingIdx].name;
                const existingHasDiacritics = /[ăâîșțĂÂÎȘȚşţŞŢ]/.test(existingName);
                const incomingHasDiacritics = /[ăâîșțĂÂÎȘȚşţŞŢ]/.test(cleanName);
                if (existingHasDiacritics && !incomingHasDiacritics) {
                    finalName = existingName;
                }
            }

            const foodToSave = {
                id: (existingIdx >= 0 ? list[existingIdx].id : null) || foodItem.id || ('food_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5)),
                name: finalName,
                baseQty: foodItem.baseQty || 100,
                baseUnit: foodItem.baseUnit || 'g',
                calories: Math.round(foodItem.calories || 0),
                macros: foodItem.macros || {
                    protein: parseFloat(prot.toFixed(1)),
                    carbs: parseFloat(carbs.toFixed(1)),
                    fat: parseFloat(fat.toFixed(1)),
                    fiber: parseFloat(fiber.toFixed(1))
                },
                nutrients: normalizedNutrients,
                lastAnalyzed: foodItem.lastAnalyzed || nowStr,
                source: foodItem.source || 'AI (Gemini)'
            };

            if (existingIdx >= 0) {
                list[existingIdx] = foodToSave;
            } else {
                list.unshift(foodToSave);
            }

            localStorage.setItem(STORAGE_KEYS.ANALYZED_FOODS, JSON.stringify(list));
            return foodToSave;
        } catch (e) {
            console.error("Failed to save analyzed food", e);
            return null;
        }
    },

    deleteAnalyzedFood(id) {
        try {
            const list = this.getAnalyzedFoods().filter(f => f.id !== id);
            localStorage.setItem(STORAGE_KEYS.ANALYZED_FOODS, JSON.stringify(list));
            return true;
        } catch (e) {
            console.error("Failed to delete analyzed food", e);
            return false;
        }
    },

    findAnalyzedFood(nameQuery) {
        if (!nameQuery || typeof nameQuery !== 'string') return null;
        const list = this.getAnalyzedFoods();
        if (list.length === 0) return null;

        const qClean = removeDiacritics(nameQuery);
        if (!qClean) return null;

        // 1. Exact match (diacritics-insensitive)
        for (const item of list) {
            if (removeDiacritics(item.name) === qClean) return item;
        }

        // 2. Query contains full item name or item name contains query
        for (const item of list) {
            const iClean = removeDiacritics(item.name);
            if (qClean.includes(iClean) || iClean.includes(qClean)) {
                return item;
            }
        }

        // 3. Word-level containment (e.g. "piept pui" matches "piept de pui", "mamaliga" matches "mămăligă")
        const qWords = qClean.split(' ').filter(w => w.length > 2);
        if (qWords.length > 0) {
            for (const item of list) {
                const iClean = removeDiacritics(item.name);
                const matchAll = qWords.every(w => iClean.includes(w));
                if (matchAll) return item;
            }
        }

        return null;
    },

    calculateFoodFromBase(baseFood, targetQty, targetUnit) {
        const qty = parseFloat(targetQty) || 1;
        const u = removeDiacritics(targetUnit || 'g');
        const baseQ = baseFood.baseQty || 100;
        const baseU = removeDiacritics(baseFood.baseUnit || 'g');

        // Calculate grams equivalent
        let targetGrams = qty;
        if (u === 'g' || u === 'grame' || u === 'gram') targetGrams = qty;
        else if (u === 'ml' || u === 'mililitri' || u === 'mililitru') targetGrams = qty;
        else if (u === 'kg' || u === 'kilograme' || u === 'kilo') targetGrams = qty * 1000;
        else if (u === 'l' || u === 'litri' || u === 'litru') targetGrams = qty * 1000;
        else if (u.includes('buc') || u.includes('feli')) targetGrams = qty * 60;
        else if (u.includes('lingurit')) targetGrams = qty * 5;
        else if (u.includes('lingur')) targetGrams = qty * 15;
        else if (u.includes('can')) targetGrams = qty * 250;
        else if (u.includes('por') || u.includes('bol') || u.includes('farfuri')) targetGrams = qty * 350;

        let baseGrams = baseQ;
        if (baseU === 'kg' || baseU === 'l') baseGrams = baseQ * 1000;
        else if (baseU.includes('buc') || baseU.includes('feli')) baseGrams = baseQ * 60;

        const factor = baseGrams > 0 ? (targetGrams / baseGrams) : (qty / baseQ);

        const scaledNutrients = (baseFood.nutrients || []).map(n => {
            const rawQty = parseFloat((n.qty * factor).toFixed(2));
            const def = CANONICAL_NUTRIENTS[n.name];
            const rda = def ? def.rda : 100;
            return {
                name: n.name,
                type: n.type || 'Micro',
                qty: rawQty,
                unit: n.unit || 'g',
                rda_percent: Math.round((rawQty / rda) * 100),
                role: n.role || (def ? def.role : '')
            };
        });

        return {
            name: baseFood.name,
            quantity: qty,
            unit: targetUnit || baseFood.baseUnit || 'g',
            calories: Math.round((baseFood.calories || 0) * factor),
            nutrients: scaledNutrients,
            isFromLocalCache: true
        };
    },

    exportAnalyzedFoodsJson() {
        const list = this.getAnalyzedFoods();
        const payload = {
            version: '1.0',
            type: 'analyzed_foods_database',
            exportDate: new Date().toISOString(),
            count: list.length,
            foods: list
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const dateStr = new Date().toISOString().slice(0, 10);
        a.download = `asistent_nutritie_baza_alimente_${dateStr}.json`;
        a.click();
        URL.revokeObjectURL(url);
    },

    importAnalyzedFoodsFromJson(jsonString) {
        try {
            const data = typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString;
            const incoming = Array.isArray(data) ? data : (data.foods && Array.isArray(data.foods) ? data.foods : []);
            if (!Array.isArray(incoming)) throw new Error("Format JSON invalid.");

            let importedCount = 0;
            incoming.forEach(item => {
                if (item && item.name) {
                    this.saveAnalyzedFood(item);
                    importedCount++;
                }
            });
            return { success: true, imported: importedCount };
        } catch (e) {
            console.error("Import error", e);
            return { success: false, error: e.message };
        }
    },

    // --- Health Profile ---
    getHealthProfile() {
        try {
            const data = localStorage.getItem(STORAGE_KEYS.HEALTH_PROFILE);
            return data ? JSON.parse(data) : [];
        } catch (e) {
            return [];
        }
    },

    saveHealthProfile(profile) {
        try {
            localStorage.setItem(STORAGE_KEYS.HEALTH_PROFILE, JSON.stringify(profile));
        } catch (e) {
            console.error("Failed to save health profile", e);
        }
    },

    // --- Settings & API Keys ---
    getApiKey() {
        return localStorage.getItem(STORAGE_KEYS.API_KEY) || '';
    },

    saveApiKey(key) {
        localStorage.setItem(STORAGE_KEYS.API_KEY, key);
    },

    clearApiKey() {
        localStorage.removeItem(STORAGE_KEYS.API_KEY);
        localStorage.removeItem(STORAGE_KEYS.ACTIVE_MODEL);
        localStorage.removeItem(STORAGE_KEYS.AI_CONNECTED);
    },

    // AI Enable / Disable Flag
    isAiEnabled() {
        const val = localStorage.getItem(STORAGE_KEYS.AI_ENABLED);
        return val === null ? true : val === 'true';
    },

    setAiEnabled(enabled) {
        localStorage.setItem(STORAGE_KEYS.AI_ENABLED, enabled ? 'true' : 'false');
    },

    // AI Connection Verified Flag
    isAiConnected() {
        return localStorage.getItem(STORAGE_KEYS.AI_CONNECTED) === 'true';
    },

    setAiConnected(connected) {
        localStorage.setItem(STORAGE_KEYS.AI_CONNECTED, connected ? 'true' : 'false');
    },

    // AI Nutrient Calc Flag (Automatic nutrient analysis upon food item add)
    isAiNutrientCalcEnabled() {
        const val = localStorage.getItem(STORAGE_KEYS.AI_NUTRIENT_CALC);
        return val === null ? true : val === 'true';
    },

    setAiNutrientCalcEnabled(enabled) {
        localStorage.setItem(STORAGE_KEYS.AI_NUTRIENT_CALC, enabled ? 'true' : 'false');
    },

    // Effective overall AI availability check
    isAiAvailable() {
        return this.isAiEnabled() && !!this.getApiKey().trim() && this.isAiConnected();
    },

    getActiveModel() {
        return localStorage.getItem(STORAGE_KEYS.ACTIVE_MODEL) || null;
    },

    saveActiveModel(model) {
        localStorage.setItem(STORAGE_KEYS.ACTIVE_MODEL, model);
    },

    // User Model Preferences (Specific selection or Custom typed string)
    getSelectedModelType() {
        return localStorage.getItem(STORAGE_KEYS.SELECTED_MODEL_TYPE) || 'gemini-flash-latest';
    },

    saveSelectedModelType(type) {
        localStorage.setItem(STORAGE_KEYS.SELECTED_MODEL_TYPE, type);
    },

    getCustomModelName() {
        return localStorage.getItem(STORAGE_KEYS.CUSTOM_MODEL_NAME) || '';
    },

    saveCustomModelName(name) {
        localStorage.setItem(STORAGE_KEYS.CUSTOM_MODEL_NAME, name);
    },

    // Effective Target Model
    getTargetModel() {
        const type = this.getSelectedModelType();
        if (type === 'custom') {
            const custom = this.getCustomModelName().trim();
            if (custom) return custom;
        }
        if (type && type !== 'auto') {
            return type;
        }
        return this.getActiveModel() || 'gemini-flash-latest';
    },

    // --- User Profile & Health Metrics ---
    getUserProfile() {
        try {
            const data = localStorage.getItem(STORAGE_KEYS.USER_PROFILE);
            if (data) return JSON.parse(data);
        } catch (e) {
            console.error("Failed to read user profile", e);
        }
        return {
            age: null,
            gender: '',
            weight: null,
            height: null,
            activityLevel: null,
            healthIssues: this.getHealthProfile() || [],
            allergies: [],
            targetDeficit: null
        };
    },

    saveUserProfile(profile) {
        try {
            const cleaned = {
                age: (profile.age !== null && profile.age !== undefined && !isNaN(profile.age) && Number(profile.age) > 0) ? parseInt(profile.age) : null,
                gender: (profile.gender === 'male' || profile.gender === 'female') ? profile.gender : '',
                weight: (profile.weight !== null && profile.weight !== undefined && !isNaN(profile.weight) && Number(profile.weight) > 0) ? parseFloat(profile.weight) : null,
                height: (profile.height !== null && profile.height !== undefined && !isNaN(profile.height) && Number(profile.height) > 0) ? parseFloat(profile.height) : null,
                activityLevel: (profile.activityLevel !== null && profile.activityLevel !== undefined && !isNaN(profile.activityLevel) && Number(profile.activityLevel) > 0) ? parseFloat(profile.activityLevel) : null,
                targetDeficit: (profile.targetDeficit !== null && profile.targetDeficit !== undefined && profile.targetDeficit !== '' && !isNaN(profile.targetDeficit)) ? parseInt(profile.targetDeficit) : null,
                healthIssues: Array.isArray(profile.healthIssues) ? profile.healthIssues : [],
                updatedAt: new Date().toISOString()
            };
            localStorage.setItem(STORAGE_KEYS.USER_PROFILE, JSON.stringify(cleaned));
            if (cleaned.healthIssues) {
                this.saveHealthProfile(cleaned.healthIssues);
            }
            return cleaned;
        } catch (e) {
            console.error("Failed to save user profile", e);
        }
    },

    // Calculate Medical & Nutritional Metrics
    calculateMetrics(profile) {
        const p = profile || this.getUserProfile();
        const weight = (p && p.weight !== null && p.weight !== undefined && !isNaN(p.weight) && Number(p.weight) > 0) ? parseFloat(p.weight) : null;
        const height = (p && p.height !== null && p.height !== undefined && !isNaN(p.height) && Number(p.height) > 0) ? parseFloat(p.height) : null;
        const age = (p && p.age !== null && p.age !== undefined && !isNaN(p.age) && Number(p.age) > 0) ? parseInt(p.age) : null;
        const gender = (p && (p.gender === 'male' || p.gender === 'female')) ? p.gender : null;
        const activity = (p && p.activityLevel !== null && p.activityLevel !== undefined && !isNaN(p.activityLevel) && Number(p.activityLevel) > 0) ? parseFloat(p.activityLevel) : null;
        const deficit = (p && p.targetDeficit !== null && p.targetDeficit !== undefined && p.targetDeficit !== '' && !isNaN(p.targetDeficit)) ? parseInt(p.targetDeficit) : 0;

        // 1. BMI / IMC
        let imc = null;
        let imcCategory = 'Necompletat';
        let imcColor = 'text-slate-400';
        if (weight && height) {
            const heightM = height / 100;
            if (heightM > 0) {
                imc = parseFloat((weight / (heightM * heightM)).toFixed(1));
                if (imc < 18.5) { imcCategory = 'Subponderal'; imcColor = 'text-amber-400'; }
                else if (imc < 25) { imcCategory = 'Normoponderal'; imcColor = 'text-emerald-400'; }
                else if (imc < 30) { imcCategory = 'Supraponderal'; imcColor = 'text-orange-400'; }
                else { imcCategory = 'Obezitate'; imcColor = 'text-rose-400'; }
            }
        }

        // 2. Ideal Weight (Lorentz Formula)
        let idealWeight = null;
        if (height && height >= 140 && gender) {
            if (gender === 'female') {
                idealWeight = (height - 100) - ((height - 150) / 2.5);
            } else {
                idealWeight = (height - 100) - ((height - 150) / 4);
            }
            idealWeight = parseFloat(idealWeight.toFixed(1));
        }

        // 3. Basal Metabolic Rate (BMR - Mifflin-St Jeor)
        let bmr = null;
        if (weight && height && age && gender) {
            if (gender === 'female') {
                bmr = (10 * weight) + (6.25 * height) - (5 * age) - 161;
            } else {
                bmr = (10 * weight) + (6.25 * height) - (5 * age) + 5;
            }
            bmr = Math.max(Math.round(bmr), 500);
        }

        // 4. Total Daily Energy Expenditure (TDEE) & Target Calories
        let tdee = null;
        let targetCalories = null;
        if (bmr) {
            const actMultiplier = activity || 1.2;
            tdee = Math.round(bmr * actMultiplier);
            targetCalories = Math.max(Math.round(tdee + deficit), 800);
        }

        return {
            imc,
            imcCategory,
            imcColor,
            idealWeight,
            bmr,
            tdee,
            targetCalories,
            activityLevel: activity,
            deficit
        };
    },

    // Calculate Hourly / Cumulative Circadian BMR up to a specific hour (0..24)
    calculateHourlyBmr(baseBmr = 1600, hourFloat = null) {
        let h = hourFloat;
        if (h === null || h === undefined || isNaN(h)) {
            const now = new Date();
            h = now.getHours() + (now.getMinutes() / 60);
        }
        h = Math.max(0.5, Math.min(24, h));
        const hourlyRate = baseBmr / 24;
        const cumulativeBmr = Math.round(hourlyRate * h);
        
        return {
            hourlyRate: parseFloat(hourlyRate.toFixed(1)),
            hourElapsed: parseFloat(h.toFixed(1)),
            cumulativeBmr,
            dailyBmr: baseBmr
        };
    },

    // --- Daily Physical Activities CRUD ---
    getActivities(dateStr = null) {
        try {
            const data = localStorage.getItem(STORAGE_KEYS.ACTIVITIES);
            const list = data ? JSON.parse(data) : [];
            if (!dateStr) return list;
            const targetDate = dateStr.slice(0, 10);
            return list.filter(a => a.date && a.date.slice(0, 10) === targetDate);
        } catch (e) {
            console.error("Failed to read activities from storage", e);
            return [];
        }
    },

    saveActivity(activity) {
        try {
            const list = this.getActivities();
            const actToSave = {
                ...activity,
                id: activity.id || 'act_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                updatedAt: new Date().toISOString()
            };

            const existingIndex = list.findIndex(a => a.id === actToSave.id);
            if (existingIndex >= 0) {
                list[existingIndex] = actToSave;
            } else {
                list.unshift(actToSave);
            }

            localStorage.setItem(STORAGE_KEYS.ACTIVITIES, JSON.stringify(list));
            return actToSave;
        } catch (e) {
            console.error("Failed to save activity", e);
            throw e;
        }
    },

    deleteActivity(id) {
        try {
            const list = this.getActivities().filter(a => a.id !== id);
            localStorage.setItem(STORAGE_KEYS.ACTIVITIES, JSON.stringify(list));
            return true;
        } catch (e) {
            console.error("Failed to delete activity", e);
            return false;
        }
    },

    // Calculate Burned Calories via MET
    calculateBurnedCalories(activityKey, durationMin, intensityLevel = 'moderate', customWeight = null) {
        const userProf = this.getUserProfile();
        const weight = customWeight || userProf.weight || 70;
        const dur = parseFloat(durationMin) || 0;
        if (dur <= 0) return 0;

        const actInfo = localActivityDB[activityKey] || { met: 5.0 };
        const baseMet = actInfo.met || 5.0;

        // Intensity Multipliers
        const intensityFactors = {
            'light': 0.85,
            'moderate': 1.0,
            'vigorous': 1.25,
            'extreme': 1.5
        };
        const factor = intensityFactors[intensityLevel] || 1.0;

        const cal = baseMet * factor * weight * (dur / 60);
        return Math.max(Math.round(cal), 1);
    },

    // Helper to get decimal hour (0..24) from meal or activity item
    getItemHour(item) {
        if (!item) return 12.0;
        if (item.time && typeof item.time === 'string' && item.time.includes(':')) {
            const [h, m] = item.time.split(':').map(Number);
            return (isNaN(h) ? 12 : h) + ((isNaN(m) ? 0 : m) / 60);
        }
        if (item.date && typeof item.date === 'string' && item.date.includes('T')) {
            const timePart = item.date.split('T')[1];
            if (timePart && timePart.includes(':')) {
                const [h, m] = timePart.split(':').map(Number);
                return (isNaN(h) ? 12 : h) + ((isNaN(m) ? 0 : m) / 60);
            }
        }
        return 12.0;
    },

    // Thermic Effect of Food (TEF / Consum Digestie)
    // Consumul pentru digestie intra in calcul STRICT doar daca a avut loc o masa (> 0 calorii)
    calculateTEF(foodsOrTotalCal) {
        if (!foodsOrTotalCal) return 0;
        if (typeof foodsOrTotalCal === 'number') {
            if (foodsOrTotalCal <= 0) return 0;
            return Math.round(foodsOrTotalCal * 0.10); // ~10% standard
        }
        if (Array.isArray(foodsOrTotalCal)) {
            if (foodsOrTotalCal.length === 0) return 0;
            let proGrams = 0, carbGrams = 0, fatGrams = 0, totalCal = 0;
            foodsOrTotalCal.forEach(f => {
                totalCal += (f.calories || 0);
                (f.nutrients || []).forEach(n => {
                    const nLower = (n.name || '').toLowerCase();
                    if (nLower.includes('prot')) proGrams += (parseFloat(n.qty) || 0);
                    if (nLower.includes('carb') || nLower.includes('gluc')) carbGrams += (parseFloat(n.qty) || 0);
                    if (nLower.includes('grăs') || nLower.includes('gras') || nLower.includes('lipid')) fatGrams += (parseFloat(n.qty) || 0);
                });
            });
            if (totalCal <= 0 && proGrams === 0 && carbGrams === 0 && fatGrams === 0) return 0;
            // High-precision TEF by macronutrient (Protein 25%, Carb 8%, Fat 2%)
            if (proGrams > 0 || carbGrams > 0 || fatGrams > 0) {
                const tef = (proGrams * 4 * 0.25) + (carbGrams * 4 * 0.08) + (fatGrams * 9 * 0.02);
                return Math.round(tef);
            }
            return Math.round(totalCal * 0.10);
        }
        return 0;
    },

    getSeasonByDate(dateString) {
        const d = dateString ? new Date(dateString) : new Date();
        const month = (isNaN(d.getTime()) ? new Date() : d).getMonth() + 1; // 1-12
        if (month === 12 || month === 1 || month === 2) return 'winter';
        if (month >= 3 && month <= 5) return 'spring';
        if (month >= 6 && month <= 8) return 'summer';
        return 'autumn'; // Septembrie (9), Octombrie (10), Noiembrie (11)
    },

    // Climate / 4 Seasons Thermogenesis Factor
    calculateClimateFactor(climateType = 'auto', dateStr = null) {
        let season = climateType;
        if (!season || season === 'auto' || season === 'comfort') {
            season = this.getSeasonByDate(dateStr);
        }
        if (season === 'winter' || season === 'cold') return { factor: 1.07, name: 'Iarnă', label: 'Iarnă (+7%)', season: 'winter' };
        if (season === 'summer' || season === 'hot') return { factor: 1.04, name: 'Vară', label: 'Vară (+4%)', season: 'summer' };
        if (season === 'spring') return { factor: 1.0, name: 'Primăvară', label: 'Primăvară (Standard)', season: 'spring' };
        return { factor: 1.0, name: 'Toamnă', label: 'Toamnă (Standard)', season: 'autumn' };
    },

    // Comprehensive Daily & Hourly Real-Time Metabolic Energy Balance
    calculateDailyEnergyBalance(dateStr, climateType = 'auto', upToHour = null) {
        const dStr = (dateStr || new Date().toISOString()).slice(0, 10);
        let dayMeals = this.getMeals().filter(m => m.date && m.date.slice(0, 10) === dStr);
        let dayActivities = this.getActivities(dStr);

        const isHourlyCutoff = (upToHour !== null && upToHour !== undefined && !isNaN(upToHour));
        if (isHourlyCutoff) {
            dayMeals = dayMeals.filter(m => this.getItemHour(m) <= upToHour);
            dayActivities = dayActivities.filter(a => this.getItemHour(a) <= upToHour);
        }

        // 1. Calories Consumed & TEF (Digestie)
        // Regula fiziologica: Consumul pentru digestie (TEF) intra in calcul STRICT daca a avut loc cel putin o masa
        let caloriesConsumed = 0;
        let allFoods = [];
        dayMeals.forEach(m => {
            (m.foods || []).forEach(f => {
                caloriesConsumed += (f.calories || 0);
                allFoods.push(f);
            });
        });
        const tefCalories = (caloriesConsumed > 0 && allFoods.length > 0) 
            ? this.calculateTEF(allFoods) 
            : (caloriesConsumed > 0 ? this.calculateTEF(caloriesConsumed) : 0);

        // 2. Calories Burned via Sport & Activities (cu ora de desfasurare)
        let caloriesBurnedSport = 0;
        let totalActiveMinutes = 0;
        dayActivities.forEach(a => {
            caloriesBurnedSport += (parseFloat(a.burnedCalories || a.caloriesBurned) || 0);
            totalActiveMinutes += (parseFloat(a.durationMinutes || a.duration) || 0);
        });

        // 3. Basal Metabolic Rate (BMR) & Climate Adjustment
        const metrics = this.calculateMetrics();
        const baseBmr = metrics.bmr || 1600;
        const climateObj = this.calculateClimateFactor(climateType, dStr);
        const climateFactor = climateObj.factor;
        const adjusted24hBmr = Math.round(baseBmr * climateFactor);

        let effectiveBmr = adjusted24hBmr;
        let hourlyBmrObj = null;
        if (isHourlyCutoff) {
            hourlyBmrObj = this.calculateHourlyBmr(adjusted24hBmr, upToHour);
            effectiveBmr = hourlyBmrObj.cumulativeBmr;
        }

        // 4. Total Real Energy Expended (BMR + TEF doar daca s-a mancat + Sport)
        const totalExpended = effectiveBmr + tefCalories + caloriesBurnedSport;
        const netBalance = caloriesConsumed - totalExpended;

        return {
            date: dStr,
            upToHour: isHourlyCutoff ? upToHour : null,
            mealsCount: dayMeals.length,
            caloriesConsumed,
            tefCalories,
            activitiesCount: dayActivities.length,
            totalActiveMinutes,
            caloriesBurnedSport,
            sportCalories: caloriesBurnedSport,
            baseBmr,
            climateType,
            climateFactor,
            adjustedBmr: adjusted24hBmr,
            effectiveBmr,
            totalExpended,
            netBalance,
            targetCalories: metrics.targetCalories || 2000,
            hasBiometrics: metrics.bmr !== null,
            hourlyBmrObj
        };
    },

    // AI Nutrient Calculation Setting (Token-saver & local speed mode)
    isAiNutrientCalcEnabled() {
        const val = localStorage.getItem(STORAGE_KEYS.AI_NUTRIENT_CALC);
        return val === null ? true : val === 'true';
    },

    setAiNutrientCalcEnabled(enabled) {
        localStorage.setItem(STORAGE_KEYS.AI_NUTRIENT_CALC, enabled ? 'true' : 'false');
    },

    // --- Saved Journal Smart Filter Persistence ---
    getJournalFilter() {
        try {
            const data = localStorage.getItem(STORAGE_KEYS.JOURNAL_FILTER);
            if (!data) return { type: 'last_7_days', customDates: [] };
            return JSON.parse(data);
        } catch (e) {
            return { type: 'last_7_days', customDates: [] };
        }
    },

    saveJournalFilter(filter) {
        try {
            localStorage.setItem(STORAGE_KEYS.JOURNAL_FILTER, JSON.stringify(filter));
        } catch (e) {
            console.error("Failed to save journal filter", e);
        }
    },

    // --- Full Mirror Export / Import (100% Data, Settings, Meals, Sports & API Key) ---
    exportAllData() {
        const payload = {
            version: '2.4',
            appName: 'Asistent Nutritie',
            exportDate: new Date().toISOString(),
            meals: this.getMeals(),
            activities: this.getActivities(),
            healthProfile: this.getHealthProfile(),
            userProfile: this.getUserProfile(),
            settings: {
                apiKey: this.getApiKey(),
                activeModel: this.getActiveModel(),
                selectedModelType: this.getSelectedModelType(),
                customModelName: this.getCustomModelName(),
                aiEnabled: this.isAiEnabled(),
                aiConnected: this.isAiConnected(),
                aiNutrientCalc: this.isAiNutrientCalcEnabled()
            },
            rawStorage: {}
        };

        // Mirror every single key in localStorage for 100% exact backup
        for (const [keyName, storageKey] of Object.entries(STORAGE_KEYS)) {
            const val = localStorage.getItem(storageKey);
            if (val !== null) {
                payload.rawStorage[storageKey] = val;
            }
        }

        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const dateStr = new Date().toISOString().slice(0, 10);
        a.download = `asistent_nutritie_backup_complet_${dateStr}.json`;
        a.click();
        URL.revokeObjectURL(url);
    },

    async importDataFromFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    let importedMealsCount = 0;
                    let importedActivitiesCount = 0;

                    if (Array.isArray(data)) {
                        // Legacy meals array format
                        const current = Storage.getMeals();
                        const merged = [...data, ...current];
                        const unique = Array.from(new Map(merged.map(m => [m.id || JSON.stringify(m), m])).values());
                        localStorage.setItem(STORAGE_KEYS.MEALS, JSON.stringify(unique));
                        importedMealsCount = data.length;
                    } else if (data && typeof data === 'object') {
                        // 1. Full rawStorage restore
                        if (data.rawStorage && typeof data.rawStorage === 'object') {
                            for (const [sKey, sVal] of Object.entries(data.rawStorage)) {
                                if (typeof sVal === 'string') {
                                    localStorage.setItem(sKey, sVal);
                                }
                            }
                        }

                        // 2. Structured meals merge
                        if (Array.isArray(data.meals)) {
                            const current = Storage.getMeals();
                            const merged = [...data.meals, ...current];
                            const unique = Array.from(new Map(merged.map(m => [m.id || JSON.stringify(m), m])).values());
                            localStorage.setItem(STORAGE_KEYS.MEALS, JSON.stringify(unique));
                            importedMealsCount = data.meals.length;
                        }

                        // 3. Structured activities merge
                        if (Array.isArray(data.activities)) {
                            const currentAct = Storage.getActivities();
                            const mergedAct = [...data.activities, ...currentAct];
                            const uniqueAct = Array.from(new Map(mergedAct.map(a => [a.id || JSON.stringify(a), a])).values());
                            localStorage.setItem(STORAGE_KEYS.ACTIVITIES, JSON.stringify(uniqueAct));
                            importedActivitiesCount = data.activities.length;
                        }

                        // 4. Health Profile
                        if (Array.isArray(data.healthProfile)) {
                            Storage.saveHealthProfile(data.healthProfile);
                        }

                        // 5. User Biometric Profile
                        if (data.userProfile && typeof data.userProfile === 'object') {
                            Storage.saveUserProfile(data.userProfile);
                        }

                        // 6. Settings & API Key
                        if (data.settings && typeof data.settings === 'object') {
                            const s = data.settings;
                            if (s.apiKey) Storage.saveApiKey(s.apiKey);
                            if (s.activeModel) Storage.setActiveModel(s.activeModel);
                            if (s.selectedModelType) Storage.setSelectedModelType(s.selectedModelType);
                            if (s.customModelName) Storage.saveCustomModelName(s.customModelName);
                            if (typeof s.aiEnabled === 'boolean') Storage.setAiEnabled(s.aiEnabled);
                            if (typeof s.aiConnected === 'boolean') Storage.setAiConnected(s.aiConnected);
                            if (typeof s.aiNutrientCalc === 'boolean') Storage.setAiNutrientCalcEnabled(s.aiNutrientCalc);
                        }
                    }
                    resolve({ count: importedMealsCount, activitiesCount: importedActivitiesCount });
                } catch (err) {
                    reject(new Error("Format de fișier JSON invalid."));
                }
            };
            reader.onerror = () => reject(new Error("Eroare la citirea fișierului."));
            reader.readAsText(file);
        });
    }
};
