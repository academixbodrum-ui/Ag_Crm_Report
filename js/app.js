/**
 * app.js — Main Application Controller
 * Initializes DB, managers, handles navigation
 */

let uploadManager;
let trackingManager;
let dashboardManager;
let statusRulesManager;

// ========== NAVIGATION ==========

function navigateTo(page) {
    // Hide all pages
    document.querySelectorAll('.page').forEach(p => p.style.display = 'none');

    // Remove active class from nav
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    // Show target page
    const targetPage = document.getElementById(`page-${page}`);
    if (targetPage) {
        targetPage.style.display = 'block';
    }

    // Set active nav
    const targetNav = document.getElementById(`nav-${page}`);
    if (targetNav) {
        targetNav.classList.add('active');
    }

    // Load data for the page
    if (page === 'tracking') {
        trackingManager.loadData();
    } else if (page.startsWith('dash-')) {
        // Special case: all dash sub-pages use the dashboard Manager but show different sections
        const pageTitle = document.querySelector(`#page-dashboard H1`);
        if (pageTitle) {
            if (page === 'dash-general') pageTitle.textContent = 'Genel İstatistikler';
            else if (page === 'dash-counsellor') pageTitle.textContent = 'Counsellor İstatistikleri';
            else if (page === 'dash-school') pageTitle.textContent = 'School İstatistikleri';
            else if (page === 'dash-bonus') pageTitle.textContent = 'Genel Prim Takip';
        }
        
        // Show dashboard page for all dash-* views
        const dashPage = document.getElementById('page-dashboard');
        if (dashPage) dashPage.style.display = 'block';
        dashboardManager.render(page);
    } else if (page === 'upload') {
        uploadManager.loadHistory();
    } else if (page === 'system' || page === 'currency') {
        if (window.systemManager) {
            // Show system page for both
            const systemPage = document.getElementById('page-system');
            if (systemPage) systemPage.style.display = 'block';
            
            // Set active nav manually for currency since data-page might differ
            if (page === 'currency') {
                document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
                const navCur = document.getElementById('nav-currency');
                if (navCur) navCur.classList.add('active');
                switchSystemTab('tab-currency');
            } else {
                switchSystemTab('tab-programs');
            }
            
            systemManager.loadData();
        } else {
            console.error('systemManager not initialized');
        }
    } else if (page === 'status-rules') {
        if (statusRulesManager) {
            statusRulesManager.loadData();
        }
    }
}

// ========== SIDEBAR STATUS ==========

async function updateSidebarStatus() {
    const count = await crmDB.getRowCount();
    const statusEl = document.getElementById('upload-status');

    if (count > 0) {
        statusEl.classList.add('has-data');
        statusEl.querySelector('span').textContent = `${count.toLocaleString('tr-TR')} kayıt`;
    } else {
        statusEl.classList.remove('has-data');
        statusEl.querySelector('span').textContent = 'Veri yüklenmedi';
    }
}

// ========== TOAST ==========

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const icons = {
        success: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>',
        error: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
        warning: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
        info: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
    };

    toast.innerHTML = `${icons[type] || icons.info}<span>${message}</span>`;
    container.appendChild(toast);

    // Auto-remove after 4 seconds
    setTimeout(() => {
        toast.classList.add('toast-exit');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// ========== MODAL CLOSE ==========

// ========== SIDEBAR TOGGLE ==========

function initSidebarToggle() {
    const toggleBtn = document.getElementById('sidebar-toggle');
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('main-content');

    if (!toggleBtn) return;

    // Load state
    const isCollapsed = localStorage.getItem('sidebar-collapsed') === 'true';
    if (isCollapsed) {
        sidebar.classList.add('collapsed');
        mainContent.classList.add('sidebar-collapsed');
    }

    toggleBtn.addEventListener('click', () => {
        const collapsed = sidebar.classList.toggle('collapsed');
        mainContent.classList.toggle('sidebar-collapsed');
        localStorage.setItem('sidebar-collapsed', collapsed);
    });
}

function initModal() {
    const modal = document.getElementById('detail-modal');
    const closeBtn = document.getElementById('modal-close');

    closeBtn.addEventListener('click', () => {
        modal.style.display = 'none';
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });

    // ESC key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.style.display === 'flex') {
            modal.style.display = 'none';
        }
    });
}

// ========== STATUS MIGRATION ==========

async function migrateOldStatuses() {
    const OLD_TO_NEW = {
        'New': 'Process',
        'Contacted': 'Process',
        'In Progress': 'Process',
        'On Hold': 'Process'
    };

    try {
        for (const [oldStatus, newStatus] of Object.entries(OLD_TO_NEW)) {
            try {
                await supabase.update('crm_tracking',
                    { status: newStatus },
                    `status=eq.${encodeURIComponent(oldStatus)}`
                );
            } catch (e) {
                // Might fail if no matching rows, that's okay
                console.log(`Migration ${oldStatus} → ${newStatus}:`, e.message || 'done');
            }
        }
        console.log('Status migration completed.');
    } catch (e) {
        console.warn('Status migration skipped:', e);
    }
}

// ========== INIT ==========

async function initApp() {
    try {
        // Open database
        await crmDB.open();
        console.log('Database opened successfully');

        // Migrate old status values to new ones
        await migrateOldStatuses();

        // Initialize managers
        uploadManager = new UploadManager();
        trackingManager = new TrackingManager();
        dashboardManager = new DashboardManager();
        window.systemManager = new SystemManager(); 
        statusRulesManager = new StatusRulesManager(); 
        window.statusRulesManager = statusRulesManager;
        
        // Initial load of classifications for filters
        try {
            const [classifications, visualRules] = await Promise.all([
                crmDB.supabase.select('program_types'),
                crmDB.supabase.select('visual_rules')
            ]);
            
            const map = {};
            (classifications || []).forEach(c => map[c.program_name] = c.program_type);
            window.programTypeMap = map;

            window.visualRules = visualRules || [];
        } catch (e) {
            console.warn('System settings could not be loaded:', e);
            window.programTypeMap = {};
            window.statusRules = {};
            window.visualRules = [];
        }

        // Bind navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const page = item.getAttribute('data-page');
                navigateTo(page);
            });
        });

        // Init sidebar toggle
        initSidebarToggle();

        // Init modal
        initModal();

        // Update sidebar status
        await updateSidebarStatus();

        // Check if we have data — default to tracking; otherwise upload
        const count = await crmDB.getRowCount();
        if (count > 0) {
            navigateTo('tracking');
        } else {
            navigateTo('upload');
        }

    } catch (error) {
        console.error('App initialization error:', error);
        showToast('Uygulama başlatılırken hata oluştu: ' + error.message, 'error');
    }
}

// Boot
document.addEventListener('DOMContentLoaded', initApp);
