/**
 * status-rules.js — Status-based Field Rules Manager
 * Allows defining visibility and requirement for fields based on status
 */

class StatusRulesManager {
    constructor() {
        this.matrixEl = document.getElementById('status-rules-matrix');
        this.visualRulesListEl = document.getElementById('visual-rules-list');
        this.rules = {}; // status -> { field_name: { visible: bool, required: bool } }
        this.visualRules = []; // list of { id, status_cond, field_cond, operator_cond, value_cond, color }
        
        // Define fields to be managed (from csv-parser and tracking)
        this.fields = [
            ...CSV_COLUMNS,
            'deposit_bonus',
            'consultant_bonus',
            'notes',
            'next_follow_up_date',
            'owner'
        ];

        // Logical fields for visual rules
        this.visualFields = [
            ...this.fields,
            'total_commission'
        ];
    }

    async loadData() {
        try {
            this.matrixEl.innerHTML = '<div style="text-align:center; padding: 40px; color: var(--text-tertiary);">Yükleniyor...</div>';
            this.visualRulesListEl.innerHTML = '<div style="text-align:center; padding: 40px; color: var(--text-tertiary);">Yükleniyor...</div>';
            
            // 1. Fetch from DB
            const [statusResults, visualResults] = await Promise.all([
                crmDB.supabase.select('status_rules'),
                crmDB.supabase.select('visual_rules')
            ]);

            this.rules = {};
            
            // Initialize with all statuses
            STATUSES.forEach(s => {
                this.rules[s] = {};
                this.fields.forEach(f => {
                    this.rules[s][f] = { visible: true, required: false };
                });
            });

            // Override with DB data
            if (statusResults && Array.isArray(statusResults)) {
                statusResults.forEach(item => {
                    if (this.rules[item.status]) {
                        this.rules[item.status] = { ...this.rules[item.status], ...(item.rules || {}) };
                    }
                });
            }

            this.visualRules = visualResults || [];
            if (this.visualRules.length === 0) {
                // Add default requested rule if none exists
                this.visualRules.push({
                    id: 'default-1',
                    status_cond: 'Completed',
                    field_cond: 'total_commission',
                    operator_cond: '==',
                    value_cond: '0',
                    color: '#ef4444' // Red
                });
            }

            // Global access
            window.statusRules = this.rules;
            window.visualRules = this.visualRules;

            this.render();
            this.renderVisualRules();
        } catch (error) {
            console.error('Status rules load error:', error);
            this.matrixEl.innerHTML = `<div class="alert alert-error">Kurallar yüklenemedi: ${error.message}</div>`;
        }
    }

    render() {
        let html = `
            <table class="data-table" style="font-size: 0.75rem;">
                <thead>
                    <tr>
                        <th style="position: sticky; left: 0; background: var(--bg-tertiary); z-index: 20;">Alan / Durum</th>
        `;

        STATUSES.forEach(s => {
            html += `<th colspan="2" style="text-align: center;">${s}</th>`;
        });

        html += `
                    </tr>
                    <tr>
                        <th style="position: sticky; left: 0; background: var(--bg-tertiary); z-index: 20;"></th>
        `;

        STATUSES.forEach(s => {
            html += `
                <th style="font-size: 0.65rem; padding: 4px;">Gör.</th>
                <th style="font-size: 0.65rem; padding: 4px;">Zor.</th>
            `;
        });

        html += `
                    </tr>
                </thead>
                <tbody>
        `;

        this.fields.forEach(field => {
            html += `
                <tr>
                    <td style="position: sticky; left: 0; background: var(--bg-card); z-index: 10; font-weight: 500;">${field}</td>
            `;

            STATUSES.forEach(status => {
                const rule = this.rules[status][field] || { visible: true, required: false };
                html += `
                    <td style="text-align: center;">
                        <input type="checkbox" ${rule.visible ? 'checked' : ''} 
                            onchange="updateStatusRule('${status}', '${field}', 'visible', this.checked)">
                    </td>
                    <td style="text-align: center;">
                        <input type="checkbox" ${rule.required ? 'checked' : ''} 
                            onchange="updateStatusRule('${status}', '${field}', 'required', this.checked)">
                    </td>
                `;
            });

            html += `
                </tr>
            `;
        });

        html += `
                </tbody>
            </table>
        `;

        this.matrixEl.innerHTML = html;
    }

