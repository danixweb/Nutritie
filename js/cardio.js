// =========================================================
// Cardio & Blood Pressure Module (Integrated CardioTracker)
// =========================================================
import { Storage } from './storage.js';
import { AI } from './ai.js';

let cardioState = {
    records: [],
    chartMode: 'BP', // 'BP' or 'ABI'
    activeSubTab: 'data',
    editId: null
};

let timerState = {
    time: 300,
    total: 300,
    active: false,
    interval: null
};

let cardioChart = null;

// ESC/ESH Guidelines for Blood Pressure Grading & Colors
export function getBPGrade(sys, dia) {
    const s = parseInt(sys) || 0;
    const d = parseInt(dia) || 0;

    if (s >= 180 || d >= 110) {
        return { grade: 3, label: 'HTA Grad 3 (Severă)', color: '#7f1d1d', badgeClass: 'bg-rose-950 text-rose-300 border-rose-800' };
    }
    if (s >= 160 || d >= 100) {
        return { grade: 2, label: 'HTA Grad 2 (Moderată)', color: '#ef4444', badgeClass: 'bg-red-950/80 text-red-300 border-red-800' };
    }
    if (s >= 140 || d >= 90) {
        return { grade: 1, label: 'HTA Grad 1 (Ușoară)', color: '#f97316', badgeClass: 'bg-orange-950/80 text-orange-300 border-orange-800' };
    }
    if (s >= 130 || d >= 85) {
        return { grade: 0.5, label: 'Normal-Înaltă', color: '#facc15', badgeClass: 'bg-amber-950/80 text-amber-300 border-amber-800' };
    }
    if (s >= 120 || d >= 80) {
        return { grade: 0, label: 'Normală', color: '#10b981', badgeClass: 'bg-emerald-950/80 text-emerald-300 border-emerald-800' };
    }
    return { grade: -1, label: 'Optimă', color: '#22d3ee', badgeClass: 'bg-cyan-950/80 text-cyan-300 border-cyan-800' };
}

export function getBPGradeColor(s, d) {
    return getBPGrade(s, d).color;
}

export function getABIInterpretation(val) {
    const v = parseFloat(val);
    if (isNaN(v)) return { label: 'Nedefinit', color: '#94a3b8' };
    if (v > 1.40) return { label: 'Rigiditate vasculară (>1.40)', color: '#f59e0b' };
    if (v >= 0.90) return { label: 'Normal (0.90 - 1.40)', color: '#10b981' };
    if (v >= 0.70) return { label: 'Afectare ușoară (0.70 - 0.89)', color: '#facc15' };
    if (v >= 0.40) return { label: 'Afectare moderată (0.40 - 0.69)', color: '#f97316' };
    return { label: 'Ischemie critică (<0.40)', color: '#ef4444' };
}

// Toast helper
export function showCardioToast(message, isError = false) {
    let toast = document.getElementById('cardio-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'cardio-toast';
        toast.className = 'fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-3 rounded-2xl text-xs font-bold uppercase tracking-wider text-center z-50 shadow-2xl transition-all duration-300 pointer-events-none opacity-0 translate-y-6';
        document.body.appendChild(toast);
    }

    toast.innerText = message;
    toast.className = `fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-3 rounded-2xl text-xs font-bold uppercase tracking-wider text-center z-50 shadow-2xl transition-all duration-300 pointer-events-none opacity-100 translate-y-0 ${
        isError ? 'bg-rose-600 text-white border border-rose-500' : 'bg-indigo-600 text-white border border-indigo-400'
    }`;

    setTimeout(() => {
        toast.classList.remove('opacity-100', 'translate-y-0');
        toast.classList.add('opacity-0', 'translate-y-6');
    }, 3200);
}

// --- Sub-Tab Navigation ---
export function switchCardioSubTab(subTabId) {
    cardioState.activeSubTab = subTabId;
    const tabs = ['timer', 'data', 'charts', 'files', 'ai'];

    tabs.forEach(t => {
        const content = document.getElementById(`cardio-subtab-${t}`);
        const btn = document.getElementById(`cardio-nav-${t}`);
        if (content) {
            if (t === subTabId) content.classList.remove('hidden');
            else content.classList.add('hidden');
        }
        if (btn) {
            if (t === subTabId) {
                btn.className = "flex-1 py-2 px-2.5 rounded-xl text-[11px] sm:text-xs font-bold bg-rose-600 text-white shadow-md border border-rose-500 transition-all flex items-center justify-center gap-1.5";
            } else {
                btn.className = "flex-1 py-2 px-2.5 rounded-xl text-[11px] sm:text-xs font-bold bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 transition-all flex items-center justify-center gap-1.5";
            }
        }
    });

    if (subTabId === 'charts') {
        setTimeout(updateCardioChart, 100);
    }
    if (subTabId === 'files') {
        renderCardioRecordsList();
    }
    if (subTabId === 'ai') {
        checkAiKeyStatus();
    }
    if (window.lucide) window.lucide.createIcons();
}

// --- Relaxation Timer Logic ---
export function initCardioTimer() {
    const sel = document.getElementById('cardioTimerDuration');
    if (sel) {
        timerState.total = parseInt(sel.value) || 300;
        timerState.time = timerState.total;
    }
    updateCardioTimerUI();
}

export function resetCardioTimer() {
    clearInterval(timerState.interval);
    timerState.active = false;
    const sel = document.getElementById('cardioTimerDuration');
    if (sel) {
        timerState.total = parseInt(sel.value) || 300;
        timerState.time = timerState.total;
    }
    updateCardioTimerUI();
    const btn = document.getElementById('cardioTimerBtn');
    if (btn) btn.innerHTML = '<i data-lucide="play" class="w-4 h-4"></i><span>Start Repaus</span>';
    if (window.lucide) window.lucide.createIcons();
}

