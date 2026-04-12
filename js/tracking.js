/**
 * tracking.js — CRM Tracking Table with filters, sorting, pagination, inline editing
 */

class TrackingManager {
    constructor() {
        this.data = [];
        this.filteredData = [];
        this.currentPage = 1;
        this.pageSize = 50;
        this.sortColumn = 'Record Date';
        this.sortDirection = 'desc';
        this.activeStatusDropdown = null;
        this.hideArchive = true; // Default: archive hidden
        this.selectedRows = new Set();

        // DOM refs
        this.tableBody = document.getElementById('tracking-table-body');
        this.recordCount = document.getElementById('tracking-record-count');
        this.paginationInfo = document.getElementById('pagination-info');
        this.paginationPages = document.getElementById('pagination-pages');

        this.bindEvents();
        window.trackingManager = this; // Global erişim sağla
    }

    bindEvents() {
        // Search
        document.getElementById('filter-search').addEventListener('input',
            debounce(() => this.applyFilters(), 300));

        // Status filter is now handled by checkbox dropdown (global functions)

        // Other filters
        const filterIds = ['filter-employee', 'filter-program', 'filter-currency', 'filter-program-type'];
        filterIds.forEach(id => {
            document.getElementById(id).addEventListener('change', () => this.applyFilters());
        });

        // Date filters
        ['filter-record-date-from', 'filter-record-date-to',
            'filter-program-date-from', 'filter-program-date-to'].forEach(id => {
                document.getElementById(id).addEventListener('change', () => this.applyFilters());
            });

        // Detailed View Toggle
        document.getElementById('toggle-detailed-view').addEventListener('change', (e) => {
            const container = document.getElementById('tracking-table-container');
            if (e.target.checked) {
                container.classList.add('show-extra');
            } else {
                container.classList.remove('show-extra');
            }
        });

        // Bonus View Toggle
        document.getElementById('toggle-bonus-view').addEventListener('change', (e) => {
            const container = document.getElementById('tracking-table-container');
            if (e.target.checked) {
                container.classList.add('show-bonus');
            } else {
                container.classList.remove('show-bonus');
            }
        });

        // Archive Toggle
        document.getElementById('toggle-archive-view').addEventListener('change', (e) => {
            this.hideArchive = e.target.checked;
            this.applyFilters();
        });

        // Clear filters
        document.getElementById('btn-clear-filters').addEventListener('click', () => this.clearFilters());

        // Page size
        document.getElementById('page-size-select').addEventListener('change', (e) => {
            this.pageSize = parseInt(e.target.value);
            this.currentPage = 1;
            this.renderTable();
        });

        // Pagination buttons
        document.getElementById('btn-prev-page').addEventListener('click', () => {
            if (this.currentPage > 1) {
                this.currentPage--;
                this.renderTable();
            }
        });

        document.getElementById('btn-next-page').addEventListener('click', () => {
            const maxPage = Math.ceil(this.filteredData.length / this.pageSize);
            if (this.currentPage < maxPage) {
                this.currentPage++;
                this.renderTable();
            }
        });

        // Sort
        document.querySelectorAll('#tracking-table th[data-sort]').forEach(th => {
            th.addEventListener('click', () => {
                const col = th.getAttribute('data-sort');
                if (this.sortColumn === col) {
                    this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
                } else {
                    this.sortColumn = col;
                    this.sortDirection = 'asc';
                }
                this.applySort();
                this.renderTable();
                this.updateSortIndicators();
            });
        });

        // Export
        document.getElementById('btn-export-excel').addEventListener('click', () => this.exportExcel());

        // Quick Upload
        document.getElementById('btn-quick-upload').addEventListener('click', () => {
            // Trigger navigation to upload page
            const navUpload = document.getElementById('nav-upload');
            if (navUpload) navUpload.click();
        });

        document.getElementById('btn-export-csv').addEventListener('click', () => this.exportCSV());

        // Close status dropdown on outside click
        document.addEventListener('click', (e) => {
            if (this.activeStatusDropdown && !e.target.closest('.status-badge') && !e.target.closest('.status-dropdown')) {
                this.closeStatusDropdown();
            }
        });

        // Select All Checkbox
        const selectAll = document.getElementById('select-all-checkbox');
        if (selectAll) {
            selectAll.addEventListener('change', (e) => this.toggleSelectAll(e.target.checked));
        }

        // Bulk Actions
        const btnBulkApply = document.getElementById('btn-bulk-apply');
        if (btnBulkApply) {
            btnBulkApply.addEventListener('click', () => this.bulkUpdateStatus());
        }

        const btnBulkCancel = document.getElementById('btn-bulk-cancel');
        if (btnBulkCancel) {
            btnBulkCancel.addEventListener('click', () => this.clearSelection());
        }
    }

    getFieldRule(status, field) {
        if (!window.statusRules || !window.statusRules[status]) {
            return { visible: true, required: false };
        }
        return window.statusRules[status][field] || { visible: true, required: false };
    }

    // Helper to generate a modal field HTML based on rules
    renderModalField(label, value, fieldName, status, type = 'text') {
        const rule = this.getFieldRule(status, fieldName);
        if (!rule.visible) return '';

        return `
            <div class="modal-field ${rule.required ? 'field-required' : ''}">
                <span class="modal-field-label">${label}${rule.required ? ' *' : ''}</span>
                <span class="modal-field-value">${value || '-'}</span>
            </div>
        `;
    }

    // Helper for form groups in modal
    renderModalFormGroup(label, content, fieldName, status) {
        const rule = this.getFieldRule(status, fieldName);
        if (!rule.visible) return '';

        return `
            <div class="modal-form-group ${rule.required ? 'field-required' : ''}">
                <label>${label}${rule.required ? ' *' : ''}</label>
                ${content}
            </div>
        `;
    }

    async loadData() {
        this.data = await crmDB.getJoinedData();
        await this.populateFilterOptions();
        this.applyFilters();
    }

