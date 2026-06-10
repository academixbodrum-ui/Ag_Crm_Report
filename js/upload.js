/**
 * upload.js — CSV Upload & Upsert Logic
 */

class UploadManager {
    constructor() {
        this.dropzone = document.getElementById('upload-dropzone');
        this.fileInput = document.getElementById('csv-file-input');
        this.progressContainer = document.getElementById('upload-progress');
        this.progressFill = document.getElementById('progress-fill');
        this.progressPercent = document.getElementById('progress-percent');
        this.progressDetails = document.getElementById('progress-details');
        this.resultContainer = document.getElementById('upload-result');
        this.historyList = document.getElementById('upload-history-list');

        this.bindEvents();
    }

    bindEvents() {
        // Drag & drop
        this.dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.dropzone.classList.add('dragover');
        });

        this.dropzone.addEventListener('dragleave', () => {
            this.dropzone.classList.remove('dragover');
        });

        this.dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            this.dropzone.classList.remove('dragover');
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.handleFile(files[0]);
            }
        });

        // Click to browse
        this.dropzone.addEventListener('click', () => {
            this.fileInput.click();
        });

        this.fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.handleFile(e.target.files[0]);
            }
        });

        // Delete archive
        const deleteBtn = document.getElementById('btn-delete-archive');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => this.handleArchiveDelete());
        }

        // Delete all data
        const deleteAllBtn = document.getElementById('btn-delete-all');
        if (deleteAllBtn) {
            deleteAllBtn.addEventListener('click', () => this.handleAllDataDelete());
        }
    }

    async handleAllDataDelete() {
        if (!confirm('DİKKAT: Sistemdeki TÜM import kayıtları ve TÜM takip durumları kalıcı olarak SİLİNECEKTİR. Bu işlemi geri alamazsınız. Emin misiniz?')) {
            return;
        }

        try {
            this.updateProgress(10, 'Tüm veriler siliniyor...');
            this.showProgress();
            
            await crmDB.deleteAllData();
            
            this.updateProgress(100, 'Tüm sistem verileri başarıyla temizlendi.');
            showToast('Veritabanı sıfırlandı.', 'success');
            
            setTimeout(() => {
                this.hideProgress();
                if (window.trackingManager) {
                    window.trackingManager.loadData();
                }
            }, 1000);
            
        } catch (error) {
            console.error('Delete all data error:', error);
            showToast('Veriler silinirken hata oluştu: ' + error.message, 'error');
            this.hideProgress();
        }
    }

    async handleArchiveDelete() {
        if (!confirm('Arşivlenmiş tüm kayıtlar (son yüklemede bulunmayanlar) kalıcı olarak silinecektir. Emin misiniz?')) {
            return;
        }

        try {
            this.updateProgress(10, 'Arşiv siliniyor...');
            this.showProgress();
            
            await crmDB.deleteArchivedRows();
            
            this.updateProgress(100, 'Arşiv başarıyla temizlendi.');
            showToast('Arşiv başarıyla silindi.', 'success');
            
            setTimeout(() => {
                this.hideProgress();
                if (window.trackingManager) {
                    window.trackingManager.loadData();
                }
            }, 1000);
            
        } catch (error) {
            console.error('Delete archive error:', error);
            showToast('Arşiv silinirken hata oluştu: ' + error.message, 'error');
            this.hideProgress();
        }
    }

    async handleFile(file) {
        if (!file.name.toLowerCase().endsWith('.csv')) {
            showToast('Lütfen bir CSV dosyası seçin.', 'error');
            return;
        }

        this.showProgress();
        this.hideResult();

        try {
            const result = await processCSVFile(file, (pct, msg) => {
                this.updateProgress(pct, msg);
            });

            this.updateProgress(85, 'Veritabanına yazılıyor...');

            const upsertResult = await this.upsertToDatabase(result);

            this.updateProgress(95, 'Yükleme kaydediliyor...');

            // Save upload history
            await crmDB.addUploadHistory({
                upload_id: result.uploadId,
                uploaded_at: result.uploadedAt,
                file_name: result.fileName,
                total_rows: result.totalRows,
                inserted: upsertResult.inserted,
                updated: upsertResult.updated,
                unchanged: upsertResult.unchanged,
                missing_marked: upsertResult.missingMarked,
                parse_errors: upsertResult.parseErrors
            });

            this.updateProgress(100, 'Tamamlandı!');

            setTimeout(() => {
                this.hideProgress();
                this.showResult(upsertResult, result);
                this.loadHistory();
                updateSidebarStatus();
            }, 500);

            showToast(`${result.totalRows} satır başarıyla işlendi.`, 'success');

        } catch (error) {
            console.error('Upload error:', error);
            this.hideProgress();
            this.showError(error.message);
            showToast('Yükleme sırasında hata oluştu: ' + error.message, 'error');
        }

        // Reset file input
        this.fileInput.value = '';
    }

    async upsertToDatabase(result) {
        const { processedRows, uploadId, uploadedAt } = result;

        // DEBUG: Check dates right after CSV parsing
        console.log('=== UPLOAD DEBUG ===');
        console.log('UPLOAD DEBUG - processedRows[0]:', processedRows[0]);
        console.log('UPLOAD DEBUG - Record Date from CSV:', processedRows[0]?.['Record Date']);
        console.log('UPLOAD DEBUG - Program Start Date from CSV:', processedRows[0]?.['Program Start Date']);
        console.log('UPLOAD DEBUG - All keys:', Object.keys(processedRows[0] || {}));

        let inserted = 0;
        let updated = 0;
        let unchanged = 0;
        let parseErrors = 0;

        // Step 0: Deduplicate CSV rows by row_uid (keep last occurrence)
        const deduped = new Map();
        for (const row of processedRows) {
            deduped.set(row.row_uid, row);
        }
        const uniqueRows = Array.from(deduped.values());
        console.log(`CSV: ${processedRows.length} satır → ${uniqueRows.length} unique row_uid`);

        // Step 1: Fetch existing rows for comparison
        this.updateProgress(86, 'Mevcut kayıtlar kontrol ediliyor...');
        const existingRows = await supabase.select('crm_import_rows');
        const existingMap = {};
        for (const er of existingRows) {
            existingMap[er.row_uid] = er;
        }

        // Step 2: Categorize rows
        const toUpsert = [];
        const newTrackingUIDSet = new Set();

        for (const row of uniqueRows) {
            if (row._parse_errors) parseErrors++;

            const existingRow = existingMap[row.row_uid];

            if (existingRow !== undefined) {
                if (existingRow.row_hash !== row.row_hash) {
                    // It changed! Store previous values for bolding in table
                    row.previous_values = toJsRow(existingRow);
                    toUpsert.push(row);
                    updated++;
                } else {
                    // No change, but carry over existing previous_values if they exist
                    // so we don't lose the "boldness" until next change?
                    // Actually, usually we only want to show changes from THIS upload.
                    // If unchanged, it was already matching.
                    toUpsert.push({ ...row });
                    unchanged++;
                }
            } else {
                toUpsert.push(row);
                newTrackingUIDSet.add(row.row_uid);
                inserted++;
            }
        }

        // Step 3: Mark ALL existing rows as missing first
        this.updateProgress(88, 'Mevcut kayıtlar işaretleniyor...');
        await crmDB.markAllAsMissing();

        // Step 4: Batch upsert import rows (with is_missing = false)
        this.updateProgress(90, 'Kayıtlar yazılıyor...');
        const dbRowsRaw = toUpsert.map(row => {
            const dbRow = toDbRow(row);
            dbRow.is_missing_in_latest_upload = false;
            dbRow.archived_at = null;
            return dbRow;
        });

        // DEBUG: Check dates after toDbRow mapping
        console.log('UPLOAD DEBUG - toUpsert[0] Record Date:', toUpsert[0]?.['Record Date']);
        console.log('UPLOAD DEBUG - dbRowsRaw[0]:', dbRowsRaw[0]);
        console.log('UPLOAD DEBUG - dbRowsRaw[0].record_date:', dbRowsRaw[0]?.record_date);
        console.log('UPLOAD DEBUG - dbRowsRaw[0].program_start_date:', dbRowsRaw[0]?.program_start_date);

        // Final safety dedup on dbRows by row_uid
        const dbRowMap = new Map();
        for (const r of dbRowsRaw) {
            dbRowMap.set(r.row_uid, r);
        }
        const dbRows = Array.from(dbRowMap.values());
        console.log(`DB rows after final dedup: ${dbRowsRaw.length} → ${dbRows.length}`);

        // Batch in chunks of 500
        const chunkSize = 500;
        for (let i = 0; i < dbRows.length; i += chunkSize) {
            const chunk = dbRows.slice(i, i + chunkSize);
            // Extra safety: verify no dupes in chunk
            const chunkMap = new Map();
            for (const r of chunk) chunkMap.set(r.row_uid, r);
            const cleanChunk = Array.from(chunkMap.values());
            await supabase.upsert('crm_import_rows', cleanChunk, 'row_uid');
            const pct = 90 + Math.floor((i / dbRows.length) * 4);
            this.updateProgress(pct, `${i + cleanChunk.length}/${dbRows.length} kayıt yazıldı...`);
        }

        // Step 5: Create tracking records for new rows
        this.updateProgress(94, 'Takip kayıtları oluşturuluyor...');
        const newTrackingUIDs = Array.from(newTrackingUIDSet);
        if (newTrackingUIDs.length > 0) {
            const trackingRecords = newTrackingUIDs.map(uid => ({
                row_uid: uid,
                status: '',
                status_reason: '',
                notes: '',
                next_follow_up_date: null,
                owner: '',
                tags: [],
                manual_net_commission: 0,
                deposit_bonus: 0,
                deposit_bonus_status: '',
                consultant_bonus: 0,
                consultant_bonus_status: '',
                remaining_bonus: 0,
                last_touched_at: new Date().toISOString(),
                created_at: new Date().toISOString()
            }));

            for (let i = 0; i < trackingRecords.length; i += chunkSize) {
                const chunk = trackingRecords.slice(i, i + chunkSize);
                try {
                    await supabase.upsert('crm_tracking', chunk, 'row_uid');
                } catch (e) {
                    console.warn('Tracking batch insert warning:', e.message);
                }
            }
        }

        // Step 6: Count missing (still marked as missing after upsert)
        this.updateProgress(95, 'Arşivlenen kayıtlar hesaplanıyor...');
        const missingRows = await supabase.select('crm_import_rows',
            'select=row_uid&is_missing_in_latest_upload=eq.true');
        const missingMarked = missingRows.length;

        // Update archived_at for missing rows
        if (missingMarked > 0) {
            await supabase.update('crm_import_rows',
                { archived_at: uploadedAt },
                'is_missing_in_latest_upload=eq.true&archived_at=is.null'
            );
        }

        return { inserted, updated, unchanged, missingMarked, parseErrors };
    }

    showProgress() {
        this.progressContainer.style.display = 'block';
        this.updateProgress(0, 'Başlatılıyor...');
    }

    hideProgress() {
        this.progressContainer.style.display = 'none';
    }

    updateProgress(percent, message) {
        this.progressFill.style.width = percent + '%';
        this.progressPercent.textContent = percent + '%';
        this.progressDetails.textContent = message;
    }

    showResult(upsertResult, csvResult) {
        this.resultContainer.style.display = 'block';
        this.resultContainer.classList.add('success');
        this.resultContainer.innerHTML = `
            <div class="result-header">
                <div class="result-icon success">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="20 6 9 17 4 12"/>
                    </svg>
                </div>
                <div>
                    <h3 style="font-size: 1rem; font-weight: 700;">Yükleme Başarılı</h3>
                    <p style="font-size: 0.8rem; color: var(--text-tertiary);">${csvResult.fileName} — ${csvResult.totalRows} satır</p>
                </div>
            </div>
            <div class="result-stats">
                <div class="result-stat">
                    <span class="stat-value" style="color: var(--accent-green-light);">${upsertResult.inserted}</span>
                    <span class="stat-label">Yeni Eklenen</span>
                </div>
                <div class="result-stat">
                    <span class="stat-value" style="color: var(--accent-blue-light);">${upsertResult.updated}</span>
                    <span class="stat-label">Güncellenen</span>
                </div>
                <div class="result-stat">
                    <span class="stat-value">${upsertResult.unchanged}</span>
                    <span class="stat-label">Değişmeyen</span>
                </div>
                <div class="result-stat">
                    <span class="stat-value" style="color: var(--accent-amber-light);">${upsertResult.missingMarked}</span>
                    <span class="stat-label">Arşivlenen</span>
                </div>
                <div class="result-stat">
                    <span class="stat-value" style="color: ${upsertResult.parseErrors > 0 ? 'var(--accent-red-light)' : 'var(--text-tertiary)'};">${upsertResult.parseErrors}</span>
                    <span class="stat-label">Parse Hata</span>
                </div>
            </div>
        `;
    }

    showError(message) {
        this.resultContainer.style.display = 'block';
        this.resultContainer.classList.add('error');
        this.resultContainer.innerHTML = `
            <div class="result-header">
                <div class="result-icon error">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </div>
                <div>
                    <h3 style="font-size: 1rem; font-weight: 700; color: var(--accent-red-light);">Hata Oluştu</h3>
                    <p style="font-size: 0.8rem; color: var(--text-tertiary);">${message}</p>
                </div>
            </div>
        `;
    }

    hideResult() {
        this.resultContainer.style.display = 'none';
        this.resultContainer.classList.remove('success', 'error');
        this.resultContainer.innerHTML = '';
    }

    async loadHistory() {
        const history = await crmDB.getUploadHistory();

        if (history.length === 0) {
            this.historyList.innerHTML = '<p style="color: var(--text-tertiary); font-size: 0.85rem;">Henüz yükleme yapılmadı.</p>';
            return;
        }

        this.historyList.innerHTML = history.map(entry => {
            const date = new Date(entry.uploaded_at);
            const dateStr = date.toLocaleDateString('tr-TR') + ' ' + date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

            return `
                <div class="history-item">
                    <span class="history-date">${dateStr}</span>
                    <div class="history-info">
                        <span>${entry.file_name}</span>
                        <span class="history-badge">${entry.total_rows} satır</span>
                        <span>+${entry.inserted} yeni</span>
                        <span>↻${entry.updated} güncellendi</span>
                        ${entry.missing_marked > 0 ? `<span style="color: var(--accent-amber);">⚠ ${entry.missing_marked} arşiv</span>` : ''}
                    </div>
                </div>
            `;
        }).join('');
    }
}