export function toggleCardioTimer() {
    const btn = document.getElementById('cardioTimerBtn');
    if (timerState.active) {
        clearInterval(timerState.interval);
        timerState.active = false;
        if (btn) btn.innerHTML = '<i data-lucide="play" class="w-4 h-4"></i><span>Continuă</span>';
    } else {
        timerState.active = true;
        if (btn) btn.innerHTML = '<i data-lucide="pause" class="w-4 h-4"></i><span>Pauză</span>';
        timerState.interval = setInterval(() => {
            timerState.time--;
            updateCardioTimerUI();
            if (timerState.time <= 0) {
                clearInterval(timerState.interval);
                timerState.active = false;
                if (btn) btn.innerHTML = '<i data-lucide="play" class="w-4 h-4"></i><span>Start Repaus</span>';
                try {
                    const utterance = new SpeechSynthesisUtterance("Relaxarea s-a încheiat. Puteți efectua măsurătoarea tensiunii arteriale.");
                    utterance.lang = 'ro-RO';
                    window.speechSynthesis.speak(utterance);
                } catch (e) {}
                showCardioToast("Timpul de repaus a expirat! Măsurați tensiunea.");
                switchCardioSubTab('data');
            }
        }, 1000);
    }
    if (window.lucide) window.lucide.createIcons();
}

export function updateCardioTimerUI() {
    const display = document.getElementById('cardioTimerDisplay');
    const circle = document.getElementById('cardioTimerCircle');
    const m = Math.floor(timerState.time / 60);
    const s = timerState.time % 60;

    if (display) {
        display.innerText = `${m}:${s.toString().padStart(2, '0')}`;
    }

    if (circle) {
        const circumference = 628;
        const progress = timerState.total > 0 ? (timerState.time / timerState.total) : 1;
        const offset = circumference - (progress * circumference);
        circle.style.strokeDashoffset = offset;
    }
}

// --- Biometric Autofill & State Management ---
export function autoFillCardioBiometrics() {
    const userProf = Storage.getUserProfile();
    const records = Storage.getCardioRecords();

    // Patient Name
    const nameInput = document.getElementById('cardioPatientName');
    if (nameInput && !nameInput.value) {
        const lastWithPatient = records.find(r => r.pacientName);
        if (lastWithPatient) {
            nameInput.value = lastWithPatient.pacientName;
        } else {
            nameInput.value = "Utilizator";
        }
    }

    // Biometrics (from profile first, then most recent record)
    const ageInput = document.getElementById('cardio_age');
    const heightInput = document.getElementById('cardio_height');
    const weightInput = document.getElementById('cardio_weight');

    if (ageInput && !ageInput.value && userProf.age) ageInput.value = userProf.age;
    if (heightInput && !heightInput.value && userProf.height) heightInput.value = userProf.height;
    if (weightInput && !weightInput.value && userProf.weight) weightInput.value = userProf.weight;

    const lastBP = records.find(r => r.type === 'BP');
    if (lastBP) {
        if (ageInput && !ageInput.value && lastBP.age) ageInput.value = lastBP.age;
        if (heightInput && !heightInput.value && lastBP.height) heightInput.value = lastBP.height;
        if (weightInput && !weightInput.value && lastBP.weight) weightInput.value = lastBP.weight;
    }

    // Default current date & time
    const dtInput = document.getElementById('cardio_datetime');
    if (dtInput && !dtInput.value) {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        dtInput.value = `${year}-${month}-${day}T${hours}:${minutes}`;
    }
}

// Live BP preview badge
export function updateLiveBPFeedback() {
    const sys = parseInt(document.getElementById('cardio_sys')?.value) || 0;
    const dia = parseInt(document.getElementById('cardio_dia')?.value) || 0;
    const feedback = document.getElementById('cardio-bp-feedback');
    if (!feedback) return;

    if (sys > 0 && dia > 0) {
        const grade = getBPGrade(sys, dia);
        feedback.className = `mt-2 px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center justify-between ${grade.badgeClass}`;
        feedback.innerHTML = `
            <span>Clasificare: <strong>${grade.label}</strong></span>
            <span class="font-mono">${sys} / ${dia} mmHg</span>
        `;
        feedback.classList.remove('hidden');
    } else {
        feedback.classList.add('hidden');
    }
}

// Live ABI preview
export function updateLiveABIFeedback() {
    const ld = parseFloat(document.getElementById('cardio_abi_leg_d')?.value) || 0;
    const ad = parseFloat(document.getElementById('cardio_abi_arm_d')?.value) || 0;
    const ls = parseFloat(document.getElementById('cardio_abi_leg_s')?.value) || 0;
    const as = parseFloat(document.getElementById('cardio_abi_arm_s')?.value) || 0;
    const feedback = document.getElementById('cardio-abi-feedback');
    if (!feedback) return;

    if (ad > 0 && as > 0 && ld > 0 && ls > 0) {
        const valD = (ld / ad).toFixed(2);
        const valS = (ls / as).toFixed(2);
        const interpD = getABIInterpretation(valD);
        const interpS = getABIInterpretation(valS);

        feedback.className = "mt-2 p-2.5 rounded-xl text-xs bg-slate-900 border border-slate-800 space-y-1";
        feedback.innerHTML = `
            <div class="flex justify-between font-bold">
                <span style="color: ${interpD.color}">Dreapta: ${valD} (${interpD.label})</span>
                <span style="color: ${interpS.color}">Stânga: ${valS} (${interpS.label})</span>
            </div>
        `;
        feedback.classList.remove('hidden');
    } else {
        feedback.classList.add('hidden');
    }
}

