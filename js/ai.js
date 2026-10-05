// ==========================================
// AI Module - Google Gemini Integration
// ==========================================
import { Storage } from './storage.js';

export const AI = {
    currentAbortController: null,
    wasManuallyAborted: false,

    // Abort any ongoing AI request immediately
    abortCurrentRequest() {
        if (this.currentAbortController) {
            this.wasManuallyAborted = true;
            this.currentAbortController.abort();
            this.currentAbortController = null;
            return true;
        }
        return false;
    },

    // Test connection with API Key and target model
    async testConnection(key, model) {
        const apiKey = key || Storage.getApiKey();
        if (!apiKey) throw new Error("Lipsă cheie API.");

        let targetModel = model || Storage.getTargetModel();
        if (!targetModel || targetModel === 'auto' || targetModel === 'custom') {
            targetModel = 'gemini-flash-latest';
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000);

        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: controller.signal,
                body: JSON.stringify({
                    contents: [{ parts: [{ text: "Răspunde doar cu: OK" }] }]
                })
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errData = await response.json().catch(() => null);
                const errMsg = errData?.error?.message || `HTTP ${response.status}`;
                if (errMsg.includes("API_KEY_INVALID") || errMsg.includes("API key not valid")) {
                    throw new Error("Cheia API introdusă este invalidă. Verifică cheia în Google AI Studio.");
                }
                throw new Error(errMsg);
            }

            const data = await response.json();
            if (!data.candidates || !data.candidates[0]?.content?.parts?.[0]?.text) {
                throw new Error("Răspuns invalid de la Gemini API.");
            }

            Storage.saveActiveModel(targetModel);
            return true;
        } catch (e) {
            clearTimeout(timeoutId);
            if (e.name === 'AbortError') {
                throw new Error("Conexiunea a expirat (timeout). Verifică conexiunea la internet.");
            }
            throw e;
        }
    },

    // List all live available models from Google API
    async listAvailableModels(key) {
        const apiKey = key || Storage.getApiKey();
        if (!apiKey) throw new Error("Lipsă cheie API.");

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, {
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (!response.ok) {
                const errData = await response.json().catch(() => null);
                throw new Error(errData?.error?.message || `HTTP ${response.status}`);
            }

            const data = await response.json();
            if (!data.models || !Array.isArray(data.models)) return [];

            return data.models
                .filter(m => m.supportedGenerationMethods?.includes("generateContent"))
                .map(m => ({
                    id: m.name.replace('models/', ''),
                    displayName: m.displayName || m.name.replace('models/', ''),
                    description: m.description || ''
                }));
        } catch (e) {
            clearTimeout(timeoutId);
            if (e.name === 'AbortError') {
                throw new Error("Timpul de așteptare pentru lista de modele a expirat.");
            }
            throw e;
        }
    },

    async getWorkingModel(key) {
        const apiKey = key || Storage.getApiKey();
        const userTarget = Storage.getTargetModel();

        if (userTarget && userTarget !== 'auto' && userTarget !== 'custom') {
            return userTarget;
        }

        try {
            const models = await this.listAvailableModels(apiKey);
            const modelIds = models.map(m => m.id);

            const priorities = [
                'gemini-flash-latest',
                'gemini-flash-lite-latest',
                'gemini-2.5-flash',
                'gemini-2.0-flash',
                'gemini-1.5-flash'
            ];

            for (const p of priorities) {
                const found = modelIds.find(id => id === p || id.startsWith(p));
                if (found) {
                    Storage.saveActiveModel(found);
                    return found;
                }
            }

            if (modelIds.length > 0) {
                Storage.saveActiveModel(modelIds[0]);
                return modelIds[0];
            }
        } catch (e) {
            console.warn("Could not list models dynamically:", e);
        }

        const fallback = 'gemini-flash-latest';
        Storage.saveActiveModel(fallback);
        return fallback;
    },

    async callText(prompt, options = {}) {
        const key = Storage.getApiKey();
        if (!key) throw new Error("Lipsă Cheie API Google Gemini. Configureaz-o în Setări.");

        let targetModel = Storage.getTargetModel();
        if (!targetModel || targetModel === 'auto') {
            targetModel = await this.getWorkingModel(key);
        }

        // Candidates: selected target first, then proven reliable aliases
        const modelsToTry = [
            targetModel,
            'gemini-flash-latest',
            'gemini-flash-lite-latest'
        ];
        const uniqueModels = [...new Set(modelsToTry.filter(Boolean))];

        this.wasManuallyAborted = false;
        this.currentAbortController = new AbortController();
        const timeoutMs = options.timeoutMs || 18000;
        const timeoutId = setTimeout(() => {
            if (this.currentAbortController) {
                this.currentAbortController.abort();
            }
        }, timeoutMs);

        let lastError = null;
        try {
            for (const model of uniqueModels) {
                try {
                    console.log(`Sending request to: ${model}`);
                    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        signal: this.currentAbortController.signal,
                        body: JSON.stringify({
                            contents: [{ parts: [{ text: prompt }] }]
                        })
                    });

                    if (response.ok) {
                        const data = await response.json();
                        if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
                            Storage.saveActiveModel(model);
                            clearTimeout(timeoutId);
                            this.currentAbortController = null;
                            return data.candidates[0].content.parts[0].text;
                        }
                    }

                    const errData = await response.json().catch(() => null);
                    const errMsg = errData?.error?.message || `HTTP ${response.status}`;
                    lastError = new Error(`[${model}] ${errMsg}`);
                    console.warn(`Model ${model} failed (${response.status}):`, errMsg);

                    if (errMsg.includes("API_KEY_INVALID") || errMsg.includes("API key not valid")) {
                        throw new Error("Cheia API introdusă este invalidă. Verifică cheia în Google AI Studio.");
                    }
                } catch (e) {
                    if (e.name === 'AbortError' || this.currentAbortController?.signal?.aborted) {
                        throw new Error(this.wasManuallyAborted ? "Analiza a fost oprită manual." : "Analiza a expirat (timeout). Încearcă din nou sau folosește calculul local.");
                    }
                    if (e.message.includes("API_KEY_INVALID") || e.message.includes("Cheia API")) {
                        throw e;
                    }
                    lastError = e;
                }
            }
        } finally {
            clearTimeout(timeoutId);
            this.currentAbortController = null;
        }

        throw new Error(lastError ? lastError.message : `Nu s-a primit răspuns de la modelul ${targetModel}.`);
    },

    async callVision(prompt, base64Data, mimeType, options = {}) {
        const key = Storage.getApiKey();
        if (!key) throw new Error("Lipsă Cheie API Google Gemini. Configureaz-o în Setări.");

        let targetModel = Storage.getTargetModel();
        if (!targetModel || targetModel === 'auto') {
            targetModel = 'gemini-flash-latest';
        }

        const modelsToTry = [targetModel, 'gemini-flash-latest', 'gemini-flash-lite-latest'];
        const uniqueModels = [...new Set(modelsToTry.filter(Boolean))];

        this.wasManuallyAborted = false;
        this.currentAbortController = new AbortController();
        const timeoutMs = options.timeoutMs || 22000;
        const timeoutId = setTimeout(() => {
            if (this.currentAbortController) {
                this.currentAbortController.abort();
            }
        }, timeoutMs);

        let lastError = null;
        try {
            for (const m of uniqueModels) {
                try {
                    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${key}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        signal: this.currentAbortController.signal,
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
                        clearTimeout(timeoutId);
                        this.currentAbortController = null;
                        return data.candidates[0].content.parts[0].text;
                    }

                    const errData = await response.json().catch(() => null);
                    const errMsg = errData?.error?.message || `HTTP ${response.status}`;
                    lastError = new Error(`[${m}] ${errMsg}`);

                    if (errMsg.includes("API_KEY_INVALID") || errMsg.includes("API key not valid")) {
                        throw new Error("Cheia API introdusă este invalidă.");
                    }
                } catch (e) {
                    if (e.name === 'AbortError' || this.currentAbortController?.signal?.aborted) {
                        throw new Error(this.wasManuallyAborted ? "Analiza imaginii a fost oprită manual." : "Analiza imaginii a expirat (timeout).");
                    }
                    if (e.message.includes("Cheia API")) throw e;
                    lastError = e;
                }
            }
        } finally {
            clearTimeout(timeoutId);
            this.currentAbortController = null;
        }

        throw new Error(lastError ? lastError.message : "Nu s-a putut analiza imaginea.");
    }
};
