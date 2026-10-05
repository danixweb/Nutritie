// ==========================================
// Application Core Logic
// ==========================================
import { Storage, localFoodDB, localActivityDB, estimateFoodLocally, parseRomanianFoodVoiceInput, CANONICAL_NUTRIENTS, normalizeNutrientName, normalizeNutrientsArray, removeDiacritics } from './storage.js';
import { AI } from './ai.js';
import { PDFReport } from './pdf.js';

// Application State
let currentMeal = { id: null, date: '', name: '', foods: [] };
let historyData = [];
let editingFoodIndex = -1;
let selectedFoodNutrientIndex = -1;
let currentOpenNutrient = null;
let healthProfile = [];
let recognition = null;
let isLoopActive = false;
let mealVoiceRecognition = null;
let isMealVoiceActive = false;

// Helpers & Time of Day Meal Suggestion
export function formatRomanianDateTime(dateTimeString) {
    if (!dateTimeString) return 'Dată nespecificată';
    const d = new Date(dateTimeString);
    if (isNaN(d.getTime())) return dateTimeString;

    const days = ['duminică', 'luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă'];
    const months = [
        'ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie',
        'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'
    ];

    const dayName = days[d.getDay()];
    const dayNum = d.getDate();
    const monthName = months[d.getMonth()];
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');

    return `${dayName} ${dayNum} ${monthName} ${hours}:${minutes}`;
}

export function suggestMealNameByTime(dateTimeString) {
    const d = dateTimeString ? new Date(dateTimeString) : new Date();
    const hour = d.getHours();
    const minute = d.getMinutes();
    const timeVal = hour + (minute / 60);

    if (timeVal >= 5.0 && timeVal < 10.75) {
        return "Mic Dejun";
    } else if (timeVal >= 10.75 && timeVal < 12.5) {
        return "Gustare de Dimineață";
    } else if (timeVal >= 12.5 && timeVal < 16.5) {
        return "Prânz";
    } else if (timeVal >= 16.5 && timeVal < 19.5) {
        return "Gustare de După-amiază";
    } else if (timeVal >= 19.5 && timeVal < 23.0) {
        return "Cină";
    } else {
        return "Gustare de Noapte";
    }
}

const STANDARD_SUGGESTIONS = [
    "Mic Dejun", "Gustare de Dimineață", "Prânz", "Gustare de După-amiază", "Cină", "Gustare de Noapte", "Gustare"
];

window.handleMealDateChange = (val) => {
    const textEl = document.getElementById('meal-datetime-text');
    if (textEl) {
        textEl.innerText = formatRomanianDateTime(val);
    }
    const nameInput = document.getElementById('meal-name');
    if (nameInput) {
        const currentVal = nameInput.value.trim();
        if (!currentVal || STANDARD_SUGGESTIONS.includes(currentVal)) {
            nameInput.value = suggestMealNameByTime(val);
        }
    }
    updateDynamicCaloricGauge();
};

function getTodayDateTimeLocal() {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - offset).toISOString().slice(0, 16);
}

function refreshIcons() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
    }
}

// --- Header & Scroll Stability ---
window.ensureHeaderVisible = () => {
    window.scrollTo(0, 0);
    if (document.documentElement && document.documentElement.scrollTop !== 0) {
        document.documentElement.scrollTop = 0;
    }
    if (document.body && document.body.scrollTop !== 0) {
        document.body.scrollTop = 0;
    }
    const header = document.getElementById('app-header');
    if (header && header.classList.contains('hidden')) {
        header.classList.remove('hidden');
    }
};

window.addEventListener('scroll', () => {
    if (window.scrollY !== 0 || (document.documentElement && document.documentElement.scrollTop !== 0) || (document.body && document.body.scrollTop !== 0)) {
        window.scrollTo(0, 0);
        if (document.documentElement) document.documentElement.scrollTop = 0;
        if (document.body) document.body.scrollTop = 0;
    }
}, { passive: true });

// --- UI Toggle Handlers ---
window.toggleTopMenu = () => {
    const menu = document.getElementById('top-dropdown-menu');
    const chevron = document.getElementById('menu-chevron');
    if (!menu) return;
    const isHidden = menu.classList.toggle('hidden');
    if (chevron) {
        if (!isHidden) chevron.classList.add('rotate-180');
        else chevron.classList.remove('rotate-180');
    }
};

window.closeTopMenu = () => {
    const menu = document.getElementById('top-dropdown-menu');
    const chevron = document.getElementById('menu-chevron');
    if (menu) menu.classList.add('hidden');
    if (chevron) chevron.classList.remove('rotate-180');
};

// Global click listener to close menu when clicking outside
document.addEventListener('click', (e) => {
    const menu = document.getElementById('top-dropdown-menu');
    const btn = document.getElementById('top-menu-btn');
    if (menu && !menu.classList.contains('hidden') && btn && !btn.contains(e.target) && !menu.contains(e.target)) {
        window.closeTopMenu();
    }
});

// --- Caloric Card Collapse/Expand Toggle ---
window.toggleCaloricCard = () => {
    const card = document.getElementById('dynamic-caloric-card');
    const icon = document.getElementById('caloric-card-toggle-icon');
    const btnText = document.getElementById('caloric-card-toggle-text');
    if (!card) return;

    const isHidden = card.classList.contains('hidden');
    if (isHidden) {
        card.classList.remove('hidden');
        if (icon) {
            icon.setAttribute('data-lucide', 'chevron-up');
        }
        if (btnText) btnText.innerText = 'Ascunde';
        localStorage.setItem('caloric_card_collapsed', 'false');
    } else {
        card.classList.add('hidden');
        if (icon) {
            icon.setAttribute('data-lucide', 'chevron-down');
        }
        if (btnText) btnText.innerText = 'Balanță';
        localStorage.setItem('caloric_card_collapsed', 'true');
    }
    refreshIcons();
};

function initCaloricCardState() {
    const savedState = localStorage.getItem('caloric_card_collapsed');
    // Implicit / Default este RETRACTATĂ (collapsed) dacă nu a fost explicit expandată de utilizator
    const isExpanded = (savedState === 'false');
    const card = document.getElementById('dynamic-caloric-card');
    const icon = document.getElementById('caloric-card-toggle-icon');
    const btnText = document.getElementById('caloric-card-toggle-text');

    if (isExpanded) {
        if (card) card.classList.remove('hidden');
        if (icon) icon.setAttribute('data-lucide', 'chevron-up');
        if (btnText) btnText.innerText = 'Ascunde';
    } else {
        if (card) card.classList.add('hidden');
        if (icon) icon.setAttribute('data-lucide', 'chevron-down');
        if (btnText) btnText.innerText = 'Balanță';
    }
}

// --- Activity Summary Stats Collapse/Expand Toggle ---
window.toggleActivityStats = () => {
    const card = document.getElementById('dynamic-activity-stats-card');
    const icon = document.getElementById('activity-stats-toggle-icon');
    const btnText = document.getElementById('activity-stats-toggle-text');
    if (!card) return;

    const isHidden = card.classList.contains('hidden');
    if (isHidden) {
        card.classList.remove('hidden');
        if (icon) {
            icon.setAttribute('data-lucide', 'chevron-up');
        }
        if (btnText) btnText.innerText = 'Ascunde';
        localStorage.setItem('activity_stats_collapsed', 'false');
    } else {
        card.classList.add('hidden');
        if (icon) {
            icon.setAttribute('data-lucide', 'chevron-down');
        }
        if (btnText) btnText.innerText = 'Statistici';
        localStorage.setItem('activity_stats_collapsed', 'true');
    }
    refreshIcons();
};

function initActivityStatsState() {
    const savedState = localStorage.getItem('activity_stats_collapsed');
    // Implicit / Default este RETRACTATĂ (collapsed) dacă nu a fost explicit expandată de utilizator
    const isExpanded = (savedState === 'false');
    const card = document.getElementById('dynamic-activity-stats-card');
    const icon = document.getElementById('activity-stats-toggle-icon');
    const btnText = document.getElementById('activity-stats-toggle-text');

    if (isExpanded) {
        if (card) card.classList.remove('hidden');
        if (icon) icon.setAttribute('data-lucide', 'chevron-up');
        if (btnText) btnText.innerText = 'Ascunde';
    } else {
        if (card) card.classList.add('hidden');
        if (icon) icon.setAttribute('data-lucide', 'chevron-down');
        if (btnText) btnText.innerText = 'Statistici';
    }
}

// --- Main Tab Navigation (Editor Mese vs Activitate Zilnică) ---
window.switchMainTab = (tabName) => {
    const mealsBtn = document.getElementById('main-tab-meals-btn');
    const actBtn = document.getElementById('main-tab-activities-btn');
    const mealsContent = document.getElementById('meals-tab-content');
    const actContent = document.getElementById('activities-tab-content');

    if (tabName === 'activities') {
        if (mealsBtn) {
            mealsBtn.className = "flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800";
        }
        if (actBtn) {
            actBtn.className = "flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 bg-emerald-600 text-white shadow-lg border border-emerald-500";
        }
        if (mealsContent) mealsContent.classList.add('hidden');
        if (actContent) actContent.classList.remove('hidden');

        populateActivityTypeSelect();
        initActivityDate();
        renderDayActivities();
        recalcActivityPreview();
    } else {
        if (mealsBtn) {
            mealsBtn.className = "flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 bg-indigo-600 text-white shadow-lg border border-indigo-500";
        }
        if (actBtn) {
            actBtn.className = "flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800";
        }
        if (mealsContent) mealsContent.classList.remove('hidden');
        if (actContent) actContent.classList.add('hidden');
        updateDynamicCaloricGauge();
    }
    refreshIcons();
};

// --- Daily Physical Activities & Sport Controller ---
function populateActivityTypeSelect() {
    const sel = document.getElementById('activity-type-select');
    if (!sel) return;

    const currentVal = sel.value;
    const categories = {};
    for (const [key, act] of Object.entries(localActivityDB)) {
        const cat = act.category || 'Altele';
        if (!categories[cat]) categories[cat] = [];
        categories[cat].push({ key, ...act });
    }

    sel.innerHTML = '';
    for (const [catName, items] of Object.entries(categories)) {
        const group = document.createElement('optgroup');
        group.label = catName;
        items.forEach(item => {
            const opt = document.createElement('option');
            opt.value = item.key;
            opt.textContent = `${item.name} (MET: ${item.met})`;
            group.appendChild(opt);
        });
        sel.appendChild(group);
    }
    if (currentVal && localActivityDB[currentVal]) {
        sel.value = currentVal;
    }
}

function syncSeasonWithDate(dateStr) {
    const climateSelect = document.getElementById('activity-climate');
    if (climateSelect) {
        const season = Storage.getSeasonByDate(dateStr);
        climateSelect.value = season;
    }
}

function initActivityDate() {
    const picker = document.getElementById('activity-date-picker');
    const todayStr = new Date().toISOString().slice(0, 10);
    if (picker && !picker.value) {
        picker.value = todayStr;
    }
    const timeInput = document.getElementById('activity-time-input');
    if (timeInput && !timeInput.value) {
        const now = new Date();
        timeInput.value = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    }
    syncSeasonWithDate(picker?.value || todayStr);
}

window.setActivityTimeNow = () => {
    const timeInput = document.getElementById('activity-time-input');
    if (timeInput) {
        const now = new Date();
        timeInput.value = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    }
    recalcActivityPreview();
};

window.handleActivityDateChange = (val) => {
    syncSeasonWithDate(val);
    renderDayActivities();
    recalcActivityPreview();
    updateDynamicCaloricGauge();
};

window.setActivityDateToday = () => {
    const picker = document.getElementById('activity-date-picker');
    const todayStr = new Date().toISOString().slice(0, 10);
    if (picker) {
        picker.value = todayStr;
    }
    const timeInput = document.getElementById('activity-time-input');
    if (timeInput) {
        const now = new Date();
        timeInput.value = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    }
    syncSeasonWithDate(todayStr);
    renderDayActivities();
    recalcActivityPreview();
    updateDynamicCaloricGauge();
};

window.adjustActivityDuration = (delta) => {
    const durInput = document.getElementById('activity-duration');
    if (!durInput) return;
    let val = parseInt(durInput.value) || 0;
    val = Math.max(5, Math.min(600, val + delta));
    durInput.value = val;
    recalcActivityPreview();
};

window.recalcActivityPreview = () => {
    const actKey = document.getElementById('activity-type-select')?.value;
    const intensity = document.getElementById('activity-intensity')?.value || 'moderate';
    const dur = parseInt(document.getElementById('activity-duration')?.value) || 30;
    const previewEl = document.getElementById('activity-preview-calories');

    const burned = Storage.calculateBurnedCalories(actKey, dur, intensity);
    if (previewEl) {
        previewEl.innerHTML = `🔥 ~${burned} kcal`;
    }
};

window.saveActivityFromForm = () => {
    const picker = document.getElementById('activity-date-picker');
    const timeInput = document.getElementById('activity-time-input');
    const actKey = document.getElementById('activity-type-select')?.value;
    const intensity = document.getElementById('activity-intensity')?.value || 'moderate';
    const dur = parseInt(document.getElementById('activity-duration')?.value) || 0;
    const climate = document.getElementById('activity-climate')?.value || 'comfort';

    if (!actKey) {
        alert("Selectează un tip de activitate.");
        return;
    }
    if (dur <= 0) {
        alert("Introdu o durată validă în minute.");
        return;
    }

    const dateStr = picker?.value || new Date().toISOString().slice(0, 10);
    let timeStr = timeInput?.value;
    if (!timeStr) {
        const now = new Date();
        timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    }

    const actMeta = localActivityDB[actKey] || { name: actKey, met: 5.0, icon: 'activity', category: 'General' };
    const burned = Storage.calculateBurnedCalories(actKey, dur, intensity);

    const newActivity = {
        id: 'act_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        date: dateStr,
        time: timeStr,
        activityKey: actKey,
        name: actMeta.name,
        category: actMeta.category,
        icon: actMeta.icon || 'activity',
        met: actMeta.met,
        durationMinutes: dur,
        intensity: intensity,
        climate: climate,
        burnedCalories: burned,
        createdAt: new Date().toISOString()
    };

    Storage.saveActivity(newActivity);
    renderDayActivities();
    updateDynamicCaloricGauge();
    refreshIcons();
};

window.deleteActivityItem = (id) => {
    if (confirm("Sigur dorești să ștergi această sesiune de activitate?")) {
        Storage.deleteActivity(id);
        renderDayActivities();
        updateDynamicCaloricGauge();
    }
};

function renderDayActivities() {
    const picker = document.getElementById('activity-date-picker');
    const dateStr = picker?.value || new Date().toISOString().slice(0, 10);
    const climate = document.getElementById('activity-climate')?.value || 'comfort';

    const dayActivities = Storage.getActivities(dateStr);
    const balance = Storage.calculateDailyEnergyBalance(dateStr, climate);

    // Sort activities chronologically by time of session
    dayActivities.sort((a, b) => {
        const tA = a.time || '12:00';
        const tB = b.time || '12:00';
        return tA.localeCompare(tB);
    });

    // Update stats counters
    const countEl = document.getElementById('act-stat-count');
    const durEl = document.getElementById('act-stat-duration');
    const burnedEl = document.getElementById('act-stat-burned');
    const tefEl = document.getElementById('act-stat-tef');
    const badgeCount = document.getElementById('activities-badge-count');

    const totalDur = dayActivities.reduce((acc, a) => acc + (a.durationMinutes || 0), 0);
    const totalBurned = dayActivities.reduce((acc, a) => acc + (a.burnedCalories || 0), 0);

    if (countEl) countEl.innerText = dayActivities.length;
    if (durEl) durEl.innerText = totalDur;
    if (burnedEl) burnedEl.innerText = totalBurned;
    if (tefEl) tefEl.innerText = balance.tefCalories;

    if (badgeCount) {
        if (dayActivities.length > 0) {
            badgeCount.innerText = dayActivities.length;
            badgeCount.classList.remove('hidden');
        } else {
            badgeCount.classList.add('hidden');
        }
    }

    // Render list
    const listEl = document.getElementById('day-activities-list');
    if (!listEl) return;

    listEl.innerHTML = '';
    if (dayActivities.length === 0) {
        listEl.innerHTML = `
            <div class="text-center py-8 text-slate-500 text-xs bg-slate-950/60 rounded-xl border border-dashed border-slate-800">
                <i data-lucide="dumbbell" class="w-8 h-8 mx-auto mb-2 text-slate-600 opacity-60"></i>
                <p>Nicio sesiune de activitate înregistrată pentru această zi.</p>
                <p class="text-[10px] text-slate-600 mt-0.5">Folosește formularul de mai sus pentru a adăuga antrenamente sau mișcare.</p>
            </div>
        `;
        refreshIcons();
        return;
    }

    dayActivities.forEach(act => {
        const item = document.createElement('div');
        item.className = "flex items-center justify-between p-3.5 bg-slate-950 rounded-xl border border-slate-800 hover:border-slate-700 transition-all";

        const intensityLabels = {
            light: { text: 'Ușor', color: 'text-sky-400 bg-sky-950/60 border-sky-800' },
            moderate: { text: 'Moderat', color: 'text-emerald-400 bg-emerald-950/60 border-emerald-800' },
            vigorous: { text: 'Intens', color: 'text-amber-400 bg-amber-950/60 border-amber-800' },
            extreme: { text: 'Extrem', color: 'text-rose-400 bg-rose-950/60 border-rose-800' }
        };
        const intInfo = intensityLabels[act.intensity] || intensityLabels.moderate;

        item.innerHTML = `
            <div class="flex items-center gap-3 min-w-0">
                <div class="w-10 h-10 rounded-xl bg-emerald-950/80 border border-emerald-800/80 flex items-center justify-center text-emerald-400 shrink-0">
                    <i data-lucide="${act.icon || 'activity'}" class="w-5 h-5"></i>
                </div>
                <div class="min-w-0">
                    <div class="font-bold text-white text-xs sm:text-sm truncate flex items-center gap-2">
                        <span>${act.name}</span>
                    </div>
                    <div class="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-400 mt-0.5">
                        <span class="text-emerald-400 font-mono font-bold bg-slate-900 border border-slate-800 px-1.5 py-0.5 rounded">⏰ ${act.time || '12:00'}</span>
                        <span class="text-slate-300 font-semibold">${act.durationMinutes} min</span>
                        <span>•</span>
                        <span class="px-1.5 py-0.5 rounded border font-semibold ${intInfo.color}">${intInfo.text}</span>
                        <span>•</span>
                        <span class="text-slate-500">${act.category || 'Sport'}</span>
                    </div>
                </div>
            </div>
            <div class="flex items-center gap-3 shrink-0">
                <div class="text-right">
                    <div class="font-mono text-sm sm:text-base font-bold text-emerald-400">🔥 -${act.burnedCalories}</div>
                    <div class="text-[9px] text-slate-500 uppercase font-bold">kcal arse</div>
                </div>
                <button onclick="deleteActivityItem('${act.id}')" class="p-2 text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 rounded-lg transition-colors" title="Șterge sesiune">
                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
            </div>
        `;
        listEl.appendChild(item);
    });

    refreshIcons();
}

// --- Dynamic Caloric Gauge & Circadian Hourly Metabolic Balance Progress Tracker ---
function updateDynamicCaloricGauge() {
    const mealCalsEl = document.getElementById('meal-live-calories');
    const dayCalsEl = document.getElementById('day-live-calories');
    const bmrStatusPill = document.getElementById('bmr-status-pill');
    const bmrStatusText = document.getElementById('bmr-status-text');
    const progressBar = document.getElementById('caloric-progress-bar');
    const progressStatus = document.getElementById('caloric-progress-status');
    const bmrMarkerLabel = document.getElementById('bmr-marker-label');
    const tdeeMarkerLabel = document.getElementById('tdee-marker-label');

    if (!mealCalsEl || !dayCalsEl) return;

    // 1. Current Meal Calories & Foods
    let mealCal = 0;
    const currentMealFoods = currentMeal.foods || [];
    currentMealFoods.forEach(f => {
        mealCal += parseFloat(f.calories) || 0;
    });
    mealCal = Math.round(mealCal);
    mealCalsEl.innerText = mealCal;

    // 2. Total Day Calories (saved meals on this day + current meal)
    const mealDateVal = document.getElementById('meal-datetime')?.value || '';
    const dateStr = mealDateVal ? mealDateVal.slice(0, 10) : new Date().toISOString().slice(0, 10);
    
    // Extract selected or current hour of day
    let hourFloat = 12.0;
    let formattedTimeStr = "12:00";
    if (mealDateVal && mealDateVal.includes('T')) {
        const timePart = mealDateVal.split('T')[1];
        const [hh, mm] = timePart.split(':').map(Number);
        if (!isNaN(hh)) {
            hourFloat = hh + (isNaN(mm) ? 0 : mm / 60);
            formattedTimeStr = `${String(hh).padStart(2, '0')}:${String(mm || 0).padStart(2, '0')}`;
        }
    } else {
        const now = new Date();
        hourFloat = now.getHours() + (now.getMinutes() / 60);
        formattedTimeStr = now.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
    }

    const allMeals = Storage.getMeals();
    let savedDayCal = 0;
    let savedFoodsList = [];
    allMeals.forEach(m => {
        if (m.date && m.date.slice(0, 10) === dateStr) {
            if (currentMeal.id && m.id === currentMeal.id) {
                // exclude meal currently being edited to avoid double counting
                return;
            }
            (m.foods || []).forEach(f => {
                savedDayCal += parseFloat(f.calories) || 0;
                savedFoodsList.push(f);
            });
        }
    });

    const totalDayCal = Math.round(savedDayCal + mealCal);
    dayCalsEl.innerText = totalDayCal;

    // 3. User Biometric Targets
    const profile = Storage.getUserProfile();
    const metrics = Storage.calculateMetrics(profile);
    const bmr = metrics.bmr || 1600;
    const targetTDEE = metrics.targetCalories || metrics.tdee || 2000;

    // 4. Hourly Circadian BMR & Real-time Active Balance calculations
    const hourlyBmrObj = Storage.calculateHourlyBmr(bmr, hourFloat);
    const cumulativeBmr = hourlyBmrObj.cumulativeBmr; // e.g. at 08:30 -> ~560 kcal
    const hourlyRate = Math.round(hourlyBmrObj.hourlyRate); // e.g. ~70 kcal/h

    // Calculate sport calories burned up to this hour of day
    const dayActivities = Storage.getActivities(dateStr);
    let sportBurnedUpToHour = 0;
    dayActivities.forEach(act => {
        const actHour = Storage.getItemHour(act);
        if (actHour <= hourFloat) {
            sportBurnedUpToHour += (parseFloat(act.burnedCalories || act.caloriesBurned) || 0);
        }
    });

    // Calculate TEF (Digestie) - STRICT CONDITIONAL: doar daca s-au consumat alimente
    const allFoodsUpToHour = savedFoodsList.concat(currentMealFoods);
    const tefAtHour = (totalDayCal > 0 && allFoodsUpToHour.length > 0)
        ? Storage.calculateTEF(allFoodsUpToHour)
        : (totalDayCal > 0 ? Storage.calculateTEF(totalDayCal) : 0);

    // Total Real Expenditure up to this hour (BMR orar + TEF digestie + Sport)
    const realTimeExpended = cumulativeBmr + tefAtHour + sportBurnedUpToHour;
    const realTimeNetBalance = totalDayCal - realTimeExpended;

    // Update labels above the bar
    if (bmrMarkerLabel) {
        let extraPills = [];
        if (sportBurnedUpToHour > 0) extraPills.push(`Sport: <b class="text-emerald-400">-${sportBurnedUpToHour} kcal</b>`);
        if (tefAtHour > 0) extraPills.push(`TEF: <b class="text-indigo-400">-${tefAtHour} kcal</b>`);
        const extraText = extraPills.length > 0 ? ` | ${extraPills.join(' | ')}` : '';
        bmrMarkerLabel.innerHTML = `BMR orar (${formattedTimeStr}): <b>~${cumulativeBmr} kcal</b> <span class="text-slate-500 font-normal">(${hourlyRate} kcal/h)</span>${extraText}`;
    }
    if (tdeeMarkerLabel) {
        tdeeMarkerLabel.innerHTML = `BMR 24h: <b>${bmr} kcal</b> | Țintă 24h: <b>${targetTDEE} kcal</b>`;
    }

    // 5. Visual Gauge & Circadian Status Evaluation
    if (progressBar && progressStatus) {
        // Overall daily progress percentage (0 - 100%)
        const dailyProgressPct = Math.min(Math.round((totalDayCal / targetTDEE) * 100), 100);
        progressBar.style.width = `${Math.max(dailyProgressPct, totalDayCal > 0 ? 5 : 0)}%`;

        if (totalDayCal === 0) {
            progressBar.className = "h-full rounded-full transition-all duration-500 bg-slate-700";
            const sportNote = sportBurnedUpToHour > 0 ? ` (+${sportBurnedUpToHour} kcal sport)` : '';
            progressStatus.innerHTML = `Nicio masă până la ora ${formattedTimeStr} (TEF = 0 kcal). Consum metabolic acumulat: ~${cumulativeBmr} kcal${sportNote}.`;
            if (bmrStatusPill) {
                bmrStatusPill.className = "text-[11px] px-2.5 py-1 rounded-lg font-semibold bg-slate-900 border border-slate-800 text-slate-400 flex items-center gap-1.5";
                if (bmrStatusText) bmrStatusText.innerText = `BMR orar: ~${cumulativeBmr} kcal`;
            }
        } else if (totalDayCal > targetTDEE) {
            // Surplus over 24h TDEE
            const surplus = totalDayCal - targetTDEE;
            progressBar.className = "h-full rounded-full transition-all duration-500 bg-gradient-to-r from-amber-500 to-rose-500 shadow-md";
            progressStatus.innerHTML = `Target zilnic depășit (<strong class="text-amber-300 font-mono">+${surplus} kcal surplus</strong> față de TDEE de ${targetTDEE} kcal • Balanță la ${formattedTimeStr}: ${realTimeNetBalance > 0 ? `+${realTimeNetBalance}` : realTimeNetBalance} kcal)`;
            if (bmrStatusPill) {
                bmrStatusPill.className = "text-[11px] px-2.5 py-1 rounded-lg font-semibold bg-amber-950/80 text-amber-300 border border-amber-800/80 flex items-center gap-1.5";
                if (bmrStatusText) bmrStatusText.innerText = `Surplus Caloric (+${surplus} kcal)`;
            }
        } else if (totalDayCal >= bmr) {
            // Reached 24h BMR, in optimal zone toward TDEE
            const rem = targetTDEE - totalDayCal;
            progressBar.className = "h-full rounded-full transition-all duration-500 bg-gradient-to-r from-indigo-500 to-emerald-400 shadow-sm";
            progressStatus.innerHTML = `BMR 24h atins! Zona de consum optim (<strong class="text-emerald-300 font-mono">${rem} kcal</strong> rămase până la TDEE • Balanță la ${formattedTimeStr}: ${realTimeNetBalance > 0 ? `+${realTimeNetBalance}` : realTimeNetBalance} kcal)`;
            if (bmrStatusPill) {
                bmrStatusPill.className = "text-[11px] px-2.5 py-1 rounded-lg font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-800/80 flex items-center gap-1.5";
                if (bmrStatusText) bmrStatusText.innerText = "BMR 24h Atins ✓";
            }
        } else {
            // Below 24h BMR, evaluate relative to hourly circadian BMR and actual real-time expenditure
            const ratioToHourlyExpenditure = realTimeExpended > 0 ? (totalDayCal / realTimeExpended) : 1;

            if (hourFloat < 19 && ratioToHourlyExpenditure >= 0.70 && ratioToHourlyExpenditure <= 1.45) {
                // On track for this time of day
                progressBar.className = "h-full rounded-full transition-all duration-500 bg-gradient-to-r from-teal-500 to-emerald-400 shadow-sm";
                progressStatus.innerHTML = `Ritm optim pentru ora ${formattedTimeStr}! (<strong class="text-emerald-300 font-mono">${totalDayCal} kcal</strong> aport vs ${realTimeExpended} kcal consum total orar: BMR ~${cumulativeBmr}${tefAtHour > 0 ? ` + TEF ${tefAtHour}` : ''}${sportBurnedUpToHour > 0 ? ` + Sport ${sportBurnedUpToHour}` : ''})`;
                if (bmrStatusPill) {
                    bmrStatusPill.className = "text-[11px] px-2.5 py-1 rounded-lg font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-800/80 flex items-center gap-1.5";
                    if (bmrStatusText) bmrStatusText.innerText = `Pe grafic la ora ${formattedTimeStr}`;
                }
            } else if (hourFloat < 19 && ratioToHourlyExpenditure > 1.45) {
                // Energetic reserve ahead of hourly expenditure
                progressBar.className = "h-full rounded-full transition-all duration-500 bg-gradient-to-r from-indigo-500 to-emerald-400 shadow-sm";
                progressStatus.innerHTML = `Rezervă energetică la ora ${formattedTimeStr} (<strong class="text-indigo-300 font-mono">${totalDayCal} kcal</strong> aport vs ${realTimeExpended} kcal consum orar • Balanță: +${realTimeNetBalance} kcal)`;
                if (bmrStatusPill) {
                    bmrStatusPill.className = "text-[11px] px-2.5 py-1 rounded-lg font-semibold bg-indigo-950/80 text-indigo-300 border border-indigo-800/80 flex items-center gap-1.5";
                    if (bmrStatusText) bmrStatusText.innerText = `Rezervă energie (+${realTimeNetBalance} kcal)`;
                }
            } else if (hourFloat >= 19 && totalDayCal < bmr) {
                // Late evening and total day is under 24h BMR
                const diff = bmr - totalDayCal;
                progressBar.className = "h-full rounded-full transition-all duration-500 bg-gradient-to-r from-sky-500 to-indigo-500 shadow-sm";
                progressStatus.innerHTML = `Totalul zilei este sub metabolismul bazal (<strong class="text-sky-300 font-mono">${diff} kcal</strong> rămase până la BMR 24h de ${bmr} kcal)`;
                if (bmrStatusPill) {
                    bmrStatusPill.className = "text-[11px] px-2.5 py-1 rounded-lg font-semibold bg-sky-950/80 text-sky-300 border border-sky-800/80 flex items-center gap-1.5";
                    if (bmrStatusText) bmrStatusText.innerText = `Sub BMR 24h (-${diff} kcal)`;
                }
            } else {
                // Morning/midday with light intake
                progressBar.className = "h-full rounded-full transition-all duration-500 bg-gradient-to-r from-sky-500 to-teal-400 shadow-sm";
                progressStatus.innerHTML = `Aport lejer la ora ${formattedTimeStr} (<strong class="text-sky-300 font-mono">${totalDayCal} kcal</strong> aport vs ${realTimeExpended} kcal consum orar: BMR ~${cumulativeBmr}${sportBurnedUpToHour > 0 ? ` + Sport ${sportBurnedUpToHour}` : ''})`;
                if (bmrStatusPill) {
                    bmrStatusPill.className = "text-[11px] px-2.5 py-1 rounded-lg font-semibold bg-sky-950/80 text-sky-300 border border-sky-800/80 flex items-center gap-1.5";
                    if (bmrStatusText) bmrStatusText.innerText = `Aport lejer (${totalDayCal} kcal)`;
                }
            }
        }
    }
}

