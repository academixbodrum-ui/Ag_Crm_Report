class SystemManager {
    constructor() {
        this.programListEl = document.getElementById('program-type-list');
        this.currencyListEl = document.getElementById('currency-list');
        this.programTypeMap = {}; // program_name -> type
        this.programs = []; // distinct program names
        this.currencyMap = {}; // currency_code -> { symbol, rate }
        this.currencies = []; // distinct currency codes
        this.currencyNames = {}; // ISO -> Full Name
        this.dailyBreakdown = {}; // code -> { month: string, days: [] }
        this.monthlyGrid = {}; // code -> { dayIndex: rate }
        this.dayRange = '1-15'; // '1-15' or '16-31'
        
        this.initYearSelect();
    }

    initYearSelect() {
        const yearSelect = document.getElementById('fetch-rate-year');
        if (!yearSelect) return;
        
        const currentYear = new Date().getFullYear();
        yearSelect.innerHTML = '';
        for (let y = currentYear; y >= 2010; y--) {
            const opt = document.createElement('option');
            opt.value = y;
            opt.textContent = y;
            yearSelect.appendChild(opt);
        }
    }

    async fetchCurrencyNames() {
        try {
            const res = await fetch('https://api.frankfurter.dev/v2/currencies');
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data)) {
                    data.forEach(item => {
                        this.currencyNames[item.iso_code] = item.name;
                    });
                }
            }
        } catch (e) {
            console.error('Birim isimleri çekilemedi:', e);
        }
        // API'de olmayan birimler için manuel isimler
        if (!this.currencyNames['AED']) this.currencyNames['AED'] = 'UAE Dirham';
    }

    async loadData() {
        try {
            this.programListEl.innerHTML = '<div style="text-align:center; padding: 40px; color: var(--text-tertiary);">Yükleniyor...</div>';
            this.currencyListEl.innerHTML = '<div style="text-align:center; padding: 40px; color: var(--text-tertiary);">Yükleniyor...</div>';

            await this.fetchCurrencyNames();

            // Load Programs
            const programs = await crmDB.getDistinctValues('crm_import_rows', 'Program');
            const classifications = await crmDB.supabase.select('program_types').catch(() => []);
            this.programTypeMap = {};
            (classifications || []).forEach(c => this.programTypeMap[c.program_name] = c.program_type);
            window.programTypeMap = this.programTypeMap;
            this.programs = programs;
            this.renderProgramList(programs);

            // Load Currencies
            const currencies = await crmDB.getDistinctValues('crm_import_rows', 'Currency');
            const currencyDefs = await crmDB.supabase.select('currencies').catch(() => []);
            this.currencyMap = {};
            (currencyDefs || []).forEach(c => this.currencyMap[c.code] = { symbol: c.symbol, rate: c.rate });
            window.currencyMap = this.currencyMap;
            this.currencies = currencies;
            this.renderCurrencyList(currencies);
            
            this.loadProcessedMonths();

        } catch (error) {
            console.error('System load error:', error);
            this.programListEl.innerHTML = `<div class="alert alert-error">Veriler yüklenemedi: ${error.message}</div>`;
        }
    }

    async loadProcessedMonths() {
        try {
            const res = await crmDB.supabase.select('currencies', 'select=month_year&limit=10000').catch(() => []);
            if (res) {
                const uniqueMonths = [...new Set(res.map(r => r.month_year).filter(Boolean))];
                this.renderProcessedMonths(uniqueMonths);
            } else {
                this.renderProcessedMonths([]);
            }
        } catch (error) {
            console.error('Geçmiş aylar yüklenirken hata oluştu:', error);
            this.renderProcessedMonths([]);
        }
    }

    renderProcessedMonths(months) {
        const listEl = document.getElementById('processed-months-list');
        if (!listEl) return;
        if (months.length === 0) {
            listEl.innerHTML = '<span style="font-size: 0.85rem; color: var(--text-tertiary);">Henüz işlenmiş ay bulunmamaktadır.</span>';
            return;
        }

        const monthOrder = {
            "Ocak": 1, "Şubat": 2, "Mart": 3, "Nisan": 4, 
            "Mayıs": 5, "Haziran": 6, "Temmuz": 7, "Ağustos": 8, 
            "Eylül": 9, "Ekim": 10, "Kasım": 11, "Aralık": 12
        };

        const grouped = {};
        months.forEach(m => {
            const parts = String(m).trim().split(' ');
            if (parts.length === 2) {
                const monthName = parts[0];
                const year = parts[1];
                if (!grouped[year]) grouped[year] = [];
                grouped[year].push({ original: m, name: monthName, num: monthOrder[monthName] || 99 });
            } else {
                const otherKey = "Diğer";
                if (!grouped[otherKey]) grouped[otherKey] = [];
                grouped[otherKey].push({ original: m, name: m, num: 99 });
            }
        });

        let html = '<div style="display: flex; flex-direction: column; gap: 10px; width: 100%;">';
        const sortedYears = Object.keys(grouped).sort((a,b) => {
            if (a === "Diğer") return 1;
            if (b === "Diğer") return -1;
            return b.localeCompare(a); // Yılları yeniden eskiye sıralar (Örn: 2025, 2024)
        });

        sortedYears.forEach(year => {
            // Ayları Ocak-Aralık (1-12) sırasına göre artan şekilde (ascending) sıralar
            const yearMonths = grouped[year].sort((a, b) => a.num - b.num);
            
            html += `
                <div style="display: flex; align-items: center; gap: 15px; border-bottom: 1px solid var(--border-accent); padding-bottom: 8px;">
                    <div style="font-weight: 700; color: var(--primary-color); min-width: 50px; font-size: 0.95rem;">${year}</div>
                    <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            `;
            yearMonths.forEach(mObj => {
                html += `<div style="background: var(--bg-secondary); border: 1px solid var(--border-accent); padding: 4px 10px; border-radius: 12px; font-size: 0.8rem; font-weight: 500; color: var(--text-secondary); cursor: pointer;" title="Bu ayın kurlarını tabloya yükle" onclick="if(window.systemManager) window.systemManager.loadHistoricalMonth('${this.escapeHtml(mObj.original)}')">${this.escapeHtml(mObj.name)}</div>`;
            });
            html += `</div></div>`;
        });
        html += '</div>';

        listEl.innerHTML = html;
    }

    loadHistoricalMonth(monthStr) {
        const parts = String(monthStr).trim().split(' ');
        if (parts.length !== 2) return;
        
        const monthName = parts[0];
        const year = parts[1];
        
        const monthOrder = {
            "Ocak": "01", "Şubat": "02", "Mart": "03", "Nisan": "04", 
            "Mayıs": "05", "Haziran": "06", "Temmuz": "07", "Ağustos": "08", 
            "Eylül": "09", "Ekim": "10", "Kasım": "11", "Aralık": "12"
        };
        
        const monthVal = monthOrder[monthName];
        if (!monthVal) return;
        
        const monthSelect = document.getElementById('fetch-rate-month');
        const yearSelect = document.getElementById('fetch-rate-year');
        
        if (monthSelect) monthSelect.value = monthVal;
        if (yearSelect) {
            // Eğer o yıl listede yoksa geçici option ekleyelim
            let options = Array.from(yearSelect.options).map(o => o.value);
            if (!options.includes(year)) {
                const opt = document.createElement('option');
                opt.value = year;
                opt.textContent = year;
                yearSelect.appendChild(opt);
            }
            yearSelect.value = year;
        }
        
        // API'den verileri yeniden çekip tabloyu doldurur
        this.fetchDailyRates();
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

    async fetchDailyRates() {
        const btn = document.getElementById('btn-fetch-rates');
        const monthSelect = document.getElementById('fetch-rate-month');
        const yearSelect = document.getElementById('fetch-rate-year');
        
        const month = monthSelect.value;
        const year = yearSelect.value;
        
        if (!month || !year) {
            showToast('Lütfen ay ve yıl seçin.', 'warning');
            return;
        }

        const originalHtml = btn.innerHTML;
        try {
            btn.disabled = true;
            btn.innerHTML = 'Çekiliyor...';

            const startDate = `${year}-${month}-01`;
            const lastDay = new Date(year, month, 0).getDate();
            const endDate = `${year}-${month}-${lastDay}`;
            
            // API tarafından desteklenmeyen sabit kurlu para birimleri (USD'ye karşı)
            const FIXED_RATES = {
                'AED': 3.6725  // AED, USD'ye sabit kur ile bağlı
            };

            const allCodes = this.currencies
                .map(c => {
                    if (!c) return "";
                    const match = c.match(/[A-Z]{3}/);
                    let code = match ? match[0] : "";
                    if (code === 'YEN') code = 'JPY';
                    if (code === 'TL') code = 'TRY';
                    return code;
                })
                .filter(c => c !== "");

            // Sabit kurlu birimleri ve USD'yi API'den çıkar (Çünkü USD base olacak)
            const apiSymbols = allCodes.filter(c => !FIXED_RATES[c] && c !== 'USD').join(',');

            this.monthlyGrid = {};
            this.filledDays = {}; // Tatil/Hafta sonu doldurulan günleri kırmızı yapmak için

            allCodes.forEach(code => {
                this.filledDays[code] = {};
                this.monthlyGrid[code] = {};
            });

            // USD base olduğu için değeri hep 1.00 yapalım
            if (this.monthlyGrid['USD']) {
                for (let d = 1; d <= lastDay; d++) {
                    this.monthlyGrid['USD'][d] = "1.00";
                }
            }

            // API'den desteklenen birimleri çek (Base dövizi USD)
            if (apiSymbols) {
                const url = `https://api.frankfurter.dev/v1/${startDate}..${endDate}?base=USD&symbols=${apiSymbols}`;
                const res = await fetch(url);
                if (!res.ok) throw new Error(`API Hatası (${res.status})`);
                
                const data = await res.json();
                
                if (data.rates) {
                    Object.entries(data.rates).forEach(([dateStr, currencies]) => {
                        const day = parseInt(dateStr.split('-')[2]);
                        Object.entries(currencies).forEach(([code, rate]) => {
                            if (this.monthlyGrid[code]) {
                                // Değer zaten 1 USD = X Currency olduğu için direkt alıyoruz
                                this.monthlyGrid[code][day] = rate.toFixed(2);
                            }
                        });
                    });
                }
            }

            // Sabit kurlu birimler için (Örn: AED) tüm geçerli günlere sabit değer ata
            allCodes.forEach(code => {
                if (FIXED_RATES[code]) {
                    const peggedRate = FIXED_RATES[code]; // 1 USD = 3.6725 AED
                    for (let d = 1; d <= lastDay; d++) {
                        this.monthlyGrid[code][d] = peggedRate.toFixed(2);
                    }
                }
            });

            // Hafta sonu / tatil günleri için boş günleri ORTALAMA ile doldur ve bugünden sonrasını temizle
            const today = new Date();
            const currentYear = today.getFullYear();
            const currentMonth = today.getMonth() + 1;
            const currentDay = today.getDate();
            const isCurrentMonth = (parseInt(year) === currentYear && parseInt(month) === currentMonth);
            const isFutureMonth = (parseInt(year) > currentYear || (parseInt(year) === currentYear && parseInt(month) > currentMonth));

            Object.keys(this.monthlyGrid).forEach(code => {
                let sum = 0;
                let count = 0;

                // Geçerli olan günleri topla ve ortalama için sayımı al, boşları işaretle
                for (let d = 1; d <= lastDay; d++) {
                    if (isFutureMonth || (isCurrentMonth && d > currentDay)) continue;

                    if (!this.monthlyGrid[code][d]) {
                        this.filledDays[code][d] = true;
                    } else {
                        sum += parseFloat(this.monthlyGrid[code][d]);
                        count++;
                    }
                }

                const avg = count > 0 ? (sum / count).toFixed(2) : "";

                // Bugünden sonraki günlerin değerlerini boşalt, diğer boş günlere de ortalamayı yaz
                for (let d = 1; d <= lastDay; d++) {
                    if (isFutureMonth || (isCurrentMonth && d > currentDay)) {
                        this.monthlyGrid[code][d] = "";
                        this.filledDays[code][d] = false;
                    } else {
                        if (!this.monthlyGrid[code][d] && avg !== "") {
                            this.monthlyGrid[code][d] = avg;
                        }
                    }
                }
            });

            this.currencies.forEach(code => {
                const match = code.match(/[A-Z]{3}/);
                let cleanCode = match ? match[0].toUpperCase() : "";
                if (cleanCode === 'YEN') cleanCode = 'JPY';
                if (cleanCode === 'TL') cleanCode = 'TRY';
                
                if (this.monthlyGrid[cleanCode]) {
                    this.updateRowAverage(code, cleanCode);
                }
            });

            showToast(`${month}/${year} kurları hesaplandı.`, 'success');
            this.renderCurrencyList(this.currencies);

        } catch (error) {
            showToast('Hata: ' + error.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalHtml;
        }
    }

    updateGridValue(code, day, val) {
        const match = code.match(/[A-Z]{3}/);
        let cleanCode = match ? match[0] : "";
        if (cleanCode === 'YEN') cleanCode = 'JPY';
        if (cleanCode === 'TL') cleanCode = 'TRY';

        if (!this.monthlyGrid[cleanCode]) this.monthlyGrid[cleanCode] = {};
        this.monthlyGrid[cleanCode][day] = val;
        this.updateRowAverage(code, cleanCode);
    }

    updateRowAverage(originalCode, cleanCode) {
        const days = this.monthlyGrid[cleanCode];
        if (!days) return;

        let sum = 0;
        let count = 0;
        for (let d = 1; d <= 31; d++) {
            const val = parseFloat(days[d]);
            if (!isNaN(val) && val > 0) {
                sum += val;
                count++;
            }
        }

        const avg = count > 0 ? (sum / count).toFixed(2) : "1.00";
        updateCurrencyMap(originalCode, 'rate', avg);

        const safeId = this.getSafeId(originalCode);
        const avgDisplay = document.getElementById(`avg-${safeId}`);
        if (avgDisplay) avgDisplay.textContent = avg;
    }

    renderCurrencyList(currencies) {
        if (!currencies.length) {
            this.currencyListEl.innerHTML = '<div style="text-align:center; padding: 40px; color: var(--text-tertiary);">Döviz bulunamadı.</div>';
            return;
        }

        const monthSelect = document.getElementById('fetch-rate-month');
        const yearSelect = document.getElementById('fetch-rate-year');
        const month = parseInt(monthSelect ? monthSelect.value : "1");
        const year = parseInt(yearSelect ? yearSelect.value : new Date().getFullYear());
        const daysInMonth = new Date(year, month, 0).getDate();

        const startDay = 1;
        const endDay = 31;

        let html = `
            <div style="overflow-x: auto; border-radius: 12px; border: 1px solid var(--border-accent); background: var(--bg-primary);">
                <table class="data-table" style="margin-bottom: 0; min-width: 100%; border-collapse: separate; border-spacing: 0;">
                    <thead>
                        <tr>
                            <th style="position: sticky; left: 0; z-index: 20; background: var(--bg-secondary); border-right: 2px solid var(--border-accent); min-width: 140px;">Birim</th>
        `;

        // Range headers
        for (let d = startDay; d <= endDay; d++) {
            const isInactive = d > daysInMonth;
            html += `<th style="text-align: center; ${isInactive ? 'opacity: 0.3; background: #fafafa;' : ''}">${d}</th>`;
        }

        html += `
                            <th style="text-align: right; width: 120px; background: var(--bg-secondary); border-left: 2px solid var(--border-accent); color: var(--primary-color);">Aylık Ortalama</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        currencies.forEach(code => {
            if (!code) return;
            const match = code.match(/[A-Z]{3}/);
            let cleanCode = match ? match[0] : "";
            if (cleanCode === 'YEN') cleanCode = 'JPY';
            if (cleanCode === 'TL') cleanCode = 'TRY';
            const fullName = this.currencyNames[cleanCode] || "";
            const def = this.currencyMap[code] || { rate: 1 };
            const gridData = this.monthlyGrid[cleanCode] || {};

            html += `
                <tr>
                    <td style="position: sticky; left: 0; z-index: 10; background: var(--bg-primary); border-right: 2px solid var(--border-accent); padding: 8px 12px;">
                        <div style="font-weight: 700; font-size: 0.9rem; line-height: 1.1;">${code}</div>
                        <div style="font-size: 0.7rem; color: var(--text-tertiary); margin-top: 2px; line-height: 1;">${fullName}</div>
                    </td>
            `;

            for (let d = startDay; d <= endDay; d++) {
                const isInactive = d > daysInMonth;
                const value = gridData[d] || "";
                
                let textColor = 'var(--text-secondary)';
                if (this.filledDays && this.filledDays[cleanCode] && this.filledDays[cleanCode][d] && value !== "") {
                    textColor = '#ef4444'; // Red for filled weekend/holiday dates
                }

                html += `
                    <td style="padding: 2px; ${isInactive ? 'background: rgba(0,0,0,0.02);' : ''} border-right: 1px solid var(--border-accent);">
                        <input type="text" value="${value}" 
                            readonly
                            ${isInactive ? 'disabled' : ''}
                            style="width: 22px; border: none; background: transparent; text-align: center; font-size: 0.65rem; height: 24px; font-weight: 500; color: ${textColor};">
                    </td>
                `;
            }

            const safeId = this.getSafeId(code);
            html += `
                    <td style="text-align: right; background: rgba(59, 130, 246, 0.05); border-left: 2px solid var(--border-accent); padding: 8px 12px;">
                        <div id="avg-${safeId}" style="font-weight: 800; font-size: 1rem; color: var(--primary-color);">${def.rate}</div>
                    </td>
                </tr>
            `;
        });

        html += `</tbody></table></div>`;
        this.currencyListEl.innerHTML = html;
    }

    async saveClassifications() {
        const btn = document.getElementById('btn-save-program-types');
        const originalHtml = btn.innerHTML;
        try {
            btn.disabled = true;
            btn.innerHTML = 'Kaydediliyor...';
            const records = Object.entries(this.programTypeMap).map(([name, type]) => ({ program_name: name, program_type: type }));
            if (records.length > 0) {
                await crmDB.supabase.upsert('program_types', records, 'program_name');
                showToast('Program tanımları kaydedildi.', 'success');
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
            
            const monthSelect = document.getElementById('fetch-rate-month');
            const monthName = monthSelect.options[monthSelect.selectedIndex].text;
            const yearVal = document.getElementById('fetch-rate-year').value;
            const monthYear = `${monthName} ${yearVal}`;

            const records = Object.entries(this.currencyMap).map(([code, data]) => ({
                code: code,
                month_year: monthYear,
                symbol: data.symbol || code,
                rate: parseFloat(data.rate) || 1
            }));
            
            if (records.length > 0) {
                // onConflict parametresi vermeden doğrudan primary key'ye (code + month_year) göre upsert yaptırıyoruz
                await crmDB.supabase.upsert('currencies', records);
                showToast(`${monthYear} için kurlar arşivlendi.`, 'success');
                this.loadProcessedMonths();

                // Kaydetme işlemi bittikten sonra tablodaki değerleri sıfırlarız
                this.currencies.forEach(c => {
                    const match = c.match(/[A-Z]{3}/);
                    let code = match ? match[0].toUpperCase() : "";
                    if (code === 'YEN') code = 'JPY';
                    if (code === 'TL') code = 'TRY';
                    
                    if (this.currencyMap[c]) this.currencyMap[c].rate = "";
                });
                this.monthlyGrid = {};
                this.filledDays = {};
                this.renderCurrencyList(this.currencies);
            }
        } catch (error) {
            showToast('Hata: ' + error.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalHtml;
        }
    }

    getSafeId(str) {
        if (!str) return 'null';
        return 'id-' + str.split('').map(c => c.charCodeAt(0).toString(16)).join('');
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
    document.querySelectorAll('#page-system .tab-btn').forEach(btn => btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId));
}
function updateProgramTypeMap(p, t) { if (window.systemManager) window.systemManager.programTypeMap[p] = t; }
function updateCurrencyMap(c, f, v) {
    if (window.systemManager) {
        if (!window.systemManager.currencyMap[c]) window.systemManager.currencyMap[c] = { symbol: c, rate: 1 };
        window.systemManager.currencyMap[c][f] = v;
    }
}
async function saveAllProgramTypes() { if (window.systemManager) await window.systemManager.saveClassifications(); }
async function saveAllCurrencies() { if (window.systemManager) await window.systemManager.saveCurrencies(); }
async function fetchDailyRates() { if (window.systemManager) await window.systemManager.fetchDailyRates(); }