// Save Entry
export function saveCardioEntry(type) {
    const patientNameInput = document.getElementById('cardioPatientName');
    const patientName = patientNameInput ? patientNameInput.value.trim().toUpperCase() : 'UTILIZATOR';
    const dtInput = document.getElementById('cardio_datetime');
    const date = (dtInput && dtInput.value) ? new Date(dtInput.value).toISOString() : new Date().toISOString();

    let entry = {
        type,
        date,
        pacientName: patientName || 'UTILIZATOR'
    };

    if (cardioState.editId) {
        entry.id = cardioState.editId;
    }

    if (type === 'BP') {
        const sys = document.getElementById('cardio_sys')?.value;
        const dia = document.getElementById('cardio_dia')?.value;
        const pulse = document.getElementById('cardio_pulse')?.value;
        const age = document.getElementById('cardio_age')?.value;
        const height = document.getElementById('cardio_height')?.value;
        const weight = document.getElementById('cardio_weight')?.value;
        const note = document.getElementById('cardio_note')?.value;

        if (!sys || !dia) {
            showCardioToast("Introduceți valorile pentru Sistolică și Diastolică!", true);
            return;
        }

        entry.sys = parseInt(sys);
        entry.dia = parseInt(dia);
        entry.pulse = pulse ? parseInt(pulse) : null;
        entry.age = age ? parseInt(age) : null;
        entry.height = height ? parseFloat(height) : null;
        entry.weight = weight ? parseFloat(weight) : null;
        entry.note = note ? note.trim() : '';

        // Also sync weight back to User Profile if user wants
        if (entry.weight && entry.weight > 20) {
            const userProf = Storage.getUserProfile();
            if (!userProf.weight || Math.abs(userProf.weight - entry.weight) >= 0.1) {
                userProf.weight = entry.weight;
                if (entry.height) userProf.height = entry.height;
                if (entry.age) userProf.age = entry.age;
                Storage.saveUserProfile(userProf);
            }
        }
    } else {
        const ld = parseFloat(document.getElementById('cardio_abi_leg_d')?.value) || 0;
        const ad = parseFloat(document.getElementById('cardio_abi_arm_d')?.value) || 0;
        const ls = parseFloat(document.getElementById('cardio_abi_leg_s')?.value) || 0;
        const as = parseFloat(document.getElementById('cardio_abi_arm_s')?.value) || 0;

        if (ad <= 0 || as <= 0 || ld <= 0 || ls <= 0) {
            showCardioToast("Completați toate cele 4 valori ale indicelui ABI!", true);
            return;
        }

        entry.valD = parseFloat((ld / ad).toFixed(2));
        entry.valS = parseFloat((ls / as).toFixed(2));
        entry.rawABI = { ld, ad, ls, as };
    }

    Storage.saveCardioRecord(entry);
    cancelCardioEdit();
    showCardioToast("Măsurătoare salvată cu succes!");
    renderCardioRecordsList();
    updateCardioBadgeCount();
}

export function startCardioEdit(id) {
    const records = Storage.getCardioRecords();
    const record = records.find(r => r.id === id);
    if (!record) return;

    cardioState.editId = id;
    switchCardioSubTab('data');

    const badge = document.getElementById('cardioEditBadge');
    if (badge) badge.classList.remove('hidden');

    if (record.pacientName) {
        const nameInput = document.getElementById('cardioPatientName');
        if (nameInput) nameInput.value = record.pacientName;
    }

    if (record.date) {
        const dtInput = document.getElementById('cardio_datetime');
        if (dtInput) {
            const d = new Date(record.date);
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const h = String(d.getHours()).padStart(2, '0');
            const min = String(d.getMinutes()).padStart(2, '0');
            dtInput.value = `${y}-${m}-${day}T${h}:${min}`;
        }
    }

    if (record.type === 'BP') {
        if (document.getElementById('cardio_sys')) document.getElementById('cardio_sys').value = record.sys || '';
        if (document.getElementById('cardio_dia')) document.getElementById('cardio_dia').value = record.dia || '';
        if (document.getElementById('cardio_pulse')) document.getElementById('cardio_pulse').value = record.pulse || '';
        if (document.getElementById('cardio_age')) document.getElementById('cardio_age').value = record.age || '';
        if (document.getElementById('cardio_height')) document.getElementById('cardio_height').value = record.height || '';
        if (document.getElementById('cardio_weight')) document.getElementById('cardio_weight').value = record.weight || '';
        if (document.getElementById('cardio_note')) document.getElementById('cardio_note').value = record.note || '';
        updateLiveBPFeedback();
    } else if (record.rawABI) {
        if (document.getElementById('cardio_abi_leg_d')) document.getElementById('cardio_abi_leg_d').value = record.rawABI.ld || '';
        if (document.getElementById('cardio_abi_arm_d')) document.getElementById('cardio_abi_arm_d').value = record.rawABI.ad || '';
        if (document.getElementById('cardio_abi_leg_s')) document.getElementById('cardio_abi_leg_s').value = record.rawABI.ls || '';
        if (document.getElementById('cardio_abi_arm_s')) document.getElementById('cardio_abi_arm_s').value = record.rawABI.as || '';
        updateLiveABIFeedback();
    }
}

export function cancelCardioEdit() {
    cardioState.editId = null;
    const badge = document.getElementById('cardioEditBadge');
    if (badge) badge.classList.add('hidden');

    ['cardio_sys', 'cardio_dia', 'cardio_pulse', 'cardio_note',
     'cardio_abi_leg_d', 'cardio_abi_arm_d', 'cardio_abi_leg_s', 'cardio_abi_arm_s'
    ].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });

    const bpFb = document.getElementById('cardio-bp-feedback');
    if (bpFb) bpFb.classList.add('hidden');
    const abiFb = document.getElementById('cardio-abi-feedback');
    if (abiFb) abiFb.classList.add('hidden');

    autoFillCardioBiometrics();
}

export function deleteCardioRecord(id) {
    if (confirm("Sigur doriți să ștergeți această înregistrare?")) {
        Storage.deleteCardioRecord(id);
        renderCardioRecordsList();
        updateCardioBadgeCount();
        showCardioToast("Înregistrare ștearsă.");
    }
}

