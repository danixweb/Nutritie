// ==========================================
// Application Core Logic
// ==========================================
import { Storage, localFoodDB } from './storage.js';
import { AI } from './ai.js';
import { PDFReport } from './pdf.js';

// Application State
let currentMeal = { id: null, date: '', name: '', foods: [] };
let historyData = [];
let editingFoodIndex = -1;
let currentOpenNutrient = null;
let healthProfile = [];
let recognition = null;
let isLoopActive = false;

// Helpers & Time of Day Meal Suggestion
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
    const nameInput = document.getElementById('meal-name');
    if (!nameInput) return;
    const currentVal = nameInput.value.trim();
    if (!currentVal || STANDARD_SUGGESTIONS.includes(currentVal)) {
        nameInput.value = suggestMealNameByTime(val);
    }
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

window.toggleSettings = () => {
    const modal = document.getElementById('settings-modal');
    if (!modal) return;
    modal.classList.toggle('hidden');
    if (!modal.classList.contains('hidden')) {
        document.getElementById('api-key-input').value = Storage.getApiKey();
        document.getElementById('api-key-error').classList.add('hidden');
        
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
        refreshIcons();
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

function updateApiKeyIndicator() {
    const key = Storage.getApiKey();
    const ind = document.getElementById('api-key-indicator');
    if (ind) {
        ind.className = `absolute top-1 right-1 w-2.5 h-2.5 rounded-full border-2 border-slate-900 ${key ? 'bg-emerald-500' : 'bg-red-500 animate-pulse'}`;
    }
}

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
        d.innerHTML = `
            <div class="flex items-center gap-3 overflow-hidden">
                <div class="bg-slate-700 text-white text-xs font-mono font-bold p-2 rounded min-w-[3.5rem] text-center">${f.calories} kcal</div>
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
    refreshIcons();
}

function updateAnalysis() {
    const list = document.getElementById('nutrients-list');
    const sum = document.getElementById('macro-summary');
    if (!list || !sum) return;
    
    list.innerHTML = '';
    if (currentMeal.foods.length === 0) {
        sum.classList.add('hidden');
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
    const agg = {};
    let tp = 0, tc = 0, tf = 0;
    
    currentMeal.foods.forEach(f => {
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
    
    Object.values(agg).sort((a, b) => b.rda_percent - a.rda_percent).forEach(n => {
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

    // Try AI analysis if API key is present
    if (Storage.getApiKey()) {
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
        const nLower = name.toLowerCase();
        let match = localFoodDB.default;
        for (const k in localFoodDB) {
            if (nLower.includes(k) && k !== 'default') {
                match = localFoodDB[k];
                break;
            }
        }
        let factor = qty / 100;
        if (unit === 'bucati' || unit === 'buc') factor = qty * 0.6;
        if (unit === 'ml') factor = qty / 100;

        const nuts = [];
        if (match.pro) nuts.push({ name: "Proteine", type: "Macro", qty: match.pro * factor, unit: "g", rda_percent: ((match.pro * factor / 50) * 100).toFixed(0), role: "Construcție musculară" });
        if (match.carb) nuts.push({ name: "Carbohidrați", type: "Macro", qty: match.carb * factor, unit: "g", rda_percent: ((match.carb * factor / 275) * 100).toFixed(0), role: "Sursă primară de energie" });
        if (match.fat) nuts.push({ name: "Grăsimi", type: "Macro", qty: match.fat * factor, unit: "g", rda_percent: ((match.fat * factor / 70) * 100).toFixed(0), role: "Sănătate celulară și hormonală" });
        if (match.vitC) nuts.push({ name: "Vitamina C", type: "Micro", qty: match.vitC * factor, unit: "mg", rda_percent: ((match.vitC * factor / 80) * 100).toFixed(0), role: "Imunitate și colagen" });

        resultData = {
            calories: Math.round((match.cal || 100) * factor),
            nutrients: nuts
        };
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
    if (currentMeal.foods.length > 0) {
        document.getElementById('ai-actions-panel').classList.remove('hidden');
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

window.removeFood = (i) => {
    if (editingFoodIndex === i) exitFoodEditMode();
    currentMeal.foods.splice(i, 1);
    renderCurrentMeal();
    updateAnalysis();
    if (currentMeal.foods.length === 0) {
        document.getElementById('ai-actions-panel').classList.add('hidden');
    }
};

window.resetForm = () => {
    currentMeal = { id: null, date: '', name: '', foods: [] };
    const nowLocal = getTodayDateTimeLocal();
    document.getElementById('meal-datetime').value = nowLocal;
    document.getElementById('meal-name').value = suggestMealNameByTime(nowLocal);
    document.getElementById('editor-title').innerText = "Editor Masă";
    document.getElementById('cancel-edit-btn').classList.add('hidden');
    document.getElementById('save-meal-btn').innerHTML = '<i data-lucide="save" class="w-4 h-4"></i> Salvează Masa';
    exitFoodEditMode();
    renderCurrentMeal();
    updateAnalysis();
    document.getElementById('ai-actions-panel').classList.add('hidden');
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

window.editHistoryMeal = (id) => {
    const m = historyData.find(x => x.id === id);
    if (!m) return;
    currentMeal = JSON.parse(JSON.stringify(m));
    document.getElementById('meal-datetime').value = currentMeal.date || getTodayDateTimeLocal();
    document.getElementById('meal-name').value = currentMeal.name || '';
    document.getElementById('editor-title').innerText = "Modifică Masă";
    document.getElementById('cancel-edit-btn').classList.remove('hidden');
    document.getElementById('save-meal-btn').innerHTML = '<i data-lucide="refresh-cw" class="w-4 h-4"></i> Actualizează Masa';
    exitFoodEditMode();
    renderCurrentMeal();
    updateAnalysis();
    if (currentMeal.foods.length > 0) {
        document.getElementById('ai-actions-panel').classList.remove('hidden');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
    refreshIcons();
};

window.deleteMeal = (id) => {
    if (confirm("Sigur dorești să ștergi această masă din jurnal?")) {
        Storage.deleteMeal(id);
        if (currentMeal.id === id) window.resetForm();
        renderHistory();
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
        const dateFormatted = meal.date ? new Date(meal.date).toLocaleString('ro-RO') : 'Dată nespecificată';
        
        d.innerHTML = `
            <div class="flex justify-between items-start mb-2">
                <div>
                    <h4 class="font-bold text-white text-sm">${meal.name || 'Masă'}</h4>
                    <div class="text-xs text-slate-500">${dateFormatted}</div>
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
        alert(`Date importate cu succes! (${result.count} mese adăugate/actualizate).`);
    } catch (e) {
        alert("Eroare la import: " + e.message);
    } finally {
        input.value = '';
    }
};

