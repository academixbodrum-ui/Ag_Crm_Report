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
        this.currencyHistory = {}; // monthYear -> { code -> rate }
        this.studentSort = { field: 'Name', asc: true };
    }

    async render(type = 'dash-general') {
        this.currentView = type;
        
        // Fetch data and currency history
        const [joinedData, _] = await Promise.all([
            crmDB.getJoinedData(),
            this.loadCurrencyHistory()
        ]);
        
        this.allData = joinedData;
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
        const monthSelect = document.getElementById('dash-month');
        const yearWrapper = document.getElementById('dash-year-wrapper');
        const monthWrapper = document.getElementById('dash-month-wrapper');

        // Populate year dropdown from data
        const years = this.getAvailableYears();
        const yearDropdown = document.getElementById('year-multiselect-dropdown');
        const currentYear = new Date().getFullYear();

        if (yearDropdown) {
            yearDropdown.innerHTML = years.map(y => `
                <label class="status-checkbox-item">
                    <input type="checkbox" value="${y}" ${y === currentYear ? 'checked' : ''} onchange="dashboardManager.applyYearFilter()">
                    ${y}
                </label>
            `).join('');
            
            // Initial button text
            this.updateYearButtonText();
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

        monthSelect.addEventListener('change', () => this.applyFiltersAndRender());

        if (empSelect) {
            empSelect.addEventListener('change', () => this.applyFiltersAndRender());
        }

        // Outside click listener for year and school multiselects
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#year-multiselect')) {
                const dropdown = document.getElementById('year-multiselect-dropdown');
                if (dropdown) dropdown.style.display = 'none';
            }
            if (!e.target.closest('#school-multiselect')) {
                const sDropdown = document.getElementById('school-multiselect-dropdown');
                if (sDropdown) sDropdown.style.display = 'none';
            }
        });

        // Student List Sort Events
        document.querySelectorAll('#student-list-table th.sortable').forEach(th => {
            th.addEventListener('click', () => {
                const field = th.getAttribute('data-sort');
                this.sortStudentList(field);
            });
        });
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

    // ========== YEAR MULTISELECT METHODS ==========

    toggleYearFilter() {
        const dropdown = document.getElementById('year-multiselect-dropdown');
        if (dropdown) {
            dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
        }
    }

    getSelectedYears() {
        const checkboxes = document.querySelectorAll('#year-multiselect-dropdown input[type="checkbox"]:checked');
        return Array.from(checkboxes).map(cb => parseInt(cb.value));
    }

    applyYearFilter() {
        this.updateYearButtonText();
        this.applyFiltersAndRender();
    }

    updateYearButtonText() {
        const selected = this.getSelectedYears();
        const btn = document.getElementById('year-multiselect-btn');
        if (!btn) return;

        if (selected.length === 0) {
            btn.textContent = 'Yıl Seç ▾';
        } else if (selected.length === 1) {
            btn.textContent = selected[0] + ' ▾';
        } else {
            btn.textContent = selected.length + ' Yıl ▾';
        }
        
        // Update filter-active class
        if (selected.length > 0) {
            btn.classList.add('filter-active');
        } else {
            btn.classList.remove('filter-active');
        }
    }

    // ========== SCHOOL MULTISELECT METHODS ==========

    toggleSchoolFilter() {
        const dropdown = document.getElementById('school-multiselect-dropdown');
        if (dropdown) {
            dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
            if (dropdown.style.display === 'block') {
                const searchInput = document.getElementById('school-search-input');
                if (searchInput) searchInput.focus();
            }
        }
    }

    populateSchoolMultiselect() {
        const schoolListContainer = document.getElementById('school-checkbox-list');
        if (!schoolListContainer) return;
        
        const schools = [...new Set(this.activeData.map(r => r['School']).filter(Boolean))].sort();
        
        schoolListContainer.innerHTML = schools.map(s => `
            <label class="status-checkbox-item school-option-item">
                <input type="checkbox" value="${this.escapeHtml(s)}" onchange="dashboardManager.applySchoolFilter()">
                <span class="school-name-text">${this.escapeHtml(s)}</span>
            </label>
        `).join('');
        
        this.updateSchoolButtonText();
    }

    filterSchoolSearch(query) {
        const q = query.toLowerCase().trim();
        const items = document.querySelectorAll('.school-option-item');
        items.forEach(item => {
            const text = item.querySelector('.school-name-text').textContent.toLowerCase();
            if (text.includes(q)) {
                item.style.display = 'flex';
            } else {
                item.style.display = 'none';
            }
        });
    }

    getSelectedSchools() {
        const checkboxes = document.querySelectorAll('#school-checkbox-list input[type="checkbox"]:checked');
        return Array.from(checkboxes).map(cb => cb.value);
    }

    applySchoolFilter() {
        this.updateSchoolButtonText();
        this.applyFiltersAndRender();
    }

    updateSchoolButtonText() {
        const selected = this.getSelectedSchools();
        const btn = document.getElementById('school-multiselect-btn');
        if (!btn) return;

        if (selected.length === 0) {
            btn.textContent = 'Okul Seç ▾';
        } else if (selected.length === 1) {
            let text = selected[0];
            if (text.length > 15) text = text.substring(0, 15) + '...';
            btn.textContent = text + ' ▾';
        } else {
            btn.textContent = selected.length + ' Okul ▾';
        }
        
        if (selected.length > 0) {
            btn.classList.add('filter-active');
        } else {
            btn.classList.remove('filter-active');
        }
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
        const monthSelect = document.getElementById('dash-month');
        const empSelect = document.getElementById('dash-employee-filter');

        // Time filter
        if (timeFilter && timeFilter.value !== 'all') {
            const selectedYears = this.getSelectedYears();
            const selectedMonth = parseInt(monthSelect.value);

            data = data.filter(row => {
                const dateStr = row['Record Date'];
                const d = this.parseDate(dateStr);
                if (!d) return false;

                const year = d.getFullYear();
                const month = d.getMonth() + 1;

                if (timeFilter.value === 'yearly') {
                    return selectedYears.length === 0 || selectedYears.includes(year);
                } else if (timeFilter.value === 'monthly') {
                    return (selectedYears.length === 0 || selectedYears.includes(year)) && month === selectedMonth;
                }
                return true;
            });
        }

        // Employee filter
        if (empSelect && empSelect.value) {
            data = data.filter(row => row['Employee'] === empSelect.value);
        }

        // School filter
        const selectedSchools = this.getSelectedSchools ? this.getSelectedSchools() : [];
        if (selectedSchools.length > 0) {
            data = data.filter(row => selectedSchools.includes(row['School']));
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
        } else if (this.currentView === 'dash-school') {
            this.renderPivotSchoolDetailed(filteredData);
        } else if (this.currentView === 'dash-bonus') {
            this.renderBonusKPIs(filteredData);
            this.renderBonusByStatus(filteredData);
            this.renderStudentList(filteredData);
        }
    }

    toggleSectionsVisibility() {
        // Toggle elements based on this.currentView
        const isGeneral = this.currentView === 'dash-general';
        const isCounsellor = this.currentView === 'dash-counsellor';
        const isSchool = this.currentView === 'dash-school';
        const isBonus = this.currentView === 'dash-bonus';

        const show = (id, visible) => {
            const el = document.getElementById(id);
            if (el) el.closest('.dashboard-section')?.style.setProperty('display', visible ? '' : 'none', 'important');
            if (el && !el.closest('.dashboard-section')) el.style.display = visible ? '' : 'none';
        };

        // School filter wrapper visibility - only on dash-school
        const schoolWrapper = document.getElementById('dash-school-wrapper');
        if (schoolWrapper) {
            schoolWrapper.style.display = isSchool ? '' : 'none';
        }

        // KPI grid is only for general
        const kpiGrid = document.getElementById('kpi-grid');
        if (kpiGrid) kpiGrid.style.display = isGeneral ? 'grid' : 'none';

        show('status-distribution', isGeneral);
        show('pivot-employee', isGeneral);
        show('pivot-program', isGeneral);
        show('pivot-currency', isGeneral);
        
        show('pivot-counsellor', isCounsellor);
        
        
        show('pivot-school-detailed', isSchool);

        // Bonus view
        const bonusGrid = document.getElementById('kpi-bonus-grid');
        if (bonusGrid) bonusGrid.style.display = isBonus ? 'grid' : 'none';
        
        // Use a container for the status section so we can hide the whole thing
        const bonusStatusSec = document.getElementById('section-bonus-status');
        if (bonusStatusSec) bonusStatusSec.style.display = isBonus ? '' : 'none';

        const studentListSec = document.getElementById('section-student-list');
        if (studentListSec) studentListSec.style.display = isBonus ? '' : 'none';
    }

    async loadCurrencyHistory() {
        try {
            const results = await crmDB.supabase.select('currencies', 'limit=10000');
            this.currencyHistory = {};
            (results || []).forEach(row => {
                if (!this.currencyHistory[row.month_year]) {
                    this.currencyHistory[row.month_year] = {};
                }
                this.currencyHistory[row.month_year][row.code] = parseFloat(row.rate) || 1;
            });
        } catch (e) {
            console.error('Failed to load currency history in dashboard:', e);
        }
    }

    getTurkishMonthYear(dateStr) {
        if (!dateStr) return null;
        const date = this.parseDate(dateStr);
        if (!date) return null;

        const months = [
            'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
            'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
        ];
        return `${months[date.getMonth()]} ${date.getFullYear()}`;
    }

    calculateUsdComm(row) {
        const getVal = (field) => {
            const v = row[field];
            if (v === null || v === undefined || v === '') return 0;
            return typeof v === 'string' ? parseFloat(v.replace(/\./g, '').replace(',', '.')) || 0 : v;
        };

        const csvCalc = getVal('Comm') + getVal('Cancellation') - getVal('Discount') - getVal('Represantative Comm');
        const manualComm = (row._tracking && row._tracking.manual_net_commission) ? parseFloat(row._tracking.manual_net_commission) : 0;
        const totalComm = (csvCalc !== 0) ? csvCalc : manualComm;

        const dateStr = row['Record Date'];
        const monthYear = this.getTurkishMonthYear(dateStr);
        const currency = row['Currency'];

        // Try exact match first
        let rate = (this.currencyHistory[monthYear] && this.currencyHistory[monthYear][currency]) || null;
        
        // Fallback: latest available for this currency
        if (!rate) {
            const allMonths = Object.keys(this.currencyHistory).sort((a, b) => b.localeCompare(a));
            for (const m of allMonths) {
                if (this.currencyHistory[m][currency]) {
                    rate = this.currencyHistory[m][currency];
                    break;
                }
            }
        }

        if (row._tracking && row._tracking.status === 'Cancelled') {
            return 0;
        }

        return (rate && totalComm) ? (totalComm / rate) : 0;
    }

    renderBonusKPIs(data) {
        const totalRows = data.length;
        let totalUsdComm = 0;
        data.forEach(row => {
            totalUsdComm += this.calculateUsdComm(row);
        });

        this.animateValue('kpi-bonus-total-rows-value', totalRows, false);
        this.animateValue('kpi-bonus-usd-comm-value', totalUsdComm, true);
    }

    renderBonusByStatus(data) {
        const statusGroups = {};
        STATUSES.forEach(s => statusGroups[s] = { count: 0, usdComm: 0 });

        data.forEach(row => {
            const status = row._tracking.status || '';
            if (!statusGroups[status]) statusGroups[status] = { count: 0, usdComm: 0 };
            
            statusGroups[status].count++;
            statusGroups[status].usdComm += this.calculateUsdComm(row);
        });

        const rows = Object.entries(statusGroups)
            .filter(([_, stats]) => stats.count > 0 || stats.usdComm > 0)
            .map(([status, stats]) => [
                status || 'Boş',
                stats.count,
                formatNumber(stats.usdComm)
            ]).sort((a, b) => b[1] - a[1]);

        const totalUsd = Object.values(statusGroups).reduce((s, st) => s + st.usdComm, 0);
        const totalCount = Object.values(statusGroups).reduce((s, st) => s + st.count, 0);

        document.getElementById('pivot-bonus-status').innerHTML = this.buildPivotTable(
            ['Durum', 'Kayıt Sayısı', 'Toplam USD Net Komisyon'],
            rows,
            ['Toplam', totalCount, formatNumber(totalUsd)],
            [false, false, true]
        );
    }

    renderStudentList(data) {
        const container = document.getElementById('student-list-body');
        if (!container) return;

        if (data.length === 0) {
            container.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 20px;">Filtrelere uygun kayıt bulunamadı.</td></tr>';
            return;
        }

        // Process data for rendering (calculate net_comm and usd_comm)
        const processed = data.map(row => {
            const getVal = (field) => {
                const v = row[field];
                if (v === null || v === undefined || v === '') return 0;
                return typeof v === 'string' ? parseFloat(v.replace(/\./g, '').replace(',', '.')) || 0 : v;
            };

            const csvCalc = getVal('Comm') + getVal('Cancellation') - getVal('Discount') - getVal('Represantative Comm');
            const manualComm = (row._tracking && row._tracking.manual_net_commission) ? parseFloat(row._tracking.manual_net_commission) : 0;
            const netComm = (csvCalc !== 0) ? csvCalc : manualComm;
            const usdComm = this.calculateUsdComm(row);

            return {
                ...row,
                _netComm: netComm,
                _usdComm: usdComm,
                _displayName: `${row['Name'] || ''} ${row['Surname'] || ''}`.trim(),
                _status: row._tracking.status || ''
            };
        });

        // Sort data
        const { field, asc } = this.studentSort;
        processed.sort((a, b) => {
            let valA, valB;
            if (field === 'Name') {
                valA = a._displayName.toLowerCase();
                valB = b._displayName.toLowerCase();
            } else if (field === 'status') {
                valA = a._status.toLowerCase();
                valB = b._status.toLowerCase();
            } else if (field === 'net_comm') {
                valA = a._netComm;
                valB = b._netComm;
            } else if (field === 'usd_comm') {
                valA = a._usdComm;
                valB = b._usdComm;
            } else {
                valA = (a[field] || '').toString().toLowerCase();
                valB = (b[field] || '').toString().toLowerCase();
            }

            if (valA < valB) return asc ? -1 : 1;
            if (valA > valB) return asc ? 1 : -1;
            return 0;
        });

        // Update Sort Indicators
        document.querySelectorAll('#student-list-table th.sortable').forEach(th => {
            th.classList.remove('sorted-asc', 'sorted-desc');
            if (th.getAttribute('data-sort') === field) {
                th.classList.add(asc ? 'sorted-asc' : 'sorted-desc');
            }
        });

        // Render
        container.innerHTML = processed.map(r => `
            <tr>
                <td class="td-name">${this.escapeHtml(r._displayName)}</td>
                <td class="td-school">${this.escapeHtml(r['School'] || '')}</td>
                <td class="td-status"><span class="status-badge" data-status="${r._status}">${r._status || 'Boş'}</span></td>
                <td class="td-number">${formatNumber(r._netComm)}</td>
                <td class="td-currency">${this.escapeHtml(r['Currency'] || '')}</td>
                <td class="td-number">${formatNumber(r._usdComm)}</td>
            </tr>
        `).join('');
    }

    sortStudentList(field) {
        if (this.studentSort.field === field) {
            this.studentSort.asc = !this.studentSort.asc;
        } else {
            this.studentSort.field = field;
            this.studentSort.asc = true;
        }
        this.renderStudentList(this.getFilteredData());
    }

    showEmpty() {
        const containers = ['kpi-grid', 'status-distribution',
            'pivot-employee', 'pivot-program',
            'pivot-school-detailed', 'pivot-currency'];

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
            const st = row._tracking.status || '';
            statusCounts[st] = (statusCounts[st] || 0) + 1;
        });

        const statusColors = {
            '': '#94a3b8',
            'Process': '#22d4bf',
            'Visa': '#f59e0b',
            'Awaiting Payment': '#ec4899',
            'School Payment': '#f59e0b',
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
                    <span class="status-dist-label">${status || 'Boş'}</span>
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
            balance: this.sumField(items, 'Balance'),
            schoolBalance: this.sumField(items, 'School Balance'),
            usdComm: items.reduce((sum, row) => sum + this.calculateUsdComm(row), 0)
        })).sort((a, b) => b.count - a.count);

        const totals = {
            count: rows.reduce((s, r) => s + r.count, 0),
            balance: rows.reduce((s, r) => s + r.balance, 0),
            schoolBalance: rows.reduce((s, r) => s + r.schoolBalance, 0),
            usdComm: rows.reduce((s, r) => s + r.usdComm, 0)
        };

        const container = document.getElementById('pivot-school-detailed');
        container.innerHTML = `
            <div class="drill-down-info" style="margin-bottom: 8px; font-size: 0.85rem; color: var(--text-tertiary);">
                * Aylık/Yıllık döküm için bir okula tıklayın.
            </div>
            ${this.buildPivotTable(
                ['School', 'Kayıt', 'Kalan Borç', 'Okula Borç', 'USD Net Komisyon'],
                rows.map(r => [r.group, r.count, formatNumber(r.balance), formatNumber(r.schoolBalance), formatNumber(r.usdComm)]),
                ['Toplam', totals.count, formatNumber(totals.balance), formatNumber(totals.schoolBalance), formatNumber(totals.usdComm)],
                [false, false, true, true, true]
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
            balance: this.sumField(info.items, 'Balance'),
            schoolBalance: this.sumField(info.items, 'School Balance'),
            usdComm: info.items.reduce((sum, row) => sum + this.calculateUsdComm(row), 0)
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
                        ['Dönem (Yıl/Ay)', 'Kayıt', 'Kalan Borç', 'Okula Borç', 'USD Net Komisyon'],
                        rows.map(r => [r.period, r.count, formatNumber(r.balance), formatNumber(r.schoolBalance), formatNumber(r.usdComm)]),
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