// --- Tabbed Settings Navigation ---
window.switchSettingsTab = (tabName) => {
    const tabs = ['ai', 'profile', 'nutrients'];
    tabs.forEach(t => {
        const btn = document.getElementById(`tab-btn-${t}`);
        const content = document.getElementById(`tab-content-${t}`);
        if (t === tabName) {
            if (btn) {
                btn.className = "flex-1 py-2 px-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 bg-indigo-600 text-white shadow";
            }
            if (content) content.classList.remove('hidden');
        } else {
            if (btn) {
                btn.className = "flex-1 py-2 px-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 text-slate-400 hover:text-white";
            }
            if (content) content.classList.add('hidden');
        }
    });

    if (tabName === 'profile') {
        loadUserProfileIntoForm();
        window.recalcProfilePreview();
    } else if (tabName === 'nutrients') {
        const nutToggle = document.getElementById('ai-nutrient-calc-toggle');
        if (nutToggle) nutToggle.checked = Storage.isAiNutrientCalcEnabled();
    }
    refreshIcons();
};

window.openSettingsTab = (tabName) => {
    const modal = document.getElementById('settings-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    window.switchSettingsTab(tabName);
    updateAIVisibility();
};

// --- User Profile & Biometrics Live Recalculation ---
function loadUserProfileIntoForm() {
    const p = Storage.getUserProfile();
    const ageEl = document.getElementById('user-age');
    const genderEl = document.getElementById('user-gender');
    const weightEl = document.getElementById('user-weight');
    const heightEl = document.getElementById('user-height');
    const actEl = document.getElementById('user-activity');
    const goalEl = document.getElementById('user-diet-goal');
    const issuesEl = document.getElementById('user-health-issues');

    if (ageEl) ageEl.value = (p.age !== null && p.age !== undefined) ? p.age : '';
    if (genderEl) genderEl.value = p.gender || '';
    if (weightEl) weightEl.value = (p.weight !== null && p.weight !== undefined) ? p.weight : '';
    if (heightEl) heightEl.value = (p.height !== null && p.height !== undefined) ? p.height : '';
    if (actEl) actEl.value = (p.activityLevel !== null && p.activityLevel !== undefined) ? p.activityLevel : '';
    if (goalEl) goalEl.value = (p.targetDeficit !== null && p.targetDeficit !== undefined) ? p.targetDeficit : '';
    if (issuesEl) {
        const issues = (p.healthIssues && p.healthIssues.length > 0) ? p.healthIssues : Storage.getHealthProfile();
        issuesEl.value = issues.join(', ');
    }
}

window.recalcProfilePreview = () => {
    const ageRaw = document.getElementById('user-age')?.value;
    const gender = document.getElementById('user-gender')?.value || '';
    const weightRaw = document.getElementById('user-weight')?.value;
    const heightRaw = document.getElementById('user-height')?.value;
    const actRaw = document.getElementById('user-activity')?.value;
    const deficitRaw = document.getElementById('user-diet-goal')?.value;

    const age = (ageRaw && !isNaN(ageRaw) && Number(ageRaw) > 0) ? parseInt(ageRaw) : null;
    const weight = (weightRaw && !isNaN(weightRaw) && Number(weightRaw) > 0) ? parseFloat(weightRaw) : null;
    const height = (heightRaw && !isNaN(heightRaw) && Number(heightRaw) > 0) ? parseFloat(heightRaw) : null;
    const activity = (actRaw && !isNaN(actRaw) && Number(actRaw) > 0) ? parseFloat(actRaw) : null;
    const deficit = (deficitRaw !== '' && deficitRaw !== null && !isNaN(deficitRaw)) ? parseInt(deficitRaw) : null;

    const metrics = Storage.calculateMetrics({
        age, gender, weight, height, activityLevel: activity, targetDeficit: deficit
    });

    const imcEl = document.getElementById('calc-imc');
    const imcBadge = document.getElementById('calc-imc-badge');
    const idealEl = document.getElementById('calc-ideal-weight');
    const bmrEl = document.getElementById('calc-bmr');
    const tdeeEl = document.getElementById('calc-tdee');
    const goalBadge = document.getElementById('calc-goal-badge');

    if (imcEl) imcEl.innerText = metrics.imc !== null ? metrics.imc : '-';
    if (imcBadge) {
        imcBadge.innerText = metrics.imcCategory;
        imcBadge.className = `text-[10px] font-semibold ${metrics.imcColor}`;
    }
    if (idealEl) idealEl.innerText = metrics.idealWeight !== null ? `${metrics.idealWeight} kg` : '-';
    if (bmrEl) bmrEl.innerText = metrics.bmr !== null ? `${metrics.bmr} kcal` : '-';
    if (tdeeEl) tdeeEl.innerText = metrics.targetCalories !== null ? `${metrics.targetCalories} kcal` : '-';
    if (goalBadge) {
        if (metrics.targetCalories === null) {
            goalBadge.innerText = "-";
            goalBadge.className = "text-[10px] text-slate-400 font-semibold";
        } else if (deficit === 0 || deficit === null) {
            goalBadge.innerText = "Menținere";
            goalBadge.className = "text-[10px] text-indigo-400 font-semibold";
        } else if (deficit < 0) {
            goalBadge.innerText = `Deficit ${deficit} kcal`;
            goalBadge.className = "text-[10px] text-emerald-400 font-semibold";
        } else {
            goalBadge.innerText = `Surplus +${deficit} kcal`;
            goalBadge.className = "text-[10px] text-amber-400 font-semibold";
        }
    }
};

window.saveUserProfileForm = () => {
    const ageRaw = document.getElementById('user-age')?.value;
    const gender = document.getElementById('user-gender')?.value || '';
    const weightRaw = document.getElementById('user-weight')?.value;
    const heightRaw = document.getElementById('user-height')?.value;
    const actRaw = document.getElementById('user-activity')?.value;
    const deficitRaw = document.getElementById('user-diet-goal')?.value;
    const issuesRaw = document.getElementById('user-health-issues')?.value || '';
    
    const age = (ageRaw && !isNaN(ageRaw) && Number(ageRaw) > 0) ? parseInt(ageRaw) : null;
    const weight = (weightRaw && !isNaN(weightRaw) && Number(weightRaw) > 0) ? parseFloat(weightRaw) : null;
    const height = (heightRaw && !isNaN(heightRaw) && Number(heightRaw) > 0) ? parseFloat(heightRaw) : null;
    const activity = (actRaw && !isNaN(actRaw) && Number(actRaw) > 0) ? parseFloat(actRaw) : null;
    const deficit = (deficitRaw !== '' && deficitRaw !== null && !isNaN(deficitRaw)) ? parseInt(deficitRaw) : null;

    const healthIssues = issuesRaw
        .split(',')
        .map(s => s.trim())
        .filter(s => s.length > 0);

    const profile = {
        age,
        gender,
        weight,
        height,
        activityLevel: activity,
        targetDeficit: deficit,
        healthIssues
    };

    Storage.saveUserProfile(profile);
    healthProfile = healthIssues;
    renderHealthTags();
    window.recalcProfilePreview();
    updateDynamicCaloricGauge();
    alert("Datele personale au fost salvate cu succes!");
};

window.handleAiNutrientCalcChange = (checked) => {
    Storage.setAiNutrientCalcEnabled(checked);
};

window.openSidebar = () => {
    const sb = document.getElementById('analysis-sidebar');
    const ov = document.getElementById('sidebar-overlay');
    if (!sb || !ov) return;
    if (sb.classList.contains('-translate-x-full')) {
        sb.classList.remove('-translate-x-full');
        ov.classList.remove('hidden');
        setTimeout(() => ov.classList.remove('opacity-0'), 10);
    }
};

window.toggleSidebar = () => {
    const sb = document.getElementById('analysis-sidebar');
    const ov = document.getElementById('sidebar-overlay');
    if (!sb || !ov) return;
    if (sb.classList.contains('-translate-x-full')) {
        sb.classList.remove('-translate-x-full');
        ov.classList.remove('hidden');
        setTimeout(() => ov.classList.remove('opacity-0'), 10);
    } else {
        sb.classList.add('-translate-x-full');
        ov.classList.add('opacity-0');
        setTimeout(() => ov.classList.add('hidden'), 300);
    }
};

window.selectFoodForNutrients = (index) => {
    if (selectedFoodNutrientIndex === index) {
        selectedFoodNutrientIndex = -1;
    } else {
        selectedFoodNutrientIndex = index;
    }
    renderCurrentMeal();
    updateAnalysis();
    window.openSidebar();
};

window.clearFoodNutrientFilter = () => {
    selectedFoodNutrientIndex = -1;
    renderCurrentMeal();
    updateAnalysis();
};

window.recalcAllMealNutrientsAI = async () => {
    if (currentMeal.foods.length === 0) {
        alert("Masa este goală. Adaugă mai întâi alimente.");
        return;
    }
    if (!Storage.isAiAvailable()) {
        alert("AI-ul este dezactivat sau cheia API nu este conectată.");
        return;
    }

    const btn = document.getElementById('recalc-all-nutrients-ai-btn');
    const origHTML = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i data-lucide="loader" class="w-3.5 h-3.5 animate-spin"></i> <span class="text-[10px]">Calcul...</span>`;
        refreshIcons();
    }

    try {
        const foodsSummary = currentMeal.foods.map(f => ({
            name: f.name,
            quantity: f.quantity,
            unit: f.unit
        }));

        const prompt = `Analizează complet și riguros fiecare aliment din lista următoare pentru a calcula caloriile și spectrul detaliat de nutrienți:
${JSON.stringify(foodsSummary, null, 2)}

Returnează strict un JSON array cu obiectele actualizate în aceeași ordine:
[
  {
    "name": "string",
    "quantity": number,
    "unit": "string",
    "calories": number,
    "nutrients": [
      {
        "name": "string",
        "type": "Macro" | "Micro",
        "qty": number,
        "unit": "string",
        "rda_percent": number,
        "role": "string"
      }
    ]
  }
]`;

        const txt = await AI.callText(prompt);
        const s = txt.indexOf('[');
        const e = txt.lastIndexOf(']');
        if (s !== -1 && e !== -1) {
            const parsed = JSON.parse(txt.substring(s, e + 1));
            if (Array.isArray(parsed) && parsed.length === currentMeal.foods.length) {
                currentMeal.foods = parsed.map((item, idx) => {
                    const normNuts = normalizeNutrientsArray(item.nutrients || []);
                    const q = parseFloat(item.quantity || currentMeal.foods[idx].quantity) || 1;
                    const u = item.unit || currentMeal.foods[idx].unit || 'g';
                    const cals = parseInt(item.calories) || currentMeal.foods[idx].calories || 0;
                    const fName = (item.name || currentMeal.foods[idx].name).trim();

                    // Auto-save to analyzed foods cache at 100g/unitate
                    const factor = (u === 'buc' || u === 'felie') ? (1 / q) : (100 / q);
                    Storage.saveAnalyzedFood({
                        name: fName,
                        baseQty: (u === 'buc' || u === 'felie') ? 1 : 100,
                        baseUnit: (u === 'buc' || u === 'felie') ? 'buc' : (u === 'ml' ? 'ml' : 'g'),
                        calories: Math.round(cals * factor),
                        nutrients: normNuts.map(n => ({
                            ...n,
                            qty: parseFloat((n.qty * factor).toFixed(2))
                        })),
                        source: 'AI (Gemini)'
                    });

                    return {
                        name: fName,
                        quantity: q,
                        unit: u,
                        calories: cals,
                        nutrients: normNuts
                    };
                });

                const statusEl = document.getElementById('data-source-msg');
                if (statusEl) statusEl.innerHTML = `<span class="text-emerald-400 font-bold">✨ Nutrienți recalculați cu AI & Salvați în Baza Locală!</span>`;
            } else if (Array.isArray(parsed) && parsed.length > 0) {
                parsed.forEach((item, idx) => {
                    if (currentMeal.foods[idx]) {
                        currentMeal.foods[idx].calories = parseInt(item.calories) || currentMeal.foods[idx].calories;
                        currentMeal.foods[idx].nutrients = normalizeNutrientsArray(item.nutrients || currentMeal.foods[idx].nutrients);
                    }
                });
            }
        }
        renderCurrentMeal();
        updateAnalysis();
        updateDynamicCaloricGauge();
        updateAIVisibility();
    } catch (e) {
        alert("Eroare la recalcularea AI a nutrienților: " + e.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = origHTML;
            refreshIcons();
        }
    }
};

window.toggleChat = () => {
    const win = document.getElementById('chat-window');
    if (!win) return;
    if (win.classList.contains('hidden')) {
        win.classList.remove('hidden');
        setTimeout(() => win.classList.add('chat-visible'), 10);
    } else {
        win.classList.remove('chat-visible');
        setTimeout(() => win.classList.add('hidden'), 300);
    }
};

window.handleAiToggleChange = (checked) => {
    Storage.setAiEnabled(checked);
    updateAIVisibility();
};

export function updateAIVisibility() {
    const isAvailable = Storage.isAiAvailable();
    const isEnabled = Storage.isAiEnabled();
    const hasKey = !!Storage.getApiKey().trim();

    // 1. Header Shopping List Button (Removed)

    // 2. Meal Editor Buttons: Generator & Camera
    const genBtn = document.getElementById('gen-btn');
    if (genBtn) {
        if (isAvailable) genBtn.classList.remove('hidden');
        else genBtn.classList.add('hidden');
    }

    const camBtn = document.getElementById('cam-btn');
    if (camBtn) {
        if (isAvailable) camBtn.classList.remove('hidden');
        else camBtn.classList.add('hidden');
    }

    // 3. AI Smart Actions Panel (Chef Mode, Nutri Coach, Meniu Medical)
    const actionsPanel = document.getElementById('ai-actions-panel');
    if (actionsPanel) {
        if (isAvailable && currentMeal.foods.length > 0) {
            actionsPanel.classList.remove('hidden');
        } else {
            actionsPanel.classList.add('hidden');
        }
    }

    // 4. Floating Chat Button & Chat Window
    const chatBtn = document.getElementById('floating-chat-btn');
    if (chatBtn) {
        if (isAvailable) chatBtn.classList.remove('hidden');
        else {
            chatBtn.classList.add('hidden');
            const chatWin = document.getElementById('chat-window');
            if (chatWin && !chatWin.classList.contains('hidden')) {
                chatWin.classList.remove('chat-visible');
                chatWin.classList.add('hidden');
            }
        }
    }

    // 5. Nutrient Modal AI Section
    const nutAiSection = document.getElementById('nutrient-ai-section');
    if (nutAiSection) {
        if (isAvailable) nutAiSection.classList.remove('hidden');
        else nutAiSection.classList.add('hidden');
    }

    // 6. Refresh Nutrients AI Button in Sidebar
    const recalcNutBtn = document.getElementById('recalc-all-nutrients-ai-btn');
    if (recalcNutBtn) {
        if (isAvailable && currentMeal.foods.length > 0) {
            recalcNutBtn.classList.remove('hidden');
        } else {
            recalcNutBtn.classList.add('hidden');
        }
    }

    // 7. Header Settings Indicator Dot
    const ind = document.getElementById('api-key-indicator');
    if (ind) {
        if (!isEnabled) {
            ind.className = 'w-2 h-2 rounded-full bg-slate-500 border border-slate-900 ml-0.5';
            ind.title = 'AI Dezactivat';
        } else if (isAvailable) {
            ind.className = 'w-2 h-2 rounded-full bg-emerald-500 border border-slate-900 ml-0.5';
            ind.title = 'AI Conectat';
        } else {
            ind.className = 'w-2 h-2 rounded-full bg-red-500 animate-pulse border border-slate-900 ml-0.5';
            ind.title = hasKey ? 'AI Neconectat (necesită testare)' : 'Lipsă Cheie API';
        }
    }

    // 8. Settings Modal Controls & Connection Badge
    const toggleEl = document.getElementById('ai-enabled-toggle');
    if (toggleEl) {
        toggleEl.checked = isEnabled;
    }

    const aiConfigSection = document.getElementById('ai-config-section');
    if (aiConfigSection) {
        if (isEnabled) {
            aiConfigSection.classList.remove('opacity-40', 'pointer-events-none');
        } else {
            aiConfigSection.classList.add('opacity-40', 'pointer-events-none');
        }
    }

    const statusBadge = document.getElementById('ai-connection-status-badge');
    if (statusBadge) {
        if (!isEnabled) {
            statusBadge.className = 'p-3 rounded-xl text-xs font-medium bg-slate-800/80 text-slate-400 border border-slate-700 flex items-center gap-2.5';
            statusBadge.innerHTML = `<i data-lucide="power-off" class="w-4 h-4 text-slate-400 shrink-0"></i> <span>Folosirea AI este <strong>Dezactivată</strong>. Aplicația funcționează 100% offline.</span>`;
        } else if (isAvailable) {
            const activeModel = Storage.getActiveModel() || Storage.getTargetModel();
            statusBadge.className = 'p-3 rounded-xl text-xs font-medium bg-emerald-950/50 text-emerald-300 border border-emerald-800/70 flex items-center gap-2.5';
            statusBadge.innerHTML = `<i data-lucide="check-circle-2" class="w-4 h-4 text-emerald-400 shrink-0"></i> <span>Conexiune activă la Google Gemini (<strong>${activeModel}</strong>).</span>`;
        } else if (!hasKey) {
            statusBadge.className = 'p-3 rounded-xl text-xs font-medium bg-amber-950/40 text-amber-300 border border-amber-800/60 flex items-center gap-2.5';
            statusBadge.innerHTML = `<i data-lucide="key" class="w-4 h-4 text-amber-400 shrink-0"></i> <span>Nu este introdusă cheia API Gemini. Introdu cheia mai jos.</span>`;
        } else {
            statusBadge.className = 'p-3 rounded-xl text-xs font-medium bg-rose-950/40 text-rose-300 border border-rose-800/60 flex items-center gap-2.5';
            statusBadge.innerHTML = `<i data-lucide="alert-triangle" class="w-4 h-4 text-rose-400 shrink-0"></i> <span>Conexiunea nu este stabilită. Apasă <strong>Salvează & Conectează</strong> pentru testare.</span>`;
        }
    }

    // Nutrient calculation toggle
    const nutToggle = document.getElementById('ai-nutrient-calc-toggle');
    if (nutToggle) {
        nutToggle.checked = Storage.isAiNutrientCalcEnabled();
    }

    // 8. Meal Name Field Label (Dynamic based on AI)
    const mealLabel = document.getElementById('meal-name-label');
    if (mealLabel) {
        if (isAvailable) {
            mealLabel.innerText = "Nume masă, preparat sau poză";
        } else {
            mealLabel.innerText = "Nume masă";
        }
    }

    refreshIcons();
}

window.toggleSettings = () => {
    const modal = document.getElementById('settings-modal');
    if (!modal) return;
    modal.classList.toggle('hidden');
    if (!modal.classList.contains('hidden')) {
        document.getElementById('api-key-input').value = Storage.getApiKey();
        const errEl = document.getElementById('api-key-error');
        if (errEl) errEl.classList.add('hidden');
        
        const selectedType = Storage.getSelectedModelType();
        const modelSelect = document.getElementById('model-select');
        if (modelSelect) {
            modelSelect.value = selectedType;
            window.handleModelSelectChange(selectedType);
        }
        const customInput = document.getElementById('custom-model-input');
        if (customInput) {
            customInput.value = Storage.getCustomModelName();
        }
        loadUserProfileIntoForm();
        window.recalcProfilePreview();
        updateAIVisibility();
    }
};

window.showAIModal = (title, content, iconName = 'sparkles') => {
    const m = document.getElementById('ai-result-modal');
    const t = document.getElementById('ai-modal-title');
    const c = document.getElementById('ai-modal-content');
    
    t.innerHTML = `<i data-lucide="${iconName}" class="w-6 h-6 text-indigo-400"></i> ${title}`;
    let formatted = content
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/^# (.*$)/gim, '<h1>$1</h1>')
        .replace(/^## (.*$)/gim, '<h2>$1</h2>')
        .replace(/^### (.*$)/gim, '<h3>$1</h3>')
        .replace(/^\* (.*$)/gim, '<ul><li>$1</li></ul>')
        .replace(/\n/g, '<br>');
    formatted = formatted.replace(/<\/ul><br><ul>/g, '');
    c.innerHTML = formatted;
    m.classList.remove('hidden');
    refreshIcons();
};

// --- Health Profile ---
function renderHealthTags() {
    const container = document.getElementById('health-tags');
    if (!container) return;
    container.innerHTML = '';
    healthProfile = Storage.getHealthProfile();
    
    if (healthProfile.length === 0) {
        container.innerHTML = `<span class="text-[10px] text-slate-500 italic">Nicio analiză încărcată.</span>`;
        return;
    }
    
    healthProfile.forEach(issue => {
        const tag = document.createElement('span');
        tag.className = "bg-rose-900/40 text-rose-300 border border-rose-800 text-[10px] px-2 py-0.5 rounded";
        tag.innerText = issue;
        container.appendChild(tag);
    });
}

// --- Current Meal Rendering & Macros Calculation ---
function renderCurrentMeal() {
    const c = document.getElementById('current-meal-list');
    const btn = document.getElementById('save-meal-btn');
    if (!c || !btn) return;
    
    c.innerHTML = '';
    if (currentMeal.foods.length === 0) {
        btn.disabled = true;
        c.innerHTML = `<div class="text-center py-6 text-slate-600 text-sm border-2 border-dashed border-slate-800 rounded-lg">Masa este goală.</div>`;
        return;
    }
    
    btn.disabled = false;
    currentMeal.foods.forEach((f, i) => {
        const d = document.createElement('div');
        d.className = `flex justify-between items-center p-3 rounded-lg border transition-all ${i === editingFoodIndex ? 'bg-indigo-900/30 border-indigo-500 shadow-md' : 'bg-slate-800 border-slate-700'}`;
        
        const isNutrientSelected = (selectedFoodNutrientIndex === i);
        const kcalBadgeClass = isNutrientSelected 
            ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold ring-2 ring-purple-400 shadow-lg shadow-purple-900/50 scale-105' 
            : 'bg-slate-700 hover:bg-indigo-600 text-white hover:text-white';

        d.innerHTML = `
            <div class="flex items-center gap-3 overflow-hidden">
                <button type="button" onclick="selectFoodForNutrients(${i})" class="${kcalBadgeClass} text-xs font-mono font-bold p-2 rounded min-w-[3.8rem] text-center cursor-pointer transition-all active:scale-95" title="Click pentru a filtra nutrienții doar pentru acest aliment">
                    ${f.calories} kcal
                </button>
                <div class="min-w-0">
                    <p class="font-bold text-white text-sm truncate">${f.name}</p>
                    <p class="text-xs text-slate-400 truncate">${f.quantity} ${f.unit}</p>
                </div>
            </div>
            <div class="flex gap-1">
                ${i !== editingFoodIndex ? `<button onclick="loadFoodForEdit(${i})" class="p-2 text-indigo-400 hover:bg-indigo-900/30 rounded transition-colors" title="Modifică"><i data-lucide="edit-3" class="w-4 h-4"></i></button>` : ''}
                <button onclick="removeFood(${i})" class="p-2 text-slate-500 hover:text-red-400 rounded transition-colors" title="Șterge"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
            </div>
        `;
        c.appendChild(d);
    });
    updateDynamicCaloricGauge();
    refreshIcons();
}

function updateAnalysis() {
    const list = document.getElementById('nutrients-list');
    const sum = document.getElementById('macro-summary');
    const subtitle = document.getElementById('nutrients-view-subtitle');
    const banner = document.getElementById('food-filter-banner');
    const bannerFoodName = document.getElementById('filtered-food-name');
    if (!list || !sum) return;
    
    list.innerHTML = '';
    if (currentMeal.foods.length === 0) {
        sum.classList.add('hidden');
        if (banner) banner.classList.add('hidden');
        if (subtitle) subtitle.innerText = "Calcul cantitativ și procent DZR.";
        selectedFoodNutrientIndex = -1;
        list.innerHTML = `
            <div class="flex flex-col items-center justify-center h-full text-slate-600 opacity-60">
                <i data-lucide="pie-chart" class="w-16 h-16 mb-4"></i>
                <p class="text-sm">Adaugă alimente pentru calcul nutrițional...</p>
            </div>
        `;
        refreshIcons();
        return;
    }
    
    sum.classList.remove('hidden');

    // Check if filtering by a single selected food
    const isSingleFoodMode = (selectedFoodNutrientIndex >= 0 && currentMeal.foods[selectedFoodNutrientIndex]);
    const targetFoods = isSingleFoodMode ? [currentMeal.foods[selectedFoodNutrientIndex]] : currentMeal.foods;

    if (isSingleFoodMode) {
        const selFood = currentMeal.foods[selectedFoodNutrientIndex];
        if (subtitle) subtitle.innerText = `Nutrienți exclusiv pentru: ${selFood.name}`;
        if (banner) {
            banner.classList.remove('hidden');
            if (bannerFoodName) bannerFoodName.innerText = `${selFood.name} (${selFood.quantity} ${selFood.unit} • ${selFood.calories} kcal)`;
        }
    } else {
        if (subtitle) subtitle.innerText = "Calcul cantitativ și procent DZR pentru toată masa.";
        if (banner) banner.classList.add('hidden');
    }

    const agg = {};
    let tp = 0, tc = 0, tf = 0;
    
    targetFoods.forEach(f => {
        if (!f.nutrients) f.nutrients = [];
        f.nutrients.forEach(n => {
            const rawName = n.name || 'Altele';
            const canonName = normalizeNutrientName(rawName);
            const def = CANONICAL_NUTRIENTS[canonName];

            if (!agg[canonName]) {
                agg[canonName] = {
                    name: canonName,
                    type: def ? def.type : (n.type || 'Micro'),
                    unit: def ? def.unit : (n.unit || 'g'),
                    role: def ? def.role : (n.role || ''),
                    qty: 0,
                    rda_percent: 0,
                    sources: []
                };
            }
            const q = parseFloat(n.qty) || 0;
            agg[canonName].qty += q;
            const rda = def ? def.rda : 100;
            agg[canonName].rda_percent = Math.round((agg[canonName].qty / rda) * 100);
            agg[canonName].sources.push({ foodName: f.name, foodQty: q });
            
            const nLower = canonName.toLowerCase();
            if (nLower.includes('prot')) tp += q;
            if (nLower.includes('carb') || nLower.includes('gluc')) tc += q;
            if (nLower.includes('grăs') || nLower.includes('gras') || nLower.includes('lipid') || nLower.includes('fat')) tf += q;
        });
    });
    
    document.getElementById('total-pro').innerText = tp.toFixed(0) + 'g';
    document.getElementById('total-carb').innerText = tc.toFixed(0) + 'g';
    document.getElementById('total-fat').innerText = tf.toFixed(0) + 'g';
    
    const nutrientItems = Object.values(agg).sort((a, b) => b.rda_percent - a.rda_percent);

    if (nutrientItems.length === 0) {
        list.innerHTML = `
            <div class="text-center py-8 text-slate-500 text-xs">
                <i data-lucide="info" class="w-6 h-6 mx-auto mb-2 text-slate-600"></i>
                <span>Niciun nutrient detaliat pentru acest aliment. Folosește butonul AI Refresh pentru a genera analiza.</span>
            </div>
        `;
        refreshIcons();
        return;
    }

    nutrientItems.forEach(n => {
        const p = Math.min(n.rda_percent, 100);
        const btn = document.createElement('button');
        btn.className = "w-full text-left p-3 rounded-lg hover:bg-slate-800 border border-transparent hover:border-slate-700 transition-all";
        btn.onclick = () => window.openNutrientDetail(n);
        btn.innerHTML = `
            <div class="flex justify-between items-end mb-1">
                <div>
                    <div class="font-bold text-slate-200 text-sm">${n.name}</div>
                    <div class="text-[10px] text-slate-500 uppercase font-bold">${n.type || 'Nutrient'}</div>
                </div>
                <div class="text-right">
                    <div class="font-mono text-sm text-white font-bold">${n.qty.toFixed(1)} ${n.unit || 'g'}</div>
                    <div class="text-[10px] ${n.rda_percent > 100 ? 'text-orange-400' : 'text-slate-500'} font-bold">${n.rda_percent.toFixed(0)}% DZR</div>
                </div>
            </div>
            <div class="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                <div class="bg-indigo-500 h-full rounded-full transition-all duration-500" style="width:${p}%"></div>
            </div>
        `;
        list.appendChild(btn);
    });
    refreshIcons();
}

// --- Interactive Food Autocomplete & Suggestions System ---
let currentFoodSuggestions = [];
let activeSuggestionIdx = -1;

export function getFoodSuggestions(query) {
    if (!query || typeof query !== 'string') return [];
    const qClean = removeDiacritics(query);
    if (!qClean || qClean.length < 1) return [];

    const suggestionsMap = new Map();

    // 1. Check Analyzed Foods DB (Smart Local AI Database - highest priority)
    const analyzed = Storage.getAnalyzedFoods();
    analyzed.forEach(f => {
        if (!f || !f.name) return;
        const norm = removeDiacritics(f.name);
        if (norm.includes(qClean) || qClean.includes(norm)) {
            const isExact = (norm === qClean);
            const isPrefix = norm.startsWith(qClean);
            suggestionsMap.set(norm, {
                name: f.name,
                baseQty: f.baseQty || 100,
                baseUnit: f.baseUnit || 'g',
                calories: f.calories || 0,
                nutrientsCount: (f.nutrients || []).length,
                source: 'AI',
                priority: isExact ? 1 : (isPrefix ? 2 : 3)
            });
        }
    });

    // 2. Check Previous Meals History
    const meals = Storage.getMeals();
    meals.forEach(m => {
        (m.foods || []).forEach(f => {
            if (!f || !f.name) return;
            const norm = removeDiacritics(f.name);
            if ((norm.includes(qClean) || qClean.includes(norm)) && !suggestionsMap.has(norm)) {
                const isExact = (norm === qClean);
                const isPrefix = norm.startsWith(qClean);
                const qty = parseFloat(f.quantity) || 100;
                const unit = f.unit || 'g';
                const uNorm = removeDiacritics(unit);
                const isPiece = (uNorm.includes('buc') || uNorm.includes('feli') || uNorm.includes('ou') || uNorm.includes('porti'));
                const baseQty = isPiece ? 1 : 100;
                const baseUnit = isPiece ? 'buc' : (uNorm === 'ml' ? 'ml' : 'g');
                const factor = isPiece ? (1 / qty) : (100 / qty);

                suggestionsMap.set(norm, {
                    name: f.name,
                    baseQty: baseQty,
                    baseUnit: baseUnit,
                    calories: Math.round((f.calories || 0) * factor),
                    nutrientsCount: (f.nutrients || []).length,
                    source: 'Istoric',
                    priority: isExact ? 4 : (isPrefix ? 5 : 6)
                });
            }
        });
    });

    // 3. Check Baseline localFoodDB
    for (const [key, val] of Object.entries(localFoodDB)) {
        if (key === 'default') continue;
        const norm = removeDiacritics(key);
        if ((norm.includes(qClean) || qClean.includes(norm)) && !suggestionsMap.has(norm)) {
            const isExact = (norm === qClean);
            const isPrefix = norm.startsWith(qClean);
            const displayName = key.charAt(0).toUpperCase() + key.slice(1);
            suggestionsMap.set(norm, {
                name: displayName,
                baseQty: 100,
                baseUnit: 'g',
                calories: val.cal || 0,
                nutrientsCount: 0,
                source: 'Local',
                priority: isExact ? 7 : (isPrefix ? 8 : 9)
            });
        }
    }

    const results = Array.from(suggestionsMap.values());
    results.sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return a.name.length - b.name.length;
    });

    return results.slice(0, 8);
}

window.renderFoodSuggestions = (query) => {
    const dropdown = document.getElementById('food-suggestions-dropdown');
    if (!dropdown) return;

    const list = getFoodSuggestions(query);
    currentFoodSuggestions = list;
    activeSuggestionIdx = -1;

    if (list.length === 0) {
        dropdown.classList.add('hidden');
        dropdown.innerHTML = '';
        return;
    }

    dropdown.innerHTML = list.map((item, idx) => {
        const baseLabel = `${item.baseQty}${item.baseUnit}`;
        const sourceBadge = item.source === 'AI'
            ? `<span class="text-[9px] px-1.5 py-0.2 rounded bg-indigo-950 text-indigo-300 border border-indigo-800 font-semibold flex items-center gap-1 shrink-0"><i data-lucide="sparkles" class="w-2.5 h-2.5 text-indigo-400"></i> Bază AI (${item.nutrientsCount})</span>`
            : (item.source === 'Istoric'
                ? `<span class="text-[9px] px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-semibold shrink-0">Istoric</span>`
                : `<span class="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700 font-semibold shrink-0">⚡ Local</span>`);

        return `
            <div id="food-suggestion-item-${idx}" 
                 onmousedown="event.preventDefault(); window.selectFoodSuggestion(${idx})"
                 class="px-3 py-2 cursor-pointer hover:bg-indigo-950/60 active:bg-indigo-900/80 transition-colors flex items-center justify-between gap-2 group border-l-2 border-transparent">
                <div class="flex items-center gap-2 min-w-0">
                    <i data-lucide="utensils" class="w-3.5 h-3.5 text-slate-500 group-hover:text-indigo-400 shrink-0 transition-colors"></i>
                    <span class="text-xs font-semibold text-white group-hover:text-indigo-200 truncate">${item.name}</span>
                    ${sourceBadge}
                </div>
                <div class="text-right shrink-0">
                    <span class="font-mono text-[11px] font-bold text-slate-300 group-hover:text-white">${item.calories} kcal/${baseLabel}</span>
                </div>
            </div>
        `;
    }).join('');

    dropdown.classList.remove('hidden');
    refreshIcons();
};

window.selectFoodSuggestion = (index) => {
    const item = currentFoodSuggestions[index];
    if (!item) return;

    const nameInput = document.getElementById('food-name');
    const qtyInput = document.getElementById('food-qty');
    const unitSelect = document.getElementById('food-unit');
    const dropdown = document.getElementById('food-suggestions-dropdown');

    if (nameInput) {
        nameInput.value = item.name;
    }
    if (unitSelect && item.baseUnit) {
        const opts = Array.from(unitSelect.options).map(o => o.value);
        if (opts.includes(item.baseUnit)) {
            unitSelect.value = item.baseUnit;
        } else if (item.baseUnit.includes('buc') || item.baseUnit.includes('feli')) {
            unitSelect.value = 'buc';
        }
    }
    if (qtyInput) {
        if (!qtyInput.value || parseFloat(qtyInput.value) <= 0) {
            qtyInput.value = item.baseQty || (item.baseUnit === 'buc' ? 1 : 100);
        }
    }

    if (dropdown) {
        dropdown.classList.add('hidden');
        dropdown.innerHTML = '';
    }
    currentFoodSuggestions = [];
    activeSuggestionIdx = -1;

    // Focus and select quantity for fast one-press confirmation
    if (qtyInput) {
        qtyInput.focus();
        qtyInput.select();
    }
};

window.closeFoodSuggestions = () => {
    const dropdown = document.getElementById('food-suggestions-dropdown');
    if (dropdown) {
        dropdown.classList.add('hidden');
    }
    currentFoodSuggestions = [];
    activeSuggestionIdx = -1;
};

function updateActiveSuggestionHighlight() {
    currentFoodSuggestions.forEach((_, idx) => {
        const el = document.getElementById(`food-suggestion-item-${idx}`);
        if (!el) return;
        if (idx === activeSuggestionIdx) {
            el.className = "px-3 py-2 cursor-pointer bg-indigo-950/90 text-indigo-200 transition-colors flex items-center justify-between gap-2 border-l-2 border-indigo-500 shadow-sm";
            el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        } else {
            el.className = "px-3 py-2 cursor-pointer hover:bg-indigo-950/60 active:bg-indigo-900/80 transition-colors flex items-center justify-between gap-2 group border-l-2 border-transparent";
        }
    });
}

function initFoodSuggestionsEvents() {
    const nameInput = document.getElementById('food-name');
    const qtyInput = document.getElementById('food-qty');

    if (nameInput) {
        nameInput.addEventListener('input', (e) => {
            window.renderFoodSuggestions(e.target.value);
        });

        nameInput.addEventListener('focus', (e) => {
            if (e.target.value.trim().length > 0) {
                window.renderFoodSuggestions(e.target.value);
            }
        });

        nameInput.addEventListener('keydown', (e) => {
            const dropdown = document.getElementById('food-suggestions-dropdown');
            const isOpen = dropdown && !dropdown.classList.contains('hidden') && currentFoodSuggestions.length > 0;

            if (e.key === 'ArrowDown') {
                if (isOpen) {
                    e.preventDefault();
                    activeSuggestionIdx = (activeSuggestionIdx + 1) % currentFoodSuggestions.length;
                    updateActiveSuggestionHighlight();
                } else if (nameInput.value.trim().length > 0) {
                    window.renderFoodSuggestions(nameInput.value);
                }
            } else if (e.key === 'ArrowUp') {
                if (isOpen) {
                    e.preventDefault();
                    activeSuggestionIdx = (activeSuggestionIdx - 1 + currentFoodSuggestions.length) % currentFoodSuggestions.length;
                    updateActiveSuggestionHighlight();
                }
            } else if (e.key === 'Enter') {
                if (isOpen && activeSuggestionIdx >= 0) {
                    e.preventDefault();
                    window.selectFoodSuggestion(activeSuggestionIdx);
                } else {
                    e.preventDefault();
                    window.closeFoodSuggestions();
                    window.processFoodItem();
                }
            } else if (e.key === 'Escape') {
                window.closeFoodSuggestions();
            }
        });

        nameInput.addEventListener('blur', () => {
            // Delay so click on suggestion registers first
            setTimeout(() => {
                window.closeFoodSuggestions();
            }, 200);
        });
    }

    if (qtyInput) {
        qtyInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                window.processFoodItem();
            }
        });
    }

    document.addEventListener('click', (e) => {
        const nameInputEl = document.getElementById('food-name');
        const dropdownEl = document.getElementById('food-suggestions-dropdown');
        if (dropdownEl && !dropdownEl.contains(e.target) && nameInputEl !== e.target) {
            window.closeFoodSuggestions();
        }
    });
}

// --- Form & Food Item Editing ---
window.processFoodItem = async () => {
    const name = document.getElementById('food-name').value.trim();
    const qty = parseFloat(document.getElementById('food-qty').value);
    const unit = document.getElementById('food-unit').value;
    const btn = document.getElementById('add-btn');
    
    if (!name || isNaN(qty) || qty <= 0) return alert("Completează un nume valid și o cantitate pozitivă.");
    
    btn.disabled = true;
    const originalText = btn.innerHTML;
    btn.innerHTML = `<i data-lucide="loader" class="w-4 h-4 animate-spin"></i>`;
    refreshIcons();

    // Fast-path for editing existing item with same proportions
    if (editingFoodIndex > -1) {
        const oldFood = currentMeal.foods[editingFoodIndex];
        if (removeDiacritics(oldFood.name) === removeDiacritics(name) && removeDiacritics(oldFood.unit) === removeDiacritics(unit)) {
            const factor = qty / (oldFood.quantity || 1);
            const newNutrients = normalizeNutrientsArray((oldFood.nutrients || []).map(n => ({
                ...n,
                qty: parseFloat((n.qty * factor).toFixed(2))
            })));
            currentMeal.foods[editingFoodIndex] = {
                ...oldFood,
                quantity: qty,
                calories: Math.round(oldFood.calories * factor),
                nutrients: newNutrients
            };
            finishProcessing(originalText, btn, "Recalculat local");
            return;
        }
    }

    let resultData = null;
    let source = 'Local';
    let cachedFood = null;

    // 1. PRIORITY 1: Check Analyzed Foods Local Database (Zero latency & Offline)
    cachedFood = Storage.findAnalyzedFood(name);
    if (cachedFood) {
        resultData = Storage.calculateFoodFromBase(cachedFood, qty, unit);
        source = 'LocalCache';
    }

    // 2. PRIORITY 2: Try AI analysis if not in local cache, AI is available & enabled
    if (!resultData && Storage.isAiAvailable() && Storage.isAiNutrientCalcEnabled()) {
        const sourceMsg = document.getElementById('data-source-msg');
        if (sourceMsg) {
            sourceMsg.innerHTML = `
                <span class="text-indigo-400 font-semibold animate-pulse">⏳ Analiză AI pentru ${name}...</span>
                <button type="button" onclick="cancelCurrentAIAction()" class="ml-2 px-2 py-0.5 bg-rose-600 hover:bg-rose-500 text-white rounded text-[10px] font-bold shadow-sm active:scale-95">
                    Oprește
                </button>
            `;
        }

        try {
            const prompt = `Ești expert nutriționist. Analizează alimentul: "${qty} ${unit} de ${name}".
Folosește strict denumiri canonice standardizate pentru nutrienți (ex: "Vitamina B9 (Acid folic)", "Vitamina B12 (Cobalamină)", "Vitamina C (Acid ascorbic)", "Fier", "Calciu", "Magneziu", "Potasiu", "Zinc", etc.).

Returnează STRICT JSON valid:
{
  "calories": number,
  "nutrients": [
    {
      "name": "string",
      "type": "Macro" | "Micro",
      "qty": number,
      "unit": "g" | "mg" | "µg",
      "rda_percent": number,
      "role": "string"
    }
  ]
}`;
            const txt = await AI.callText(prompt, { timeoutMs: 18000 });
            const s = txt.indexOf('{'), e = txt.lastIndexOf('}');
            if (s !== -1 && e !== -1) {
                const aiParsed = JSON.parse(txt.substring(s, e + 1));
                const normNuts = normalizeNutrientsArray(aiParsed.nutrients || []);
                const cals = parseInt(aiParsed.calories) || 0;

                resultData = {
                    calories: cals,
                    nutrients: normNuts
                };
                source = 'AI';

                // Auto-save normalized food to Analyzed Food Database (standardized at 100g/unitate)
                const factor = (unit === 'buc' || unit === 'felie') ? (1 / qty) : (100 / qty);
                Storage.saveAnalyzedFood({
                    name: name,
                    baseQty: (unit === 'buc' || unit === 'felie') ? 1 : 100,
                    baseUnit: (unit === 'buc' || unit === 'felie') ? 'buc' : (unit === 'ml' ? 'ml' : 'g'),
                    calories: Math.round(cals * factor),
                    nutrients: normNuts.map(n => ({
                        ...n,
                        qty: parseFloat((n.qty * factor).toFixed(2))
                    })),
                    source: 'AI (Gemini)'
                });
            }
        } catch (e) {
            console.warn("AI analysis interrupted or failed, falling back to local estimator:", e);
        }
    }

    // 3. FALLBACK: Estimate locally from baseline DB
    if (!resultData) {
        resultData = estimateFoodLocally(name, qty, unit);
        if (source !== 'LocalCache') source = 'Local';
    }

    if (!resultData.nutrients) resultData.nutrients = [];
    resultData.nutrients = normalizeNutrientsArray(resultData.nutrients);

    const newFood = {
        name,
        quantity: qty,
        unit,
        calories: resultData.calories,
        nutrients: resultData.nutrients
    };

    if (editingFoodIndex > -1) {
        currentMeal.foods[editingFoodIndex] = newFood;
    } else {
        currentMeal.foods.push(newFood);
    }

    let statusHtml = `<span class="text-yellow-500">⚡ Estimare Locală</span>`;
    if (source === 'LocalCache') {
        statusHtml = `<span class="text-indigo-400 font-bold" title="Calculat din dicționarul AI salvat pe dispozitiv">⚡ Din Baza Locală AI (${cachedFood?.lastAnalyzed || 'Salvată'})</span>`;
    } else if (source === 'AI') {
        statusHtml = `<span class="text-emerald-400 font-bold">✨ Analizat cu Gemini & Salvat în Baza Locală</span>`;
    }

    finishProcessing(originalText, btn, statusHtml);
};

function finishProcessing(originalText, btn, msg) {
    btn.innerHTML = originalText;
    btn.disabled = false;
    document.getElementById('data-source-msg').innerHTML = msg || "";
    document.getElementById('food-name').value = '';
    document.getElementById('food-qty').value = '';
    window.closeFoodSuggestions();
    exitFoodEditMode();
    renderCurrentMeal();
    updateAnalysis();
    updateDynamicCaloricGauge();
    if (currentMeal.foods.length > 0 && Storage.isAiAvailable()) {
        document.getElementById('ai-actions-panel').classList.remove('hidden');
    } else {
        document.getElementById('ai-actions-panel').classList.add('hidden');
    }
    refreshIcons();
}

window.loadFoodForEdit = (i) => {
    const f = currentMeal.foods[i];
    editingFoodIndex = i;
    document.getElementById('food-name').value = f.name;
    document.getElementById('food-qty').value = f.quantity;
    document.getElementById('food-unit').value = f.unit;
    document.getElementById('edit-mode-indicator').classList.remove('hidden');
    const btn = document.getElementById('add-btn');
    btn.innerHTML = '<i data-lucide="check" class="w-4 h-4"></i>';
    btn.className = "w-full bg-orange-500 hover:bg-orange-600 text-white py-2 rounded-lg font-bold transition-all shadow-lg";
    refreshIcons();
};

function exitFoodEditMode() {
    editingFoodIndex = -1;
    document.getElementById('edit-mode-indicator').classList.add('hidden');
    const btn = document.getElementById('add-btn');
    btn.innerHTML = '<i data-lucide="plus" class="w-4 h-4"></i><span class="md:hidden">Adaugă</span>';
    btn.className = "w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg font-bold transition-all shadow-lg flex items-center justify-center gap-2";
    refreshIcons();
}

let mealVoicePendingFood = '';
let lastProcessedSpeechIndex = -1;

// --- Voice Food Input (Instant 0ms Local NLP & Multi-food parsing) ---
window.toggleMealVoiceInput = () => {
    if (isMealVoiceActive) {
        window.stopMealVoiceInput();
        return;
    }

    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        alert("Recunoașterea vocală nu este suportată în acest browser. Recomandăm Google Chrome sau Microsoft Edge.");
        return;
    }

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    try {
        mealVoiceRecognition = new SR();
        mealVoiceRecognition.lang = 'ro-RO';
        mealVoiceRecognition.continuous = true;
        mealVoiceRecognition.interimResults = true;
        mealVoiceRecognition.maxAlternatives = 1;
        mealVoicePendingFood = '';
        lastProcessedSpeechIndex = -1;

        const btn = document.getElementById('meal-voice-btn');
        const icon = document.getElementById('meal-voice-icon');
        const text = document.getElementById('meal-voice-text');
        const statusBanner = document.getElementById('voice-live-status');
        const preview = document.getElementById('voice-transcript-preview');

        mealVoiceRecognition.onstart = () => {
            isMealVoiceActive = true;
            if (btn) {
                btn.className = "px-2.5 py-1.5 rounded-lg font-bold text-xs bg-rose-950/80 text-rose-300 border border-rose-600/80 shadow-lg flex items-center gap-1.5 transition-all animate-pulse";
            }
            if (icon) icon.className = "w-3.5 h-3.5 text-rose-400";
            if (text) text.innerText = "Ascult...";
            if (statusBanner) statusBanner.classList.remove('hidden');
            if (preview) preview.innerText = "Te ascult... spune alimentul și unitatea (ex: „pâine 100g” sau „două ouă”)";
            refreshIcons();
        };

        mealVoiceRecognition.onresult = (event) => {
            if (!event.results) return;

            let interimTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                const item = event.results[i];
                const transcript = item[0].transcript;

                if (item.isFinal) {
                    if (i > lastProcessedSpeechIndex) {
                        lastProcessedSpeechIndex = i;
                        handleVoiceFoodFinalTranscript(transcript.trim());
                    }
                } else {
                    interimTranscript += transcript;
                }
            }

            if (interimTranscript && preview) {
                if (mealVoicePendingFood) {
                    preview.innerText = `⏳ „${mealVoicePendingFood}” + „${interimTranscript}”`;
                } else {
                    preview.innerText = `🎤 „${interimTranscript}”`;
                }
            }
        };

        mealVoiceRecognition.onerror = (err) => {
            console.warn("Meal speech recognition event:", err.error);
            if (err.error === 'not-allowed') {
                alert("Accesul la microfon a fost refuzat. Permite accesul din setările browserului.");
                window.stopMealVoiceInput();
            }
        };

        mealVoiceRecognition.onend = () => {
            if (isMealVoiceActive) {
                window.stopMealVoiceInput();
            }
        };

        mealVoiceRecognition.start();
    } catch (e) {
        console.error("Failed to start speech recognition:", e);
        alert("Nu s-a putut porni microfonul.");
        window.stopMealVoiceInput();
    }
};

window.stopMealVoiceInput = () => {
    isMealVoiceActive = false;
    mealVoicePendingFood = '';
    lastProcessedSpeechIndex = -1;
    if (mealVoiceRecognition) {
        try {
            mealVoiceRecognition.stop();
        } catch (e) {}
        mealVoiceRecognition = null;
    }

    const btn = document.getElementById('meal-voice-btn');
    const icon = document.getElementById('meal-voice-icon');
    const text = document.getElementById('meal-voice-text');
    const statusBanner = document.getElementById('voice-live-status');

    if (btn) {
        btn.className = "px-2.5 py-1.5 rounded-lg font-bold text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-all";
    }
    if (icon) icon.className = "w-3.5 h-3.5 text-indigo-400";
    if (text) text.innerText = "Dictare Vocală";
    if (statusBanner) statusBanner.classList.add('hidden');
    refreshIcons();
};

let lastProcessedTranscript = '';
let lastProcessedTimestamp = 0;

function normalizeFoodKey(name) {
    return (name || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\w\s]/g, '')
        .trim();
}

function handleVoiceFoodFinalTranscript(transcript) {
    if (!transcript) return;
    const now = Date.now();
    const cleanTrans = transcript.toLowerCase().trim();

    // Debounce exact duplicate speech events within 1.5 seconds
    if (cleanTrans === lastProcessedTranscript && (now - lastProcessedTimestamp) < 1500) {
        return;
    }
    lastProcessedTranscript = cleanTrans;
    lastProcessedTimestamp = now;

    const preview = document.getElementById('voice-transcript-preview');
    const sourceMsg = document.getElementById('data-source-msg');

    const result = parseRomanianFoodVoiceInput(transcript, mealVoicePendingFood);

    // 1. Control Commands
    if (result && result.isControlCommand) {
        if (result.command === 'stop') {
            window.stopMealVoiceInput();
            if (sourceMsg) sourceMsg.innerHTML = `<span class="text-slate-400">🛑 Dictare oprită</span>`;
            return;
        }
        if (result.command === 'delete_last') {
            if (currentMeal.foods.length > 0) {
                const removed = currentMeal.foods.pop();
                renderCurrentMeal();
                updateAnalysis();
                updateDynamicCaloricGauge();
                updateAIVisibility();
                if (preview) preview.innerText = `🗑️ Șters: ${removed.name}`;
                if (sourceMsg) sourceMsg.innerHTML = `<span class="text-amber-400">🗑️ Șters ultimul aliment (${removed.name})</span>`;
            }
            mealVoicePendingFood = '';
            return;
        }
        if (result.command === 'save_meal') {
            window.stopMealVoiceInput();
            if (typeof window.saveMealToLocal === 'function') {
                window.saveMealToLocal();
            }
            return;
        }
    }

    // 2. Food Items parsed with confirmed unit of measurement
    if (result && result.completedFoods && result.completedFoods.length > 0) {
        const processedNames = [];

        result.completedFoods.forEach((item) => {
            const itemKey = normalizeFoodKey(item.name);
            const existingIndex = currentMeal.foods.findIndex(f => normalizeFoodKey(f.name) === itemKey);

            if (existingIndex > -1) {
                // If item already exists in the list, DO NOT DUPLICATE: update quantity & unit!
                currentMeal.foods[existingIndex] = {
                    ...currentMeal.foods[existingIndex],
                    name: item.name,
                    quantity: item.quantity,
                    unit: item.unit,
                    calories: item.calories,
                    nutrients: item.nutrients
                };
                processedNames.push(`${item.quantity}${item.unit} ${item.name} (actualizat)`);

                if (Storage.isAiAvailable() && Storage.isAiNutrientCalcEnabled()) {
                    enrichFoodWithAiInBackground(existingIndex);
                }
            } else {
                // Add new food item
                const newIdx = currentMeal.foods.length;
                currentMeal.foods.push(item);
                processedNames.push(`${item.quantity}${item.unit} ${item.name}`);

                if (Storage.isAiAvailable() && Storage.isAiNutrientCalcEnabled()) {
                    enrichFoodWithAiInBackground(newIdx);
                }
            }
        });

        mealVoicePendingFood = '';
        const nameInput = document.getElementById('food-name');
        const qtyInput = document.getElementById('food-qty');
        if (nameInput) nameInput.value = '';
        if (qtyInput) qtyInput.value = '';

        renderCurrentMeal();
        updateAnalysis();
        updateDynamicCaloricGauge();
        updateAIVisibility();

        if (preview) {
            preview.innerText = `✅ ${processedNames.join(', ')}`;
        }
        if (sourceMsg) {
            sourceMsg.innerHTML = `<span class="text-emerald-400">🎤 ${processedNames.join(', ')}</span>`;
        }
    } else if (result && result.pendingFoodName) {
        // Food name recognized, but WAITING for unit of measurement!
        mealVoicePendingFood = result.pendingFoodName;
        const nameInput = document.getElementById('food-name');
        if (nameInput) nameInput.value = result.pendingFoodName;

        if (preview) {
            preview.innerText = `⏳ „${result.pendingFoodName}”... Spune cantitatea și unitatea (ex: 100 grame / 2 felii)`;
        }
        if (sourceMsg) {
            sourceMsg.innerHTML = `<span class="text-amber-400">⏳ Aștept unitatea pentru „${result.pendingFoodName}”...</span>`;
        }
    } else {
        if (preview) {
            preview.innerText = `Nu am auzit unitatea (ex: „100 grame” sau „2 felii”). Spus: „${transcript}”`;
        }
    }
}

async function enrichFoodWithAiInBackground(index) {
    if (!Storage.isAiAvailable() || !Storage.isAiNutrientCalcEnabled()) return;
    const targetFood = currentMeal.foods[index];
    if (!targetFood) return;

    try {
        const prompt = `Analizează nutrițional alimentul: "${targetFood.quantity} ${targetFood.unit} de ${targetFood.name}".
Folosește strict denumiri canonice standardizate pentru nutrienți (ex: "Vitamina B9 (Acid folic)", "Vitamina B12 (Cobalamină)", "Vitamina C (Acid ascorbic)", "Fier", "Calciu", "Magneziu", "Potasiu", "Zinc", etc.).

Returnează JSON strict: { "calories": number, "nutrients": [ { "name": "string", "type": "string", "qty": number, "unit": "string", "rda_percent": number, "role": "string" } ] }`;
        const txt = await AI.callText(prompt, { timeoutMs: 18000 });
        const s = txt.indexOf('{'), e = txt.lastIndexOf('}');
        if (s !== -1 && e !== -1) {
            const aiData = JSON.parse(txt.substring(s, e + 1));
            // Check if food at index still matches
            if (currentMeal.foods[index] && currentMeal.foods[index].name === targetFood.name) {
                if (aiData.calories !== undefined) currentMeal.foods[index].calories = parseInt(aiData.calories) || currentMeal.foods[index].calories;
                if (Array.isArray(aiData.nutrients) && aiData.nutrients.length > 0) {
                    const normNuts = normalizeNutrientsArray(aiData.nutrients);
                    currentMeal.foods[index].nutrients = normNuts;

                    // Auto-save to analyzed foods cache
                    const q = targetFood.quantity || 1;
                    const u = targetFood.unit || 'g';
                    const factor = (u === 'buc' || u === 'felie') ? (1 / q) : (100 / q);
                    Storage.saveAnalyzedFood({
                        name: targetFood.name,
                        baseQty: (u === 'buc' || u === 'felie') ? 1 : 100,
                        baseUnit: (u === 'buc' || u === 'felie') ? 'buc' : (u === 'ml' ? 'ml' : 'g'),
                        calories: Math.round((currentMeal.foods[index].calories || 0) * factor),
                        nutrients: normNuts.map(n => ({
                            ...n,
                            qty: parseFloat((n.qty * factor).toFixed(2))
                        })),
                        source: 'AI (Gemini)'
                    });
                }
                renderCurrentMeal();
                updateAnalysis();
                updateDynamicCaloricGauge();
                const sourceMsg = document.getElementById('data-source-msg');
                if (sourceMsg) sourceMsg.innerHTML = `<span class="text-indigo-400 font-bold">✨ ${targetFood.name} rafinat prin AI</span>`;
            }
        }
    } catch (err) {
        console.warn("Background AI food enrichment skipped:", err);
    }
}

window.removeFood = (i) => {
    if (editingFoodIndex === i) exitFoodEditMode();
    if (selectedFoodNutrientIndex === i) selectedFoodNutrientIndex = -1;
    else if (selectedFoodNutrientIndex > i) selectedFoodNutrientIndex--;
    currentMeal.foods.splice(i, 1);
    renderCurrentMeal();
    updateAnalysis();
    updateAIVisibility();
    if (currentMeal.foods.length === 0) {
        document.getElementById('ai-actions-panel').classList.add('hidden');
    }
};

window.resetForm = () => {
    currentMeal = { id: null, date: '', name: '', foods: [] };
    selectedFoodNutrientIndex = -1;
    const nowLocal = getTodayDateTimeLocal();
    document.getElementById('meal-datetime').value = nowLocal;
    window.handleMealDateChange(nowLocal);
    document.getElementById('editor-title').innerText = "Editor Masă";
    document.getElementById('cancel-edit-btn').classList.add('hidden');
    document.getElementById('save-meal-btn').innerHTML = '<i data-lucide="save" class="w-4 h-4"></i> Salvează Masa';
    const editorEl = document.getElementById('meal-editor');
    if (editorEl) {
        editorEl.classList.remove('ring-2', 'ring-indigo-500', 'border-indigo-500');
    }
    exitFoodEditMode();
    renderCurrentMeal();
    updateAnalysis();
    updateDynamicCaloricGauge();
    updateAIVisibility();
    document.getElementById('data-source-msg').innerHTML = '';
    window.ensureHeaderVisible();
    refreshIcons();
};

// --- Meal Storage CRUD ---
window.saveMealToLocal = async () => {
    if (currentMeal.foods.length === 0) return alert("Masa este goală.");
    
    const btn = document.getElementById('save-meal-btn');
    const originalHTML = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
    }

    // Identificare alimente pentru care NU s-au calculat nutrienții
    const missingIndices = [];
    currentMeal.foods.forEach((f, idx) => {
        if (!f.nutrients || !Array.isArray(f.nutrients) || f.nutrients.length === 0) {
            missingIndices.push(idx);
        }
    });

    if (missingIndices.length > 0) {
        if (btn) {
            btn.innerHTML = '<i data-lucide="loader" class="w-4 h-4 animate-spin"></i> Calculare nutrienți...';
            refreshIcons();
        }

        const statusEl = document.getElementById('data-source-msg');
        if (statusEl) {
            statusEl.innerHTML = `
                <span class="text-indigo-400 font-semibold animate-pulse">⏳ Calculare nutrienți lipsă pentru ${missingIndices.length} aliment(e)...</span>
                <button type="button" onclick="cancelCurrentAIAction()" class="ml-2 px-2 py-0.5 bg-rose-600 hover:bg-rose-500 text-white rounded text-[10px] font-bold shadow-sm active:scale-95">
                    Oprește
                </button>
            `;
        }

        // Dacă AI este disponibil și activat, calculăm nutrienții lipsă prin AI
        if (Storage.isAiAvailable() && Storage.isAiNutrientCalcEnabled()) {
            try {
                const missingFoods = missingIndices.map(idx => ({
                    name: currentMeal.foods[idx].name,
                    quantity: currentMeal.foods[idx].quantity,
                    unit: currentMeal.foods[idx].unit
                }));

                const prompt = `Analizează complet și riguros fiecare aliment din lista următoare pentru a calcula caloriile și spectrul detaliat de nutrienți:
${JSON.stringify(missingFoods, null, 2)}
Folosește strict denumiri canonice standardizate pentru nutrienți (ex: "Vitamina B9 (Acid folic)", "Vitamina B12 (Cobalamină)", "Vitamina C (Acid ascorbic)", "Fier", "Calciu", "Magneziu", "Potasiu", "Zinc", etc.).

Returnează strict un JSON array cu obiectele în aceeași ordine:
[
  {
    "name": "string",
    "quantity": number,
    "unit": "string",
    "calories": number,
    "nutrients": [
      {
        "name": "string",
        "type": "Macro" | "Micro",
        "qty": number,
        "unit": "string",
        "rda_percent": number,
        "role": "string"
      }
    ]
  }
]`;
                const txt = await AI.callText(prompt, { timeoutMs: 20000 });
                const s = txt.indexOf('[');
                const e = txt.lastIndexOf(']');
                if (s !== -1 && e !== -1) {
                    const parsed = JSON.parse(txt.substring(s, e + 1));
                    if (Array.isArray(parsed)) {
                        parsed.forEach((item, pIdx) => {
                            const originalIdx = missingIndices[pIdx];
                            if (originalIdx !== undefined && currentMeal.foods[originalIdx]) {
                                if (item.calories !== undefined && !isNaN(parseInt(item.calories))) {
                                    currentMeal.foods[originalIdx].calories = parseInt(item.calories);
                                }
                                const normNuts = normalizeNutrientsArray(item.nutrients || []);
                                currentMeal.foods[originalIdx].nutrients = normNuts;

                                // Auto-save to analyzed foods cache at 100g
                                const q = currentMeal.foods[originalIdx].quantity || 1;
                                const u = currentMeal.foods[originalIdx].unit || 'g';
                                const factor = (u === 'buc' || u === 'felie') ? (1 / q) : (100 / q);
                                Storage.saveAnalyzedFood({
                                    name: currentMeal.foods[originalIdx].name,
                                    baseQty: (u === 'buc' || u === 'felie') ? 1 : 100,
                                    baseUnit: (u === 'buc' || u === 'felie') ? 'buc' : (u === 'ml' ? 'ml' : 'g'),
                                    calories: Math.round((currentMeal.foods[originalIdx].calories || 0) * factor),
                                    nutrients: normNuts.map(n => ({
                                        ...n,
                                        qty: parseFloat((n.qty * factor).toFixed(2))
                                    })),
                                    source: 'AI (Gemini)'
                                });
                            }
                        });
                    }
                }
            } catch (err) {
                console.warn("Eroare la calcularea nutrienților lipsă prin AI la salvare, recurgem la estimare locală:", err);
            }
        }

        // Fallback local pentru orice aliment care încă nu are nutrienți calculați
        currentMeal.foods.forEach((f, idx) => {
            if (!f.nutrients || !Array.isArray(f.nutrients) || f.nutrients.length === 0) {
                const localEst = estimateFoodLocally(f.name, f.quantity, f.unit);
                if (localEst && localEst.nutrients) {
                    f.nutrients = normalizeNutrientsArray(localEst.nutrients);
                    if (!f.calories) f.calories = localEst.calories;
                } else {
                    f.nutrients = [];
                }
            }
        });

        renderCurrentMeal();
        updateAnalysis();
        updateDynamicCaloricGauge();
    }

    if (btn) {
        btn.innerHTML = '<i data-lucide="loader" class="w-4 h-4 animate-spin"></i> Salvare...';
        refreshIcons();
    }

    const payload = {
        id: currentMeal.id || null,
        date: document.getElementById('meal-datetime').value || getTodayDateTimeLocal(),
        name: document.getElementById('meal-name').value.trim() || 'Masă fără nume',
        foods: currentMeal.foods
    };

    try {
        Storage.saveMeal(payload);
        const dateKey = (payload.date || '').slice(0, 10);
        if (dateKey) {
            sessionSavedDateKeys.add(dateKey);
            expandedJournalDays.add(dateKey);
        }
        window.resetForm();
        renderHistory();
        window.ensureHeaderVisible();
        const mainContainer = document.querySelector('main');
        if (mainContainer) {
            mainContainer.scrollTo({ top: 0, behavior: 'smooth' });
        }
        // Visual notification toast/feedback
        const statusEl = document.getElementById('data-source-msg');
        if (statusEl) statusEl.innerHTML = `<span class="text-emerald-400 font-bold">✓ Salvat local cu succes!</span>`;
    } catch (e) {
        alert("Eroare la salvarea mesei: " + e.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalHTML;
            refreshIcons();
        }
    }
};
window.saveMeal = window.saveMealToLocal;

window.editHistoryMeal = (id) => {
    const m = historyData.find(x => x.id === id);
    if (!m) return;
    
    // Switch to meals tab if in another tab
    if (typeof window.switchMainTab === 'function') {
        window.switchMainTab('meals');
    }
    
    currentMeal = JSON.parse(JSON.stringify(m));
    selectedFoodNutrientIndex = -1;
    const targetDate = currentMeal.date || getTodayDateTimeLocal();
    expandedJournalDays.add(targetDate.slice(0, 10));
    
    const dtInput = document.getElementById('meal-datetime');
    if (dtInput) dtInput.value = targetDate;
    window.handleMealDateChange(targetDate);
    
    const nameInput = document.getElementById('meal-name');
    if (nameInput) nameInput.value = currentMeal.name || '';
    
    const titleEl = document.getElementById('editor-title');
    if (titleEl) titleEl.innerText = "Modifică Masă: " + (currentMeal.name || 'Fără titlu');
    
    const cancelBtn = document.getElementById('cancel-edit-btn');
    if (cancelBtn) cancelBtn.classList.remove('hidden');
    
    const saveBtn = document.getElementById('save-meal-btn');
    if (saveBtn) saveBtn.innerHTML = '<i data-lucide="refresh-cw" class="w-4 h-4"></i> Actualizează Masa';
    
    // Add visual highlight to editor container
    const editorEl = document.getElementById('meal-editor');
    if (editorEl) {
        editorEl.classList.add('ring-2', 'ring-indigo-500', 'border-indigo-500');
    }
    
    exitFoodEditMode();
    renderCurrentMeal();
    updateAnalysis();
    updateDynamicCaloricGauge();
    
    if (currentMeal.foods.length > 0 && Storage.isAiAvailable()) {
        document.getElementById('ai-actions-panel')?.classList.remove('hidden');
    } else {
        document.getElementById('ai-actions-panel')?.classList.add('hidden');
    }
    
    // Scroll the main content container to top while keeping the header visible
    const mainContainer = document.querySelector('main');
    if (mainContainer) {
        mainContainer.scrollTo({ top: 0, behavior: 'smooth' });
    }
    window.ensureHeaderVisible();
    if (nameInput) {
        setTimeout(() => {
            nameInput.focus({ preventScroll: true });
            nameInput.select();
            window.ensureHeaderVisible();
        }, 150);
    }
    
    refreshIcons();
};

// --- Journal Daily Cards & Smart Filter State ---
let expandedJournalDays = new Set();
let journalDaysInitialized = false;
let sessionSavedDateKeys = new Set();

let activeJournalFilter = Storage.getJournalFilter ? Storage.getJournalFilter() : { type: 'last_7_days', customDates: [] };
let filterCalendarYear = new Date().getFullYear();
let filterCalendarMonth = new Date().getMonth();
let tempSelectedDates = new Set();

function getFilterLabel(filter) {
    if (!filter || filter.type === 'all') return 'Toate Zilele';
    switch (filter.type) {
        case 'last_7_days': return 'Ultimele 7 zile';
        case 'weekends': return 'Weekend-uri (Sâmbătă & Duminică)';
        case 'weekdays': return 'Zile lucrătoare (Luni - Vineri)';
        case 'current_month': return 'Luna Curentă';
        case 'previous_month': return 'Luna Anterioară';
        case 'surplus_only': return 'Peste Țintă / Surplus';
        case 'target_met': return 'În Țintă / Deficit';
        case 'custom': 
            const count = (filter.customDates || []).length;
            return `Selecție Calendar (${count} ${count === 1 ? 'zi' : 'zile'})`;
        default: return 'Filtru activ';
    }
}

function dateMatchesFilter(dateKey, filter, dayMeals, targetCalories, deficit) {
    // Current session saved dates are always visible
    if (sessionSavedDateKeys.has(dateKey)) return true;

    if (!filter || filter.type === 'all') return true;

    const parts = dateKey.split('-');
    if (parts.length < 3) return true;
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const d = new Date(year, month, day);
    if (isNaN(d.getTime())) return true;

    const today = new Date();
    const todayZero = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const dayZero = new Date(year, month, day);
    const diffDays = Math.round((todayZero - dayZero) / (1000 * 60 * 60 * 24));

    const dayOfWeek = d.getDay(); // 0 is Sunday, 6 is Saturday

    if (filter.type === 'custom') {
        return Array.isArray(filter.customDates) && filter.customDates.includes(dateKey);
    } else if (filter.type === 'last_7_days') {
        return diffDays >= 0 && diffDays <= 7;
    } else if (filter.type === 'weekends') {
        return dayOfWeek === 0 || dayOfWeek === 6;
    } else if (filter.type === 'weekdays') {
        return dayOfWeek >= 1 && dayOfWeek <= 5;
    } else if (filter.type === 'current_month') {
        return year === today.getFullYear() && month === today.getMonth();
    } else if (filter.type === 'previous_month') {
        const prevMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        return year === prevMonthDate.getFullYear() && month === prevMonthDate.getMonth();
    } else if (filter.type === 'surplus_only') {
        const dayCals = (dayMeals || []).reduce((acc, m) => acc + (m.foods || []).reduce((facc, f) => facc + (f.calories || 0), 0), 0);
        return dayCals > targetCalories;
    } else if (filter.type === 'target_met') {
        const dayCals = (dayMeals || []).reduce((acc, m) => acc + (m.foods || []).reduce((facc, f) => facc + (f.calories || 0), 0), 0);
        if (deficit < 0) return dayCals <= targetCalories;
        if (deficit > 0) return dayCals >= targetCalories;
        return Math.abs(dayCals - targetCalories) <= 150 || dayCals <= targetCalories;
    }

    return true;
}

// Smart Filter Modal Controls
window.openJournalFilterModal = () => {
    const modal = document.getElementById('journal-filter-modal');
    if (!modal) return;
    activeJournalFilter = Storage.getJournalFilter ? Storage.getJournalFilter() : { type: 'last_7_days', customDates: [] };
    
    // Sync temporary selected dates
    tempSelectedDates.clear();
    if (activeJournalFilter.type === 'custom' && Array.isArray(activeJournalFilter.customDates)) {
        activeJournalFilter.customDates.forEach(d => tempSelectedDates.add(d));
    }
    
    // Update active preset button styling
    document.querySelectorAll('.journal-preset-btn').forEach(btn => {
        const preset = btn.getAttribute('data-preset');
        if (preset === activeJournalFilter.type) {
            btn.classList.add('ring-2', 'ring-emerald-400', 'border-emerald-500', 'bg-slate-800');
        } else {
            btn.classList.remove('ring-2', 'ring-emerald-400', 'border-emerald-500');
        }
    });

    renderFilterCalendarGrid();
    modal.classList.remove('hidden');
    refreshIcons();
};

window.closeJournalFilterModal = () => {
    const modal = document.getElementById('journal-filter-modal');
    if (modal) modal.classList.add('hidden');
};

window.changeFilterCalendarMonth = (delta) => {
    filterCalendarMonth += delta;
    if (filterCalendarMonth > 11) {
        filterCalendarMonth = 0;
        filterCalendarYear++;
    } else if (filterCalendarMonth < 0) {
        filterCalendarMonth = 11;
        filterCalendarYear--;
    }
    renderFilterCalendarGrid();
};

window.setFilterCalendarToToday = () => {
    const now = new Date();
    filterCalendarYear = now.getFullYear();
    filterCalendarMonth = now.getMonth();
    renderFilterCalendarGrid();
};

window.toggleFilterDateSelection = (dateKey) => {
    if (tempSelectedDates.has(dateKey)) {
        tempSelectedDates.delete(dateKey);
    } else {
        tempSelectedDates.add(dateKey);
    }
    renderFilterCalendarGrid();
};

window.clearCustomDateSelection = () => {
    tempSelectedDates.clear();
    renderFilterCalendarGrid();
};

window.applyJournalFilterPreset = (presetType) => {
    activeJournalFilter = { type: presetType, customDates: [] };
    if (Storage.saveJournalFilter) Storage.saveJournalFilter(activeJournalFilter);
    expandedJournalDays.clear();
    window.closeJournalFilterModal();
    renderHistory();
};

window.applyCustomCalendarFilter = () => {
    if (tempSelectedDates.size === 0) {
        alert("Te rugăm să selectezi cel puțin o zi din calendar sau să alegi un preset rapid.");
        return;
    }
    activeJournalFilter = {
        type: 'custom',
        customDates: Array.from(tempSelectedDates)
    };
    if (Storage.saveJournalFilter) Storage.saveJournalFilter(activeJournalFilter);
    expandedJournalDays.clear();
    window.closeJournalFilterModal();
    renderHistory();
};

window.resetJournalFilterToAll = () => {
    activeJournalFilter = { type: 'all', customDates: [] };
    if (Storage.saveJournalFilter) Storage.saveJournalFilter(activeJournalFilter);
    tempSelectedDates.clear();
    expandedJournalDays.clear();
    window.closeJournalFilterModal();
    renderHistory();
};

function renderFilterCalendarGrid() {
    const titleEl = document.getElementById('filter-cal-month-title');
    const gridEl = document.getElementById('filter-cal-grid');
    const statusTextEl = document.getElementById('filter-selection-text');
    if (!titleEl || !gridEl) return;

    const monthNames = [
        "Ianuarie", "Februarie", "Martie", "Aprilie", "Mai", "Iunie",
        "Iulie", "August", "Septembrie", "Octombrie", "Noiembrie", "Decembrie"
    ];

    titleEl.innerText = `${monthNames[filterCalendarMonth]} ${filterCalendarYear}`;

    // Get days with meals in history
    const allMeals = Storage.getMeals();
    const mealsByDayMap = {};
    allMeals.forEach(m => {
        const dStr = (m.date || '').slice(0, 10);
        if (dStr) {
            mealsByDayMap[dStr] = (mealsByDayMap[dStr] || 0) + 1;
        }
    });

    gridEl.innerHTML = '';

    const firstDayObj = new Date(filterCalendarYear, filterCalendarMonth, 1);
    let firstDayOfWeek = firstDayObj.getDay(); // 0 Sun, 1 Mon
    firstDayOfWeek = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1; // 0 Mon, 6 Sun

    const daysInMonth = new Date(filterCalendarYear, filterCalendarMonth + 1, 0).getDate();

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    // Empty lead cells
    for (let i = 0; i < firstDayOfWeek; i++) {
        const emptyCell = document.createElement('div');
        emptyCell.className = "h-9 rounded-lg bg-slate-900/30 border border-slate-800/40";
        gridEl.appendChild(emptyCell);
    }

    // Days of month
    for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
        const dateKey = `${filterCalendarYear}-${String(filterCalendarMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
        const hasMeals = !!mealsByDayMap[dateKey];
        const mealsCount = mealsByDayMap[dateKey] || 0;
        const isSelected = tempSelectedDates.has(dateKey);
        const isToday = dateKey === todayStr;

        const cell = document.createElement('button');
        cell.type = 'button';
        cell.onclick = () => window.toggleFilterDateSelection(dateKey);

        let cellClass = "h-9 rounded-lg text-xs font-semibold flex flex-col items-center justify-center relative transition-all border ";
        if (isSelected) {
            cellClass += "bg-indigo-600 text-white border-indigo-400 shadow-md ring-2 ring-indigo-400/50 ";
        } else if (hasMeals) {
            cellClass += "bg-slate-800 hover:bg-slate-700 text-slate-100 border-slate-700 hover:border-emerald-500/50 ";
        } else {
            cellClass += "bg-slate-900/50 hover:bg-slate-800/40 text-slate-500 border-slate-800/60 ";
        }

        if (isToday && !isSelected) {
            cellClass += "ring-1 ring-indigo-400/80 ";
        }

        cell.className = cellClass;
        cell.innerHTML = `
            <span class="${isToday && !isSelected ? 'text-indigo-300 font-bold' : ''}">${dayNum}</span>
            ${hasMeals ? `<span class="w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-emerald-400'} mt-0.5"></span>` : ''}
        `;
        cell.title = `${dateKey}${hasMeals ? ` • ${mealsCount} ${mealsCount === 1 ? 'masă' : 'mese'}` : ' • Fără înregistrări'}`;

        gridEl.appendChild(cell);
    }

    if (statusTextEl) {
        statusTextEl.innerText = `Zile selectate: ${tempSelectedDates.size}`;
    }

    refreshIcons();
}

function formatRomanianDayHeader(dateKey) {
    if (!dateKey) return { isToday: false, isYesterday: false, displayTitle: 'Dată nespecificată', badgeText: '' };
    const parts = dateKey.split('-');
    if (parts.length < 3) return { isToday: false, isYesterday: false, displayTitle: dateKey, badgeText: '' };
    
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const d = new Date(year, month, day);
    if (isNaN(d.getTime())) return { isToday: false, isYesterday: false, displayTitle: dateKey, badgeText: '' };

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

    const days = ['Duminică', 'Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă'];
    const months = [
        'Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie',
        'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie'
    ];

    const isToday = dateKey === todayStr;
    const isYesterday = dateKey === yesterdayStr;
    const dayName = days[d.getDay()];
    const monthName = months[d.getMonth()];

    let badgeText = '';
    if (isToday) badgeText = 'Astăzi';
    else if (isYesterday) badgeText = 'Ieri';

    return {
        isToday,
        isYesterday,
        displayTitle: `${dayName}, ${day} ${monthName} ${year}`,
        shortTitle: `${dayName}, ${day} ${monthName}`,
        badgeText
    };
}

function getMealIconAndColor(mealName) {
    const nameLower = (mealName || '').toLowerCase();
    if (nameLower.includes('dejun') || nameLower.includes('mic')) {
        return { icon: 'sun', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' };
    } else if (nameLower.includes('prânz') || nameLower.includes('pranz')) {
        return { icon: 'utensils', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' };
    } else if (nameLower.includes('cină') || nameLower.includes('cina')) {
        return { icon: 'moon', color: 'text-indigo-400', bg: 'bg-indigo-500/10 border-indigo-500/20' };
    } else if (nameLower.includes('gustar') || nameLower.includes('snack') || nameLower.includes('noapte')) {
        return { icon: 'apple', color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20' };
    }
    return { icon: 'utensils-crossed', color: 'text-cyan-400', bg: 'bg-cyan-500/10 border-cyan-500/20' };
}

function evaluateDayCaloricGoal(consumedCals, targetCalories, deficit) {
    const target = targetCalories > 0 ? targetCalories : 2000;
    const diff = consumedCals - target;
    const pct = Math.min(Math.round((consumedCals / target) * 100), 100);

    let goalType = 'maintenance';
    if (deficit < 0) goalType = 'loss';
    else if (deficit > 0) goalType = 'gain';

    let statusColor = 'text-emerald-400';
    let badgeBg = 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
    let barColor = 'bg-emerald-500';
    let statusText = '';
    let isGoalMet = true;

    if (goalType === 'loss') {
        // Slăbire (Deficit): Verde dacă a consumat sub sau egal cu ținta de deficit. Roșu dacă a depășit
        if (diff <= 0) {
            isGoalMet = true;
            statusColor = 'text-emerald-400';
            badgeBg = 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
            barColor = 'bg-emerald-500';
            statusText = diff === 0 
                ? '🎯 Țintă atinsă la fix' 
                : `🟢 În deficit (-${Math.abs(diff)} kcal rămase)`;
        } else {
            isGoalMet = false;
            statusColor = 'text-rose-400';
            badgeBg = 'bg-rose-500/15 text-rose-300 border-rose-500/30';
            barColor = 'bg-rose-500';
            statusText = `⚠️ Depășire cu +${diff} kcal`;
        }
    } else if (goalType === 'gain') {
        // Creștere (Surplus): Verde dacă a atins sau depășit ținta. Galben dacă e sub
        if (diff >= 0) {
            isGoalMet = true;
            statusColor = 'text-emerald-400';
            badgeBg = 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
            barColor = 'bg-emerald-500';
            statusText = diff === 0 
                ? '🎯 Surplus atins la fix' 
                : `🟢 Surplus atins (+${diff} kcal)`;
        } else {
            isGoalMet = false;
            statusColor = 'text-amber-400';
            badgeBg = 'bg-amber-500/15 text-amber-300 border-amber-500/30';
            barColor = 'bg-amber-500';
            statusText = `⚡ Sub surplus (${Math.abs(diff)} kcal necesare)`;
        }
    } else {
        // Menținere: Verde dacă e în interval optim, Roșu dacă depășește
        if (Math.abs(diff) <= 150 || diff <= 0) {
            isGoalMet = true;
            statusColor = 'text-emerald-400';
            badgeBg = 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
            barColor = 'bg-emerald-500';
            statusText = diff <= 0 
                ? `🟢 În echilibru (${Math.abs(diff)} kcal rămase)` 
                : `🟢 În echilibru (+${diff} kcal)`;
        } else {
            isGoalMet = false;
            statusColor = 'text-rose-400';
            badgeBg = 'bg-rose-500/15 text-rose-300 border-rose-500/30';
            barColor = 'bg-rose-500';
            statusText = `⚠️ Peste menținere (+${diff} kcal)`;
        }
    }

    return {
        consumedCals,
        targetCalories: target,
        diff,
        pct,
        goalType,
        statusColor,
        badgeBg,
        barColor,
        statusText,
        isGoalMet
    };
}

window.toggleJournalDay = (dateKey) => {
    if (expandedJournalDays.has(dateKey)) {
        expandedJournalDays.delete(dateKey);
    } else {
        expandedJournalDays.add(dateKey);
    }
    renderHistory();
};

window.toggleAllJournalDays = () => {
    historyData = Storage.getMeals();
    const mealsByDate = {};
    historyData.forEach(m => {
        const rawDate = m.date || getTodayDateTimeLocal();
        const dateKey = rawDate.slice(0, 10);
        if (!mealsByDate[dateKey]) mealsByDate[dateKey] = [];
        mealsByDate[dateKey].push(m);
    });
    const sortedDays = Object.keys(mealsByDate).sort((a, b) => b.localeCompare(a));
    const userProfile = Storage.getUserProfile();
    const metrics = Storage.calculateMetrics(userProfile);
    const targetCalories = metrics.targetCalories || 2000;
    const deficit = (userProfile && userProfile.targetDeficit !== null && userProfile.targetDeficit !== undefined && userProfile.targetDeficit !== '' && !isNaN(userProfile.targetDeficit)) 
        ? parseInt(userProfile.targetDeficit) 
        : 0;
    const currentFilter = Storage.getJournalFilter ? Storage.getJournalFilter() : (activeJournalFilter || { type: 'last_7_days', customDates: [] });
    const filteredDays = sortedDays.filter(dateKey => dateMatchesFilter(dateKey, currentFilter, mealsByDate[dateKey], targetCalories, deficit));
    
    const allExpanded = filteredDays.length > 0 && filteredDays.every(k => expandedJournalDays.has(k));
    
    if (allExpanded) {
        expandedJournalDays.clear();
    } else {
        filteredDays.forEach(k => expandedJournalDays.add(k));
    }
    renderHistory();
};

window.addMealForDate = (dateKey) => {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const fullDate = `${dateKey}T${h}:${m}`;
    
    window.resetForm();
    const dateInput = document.getElementById('meal-datetime');
    if (dateInput) {
        dateInput.value = fullDate;
        window.handleMealDateChange(fullDate);
    }
    expandedJournalDays.add(dateKey);
    const mainContainer = document.querySelector('main');
    if (mainContainer) {
        mainContainer.scrollTo({ top: 0, behavior: 'smooth' });
    }
    window.ensureHeaderVisible();
};

window.deleteMeal = (id) => {
    if (confirm("Sigur dorești să ștergi această masă din jurnal?")) {
        Storage.deleteMeal(id);
        if (currentMeal.id === id) window.resetForm();
        renderHistory();
        updateDynamicCaloricGauge();
    }
};

function renderHistory() {
    const container = document.getElementById('meal-history');
    const daysBadge = document.getElementById('journal-days-count-badge');
    const toggleAllBtn = document.getElementById('btn-toggle-all-journal-days');
    const toggleAllText = document.getElementById('toggle-all-journal-text');
    const toggleAllIcon = document.getElementById('toggle-all-journal-icon');
    
    const filterDot = document.getElementById('journal-filter-active-dot');
    const activeFilterBar = document.getElementById('journal-active-filter-bar');
    const activeFilterName = document.getElementById('journal-active-filter-name');
    const filteredCountText = document.getElementById('journal-filtered-count-text');

    if (!container) return;
    container.innerHTML = '';
    historyData = Storage.getMeals();

    if (historyData.length === 0) {
        if (daysBadge) daysBadge.classList.add('hidden');
        if (toggleAllBtn) toggleAllBtn.classList.add('hidden');
        if (activeFilterBar) activeFilterBar.classList.add('hidden');
        if (filterDot) filterDot.classList.add('hidden');
        container.innerHTML = `<div class="text-center py-10 text-slate-500 text-sm border border-slate-800/80 rounded-2xl bg-slate-900/40 px-4">
            <i data-lucide="book-open" class="w-8 h-8 mx-auto mb-2.5 text-slate-600"></i>
            <div class="font-semibold text-slate-400">Nu există mese în jurnal</div>
            <div class="text-xs text-slate-600 mt-1">Înregistrează și salvează mese pentru a urmări istoricul zilnic.</div>
        </div>`;
        refreshIcons();
        return;
    }

    // Group meals by date (YYYY-MM-DD)
    const mealsByDate = {};
    historyData.forEach(m => {
        const rawDate = m.date || getTodayDateTimeLocal();
        const dateKey = rawDate.slice(0, 10);
        if (!mealsByDate[dateKey]) mealsByDate[dateKey] = [];
        mealsByDate[dateKey].push(m);
    });

    // Sort days descending (newest first)
    const sortedDays = Object.keys(mealsByDate).sort((a, b) => b.localeCompare(a));
    const allDaysCount = sortedDays.length;

    // Get active filter
    activeJournalFilter = Storage.getJournalFilter ? Storage.getJournalFilter() : { type: 'last_7_days', customDates: [] };

    // Get user metrics for target calories & goal evaluation
    const userProfile = Storage.getUserProfile();
    const metrics = Storage.calculateMetrics(userProfile);
    const targetCalories = metrics.targetCalories || 2000;
    const deficit = (userProfile && userProfile.targetDeficit !== null && userProfile.targetDeficit !== undefined && userProfile.targetDeficit !== '' && !isNaN(userProfile.targetDeficit)) 
        ? parseInt(userProfile.targetDeficit) 
        : 0;

    // Apply smart filter to days
    const filteredDays = sortedDays.filter(dateKey => {
        return dateMatchesFilter(dateKey, activeJournalFilter, mealsByDate[dateKey], targetCalories, deficit);
    });

    // Update Active Filter Bar & Dot
    const isFiltered = activeJournalFilter.type !== 'all';
    if (filterDot) {
        if (isFiltered) filterDot.classList.remove('hidden');
        else filterDot.classList.add('hidden');
    }
    if (activeFilterBar) {
        if (isFiltered) {
            activeFilterBar.classList.remove('hidden');
            if (activeFilterName) activeFilterName.innerText = getFilterLabel(activeJournalFilter);
            if (filteredCountText) filteredCountText.innerText = `(${filteredDays.length} din ${allDaysCount} zile)`;
        } else {
            activeFilterBar.classList.add('hidden');
        }
    }

    journalDaysInitialized = true;

    // Update Header Badges & Toggle Button
    if (daysBadge) {
        daysBadge.classList.remove('hidden');
        if (isFiltered) {
            daysBadge.innerText = `${filteredDays.length} din ${allDaysCount} ${allDaysCount === 1 ? 'zi' : 'zile'}`;
        } else {
            daysBadge.innerText = `${allDaysCount} ${allDaysCount === 1 ? 'zi salvată' : 'zile salvate'}`;
        }
    }

    const allExpanded = filteredDays.length > 0 && filteredDays.every(k => expandedJournalDays.has(k));
    if (toggleAllBtn) {
        if (filteredDays.length === 0) {
            toggleAllBtn.classList.add('hidden');
        } else {
            toggleAllBtn.classList.remove('hidden');
            if (toggleAllText) toggleAllText.innerText = allExpanded ? 'Restrânge Tot' : 'Extinde Tot';
            if (toggleAllIcon) {
                toggleAllIcon.setAttribute('data-lucide', allExpanded ? 'chevrons-down-up' : 'chevrons-up-down');
            }
        }
    }

    // If no days match filter
    if (filteredDays.length === 0) {
        container.innerHTML = `
            <div class="text-center py-10 text-slate-400 text-sm border border-slate-800/80 rounded-2xl bg-slate-900/40 px-4">
                <i data-lucide="filter-x" class="w-8 h-8 mx-auto mb-2.5 text-slate-500"></i>
                <div class="font-bold text-white">Nicio zi nu corespunde filtrului „${getFilterLabel(activeJournalFilter)}”</div>
                <div class="text-xs text-slate-400 mt-1">Încearcă alt filtru sau afișează toate înregistrările din jurnal (${allDaysCount} zile în istoric).</div>
                <button onclick="resetJournalFilterToAll()" class="mt-3.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white rounded-xl text-xs font-semibold shadow-md transition-all">
                    Afișează Toate Zilele
                </button>
            </div>
        `;
        refreshIcons();
        return;
    }

    filteredDays.forEach((dateKey, dayIdx) => {
        const dayMeals = mealsByDate[dateKey];
        // Sort day's meals chronologically
        dayMeals.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

        // Calculate day nutritional totals
        let dayTotalCals = 0;
        let dayProtein = 0;
        let dayCarbs = 0;
        let dayFat = 0;

        dayMeals.forEach(meal => {
            (meal.foods || []).forEach(f => {
                dayTotalCals += (f.calories || 0);
                (f.nutrients || []).forEach(n => {
                    const nLower = (n.name || '').toLowerCase();
                    const q = parseFloat(n.qty) || 0;
                    if (nLower.includes('prot')) dayProtein += q;
                    if (nLower.includes('carb') || nLower.includes('gluc')) dayCarbs += q;
                    if (nLower.includes('grăs') || nLower.includes('gras') || nLower.includes('lipid') || nLower.includes('fat')) dayFat += q;
                });
            });
        });

        // Check if there are sports activities for this day
        const dayActivities = Storage.getActivities ? Storage.getActivities(dateKey) : [];
        const sportBurned = dayActivities.reduce((acc, a) => acc + (parseFloat(a.burnedCalories || a.caloriesBurned) || 0), 0);

        const headerInfo = formatRomanianDayHeader(dateKey);
        const calEval = evaluateDayCaloricGoal(dayTotalCals, targetCalories, deficit);
        const isExpanded = expandedJournalDays.has(dateKey);
        const isEven = dayIdx % 2 === 0;

        const dayCard = document.createElement('div');
        dayCard.className = `rounded-2xl border transition-all duration-200 overflow-hidden ${
            isExpanded 
                ? 'bg-slate-900 border-slate-700/90 shadow-lg shadow-black/20 ring-1 ring-slate-700/50' 
                : (isEven 
                    ? 'bg-slate-900/90 border-slate-800 hover:border-slate-700 hover:bg-slate-900 shadow-sm' 
                    : 'bg-slate-950/90 border-slate-800/70 hover:border-slate-700/90 hover:bg-slate-900/60 shadow-sm')
        }`;

        // Header Row (Clickable Accordion Trigger)
        const headerEl = document.createElement('div');
        headerEl.className = `p-3.5 sm:p-4 cursor-pointer select-none transition-colors ${isEven ? 'hover:bg-slate-800/40' : 'hover:bg-slate-800/30'}`;
        headerEl.onclick = () => window.toggleJournalDay(dateKey);

        headerEl.innerHTML = `
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <!-- Left: Day Info & Badges -->
                <div class="flex items-start sm:items-center gap-2.5 min-w-0">
                    <div class="p-2 rounded-xl ${isEven ? 'bg-slate-800 border-slate-700 text-indigo-400' : 'bg-slate-900 border-slate-800 text-indigo-400'} shrink-0">
                        <i data-lucide="calendar" class="w-4 h-4"></i>
                    </div>
                    <div class="min-w-0">
                        <div class="flex items-center gap-2 flex-wrap">
                            <h4 class="font-bold text-white text-sm sm:text-base leading-tight">${headerInfo.displayTitle}</h4>
                            ${headerInfo.badgeText ? `<span class="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${headerInfo.isToday ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : 'bg-slate-800 text-slate-300 border border-slate-700'}">${headerInfo.badgeText}</span>` : ''}
                        </div>
                        <div class="flex items-center gap-2 text-xs text-slate-400 mt-1 flex-wrap">
                            <span class="font-medium text-slate-300">${dayMeals.length} ${dayMeals.length === 1 ? 'masă' : 'mese'}</span>
                            <span class="text-slate-600">•</span>
                            <span class="text-slate-400">P: <strong class="text-slate-200">${dayProtein.toFixed(0)}g</strong></span>
                            <span class="text-slate-400">C: <strong class="text-slate-200">${dayCarbs.toFixed(0)}g</strong></span>
                            <span class="text-slate-400">G: <strong class="text-slate-200">${dayFat.toFixed(0)}g</strong></span>
                            ${sportBurned > 0 ? `
                                <span class="text-slate-600">•</span>
                                <span class="text-amber-400 font-medium flex items-center gap-1">
                                    <i data-lucide="flame" class="w-3 h-3 text-amber-400"></i> -${Math.round(sportBurned)} kcal sport
                                </span>
                            ` : ''}
                        </div>
                    </div>
                </div>

                <!-- Right: Calorie Synthesis & Accordion Icon -->
                <div class="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-800/80">
                    <div class="text-left sm:text-right">
                        <div class="flex items-baseline gap-1 sm:justify-end">
                            <span class="font-mono font-bold text-base sm:text-lg ${calEval.statusColor}">${dayTotalCals.toLocaleString('ro-RO')}</span>
                            <span class="text-xs text-slate-400 font-medium">/ ${targetCalories.toLocaleString('ro-RO')} kcal</span>
                        </div>
                        <div class="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md border mt-0.5 ${calEval.badgeBg}">
                            <span>${calEval.statusText}</span>
                        </div>
                    </div>
                    <div class="p-1.5 rounded-lg bg-slate-800/80 border border-slate-700/80 text-slate-400 hover:text-white transition-all ml-1">
                        <i data-lucide="chevron-down" class="w-4 h-4 transition-transform duration-300 ${isExpanded ? 'rotate-180 text-indigo-400' : ''}"></i>
                    </div>
                </div>
            </div>

            <!-- Mini Progress Bar Indicator -->
            <div class="w-full bg-slate-800/90 rounded-full h-1.5 overflow-hidden mt-3">
                <div class="${calEval.barColor} h-1.5 rounded-full transition-all duration-500" style="width: ${Math.min(calEval.pct, 100)}%"></div>
            </div>
        `;
        dayCard.appendChild(headerEl);

        // Expandable Meals Container
        if (isExpanded) {
            const bodyEl = document.createElement('div');
            bodyEl.className = `border-t border-slate-800/90 p-3.5 sm:p-4 ${isEven ? 'bg-slate-950/50' : 'bg-slate-950/70'} space-y-3`;

            // List of meals
            dayMeals.forEach(meal => {
                const totalMealCal = (meal.foods || []).reduce((acc, f) => acc + (f.calories || 0), 0);
                let mealProt = 0, mealCarb = 0, mealFat = 0;
                (meal.foods || []).forEach(f => {
                    (f.nutrients || []).forEach(n => {
                        const nLower = (n.name || '').toLowerCase();
                        const q = parseFloat(n.qty) || 0;
                        if (nLower.includes('prot')) mealProt += q;
                        if (nLower.includes('carb') || nLower.includes('gluc')) mealCarb += q;
                        if (nLower.includes('grăs') || nLower.includes('gras') || nLower.includes('lipid') || nLower.includes('fat')) mealFat += q;
                    });
                });

                const mealStyle = getMealIconAndColor(meal.name);
                let timeStr = '';
                if (meal.date && meal.date.includes('T')) {
                    const t = meal.date.split('T')[1];
                    if (t) timeStr = t.slice(0, 5);
                }

                const mealItem = document.createElement('div');
                mealItem.className = "bg-slate-900 border border-slate-800 rounded-xl p-3.5 sm:p-4 shadow-sm hover:border-slate-700 transition-all";

                const foodsChips = (meal.foods || []).map(f => `
                    <span class="inline-flex items-center gap-1 bg-slate-800 text-slate-300 text-[11px] px-2 py-0.5 rounded-lg border border-slate-700">
                        <span>${f.name}</span>
                        <span class="text-indigo-300 font-mono">(${f.quantity}${f.unit || 'g'}${f.calories ? ` • ${f.calories} kcal` : ''})</span>
                    </span>
                `).join('');

                mealItem.innerHTML = `
                    <div class="flex flex-wrap justify-between items-start gap-2 mb-2">
                        <div class="flex items-center gap-2.5">
                            <div class="p-1.5 rounded-lg ${mealStyle.bg} ${mealStyle.color} shrink-0">
                                <i data-lucide="${mealStyle.icon}" class="w-4 h-4"></i>
                            </div>
                            <div>
                                <h5 class="font-bold text-white text-sm">${meal.name || 'Masă'}</h5>
                                <div class="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                                    ${timeStr ? `<i data-lucide="clock" class="w-3 h-3 text-slate-500"></i> <span>${timeStr}</span> <span class="text-slate-600">•</span>` : ''}
                                    <span>${(meal.foods || []).length} ${(meal.foods || []).length === 1 ? 'ingredient' : 'ingrediente'}</span>
                                </div>
                            </div>
                        </div>
                        <div class="flex items-center gap-2">
                            <div class="bg-slate-800 text-slate-200 font-mono text-xs px-2.5 py-1 rounded-lg font-bold border border-slate-700">
                                ${totalMealCal} kcal
                            </div>
                        </div>
                    </div>

                    <!-- Macro breakdown for meal -->
                    <div class="flex items-center gap-3 text-[11px] text-slate-400 my-2 pt-2 border-t border-slate-800/60">
                        <span>Proteine: <strong class="text-slate-300">${mealProt.toFixed(0)}g</strong></span>
                        <span class="text-slate-600">•</span>
                        <span>Carbohidrați: <strong class="text-slate-300">${mealCarb.toFixed(0)}g</strong></span>
                        <span class="text-slate-600">•</span>
                        <span>Grăsimi: <strong class="text-slate-300">${mealFat.toFixed(0)}g</strong></span>
                    </div>

                    <!-- Foods Badges -->
                    ${foodsChips ? `
                        <div class="flex flex-wrap gap-1.5 mt-2.5">
                            ${foodsChips}
                        </div>
                    ` : ''}

                    <!-- Action Buttons -->
                    <div class="flex justify-between items-center mt-3 pt-3 border-t border-slate-800/80">
                        <span class="text-[11px] text-slate-500">ID: ${meal.id.slice(-6)}</span>
                        <div class="flex items-center gap-2">
                            <button onclick="editHistoryMeal('${meal.id}')" class="text-xs text-white bg-indigo-600 hover:bg-indigo-500 active:scale-95 px-3 py-1.5 rounded-lg transition-all font-semibold flex items-center gap-1 shadow-sm">
                                <i data-lucide="edit-3" class="w-3.5 h-3.5"></i> Modifică
                            </button>
                            <button onclick="deleteMeal('${meal.id}')" class="text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 p-1.5 rounded-lg transition-all" title="Șterge Masa">
                                <i data-lucide="trash-2" class="w-4 h-4"></i>
                            </button>
                        </div>
                    </div>
                `;
                bodyEl.appendChild(mealItem);
            });

            // Quick Add Meal Footer for this date
            const addMealRow = document.createElement('div');
            addMealRow.className = "flex justify-center pt-2";
            addMealRow.innerHTML = `
                <button onclick="addMealForDate('${dateKey}')" class="text-xs bg-slate-900 hover:bg-slate-800 text-indigo-300 hover:text-indigo-200 border border-slate-800 hover:border-indigo-500/50 px-4 py-2 rounded-xl flex items-center gap-1.5 font-medium transition-all shadow-sm">
                    <i data-lucide="plus-circle" class="w-3.5 h-3.5"></i> Adaugă altă masă în această zi (${headerInfo.shortTitle})
                </button>
            `;
            bodyEl.appendChild(addMealRow);

            dayCard.appendChild(bodyEl);
        }

        container.appendChild(dayCard);
    });

    refreshIcons();
}

// --- Import / Export ---
window.exportFullJson = () => {
    Storage.exportAllData();
};

window.handleImportBackup = async (input) => {
    const file = input.files?.[0];
    if (!file) return;
    try {
        const result = await Storage.importDataFromFile(file);
        renderHistory();
        renderHealthTags();
        loadUserProfileIntoForm();
        window.recalcProfilePreview();
        renderDayActivities();
        updateAIVisibility();
        updateDynamicCaloricGauge();
        updateAnalysis();
        refreshIcons();
        alert(`Backup restaurat cu succes!\n• Mese importate: ${result.count}\n• Activități fizice/sport: ${result.activitiesCount}\n• Setări AI, Cheie API și Profil Biometric restaurate.`);
    } catch (e) {
        alert("Eroare la import: " + e.message);
    } finally {
        input.value = '';
    }
};

// --- Smart AI Actions ---
window.generateRecipe = async () => {
    if (!Storage.isAiAvailable()) {
        window.toggleSettings();
        return alert("Funcțiile AI sunt dezactivate sau conexiunea nu este stabilită. Verifică setările.");
    }
    if (currentMeal.foods.length === 0) return alert("Adaugă ingrediente în listă mai întâi!");
    
    const btn = document.getElementById('btn-chef');
    const originalHTML = btn.innerHTML;
    btn.innerHTML = `<i data-lucide="loader" class="w-5 h-5 animate-spin"></i>`;
    refreshIcons();

    const ingredients = currentMeal.foods.map(f => `${f.quantity}${f.unit} ${f.name}`).join(', ');
    const prompt = `Ești un Chef Bucătar Gourmet. Creează o rețetă delicioasă și sănătoasă folosind aceste ingrediente: ${ingredients}. Format: ## Titlu Rețetă, **Ingrediente**, **Timp & Dificultate**, **Mod de preparare pas cu pas**, **Trucuri de savoare**.`;
    
    try {
        const txt = await AI.callText(prompt);
        window.showAIModal("Rețeta Chef-ului", txt, "chef-hat");
    } catch (e) {
        alert("Eroare AI: " + e.message);
    } finally {
        btn.innerHTML = originalHTML;
        refreshIcons();
    }
};

window.analyzeHealth = async () => {
    if (!Storage.isAiAvailable()) {
        window.toggleSettings();
        return alert("Funcțiile AI sunt dezactivate sau conexiunea nu este stabilită. Verifică setările.");
    }
    if (currentMeal.foods.length === 0) return alert("Masa este goală!");
    
    const btn = document.getElementById('btn-coach');
    const originalHTML = btn.innerHTML;
    btn.innerHTML = `<i data-lucide="loader" class="w-5 h-5 animate-spin"></i>`;
    refreshIcons();

    let totalCal = 0, pro = 0, carb = 0, fat = 0;
    currentMeal.foods.forEach(f => {
        totalCal += f.calories || 0;
        if (f.nutrients) {
            f.nutrients.forEach(n => {
                const nLower = n.name.toLowerCase();
                if (nLower.includes('prot')) pro += n.qty;
                if (nLower.includes('carb')) carb += n.qty;
                if (nLower.includes('grăs') || nLower.includes('gras') || nLower.includes('lipid')) fat += n.qty;
            });
        }
    });

    const issues = healthProfile.length > 0 ? `Profil de sănătate al utilizatorului: ${healthProfile.join(', ')}.` : '';
    const prompt = `Ești Nutri Coach & Expert în nutriție funcțională.
Analizează această masă:
Ingrediente: ${JSON.stringify(currentMeal.foods.map(f => ({ name: f.name, qty: f.quantity, unit: f.unit, cal: f.calories })))}.
Total nutrienți: ${totalCal} kcal, Proteine: ${pro.toFixed(1)}g, Carbohidrați: ${carb.toFixed(1)}g, Grăsimi: ${fat.toFixed(1)}g.
${issues}

Oferă:
1. Evaluare scurtă a echilibrului nutrițional.
2. 3 sfaturi concrete și personalizate pentru optimizarea mesei (indice glicemic, sațietate, micronutrienți).`;

    try {
        const txt = await AI.callText(prompt);
        window.showAIModal("Analiză Nutri Coach", txt, "heart-pulse");
    } catch (e) {
        alert("Eroare AI: " + e.message);
    } finally {
        btn.innerHTML = originalHTML;
        refreshIcons();
    }
};

window.generateMedicalMenu = async () => {
    if (!Storage.isAiAvailable()) {
        window.toggleSettings();
        return alert("Funcțiile AI sunt dezactivate sau conexiunea nu este stabilită. Verifică setările.");
    }
    if (healthProfile.length === 0) return alert("Nu ai încărcat analize medicale încă! Încarcă un fișier CSV cu analize din asistentul de chat.");

    const btn = document.getElementById('btn-med-menu');
    const originalHTML = btn.innerHTML;
    btn.innerHTML = `<i data-lucide="loader" class="w-5 h-5 animate-spin"></i>`;
    refreshIcons();

    const prompt = `Ești medic nutriționist clinician. Pacientul are următoarele afecțiuni/parametri de atenție: ${healthProfile.join(', ')}. Creează un meniu personalizat, sigur și terapeutic pentru această masă.
JSON strict:
{
  "ingredients": [
    {
      "name": "string",
      "quantity": number,
      "unit": "string",
      "calories": number,
      "nutrients": [
        { "name": "string", "type": "string", "qty": number, "unit": "string", "rda_percent": number, "role": "string" }
      ]
    }
  ]
}`;

    try {
        const txt = await AI.callText(prompt);
        const s = txt.indexOf('{'), e = txt.lastIndexOf('}');
        if (s !== -1 && e !== -1) {
            const result = JSON.parse(txt.substring(s, e + 1));
            if (result && result.ingredients) {
                currentMeal.foods = [];
                result.ingredients.forEach(ing => {
                    if (!ing.nutrients) ing.nutrients = [];
                    if (!ing.unit) ing.unit = 'g';
                    currentMeal.foods.push(ing);
                });
                renderCurrentMeal();
                updateAnalysis();
                document.getElementById('data-source-msg').innerHTML = `<span class="text-rose-400 font-bold">🩺 Meniu Terapeutic Generat</span>`;
                window.showAIModal("Meniu Terapeutic", `Am creat o masă adaptată specific pentru: **${healthProfile.join(', ')}**.\n\nVerifică lista de ingrediente din editor!`, "stethoscope");
            }
        }
    } catch (e) {
        alert("Eroare AI: " + e.message);
    } finally {
        btn.innerHTML = originalHTML;
        refreshIcons();
    }
};

window.generateMealFromTitle = async () => {
    const title = document.getElementById('meal-name').value.trim();
    const genBtn = document.getElementById('gen-btn');
    if (!title) return alert("Scrie numele mesei mai întâi (ex: Omletă cu legume, Salată Caesar).");
    if (!Storage.isAiAvailable()) {
        window.toggleSettings();
        return alert("Funcțiile AI sunt dezactivate sau conexiunea nu este stabilită. Verifică setările.");
    }

    genBtn.disabled = true;
    const originalHtml = genBtn.innerHTML;
    genBtn.innerHTML = `<i data-lucide="loader" class="w-3 h-3 animate-spin"></i>`;
    refreshIcons();

    const prompt = `Ești nutriționist. Generează componentele și cantitățile estimate pentru preparatul: "${title}".
Returnează JSON strict:
{
  "ingredients": [
    {
      "name": "string",
      "quantity": number,
      "unit": "string",
      "calories": number,
      "nutrients": [
        { "name": "string", "type": "string", "qty": number, "unit": "string", "rda_percent": number, "role": "string" }
      ]
    }
  ]
}`;

    try {
        const txt = await AI.callText(prompt);
        const s = txt.indexOf('{'), e = txt.lastIndexOf('}');
        if (s !== -1 && e !== -1) {
            const result = JSON.parse(txt.substring(s, e + 1));
            if (result && result.ingredients) {
                result.ingredients.forEach(ing => {
                    if (!ing.nutrients) ing.nutrients = [];
                    if (!ing.unit) ing.unit = 'g';
                    currentMeal.foods.push(ing);
                });
                renderCurrentMeal();
                updateAnalysis();
                document.getElementById('data-source-msg').innerHTML = `<span class="text-purple-400">✨ Meniu generat de AI</span>`;
            }
        }
    } catch (e) {
        console.error(e);
        alert("Eroare AI: " + e.message);
    } finally {
        genBtn.disabled = false;
        genBtn.innerHTML = originalHtml;
        refreshIcons();
    }
};

window.handleImageUpload = async (input) => {
    const file = input.files?.[0];
    if (!file) return;
    if (!Storage.isAiAvailable()) {
        window.toggleSettings();
        return alert("Funcțiile AI sunt dezactivate sau conexiunea nu este stabilită. Verifică setările.");
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
        const base64Data = e.target.result.split(',')[1];
        const btn = document.getElementById('cam-btn');
        const originalHtml = btn.innerHTML;
        btn.innerHTML = `<i data-lucide="loader" class="w-3 h-3 animate-spin"></i>`;
        refreshIcons();

        try {
            const prompt = `Analizează imaginea cu mâncare. Identifică toate alimentele vizibile și estimează gramajul și caloriile.
JSON strict:
{
  "ingredients": [
    { "name": "string", "quantity": number, "unit": "g", "calories": number, "nutrients": [] }
  ]
}`;
            const txt = await AI.callVision(prompt, base64Data, file.type);
            const s = txt.indexOf('{'), end = txt.lastIndexOf('}');
            if (s !== -1 && end !== -1) {
                const res = JSON.parse(txt.substring(s, end + 1));
                if (res.ingredients) {
                    res.ingredients.forEach(ing => {
                        if (!ing.unit) ing.unit = 'g';
                        if (!ing.nutrients) ing.nutrients = [];
                        currentMeal.foods.push(ing);
                    });
                    renderCurrentMeal();
                    updateAnalysis();
                    document.getElementById('data-source-msg').innerHTML = `<span class="text-emerald-400">📷 Analiză Foto Finalizată</span>`;
                }
            }
        } catch (err) {
            console.error(err);
            alert("Eroare la analiza foto: " + err.message);
        } finally {
            btn.innerHTML = originalHtml;
            refreshIcons();
            input.value = '';
        }
    };
    reader.readAsDataURL(file);
};

// --- Nutrient Modal & Explanation ---
window.openNutrientDetail = (n) => {
    currentOpenNutrient = n;
    document.getElementById('nutrient-ai-explanation').classList.add('hidden');
    document.getElementById('modal-n-name').innerText = n.name;
    document.getElementById('modal-n-type').innerText = n.type || 'Nutrient';
    document.getElementById('modal-n-qty').innerText = (n.qty || 0).toFixed(1) + (n.unit || 'g');
    document.getElementById('modal-n-perc').innerText = (n.rda_percent || 0).toFixed(0) + '%';
    document.getElementById('modal-n-role').innerText = n.role || "Esențial pentru menținerea sănătății celulare și a metabolismului optim.";
    
    const bar = document.getElementById('modal-n-bar');
    bar.style.width = Math.min(n.rda_percent || 0, 100) + '%';
    bar.className = `h-3 rounded-full transition-all duration-700 ${(n.rda_percent || 0) > 100 ? 'bg-orange-500' : 'bg-indigo-500'}`;

    const l = document.getElementById('modal-sources-list');
    l.innerHTML = '';
    (n.sources || []).sort((a, b) => b.foodQty - a.foodQty).forEach(s => {
        l.innerHTML += `
            <li class="flex justify-between border-b border-slate-800 pb-1">
                <span class="text-slate-300">${s.foodName}</span>
                <span class="font-mono text-slate-400 font-semibold">${(s.foodQty || 0).toFixed(1)} ${n.unit || 'g'}</span>
            </li>
        `;
    });

    document.getElementById('nutrient-modal').classList.remove('hidden');
    updateAIVisibility();
    refreshIcons();
};

window.explainNutrientWithAI = async () => {
    if (!Storage.isAiAvailable()) {
        window.toggleSettings();
        return alert("Funcțiile AI sunt dezactivate sau conexiunea nu este stabilită. Verifică setările.");
    }
    if (!currentOpenNutrient) return;

    const btn = document.getElementById('btn-explain-nutrient');
    const output = document.getElementById('nutrient-ai-explanation');
    const originalHTML = btn.innerHTML;

    btn.disabled = true;
    btn.innerHTML = `<i data-lucide="loader" class="w-4 h-4 animate-spin"></i> Gândesc...`;
    refreshIcons();

    const issues = healthProfile.length > 0 ? healthProfile.join(', ') : "Nicio problemă specificată";
    const prompt = `Ești nutriționist expert.
Utilizatorul se uită la nutrientul: "${currentOpenNutrient.name}" (Cantitate: ${currentOpenNutrient.qty}${currentOpenNutrient.unit}).
Profil medical utilizator: ${issues}.

Explică foarte scurt (max 2 fraze prietenoase):
1. Rolul vital al acestui nutrient.
2. Dacă are legătură cu problemele medicale listate.`;

    try {
        const txt = await AI.callText(prompt);
        output.innerText = txt;
        output.classList.remove('hidden');
        if ('speechSynthesis' in window) {
            const u = new SpeechSynthesisUtterance(txt);
            u.lang = 'ro-RO';
            window.speechSynthesis.cancel();
            window.speechSynthesis.speak(u);
        }
    } catch (e) {
        alert("Eroare AI: " + e.message);
    } finally {
        btn.innerHTML = originalHTML;
        btn.disabled = false;
        refreshIcons();
    }
};

// --- Medical CSV Upload & Parser ---
window.handleMedicalCSV = async (input) => {
    const file = input.files?.[0];
    if (!file) return;
    if (!Storage.isAiAvailable()) {
        window.toggleSettings();
        return alert("Funcțiile AI sunt dezactivate sau conexiunea nu este stabilită. Verifică setările.");
    }

    window.toggleChat();
    const loadingId = addMessageToChat("Analizez fișierul cu analize medicale...", 'ai', true);

    const reader = new FileReader();
    reader.onload = async (e) => {
        const csvText = e.target.result;
        const prompt = `Ești medic specialist. Analizează aceste rezultate de laborator: "${csvText.substring(0, 10000)}". Identifică toți parametrii anormali sau la limită.
JSON strict:
{
  "summary_text": "text scurt explicativ în limba română",
  "identified_issues": ["ex: Colesterol mărit", "ex: Vitamina D scăzută"]
}`;

        try {
            const txt = await AI.callText(prompt);
            const s = txt.indexOf('{'), end = txt.lastIndexOf('}');
            const bubble = document.getElementById(loadingId);
            if (bubble) bubble.classList.remove('animate-pulse');

            if (s !== -1 && end !== -1) {
                const res = JSON.parse(txt.substring(s, end + 1));
                healthProfile = res.identified_issues || [];
                Storage.saveHealthProfile(healthProfile);
                renderHealthTags();

                if (bubble) {
                    bubble.innerText = res.summary_text;
                    const btnId = 'btn-audio-' + Date.now();
                    const speakBtn = document.createElement('button');
                    speakBtn.id = btnId;
                    speakBtn.className = "mt-3 text-indigo-300 hover:text-white flex items-center gap-1 text-xs bg-slate-900/50 px-2 py-1 rounded border border-slate-700 transition-colors";
                    speakBtn.innerHTML = `<i data-lucide="volume-2" class="w-3 h-3"></i> Ascultă`;
                    bubble.appendChild(speakBtn);
                    refreshIcons();
                    setTimeout(() => window.speakTextWithAutoListen(res.summary_text, btnId, true), 500);
                }
            } else if (bubble) {
                bubble.innerText = "Nu am putut interpreta datele. Asigură-te că fișierul conține analize clare.";
            }
        } catch (err) {
            const bubble = document.getElementById(loadingId);
            if (bubble) bubble.innerText = "Eroare: " + err.message;
        } finally {
            input.value = '';
        }
    };
    reader.readAsText(file);
};

// --- Speech Recognition & Text-to-Speech ---
window.toggleVoiceInput = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        return alert("Recunoașterea vocală nu este suportată direct în acest browser.");
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (recognition && recognition.started) {
        recognition.stop();
        return;
    }
    
    recognition = new SR();
    recognition.lang = 'ro-RO';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    
    const btn = document.getElementById('mic-btn');
    recognition.onstart = () => {
        recognition.started = true;
        if (btn) btn.classList.add('mic-active');
        document.getElementById('chat-input').placeholder = "Te ascult...";
    };
    
    recognition.onend = () => {
        recognition.started = false;
        if (btn) btn.classList.remove('mic-active');
        document.getElementById('chat-input').placeholder = "Scrie sau vorbește...";
    };
    
    recognition.onresult = (event) => {
        if (!event.results || !event.results[0]) return;
        const transcript = event.results[0][0].transcript;
        const t = transcript.toLowerCase();
        if (t.includes("stop") || t.includes("oprește") || t.includes("gata") || t.includes("închide")) {
            isLoopActive = false;
            window.speakSimple("Microfon oprit.");
            addMessageToChat("🛑 Dialog vocal oprit.", 'system');
            return;
        }
        document.getElementById('chat-input').value = transcript;
        window.sendChatMessage();
    };
    
    try {
        recognition.start();
    } catch (e) {
        console.warn("Speech start failed", e);
    }
};

window.speakSimple = (text) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ro-RO';
    window.speechSynthesis.speak(utterance);
};

window.speakTextWithAutoListen = (text, btnId, restartListening = true) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    isLoopActive = !!restartListening;
    
    const cleanText = text.replace(/[*#]/g, '');
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'ro-RO';
    utterance.rate = 1.05;
    
    const btn = document.getElementById(btnId);
    utterance.onstart = () => {
        if (btn) {
            btn.innerHTML = `<i data-lucide="square" class="w-3 h-3 fill-current"></i> Stop`;
            btn.classList.add('text-red-400');
            refreshIcons();
        }
    };
    
    utterance.onend = () => {
        if (btn) {
            btn.innerHTML = `<i data-lucide="volume-2" class="w-3 h-3"></i> Ascultă`;
            btn.classList.remove('text-red-400');
            refreshIcons();
        }
        if (isLoopActive) {
            setTimeout(() => window.toggleVoiceInput(), 600);
        }
    };
    
    if (btn) {
        btn.onclick = () => {
            if (window.speechSynthesis.speaking) {
                window.speechSynthesis.cancel();
                isLoopActive = false;
            } else {
                window.speakTextWithAutoListen(text, btnId, false);
            }
        };
    }
    
    window.speechSynthesis.speak(utterance);
};

// --- Chat Widget ---
function addMessageToChat(text, sender, isLoading = false) {
    const container = document.getElementById('chat-messages');
    if (!container) return;
    const div = document.createElement('div');
    const id = 'msg-' + Date.now();
    div.className = `flex ${sender === 'user' ? 'justify-end' : 'justify-start'}`;
    
    const bubbleWrapper = document.createElement('div');
    bubbleWrapper.className = `max-w-[85%] p-3 rounded-2xl ${sender === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-slate-800 text-slate-300 rounded-tl-none border border-slate-700'}`;
    
    const textSpan = document.createElement('div');
    textSpan.id = id;
    textSpan.className = "text-sm leading-relaxed";
    textSpan.innerText = text;
    
    bubbleWrapper.appendChild(textSpan);
    div.appendChild(bubbleWrapper);
    
    if (isLoading) textSpan.classList.add('animate-pulse');
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    return id;
}

window.sendChatMessage = async () => {
    const input = document.getElementById('chat-input');
    const msg = input.value.trim();
    if (!msg) return;
    if (!Storage.isAiAvailable()) {
        window.toggleSettings();
        return alert("Funcțiile AI sunt dezactivate sau conexiunea nu este stabilită. Verifică setările.");
    }

    addMessageToChat(msg, 'user');
    input.value = '';
    const loadingId = addMessageToChat("Gândesc...", 'ai', true);

    const mealContext = currentMeal.foods.length > 0
        ? `Masa curentă conține: ${JSON.stringify(currentMeal.foods.map(f => ({ name: f.name, qty: f.quantity, unit: f.unit })))}`
        : `Masa este goală momentan.`;
    const healthContext = healthProfile.length > 0 ? `Profil medical utilizator: ${healthProfile.join(', ')}.` : '';

    const prompt = `Ești un asistent nutrițional prietenos și expert în limba română.
Context masă curentă: ${mealContext}
Context medical: ${healthContext}
Mesajul utilizatorului: "${msg}".

REGULI OBLIGATORII:
1. Dacă utilizatorul cere o masă, o rețetă, ingrediente, lista sau analiza de nutrienți a unui aliment (ex: "arată-mi nutrienții pentru...", "ce vitamine conține...", "modifică nutrienții pentru..."):
   - Pune alimentele în array-ul "ingredients" cu cantitatea, unitatea, caloriile și spectrul complet de nutrienți calculați.
   - Dacă alimentul există deja în masa curentă, specifică același nume sau numele preparatului; datele sale (cantitate, calorii și spectrul de nutrienți) vor fi actualizate direct în masă și în baza locală.
   - Dacă alimentul nu există încă în masă, va fi inclus automat în lista mesei curente.
2. Folosește STRICT denumiri canonice standardizate în limba română pentru fiecare nutrient (ex: "Vitamina B9 (Acid folic)", "Vitamina B12 (Cobalamină)", "Vitamina C (Acid ascorbic)", "Vitamina D", "Fier", "Calciu", "Magneziu", "Potasiu", "Zinc", "Proteine", "Carbohidrați", "Grăsimi", "Fibre", "Sodiu", etc.).
3. În proprietatea "reply", scrie EXCLUSIV un mesaj prietenos, scurt și natural în limba română (ex: "Ți-am actualizat lista de nutrienți pentru somon direct în masă și în baza locală!"). Poți rezuma pe scurt principalii nutrienți.
4. NU afișa NICIODATĂ cod JSON, paranteze { } sau detalii tehnice brute în textul din "reply".

Returnează STRICT JSON valid:
{
  "action": "generate" | "modify" | "modify_nutrients" | "delete" | "scale" | "chat",
  "reply": "Răspuns prietenos în limba română fără cod sau JSON",
  "ingredients": [
    {
      "name": "string",
      "quantity": number,
      "unit": "g" | "ml" | "buc",
      "calories": number,
      "nutrients": [
        { "name": "string", "type": "Macro" | "Micro", "qty": number, "unit": "string", "rda_percent": number, "role": "string" }
      ]
    }
  ],
  "target": "string",
  "new_quantity": number,
  "factor": number
}`;

    try {
        const responseText = await AI.callText(prompt);
        const bubble = document.getElementById(loadingId);
        if (bubble) bubble.classList.remove('animate-pulse');

        const btnId = 'btn-audio-' + Date.now();
        const speakBtn = document.createElement('button');
        speakBtn.id = btnId;
        speakBtn.className = "mt-3 text-indigo-300 hover:text-white flex items-center gap-1 text-xs bg-slate-900/50 px-2 py-1 rounded border border-slate-700 transition-colors";
        speakBtn.innerHTML = `<i data-lucide="volume-2" class="w-3 h-3"></i> Ascultă`;

        let jsonStart = responseText.indexOf('{'), jsonEnd = responseText.lastIndexOf('}');
        let cleanReply = "";

        if (jsonStart !== -1 && jsonEnd !== -1) {
            try {
                const jsonResponse = JSON.parse(responseText.substring(jsonStart, jsonEnd + 1));
                let replyText = jsonResponse.reply || "";

                // Process ingredients if returned by AI (generate, modify, modify_nutrients, chat with nutrients)
                if (Array.isArray(jsonResponse.ingredients) && jsonResponse.ingredients.length > 0) {
                    const updatedNames = [];
                    jsonResponse.ingredients.forEach(ing => {
                        const normNuts = normalizeNutrientsArray(ing.nutrients || []);
                        const unit = ing.unit || 'g';
                        const qty = parseFloat(ing.quantity) || 100;
                        const cals = parseInt(ing.calories) || 0;
                        
                        // Check if food is already in current meal (fuzzy match)
                        const ingKey = (ing.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
                        const existingIndex = currentMeal.foods.findIndex(f => {
                            const fKey = (f.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
                            return fKey === ingKey || fKey.includes(ingKey) || ingKey.includes(fKey);
                        });

                        if (existingIndex > -1) {
                            // Modify existing food in meal in-place
                            const prevFood = currentMeal.foods[existingIndex];
                            currentMeal.foods[existingIndex] = {
                                ...prevFood,
                                name: ing.name || prevFood.name,
                                quantity: qty > 0 ? qty : prevFood.quantity,
                                unit: unit || prevFood.unit,
                                calories: cals > 0 ? cals : prevFood.calories,
                                nutrients: normNuts.length > 0 ? normNuts : (prevFood.nutrients || [])
                            };
                            updatedNames.push(`${ing.name} (actualizat)`);
                        } else {
                            // Add new food to current meal
                            const processedIng = {
                                name: ing.name,
                                unit,
                                quantity: qty,
                                calories: cals,
                                nutrients: normNuts
                            };
                            currentMeal.foods.push(processedIng);
                            updatedNames.push(`${ing.name} (${qty}${unit})`);
                        }

                        // Auto-save to local analyzed foods cache (normalized to 100g/100ml/1 buc)
                        const isPiece = (unit === 'buc' || unit === 'felie' || unit === 'ou' || unit === 'portie');
                        const factor = isPiece ? (1 / (qty || 1)) : (100 / (qty || 100));
                        Storage.saveAnalyzedFood({
                            name: ing.name,
                            baseQty: isPiece ? 1 : 100,
                            baseUnit: isPiece ? 'buc' : (unit === 'ml' ? 'ml' : 'g'),
                            calories: Math.round(cals * factor),
                            nutrients: normNuts.map(n => ({
                                ...n,
                                qty: parseFloat(((parseFloat(n.qty) || 0) * factor).toFixed(2))
                            })),
                            source: 'Asistent Chat AI'
                        });
                    });

                    if (!replyText || replyText.includes('{') || replyText.includes('"action"')) {
                        replyText = `Am actualizat în masa curentă: ${updatedNames.join(', ')}.`;
                    }
                } else if (jsonResponse.action === 'delete') {
                    if (jsonResponse.target === 'all') {
                        currentMeal.foods = [];
                        replyText = replyText || "Am golit lista mesei.";
                    } else if (jsonResponse.target) {
                        const t = jsonResponse.target.toLowerCase();
                        currentMeal.foods = currentMeal.foods.filter(f => !f.name.toLowerCase().includes(t));
                        replyText = replyText || `Am șters ${jsonResponse.target} din listă.`;
                    }
                } else if (jsonResponse.action === 'modify' && jsonResponse.target) {
                    const t = jsonResponse.target.toLowerCase();
                    currentMeal.foods.forEach(f => {
                        if (f.name.toLowerCase().includes(t)) {
                            f.quantity = jsonResponse.new_quantity || f.quantity;
                            if (jsonResponse.new_unit) f.unit = jsonResponse.new_unit;
                        }
                    });
                } else if (jsonResponse.action === 'scale') {
                    const factor = jsonResponse.factor || 1;
                    currentMeal.foods.forEach(f => {
                        f.quantity *= factor;
                        f.calories = Math.round(f.calories * factor);
                        if (f.nutrients) f.nutrients.forEach(n => n.qty *= factor);
                    });
                }

                // Strip any accidental JSON snippets from the reply
                cleanReply = replyText.replace(/```json[\s\S]*?```/gi, '')
                                      .replace(/```[\s\S]*?```/gi, '')
                                      .replace(/\{[\s\S]*?\}/g, '')
                                      .replace(/"action":.*?,/gi, '')
                                      .replace(/"reply":/gi, '')
                                      .replace(/[{}"]/g, '')
                                      .trim();

                if (!cleanReply) {
                    cleanReply = "Am procesat cererea și am actualizat lista mesei și a nutrienților!";
                }

                renderCurrentMeal();
                updateAnalysis();
                updateDynamicCaloricGauge();
                updateAIVisibility();
                if (bubble) bubble.innerText = cleanReply;
                document.getElementById('data-source-msg').innerHTML = `<span class="text-purple-400 font-semibold">💬 Comandă prin Asistent</span>`;
            } catch (e) {
                cleanReply = responseText.replace(/```json[\s\S]*?```/gi, '')
                                         .replace(/```[\s\S]*?```/gi, '')
                                         .replace(/\{[\s\S]*?\}/g, '')
                                         .replace(/[{}"]/g, '')
                                         .trim();
                if (!cleanReply) cleanReply = "Am adăugat alimentele în lista mesei tale.";
                if (bubble) bubble.innerText = cleanReply;
            }
        } else {
            cleanReply = responseText.replace(/```json[\s\S]*?```/gi, '')
                                     .replace(/```[\s\S]*?```/gi, '')
                                     .replace(/\{[\s\S]*?\}/g, '')
                                     .trim();
            if (!cleanReply) cleanReply = responseText;
            if (bubble) bubble.innerText = cleanReply;
        }

        if (bubble) {
            bubble.appendChild(speakBtn);
            refreshIcons();
            setTimeout(() => window.speakTextWithAutoListen(cleanReply, btnId, true), 200);
        }
    } catch (e) {
        const bubble = document.getElementById(loadingId);
        if (bubble) bubble.innerText = `Eroare: ${e.message}`;
    }
};

// --- Settings & Key Management ---
window.handleModelSelectChange = (val) => {
    const container = document.getElementById('custom-model-container');
    if (!container) return;
    if (val === 'custom') {
        container.classList.remove('hidden');
    } else {
        container.classList.add('hidden');
    }
};

window.refreshAvailableModels = async () => {
    const rawKey = document.getElementById('api-key-input').value;
    const key = rawKey ? rawKey.trim() : Storage.getApiKey();
    const btn = document.getElementById('refresh-models-btn');
    const errEl = document.getElementById('api-key-error');

    if (!key) {
        errEl.innerHTML = "Introdu cheia API mai întâi pentru a scana modelele disponibile.";
        errEl.classList.remove('hidden');
        return;
    }

    const origHTML = btn.innerHTML;
    btn.innerHTML = `<i data-lucide="loader" class="w-3 h-3 animate-spin"></i> <span>Scanez...</span>`;
    errEl.classList.add('hidden');
    refreshIcons();

    try {
        const models = await AI.listAvailableModels(key);
        if (models.length === 0) {
            alert("Nu am găsit modele disponibile pentru această cheie.");
            return;
        }

        const select = document.getElementById('model-select');
        const currentVal = select.value;
        select.innerHTML = '';

        // Add dynamically scanned models
        models.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = `${m.id} (${m.displayName || 'Google Gemini'})`;
            select.appendChild(opt);
        });

        // Add Auto and Custom options
        const autoOpt = document.createElement('option');
        autoOpt.value = 'auto';
        autoOpt.textContent = 'Auto-Detectare dinamică';
        select.appendChild(autoOpt);

        const customOpt = document.createElement('option');
        customOpt.value = 'custom';
        customOpt.textContent = '✏️ Model Personalizat / Manual...';
        select.appendChild(customOpt);

        if (models.some(m => m.id === currentVal) || currentVal === 'auto' || currentVal === 'custom') {
            select.value = currentVal;
        } else {
            select.value = models[0].id;
        }

        window.handleModelSelectChange(select.value);
        alert(`Am găsit ${models.length} modele disponibile în contul tău Google AI Studio!`);
    } catch (err) {
        errEl.innerHTML = `<strong>Eroare scanare:</strong> ${err.message}`;
        errEl.classList.remove('hidden');
    } finally {
        btn.innerHTML = origHTML;
        refreshIcons();
    }
};

window.clearApiKey = () => {
    Storage.clearApiKey();
    document.getElementById('api-key-input').value = '';
    document.getElementById('custom-model-input').value = '';
    const errEl = document.getElementById('api-key-error');
    if (errEl) errEl.classList.add('hidden');
    updateAIVisibility();
    alert("Cheia API a fost ștearsă și conexiunea AI a fost oprită.");
};

window.saveApiKey = async () => {
    const rawKey = document.getElementById('api-key-input').value;
    const key = rawKey ? rawKey.trim() : "";
    const btn = document.getElementById('save-api-btn');
    const errEl = document.getElementById('api-key-error');

    const modelSelect = document.getElementById('model-select');
    const selectedModelType = modelSelect ? modelSelect.value : 'gemini-flash-latest';
    const customModelInput = document.getElementById('custom-model-input');
    const customModelName = customModelInput ? customModelInput.value.trim() : '';

    // Always save model preferences
    Storage.saveSelectedModelType(selectedModelType);
    if (customModelName) Storage.saveCustomModelName(customModelName);

    if (!key) {
        Storage.clearApiKey();
        Storage.setAiConnected(false);
        updateAIVisibility();
        if (errEl) errEl.classList.add('hidden');
        alert("Preferințele au fost salvate. Conexiunea AI este oprită (fără cheie API).");
        return;
    }

    if (key.length < 5) {
        errEl.innerHTML = "Te rugăm să introduci o cheie API validă din Google AI Studio sau să lași câmpul gol pentru mod offline.";
        errEl.classList.remove('hidden');
        Storage.setAiConnected(false);
        updateAIVisibility();
        return;
    }

    if (selectedModelType === 'custom' && !customModelName) {
        errEl.innerHTML = "Te rugăm să specifici numele modelului personalizat (ex: gemini-2.5-flash).";
        errEl.classList.remove('hidden');
        return;
    }

    btn.disabled = true;
    const originalBtnHTML = btn.innerHTML;
    btn.innerHTML = `<i data-lucide="loader" class="w-4 h-4 animate-spin"></i> Testare conexiune...`;
    errEl.classList.add('hidden');
    refreshIcons();

    try {
        Storage.saveApiKey(key);
        const effectiveModel = Storage.getTargetModel();
        await AI.testConnection(key, effectiveModel);

        Storage.setAiConnected(true);
        Storage.setAiEnabled(true);
        updateAIVisibility();

        alert(`Conexiune la AI stabilită cu succes!\nModel activ: ${effectiveModel}`);
        window.toggleSettings();
    } catch (err) {
        Storage.setAiConnected(false);
        updateAIVisibility();
        errEl.innerHTML = `<strong>Eroare conectare:</strong> ${err.message || 'Verifică cheia API și conexiunea la internet.'}`;
        errEl.classList.remove('hidden');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalBtnHTML;
        refreshIcons();
    }
};

// --- Calories Report Controllers ---
window.openCaloriesReportModal = () => {
    const modal = document.getElementById('calories-report-modal');
    if (!modal) return;
    
    const meals = Storage.getMeals();
    const allActivities = Storage.getActivities();
    const metrics = Storage.calculateMetrics();
    const targetCal = metrics.targetCalories || 2000;
    const bmr = metrics.bmr || 1600;
    
    // Group days with meals or activities
    const dayMap = {};
    meals.forEach(m => {
        const dStr = m.date ? m.date.slice(0, 10) : 'Necunoscut';
        if (!dayMap[dStr]) {
            dayMap[dStr] = { date: dStr, meals: [], totalCal: 0, activities: [] };
        }
        const mealCal = (m.foods || []).reduce((acc, f) => acc + (f.calories || 0), 0);
        dayMap[dStr].meals.push({ name: m.name || 'Masă', cal: mealCal, foodsCount: (m.foods || []).length });
        dayMap[dStr].totalCal += mealCal;
    });

    allActivities.forEach(act => {
        const dStr = act.date || 'Necunoscut';
        if (!dayMap[dStr]) {
            dayMap[dStr] = { date: dStr, meals: [], totalCal: 0, activities: [] };
        }
        dayMap[dStr].activities.push(act);
    });

    const dayKeys = Object.keys(dayMap).sort().reverse();
    const dayCount = dayKeys.length;
    
    let totalAllDaysCal = 0;
    let totalAllDaysBurned = 0;
    dayKeys.forEach(k => {
        totalAllDaysCal += dayMap[k].totalCal;
        const actBurned = (dayMap[k].activities || []).reduce((acc, a) => acc + (a.burnedCalories || 0), 0);
        totalAllDaysBurned += actBurned;
    });
    const avgCal = dayCount > 0 ? Math.round(totalAllDaysCal / dayCount) : 0;
    const balance = avgCal > 0 ? avgCal - targetCal : 0;

    // Update Summary Cards
    const targetEl = document.getElementById('rep-target-cal');
    const avgEl = document.getElementById('rep-avg-cal');
    const balEl = document.getElementById('rep-balance-cal');
    const balBadge = document.getElementById('rep-balance-badge');
    const countEl = document.getElementById('rep-days-count');

    if (targetEl) targetEl.innerText = targetCal;
    if (avgEl) avgEl.innerText = avgCal;
    if (balEl) {
        balEl.innerText = (balance > 0 ? `+${balance}` : `${balance}`);
        balEl.className = `font-mono text-lg font-bold mt-0.5 ${balance <= 0 ? 'text-emerald-400' : 'text-amber-400'}`;
    }
    if (balBadge) {
        if (dayCount === 0) {
            balBadge.innerText = "-";
            balBadge.className = "text-[10px] text-slate-500 font-semibold";
        } else if (Math.abs(balance) <= 50) {
            balBadge.innerText = "Echilibru";
            balBadge.className = "text-[10px] text-emerald-400 font-semibold";
        } else if (balance < 0) {
            balBadge.innerText = `Deficit (${Math.abs(balance)} kcal)`;
            balBadge.className = "text-[10px] text-emerald-400 font-semibold";
        } else {
            balBadge.innerText = `Surplus (+${balance} kcal)`;
            balBadge.className = "text-[10px] text-amber-400 font-semibold";
        }
    }
    if (countEl) countEl.innerText = dayCount;

    // Render Daily Breakdown
    const listEl = document.getElementById('rep-calories-days-list');
    if (listEl) {
        listEl.innerHTML = '';
        if (dayCount === 0) {
            listEl.innerHTML = `<div class="text-center py-6 text-slate-500 text-xs bg-slate-950/60 rounded-xl border border-slate-800">Nu există date în jurnal.</div>`;
        } else {
            dayKeys.forEach(k => {
                const day = dayMap[k];
                const dayBalance = Storage.calculateDailyEnergyBalance(day.date);
                const pct = targetCal > 0 ? Math.min(Math.round((day.totalCal / targetCal) * 100), 150) : 0;
                const diff = day.totalCal - targetCal;
                const dateObj = new Date(day.date);
                const dateDisplay = isNaN(dateObj.getTime()) ? day.date : dateObj.toLocaleDateString('ro-RO', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });

                const item = document.createElement('div');
                item.className = "bg-slate-950 p-3.5 rounded-xl border border-slate-800 hover:border-slate-700 transition-all";
                item.innerHTML = `
                    <div class="flex justify-between items-center mb-2">
                        <div>
                            <span class="font-bold text-white text-xs capitalize">${dateDisplay}</span>
                            <span class="text-[10px] text-slate-500 ml-2">(${day.meals.length} mese, ${day.activities.length} sport)</span>
                        </div>
                        <div class="flex items-center gap-2">
                            <span class="font-mono text-xs font-bold text-white">${day.totalCal} / ${targetCal} kcal</span>
                            <span class="text-[10px] px-2 py-0.5 rounded font-bold ${diff <= 0 ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800' : 'bg-amber-950/60 text-amber-300 border border-amber-800'}">
                                ${diff > 0 ? `+${diff} surplus` : `${diff} deficit`}
                            </span>
                        </div>
                    </div>
                    <div class="w-full bg-slate-800 h-2 rounded-full overflow-hidden mb-2">
                        <div class="h-full rounded-full transition-all duration-500 ${pct > 105 ? 'bg-amber-500' : 'bg-emerald-500'}" style="width: ${Math.min(pct, 100)}%"></div>
                    </div>
                    <div class="flex flex-wrap items-center justify-between gap-1.5 text-[10px] pt-1">
                        <div class="flex flex-wrap gap-1 text-slate-400">
                            ${day.meals.map(m => `<span class="bg-slate-900 px-2 py-0.5 rounded border border-slate-800">${m.name}: <strong class="text-slate-200">${m.cal} kcal</strong></span>`).join('')}
                        </div>
                        <div class="flex items-center gap-2 text-[10px]">
                            ${dayBalance.sportCalories > 0 ? `<span class="text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800 font-bold">🏃 Sport: -${dayBalance.sportCalories} kcal</span>` : ''}
                            ${dayBalance.tefCalories > 0 ? `<span class="text-indigo-300 bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-800">TEF: -${dayBalance.tefCalories} kcal</span>` : ''}
                        </div>
                    </div>
                `;
                listEl.appendChild(item);
            });
        }
    }

    modal.classList.remove('hidden');
    refreshIcons();
};

window.closeCaloriesReportModal = () => {
    const modal = document.getElementById('calories-report-modal');
    if (modal) modal.classList.add('hidden');
};

// --- Deficiencies Report Controllers ---
window.openDeficienciesReportModal = () => {
    const modal = document.getElementById('deficiencies-report-modal');
    if (!modal) return;

    const meals = Storage.getMeals();
    const userProf = Storage.getUserProfile();
    const healthIssues = userProf.healthIssues || Storage.getHealthProfile() || [];

    // Standard Reference Daily Intake (DZR)
    const DZR_STANDARDS = {
        'Proteine': { name: 'Proteine', unit: 'g', target: 60, role: 'Construcție & refacere celulară', foods: 'Piept de pui, ouă, ton, somon, iaurt grecesc, linte' },
        'Carbohidrați': { name: 'Carbohidrați', unit: 'g', target: 250, role: 'Energie principală pentru creier & mușchi', foods: 'Ovăz, orez, cartofi dulci, leguminoase' },
        'Grăsimi': { name: 'Grăsimi Sănătoase', unit: 'g', target: 70, role: 'Echilibru hormonal & asimilare vitamine', foods: 'Ulei de măsline, avocado, nuci, pește gras' },
        'Fibre': { name: 'Fibre Dietetice', unit: 'g', target: 30, role: 'Tranzit intestinal & microbiom sănătos', foods: 'Semințe de in, tărâțe, legume verzi, mere, ovăz' },
        'Vitamina C': { name: 'Vitamina C', unit: 'mg', target: 80, role: 'Imunitate, sinteză colagen & antioxidant', foods: 'Ardei gras, căpșuni, citrice, broccoli, pătrunjel' },
        'Vitamina D': { name: 'Vitamina D', unit: 'µg', target: 15, role: 'Fixare calciu, sănătate osoasă & imunitate', foods: 'Somon, ouă întregi, ficat de cod, ciuperci' },
        'Vitamina A': { name: 'Vitamina A', unit: 'µg', target: 800, role: 'Vedere, regenerare piele & mucoase', foods: 'Morcovi, spanac, cartofi dulci, ouă, unt' },
        'Vitamina B12': { name: 'Vitamina B12', unit: 'µg', target: 2.5, role: 'Sistem nervos & formare eritrocite', foods: 'Carne slabă, pește, ouă, produse lactate' },
        'Fier': { name: 'Fier', unit: 'mg', target: 14, role: 'Transport de oxigen în organism', foods: 'Spanac, carne roșie slabă, linte, semințe de dovleac' },
        'Calciu': { name: 'Calciu', unit: 'mg', target: 1000, role: 'Densitate osoasă & contracție musculară', foods: 'Iaurt, lapte, brânză, susan, migdale, broccoli' },
        'Magneziu': { name: 'Magneziu', unit: 'mg', target: 375, role: 'Relaxare musculară, somn & sinteză ATP', foods: 'Semințe de dovleac, migdale, spanac, ciocolată neagră' },
        'Potasiu': { name: 'Potasiu', unit: 'mg', target: 3500, role: 'Reglare tensiune arterială & echilibru hidric', foods: 'Banane, avocado, cartofi copți, spanac, roșii' }
    };

    // Calculate recorded unique days
    const daySet = new Set();
    meals.forEach(m => {
        if (m.date) daySet.add(m.date.slice(0, 10));
    });
    const daysCount = Math.max(daySet.size, 1);

    // Sum nutrients across all meals
    const nutrientTotals = {};
    meals.forEach(m => {
        (m.foods || []).forEach(f => {
            (f.nutrients || []).forEach(n => {
                const nName = n.name || '';
                for (const key in DZR_STANDARDS) {
                    if (nName.toLowerCase().includes(key.toLowerCase()) || key.toLowerCase().includes(nName.toLowerCase())) {
                        nutrientTotals[key] = (nutrientTotals[key] || 0) + (parseFloat(n.qty) || 0);
                        break;
                    }
                }
            });
        });
    });

    const results = [];
    const deficiencies = [];

    for (const key in DZR_STANDARDS) {
        const std = DZR_STANDARDS[key];
        const total = nutrientTotals[key] || 0;
        const dailyAvg = total / daysCount;
        const percent = Math.round((dailyAvg / std.target) * 100);
        const deficitPercent = Math.max(0, 100 - percent);

        const item = {
            key,
            name: std.name,
            unit: std.unit,
            target: std.target,
            dailyAvg: parseFloat(dailyAvg.toFixed(1)),
            percent,
            deficitPercent,
            role: std.role,
            foods: std.foods
        };
        results.push(item);
        if (meals.length > 0 && percent < 70) {
            deficiencies.push(item);
        }
    }

    // Alert Box
    const alertBox = document.getElementById('deficiencies-alert-box');
    if (alertBox) {
        if (meals.length === 0) {
            alertBox.className = "p-3.5 rounded-xl border bg-slate-950 border-slate-800 text-slate-400 text-xs flex items-center gap-2.5";
            alertBox.innerHTML = `<i data-lucide="info" class="w-4 h-4 text-indigo-400 shrink-0"></i> <span>Jurnalul este gol. Înregistrează mese pentru a calcula automat raportul de micronutrienți.</span>`;
        } else if (deficiencies.length === 0) {
            alertBox.className = "p-3.5 rounded-xl border bg-emerald-950/40 border-emerald-800/60 text-emerald-300 text-xs flex items-center gap-2.5";
            alertBox.innerHTML = `<i data-lucide="check-circle" class="w-4 h-4 text-emerald-400 shrink-0"></i> <span>Felicitări! Nu s-au detectat deficiențe majore. Toți nutrienții cheie depășesc 70% din DZR.</span>`;
        } else {
            alertBox.className = "p-3.5 rounded-xl border bg-amber-950/40 border-amber-800/60 text-amber-200 text-xs";
            alertBox.innerHTML = `
                <div class="flex items-center gap-2 font-bold mb-1">
                    <i data-lucide="alert-triangle" class="w-4 h-4 text-amber-400"></i>
                    <span>Atenție: ${deficiencies.length} nutrienți au un aport mediu zilnic sub 70% din DZR!</span>
                </div>
                <div class="text-[11px] text-amber-300/80">
                    Deficite identificate: <strong>${deficiencies.map(d => `${d.name} (Deficit ${d.deficitPercent}%)`).join(', ')}</strong>. Consultă recomandările de mai jos.
                </div>
            `;
        }
    }

    // Progress Bars Grid
    const grid = document.getElementById('deficiencies-nutrients-grid');
    if (grid) {
        grid.innerHTML = '';
        results.forEach(r => {
            let color = 'bg-emerald-500';
            let textColor = 'text-emerald-400';
            let statusText = `✓ ${r.percent}% DZR`;
            if (r.percent < 50) {
                color = 'bg-rose-500';
                textColor = 'text-rose-400';
                statusText = `Deficit: ${r.deficitPercent}% (${r.percent}% DZR)`;
            } else if (r.percent < 70) {
                color = 'bg-amber-500';
                textColor = 'text-amber-400';
                statusText = `Deficit: ${r.deficitPercent}% (${r.percent}% DZR)`;
            } else if (r.percent > 100) {
                color = 'bg-indigo-500';
                textColor = 'text-indigo-400';
                statusText = `+${r.percent - 100}% peste DZR`;
            }

            const card = document.createElement('div');
            card.className = "bg-slate-950 p-3 rounded-xl border border-slate-800 hover:border-slate-700 transition-colors";
            card.innerHTML = `
                <div class="flex justify-between items-start mb-1.5">
                    <div>
                        <div class="font-bold text-white text-xs">${r.name}</div>
                        <div class="text-[10px] text-slate-500">${r.role}</div>
                    </div>
                    <div class="text-right">
                        <div class="font-mono text-xs font-bold text-white">${r.dailyAvg} / ${r.target} ${r.unit}</div>
                        <div class="font-bold text-[10px] ${textColor}">${statusText}</div>
                    </div>
                </div>
                <div class="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                    <div class="${color} h-full rounded-full transition-all duration-500" style="width: ${Math.min(r.percent, 100)}%"></div>
                </div>
            `;
            grid.appendChild(card);
        });
    }

    // Recommendations
    const recBox = document.getElementById('deficiencies-recommendations');
    if (recBox) {
        recBox.innerHTML = `
            <h4 class="text-xs font-bold text-indigo-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <i data-lucide="sparkles" class="w-3.5 h-3.5 text-indigo-400"></i> Recomandări Personalizate de Corecție
            </h4>
            ${deficiencies.length > 0 ? `
                <div class="space-y-2 mb-3">
                    ${deficiencies.map(d => `
                        <div class="text-xs bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                            <span class="font-bold text-amber-300">${d.name}:</span>
                            <span class="text-slate-300 text-[11px] ml-1">Include mai des în alimentație: <strong class="text-white">${d.foods}</strong>.</span>
                        </div>
                    `).join('')}
                </div>
            ` : `
                <p class="text-xs text-slate-300 mb-2">Continuă să menții diversitatea alimentară actuală pentru a asigura necesarul complet de micronutrienți.</p>
            `}
            ${healthIssues.length > 0 ? `
                <div class="pt-2 border-t border-indigo-900/50 text-[11px] text-slate-400">
                    <span class="font-bold text-rose-300">Adaptare Medicală (${healthIssues.join(', ')}):</span>
                    Asigură-te că alimentele recomandate respectă indicațiile medicului tău curant.
                </div>
            ` : ''}
        `;
    }

    modal.classList.remove('hidden');
    refreshIcons();
};

window.closeDeficienciesReportModal = () => {
    const modal = document.getElementById('deficiencies-report-modal');
    if (modal) modal.classList.add('hidden');
};

// --- PDF Report Controllers ---
window.openPDFModal = () => {
    const modal = document.getElementById('pdf-modal');
    if (!modal) return;
    const now = new Date();
    const monthSelect = document.getElementById('pdf-month-select');
    const yearSelect = document.getElementById('pdf-year-select');
    if (monthSelect) monthSelect.value = now.getMonth();
    if (yearSelect) yearSelect.value = now.getFullYear();
    modal.classList.remove('hidden');
    refreshIcons();
};

window.closePDFModal = () => {
    const modal = document.getElementById('pdf-modal');
    if (modal) modal.classList.add('hidden');
};

window.downloadMonthlyPDF = async () => {
    const monthSelect = document.getElementById('pdf-month-select');
    const yearSelect = document.getElementById('pdf-year-select');
    const totalsOnlyCheck = document.getElementById('pdf-totals-only');
    const month = parseInt(monthSelect ? monthSelect.value : new Date().getMonth());
    const year = parseInt(yearSelect ? yearSelect.value : new Date().getFullYear());
    const totalsOnly = totalsOnlyCheck ? totalsOnlyCheck.checked : false;
    const btn = document.getElementById('download-pdf-btn');
    const origHTML = btn ? btn.innerHTML : '';

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i data-lucide="loader" class="w-4 h-4 animate-spin"></i> Generare PDF...`;
        refreshIcons();
    }

    try {
        await PDFReport.exportToPDF(year, month, { totalsOnly });
        window.closePDFModal();
    } catch (e) {
        alert("Eroare la exportul PDF: " + e.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = origHTML;
            refreshIcons();
        }
    }
};

window.previewMonthlyPDF = () => {
    const monthSelect = document.getElementById('pdf-month-select');
    const yearSelect = document.getElementById('pdf-year-select');
    const totalsOnlyCheck = document.getElementById('pdf-totals-only');
    const month = parseInt(monthSelect ? monthSelect.value : new Date().getMonth());
    const year = parseInt(yearSelect ? yearSelect.value : new Date().getFullYear());
    const totalsOnly = totalsOnlyCheck ? totalsOnlyCheck.checked : false;
    PDFReport.previewReport(year, month, { totalsOnly });
};

// =========================================================================
// AI Analyzed Foods Database Controllers & Reanalysis UI
// =========================================================================

let analyzedFoodsSearchQuery = '';

window.cancelCurrentAIAction = () => {
    AI.abortCurrentRequest();
    const sourceMsg = document.getElementById('data-source-msg');
    if (sourceMsg) {
        sourceMsg.innerHTML = `<span class="text-rose-400 font-medium flex items-center gap-1.5"><i data-lucide="stop-circle" class="w-4 h-4"></i> Analiza AI a fost oprită de utilizator.</span>`;
    }
    const globalStatus = document.getElementById('analyzed-foods-global-status');
    if (globalStatus) {
        globalStatus.classList.remove('hidden');
        globalStatus.innerHTML = `<span class="text-rose-300 font-medium flex items-center gap-1.5"><i data-lucide="stop-circle" class="w-4 h-4 text-rose-400"></i> Reanalizarea AI a fost oprită.</span>`;
        setTimeout(() => { globalStatus.classList.add('hidden'); }, 3500);
    }
    refreshIcons();
};

window.openAnalyzedFoodsModal = () => {
    const modal = document.getElementById('analyzed-foods-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    analyzedFoodsSearchQuery = '';
    const searchInput = document.getElementById('analyzed-foods-search');
    if (searchInput) searchInput.value = '';
    const clearBtn = document.getElementById('clear-analyzed-search-btn');
    if (clearBtn) clearBtn.classList.add('hidden');
    window.renderAnalyzedFoodsList();
    refreshIcons();
};

window.closeAnalyzedFoodsModal = () => {
    const modal = document.getElementById('analyzed-foods-modal');
    if (modal) modal.classList.add('hidden');
};

window.filterAnalyzedFoods = (query) => {
    analyzedFoodsSearchQuery = (query || '').trim();
    const clearBtn = document.getElementById('clear-analyzed-search-btn');
    if (clearBtn) {
        if (analyzedFoodsSearchQuery) clearBtn.classList.remove('hidden');
        else clearBtn.classList.add('hidden');
    }
    window.renderAnalyzedFoodsList();
};

window.clearAnalyzedFoodsSearch = () => {
    analyzedFoodsSearchQuery = '';
    const searchInput = document.getElementById('analyzed-foods-search');
    if (searchInput) searchInput.value = '';
    const clearBtn = document.getElementById('clear-analyzed-search-btn');
    if (clearBtn) clearBtn.classList.add('hidden');
    window.renderAnalyzedFoodsList();
};

window.renderAnalyzedFoodsList = () => {
    const container = document.getElementById('analyzed-foods-list');
    const badge = document.getElementById('analyzed-foods-count-badge');
    if (!container) return;

    const foods = Storage.getAnalyzedFoods();
    if (badge) {
        badge.innerText = `${foods.length} aliment${foods.length === 1 ? '' : 'e'}`;
    }

    // Filter if search query is active (diacritics-insensitive bidirectional search)
    let displayList = foods;
    if (analyzedFoodsSearchQuery) {
        const qClean = removeDiacritics(analyzedFoodsSearchQuery);
        displayList = foods.filter(f => {
            const nameClean = removeDiacritics(f.name || '');
            const nameMatch = nameClean.includes(qClean) || qClean.includes(nameClean);
            const nutMatch = (f.nutrients || []).some(n => removeDiacritics(n.name || '').includes(qClean));
            return nameMatch || nutMatch;
        });
    }

    if (displayList.length === 0) {
        if (foods.length === 0) {
            container.innerHTML = `
                <div class="text-center py-12 px-4 rounded-2xl bg-slate-950/40 border-2 border-dashed border-slate-800 flex flex-col items-center justify-center">
                    <div class="p-3 bg-indigo-950/40 border border-indigo-800/60 rounded-2xl text-indigo-400 mb-3">
                        <i data-lucide="database" class="w-8 h-8"></i>
                    </div>
                    <h4 class="text-base font-bold text-white mb-1">Baza de alimente analizate este goală</h4>
                    <p class="text-xs text-slate-400 max-w-md mx-auto mb-4">
                        Când adaugi alimente analizate cu Gemini într-o masă, ele vor fi salvate automat aici la unități standard (100g/100ml/buc) pentru calcule instantanee offline.
                    </p>
                    <button onclick="extractFoodsFromMealHistory()" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl shadow-md transition-all flex items-center gap-2">
                        <i data-lucide="sparkles" class="w-4 h-4"></i> Extrage alimente din jurnalul existent
                    </button>
                </div>
            `;
        } else {
            container.innerHTML = `
                <div class="text-center py-10 text-slate-500 text-xs">
                    <i data-lucide="search-x" class="w-8 h-8 mx-auto mb-2 text-slate-600"></i>
                    <p>Niciun aliment găsit pentru „<strong>${analyzedFoodsSearchQuery}</strong>”.</p>
                    <button onclick="clearAnalyzedFoodsSearch()" class="mt-2 text-indigo-400 hover:underline">Șterge căutarea</button>
                </div>
            `;
        }
        refreshIcons();
        return;
    }

    container.innerHTML = displayList.map(food => {
        const nutCount = (food.nutrients || []).length;
        const baseLabel = `${food.baseQty || 100}${food.baseUnit || 'g'}`;
        const lastAnalyzedStr = food.lastAnalyzed ? formatRomanianDateTime(food.lastAnalyzed) : 'Nespecificat';
        
        // Render nutrients list for accordion
        const nutrientsHtml = (food.nutrients && food.nutrients.length > 0)
            ? food.nutrients.map(n => {
                const canonName = normalizeNutrientName(n.name || '');
                const def = CANONICAL_NUTRIENTS[canonName];
                const rda = def ? def.rda : 100;
                const rdaPercent = Math.round(((parseFloat(n.qty) || 0) / rda) * 100);
                const progressWidth = Math.min(rdaPercent, 100);
                const typeLabel = def ? def.type : (n.type || 'Nutrient');

                return `
                    <div class="bg-slate-900/90 border border-slate-800 rounded-xl p-2.5 flex flex-col justify-between hover:border-slate-700 transition-colors">
                        <div class="flex justify-between items-start gap-1 mb-1.5">
                            <div class="min-w-0">
                                <span class="font-bold text-xs text-slate-200 truncate block">${canonName}</span>
                                <span class="text-[9px] font-bold text-indigo-400 uppercase tracking-wider">${typeLabel}</span>
                            </div>
                            <div class="text-right shrink-0">
                                <span class="font-mono text-xs font-bold text-white">${parseFloat(n.qty || 0).toFixed(1)} ${n.unit || def?.unit || 'g'}</span>
                                <span class="block text-[9px] ${rdaPercent > 100 ? 'text-amber-400 font-bold' : 'text-slate-400'}">${rdaPercent}% DZR</span>
                            </div>
                        </div>
                        <div class="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden">
                            <div class="bg-gradient-to-r from-indigo-500 to-purple-500 h-full rounded-full transition-all duration-300" style="width: ${progressWidth}%"></div>
                        </div>
                    </div>
                `;
            }).join('')
            : `<div class="col-span-full text-center py-4 text-xs text-slate-500 italic">Nu există nutrienți detaliați salvați. Apasă „Reanalizează AI” pentru a genera lista completă.</div>`;

        return `
            <div class="bg-slate-950/70 border border-slate-800/90 rounded-2xl p-3.5 sm:p-4 hover:border-slate-700 transition-all shadow-sm">
                <!-- Food Header -->
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <!-- Food Title & Quick Info -->
                    <div class="flex items-start sm:items-center gap-3 min-w-0">
                        <div class="p-2.5 rounded-xl bg-indigo-950/70 border border-indigo-800/80 text-indigo-400 font-bold font-mono text-xs shrink-0 text-center min-w-[3.8rem]">
                            ${food.calories || 0}<br><span class="text-[9px] font-normal text-slate-400">kcal/${baseLabel}</span>
                        </div>
                        <div class="min-w-0">
                            <div class="flex items-center gap-2 flex-wrap">
                                <h4 class="font-bold text-sm sm:text-base text-white truncate">${food.name}</h4>
                                <span class="text-[10px] bg-slate-800 text-slate-300 border border-slate-700 px-2 py-0.5 rounded-md font-semibold">Standard: ${baseLabel}</span>
                            </div>
                            <div class="flex items-center gap-3 text-[11px] text-slate-400 mt-1 flex-wrap">
                                <span class="flex items-center gap-1">
                                    <i data-lucide="clock" class="w-3.5 h-3.5 text-slate-500"></i>
                                    <span>Analizat: <strong class="text-slate-300">${lastAnalyzedStr}</strong></span>
                                </span>
                                <span class="flex items-center gap-1">
                                    <i data-lucide="dna" class="w-3.5 h-3.5 text-slate-500"></i>
                                    <span><strong class="text-indigo-300">${nutCount}</strong> nutrienți</span>
                                </span>
                            </div>
                        </div>
                    </div>

                    <!-- Action Buttons -->
                    <div class="flex items-center gap-2 shrink-0 self-end sm:self-center">
                        <button onclick="toggleFoodNutrientsAccordion('${food.id}')" id="accordion-btn-${food.id}" class="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 text-xs font-semibold border border-slate-700 flex items-center gap-1.5 transition-all" title="Vizualizează spectrul complet de nutrienți">
                            <i data-lucide="layers" class="w-3.5 h-3.5 text-indigo-400"></i>
                            <span>Nutrienți</span>
                            <i data-lucide="chevron-down" id="accordion-chevron-${food.id}" class="w-3.5 h-3.5 transition-transform duration-200"></i>
                        </button>

                        <button onclick="reanalyzeFoodWithAI('${food.id}')" id="reanalyze-btn-${food.id}" class="px-3 py-1.5 rounded-xl bg-indigo-950/80 hover:bg-indigo-900 active:scale-95 text-indigo-300 text-xs font-semibold border border-indigo-800 flex items-center gap-1.5 transition-all shadow-sm" title="Reanalizează cu Gemini AI și actualizează spectrul de nutrienți">
                            <i data-lucide="sparkles" class="w-3.5 h-3.5 text-indigo-400"></i>
                            <span class="hidden sm:inline">Reanalizează AI</span>
                        </button>

                        <button onclick="deleteAnalyzedFoodItem('${food.id}')" class="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 transition-colors" title="Șterge aliment din baza locală">
                            <i data-lucide="trash-2" class="w-4 h-4"></i>
                        </button>
                    </div>
                </div>

                <!-- Autoretractable Nutrients Accordion Container -->
                <div id="food-accordion-${food.id}" class="hidden border-t border-slate-800/80 mt-3 pt-3">
                    <div class="flex items-center justify-between mb-2">
                        <span class="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                            <i data-lucide="activity" class="w-3.5 h-3.5 text-indigo-400"></i>
                            Spectru Nutrițional Detaliat per ${baseLabel}
                        </span>
                        <span class="text-[10px] text-slate-500">Sursă: ${food.source || 'AI (Gemini)'}</span>
                    </div>
                    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                        ${nutrientsHtml}
                    </div>
                </div>
            </div>
        `;
    }).join('');

    refreshIcons();
};

window.toggleFoodNutrientsAccordion = (foodId) => {
    const accordion = document.getElementById(`food-accordion-${foodId}`);
    const chevron = document.getElementById(`accordion-chevron-${foodId}`);
    if (!accordion) return;

    const isHidden = accordion.classList.contains('hidden');
    if (isHidden) {
        accordion.classList.remove('hidden');
        if (chevron) chevron.classList.add('rotate-180');
    } else {
        accordion.classList.add('hidden');
        if (chevron) chevron.classList.remove('rotate-180');
    }
    refreshIcons();
};

window.reanalyzeFoodWithAI = async (foodId) => {
    const food = Storage.getAnalyzedFood(foodId);
    if (!food) return alert("Alimentul nu a fost găsit în baza de date.");

    if (!Storage.isAiAvailable()) {
        return alert("Conexiunea AI nu este configurată sau activată. Verifică setările Gemini din Meniu > Setări.");
    }

    const btn = document.getElementById(`reanalyze-btn-${foodId}`);
    const globalStatus = document.getElementById('analyzed-foods-global-status');
    const origBtnHtml = btn ? btn.innerHTML : '';

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i data-lucide="loader" class="w-3.5 h-3.5 animate-spin"></i> Reanalizare...`;
    }

    if (globalStatus) {
        globalStatus.classList.remove('hidden');
        globalStatus.innerHTML = `
            <div class="flex items-center gap-2">
                <i data-lucide="loader" class="w-4 h-4 text-indigo-400 animate-spin"></i>
                <span class="text-indigo-200">Se reanalizează cu Gemini: <strong>${food.name}</strong> (${food.baseQty || 100}${food.baseUnit || 'g'})...</span>
            </div>
            <button onclick="cancelCurrentAIAction()" class="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-[11px] font-bold shadow-sm active:scale-95 transition-all">
                Oprește Analiza
            </button>
        `;
        refreshIcons();
    }

    try {
        const baseQ = food.baseQty || 100;
        const baseU = food.baseUnit || 'g';
        const prompt = `Ești expert nutriționist de top. Analizează extrem de detaliat alimentul: "${baseQ} ${baseU} de ${food.name}".
Folosește obligatoriu denumiri canonice standardizate în limba română pentru fiecare nutrient din spectru (ex: "Vitamina B9 (Acid folic)", "Vitamina B12 (Cobalamină)", "Vitamina C (Acid ascorbic)", "Vitamina D", "Fier", "Calciu", "Magneziu", "Potasiu", "Zinc", "Proteine", "Carbohidrați", "Grăsimi", "Fibre", "Sodiu", etc.).
Calculează cantitatea exactă și procentul DZR (% din doza zilnică recomandată) pentru ${baseQ} ${baseU}.

Returnează STRICT un JSON valid în următorul format:
{
  "calories": number,
  "nutrients": [
    {
      "name": "string",
      "type": "Macro" | "Micro",
      "qty": number,
      "unit": "g" | "mg" | "µg",
      "rda_percent": number,
      "role": "string"
    }
  ]
}`;

        const txt = await AI.callText(prompt, { timeoutMs: 25000 });
        const s = txt.indexOf('{'), e = txt.lastIndexOf('}');
        if (s !== -1 && e !== -1) {
            const aiData = JSON.parse(txt.substring(s, e + 1));
            const normNuts = normalizeNutrientsArray(aiData.nutrients || []);
            const cals = parseInt(aiData.calories) || food.calories || 0;

            const updatedFood = {
                ...food,
                calories: cals,
                nutrients: normNuts,
                lastAnalyzed: new Date().toISOString(),
                source: 'AI (Gemini Reanalizat)'
            };

            Storage.saveAnalyzedFood(updatedFood);
            window.renderAnalyzedFoodsList();

            // Automatically open accordion to show updated nutrients
            const acc = document.getElementById(`food-accordion-${foodId}`);
            if (acc) acc.classList.remove('hidden');

            if (globalStatus) {
                globalStatus.innerHTML = `
                    <div class="flex items-center gap-2">
                        <i data-lucide="check-circle-2" class="w-4 h-4 text-emerald-400"></i>
                        <span class="text-emerald-200">Reanalizat cu succes: <strong>${food.name}</strong> (${normNuts.length} nutrienți actualizați)!</span>
                    </div>
                `;
                setTimeout(() => { globalStatus.classList.add('hidden'); }, 4000);
            }
        } else {
            throw new Error("Răspunsul primit de la AI nu conține JSON valid.");
        }
    } catch (err) {
        console.error("Reanalysis failed:", err);
        if (globalStatus) {
            globalStatus.innerHTML = `
                <div class="flex items-center gap-2">
                    <i data-lucide="alert-circle" class="w-4 h-4 text-rose-400"></i>
                    <span class="text-rose-200">Eroare la reanalizare: ${err.message || 'Intervenție eșuată'}</span>
                </div>
            `;
            setTimeout(() => { globalStatus.classList.add('hidden'); }, 5000);
        }
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = origBtnHtml;
        }
        refreshIcons();
    }
};

window.deleteAnalyzedFoodItem = (foodId) => {
    const food = Storage.getAnalyzedFood(foodId);
    const name = food ? food.name : 'acest aliment';
    if (!confirm(`Sigur dorești să ștergi „${name}” din baza locală de alimente analizate?`)) {
        return;
    }
    Storage.deleteAnalyzedFood(foodId);
    window.renderAnalyzedFoodsList();
};

window.exportAnalyzedFoods = () => {
    try {
        Storage.exportAnalyzedFoodsJson();
    } catch (e) {
        alert("Eroare la exportul bazei de alimente: " + e.message);
    }
};

window.handleImportAnalyzedFoods = (input) => {
    const file = input.files && input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const content = e.target.result;
            const res = Storage.importAnalyzedFoodsFromJson(content, { overwrite: false });
            if (res.success) {
                alert(`Import reușit! Au fost importate ${res.imported} alimente în baza locală.`);
                window.renderAnalyzedFoodsList();
            } else {
                alert(`Eroare la import: ${res.error}`);
            }
        } catch (err) {
            alert(`Eroare la procesarea fișierului: ${err.message}`);
        } finally {
            input.value = '';
        }
    };
    reader.readAsText(file);
};

window.extractFoodsFromMealHistory = () => {
    const meals = Storage.getMeals();
    if (!meals || meals.length === 0) {
        return alert("Nu există mese în jurnal din care să se extragă alimente.");
    }

    let addedCount = 0;
    const existing = Storage.getAnalyzedFoods();
    const existingMap = new Map(existing.map(f => [removeDiacritics(f.name), f]));

    meals.forEach(m => {
        (m.foods || []).forEach(f => {
            const name = (f.name || '').trim();
            if (!name) return;
            const key = removeDiacritics(name);

            if (!existingMap.has(key)) {
                const qty = parseFloat(f.quantity) || 100;
                const unit = f.unit || 'g';
                const uNorm = removeDiacritics(unit);
                const isPiece = (uNorm.includes('buc') || uNorm.includes('feli') || uNorm.includes('ou') || uNorm.includes('porti'));
                const baseQty = isPiece ? 1 : 100;
                const baseUnit = isPiece ? 'buc' : (uNorm === 'ml' ? 'ml' : 'g');
                const factor = isPiece ? (1 / qty) : (100 / qty);

                const normNuts = normalizeNutrientsArray((f.nutrients || []).map(n => ({
                    ...n,
                    qty: parseFloat(((parseFloat(n.qty) || 0) * factor).toFixed(2))
                })));

                const newAnalyzedFood = {
                    name: name,
                    baseQty: baseQty,
                    baseUnit: baseUnit,
                    calories: Math.round((f.calories || 0) * factor),
                    nutrients: normNuts,
                    lastAnalyzed: m.date || new Date().toISOString(),
                    source: 'Jurnal Mese'
                };

                Storage.saveAnalyzedFood(newAnalyzedFood);
                existingMap.set(key, newAnalyzedFood);
                addedCount++;
            }
        });
    });

    window.renderAnalyzedFoodsList();
    alert(`Extragere finalizată: au fost adăugate ${addedCount} alimente noi în Baza Locală AI!`);
};

// --- Initial Startup ---
function initApp() {
    const nowLocal = getTodayDateTimeLocal();
    document.getElementById('meal-datetime').value = nowLocal;
    window.handleMealDateChange(nowLocal);
    loadUserProfileIntoForm();
    window.recalcProfilePreview();
    updateAIVisibility();
    renderHealthTags();
    renderHistory();
    renderCurrentMeal();
    updateAnalysis();
    populateActivityTypeSelect();
    initActivityDate();
    initCaloricCardState();
    initActivityStatsState();
    updateDynamicCaloricGauge();
    initFoodSuggestionsEvents();
    refreshIcons();
    console.log("Nutriție Pro 2.2 Ready with Categorized Top Menu, User Profile, Health Metrics & Daily Activities.");
}

// Start once DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
