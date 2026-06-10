/**
 * status-rules.js — Status-based Field Rules Manager
 * Allows defining visibility and requirement for fields based on status
 */

class StatusRulesManager {
    constructor() {
        this.visualRulesListEl = document.getElementById('visual-rules-list');
        this.visualRules = []; // list of { id, status_cond, field_cond, operator_cond, value_cond, color }
        
        // Define fields to be managed (from csv-parser and tracking)
        this.fields = [
            ...CSV_COLUMNS,
            'deposit_bonus',
            'deposit_bonus_status',
            'consultant_bonus',
            'consultant_bonus_status',
            'remaining_bonus',
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
            this.visualRulesListEl.innerHTML = '<div style="text-align:center; padding: 40px; color: var(--text-tertiary);">Yükleniyor...</div>';
            
            // 1. Fetch from DB directly to ensure fresh state
            const visualResults = await crmDB.supabase.select('visual_rules', 'order=created_at.asc');
            console.log('DEBUG Visual Rules Load:', visualResults);

            this.visualRules = (visualResults || []).map(r => ({
                id: r.id,
                status_cond: r.status_cond || '',
                field_cond: r.field_cond,
                operator_cond: r.operator_cond,
                value_cond: r.value_cond,
                color: r.color
            }));
            
            // Sync global state immediately
            window.visualRules = [...this.visualRules];

            this.renderVisualRules();
        } catch (error) {
            console.error('Visual rules load error:', error);
            this.visualRulesListEl.innerHTML = `<div class="alert alert-error">Kurallar yüklenemedi: ${error.message}</div>`;
        }
    }



    renderVisualRules() {
        if (!this.visualRulesListEl) return;
        
        if (this.visualRules.length === 0) {
            this.visualRulesListEl.innerHTML = `
                <div style="text-align:center; padding: 40px; border: 1px dashed var(--border-primary); border-radius: var(--radius-md); background: rgba(255,255,255,0.01);">
                    <div style="color: var(--text-tertiary); margin-bottom: 12px;">Henüz tanımlanmış bir görsel kural bulunmuyor.</div>
                    <button class="btn btn-outline btn-sm" onclick="addVisualRule()">+ Yeni Kural Ekle</button>
                </div>`;
            return;
        }

        let html = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th style="width: 180px;">Durum</th>
                        <th style="width: 200px;">Alan</th>
                        <th style="width: 120px;">Koşul</th>
                        <th>Değer</th>
                        <th style="width: 60px;"></th>
                    </tr>
                </thead>
                <tbody>
        `;

        this.visualRules.forEach((rule) => {
            html += `
                <tr>
                    <td>
                        <select onchange="updateVisualRule('${rule.id}', 'status_cond', this.value)" style="width: 100%;">
                            <option value="">Hepsi (Herhangi)</option>
                            ${STATUSES.map(s => `<option value="${s}" ${rule.status_cond === s ? 'selected' : ''}>${s}</option>`).join('')}
                        </select>
                    </td>
                    <td>
                        <select onchange="updateVisualRule('${rule.id}', 'field_cond', this.value)" style="width: 100%;">
                            ${this.visualFields.map(f => `<option value="${f}" ${rule.field_cond === f ? 'selected' : ''}>${f}</option>`).join('')}
                        </select>
                    </td>
                    <td>
                        <select onchange="updateVisualRule('${rule.id}', 'operator_cond', this.value)" style="width: 100%;">
                            <option value="==" ${rule.operator_cond === '==' || rule.operator_cond === '=' ? 'selected' : ''}>=</option>
                            <option value="!=" ${rule.operator_cond === '!=' ? 'selected' : ''}>!=</option>
                            <option value=">=" ${rule.operator_cond === '>=' ? 'selected' : ''}>&gt;=</option>
                            <option value="<=" ${rule.operator_cond === '<=' ? 'selected' : ''}>&lt;=</option>
                            <option value=">" ${rule.operator_cond === '>' ? 'selected' : ''}>&gt;</option>
                            <option value="<" ${rule.operator_cond === '<' ? 'selected' : ''}>&lt;</option>
                        </select>
                    </td>
                    <td>
                        <input type="text" value="${rule.value_cond || ''}" 
                            onchange="updateVisualRule('${rule.id}', 'value_cond', this.value)" 
                            placeholder="Değer..." style="width: 100%;">
                    </td>
                    <td style="text-align: center;">
                        <button class="btn btn-icon" onclick="removeVisualRule('${rule.id}')" title="Kuralı Sil">
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
        const id = 'new-' + Date.now();
        this.visualRules.push({
            id,
            status_cond: '',
            field_cond: 'total_commission',
            operator_cond: '==',
            value_cond: '0',
            color: '#ff0000' // Constant Red for Warnings
        });
        this.renderVisualRules();
    }

    removeVisualRule(id) {
        this.visualRules = this.visualRules.filter(r => r.id !== id);
        this.renderVisualRules();
    }



    async saveVisualRules() {
        const btn = document.getElementById('btn-save-visual-rules');
        const originalHtml = btn.innerHTML;

        try {
            btn.disabled = true;
            btn.innerHTML = '<span class="spin-animation">↻</span> Kaydediliyor...';

            const payload = this.visualRules.map(r => ({
                id: (String(r.id).startsWith('new-') || String(r.id).startsWith('default')) ? crypto.randomUUID() : r.id,
                status_cond: r.status_cond || null,
                field_cond: r.field_cond,
                operator_cond: r.operator_cond,
                value_cond: r.value_cond,
                color: r.color
            }));

            // Step 1: Wipe current rules safely
            await crmDB.supabase.delete('visual_rules', 'id=neq.00000000-0000-0000-0000-000000000000'); 
            
            // Step 2: Insert new rules if any exist
            if (payload.length > 0) {
                await crmDB.supabase.insert('visual_rules', payload);
            }

            // Step 3: Refresh local list from DB to get the actual UUIDs
            const freshRows = await crmDB.supabase.select('visual_rules', 'order=created_at.asc');
            this.visualRules = freshRows || [];
            window.visualRules = [...this.visualRules];
            
            this.renderVisualRules();
            showToast('Görsel kurallar başarıyla kaydedildi.', 'success');
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
