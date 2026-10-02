// ==========================================
// Storage Module - Local & Offline Persistence
// ==========================================

const STORAGE_KEYS = {
    MEALS: 'nutritie_meals_history_v2',
    HEALTH_PROFILE: 'health_profile',
    USER_PROFILE: 'nutritie_user_profile',
    API_KEY: 'gemini_api_key',
    ACTIVE_MODEL: 'gemini_active_model',
    SELECTED_MODEL_TYPE: 'gemini_selected_model_type', // 'gemini-2.0-flash', 'gemini-1.5-flash', 'auto', 'custom', etc.
    CUSTOM_MODEL_NAME: 'gemini_custom_model_name',
    AI_ENABLED: 'gemini_ai_enabled',
    AI_CONNECTED: 'gemini_ai_connected',
    AI_NUTRIENT_CALC: 'gemini_ai_nutrient_calc'
};

// Local food database for offline calorie / macro estimation
export const localFoodDB = {
    "mar": { cal: 52, pro: 0.3, carb: 14, fat: 0.2, vitC: 4.6, pot: 107 },
    "măr": { cal: 52, pro: 0.3, carb: 14, fat: 0.2, vitC: 4.6, pot: 107 },
    "banan": { cal: 89, pro: 1.1, carb: 22.8, fat: 0.3, vitC: 8.7, mag: 27 },
    "paine": { cal: 265, pro: 9, carb: 49, fat: 3.2, iron: 3.6 },
    "pâine": { cal: 265, pro: 9, carb: 49, fat: 3.2, iron: 3.6 },
    "ou": { cal: 155, pro: 13, carb: 1.1, fat: 11, vitA: 160, vitB12: 0.89 },
    "oua": { cal: 155, pro: 13, carb: 1.1, fat: 11, vitA: 160, vitB12: 0.89 },
    "ouă": { cal: 155, pro: 13, carb: 1.1, fat: 11, vitA: 160, vitB12: 0.89 },
    "pui": { cal: 165, pro: 31, carb: 0, fat: 3.6, vitB12: 0.3 },
    "piept de pui": { cal: 165, pro: 31, carb: 0, fat: 3.6, vitB12: 0.3 },
    "cartof": { cal: 77, pro: 2, carb: 17, fat: 0.1, vitC: 19.7 },
    "cartofi": { cal: 77, pro: 2, carb: 17, fat: 0.1, vitC: 19.7 },
    "orez": { cal: 130, pro: 2.7, carb: 28, fat: 0.3, mag: 12 },
    "ovaz": { cal: 389, pro: 16.9, carb: 66, fat: 6.9, mag: 177, iron: 4.7 },
    "lapte": { cal: 64, pro: 3.3, carb: 4.8, fat: 3.6, calciu: 120 },
    "iaurt": { cal: 61, pro: 3.5, carb: 4.7, fat: 3.3, calciu: 110 },
    "somon": { cal: 208, pro: 20, carb: 0, fat: 13, vitD: 10, vitB12: 3.2 },
    "ton": { cal: 132, pro: 28, carb: 0, fat: 1, vitB12: 2.5 },
    "avocado": { cal: 160, pro: 2, carb: 8.5, fat: 14.7, pot: 485 },
    "rosie": { cal: 18, pro: 0.9, carb: 3.9, fat: 0.2, vitC: 13.7 },
    "roșie": { cal: 18, pro: 0.9, carb: 3.9, fat: 0.2, vitC: 13.7 },
    "castravete": { cal: 15, pro: 0.7, carb: 3.6, fat: 0.1, vitC: 2.8 },
    "ulei": { cal: 884, pro: 0, carb: 0, fat: 100, vitE: 14.3 },
    "default": { cal: 100, pro: 5, carb: 10, fat: 5 }
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

    // AI Nutrient Calculation Setting (Token-saver & local speed mode)
    isAiNutrientCalcEnabled() {
        const val = localStorage.getItem(STORAGE_KEYS.AI_NUTRIENT_CALC);
        return val === null ? true : val === 'true';
    },

    setAiNutrientCalcEnabled(enabled) {
        localStorage.setItem(STORAGE_KEYS.AI_NUTRIENT_CALC, enabled ? 'true' : 'false');
    },

    // --- Export / Import ---
    exportAllData() {
        const payload = {
            version: '2.2',
            exportDate: new Date().toISOString(),
            meals: this.getMeals(),
            healthProfile: this.getHealthProfile(),
            userProfile: this.getUserProfile()
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const dateStr = new Date().toISOString().slice(0, 10);
        a.download = `nutritie_pro_backup_${dateStr}.json`;
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
                    if (Array.isArray(data)) {
                        const current = Storage.getMeals();
                        const merged = [...data, ...current];
                        const unique = Array.from(new Map(merged.map(m => [m.id || JSON.stringify(m), m])).values());
                        localStorage.setItem(STORAGE_KEYS.MEALS, JSON.stringify(unique));
                        importedMealsCount = data.length;
                    } else if (data && typeof data === 'object') {
                        if (Array.isArray(data.meals)) {
                            const current = Storage.getMeals();
                            const merged = [...data.meals, ...current];
                            const unique = Array.from(new Map(merged.map(m => [m.id || JSON.stringify(m), m])).values());
                            localStorage.setItem(STORAGE_KEYS.MEALS, JSON.stringify(unique));
                            importedMealsCount = data.meals.length;
                        }
                        if (Array.isArray(data.healthProfile)) {
                            Storage.saveHealthProfile(data.healthProfile);
                        }
                        if (data.userProfile && typeof data.userProfile === 'object') {
                            Storage.saveUserProfile(data.userProfile);
                        }
                    }
                    resolve({ count: importedMealsCount });
                } catch (err) {
                    reject(new Error("Format de fișier JSON invalid."));
                }
            };
            reader.onerror = () => reject(new Error("Eroare la citirea fișierului."));
            reader.readAsText(file);
        });
    }
};
