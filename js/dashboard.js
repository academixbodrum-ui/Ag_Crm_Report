/**
 * dashboard.js — CRM Statistics Dashboard with KPI cards, time filters and pivot tables
 * Employee bazında Program Tanımı → Program hiyerarşik yapı
 */

class DashboardManager {
    constructor() {
        this.allData = [];
        this.activeData = [];
        this.missingCount = 0;
        this.filtersInitialized = false;
    }

    async render(type = 'dash-general') {
        this.currentView = type;
        this.allData = await crmDB.getJoinedData();
        this.activeData = this.allData.filter(r => !r.is_missing_in_latest_upload);
        this.missingCount = this.allData.filter(r => r.is_missing_in_latest_upload).length;

        if (this.allData.length === 0) {
            this.showEmpty();
            return;
        }

        // Initialize time & employee filters
        if (!this.filtersInitialized) {
            this.initFilters();
            this.filtersInitialized = true;
        }

        this.applyFiltersAndRender();
    }

    // ========== FILTERS ==========

    initFilters() {
        const timeFilter = document.getElementById('dash-time-filter');
        const yearSelect = document.getElementById('dash-year');
        const monthSelect = document.getElementById('dash-month');
        const yearWrapper = document.getElementById('dash-year-wrapper');
        const monthWrapper = document.getElementById('dash-month-wrapper');

        // Populate year dropdown from data
        const years = this.getAvailableYears();
        yearSelect.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
        // Default to current year
        const currentYear = new Date().getFullYear();
        if (years.includes(currentYear)) {
            yearSelect.value = currentYear;
        }
        // Default month to current month
        const currentMonth = new Date().getMonth() + 1;
        monthSelect.value = currentMonth;

        // Populate Employee filter
        const empSelect = document.getElementById('dash-employee-filter');
        if (empSelect) {
            const employees = [...new Set(this.activeData.map(r => r['Employee']).filter(Boolean))].sort();
            empSelect.innerHTML = '<option value="">Tüm Çalışanlar</option>' +
                employees.map(e => `<option value="${this.escapeHtml(e)}">${this.escapeHtml(e)}</option>`).join('');
        }

        // Event listeners
        timeFilter.addEventListener('change', () => {
            const val = timeFilter.value;
            yearWrapper.style.display = (val === 'yearly' || val === 'monthly') ? '' : 'none';
            monthWrapper.style.display = val === 'monthly' ? '' : 'none';
            this.applyFiltersAndRender();
        });

        yearSelect.addEventListener('change', () => this.applyFiltersAndRender());
        monthSelect.addEventListener('change', () => this.applyFiltersAndRender());

        if (empSelect) {
            empSelect.addEventListener('change', () => this.applyFiltersAndRender());
        }
    }

    getAvailableYears() {
        const years = new Set();
        this.activeData.forEach(row => {
            const dateStr = row['Record Date'];
            if (dateStr) {
                const d = this.parseDate(dateStr);
                if (d) years.add(d.getFullYear());
            }
        });
        return [...years].sort((a, b) => b - a);
    }

    parseDate(dateStr) {
        if (!dateStr) return null;
        // Handle various date formats
        if (dateStr instanceof Date) return dateStr;
        // Try dd.MM.yyyy
        const parts = String(dateStr).split('.');
        if (parts.length === 3) {
            const d = new Date(parts[2], parts[1] - 1, parts[0]);
            if (!isNaN(d.getTime())) return d;
        }
        // Try ISO format
        const d = new Date(dateStr);
        return isNaN(d.getTime()) ? null : d;
    }

    getFilteredData() {
        let data = [...this.activeData];
        const timeFilter = document.getElementById('dash-time-filter');
        const yearSelect = document.getElementById('dash-year');
        const monthSelect = document.getElementById('dash-month');
        const empSelect = document.getElementById('dash-employee-filter');

        // Time filter
        if (timeFilter && timeFilter.value !== 'all') {
            const selectedYear = parseInt(yearSelect.value);
            const selectedMonth = parseInt(monthSelect.value);

            data = data.filter(row => {
                const dateStr = row['Record Date'];
                const d = this.parseDate(dateStr);
                if (!d) return false;

                if (timeFilter.value === 'yearly') {
                    return d.getFullYear() === selectedYear;
                } else if (timeFilter.value === 'monthly') {
                    return d.getFullYear() === selectedYear && (d.getMonth() + 1) === selectedMonth;
                }
                return true;
            });
        }

        // Employee filter
        if (empSelect && empSelect.value) {
            data = data.filter(row => row['Employee'] === empSelect.value);
        }

        return data;
    }

