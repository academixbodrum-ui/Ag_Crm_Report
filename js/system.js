class SystemManager {
    constructor() {
        this.programListEl = document.getElementById('program-type-list');
        this.currencyListEl = document.getElementById('currency-list');
        this.programTypeMap = {}; // program_name -> type
        this.programs = []; // distinct program names
        this.currencyMap = {}; // currency_code -> { symbol, rate }
        this.currencies = []; // distinct currency codes
    }

    async loadData() {
        try {
            this.programListEl.innerHTML = '<div style="text-align:center; padding: 40px; color: var(--text-tertiary);">Yükleniyor...</div>';
            this.currencyListEl.innerHTML = '<div style="text-align:center; padding: 40px; color: var(--text-tertiary);">Yükleniyor...</div>';

            // 1. Load Programs
            const programs = await crmDB.getDistinctValues('crm_import_rows', 'Program');
            this.programTypeMap = {};
            try {
                const classifications = await crmDB.supabase.select('program_types');
                if (classifications && Array.isArray(classifications)) {
                    classifications.forEach(c => {
                        this.programTypeMap[c.program_name] = c.program_type;
                    });
                }
            } catch (e) {
                console.warn('program_types table error:', e);
            }
            window.programTypeMap = this.programTypeMap;
            this.programs = programs;
            this.renderProgramList(programs);

            // 2. Load Currencies
            const currencies = await crmDB.getDistinctValues('crm_import_rows', 'Currency');
            this.currencyMap = {};
            try {
                const currencyDefs = await crmDB.supabase.select('currencies');
                if (currencyDefs && Array.isArray(currencyDefs)) {
                    currencyDefs.forEach(c => {
                        this.currencyMap[c.code] = { symbol: c.symbol, rate: c.rate };
                    });
                }
            } catch (e) {
                console.warn('currencies table error:', e);
            }
            window.currencyMap = this.currencyMap;
            this.currencies = currencies;
            this.renderCurrencyList(currencies);

        } catch (error) {
            console.error('System load error:', error);
            this.programListEl.innerHTML = `<div class="alert alert-error">Veriler yüklenemedi: ${error.message}</div>`;
        }
    }

    renderProgramList(programs) {
        if (!programs.length) {
            this.programListEl.innerHTML = '<div style="text-align:center; padding: 40px; color: var(--text-tertiary);">Program bulunamadı.</div>';
            return;
        }

        let html = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Program Tanımı (CRM Adı)</th>
                        <th style="width: 250px;">Sınıflandırma</th>
                    </tr>
                </thead>
                <tbody>
        `;

        programs.forEach(prog => {
            const currentType = this.programTypeMap[prog] || 'Diğer';
            html += `
                <tr>
                    <td><strong>${prog}</strong></td>
                    <td>
                        <select class="program-type-select" data-program="${this.escapeHtml(prog)}" onchange="updateProgramTypeMap('${this.escapeHtml(prog)}', this.value)">
                            <option value="Akademik" ${currentType === 'Akademik' ? 'selected' : ''}>Akademik</option>
                            <option value="Dil" ${currentType === 'Dil' ? 'selected' : ''}>Dil</option>
                            <option value="Diğer" ${currentType === 'Diğer' ? 'selected' : ''}>Diğer</option>
                        </select>
                    </td>
                </tr>
            `;
        });

        html += `</tbody></table>`;
        this.programListEl.innerHTML = html;
    }

    renderCurrencyList(currencies) {
        if (!currencies.length) {
            this.currencyListEl.innerHTML = '<div style="text-align:center; padding: 40px; color: var(--text-tertiary);">Kullanılan döviz birimi bulunamadı. Lütfen önce CSV yükleyin.</div>';
            return;
        }

        let html = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>CRM'den Gelen Kur</th>
                        <th>TL Karşılığı (1 Birim)</th>
                        <th style="width: 150px;">Sembol (örn: $, €, TL)</th>
                    </tr>
                </thead>
                <tbody>
        `;

        currencies.forEach(code => {
            if (!code) return;
            // Default to 1 if no mapping exists
            const def = this.currencyMap[code] || { symbol: code, rate: 1 };
            html += `
                <tr>
                    <td><strong>${code}</strong></td>
                    <td>
                        <div class="input-with-label" style="display: flex; align-items: center; justify-content: flex-end; gap: 8px;">
                            <input type="number" step="0.0001" value="${def.rate}" 
                                onchange="updateCurrencyMap('${this.escapeHtml(code)}', 'rate', this.value)"
                                style="width: 140px; text-align: right; font-weight: 600;">
                            <span style="color: var(--text-tertiary); font-size: 0.8rem;">TL</span>
                        </div>
                    </td>
                    <td>
                        <input type="text" value="${this.escapeHtml(def.symbol)}" 
                            onchange="updateCurrencyMap('${this.escapeHtml(code)}', 'symbol', this.value)"
                            style="width: 100px; text-align: center;">
                    </td>
                </tr>
            `;
        });

        html += `</tbody></table>`;
        this.currencyListEl.innerHTML = html;
    }

    async saveClassifications() {
        const btn = document.getElementById('btn-save-program-types');
        const originalHtml = btn.innerHTML;
        try {
            btn.disabled = true;
            btn.innerHTML = 'Kaydediliyor...';
            const records = Object.entries(this.programTypeMap).map(([name, type]) => ({
                program_name: name,
                program_type: type
            }));
            if (records.length > 0) {
                await crmDB.supabase.upsert('program_types', records, 'program_name');
                showToast('Program tanımları kaydedildi.', 'success');
                window.programTypeMap = this.programTypeMap;
            }
        } catch (error) {
            showToast('Hata: ' + error.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalHtml;
        }
    }

    async saveCurrencies() {
        const btn = document.getElementById('btn-save-currencies');
        const originalHtml = btn.innerHTML;
        try {
            btn.disabled = true;
            btn.innerHTML = 'Kaydediliyor...';
            const records = Object.entries(this.currencyMap).map(([code, data]) => ({
                code: code,
                symbol: data.symbol,
                rate: parseFloat(data.rate) || 1
            }));
            if (records.length > 0) {
                await crmDB.supabase.upsert('currencies', records, 'code');
                showToast('Kur ayarları kaydedildi.', 'success');
                window.currencyMap = this.currencyMap;
            }
        } catch (error) {
            showToast('Hata: ' + error.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalHtml;
        }
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    filterList(query) {
        const q = (query || '').toLowerCase().trim();
        const filtered = this.programs.filter(p => p.toLowerCase().includes(q));
        this.renderProgramList(filtered);
    }

    filterCurrencyList(query) {
        const q = (query || '').toLowerCase().trim();
        const filtered = this.currencies.filter(c => c && c.toLowerCase().includes(q));
        this.renderCurrencyList(filtered);
    }
}

// Global functions
function switchSystemTab(tabId) {
    document.querySelectorAll('.system-tab-content').forEach(el => el.style.display = 'none');
    document.getElementById(tabId).style.display = 'block';
    
    document.querySelectorAll('#page-system .tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
    });
}

function updateProgramTypeMap(program, type) {
    if (window.systemManager) window.systemManager.programTypeMap[program] = type;
}

function updateCurrencyMap(code, field, value) {
    if (window.systemManager) {
        if (!window.systemManager.currencyMap[code]) {
            window.systemManager.currencyMap[code] = { symbol: code, rate: 1 };
        }
        window.systemManager.currencyMap[code][field] = value;
    }
}

async function saveAllProgramTypes() {
    if (window.systemManager) await window.systemManager.saveClassifications();
}

async function saveAllCurrencies() {
    if (window.systemManager) await window.systemManager.saveCurrencies();
}