    async populateFilterOptions() {
        const fields = {
            'filter-employee': 'Employee',
            'filter-program': 'Program',
            'filter-currency': 'Currency'
        };

        for (const [selectId, field] of Object.entries(fields)) {
            const values = await crmDB.getDistinctValues('crm_import_rows', field);
            const select = document.getElementById(selectId);
            const currentVal = select.value;

            // Keep first option (Tümü)
            select.innerHTML = '<option value="">Tümü</option>';
            values.forEach(val => {
                const opt = document.createElement('option');
                opt.value = val;
                opt.textContent = val;
                select.appendChild(opt);
            });

            if (currentVal) select.value = currentVal;
        }
    }

    applyFilters() {
        const search = document.getElementById('filter-search').value.toLowerCase().trim();

        // Status from checkbox dropdown
        const selectedStatuses = getSelectedStatuses();

        const employee = document.getElementById('filter-employee').value;
        const program = document.getElementById('filter-program').value;
        const currency = document.getElementById('filter-currency').value;
        const programType = document.getElementById('filter-program-type').value;

        // DEBUG: Tugba Gul search
        if (search.includes('tugba') || search.includes('gul') || employee.includes('Tugba')) {
            console.log('DEBUG SEARCH - Tugba Gul arandı. Mevcut data sayısı:', this.data.length);
            const rawMatch = this.data.filter(r => (r.Employee || '').toLowerCase().includes('tugba'));
            console.log('DEBUG SEARCH - Tugba isimli ham kayıt sayısı:', rawMatch.length);
        }

        const recordDateFrom = document.getElementById('filter-record-date-from').value;
        const recordDateTo = document.getElementById('filter-record-date-to').value;
        const programDateFrom = document.getElementById('filter-program-date-from').value;
        const programDateTo = document.getElementById('filter-program-date-to').value;

        // const showMissing = document.getElementById('filter-missing')?.checked || false;

        this.filteredData = this.data.filter(row => {
            // If hideArchive is on, filter out archived rows
            if (this.hideArchive && row.is_missing_in_latest_upload) return false;

            // Search
            if (search) {
                const searchFields = [
                    row['Name'], row['Surname'], row['E-Mail'],
                    row['School'], row['Program'], row['Employee']
                ].filter(Boolean).join(' ').toLowerCase();
                if (!searchFields.includes(search)) return false;
            }

            // Status
            if (selectedStatuses.length > 0) {
                const rowStatus = (row._tracking.status || '').trim();
                if (!selectedStatuses.some(s => s.trim() === rowStatus)) return false;
            }

            // Dropdown filters
            if (employee && row['Employee'] !== employee) return false;
            if (program && row['Program'] !== program) return false;
            if (currency && row['Currency'] !== currency) return false;

            // Program Type Filter
            if (programType) {
                const mappedType = window.programTypeMap?.[row['Program']] || 'Diğer';
                if (mappedType !== programType) return false;
            }

            // Date filters
            if (recordDateFrom && row['Record Date']) {
                if (new Date(row['Record Date']) < new Date(recordDateFrom)) return false;
            }
            if (recordDateTo && row['Record Date']) {
                if (new Date(row['Record Date']) > new Date(recordDateTo + 'T23:59:59')) return false;
            }
            if (programDateFrom && row['Program Start Date']) {
                if (new Date(row['Program Start Date']) < new Date(programDateFrom)) return false;
            }
            if (programDateTo && row['Program Start Date']) {
                if (new Date(row['Program Start Date']) > new Date(programDateTo + 'T23:59:59')) return false;
            }

            return true;
        });

        this.updateFilterStyles(); // Filtre stillerini güncelle
        this.applySort();
        this.currentPage = 1;
        this.renderTable();
        this.updateSortIndicators();
    }

    updateFilterStyles() {
        const filters = [
            { id: 'filter-search', type: 'input' },
            { id: 'filter-employee', type: 'select' },
            { id: 'filter-program', type: 'select' },
            { id: 'filter-currency', type: 'select' },
            { id: 'filter-program-type', type: 'select' },
            { id: 'filter-record-date-from', type: 'input' },
            { id: 'filter-record-date-to', type: 'input' },
            { id: 'filter-program-date-from', type: 'input' },
            { id: 'filter-program-date-to', type: 'input' },
            { id: 'status-multiselect-btn', type: 'status' }
        ];

        filters.forEach(f => {
            const el = document.getElementById(f.id);
            if (!el) return;

            let isActive = false;
            if (f.type === 'status') {
                isActive = getSelectedStatuses().length > 0;
            } else {
                isActive = el.value && el.value.trim() !== '';
            }

            if (isActive) {
                el.classList.add('filter-active');
            } else {
                el.classList.remove('filter-active');
            }
        });

        // Search box input parent'ına da bakabiliriz gerekirse ama şimdilik input kafi
    }

    applySort() {
        if (!this.sortColumn) return;

        const col = this.sortColumn;
        const dir = this.sortDirection === 'asc' ? 1 : -1;

        // Helper to get base identity (Name|Surname|Date)
        const getBaseId = (row) => row.row_uid.split('|').slice(0, 3).join('|').toLowerCase();

        this.filteredData.sort((a, b) => {
            const baseA = getBaseId(a);
            const baseB = getBaseId(b);

            // If they are in the same identity group, keep them together
            if (baseA === baseB) {
                // Active first, then Missing (Archived)
                const aM = a.is_missing_in_latest_upload ? 1 : 0;
                const bM = b.is_missing_in_latest_upload ? 1 : 0;
                if (aM !== bM) return aM - bM;
                
                // Then sort by 0001 counter
                const cA = a.row_uid.split('|')[3] || '';
                const cB = b.row_uid.split('|')[3] || '';
                return cA.localeCompare(cB);
            }

            let valA, valB;

            if (col === 'Name') {
                valA = `${a['Name'] || ''} ${a['Surname'] || ''}`.toLowerCase();
                valB = `${b['Name'] || ''} ${b['Surname'] || ''}`.toLowerCase();
            } else if (col === 'status') {
                valA = (a._tracking.status || '').toLowerCase();
                valB = (b._tracking.status || '').toLowerCase();
            } else if (col === 'next_follow_up_date') {
                valA = a._tracking.next_follow_up_date || '';
                valB = b._tracking.next_follow_up_date || '';
            } else if (DATE_FIELDS.includes(col)) {
                valA = a[col] || '';
                valB = b[col] || '';
            } else if (NUMERIC_FIELDS.includes(col)) {
                valA = a[col] ?? -Infinity;
                valB = b[col] ?? -Infinity;
                return (valA - valB) * dir;
            } else if (col === 'row_uid') {
                valA = a.row_uid;
                valB = b.row_uid;
            } else {
                valA = (a[col] || '').toLowerCase();
                valB = (b[col] || '').toLowerCase();
            }

            if (valA < valB) return -1 * dir;
            if (valA > valB) return 1 * dir;
            
            // If primary values are equal, group by Base ID so related archived rows stick together
            return baseA.localeCompare(baseB);
        });
    }