// --- Render Records List ---
export function renderCardioRecordsList() {
    const container = document.getElementById('cardioRecordsList');
    if (!container) return;

    const records = Storage.getCardioRecords();
    if (records.length === 0) {
        container.innerHTML = `
            <div class="text-center py-10 bg-slate-900/40 rounded-2xl border border-slate-800/80">
                <i data-lucide="heart" class="w-10 h-10 mx-auto text-slate-600 mb-2"></i>
                <p class="text-xs text-slate-400 font-medium">Nicio înregistrare cardiovasculară.</p>
                <p class="text-[10px] text-slate-500 mt-1">Măsoară tensiunea arterială și salvează prima înregistrare!</p>
            </div>
        `;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    container.innerHTML = records.map(r => {
        const d = new Date(r.date);
        const dateFormatted = isNaN(d.getTime()) ? '-' : d.toLocaleDateString('ro-RO', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });

        if (r.type === 'BP') {
            const grade = getBPGrade(r.sys, r.dia);
            return `
                <div class="p-3.5 bg-slate-900/90 border border-slate-800 rounded-2xl flex items-center justify-between gap-3 shadow-md border-l-4" style="border-left-color: ${grade.color}">
                    <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-2 mb-1 flex-wrap">
                            <span class="text-[10px] font-mono text-slate-400">${dateFormatted}</span>
                            <span class="text-[9px] font-black px-2 py-0.5 rounded-full ${grade.badgeClass}">${grade.label}</span>
                        </div>
                        <div class="flex items-center gap-3 text-sm font-bold text-white">
                            <span>TA: <strong class="text-base text-rose-300 font-mono">${r.sys}/${r.dia}</strong> <span class="text-xs font-normal text-slate-400">mmHg</span></span>
                            ${r.pulse ? `<span class="text-slate-400">|</span> <span>Puls: <strong class="text-rose-400 font-mono">${r.pulse}</strong> <span class="text-xs font-normal text-slate-400">bpm</span></span>` : ''}
                        </div>
                        ${(r.weight || r.height) ? `
                            <div class="text-[10px] text-slate-500 mt-1">
                                ${r.weight ? `Greutate: ${r.weight}kg` : ''} ${r.height ? `• Înălțime: ${r.height}cm` : ''} ${r.age ? `• Vârstă: ${r.age} ani` : ''}
                            </div>
                        ` : ''}
                        ${r.note ? `<div class="text-[11px] text-slate-400 italic mt-1 bg-slate-950/60 p-1.5 rounded-lg border border-slate-800">„${r.note}”</div>` : ''}
                    </div>
                    <div class="flex items-center gap-1 shrink-0">
                        <button onclick="window.startCardioEdit('${r.id}')" class="p-2 text-indigo-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors" title="Editează">
                            <i data-lucide="edit-3" class="w-4 h-4"></i>
                        </button>
                        <button onclick="window.deleteCardioRecord('${r.id}')" class="p-2 text-rose-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors" title="Șterge">
                            <i data-lucide="trash-2" class="w-4 h-4"></i>
                        </button>
                    </div>
                </div>
            `;
        } else {
            const interpD = getABIInterpretation(r.valD);
            const interpS = getABIInterpretation(r.valS);
            return `
                <div class="p-3.5 bg-slate-900/90 border border-slate-800 rounded-2xl flex items-center justify-between gap-3 shadow-md border-l-4 border-l-blue-500">
                    <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-2 mb-1 flex-wrap">
                            <span class="text-[10px] font-mono text-slate-400">${dateFormatted}</span>
                            <span class="text-[9px] font-bold px-2 py-0.5 rounded-full bg-blue-950 text-blue-300 border border-blue-800">Indice ABI</span>
                        </div>
                        <div class="text-sm font-bold text-white flex items-center gap-3">
                            <span>Dreapta: <strong class="font-mono" style="color: ${interpD.color}">${r.valD}</strong></span>
                            <span class="text-slate-400">|</span>
                            <span>Stânga: <strong class="font-mono" style="color: ${interpS.color}">${r.valS}</strong></span>
                        </div>
                        <div class="text-[10px] text-slate-400 mt-1">
                            Gleznă/Braț D: ${r.rawABI?.ld || '-'}/${r.rawABI?.ad || '-'} • S: ${r.rawABI?.ls || '-'}/${r.rawABI?.as || '-'}
                        </div>
                    </div>
                    <div class="flex items-center gap-1 shrink-0">
                        <button onclick="window.startCardioEdit('${r.id}')" class="p-2 text-indigo-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors" title="Editează">
                            <i data-lucide="edit-3" class="w-4 h-4"></i>
                        </button>
                        <button onclick="window.deleteCardioRecord('${r.id}')" class="p-2 text-rose-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors" title="Șterge">
                            <i data-lucide="trash-2" class="w-4 h-4"></i>
                        </button>
                    </div>
                </div>
            `;
        }
    }).join('');

    if (window.lucide) window.lucide.createIcons();
}

export function updateCardioBadgeCount() {
    const countEl = document.getElementById('cardio-badge-count');
    if (!countEl) return;
    const records = Storage.getCardioRecords();
    if (records.length > 0) {
        countEl.innerText = records.length;
        countEl.classList.remove('hidden');
    } else {
        countEl.classList.add('hidden');
    }
}

// --- Chart.js Integration ---
export function setCardioChartMode(mode) {
    cardioState.chartMode = mode;
    const btnBP = document.getElementById('btn-cardio-chart-bp');
    const btnABI = document.getElementById('btn-cardio-chart-abi');

    if (mode === 'BP') {
        if (btnBP) btnBP.className = "flex-1 py-1.5 px-3 text-xs font-bold rounded-lg bg-rose-600 text-white shadow transition-all";
        if (btnABI) btnABI.className = "flex-1 py-1.5 px-3 text-xs font-bold rounded-lg text-slate-400 hover:text-white transition-all";
    } else {
        if (btnBP) btnBP.className = "flex-1 py-1.5 px-3 text-xs font-bold rounded-lg text-slate-400 hover:text-white transition-all";
        if (btnABI) btnABI.className = "flex-1 py-1.5 px-3 text-xs font-bold rounded-lg bg-blue-600 text-white shadow transition-all";
    }

    updateCardioChart();
}