// --- Smart AI Actions ---
window.generateShoppingList = async () => {
    if (!Storage.getApiKey()) { window.toggleSettings(); return alert("Configurează cheia API Gemini mai întâi."); }
    if (currentMeal.foods.length === 0) return alert("Masa este goală! Adaugă ingrediente întâi.");

    const btn = document.querySelector('button[title="Generează Lista de Cumpărături"]');
    const originalHTML = btn ? btn.innerHTML : '';
    if (btn) btn.innerHTML = `<i data-lucide="loader" class="w-4 h-4 animate-spin"></i>`;
    refreshIcons();

    const ingredients = currentMeal.foods.map(f => `${f.quantity}${f.unit} ${f.name}`).join(', ');
    const prompt = `Ești un asistent de cumpărături inteligent.
Am lista aceasta de ingrediente: ${ingredients}.

Te rog să:
1. Cumulezi cantitățile pentru ingredientele identice (ex: 2x 100g Orez -> 200g Orez).
2. Le organizezi logic pe raioane de supermarket (ex: 🥦 Legume/Fructe, 🥩 Carne/Pește, 🧀 Lactate, 🥫 Băcănie, 🧂 Condimente/Altele).
3. Returnezi rezultatul direct în format HTML curat (fără etichete \`\`\`html), folosind <h3> pentru categorii și <ul><li> pentru produse.`;

    try {
        const txt = await AI.callText(prompt);
        window.showAIModal("Listă de Cumpărături", txt, "shopping-cart");
    } catch (e) {
        alert("Eroare AI: " + e.message);
    } finally {
        if (btn) btn.innerHTML = originalHTML;
        refreshIcons();
    }
};