    updateSortIndicators() {
        document.querySelectorAll('#tracking-table th').forEach(th => {
            th.classList.remove('sorted-asc', 'sorted-desc');
        });

        if (this.sortColumn) {
            const th = document.querySelector(`#tracking-table th[data-sort="${this.sortColumn}"]`);
            if (th) {
                th.classList.add(this.sortDirection === 'asc' ? 'sorted-asc' : 'sorted-desc');
            }
        }
    }

    clearFilters() {
        document.getElementById('filter-search').value = '';
        // Clear status checkboxes
        document.querySelectorAll('#status-multiselect-dropdown input[type="checkbox"]').forEach(cb => cb.checked = false);
        document.getElementById('status-multiselect-btn').textContent = 'Durum Seç ▾';
        document.getElementById('filter-employee').value = '';
        document.getElementById('filter-program').value = '';
        document.getElementById('filter-currency').value = '';
        document.getElementById('filter-program-type').value = '';
        document.getElementById('filter-record-date-from').value = '';
        document.getElementById('filter-record-date-to').value = '';
        document.getElementById('filter-program-date-from').value = '';
        document.getElementById('filter-program-date-to').value = '';
        this.applyFilters();
    }

    renderTable() {
        const start = (this.currentPage - 1) * this.pageSize;
        const end = Math.min(start + this.pageSize, this.filteredData.length);
        const pageData = this.filteredData.slice(start, end);

        // Count active vs archived in current page
        const activeCount = this.filteredData.filter(r => !r.is_missing_in_latest_upload).length;
        const archivedCount = this.filteredData.filter(r => r.is_missing_in_latest_upload).length;
        
        if (archivedCount > 0) {
            this.recordCount.textContent = `${activeCount} aktif + ${archivedCount} arşiv kayıt`;
        } else {
            this.recordCount.textContent = `${this.filteredData.length} kayıt`;
        }

        if (pageData.length === 0) {
            this.tableBody.innerHTML = `
                <tr>
                    <td colspan="25" style="text-align: center; padding: 60px; color: var(--text-tertiary);">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity: 0.3; display: block; margin: 0 auto 12px;">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                            <line x1="3" y1="9" x2="21" y2="9"/>
                            <line x1="9" y1="21" x2="9" y2="9"/>
                        </svg>
                        ${this.data.length === 0 ? 'Henüz veri yüklenmedi. CSV Yükle sayfasından başlayın.' : 'Filtrelere uygun kayıt bulunamadı.'}
                    </td>
                </tr>
            `;
            this.updatePagination(0, 0, 0);
            return;
        }

        this.tableBody.innerHTML = pageData.map((row, idx) => {
            const globalIdx = start + idx;
            const tracking = row._tracking;
            const isMissing = row.is_missing_in_latest_upload;
            const prev = row.previous_values || {}; // Previous values for bolding

            const recordDate = row['Record Date'] || row.record_date;
            const programDate = row['Program Start Date'] || row.program_start_date;

            // Helper to bold changed values
            const b = (field, displayVal) => {
                const current = row[field];
                const previous = prev[field];
                
                // Compare values (simple equality for now, handle nulls)
                let isChanged = false;
                if (current !== previous) {
                    // For dates, canonicalize before comparing
                    if (DATE_FIELDS.includes(field)) {
                        const d1 = current ? new Date(current).getTime() : 0;
                        const d2 = previous ? new Date(previous).getTime() : 0;
                        isChanged = d1 !== d2;
                    } 
                    // For numbers, handle floating point precision if needed
                    else if (NUMERIC_FIELDS.includes(field)) {
                        const n1 = parseFloat(current) || 0;
                        const n2 = parseFloat(previous) || 0;
                        isChanged = Math.abs(n1 - n2) > 0.001;
                    }
                    else {
                        isChanged = String(current || '') !== String(previous || '');
                    }
                }

                return isChanged ? `<strong>${displayVal}</strong>` : displayVal;
            };

            // Helper to get numeric value for calculation
            const getVal = (field) => {
                const v = row[field];
                if (v === null || v === undefined || v === '') return 0;
                return typeof v === 'string' ? parseFloat(v.replace(/\./g, '').replace(',', '.')) || 0 : v;
            };

            const totalCommValue = getVal('Comm') + getVal('Cancellation') - getVal('Discount') - getVal('Represantative Comm');

            // Evaluate visual rules
            let rowStyle = '';
            if (window.visualRules) {
                for (const rule of window.visualRules) {
                    if (rule.status_cond && rule.status_cond !== tracking.status) continue;
                    
                    let val = (rule.field_cond === 'total_commission') ? totalCommValue : getVal(rule.field_cond);
                    let target = parseFloat(rule.value_cond);
                    let match = false;
                    
                    if (rule.operator_cond === '==' || rule.operator_cond === '=') match = (val === target);
                    else if (rule.operator_cond === '!=') match = (val !== target);
                    else if (rule.operator_cond === '>') match = (val > target);
                    else if (rule.operator_cond === '<') match = (val < target);
                    else if (rule.operator_cond === '>=') match = (val >= target);
                    else if (rule.operator_cond === '<=') match = (val <= target);
                    
                    if (match) {
                        rowStyle = `background-color: ${rule.color}33 !important;`; // 20% alpha
                    }
                }
            }

            // MAIN ROW HTML
            const mainRowHtml = `
                <tr class="${isMissing ? 'row-missing' : ''} ${this.selectedRows.has(row.row_uid) ? 'selected' : ''} ${globalIdx % 2 === 1 ? 'zebra-row' : ''}" 
                    data-uid="${this.escapeHtml(row.row_uid)}" 
                    data-index="${globalIdx}"
                    data-row-status="${tracking.status}"
                    style="${rowStyle}">

                    <td class="td-selection" onclick="event.stopPropagation()">
                        <input type="checkbox" class="row-checkbox" 
                            ${this.selectedRows.has(row.row_uid) ? 'checked' : ''}
                            onchange="trackingManager.toggleSelection('${this.escapeAttr(row.row_uid)}', this.checked)">
                    </td>

                    <td class="td-name" onclick="trackingManager.openDetail('${this.escapeAttr(row.row_uid)}')">${b('Name', this.escapeHtml(row['Name'] || ''))} ${b('Surname', this.escapeHtml(row['Surname'] || ''))}</td>
                    <td class="td-school" title="${this.escapeHtml(row['School'] || '')}">${b('School', this.escapeHtml(row['School'] || ''))}</td>
                    <td class="td-date">${b('Record Date', formatDateDisplay(recordDate) || this.escapeHtml(recordDate || ''))}</td>
                    <td style="position: relative;">
                        <span class="status-badge" data-status="${tracking.status}" onclick="event.stopPropagation(); trackingManager.toggleStatusDropdown(event, '${this.escapeAttr(row.row_uid)}')">${tracking.status}</span>
                    </td>
                    <td class="td-date">${b('Program Start Date', formatDateDisplay(programDate) || this.escapeHtml(programDate || ''))}</td>
                    <td class="col-extra">${b('Duration', this.escapeHtml(row['Duration'] || ''))}</td>
                    <td class="td-number col-extra">${b('Total Debt', formatNumber(row['Total Debt']))}</td>
                    <td class="td-number">${b('Paid', formatNumber(row['Paid']))}</td>
                    <td class="td-number col-extra">${b('Refund', formatNumber(row['Refund']))}</td>
                    <td class="td-number col-extra">${b('Tuition', formatNumber(row['Tuition']))}</td>
                    <td class="td-number col-extra">${b('Cancellation', formatNumber(row['Cancellation']))}</td>
                    <td class="td-number">${b('Balance', formatNumber(row['Balance']))}</td>
                    <td class="td-number col-extra">${b('Comm', formatNumber(row['Comm']))}</td>
                    <td class="td-number col-extra">${b('Discount', formatNumber(row['Discount']))}</td>
                    <td class="td-currency">${b('Currency', this.escapeHtml(row['Currency'] || ''))}</td>
                    <td class="col-extra">${b('Represantative', this.escapeHtml(row['Represantative'] || ''))}</td>
                    <td class="td-number col-extra">${b('Represantative Comm', formatNumber(row['Represantative Comm']))}</td>
                    <td class="td-number col-extra">${b('School Balance', formatNumber(row['School Balance']))}</td>
                    <td class="td-number td-total-comm">${formatNumber(totalCommValue)}</td>
                    
                    <td class="col-bonus col-bonus-separator">
                        <input type="number" value="${tracking.deposit_bonus || ''}" 
                            onchange="trackingManager.updateTrackingField('${this.escapeAttr(row.row_uid)}', 'deposit_bonus', this.value)"
                            onclick="event.stopPropagation()">
                    </td>
                    <td class="col-bonus">
                        <select onchange="trackingManager.updateTrackingField('${this.escapeAttr(row.row_uid)}', 'deposit_bonus_status', this.value)"
                            onclick="event.stopPropagation()">
                            <option value="">Seçiniz</option>
                            <option value="Hakediş" ${tracking.deposit_bonus_status === 'Hakediş' ? 'selected' : ''}>Hakediş</option>
                            <option value="Ödendi" ${tracking.deposit_bonus_status === 'Ödendi' ? 'selected' : ''}>Ödendi</option>
                            <option value="Prim Yok" ${tracking.deposit_bonus_status === 'Prim Yok' ? 'selected' : ''}>Prim Yok</option>
                        </select>
                    </td>
                    <td class="col-bonus">
                        <input type="number" value="${tracking.consultant_bonus || ''}" 
                            onchange="trackingManager.updateTrackingField('${this.escapeAttr(row.row_uid)}', 'consultant_bonus', this.value)"
                            onclick="event.stopPropagation()">
                    </td>
                    <td class="col-bonus">
                        <select onchange="trackingManager.updateTrackingField('${this.escapeAttr(row.row_uid)}', 'consultant_bonus_status', this.value)"
                            onclick="event.stopPropagation()">
                            <option value="">Seçiniz</option>
                            <option value="Hakediş" ${tracking.consultant_bonus_status === 'Hakediş' ? 'selected' : ''}>Hakediş</option>
                            <option value="Ödendi" ${tracking.consultant_bonus_status === 'Ödendi' ? 'selected' : ''}>Ödendi</option>
                            <option value="Prim Yok" ${tracking.consultant_bonus_status === 'Prim Yok' ? 'selected' : ''}>Prim Yok</option>
                        </select>
                    </td>
                    <td class="td-number col-bonus td-remaining-bonus">
                        ${formatNumber((totalCommValue * 0.15) - (parseFloat(tracking.deposit_bonus) || 0) - (parseFloat(tracking.consultant_bonus) || 0))}
                    </td>

                    <td>
                        <textarea class="inline-note" data-uid="${this.escapeAttr(row.row_uid)}" data-field="notes"
                            onchange="trackingManager.updateTrackingField('${this.escapeAttr(row.row_uid)}', 'notes', this.value)"
                            onclick="event.stopPropagation()">${this.escapeHtml(tracking.notes || '')}</textarea>
                    </td>
                </tr>
            `;

            // HISTORY ROW HTML (The "Archived data of a changed row")
            let historyRowHtml = '';
            if (row.previous_values && !this.hideArchive && !isMissing) {
                const ph = row.previous_values;
                const phRecordDate = ph['Record Date'] || recordDate;
                const phProgramDate = ph['Program Start Date'] || programDate;
                const phTotalComm = (parseFloat(ph['Comm']) || 0) + (parseFloat(ph['Cancellation']) || 0) - (parseFloat(ph['Discount']) || 0) - (parseFloat(ph['Represantative Comm']) || 0);

                historyRowHtml = `
                    <tr class="row-history">
                        <td class="td-selection"></td>
                        <td class="td-name">${this.escapeHtml(ph['Name'] || '')} ${this.escapeHtml(ph['Surname'] || '')}</td>
                        <td class="td-school">${this.escapeHtml(ph['School'] || '')}</td>
                        <td class="td-date">${formatDateDisplay(phRecordDate)}</td>
                        <td style="text-align:center;">-</td>
                        <td class="td-date">${formatDateDisplay(phProgramDate)}</td>
                        <td class="col-extra">${this.escapeHtml(ph['Duration'] || '')}</td>
                        <td class="td-number col-extra">${formatNumber(ph['Total Debt'])}</td>
                        <td class="td-number">${formatNumber(ph['Paid'])}</td>
                        <td class="td-number col-extra">${formatNumber(ph['Refund'])}</td>
                        <td class="td-number col-extra">${formatNumber(ph['Tuition'])}</td>
                        <td class="td-number col-extra">${formatNumber(ph['Cancellation'])}</td>
                        <td class="td-number">${formatNumber(ph['Balance'])}</td>
                        <td class="td-number col-extra">${formatNumber(ph['Comm'])}</td>
                        <td class="td-number col-extra">${formatNumber(ph['Discount'])}</td>
                        <td class="td-currency">${this.escapeHtml(ph['Currency'] || '')}</td>
                        <td class="col-extra">${this.escapeHtml(ph['Represantative'] || '')}</td>
                        <td class="td-number col-extra">${formatNumber(ph['Represantative Comm'])}</td>
                        <td class="td-number col-extra">${formatNumber(ph['School Balance'])}</td>
                        <td class="td-number td-total-comm">${formatNumber(phTotalComm)}</td>
                        <td colspan="6" style="background: rgba(0,0,0,0.05); text-align:center; font-size: 0.8rem;">
                            Değişiklik Öncesi Veriler
                        </td>
                    </tr>
                `;
            }

            return mainRowHtml + historyRowHtml;
        }).join('');

        this.updatePagination(start + 1, end, this.filteredData.length);
        this.updateBulkActionBar();
    }