export function initCardioChart() {
    const canvas = document.getElementById('cardioMainChart');
    if (!canvas || !window.Chart) return;

    if (cardioChart) {
        cardioChart.destroy();
    }

    const ctx = canvas.getContext('2d');
    cardioChart = new window.Chart(ctx, {
        type: 'line',
        data: { labels: [], datasets: [] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                legend: {
                    labels: {
                        color: '#94a3b8',
                        font: { family: 'Inter', size: 11, weight: 'bold' }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.95)',
                    titleColor: '#f8fafc',
                    bodyColor: '#cbd5e1',
                    borderColor: '#334155',
                    borderWidth: 1,
                    padding: 10,
                    cornerRadius: 12
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(51, 65, 85, 0.25)' },
                    ticks: { color: '#64748b', font: { family: 'Inter', size: 9 }, maxRotation: 45, minRotation: 45 }
                },
                y: {
                    grid: { color: 'rgba(51, 65, 85, 0.25)' },
                    ticks: { color: '#64748b', font: { family: 'Inter', size: 9 } }
                }
            }
        }
    });
}

export function updateCardioChart() {
    const canvas = document.getElementById('cardioMainChart');
    if (!canvas || !window.Chart) return;
    if (!cardioChart) initCardioChart();
    if (!cardioChart) return;

    const records = Storage.getCardioRecords();
    const filtered = records
        .filter(r => r.type === cardioState.chartMode)
        .sort((a, b) => new Date(a.date) - new Date(b.date)); // chronological order

    cardioChart.data.labels = filtered.map(r => {
        const d = new Date(r.date);
        return isNaN(d.getTime()) ? '?' : d.toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
    });

    if (cardioState.chartMode === 'BP') {
        cardioChart.data.datasets = [
            {
                label: 'Sistolică (mmHg)',
                data: filtered.map(r => r.sys),
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                tension: 0.3,
                pointRadius: 6,
                pointHoverRadius: 8,
                pointBackgroundColor: filtered.map(r => getBPGradeColor(r.sys, r.dia))
            },
            {
                label: 'Diastolică (mmHg)',
                data: filtered.map(r => r.dia),
                borderColor: '#38bdf8',
                backgroundColor: 'rgba(56, 189, 248, 0.1)',
                tension: 0.3,
                pointRadius: 5,
                pointHoverRadius: 7,
                pointBackgroundColor: filtered.map(r => getBPGradeColor(r.sys, r.dia))
            },
            {
                label: 'Puls (bpm)',
                data: filtered.map(r => r.pulse),
                borderColor: '#f43f5e',
                borderDash: [5, 5],
                tension: 0.3,
                pointRadius: 3
            }
        ];
    } else {
        cardioChart.data.datasets = [
            {
                label: 'Indice ABI Dreapta',
                data: filtered.map(r => r.valD),
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                tension: 0.3,
                pointRadius: 6
            },
            {
                label: 'Indice ABI Stânga',
                data: filtered.map(r => r.valS),
                borderColor: '#818cf8',
                backgroundColor: 'rgba(129, 140, 248, 0.1)',
                tension: 0.3,
                pointRadius: 6
            }
        ];
    }

    cardioChart.update();
}

// --- File Operations (.PLAC & PDF) ---
export async function openLocalPlacFile() {
    try {
        if (window.showOpenFilePicker) {
            const [handle] = await window.showOpenFilePicker({
                types: [{
                    description: 'Fișiere CardioTracker (.plac)',
                    accept: { 'application/json': ['.plac', '.json'] }
                }]
            });
            const file = await handle.getFile();
            const text = await file.text();
            processImportedPlacText(text);
        } else {
            // Fallback for browsers without File System Access API
            document.getElementById('cardio-plac-file-input')?.click();
        }
    } catch (e) {
        if (e.name !== 'AbortError') {
            console.error(e);
            showCardioToast("Nu s-a putut deschide fișierul.", true);
        }
    }
}

export function handlePlacInputUpload(input) {
    const file = input?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        processImportedPlacText(e.target.result);
        input.value = '';
    };
    reader.readAsText(file);
}

function processImportedPlacText(text) {
    try {
        const data = JSON.parse(text);
        let incomingRecords = [];
        let incomingName = '';

        if (Array.isArray(data)) {
            incomingRecords = data;
        } else if (data && typeof data === 'object') {
            if (Array.isArray(data.records)) incomingRecords = data.records;
            if (data.name) incomingName = data.name;
        }

        if (incomingRecords.length === 0) {
            showCardioToast("Fișierul nu conține înregistrări valide.", true);
            return;
        }

        const currentRecords = Storage.getCardioRecords();
        const merged = [...incomingRecords, ...currentRecords];
        const unique = Array.from(new Map(merged.map(r => [r.id || (r.date + '_' + r.type), r])).values());

        localStorage.setItem('nutritie_cardio_records_v1', JSON.stringify(unique));
        if (incomingName) {
            const nameInput = document.getElementById('cardioPatientName');
            if (nameInput) nameInput.value = incomingName;
        }

        renderCardioRecordsList();
        updateCardioChart();
        updateCardioBadgeCount();
        showCardioToast(`S-au importat ${incomingRecords.length} înregistrări!`);
    } catch (err) {
        showCardioToast("Eroare la parsarea fișierului .plac", true);
    }
}