    applyFiltersAndRender() {
        const filteredData = this.getFilteredData();
        const missingCount = this.missingCount;

        // Hide all dashboard sections first if needed, or handle inside methods
        this.toggleSectionsVisibility();

        if (this.currentView === 'dash-general') {
            this.renderKPIs(filteredData, missingCount);
            this.renderStatusDistribution(filteredData);
            this.renderPivotEmployee(filteredData);
            this.renderPivotProgram(filteredData);
            this.renderPivotCurrency(filteredData);
        } else if (this.currentView === 'dash-counsellor') {
            this.renderPivotCounsellor(filteredData);
        } else if (this.currentView === 'dash-school') {
            this.renderPivotSchoolDetailed(filteredData);
            this.renderPivotSchool(filteredData); 
        }
    }

    toggleSectionsVisibility() {
        // Toggle elements based on this.currentView
        const isGeneral = this.currentView === 'dash-general';
        const isCounsellor = this.currentView === 'dash-counsellor';
        const isSchool = this.currentView === 'dash-school';

        const show = (id, visible) => {
            const el = document.getElementById(id);
            if (el) el.closest('.dashboard-section')?.style.setProperty('display', visible ? '' : 'none', 'important');
            if (el && !el.closest('.dashboard-section')) el.style.display = visible ? '' : 'none';
        };

        // KPI grid is only for general
        const kpiGrid = document.getElementById('kpi-grid');
        if (kpiGrid) kpiGrid.style.display = isGeneral ? 'grid' : 'none';

        show('status-distribution', isGeneral);
        show('pivot-employee', isGeneral);
        show('pivot-program', isGeneral);
        show('pivot-currency', isGeneral);
        
        show('pivot-counsellor', isCounsellor);
        
        show('pivot-school-detailed', isSchool);
        show('pivot-school', isSchool);
    }

    showEmpty() {
        const containers = ['kpi-grid', 'status-distribution',
            'pivot-employee', 'pivot-program',
            'pivot-school', 'pivot-currency'];

        containers.forEach(id => {
            const el = document.getElementById(id);
            if (el && id === 'kpi-grid') {
                // Keep KPI cards with zeros
            } else if (el) {
                el.innerHTML = `
                    <div class="empty-state">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                            <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
                        </svg>
                        <h3>Veri Bulunamadı</h3>
                        <p>İstatistikleri görmek için önce CSV raporu yükleyin.</p>
                    </div>
                `;
            }
        });
    }

    // ========== KPI CARDS ==========

    renderKPIs(data, missingCount) {
        const totalCount = data.length;
        const totalTuition = this.sumField(data, 'Tuition');
        const totalPaid = this.sumField(data, 'Paid');
        const totalBalance = this.sumField(data, 'Balance');
        const avgTuition = totalCount > 0 ? totalTuition / totalCount : 0;

        this.animateValue('kpi-total-value', totalCount, false);
        this.animateValue('kpi-tuition-value', totalTuition, true);
        this.animateValue('kpi-paid-value', totalPaid, true);
        this.animateValue('kpi-balance-value', totalBalance, true);
        this.animateValue('kpi-avg-tuition-value', avgTuition, true);
        this.animateValue('kpi-missing-value', missingCount, false);
    }

    animateValue(elementId, targetValue, isCurrency) {
        const el = document.getElementById(elementId);
        if (!el) return;

        const duration = 800;
        const startTime = performance.now();
        const startValue = 0;

        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Ease out cubic
            const easeOut = 1 - Math.pow(1 - progress, 3);
            const currentValue = startValue + (targetValue - startValue) * easeOut;

            if (isCurrency) {
                el.textContent = formatNumber(currentValue);
            } else {
                el.textContent = Math.round(currentValue).toLocaleString('tr-TR');
            }

            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };

        requestAnimationFrame(animate);
    }

    // ========== STATUS DISTRIBUTION ==========

    renderStatusDistribution(data) {
        const container = document.getElementById('status-distribution');
        const total = data.length;

        const statusCounts = {};
        STATUSES.forEach(s => statusCounts[s] = 0);
        data.forEach(row => {
            const st = row._tracking.status || 'Process';
            statusCounts[st] = (statusCounts[st] || 0) + 1;
        });

        const statusColors = {
            'Process': '#22d4bf',
            'Visa': '#f59e0b',
            'Awaiting Payment': '#ec4899',
            'School Payment': '#a855f7',
            'Commission': '#22c55e',
            'Commission (Taksim)': '#10b981',
            'Completed': '#60a5fa',
            'Cancelled': '#888888'
        };

        container.innerHTML = STATUSES.map(status => {
            const count = statusCounts[status];
            const pct = total > 0 ? (count / total) * 100 : 0;
            const color = statusColors[status];

            return `
                <div class="status-dist-item">
                    <span class="status-dist-count" style="color: ${color};">${count}</span>
                    <span class="status-dist-label">${status}</span>
                    <div class="status-dist-bar">
                        <div class="status-dist-bar-fill" style="width: ${pct}%; background: ${color};"></div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // ========== PIVOT TABLES ==========

    renderPivotEmployee(data) {
        const container = document.getElementById('pivot-employee');
        const empSelect = document.getElementById('dash-employee-filter');
        const selectedEmployee = empSelect ? empSelect.value : '';

        if (selectedEmployee) {
            // Employee seçiliyse: Program Tanımı → Program hiyerarşisi göster
            this.renderEmployeeDetail(data, container);
        } else {
            // Employee seçilmemişse: tüm employee'lerin özet tablosu
            this.renderEmployeeSummary(data, container);
        }
    }

    renderEmployeeSummary(data, container) {
        const groups = this.groupBy(data, 'Employee');
        const rows = Object.entries(groups).map(([key, items]) => ({
            group: key || '(Boş)',
            count: items.length,
            tuition: this.sumField(items, 'Tuition'),
            paid: this.sumField(items, 'Paid'),
            comm: this.sumField(items, 'Comm')
        })).sort((a, b) => b.count - a.count);

        const totals = {
            count: rows.reduce((s, r) => s + r.count, 0),
            tuition: rows.reduce((s, r) => s + r.tuition, 0),
            paid: rows.reduce((s, r) => s + r.paid, 0),
            comm: rows.reduce((s, r) => s + r.comm, 0)
        };

        container.innerHTML = this.buildPivotTable(
            ['Employee', 'Kayıt', 'Tuition', 'Paid', 'Comm'],
            rows.map(r => [r.group, r.count, formatNumber(r.tuition), formatNumber(r.paid), formatNumber(r.comm)]),
            ['Toplam', totals.count, formatNumber(totals.tuition), formatNumber(totals.paid), formatNumber(totals.comm)],
            [false, false, true, true, true]
        );
    }

    renderEmployeeDetail(data, container) {
        // Program Tanımı bazında grupla, her tipin altında programları göster
        const programTypeMap = window.programTypeMap || {};

        // Group by program type
        const typeGroups = {};
        data.forEach(row => {
            const program = row['Program'] || '(Boş)';
            const type = programTypeMap[program] || 'Diğer';
            if (!typeGroups[type]) typeGroups[type] = {};
            if (!typeGroups[type][program]) typeGroups[type][program] = [];
            typeGroups[type][program].push(row);
        });

        const typeOrder = ['Akademik', 'Dil', 'Diğer'];
        const typeColors = {
            'Akademik': 'var(--accent-blue)',
            'Dil': 'var(--accent-green)',
            'Diğer': 'var(--accent-amber)'
        };

        let html = '';
        let grandTotalCount = 0;
        let grandTotalTuition = 0;
        let grandTotalPaid = 0;
        let grandTotalBalance = 0;

        typeOrder.forEach(type => {
            const programs = typeGroups[type];
            if (!programs) return;

            // Calculate type totals
            let typeTotalCount = 0;
            let typeTotalTuition = 0;
            let typeTotalPaid = 0;
            let typeTotalBalance = 0;

            const programRows = Object.entries(programs).map(([prog, items]) => {
                const count = items.length;
                const tuition = this.sumField(items, 'Tuition');
                const paid = this.sumField(items, 'Paid');
                const balance = this.sumField(items, 'Balance');
                typeTotalCount += count;
                typeTotalTuition += tuition;
                typeTotalPaid += paid;
                typeTotalBalance += balance;
                return { program: prog, count, tuition, paid, balance };
            }).sort((a, b) => b.count - a.count);

            grandTotalCount += typeTotalCount;
            grandTotalTuition += typeTotalTuition;
            grandTotalPaid += typeTotalPaid;
            grandTotalBalance += typeTotalBalance;

            const color = typeColors[type] || 'var(--text-secondary)';

            html += `
                <div class="employee-type-section" style="margin-bottom: 20px;">
                    <div class="employee-type-header" style="
                        display: flex; align-items: center; gap: 12px;
                        padding: 12px 16px; border-radius: 10px;
                        background: rgba(255,255,255,0.03); border-left: 4px solid ${color};
                        margin-bottom: 8px;
                    ">
                        <span style="font-weight: 700; font-size: 1rem; color: ${color};">${type}</span>
                        <span style="
                            background: ${color}; color: #fff; padding: 2px 10px;
                            border-radius: 12px; font-size: 0.75rem; font-weight: 600;
                        ">${typeTotalCount} kayıt</span>
                        <span style="margin-left: auto; font-size: 0.85rem; color: var(--text-secondary);">
                            Tuition: ${formatNumber(typeTotalTuition)} | Paid: ${formatNumber(typeTotalPaid)} | Balance: ${formatNumber(typeTotalBalance)}
                        </span>
                    </div>
                    <table class="pivot-table" style="margin-bottom: 0;">
                        <thead>
                            <tr>
                                <th>Program</th>
                                <th class="th-number">Kayıt</th>
                                <th class="th-number">Tuition</th>
                                <th class="th-number">Paid</th>
                                <th class="th-number">Balance</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            programRows.forEach(r => {
                html += `
                    <tr>
                        <td class="td-group" title="${this.escapeHtml(r.program)}">${this.escapeHtml(r.program)}</td>
                        <td class="td-number">${r.count}</td>
                        <td class="td-number">${formatNumber(r.tuition)}</td>
                        <td class="td-number">${formatNumber(r.paid)}</td>
                        <td class="td-number">${formatNumber(r.balance)}</td>
                    </tr>
                `;
            });

            html += `
                        </tbody>
                    </table>
                </div>
            `;
        });

        // Grand total
        html += `
            <div style="
                padding: 12px 16px; border-radius: 10px;
                background: rgba(255,255,255,0.05); border-top: 2px solid var(--border-color);
                display: flex; justify-content: space-between; align-items: center;
                font-weight: 700; font-size: 0.9rem; color: var(--text-primary);
            ">
                <span>Genel Toplam: ${grandTotalCount} kayıt</span>
                <span>Tuition: ${formatNumber(grandTotalTuition)} | Paid: ${formatNumber(grandTotalPaid)} | Balance: ${formatNumber(grandTotalBalance)}</span>
            </div>
        `;

        container.innerHTML = html;
    }

    renderPivotCounsellor(data) {
        // Counsellor usually maps to 'Representative' field or similar; checking field map
        const field = 'Represantative'; 
        const groups = this.groupBy(data, field);
        const rows = Object.entries(groups).map(([key, items]) => ({
            group: key || '(Belirtilmemiş)',
            count: items.length,
            tuition: this.sumField(items, 'Tuition'),
            paid: this.sumField(items, 'Paid'),
            balance: this.sumField(items, 'Balance')
        })).sort((a, b) => b.count - a.count);

        const totals = {
            count: rows.reduce((s, r) => s + r.count, 0),
            tuition: rows.reduce((s, r) => s + r.tuition, 0),
            paid: rows.reduce((s, r) => s + r.paid, 0),
            balance: rows.reduce((s, r) => s + r.balance, 0)
        };

        document.getElementById('pivot-counsellor').innerHTML = this.buildPivotTable(
            ['Counsellor', 'Kayıt', 'Tuition', 'Paid', 'Balance'],
            rows.map(r => [r.group, r.count, formatNumber(r.tuition), formatNumber(r.paid), formatNumber(r.balance)]),
            ['Toplam', totals.count, formatNumber(totals.tuition), formatNumber(totals.paid), formatNumber(totals.balance)],
            [false, false, true, true, true]
        );
    }

    renderPivotSchoolDetailed(data) {
        // This will be a summary table that allows drill-down when clicked
        const groups = this.groupBy(data, 'School');
        const rows = Object.entries(groups).map(([school, items]) => ({
            group: school || '(Belirtilmemiş)',
            count: items.length,
            totalTuition: this.sumField(items, 'Tuition'),
            totalBalance: this.sumField(items, 'Balance')
        })).sort((a, b) => b.count - a.count);

        const totals = {
            count: rows.reduce((s, r) => s + r.count, 0),
            tuition: rows.reduce((s, r) => s + r.totalTuition, 0),
            balance: rows.reduce((s, r) => s + r.totalBalance, 0)
        };

        const container = document.getElementById('pivot-school-detailed');
        container.innerHTML = `
            <div class="drill-down-info" style="margin-bottom: 8px; font-size: 0.85rem; color: var(--text-tertiary);">
                * Aylık/Yıllık döküm için bir okula tıklayın.
            </div>
            ${this.buildPivotTable(
                ['School', 'Kayıt', 'Tuition', 'Balance'],
                rows.map(r => [r.group, r.count, formatNumber(r.totalTuition), formatNumber(r.totalBalance)]),
                ['Toplam', totals.count, formatNumber(totals.tuition), formatNumber(totals.balance)],
                [false, false, true, true]
            )}
        `;

        // Add click listeners to rows for drill-down
        container.querySelectorAll('tbody tr').forEach(tr => {
            tr.style.cursor = 'pointer';
            tr.addEventListener('click', () => {
                const schoolName = tr.querySelector('.td-group').textContent;
                this.renderSchoolDrilldown(schoolName, groups[schoolName] || []);
            });
        });
    }

    renderSchoolDrilldown(schoolName, data) {
        // Group by Year and Month
        const timeGroups = {};
        data.forEach(row => {
            const date = this.parseDate(row['Record Date']);
            if (!date) return;
            const year = date.getFullYear();
            const month = date.getMonth() + 1; // 1-12
            const key = `${year}-${month.toString().padStart(2, '0')}`;
            if (!timeGroups[key]) timeGroups[key] = { year, month, items: [] };
            timeGroups[key].items.push(row);
        });

        const rows = Object.entries(timeGroups).map(([key, info]) => ({
            period: `${info.year} / ${this.getMonthName(info.month)}`,
            count: info.items.length,
            tuition: this.sumField(info.items, 'Tuition'),
            paid: this.sumField(info.items, 'Paid'),
            balance: this.sumField(info.items, 'Balance')
        })).sort((a, b) => b.period.localeCompare(a.period));

        // Create a modal or overlay for drill-down
        const modal = document.createElement('div');
        modal.className = 'drill-down-modal';
        modal.innerHTML = `
            <div class="drill-down-content">
                <div class="drill-down-header">
                    <h3>${this.escapeHtml(schoolName)} - Periyodik Dağılım</h3>
                    <button class="btn-close-drilldown">&times;</button>
                </div>
                <div class="drill-down-body">
                    ${this.buildPivotTable(
                        ['Dönem (Yıl/Ay)', 'Kayıt', 'Tuition', 'Paid', 'Balance'],
                        rows.map(r => [r.period, r.count, formatNumber(r.tuition), formatNumber(r.paid), formatNumber(r.balance)]),
                        null,
                        [false, false, true, true, true]
                    )}
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        modal.querySelector('.btn-close-drilldown').addEventListener('click', () => {
            modal.remove();
        });
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    }

    getMonthName(monthIndex) {
        const months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
        return months[monthIndex - 1];
    }

    renderPivotProgram(data) {
        const groups = this.groupBy(data, 'Program');
        const rows = Object.entries(groups).map(([key, items]) => ({
            group: key || '(Boş)',
            count: items.length,
            tuition: this.sumField(items, 'Tuition'),
            balance: this.sumField(items, 'Balance')
        })).sort((a, b) => b.count - a.count);

        const totals = {
            count: rows.reduce((s, r) => s + r.count, 0),
            tuition: rows.reduce((s, r) => s + r.tuition, 0),
            balance: rows.reduce((s, r) => s + r.balance, 0)
        };

        document.getElementById('pivot-program').innerHTML = this.buildPivotTable(
            ['Program', 'Kayıt', 'Tuition', 'Balance'],
            rows.map(r => [r.group, r.count, formatNumber(r.tuition), formatNumber(r.balance)]),
            ['Toplam', totals.count, formatNumber(totals.tuition), formatNumber(totals.balance)],
            [false, false, true, true]
        );
    }

    renderPivotSchool(data) {
        const groups = {};
        data.forEach(row => {
            const key = `${row['School'] || '(Boş)'} / ${row['School Center'] || '(Boş)'}`;
            if (!groups[key]) groups[key] = [];
            groups[key].push(row);
        });

        const rows = Object.entries(groups).map(([key, items]) => ({
            group: key,
            count: items.length,
            schoolBalance: this.sumField(items, 'School Balance')
        })).sort((a, b) => b.count - a.count);

        const totals = {
            count: rows.reduce((s, r) => s + r.count, 0),
            schoolBalance: rows.reduce((s, r) => s + r.schoolBalance, 0)
        };

        document.getElementById('pivot-school').innerHTML = this.buildPivotTable(
            ['School / Center', 'Kayıt', 'School Balance'],
            rows.map(r => [r.group, r.count, formatNumber(r.schoolBalance)]),
            ['Toplam', totals.count, formatNumber(totals.schoolBalance)],
            [false, false, true]
        );
    }

    renderPivotCurrency(data) {
        const groups = this.groupBy(data, 'Currency');
        const rows = Object.entries(groups).map(([key, items]) => ({
            group: key || '(Boş)',
            count: items.length,
            tuition: this.sumField(items, 'Tuition'),
            paid: this.sumField(items, 'Paid'),
            balance: this.sumField(items, 'Balance')
        })).sort((a, b) => b.count - a.count);

        const totals = {
            count: rows.reduce((s, r) => s + r.count, 0),
            tuition: rows.reduce((s, r) => s + r.tuition, 0),
            paid: rows.reduce((s, r) => s + r.paid, 0),
            balance: rows.reduce((s, r) => s + r.balance, 0)
        };

        document.getElementById('pivot-currency').innerHTML = this.buildPivotTable(
            ['Currency', 'Kayıt', 'Tuition', 'Paid', 'Balance'],
            rows.map(r => [r.group, r.count, formatNumber(r.tuition), formatNumber(r.paid), formatNumber(r.balance)]),
            ['Toplam', totals.count, formatNumber(totals.tuition), formatNumber(totals.paid), formatNumber(totals.balance)],
            [false, false, true, true, true]
        );
    }

    // ========== HELPERS ==========

    buildPivotTable(headers, rows, footerRow, isNumericCols) {
        let html = '<table class="pivot-table"><thead><tr>';
        headers.forEach((h, i) => {
            html += `<th class="${isNumericCols[i] ? 'th-number' : ''}">${h}</th>`;
        });
        html += '</tr></thead><tbody>';

        rows.forEach(row => {
            html += '<tr>';
            row.forEach((cell, i) => {
                if (i === 0) {
                    html += `<td class="td-group" title="${this.escapeHtml(String(cell))}">${this.escapeHtml(String(cell))}</td>`;
                } else {
                    html += `<td class="${isNumericCols[i] ? 'td-number' : ''}">${cell}</td>`;
                }
            });
            html += '</tr>';
        });

        if (footerRow) {
            html += '<tfoot><tr>';
            footerRow.forEach((cell, i) => {
                html += `<td class="${isNumericCols[i] ? 'td-number' : ''}">${cell}</td>`;
            });
            html += '</tr></tfoot>';
        }

        html += '</table>';
        return html;
    }

    groupBy(data, field) {
        const groups = {};
        data.forEach(row => {
            const key = row[field] || '';
            if (!groups[key]) groups[key] = [];
            groups[key].push(row);
        });
        return groups;
    }

    sumField(data, field) {
        return data.reduce((sum, row) => {
            const val = row[field];
            return sum + (val !== null && val !== undefined ? val : 0);
        }, 0);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}