    updatePagination(from, to, total) {
        this.paginationInfo.textContent = total > 0
            ? `${from}–${to} / ${total} kayıt gösteriliyor`
            : 'Kayıt yok';

        const maxPage = Math.max(1, Math.ceil(total / this.pageSize));

        document.getElementById('btn-prev-page').disabled = this.currentPage <= 1;
        document.getElementById('btn-next-page').disabled = this.currentPage >= maxPage;

        // Generate page buttons
        let pages = '';
        const range = this.getPageRange(this.currentPage, maxPage);
        for (const p of range) {
            if (p === '...') {
                pages += '<span style="padding: 0 4px; color: var(--text-muted);">…</span>';
            } else {
                pages += `<button class="page-btn${p === this.currentPage ? ' active' : ''}" onclick="trackingManager.goToPage(${p})">${p}</button>`;
            }
        }
        this.paginationPages.innerHTML = pages;
    }

    getPageRange(current, max) {
        if (max <= 7) return Array.from({ length: max }, (_, i) => i + 1);

        const pages = [];
        if (current <= 4) {
            for (let i = 1; i <= 5; i++) pages.push(i);
            pages.push('...', max);
        } else if (current >= max - 3) {
            pages.push(1, '...');
            for (let i = max - 4; i <= max; i++) pages.push(i);
        } else {
            pages.push(1, '...', current - 1, current, current + 1, '...', max);
        }
        return pages;
    }

