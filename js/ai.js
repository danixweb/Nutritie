// ==========================================
// AI Module - Google Gemini Integration
// ==========================================
import { Storage } from './storage.js';

export const AI = {
    async getWorkingModel(key) {
        // Try to query Google API for accessible models
        try {
            console.log("Discovering available Gemini models for key...");
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
            if (response.ok) {
                const data = await response.json();
                if (data.models && Array.isArray(data.models)) {
                    // Filter models that support generateContent
                    const available = data.models
                        .filter(m => m.supportedGenerationMethods?.includes("generateContent"))
                        .map(m => m.name.replace('models/', ''));

                    // Prioritize fast modern models
                    const prioritized = ['gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-2.0-pro'];
                    for (const p of prioritized) {
                        const found = available.find(a => a === p || a.startsWith(p));
                        if (found) {
                            console.log("Auto-selected model:", found);
                            Storage.saveActiveModel(found);
                            return found;
                        }
                    }

                    if (available.length > 0) {
                        Storage.saveActiveModel(available[0]);
                        return available[0];
                    }
                }
            }
        } catch (e) {
            console.warn("Model discovery request failed:", e);
        }

        // Default to modern standard
        const fallback = 'gemini-1.5-flash';
        Storage.saveActiveModel(fallback);
        return fallback;
    },

    async callText(prompt) {
        const key = Storage.getApiKey();
        if (!key) throw new Error("Lipsă Cheie API Google Gemini. Configureaz-o în Setări.");

        let activeModel = Storage.getActiveModel() || 'gemini-1.5-flash';
        if (activeModel === 'gemini-pro') activeModel = 'gemini-1.5-flash'; // replace legacy model

        const candidateModels = [
            activeModel,
            'gemini-1.5-flash',
            'gemini-2.0-flash',
            'gemini-1.5-pro'
        ];
        const uniqueModels = [...new Set(candidateModels.filter(Boolean))];

        let lastError = null;
        for (const model of uniqueModels) {
            try {
                console.log(`Sending request to model: ${model}`);
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

                // If not OK, inspect error
                const errData = await response.json().catch(() => null);
                const errMsg = errData?.error?.message || `HTTP ${response.status}`;
                lastError = new Error(errMsg);
                console.warn(`Model ${model} failed (${response.status}):`, errMsg);

                // If API key is completely invalid, stop immediately
                if (errMsg.includes("API_KEY_INVALID") || errMsg.includes("API key not valid")) {
                    throw new Error("Cheia API introdusă este invalidă. Verifică cheia în Google AI Studio.");
                }

                // Otherwise continue to next fallback model
                continue;
            } catch (e) {
                if (e.message.includes("API_KEY_INVALID") || e.message.includes("Cheia API")) {
                    throw e;
                }
                lastError = e;
            }
        }

        throw new Error(lastError ? lastError.message : "Niciun model AI nu a răspuns. Reîncearcă.");
    },

    async callVision(prompt, base64Data, mimeType) {
        const key = Storage.getApiKey();
        if (!key) throw new Error("Lipsă Cheie API Google Gemini. Configureaz-o în Setări.");

        let model = Storage.getActiveModel() || 'gemini-1.5-flash';
        if (model === 'gemini-pro') model = 'gemini-1.5-flash';

        const candidateModels = [model, 'gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-1.5-pro'];
        const uniqueModels = [...new Set(candidateModels)];

        let lastError = null;
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

                const errData = await response.json().catch(() => null);
                const errMsg = errData?.error?.message || `HTTP ${response.status}`;
                lastError = new Error(errMsg);

                if (errMsg.includes("API_KEY_INVALID") || errMsg.includes("API key not valid")) {
                    throw new Error("Cheia API introdusă este invalidă.");
                }
            } catch (e) {
                if (e.message.includes("Cheia API")) throw e;
                lastError = e;
            }
        }

        throw new Error(lastError ? lastError.message : "Nu s-a putut analiza imaginea cu modelele disponibile.");
    }
};
