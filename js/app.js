// ==========================================
// Application Core Logic
// ==========================================
import { Storage, localFoodDB, localActivityDB, estimateFoodLocally, parseRomanianFoodVoiceInput } from './storage.js';
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
    syncSeasonWithDate(picker?.value || todayStr);
}

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
    const actMeta = localActivityDB[actKey] || { name: actKey, met: 5.0, icon: 'activity', category: 'General' };
    const burned = Storage.calculateBurnedCalories(actKey, dur, intensity);

    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

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
                    <div class="font-bold text-white text-xs sm:text-sm truncate">${act.name}</div>
                    <div class="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-400 mt-0.5">
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

// --- Dynamic Caloric Gauge & Dual Progress Tracker ---
function updateDynamicCaloricGauge() {
    const mealCalsEl = document.getElementById('meal-live-calories');
    const dayCalsEl = document.getElementById('day-live-calories');
    const bmrStatusPill = document.getElementById('bmr-status-pill');
    const progressBar = document.getElementById('caloric-progress-bar');
    const progressStatus = document.getElementById('caloric-progress-status');
    const bmrTargetVal = document.getElementById('bmr-target-val');
    const tdeeTargetVal = document.getElementById('tdee-target-val');

    if (!mealCalsEl || !dayCalsEl) return;

    // 1. Current Meal Calories
    let mealCal = 0;
    (currentMeal.foods || []).forEach(f => {
        mealCal += parseFloat(f.calories) || 0;
    });
    mealCal = Math.round(mealCal);
    mealCalsEl.innerText = mealCal;

    // 2. Total Day Calories (saved meals on this day + current meal)
    const mealDateVal = document.getElementById('meal-datetime')?.value || '';
    const dateStr = mealDateVal ? mealDateVal.slice(0, 10) : new Date().toISOString().slice(0, 10);
    const allMeals = Storage.getMeals();
    let savedDayCal = 0;
    allMeals.forEach(m => {
        if (m.date && m.date.slice(0, 10) === dateStr) {
            if (currentMeal.id && m.id === currentMeal.id) {
                // exclude meal currently being edited to avoid double counting
                return;
            }
            (m.foods || []).forEach(f => {
                savedDayCal += parseFloat(f.calories) || 0;
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

    if (bmrTargetVal) bmrTargetVal.innerText = `BMR: ${bmr}`;
    if (tdeeTargetVal) tdeeTargetVal.innerText = `Target: ${targetTDEE}`;

    // 4. Visual Gauge & Status Updates
    if (progressBar && progressStatus) {
        if (totalDayCal < bmr) {
            const pct = Math.min(Math.round((totalDayCal / bmr) * 60), 60);
            progressBar.style.width = `${Math.max(pct, 4)}%`;
            progressBar.className = "h-full rounded-full transition-all duration-500 bg-gradient-to-r from-sky-500 to-indigo-500 shadow-sm";
            const diff = bmr - totalDayCal;
            progressStatus.innerHTML = `Sub metabolismul bazal (<strong class="text-sky-300 font-mono">${diff} kcal</strong> rămase până la BMR de ${bmr})`;
            if (bmrStatusPill) {
                bmrStatusPill.className = "text-[10px] px-2 py-0.5 rounded-full font-bold bg-sky-950/80 text-sky-300 border border-sky-800/80";
                bmrStatusPill.innerText = "Sub BMR";
            }
        } else if (totalDayCal <= targetTDEE) {
            const span = targetTDEE - bmr || 1;
            const extraPct = Math.round(((totalDayCal - bmr) / span) * 40);
            const pct = 60 + Math.min(extraPct, 40);
            progressBar.style.width = `${pct}%`;
            progressBar.className = "h-full rounded-full transition-all duration-500 bg-gradient-to-r from-indigo-500 to-emerald-400 shadow-sm";
            const rem = targetTDEE - totalDayCal;
            progressStatus.innerHTML = `BMR atins! În zona de consum optim (<strong class="text-emerald-300 font-mono">${rem} kcal</strong> până la TDEE de ${targetTDEE})`;
            if (bmrStatusPill) {
                bmrStatusPill.className = "text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-800/80";
                bmrStatusPill.innerText = "BMR Atins ✓";
            }
        } else {
            const surplus = totalDayCal - targetTDEE;
            progressBar.style.width = "100%";
            progressBar.className = "h-full rounded-full transition-all duration-500 bg-gradient-to-r from-amber-500 to-rose-500 shadow-md";
            progressStatus.innerHTML = `Target caloric depășit (<strong class="text-amber-300 font-mono">+${surplus} kcal surplus</strong> față de ${targetTDEE})`;
            if (bmrStatusPill) {
                bmrStatusPill.className = "text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-950/80 text-amber-300 border border-amber-800/80";
                bmrStatusPill.innerText = "Surplus Caloric";
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
                currentMeal.foods = parsed.map((item, idx) => ({
                    name: item.name || currentMeal.foods[idx].name,
                    quantity: item.quantity || currentMeal.foods[idx].quantity,
                    unit: item.unit || currentMeal.foods[idx].unit,
                    calories: parseInt(item.calories) || currentMeal.foods[idx].calories || 0,
                    nutrients: Array.isArray(item.nutrients) ? item.nutrients : []
                }));

                const statusEl = document.getElementById('data-source-msg');
                if (statusEl) statusEl.innerHTML = `<span class="text-emerald-400 font-bold">✨ Nutrienți recalculați cu AI pentru toată masa!</span>`;
            } else if (Array.isArray(parsed) && parsed.length > 0) {
                parsed.forEach((item, idx) => {
                    if (currentMeal.foods[idx]) {
                        currentMeal.foods[idx].calories = parseInt(item.calories) || currentMeal.foods[idx].calories;
                        currentMeal.foods[idx].nutrients = Array.isArray(item.nutrients) ? item.nutrients : currentMeal.foods[idx].nutrients;
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
            if (!agg[n.name]) {
                agg[n.name] = { ...n, qty: 0, rda_percent: 0, sources: [] };
            }
            agg[n.name].qty += parseFloat(n.qty) || 0;
            agg[n.name].rda_percent += parseFloat(n.rda_percent) || 0;
            agg[n.name].sources.push({ foodName: f.name, foodQty: n.qty });
            
            const nLower = n.name.toLowerCase();
            if (nLower.includes('prot')) tp += parseFloat(n.qty) || 0;
            if (nLower.includes('carb') || nLower.includes('gluc')) tc += parseFloat(n.qty) || 0;
            if (nLower.includes('grăs') || nLower.includes('gras') || nLower.includes('lipid') || nLower.includes('fat')) tf += parseFloat(n.qty) || 0;
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
        if (oldFood.name.toLowerCase() === name.toLowerCase() && oldFood.unit === unit) {
            const factor = qty / (oldFood.quantity || 1);
            const newNutrients = (oldFood.nutrients || []).map(n => ({
                ...n,
                qty: n.qty * factor,
                rda_percent: (parseFloat(n.rda_percent) * factor).toFixed(1)
            }));
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

    // Try AI analysis only if AI is available, connected AND user enabled nutrient calculation via AI
    if (Storage.isAiAvailable() && Storage.isAiNutrientCalcEnabled()) {
        try {
            const prompt = `Analizează nutrițional alimentul: "${qty} ${unit} de ${name}". Returnează JSON strict: { "calories": number, "nutrients": [ { "name": "string", "type": "string", "qty": number, "unit": "string", "rda_percent": number, "role": "string" } ] }`;
            const txt = await AI.callText(prompt);
            const s = txt.indexOf('{'), e = txt.lastIndexOf('}');
            if (s !== -1 && e !== -1) {
                resultData = JSON.parse(txt.substring(s, e + 1));
                source = 'AI';
            }
        } catch (e) {
            console.log("AI analysis skipped, falling back to local database:", e);
        }
    }

    // Fallback to local food database
    if (!resultData) {
        resultData = estimateFoodLocally(name, qty, unit);
    }

    if (!resultData.nutrients) resultData.nutrients = [];
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

    finishProcessing(
        originalText,
        btn,
        source === 'AI' ? `<span class="text-emerald-400">✨ Analizat cu Gemini</span>` : `<span class="text-yellow-500">⚡ Estimare Locală</span>`
    );
};

function finishProcessing(originalText, btn, msg) {
    btn.innerHTML = originalText;
    btn.disabled = false;
    document.getElementById('data-source-msg').innerHTML = msg || "";
    document.getElementById('food-name').value = '';
    document.getElementById('food-qty').value = '';
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
        const prompt = `Analizează nutrițional alimentul: "${targetFood.quantity} ${targetFood.unit} de ${targetFood.name}". Returnează JSON strict: { "calories": number, "nutrients": [ { "name": "string", "type": "string", "qty": number, "unit": "string", "rda_percent": number, "role": "string" } ] }`;
        const txt = await AI.callText(prompt);
        const s = txt.indexOf('{'), e = txt.lastIndexOf('}');
        if (s !== -1 && e !== -1) {
            const aiData = JSON.parse(txt.substring(s, e + 1));
            // Check if food at index still matches
            if (currentMeal.foods[index] && currentMeal.foods[index].name === targetFood.name) {
                if (aiData.calories !== undefined) currentMeal.foods[index].calories = aiData.calories;
                if (Array.isArray(aiData.nutrients) && aiData.nutrients.length > 0) {
                    currentMeal.foods[index].nutrients = aiData.nutrients;
                }
                renderCurrentMeal();
                updateAnalysis();
                updateDynamicCaloricGauge();
                const sourceMsg = document.getElementById('data-source-msg');
                if (sourceMsg) sourceMsg.innerHTML = `<span class="text-indigo-400">✨ ${targetFood.name} rafinat prin AI</span>`;
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
    exitFoodEditMode();
    renderCurrentMeal();
    updateAnalysis();
    updateDynamicCaloricGauge();
    updateAIVisibility();
    document.getElementById('data-source-msg').innerHTML = '';
    refreshIcons();
};

// --- Meal Storage CRUD ---
window.saveMealToLocal = () => {
    if (currentMeal.foods.length === 0) return alert("Masa este goală.");
    
    const btn = document.getElementById('save-meal-btn');
    const originalHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader" class="w-4 h-4 animate-spin"></i> Salvare...';
    refreshIcons();

    const payload = {
        id: currentMeal.id || null,
        date: document.getElementById('meal-datetime').value || getTodayDateTimeLocal(),
        name: document.getElementById('meal-name').value.trim() || 'Masă fără nume',
        foods: currentMeal.foods
    };

    try {
        Storage.saveMeal(payload);
        window.resetForm();
        renderHistory();
        // Visual notification toast/feedback
        const statusEl = document.getElementById('data-source-msg');
        if (statusEl) statusEl.innerHTML = `<span class="text-emerald-400 font-bold">✓ Salvat local cu succes!</span>`;
    } catch (e) {
        alert("Eroare la salvarea mesei: " + e.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalHTML;
        refreshIcons();
    }
};
window.saveMeal = window.saveMealToLocal;

window.editHistoryMeal = (id) => {
    const m = historyData.find(x => x.id === id);
    if (!m) return;
    currentMeal = JSON.parse(JSON.stringify(m));
    selectedFoodNutrientIndex = -1;
    const targetDate = currentMeal.date || getTodayDateTimeLocal();
    document.getElementById('meal-datetime').value = targetDate;
    window.handleMealDateChange(targetDate);
    document.getElementById('meal-name').value = currentMeal.name || '';
    document.getElementById('editor-title').innerText = "Modifică Masă";
    document.getElementById('cancel-edit-btn').classList.remove('hidden');
    document.getElementById('save-meal-btn').innerHTML = '<i data-lucide="refresh-cw" class="w-4 h-4"></i> Actualizează Masa';
    exitFoodEditMode();
    renderCurrentMeal();
    updateAnalysis();
    if (currentMeal.foods.length > 0 && Storage.isAiAvailable()) {
        document.getElementById('ai-actions-panel').classList.remove('hidden');
    } else {
        document.getElementById('ai-actions-panel').classList.add('hidden');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
    refreshIcons();
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
    if (!container) return;
    container.innerHTML = '';
    historyData = Storage.getMeals();

    if (historyData.length === 0) {
        container.innerHTML = `<div class="text-center py-10 text-slate-600 text-sm border border-slate-800/80 rounded-xl bg-slate-900/30">Nu există mese în jurnal. Datele salvate vor apărea aici.</div>`;
        return;
    }

    historyData.forEach(meal => {
        const totalCal = (meal.foods || []).reduce((acc, f) => acc + (f.calories || 0), 0);
        const d = document.createElement('div');
        d.className = "bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm hover:border-indigo-500/50 transition-all";
        const dateFormatted = formatRomanianDateTime(meal.date);
        
        d.innerHTML = `
            <div class="flex justify-between items-start mb-2">
                <div>
                    <h4 class="font-bold text-white text-sm">${meal.name || 'Masă'}</h4>
                    <div class="text-xs text-indigo-300 font-medium capitalize flex items-center gap-1.5 mt-0.5">
                        <i data-lucide="calendar" class="w-3.5 h-3.5 text-indigo-400"></i>
                        <span>${dateFormatted}</span>
                    </div>
                </div>
                <div class="bg-slate-800 text-slate-300 font-mono text-xs px-2 py-1 rounded font-bold border border-slate-700">
                    ${totalCal} kcal
                </div>
            </div>
            <div class="flex justify-between items-center mt-3 pt-3 border-t border-slate-800">
                <div class="text-xs text-slate-500">${(meal.foods || []).length} ingrediente</div>
                <div class="flex gap-2">
                    <button onclick="editHistoryMeal('${meal.id}')" class="text-xs text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1 rounded transition-colors font-medium">Editează</button>
                    <button onclick="deleteMeal('${meal.id}')" class="text-slate-400 hover:text-red-400 p-1 transition-colors" title="Șterge"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                </div>
            </div>
        `;
        container.appendChild(d);
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
        alert(`Date importate cu succes! (${result.count} mese adăugate/actualizate).`);
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
1. Dacă utilizatorul cere o masă, o rețetă, ingrediente sau modificarea mesei, pune alimentele în array-ul "ingredients".
2. În proprietatea "reply", scrie EXCLUSIV un mesaj prietenos, scurt și natural în limba română (ex: "Ți-am adăugat în listă un mic dejun sănătos cu ovăz, lapte de migdale și afine.").
3. NU afișa NICIODATĂ cod JSON, paranteze { } sau detalii tehnice în textul din "reply".

Returnează STRICT JSON valid:
{
  "action": "generate" | "delete" | "modify" | "scale" | "chat",
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

                if ((jsonResponse.action === 'generate' || !jsonResponse.action) && Array.isArray(jsonResponse.ingredients) && jsonResponse.ingredients.length > 0) {
                    jsonResponse.ingredients.forEach(ing => {
                        if (!ing.nutrients) ing.nutrients = [];
                        if (!ing.unit) ing.unit = 'g';
                        currentMeal.foods.push(ing);
                    });
                    if (!replyText || replyText.includes('{') || replyText.includes('"action"')) {
                        replyText = `Am adăugat în lista mesei tale: ${jsonResponse.ingredients.map(i => `${i.name} (${i.quantity}${i.unit})`).join(', ')}.`;
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
                    cleanReply = "Am procesat cererea și am actualizat lista mesei!";
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
                            <span class="text-indigo-300 bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-800">TEF: -${dayBalance.tefCalories} kcal</span>
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
    updateDynamicCaloricGauge();
    refreshIcons();
    console.log("Nutriție Pro 2.2 Ready with Categorized Top Menu, User Profile, Health Metrics & Daily Activities.");
}

// Start once DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