    goToPage(page) {
        this.currentPage = page;
        this.renderTable();
        document.getElementById('tracking-table-container').scrollTo({ top: 0, behavior: 'smooth' });
    }

    // Status dropdown
    toggleStatusDropdown(event, rowUid) {
        event.stopPropagation();

        this.closeStatusDropdown();

        const badge = event.target.closest('.status-badge');
        const rect = badge.getBoundingClientRect();

        const dropdown = document.createElement('div');
        dropdown.className = 'status-dropdown';
        dropdown.style.position = 'fixed';
        dropdown.style.top = (rect.bottom + 4) + 'px';
        dropdown.style.left = rect.left + 'px';

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

        STATUSES.forEach(status => {
            const item = document.createElement('div');
            item.className = 'status-dropdown-item';
            item.innerHTML = `<div class="dot" style="background: ${statusColors[status] || '#888'};"></div><span>${status}</span>`;
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                this.changeStatus(rowUid, status);
            });
            dropdown.appendChild(item);
        });

        document.body.appendChild(dropdown);
        this.activeStatusDropdown = dropdown;
    }

    closeStatusDropdown() {
        if (this.activeStatusDropdown) {
            this.activeStatusDropdown.remove();
            this.activeStatusDropdown = null;
        }
    }

    async changeStatus(rowUid, newStatus) {
        this.closeStatusDropdown();

        const tracking = await crmDB.getTracking(rowUid);
        if (tracking) {
            tracking.status = newStatus;
            await crmDB.putTracking(tracking);

            // Update local data
            const row = this.data.find(r => r.row_uid === rowUid);
            if (row) row._tracking.status = newStatus;

            this.renderTable();
            showToast(`Durum "${newStatus}" olarak güncellendi.`, 'success');
        }
    }

    async updateTrackingField(rowUid, field, value) {
        const tracking = await crmDB.getTracking(rowUid);
        if (tracking) {
            tracking[field] = value;
            await crmDB.putTracking(tracking);

            // Update local data
            const row = this.data.find(r => r.row_uid === rowUid);
            if (row) row._tracking[field] = value;
        }
    }

    // Detail modal
    async openDetail(rowUid) {
        const row = this.data.find(r => r.row_uid === rowUid);
        if (!row) return;

        const tracking = row._tracking;

        const modal = document.getElementById('detail-modal');
        const modalTitle = document.getElementById('modal-title');
        const modalBody = document.getElementById('modal-body');

        modalTitle.textContent = `${row['Name'] || ''} ${row['Surname'] || ''}`.trim() || 'Kayıt Detayı';

        modalBody.innerHTML = `
            <!-- Person Info -->
            <div class="modal-section">
                <div class="modal-section-title">Kişi Bilgileri</div>
                <div class="modal-field-grid">
                    ${this.renderModalField('Ad', this.escapeHtml(row['Name']), 'Name', tracking.status)}
                    ${this.renderModalField('Soyad', this.escapeHtml(row['Surname']), 'Surname', tracking.status)}
                    ${this.renderModalField('E-Posta', this.escapeHtml(row['E-Mail']), 'E-Mail', tracking.status)}
                    ${this.renderModalField('Telefon', this.escapeHtml(row['Cell Phone']), 'Cell Phone', tracking.status)}
                </div>
            </div>

            <!-- Program/School Info -->
            <div class="modal-section">
                <div class="modal-section-title">Program & Okul Bilgileri</div>
                <div class="modal-field-grid">
                    ${this.renderModalField('Okul', this.escapeHtml(row['School']), 'School', tracking.status)}
                    ${this.renderModalField('School Center', this.escapeHtml(row['School Center']), 'School Center', tracking.status)}
                    ${this.renderModalField('Şube', this.escapeHtml(row['Branch']), 'Branch', tracking.status)}
                    ${this.renderModalField('Program', this.escapeHtml(row['Program']), 'Program', tracking.status)}
                    ${this.renderModalField('Employee', this.escapeHtml(row['Employee']), 'Employee', tracking.status)}
                    ${this.renderModalField('Processor', this.escapeHtml(row['Processor']), 'Processor', tracking.status)}
                    ${this.renderModalField('Kayıt Tarihi', formatDateDisplay(row['Record Date']), 'Record Date', tracking.status)}
                    ${this.renderModalField('Program Başlangıç', formatDateDisplay(row['Program Start Date']), 'Program Start Date', tracking.status)}
                    ${this.renderModalField('Süre', this.escapeHtml(row['Duration']), 'Duration', tracking.status)}
                    ${this.renderModalField('Temsilci', this.escapeHtml(row['Represantative']), 'Represantative', tracking.status)}
                </div>
            </div>

            <!-- Financials -->
            <div class="modal-section">
                <div class="modal-section-title">Finans Bilgileri (${this.escapeHtml(row['Currency'] || '-')})</div>
                <div class="finance-grid">
                    ${this.getFieldRule(tracking.status, 'Tuition').visible ? `
                        <div class="finance-card fin-neutral">
                            <span class="fin-value">${formatNumber(row['Tuition'])}</span>
                            <span class="fin-label">Tuition</span>
                        </div>` : ''}
                    ${this.getFieldRule(tracking.status, 'Paid').visible ? `
                        <div class="finance-card fin-positive">
                            <span class="fin-value">${formatNumber(row['Paid'])}</span>
                            <span class="fin-label">Paid</span>
                        </div>` : ''}
                    ${this.getFieldRule(tracking.status, 'Balance').visible ? `
                        <div class="finance-card fin-negative">
                            <span class="fin-value">${formatNumber(row['Balance'])}</span>
                            <span class="fin-label">Balance</span>
                        </div>` : ''}
                    ${this.getFieldRule(tracking.status, 'Total Debt').visible ? `
                        <div class="finance-card">
                            <span class="fin-value">${formatNumber(row['Total Debt'])}</span>
                            <span class="fin-label">Total Debt</span>
                        </div>` : ''}
                    ${this.getFieldRule(tracking.status, 'Refund').visible ? `
                        <div class="finance-card">
                            <span class="fin-value">${formatNumber(row['Refund'])}</span>
                            <span class="fin-label">Refund</span>
                        </div>` : ''}
                    ${this.getFieldRule(tracking.status, 'Cancellation').visible ? `
                        <div class="finance-card">
                            <span class="fin-value">${formatNumber(row['Cancellation'])}</span>
                            <span class="fin-label">Cancellation</span>
                        </div>` : ''}
                    ${this.getFieldRule(tracking.status, 'Comm').visible ? `
                        <div class="finance-card">
                            <span class="fin-value">${formatNumber(row['Comm'])}</span>
                            <span class="fin-label">Comm</span>
                        </div>` : ''}
                    ${this.getFieldRule(tracking.status, 'Discount').visible ? `
                        <div class="finance-card">
                            <span class="fin-value">${formatNumber(row['Discount'])}</span>
                            <span class="fin-label">Discount</span>
                        </div>` : ''}
                    ${this.getFieldRule(tracking.status, 'School Balance').visible ? `
                        <div class="finance-card">
                            <span class="fin-value">${formatNumber(row['School Balance'])}</span>
                            <span class="fin-label">School Balance</span>
                        </div>` : ''}
                </div>
            </div>

            <!-- Tracking -->
            <div class="modal-section">
                <div class="modal-section-title">Takip Bilgileri</div>
                <div class="modal-form-group">
                    <label>Durum</label>
                    <select id="modal-status">
                        ${STATUSES.map(s => `<option value="${s}" ${s === tracking.status ? 'selected' : ''}>${s}</option>`).join('')}
                    </select>
                </div>
                <!-- Status specific fields -->
                ${this.renderModalFormGroup('Durum Açıklaması', `<input type="text" id="modal-status-reason" value="${this.escapeHtml(tracking.status_reason || '')}" placeholder="Kısa açıklama...">`, 'status_reason', tracking.status)}
                
                ${this.renderModalFormGroup('Depozito Primi', `<input type="number" id="modal-deposit-bonus" value="${tracking.deposit_bonus || ''}" placeholder="0.00">`, 'deposit_bonus', tracking.status)}
                
                ${this.renderModalFormGroup('Danışman Primi', `<input type="number" id="modal-consultant-bonus" value="${tracking.consultant_bonus || ''}" placeholder="0.00">`, 'consultant_bonus', tracking.status)}

                ${this.renderModalFormGroup('Notlar', `<textarea id="modal-notes" placeholder="Detaylı notlar...">${this.escapeHtml(tracking.notes || '')}</textarea>`, 'notes', tracking.status)}

                <div class="modal-field-grid">
                    ${this.renderModalFormGroup('Sonraki Takip Tarihi', `<input type="date" id="modal-follow-up" value="${tracking.next_follow_up_date || ''}">`, 'next_follow_up_date', tracking.status)}
                    ${this.renderModalFormGroup('Sahip', `<input type="text" id="modal-owner" value="${this.escapeHtml(tracking.owner || '')}" placeholder="Sorumlu kişi...">`, 'owner', tracking.status)}
                </div>
                
                <div class="modal-actions">
                    <button class="btn btn-primary" onclick="trackingManager.saveModalTracking('${this.escapeAttr(rowUid)}')">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                        Kaydet
                    </button>
                    <button class="btn btn-outline" onclick="document.getElementById('detail-modal').style.display='none';">İptal</button>
                </div>
            </div>
            
            <!-- Meta Info -->
            <div class="modal-section" style="opacity: 0.6; font-size: 0.75rem; color: var(--text-muted);">
                <p>row_uid: ${this.escapeHtml(row.row_uid)}</p>
                <p>Son yükleme: ${row.source_uploaded_at ? new Date(row.source_uploaded_at).toLocaleString('tr-TR') : '-'}</p>
                <p>Takip oluşturma: ${tracking.created_at ? new Date(tracking.created_at).toLocaleString('tr-TR') : '-'}</p>
                <p>Son dokunma: ${tracking.last_touched_at ? new Date(tracking.last_touched_at).toLocaleString('tr-TR') : '-'}</p>
                ${row.is_missing_in_latest_upload ? '<p style="color: var(--accent-amber);">⚠ Bu kayıt son yüklemede bulunamadı (arşivlenmiş)</p>' : ''}
                ${row._parse_errors ? `<p style="color: var(--accent-red);">Parse hataları: ${row._parse_errors.join(', ')}</p>` : ''}
            </div>
        `;

        modal.style.display = 'flex';
    }

    async saveModalTracking(rowUid) {
        const row = this.data.find(r => r.row_uid === rowUid);
        if (!row) return;

        const tracking = await crmDB.getTracking(rowUid);
        if (!tracking) return;

        const newStatus = document.getElementById('modal-status').value;
        
        // Check required fields based on rules
        const rules = window.statusRules?.[newStatus] || {};
        const errors = [];

        // Dynamic fields from tracking
        const formFields = [
            { id: 'modal-status-reason', name: 'status_reason', label: 'Durum Açıklaması' },
            { id: 'modal-notes', name: 'notes', label: 'Notlar' },
            { id: 'modal-follow-up', name: 'next_follow_up_date', label: 'Sonraki Takip Tarihi' },
            { id: 'modal-owner', name: 'owner', label: 'Sahip' },
            { id: 'modal-deposit-bonus', name: 'deposit_bonus', label: 'Depozito Primi' },
            { id: 'modal-consultant-bonus', name: 'consultant_bonus', label: 'Danışman Primi' }
        ];

        formFields.forEach(f => {
            const el = document.getElementById(f.id);
            if (!el) return;
            
            const rule = rules[f.name] || { visible: true, required: false };
            if (rule.visible && rule.required && (!el.value || el.value.trim() === '')) {
                errors.push(f.label);
            }
            
            tracking[f.name] = el.value || null;
        });

        // Also check CSV source fields that are marked as required
        this.fields.filter(f => CSV_COLUMNS.includes(f)).forEach(f => {
            const rule = rules[f] || { visible: true, required: false };
            if (rule.visible && rule.required && (!row[f])) {
                errors.push(f);
            }
        });

        if (errors.length > 0) {
            showToast(`Lütfen zorunlu alanları doldurun: ${errors.join(', ')}`, 'warning');
            return;
        }

        tracking.status = newStatus;
        await crmDB.putTracking(tracking);

        // Update local data
        if (row) {
            row._tracking = tracking;
        }

        document.getElementById('detail-modal').style.display = 'none';
        this.renderTable();
        showToast('Takip bilgileri kaydedildi.', 'success');
    }

    exportExcel() {
        if (this.filteredData.length === 0) {
            showToast('Dışa aktarılacak veri yok.', 'warning');
            return;
        }

        const headers = [
            'Name', 'Surname', 'E-Mail', 'Cell Phone',
            'School', 'School Center', 'Branch',
            'Employee', 'Processor', 'Program',
            'Record Date', 'Program Start Date', 'Duration',
            'Total Debt', 'Paid', 'Refund', 'Tuition',
            'Cancellation', 'Balance', 'Comm', 'Discount',
            'Currency', 'Represantative', 'Represantative Comm', 'School Balance',
            'Status', 'Status Reason', 'Notes', 'Follow-Up Date', 'Owner',
            'Deposit Bonus', 'Deposit Bonus Status', 'Consultant Bonus', 'Consultant Bonus Status'
        ];

        const dataRows = this.filteredData.map(row => {
            const tracking = row._tracking || {};
            return [
                row['Name'] || '', row['Surname'] || '', row['E-Mail'] || '', row['Cell Phone'] || '',
                row['School'] || '', row['School Center'] || '', row['Branch'] || '',
                row['Employee'] || '', row['Processor'] || '', row['Program'] || '',
                formatDateDisplay(row['Record Date']), formatDateDisplay(row['Program Start Date']),
                row['Duration'] || '',
                row['Total Debt'] || 0, row['Paid'] || 0, row['Refund'] || 0, row['Tuition'] || 0,
                row['Cancellation'] || 0, row['Balance'] || 0, row['Comm'] || 0, row['Discount'] || 0,
                row['Currency'] || '', row['Represantative'] || '', row['Represantative Comm'] || 0,
                row['School Balance'] || 0,
                tracking.status || '', tracking.status_reason || '', tracking.notes || '',
                tracking.next_follow_up_date || '', tracking.owner || '',
                tracking.deposit_bonus || '', tracking.deposit_bonus_status || '',
                tracking.consultant_bonus || '', tracking.consultant_bonus_status || ''
            ];
        });

        // Add headers at the top
        const sheetData = [headers, ...dataRows];

        // Create workbook and sheet
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(sheetData);

        // Add sheet to workbook
        XLSX.utils.book_append_sheet(wb, ws, "CRM_Takip");

        // Download
        const fileName = `CRM_Takip_Export_${new Date().toISOString().slice(0, 10)}.xlsx`;
        XLSX.writeFile(wb, fileName);

        showToast(`${this.filteredData.length} kayıt Excel olarak dışa aktarıldı.`, 'success');
    }

    exportCSV() {
        if (this.filteredData.length === 0) {
            showToast('Dışa aktarılacak veri yok.', 'warning');
            return;
        }

        const headers = [
            'Name', 'Surname', 'E-Mail', 'Cell Phone',
            'School', 'School Center', 'Branch',
            'Employee', 'Processor', 'Program',
            'Record Date', 'Program Start Date', 'Duration',
            'Total Debt', 'Paid', 'Refund', 'Tuition',
            'Cancellation', 'Balance', 'Comm', 'Discount',
            'Currency', 'Represantative', 'Represantative Comm', 'School Balance',
            'Status', 'Status Reason', 'Notes', 'Follow-Up Date', 'Owner'
        ];

        const rows = this.filteredData.map(row => {
            return [
                row['Name'] || '', row['Surname'] || '', row['E-Mail'] || '', row['Cell Phone'] || '',
                row['School'] || '', row['School Center'] || '', row['Branch'] || '',
                row['Employee'] || '', row['Processor'] || '', row['Program'] || '',
                formatDateDisplay(row['Record Date']), formatDateDisplay(row['Program Start Date']),
                row['Duration'] || '',
                row['Total Debt'] ?? '', row['Paid'] ?? '', row['Refund'] ?? '', row['Tuition'] ?? '',
                row['Cancellation'] ?? '', row['Balance'] ?? '', row['Comm'] ?? '', row['Discount'] ?? '',
                row['Currency'] || '', row['Represantative'] || '', row['Represantative Comm'] ?? '',
                row['School Balance'] ?? '',
                row._tracking.status, row._tracking.status_reason || '', row._tracking.notes || '',
                row._tracking.next_follow_up_date || '', row._tracking.owner || ''
            ].map(val => `"${String(val).replace(/"/g, '""')}"`).join(';');
        });

        const csvContent = '\ufeff' + headers.join(';') + '\n' + rows.join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `CRM_Takip_Export_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);

        showToast(`${this.filteredData.length} kayıt dışa aktarıldı.`, 'success');
    }

    // Helpers
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }


    escapeAttr(text) {
        return text.replace(/'/g, "\\'").replace(/"/g, '&quot;');
    }

    // Selection Management
    toggleSelection(rowUid, isSelected) {
        if (isSelected) {
            this.selectedRows.add(rowUid);
        } else {
            this.selectedRows.delete(rowUid);
        }
        
        // Find the row and update its selected class without full re-render
        const tr = document.querySelector(`#tracking-table-body tr[data-uid="${rowUid}"]`);
        if (tr) {
            if (isSelected) tr.classList.add('selected');
            else tr.classList.remove('selected');
        }

        this.updateBulkActionBar();
    }

    toggleSelectAll(isSelected) {
        // Collect all currently filtered data UIDs
        if (isSelected) {
            this.filteredData.forEach(row => this.selectedRows.add(row.row_uid));
        } else {
            this.selectedRows.clear();
        }

        this.renderTable();
        this.updateBulkActionBar();
    }

    clearSelection() {
        this.selectedRows.clear();
        const selectAll = document.getElementById('select-all-checkbox');
        if (selectAll) selectAll.checked = false;
        this.renderTable();
        this.updateBulkActionBar();
    }

    updateBulkActionBar() {
        const bar = document.getElementById('bulk-actions-bar');
        const count = document.getElementById('selected-count');
        const totalSelected = this.selectedRows.size;

        if (totalSelected > 0) {
            bar.style.display = 'flex';
            count.textContent = totalSelected;
        } else {
            bar.style.display = 'none';
        }

        // Update select-all checkbox state based on visible rows
        const selectAll = document.getElementById('select-all-checkbox');
        if (selectAll) {
            const start = (this.currentPage - 1) * this.pageSize;
            const end = Math.min(start + this.pageSize, this.filteredData.length);
            const pageData = this.filteredData.slice(start, end);
            
            if (pageData.length > 0) {
                const allPageSelected = pageData.every(row => this.selectedRows.has(row.row_uid));
                selectAll.checked = allPageSelected;
            } else {
                selectAll.checked = false;
            }
        }
    }

    async bulkUpdateStatus() {
        const newStatus = document.getElementById('bulk-status-select').value;
        if (!newStatus) {
            showToast('Lütfen bir durum seçin.', 'warning');
            return;
        }

        const count = this.selectedRows.size;
        if (!confirm(`${count} adet kaydın durumunu "${newStatus}" olarak değiştirmek istediğinize emin misiniz?`)) {
            return;
        }

        try {
            const uids = Array.from(this.selectedRows);
            showToast(`${count} kayıt güncelleniyor...`, 'info');

            for (const uid of uids) {
                const tracking = await crmDB.getTracking(uid) || { row_uid: uid };
                tracking.status = newStatus;
                await crmDB.putTracking(tracking);

                const row = this.data.find(r => r.row_uid === uid);
                if (row) {
                    if (!row._tracking) row._tracking = {};
                    row._tracking.status = newStatus;
                }
            }

            this.selectedRows.clear();
            const selectAll = document.getElementById('select-all-checkbox');
            if (selectAll) selectAll.checked = false;
            
            this.renderTable();
            this.updateBulkActionBar();
            showToast(`${count} kayıt başarıyla güncellendi.`, 'success');
        } catch (error) {
            console.error('Bulk update error:', error);
            showToast('Toplu güncelleme sırasında hata oluştu.', 'error');
        }
    }
}

// Debounce utility
function debounce(fn, delay) {
    let timer;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

// ========== Status Checkbox Multi-Select Helpers ==========

function toggleStatusFilter() {
    const dropdown = document.getElementById('status-multiselect-dropdown');
    dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
}

function getSelectedStatuses() {
    const checkboxes = document.querySelectorAll('#status-multiselect-dropdown input[type="checkbox"]:checked');
    return Array.from(checkboxes).map(cb => cb.value);
}

function applyStatusFilter() {
    const selected = getSelectedStatuses();
    const btn = document.getElementById('status-multiselect-btn');
    if (selected.length === 0) {
        btn.textContent = 'Durum Seç ▾';
    } else if (selected.length === 1) {
        btn.textContent = selected[0] + ' ▾';
    } else {
        btn.textContent = selected.length + ' seçili ▾';
    }
    if (window.trackingManager) {
        trackingManager.applyFilters();
    }
}

// Close status dropdown on outside click
document.addEventListener('click', (e) => {
    if (!e.target.closest('#status-multiselect')) {
        const dropdown = document.getElementById('status-multiselect-dropdown');
        if (dropdown) dropdown.style.display = 'none';
    }
});

