// ==========================================
// AI Module - Google Gemini Integration
// ==========================================
import { Storage } from './storage.js';

export const AI = {
    async getWorkingModel(key) {
        let cached = Storage.getActiveModel();
        if (cached) return cached;

        try {
            console.log("Discovering available Gemini models...");
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
            if (response.ok) {
                const data = await response.json();
                if (data.models && Array.isArray(data.models)) {
                    // Look for flash or general models first
                    const preferred = data.models.find(m => 
                        m.supportedGenerationMethods?.includes("generateContent") && 
                        (m.name.includes("flash") || m.name.includes("1.5") || m.name.includes("2.0") || m.name.includes("pro"))
                    );
                    const valid = preferred || data.models.find(m => m.supportedGenerationMethods?.includes("generateContent"));
                    
                    if (valid) {
                        const name = valid.name.replace('models/', '');
                        console.log("Auto-selected Gemini model:", name);
                        Storage.saveActiveModel(name);
                        return name;
                    }
                }
            }
        } catch (e) {
            console.warn("Model discovery failed, fallback will be used:", e);
        }

        return 'gemini-1.5-flash';
    },

    async callText(prompt) {
        const key = Storage.getApiKey();
        if (!key) throw new Error("Lipsă Cheie API Google Gemini. Configureaz-o în Setări.");

        let activeModel = Storage.getActiveModel();
        if (!activeModel) {
            activeModel = await this.getWorkingModel(key);
        }

        const candidateModels = [
            activeModel,
            'gemini-1.5-flash',
            'gemini-2.0-flash',
            'gemini-1.5-pro',
            'gemini-pro'
        ];
        const uniqueModels = [...new Set(candidateModels.filter(Boolean))];

        let lastError = null;
        for (const model of uniqueModels) {
            try {
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }]
                    })
                });

                if (response.ok) {
                    const data = await response.json();
                    if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
                        Storage.saveActiveModel(model);
                        return data.candidates[0].content.parts[0].text;
                    }
                }

                if (response.status === 404 || response.status === 400 || response.status === 403) {
                    console.warn(`Model ${model} returned ${response.status}, trying fallback...`);
                    continue;
                }
            } catch (e) {
                lastError = e;
            }
        }

        throw new Error(lastError ? lastError.message : "Niciun model AI nu a răspuns. Verifică cheia în Setări.");
    },

    async callVision(prompt, base64Data, mimeType) {
        const key = Storage.getApiKey();
        if (!key) throw new Error("Lipsă Cheie API Google Gemini. Configureaz-o în Setări.");

        let model = Storage.getActiveModel();
        if (!model || (!model.includes('flash') && !model.includes('1.5') && !model.includes('2.0'))) {
            model = 'gemini-1.5-flash';
        }

        const candidateModels = [model, 'gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-1.5-pro'];
        const uniqueModels = [...new Set(candidateModels)];

        for (const m of uniqueModels) {
            try {
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${key}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{
                            parts: [
                                { text: prompt },
                                { inlineData: { mimeType: mimeType || 'image/jpeg', data: base64Data } }
                            ]
                        }]
                    })
                });

                if (response.ok) {
                    const data = await response.json();
                    return data.candidates[0].content.parts[0].text;
                }
            } catch (e) {
                console.warn(`Vision call on model ${m} failed:`, e);
            }
        }

        throw new Error("Nu s-a putut analiza imaginea cu modelele disponibile.");
    }
};