    renderVisualRules() {
        if (this.visualRules.length === 0) {
            this.visualRulesListEl.innerHTML = '<div style="text-align:center; padding: 40px; color: var(--text-tertiary);">Kural bulunamadı. "Kural Oluştur" butonu ile yeni kural ekleyebilirsiniz.</div>';
            return;
        }

        let html = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Durum Koşulu</th>
                        <th>Alan</th>
                        <th>Koşul</th>
                        <th>Değer</th>
                        <th>Renk</th>
                        <th style="width: 50px;"></th>
                    </tr>
                </thead>
                <tbody>
        `;

        this.visualRules.forEach((rule, idx) => {
            html += `
                <tr>
                    <td>
                        <select onchange="updateVisualRule('${rule.id}', 'status_cond', this.value)">
                            <option value="">Herhangi</option>
                            ${STATUSES.map(s => `<option value="${s}" ${rule.status_cond === s ? 'selected' : ''}>${s}</option>`).join('')}
                        </select>
                    </td>
                    <td>
                        <select onchange="updateVisualRule('${rule.id}', 'field_cond', this.value)">
                            ${this.visualFields.map(f => `<option value="${f}" ${rule.field_cond === f ? 'selected' : ''}>${f}</option>`).join('')}
                        </select>
                    </td>
                    <td>
                        <select onchange="updateVisualRule('${rule.id}', 'operator_cond', this.value)">
                            <option value="==" ${rule.operator_cond === '==' || rule.operator_cond === '=' ? 'selected' : ''}>= (Eşittir)</option>
                            <option value=">=" ${rule.operator_cond === '>=' ? 'selected' : ''}>&gt;= (Büyük veya Eşittir)</option>
                            <option value="<=" ${rule.operator_cond === '<=' ? 'selected' : ''}>&lt;= (Küçük veya Eşittir)</option>
                            <option value=">" ${rule.operator_cond === '>' ? 'selected' : ''}>&gt; (Büyüktür)</option>
                            <option value="<" ${rule.operator_cond === '<' ? 'selected' : ''}>&lt; (Küçüktür)</option>
                        </select>
                    </td>
                    <td>
                        <input type="text" value="${rule.value_cond || ''}" 
                            onchange="updateVisualRule('${rule.id}', 'value_cond', this.value)" 
                            style="width: 80px;">
                    </td>
                    <td>
                        <input type="color" value="${rule.color || '#ffffff'}" 
                            onchange="updateVisualRule('${rule.id}', 'color', this.value)">
                    </td>
                    <td>
                        <button class="btn btn-icon" onclick="removeVisualRule('${rule.id}')" title="Sil">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-red)" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                        </button>
                    </td>
                </tr>
            `;
        });

        html += '</tbody></table>';
        this.visualRulesListEl.innerHTML = html;
    }

    addVisualRule() {
        const id = crypto.randomUUID();
        this.visualRules.push({
            id,
            status_cond: '',
            field_cond: 'total_commission',
            operator_cond: '==',
            value_cond: '0',
            color: '#ef4444'
        });
        this.renderVisualRules();
    }

    removeVisualRule(id) {
        this.visualRules = this.visualRules.filter(r => r.id !== id);
        this.renderVisualRules();
    }

    async save() {
        // ... (existing save logic for matrix)
        const btn = document.getElementById('btn-save-status-rules');
        const originalHtml = btn.innerHTML;

        try {
            btn.disabled = true;
            btn.innerHTML = 'Kaydediliyor...';

            const records = Object.entries(this.rules).map(([status, rules]) => ({
                status,
                rules
            }));

            await crmDB.supabase.upsert('status_rules', records, 'status');

            showToast('Durum kuralları başarıyla kaydedildi.', 'success');
            window.statusRules = this.rules;
        } catch (error) {
            console.error('Save status rules error:', error);
            showToast('Kaydedilemedi: ' + error.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalHtml;
        }
    }

    async saveVisualRules() {
        const btn = document.getElementById('btn-save-visual-rules');
        const originalHtml = btn.innerHTML;

        try {
            btn.disabled = true;
            btn.innerHTML = 'Kaydediliyor...';

            // Filter out default temp ids if needed, or just upsert
            // Map to records without created_at if updating
            const records = this.visualRules.map(r => {
                const rec = { ...r };
                if (String(rec.id).startsWith('default')) delete rec.id;
                return rec;
            });

            // For simplicity, delete all and re-insert or use upsert with proper IDs
            // Let's use a simple approach: if id is a uuid, it works.
            
            // Prepare records (Supabase will handle upsert via id)
            const payload = this.visualRules.map(r => ({
                id: String(r.id).startsWith('default') ? crypto.randomUUID() : r.id,
                status_cond: r.status_cond || null,
                field_cond: r.field_cond,
                operator_cond: r.operator_cond,
                value_cond: r.value_cond,
                color: r.color
            }));

            // To avoid orphaned rules in DB, we could delete non-existent IDs.
            // For now, let's just clear and insert to be safe and simple.
            await crmDB.supabase.delete('visual_rules', 'id=neq.00000000-0000-0000-0000-000000000000'); // Delete all
            if (payload.length > 0) {
                await crmDB.supabase.insert('visual_rules', payload);
            }

            showToast('Görsel kurallar başarıyla kaydedildi.', 'success');
            window.visualRules = this.visualRules;
        } catch (error) {
            console.error('Save visual rules error:', error);
            showToast('Kaydedilemedi: ' + error.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalHtml;
        }
    }
}

// Global hooks
function updateStatusRule(status, field, prop, value) {
    if (window.statusRulesManager) {
        if (!window.statusRulesManager.rules[status]) window.statusRulesManager.rules[status] = {};
        if (!window.statusRulesManager.rules[status][field]) window.statusRulesManager.rules[status][field] = {};
        window.statusRulesManager.rules[status][field][prop] = value;
    }
}

async function saveAllStatusRules() {
    if (window.statusRulesManager) {
        await window.statusRulesManager.save();
    }
}

function addVisualRule() {
    if (window.statusRulesManager) window.statusRulesManager.addVisualRule();
}

function removeVisualRule(id) {
    if (window.statusRulesManager) window.statusRulesManager.removeVisualRule(id);
}

function updateVisualRule(id, prop, value) {
    if (window.statusRulesManager) {
        const rule = window.statusRulesManager.visualRules.find(r => r.id === id);
        if (rule) rule[prop] = value;
    }
}

async function saveAllVisualRules() {
    if (window.statusRulesManager) await window.statusRulesManager.saveVisualRules();
}