export async function saveLocalPlacFile() {
    try {
        const records = Storage.getCardioRecords();
        const nameInput = document.getElementById('cardioPatientName');
        const patientName = nameInput ? nameInput.value.trim().toUpperCase() : 'PACIENT';

        const payload = {
            name: patientName,
            exportDate: new Date().toISOString(),
            records: records,
            chartMode: cardioState.chartMode
        };

        const jsonStr = JSON.stringify(payload, null, 2);

        if (window.showSaveFilePicker) {
            const handle = await window.showSaveFilePicker({
                suggestedName: `${patientName || 'Cardio'}_${new Date().toISOString().slice(0, 10)}.plac`,
                types: [{
                    description: 'Dosar Cardio (.plac)',
                    accept: { 'application/json': ['.plac'] }
                }]
            });
            const writable = await handle.createWritable();
            await writable.write(jsonStr);
            await writable.close();
            showCardioToast("Dosar salvat cu succes!");
        } else {
            const blob = new Blob([jsonStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${patientName || 'Cardio'}_${new Date().toISOString().slice(0, 10)}.plac`;
            a.click();
            URL.revokeObjectURL(url);
            showCardioToast("Dosar descărcat!");
        }
    } catch (e) {
        if (e.name !== 'AbortError') {
            console.error(e);
            showCardioToast("Eroare la salvarea dosarului.", true);
        }
    }
}

// --- PDF Export (Portrait A4 with Hi-Res Chart & Clinical Analysis) ---
export async function exportCardioFullPDF() {
    const records = Storage.getCardioRecords();
    if (records.length === 0) {
        showCardioToast("Nu există date pentru export PDF!", true);
        return;
    }

    if (!window.html2pdf) {
        showCardioToast("Biblioteca de export PDF nu este disponibilă.", true);
        return;
    }

    showCardioToast("Se pregătește Raportul PDF...");

    const nameInput = document.getElementById('cardioPatientName');
    const patientName = nameInput ? nameInput.value.trim().toUpperCase() : 'PACIENT';
    const userProf = Storage.getUserProfile();

    // High resolution off-screen canvas for crisp Chart.js print
    const canvas = document.createElement('canvas');
    canvas.width = 1600;
    canvas.height = 900;
    const tempCtx = canvas.getContext('2d');

    const bpRecords = records.filter(r => r.type === 'BP').sort((a, b) => new Date(a.date) - new Date(b.date));
    const labels = bpRecords.map(r => {
        const d = new Date(r.date);
        return isNaN(d.getTime()) ? '?' : d.toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit' });
    });

    new window.Chart(tempCtx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Sistolică (mmHg)',
                    data: bpRecords.map(r => r.sys),
                    borderColor: '#059669',
                    borderWidth: 3,
                    tension: 0.3,
                    pointRadius: 6,
                    pointBackgroundColor: bpRecords.map(r => getBPGradeColor(r.sys, r.dia))
                },
                {
                    label: 'Diastolică (mmHg)',
                    data: bpRecords.map(r => r.dia),
                    borderColor: '#0284c7',
                    borderWidth: 3,
                    tension: 0.3,
                    pointRadius: 5,
                    pointBackgroundColor: bpRecords.map(r => getBPGradeColor(r.sys, r.dia))
                },
                {
                    label: 'Puls (bpm)',
                    data: bpRecords.map(r => r.pulse),
                    borderColor: '#e11d48',
                    borderWidth: 2,
                    borderDash: [6, 6],
                    tension: 0.3,
                    pointRadius: 4
                }
            ]
        },
        options: {
            responsive: false,
            animation: false,
            devicePixelRatio: 2,
            layout: { padding: 30 },
            scales: {
                x: { ticks: { color: '#0f172a', font: { size: 14, weight: 'bold' } } },
                y: { ticks: { color: '#0f172a', font: { size: 14, weight: 'bold' } } }
            },
            plugins: {
                legend: { labels: { color: '#0f172a', font: { size: 18, weight: 'bold' } } }
            }
        }
    });

    await new Promise(r => setTimeout(r, 600));
    const chartImgData = canvas.toDataURL('image/png');

    const aiContainer = document.getElementById('cardioAiResponse');
    const aiText = aiContainer ? aiContainer.innerHTML : '';
    const hasAi = aiText && aiText.length > 40 && !aiText.includes('Așteptare date');

    // Create Report DOM element
    const docElement = document.createElement('div');
    docElement.style.width = '210mm';
    docElement.style.padding = '12mm';
    docElement.style.boxSizing = 'border-box';
    docElement.style.backgroundColor = '#ffffff';
    docElement.style.color = '#0f172a';
    docElement.style.fontFamily = 'Arial, sans-serif';

    const latestBP = bpRecords[bpRecords.length - 1] || {};
    const age = latestBP.age || userProf.age || '-';
    const height = latestBP.height || userProf.height || '-';
    const weight = latestBP.weight || userProf.weight || '-';

    docElement.innerHTML = `
        <div style="border-bottom: 4px solid #0f172a; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-end;">
            <div>
                <h1 style="font-size: 24px; font-weight: 900; margin: 0; color: #0f172a; letter-spacing: -0.5px;">RAPORT CARDIOVASCULAR & BIOMETRIC</h1>
                <p style="margin: 3px 0 0 0; font-size: 12px; color: #475569;">Evoluție Tensiune Arterială, Puls & Corelație Nutrițională</p>
            </div>
            <div style="text-align: right;">
                <div style="font-size: 18px; font-weight: 900; color: #1e1b4b;">${patientName}</div>
                <div style="font-size: 11px; color: #64748b; margin-top: 2px;">Vârstă: ${age} ani • H: ${height}cm • G: ${weight}kg</div>
                <div style="font-size: 10px; color: #94a3b8; margin-top: 2px;">Generat: ${new Date().toLocaleDateString('ro-RO')} ${new Date().toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })}</div>
            </div>
        </div>

        <div style="margin-bottom: 20px;">
            <div style="font-size: 13px; font-weight: 800; text-transform: uppercase; border-left: 4px solid #059669; padding-left: 8px; margin-bottom: 8px; color: #065f46;">
                1. Grafic Evolutiv Tensiune Arterială & Puls
            </div>
            <img src="${chartImgData}" style="width: 100%; height: auto; border: 1px solid #e2e8f0; border-radius: 6px;">
        </div>

        <div style="margin-bottom: 20px;">
            <div style="font-size: 13px; font-weight: 800; text-transform: uppercase; border-left: 4px solid #3b82f6; padding-left: 8px; margin-bottom: 8px; color: #1e40af;">
                2. Istoric Recent Măsurători
            </div>
            <table style="width: 100%; border-collapse: collapse; font-size: 11px; text-align: left;">
                <thead>
                    <tr style="background-color: #f1f5f9; border-bottom: 2px solid #cbd5e1;">
                        <th style="padding: 6px 8px;">Dată & Oră</th>
                        <th style="padding: 6px 8px;">Tip</th>
                        <th style="padding: 6px 8px;">Valori Măsurate</th>
                        <th style="padding: 6px 8px;">Clasificare Clinică</th>
                        <th style="padding: 6px 8px;">Notă</th>
                    </tr>
                </thead>
                <tbody>
                    ${records.slice(0, 10).map((r, i) => {
                        const dateStr = new Date(r.date).toLocaleString('ro-RO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
                        if (r.type === 'BP') {
                            const grade = getBPGrade(r.sys, r.dia);
                            return `
                                <tr style="border-bottom: 1px solid #e2e8f0; background: ${i % 2 === 0 ? '#ffffff' : '#f8fafc'}">
                                    <td style="padding: 5px 8px; font-family: monospace;">${dateStr}</td>
                                    <td style="padding: 5px 8px; font-weight: bold; color: #059669;">TA & Puls</td>
                                    <td style="padding: 5px 8px; font-weight: bold;">${r.sys}/${r.dia} mmHg • ${r.pulse || '-'} bpm</td>
                                    <td style="padding: 5px 8px; font-weight: bold; color: ${grade.color};">${grade.label}</td>
                                    <td style="padding: 5px 8px; color: #64748b;">${r.note || '-'}</td>
                                </tr>
                            `;
                        } else {
                            return `
                                <tr style="border-bottom: 1px solid #e2e8f0; background: ${i % 2 === 0 ? '#ffffff' : '#f8fafc'}">
                                    <td style="padding: 5px 8px; font-family: monospace;">${dateStr}</td>
                                    <td style="padding: 5px 8px; font-weight: bold; color: #2563eb;">ABI</td>
                                    <td style="padding: 5px 8px; font-weight: bold;">D: ${r.valD} • S: ${r.valS}</td>
                                    <td style="padding: 5px 8px; color: #1e40af;">Indice gleznă-braț</td>
                                    <td style="padding: 5px 8px; color: #64748b;">-</td>
                                </tr>
                            `;
                        }
                    }).join('')}
                </tbody>
            </table>
        </div>

        ${hasAi ? `
            <div style="margin-top: 20px;">
                <div style="font-size: 13px; font-weight: 800; text-transform: uppercase; border-left: 4px solid #6366f1; padding-left: 8px; margin-bottom: 8px; color: #3730a3;">
                    3. Concluzii & Analiză Clinică AI
                </div>
                <div style="font-size: 11px; line-height: 1.5; text-align: justify; background: #fafafa; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; color: #1e293b;">
                    ${aiText.replace(/<strong>/g, '<strong style="color: #1e3a8a;">')}
                </div>
            </div>
        ` : ''}

        <div style="border-top: 1px solid #cbd5e1; padding-top: 8px; margin-top: 30px; text-align: center; font-size: 9px; color: #94a3b8; font-style: italic;">
            Generat prin Asistent Nutriție & CardioTracker Pro • Format A4 Portrait standard
        </div>
    `;

    window.html2pdf().from(docElement).set({
        margin: 0,
        filename: `Raport_Cardio_${patientName}_${new Date().toISOString().slice(0, 10)}.pdf`,
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        html2canvas: { scale: 2 }
    }).save().then(() => {
        showCardioToast("Raport PDF descărcat!");
    });
}

// --- AI Clinical & Nutritional Correlation Logic ---
function checkAiKeyStatus() {
    const key = Storage.getApiKey();
    const statusContainer = document.getElementById('cardioAiStatus');
    if (!statusContainer) return;

    if (key) {
        statusContainer.className = "p-3 rounded-xl bg-emerald-950/40 border border-emerald-800/60 text-xs text-emerald-300 flex items-center justify-between";
        statusContainer.innerHTML = `
            <div class="flex items-center gap-2">
                <i data-lucide="check-circle-2" class="w-4 h-4 text-emerald-400"></i>
                <span>Cheie Gemini conectată din Setări.</span>
            </div>
            <span class="text-[10px] font-mono text-emerald-400">Activ</span>
        `;
    } else {
        statusContainer.className = "p-3 rounded-xl bg-amber-950/40 border border-amber-800/60 text-xs text-amber-300 flex items-center justify-between";
        statusContainer.innerHTML = `
            <div class="flex items-center gap-2">
                <i data-lucide="alert-triangle" class="w-4 h-4 text-amber-400"></i>
                <span>Cheia Gemini nu este configurată!</span>
            </div>
            <button onclick="window.openSettingsTab('ai')" class="text-[10px] underline font-bold">Configurează în Setări</button>
        `;
    }
    if (window.lucide) window.lucide.createIcons();
}

export async function runCardioAiAnalysis() {
    const key = Storage.getApiKey();
    if (!key) {
        showCardioToast("Configurați cheia Gemini în Meniu > Setări!", true);
        return;
    }

    const records = Storage.getCardioRecords();
    if (records.length === 0) {
        showCardioToast("Introduceți cel puțin o măsurătoare înainte de analiza AI!", true);
        return;
    }

    const out = document.getElementById('cardioAiResponse');
    const btn = document.getElementById('cardioAiBtn');
    if (out) out.innerHTML = '<div class="flex items-center gap-2 text-indigo-300 py-4"><span class="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-ping"></span> Se analizează datele cardiovasculare și corelația nutrițională...</div>';
    if (btn) btn.disabled = true;

    // Gather context
    const nameInput = document.getElementById('cardioPatientName');
    const patientName = nameInput ? nameInput.value.trim().toUpperCase() : 'PACIENT';
    const userProf = Storage.getUserProfile();
    const metrics = Storage.calculateMetrics(userProf);

    const bpRecords = records.filter(r => r.type === 'BP');
    const latestBP = bpRecords[0] || {};
    const age = latestBP.age || userProf.age || '-';
    const height = latestBP.height || userProf.height || '-';
    const weight = latestBP.weight || userProf.weight || '-';

    // Gather nutrition context (Sodium, Potassium, Magnesium, Calories) from last 7-14 days
    const meals = Storage.getMeals();
    let totalSodiumMg = 0, totalPotassiumMg = 0, totalMagnesiumMg = 0, totalDaysCount = 0;
    const daysMap = {};

    meals.forEach(m => {
        const dayStr = m.date ? m.date.slice(0, 10) : null;
        if (!dayStr) return;
        if (!daysMap[dayStr]) {
            daysMap[dayStr] = { sodium: 0, potassium: 0, magnesium: 0, cal: 0 };
        }
        (m.foods || []).forEach(f => {
            daysMap[dayStr].cal += (f.calories || 0);
            (f.nutrients || []).forEach(n => {
                const nNorm = (n.name || '').toLowerCase();
                const qty = parseFloat(n.qty) || 0;
                if (nNorm.includes('sodiu') || nNorm.includes('sare')) daysMap[dayStr].sodium += qty;
                if (nNorm.includes('potasiu')) daysMap[dayStr].potassium += qty;
                if (nNorm.includes('magneziu')) daysMap[dayStr].magnesium += qty;
            });
        });
    });

    const dayEntries = Object.values(daysMap);
    let avgSodium = 0, avgPotassium = 0, avgMagnesium = 0;
    if (dayEntries.length > 0) {
        totalDaysCount = dayEntries.length;
        avgSodium = Math.round(dayEntries.reduce((acc, d) => acc + d.sodium, 0) / totalDaysCount);
        avgPotassium = Math.round(dayEntries.reduce((acc, d) => acc + d.potassium, 0) / totalDaysCount);
        avgMagnesium = Math.round(dayEntries.reduce((acc, d) => acc + d.magnesium, 0) / totalDaysCount);
    }

    const cardioHistoryFormatted = records.slice(0, 15).map(r => {
        const dStr = new Date(r.date).toLocaleString('ro-RO');
        if (r.type === 'BP') {
            return `[TA & Puls] ${dStr} -> Sistolică: ${r.sys} mmHg, Diastolică: ${r.dia} mmHg, Puls: ${r.pulse || '-'} bpm ${r.note ? `(Notă: ${r.note})` : ''}`;
        } else {
            return `[ABI] ${dStr} -> Dreapta: ${r.valD}, Stânga: ${r.valS}`;
        }
    }).join('\n');

    const prompt = `Ești medic specialist cardiolog și expert în nutriție clinică.
Analizează următorul profil complet al pacientului:
Pacient: ${patientName}
Vârstă: ${age} ani, Înălțime: ${height} cm, Greutate: ${weight} kg
IMC estimat: ${metrics.imc || 'N/A'} (${metrics.imcCategory || ''})

DATE NUTRIȚIONALE RECENTE (Media pe ultimele ${totalDaysCount || 1} zile din jurnalul alimentar):
- Sodiu mediu: ${avgSodium} mg/zi (DZR recomandat: 2000 mg)
- Potasiu mediu: ${avgPotassium} mg/zi (DZR recomandat: 3500 mg)
- Magneziu mediu: ${avgMagnesium} mg/zi (DZR recomandat: 375 mg)
- Raport Sodiu/Potasiu estimat: ${avgPotassium > 0 ? (avgSodium / avgPotassium).toFixed(2) : 'N/A'} (ideal < 1.0)

ISTORIC RECENT MĂSURĂTORI CARDIO:
${cardioHistoryFormatted}

CERINȚE STRUCTURATE:
1. **Evaluare Tensiune Arterială & Risc**: Încadrează valorile conform ghidurilor ESC/ESH, analizează evoluția și stabilitatea TA.
2. **Interpretare Indice ABI**: Dacă există măsurători ABI, explică riscul vascular periferic.
3. **Corelație Clinică Nutrițională (Esențial)**: Analizează impactul aportului de Sodiu și Potasiu din jurnal asupra tensiunii arteriale și a retenției hidrice.
4. **Recomandări Practice de Lifestyle & DASH**: Sugestii clare privind dieta DASH, managementul aportului de minerale, hidratare și frecvența monitorizării.

Instrucțiuni de stil: Fără rânduri goale multiple. Folosește **bold** pentru titluri și termeni cheie. Răspunde exclusiv în limba română, empatic, profesionist și orientat spre acțiune.`;

    try {
        const responseText = await AI.callText(prompt, { timeoutMs: 25000 });
        const formatted = responseText
            .split('\n')
            .filter(l => l.trim() !== '')
            .map(line => line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>'))
            .join('<br class="mb-1.5">');

        if (out) {
            out.innerHTML = `<div class="p-4 bg-slate-950/80 rounded-2xl border border-slate-800 text-slate-200 leading-relaxed text-xs sm:text-sm">${formatted}</div>`;
        }
        showCardioToast("Analiză clinică finalizată!");
    } catch (e) {
        if (out) out.innerHTML = `<div class="p-3 text-rose-400 bg-rose-950/40 rounded-xl border border-rose-900/60 text-xs">Eroare la analiza AI: ${e.message}</div>`;
        showCardioToast("Eroare la apelul AI", true);
    } finally {
        if (btn) btn.disabled = false;
    }
}

// Initialize Cardio Module
export function initCardioModule() {
    initCardioTimer();
    autoFillCardioBiometrics();
    renderCardioRecordsList();
    updateCardioBadgeCount();
    checkAiKeyStatus();
}

// Expose window globals for onclick handlers in index.html
if (typeof window !== 'undefined') {
    window.switchCardioSubTab = switchCardioSubTab;
    window.toggleCardioTimer = toggleCardioTimer;
    window.resetCardioTimer = resetCardioTimer;
    window.initCardioTimer = initCardioTimer;
    window.saveCardioEntry = saveCardioEntry;
    window.startCardioEdit = startCardioEdit;
    window.cancelCardioEdit = cancelCardioEdit;
    window.deleteCardioRecord = deleteCardioRecord;
    window.updateLiveBPFeedback = updateLiveBPFeedback;
    window.updateLiveABIFeedback = updateLiveABIFeedback;
    window.setCardioChartMode = setCardioChartMode;
    window.openLocalPlacFile = openLocalPlacFile;
    window.handlePlacInputUpload = handlePlacInputUpload;
    window.saveLocalPlacFile = saveLocalPlacFile;
    window.exportCardioFullPDF = exportCardioFullPDF;
    window.runCardioAiAnalysis = runCardioAiAnalysis;
}