window.generateRecipe = async () => {
    if (!Storage.getApiKey()) { window.toggleSettings(); return alert("Configurează cheia API Gemini mai întâi."); }
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
    if (!Storage.getApiKey()) { window.toggleSettings(); return alert("Configurează cheia API Gemini mai întâi."); }
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
    if (!Storage.getApiKey()) { window.toggleSettings(); return alert("Configurează cheia API Gemini mai întâi."); }
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
    if (!Storage.getApiKey()) { window.toggleSettings(); return alert("Configurează cheia API Gemini mai întâi."); }

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
    if (!Storage.getApiKey()) { window.toggleSettings(); return alert("Configurează cheia API Gemini mai întâi."); }

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
    refreshIcons();
};

window.explainNutrientWithAI = async () => {
    if (!Storage.getApiKey()) { window.toggleSettings(); return alert("Configurează cheia API Gemini mai întâi."); }
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
    if (!Storage.getApiKey()) { window.toggleSettings(); return alert("Configurează cheia API Gemini mai întâi."); }

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
    if (!Storage.getApiKey()) { window.toggleSettings(); return alert("Configurează cheia API Gemini în Setări."); }

    addMessageToChat(msg, 'user');
    input.value = '';
    const loadingId = addMessageToChat("Gândesc...", 'ai', true);

    const mealContext = currentMeal.foods.length > 0
        ? `Masa curentă are: ${JSON.stringify(currentMeal.foods.map(f => ({ name: f.name, qty: f.quantity, unit: f.unit })))}`
        : `Masa este goală momentan.`;
    const healthContext = healthProfile.length > 0 ? `Profil medical: ${healthProfile.join(', ')}.` : '';

    const prompt = `Ești un asistent nutrițional prietenos și expert.
Context masă: ${mealContext}
Context medical: ${healthContext}
Mesajul utilizatorului: "${msg}".

Răspunde strict în JSON:
{
  "action": "generate/delete/modify/scale/chat",
  "reply": "Răspunsul tău clar și concis către utilizator în limba română",
  "ingredients": [ { "name": "string", "quantity": number, "unit": "string", "calories": number, "nutrients": [] } ],
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
        let finalText = "";

        if (jsonStart !== -1 && jsonEnd !== -1) {
            try {
                const jsonResponse = JSON.parse(responseText.substring(jsonStart, jsonEnd + 1));
                let replyText = jsonResponse.reply || "Am procesat cererea!";

                if (jsonResponse.action === 'generate' && jsonResponse.ingredients) {
                    jsonResponse.ingredients.forEach(ing => {
                        if (!ing.nutrients) ing.nutrients = [];
                        if (!ing.unit) ing.unit = 'g';
                        currentMeal.foods.push(ing);
                    });
                } else if (jsonResponse.action === 'delete') {
                    if (jsonResponse.target === 'all') {
                        currentMeal.foods = [];
                        replyText = "Am golit lista mesei.";
                    } else if (jsonResponse.target) {
                        const t = jsonResponse.target.toLowerCase();
                        currentMeal.foods = currentMeal.foods.filter(f => !f.name.toLowerCase().includes(t));
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

                renderCurrentMeal();
                updateAnalysis();
                if (bubble) bubble.innerText = replyText;
                finalText = replyText;
                document.getElementById('data-source-msg').innerHTML = `<span class="text-purple-400 font-semibold">💬 Comandă prin Asistent</span>`;
            } catch (e) {
                if (bubble) bubble.innerText = responseText;
                finalText = responseText;
            }
        } else {
            if (bubble) bubble.innerText = responseText;
            finalText = responseText;
        }

        if (bubble) {
            bubble.appendChild(speakBtn);
            refreshIcons();
            setTimeout(() => window.speakTextWithAutoListen(finalText, btnId, true), 200);
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
    updateApiKeyIndicator();
    alert("Cheia API și setările modelului au fost resetate.");
};

window.saveApiKey = async () => {
    const rawKey = document.getElementById('api-key-input').value;
    const key = rawKey ? rawKey.trim() : "";
    const btn = document.getElementById('save-api-btn');
    const errEl = document.getElementById('api-key-error');

    const modelSelect = document.getElementById('model-select');
    const selectedModelType = modelSelect ? modelSelect.value : 'gemini-2.0-flash';
    const customModelInput = document.getElementById('custom-model-input');
    const customModelName = customModelInput ? customModelInput.value.trim() : '';

    if (!key || key.length < 5) {
        errEl.innerHTML = "Te rugăm să introduci o cheie API validă.";
        errEl.classList.remove('hidden');
        return;
    }

    if (selectedModelType === 'custom' && !customModelName) {
        errEl.innerHTML = "Te rugăm să specifici numele modelului personalizat (ex: gemini-2.5-flash).";
        errEl.classList.remove('hidden');
        return;
    }

    btn.disabled = true;
    btn.innerHTML = `<i data-lucide="loader" class="w-4 h-4 animate-spin"></i> Testare conexiune...`;
    errEl.classList.add('hidden');
    refreshIcons();

    try {
        Storage.saveApiKey(key);
        Storage.saveSelectedModelType(selectedModelType);
        if (customModelName) Storage.saveCustomModelName(customModelName);

        const effectiveModel = Storage.getTargetModel();
        Storage.saveActiveModel(effectiveModel);

        window.toggleSettings();
        updateApiKeyIndicator();
        alert(`Setări salvate cu succes!\nModel activ: ${effectiveModel}`);
    } catch (err) {
        errEl.innerHTML = `<strong>Eroare:</strong> ${err.message || 'Verifică cheia API.'}`;
        errEl.classList.remove('hidden');
    } finally {
        btn.disabled = false;
        btn.innerHTML = "Salvează";
        refreshIcons();
    }
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
    const month = parseInt(monthSelect ? monthSelect.value : new Date().getMonth());
    const year = parseInt(yearSelect ? yearSelect.value : new Date().getFullYear());
    const btn = document.getElementById('download-pdf-btn');
    const origHTML = btn ? btn.innerHTML : '';

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i data-lucide="loader" class="w-4 h-4 animate-spin"></i> Generare PDF...`;
        refreshIcons();
    }

    try {
        await PDFReport.exportToPDF(year, month);
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
    const month = parseInt(monthSelect ? monthSelect.value : new Date().getMonth());
    const year = parseInt(yearSelect ? yearSelect.value : new Date().getFullYear());
    PDFReport.previewReport(year, month);
};

// --- Initial Startup ---
function initApp() {
    const nowLocal = getTodayDateTimeLocal();
    document.getElementById('meal-datetime').value = nowLocal;
    document.getElementById('meal-name').value = suggestMealNameByTime(nowLocal);
    updateApiKeyIndicator();
    renderHealthTags();
    renderHistory();
    renderCurrentMeal();
    updateAnalysis();
    refreshIcons();
    console.log("Nutriție Pro 2.1 Ready with Landscape Monthly PDF Reports & 100% Local Storage.");
}

// Start once DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
