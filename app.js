// ==================== ASG LIVE LEADS — APP.JS ====================
// SaaS Dashboard · Production Ready · 2026
// ============================================================

// Prevent duplicate execution
// Maps callback — MUST be defined immediately for Google Maps SDK
window.onMapsLoaded = function () {
  if (window.google?.maps) {
    if (typeof geocoder === 'undefined') {
      geocoder = new google.maps.Geocoder();
    }
    console.log('✅ Google Maps loaded');
    if (window.state?.currentPage === 'map' && typeof initMapView === 'function') {
      initMapView();
    }
  }
};

if (window.__asgAppLoaded) {
    console.warn('⚠️ app.js already loaded, skipping duplicate load');
} else {
    window.__asgAppLoaded = true;

    // ==================== CONFIGURATION ====================
    const MAPS_API_KEY = 'AIzaSyCoxDjRMuDT6NO661xzrgYvvnjo7P6isS8';

    // ==================== GOOGLE SHEETS OAUTH CONFIG ====================
    // Replace the Client ID below with yours from Google Cloud Console
    // OAuth client type: Web application
    // Authorised JS origin: https://asg-leads-2026.web.app
    const SHEETS_OAUTH_CLIENT_ID = '685269806752-qip9oh4413gd0r4p4emkis3dpb5lanjh.apps.googleusercontent.com';
    const SHEETS_SCOPES = 'https://www.googleapis.com/auth/spreadsheets';
    let _sheetsAccessToken = null;
    let _sheetsTokenClient = null;
    let _sheetsTokenExpiry = 0;

    // ==================== STATE ====================
    let googleMap = null;
    let mapMarkers = [];
    let myMarkerClusterer = null;
    let knockModeActive = false;
    let knockModeListener = null;
    let geocoder = null;
    let db = null;
    let loadingCount = 0;

    const state = {
        currentUser: null,
        isAdmin: false,
        darkMode: false,
        currentPage: 'dashboard',
        currentTab: 'leads',
        leads: [],
        reps: [
            { id: 1, name: 'Garry', email: 'garry@asg.com', role: 'admin', status: 'available', statusMessage: '', active: true, targets: { dailyDQ: 10, weeklyBookings: 5 } },
            { id: 2, name: 'Blake', email: 'blake@asg.com', role: 'rep', status: 'available', statusMessage: '', active: true, targets: { dailyDQ: 10, weeklyBookings: 3 } },
            { id: 3, name: 'Mike', email: 'mike@asg.com', role: 'rep', status: 'training', statusMessage: '', active: true, targets: { dailyDQ: 10, weeklyBookings: 3 } },
            { id: 4, name: 'Josh', email: 'josh@asg.com', role: 'rep', status: 'appointment', statusMessage: '', active: true, targets: { dailyDQ: 10, weeklyBookings: 3 } },
            { id: 5, name: 'Kai', email: 'kai@asg.com', role: 'rep', status: 'available', statusMessage: '', active: true, targets: { dailyDQ: 10, weeklyBookings: 3 } },
            { id: 6, name: 'Vinu', email: 'vinu@asg.com', role: 'rep', status: 'available', statusMessage: '', active: true, targets: { dailyDQ: 10, weeklyBookings: 3 } },
            { id: 7, name: 'Lewis', email: 'lewis@asg.com', role: 'rep', status: 'available', statusMessage: '', active: true, targets: { dailyDQ: 10, weeklyBookings: 3 } },
            { id: 8, name: 'Joe', email: 'joe@asg.com', role: 'rep', status: 'available', statusMessage: '', active: true, targets: { dailyDQ: 15, weeklyBookings: 3 } }
        ],
        drapsEntries: [],
        activities: [],
        auditLog: [],
        doorKnocks: [],
        callResults: [
            { id: 'booked', label: 'Booked', icon: '✅', color: 'green', status: 'booked' },
            { id: 'no-answer', label: 'No Answer', icon: '📞', color: 'red', status: 'dq' },
            { id: 'not-interested', label: 'Not Interested', icon: '❌', color: 'red', status: 'not-interested' },
            { id: 'wrong-number', label: 'Wrong Number', icon: '😶', color: 'gray', status: 'wrong-number' },
            { id: 'callback', label: 'Call Back', icon: '📅', color: 'yellow', status: 'revisit' },
            { id: 'callback-today', label: 'Call Back Today', icon: '📅', color: 'blue', status: 'revisit' },
            { id: 'back-to-dq', label: 'Back to DQ', icon: '🔙', color: 'gray', status: 'dq' }
        ],
        settings: {
            mapsApiKey: MAPS_API_KEY,
            sheetsUrl: 'https://docs.google.com/spreadsheets/d/15bh3bkAMpwIhi3MJ2-INA8njG3spgUW8CGVb_ckJ26I/edit',
            sheetsTabName: 'LEADS',
            globalTargets: { dailyDQ: 100, weeklyBookings: 50 },
            adminPassword: '0000',
            commission: {
                type: 'fixed',
                defaultDealValue: 1000,
                dqRate: 50,
                callRate: 100,
                bonus: 25,
                period: 'weekly',
                tiers: [
                    { min: 1, max: 5, rate: 100 },
                    { min: 6, max: 10, rate: 150 },
                    { min: 11, max: 999, rate: 200 }
                ]
            }
        },
        pendingCallLeadId: null,
        mapStatusFilters: ['dq'],
        pendingKnockLatLng: null
    };

    window.state = state;

    // ==================== LOADING INDICATOR ====================
    function showLoading() {
        loadingCount++;
        if (!document.getElementById('globalLoader')) {
            const loader = document.createElement('div');
            loader.id = 'globalLoader';
            loader.innerHTML = '<div class="spinner"></div>';
            document.body.appendChild(loader);
        }
    }

    function hideLoading() {
        loadingCount--;
        if (loadingCount <= 0) {
            const loader = document.getElementById('globalLoader');
            if (loader) loader.remove();
            loadingCount = 0;
        }
    }

    // ==================== FIRESTORE FUNCTIONS ====================

    function saveLeads() {
    if (_firestoresyncing) return; // don't write back during a sync
    localStorage.setItem('asgLeads', JSON.stringify(state.leads));
    if (db) {
        saveLeadsBatch(state.leads).catch((err) => {
            console.error('Error saving leads batch:', err);
        });
    }
}


    async function saveLeadToFirestore(lead) {
    try {
        if (db) {
            if (!lead.id) {
                const phone = (lead.phone || lead.contact_number || '').toString().replace(/\D/g, '');
                lead.id = phone ? `lead_${phone}` : `lead_${Date.now()}`;
            }
            await db.collection('leads').doc(lead.id.toString()).set(lead);
            console.log('✅ Lead saved to Firestore:', lead.id);
        }
    } catch (e) {
        console.error('❌ Error saving lead:', e);
        showToast('Sync failed', 'error');
    }
}

 async function saveLeadsBatch(leads) {
    if (!db || !leads.length) return;
    showLoading();
    const BATCH_SIZE = 500;
    const batches = [];
    try {
        for (let i = 0; i < leads.length; i += BATCH_SIZE) {
            const batch = db.batch();
            const chunk = leads.slice(i, i + BATCH_SIZE);
            chunk.forEach((lead) => {
                // Generate stable ID if missing — phone + name hash
                if (!lead.id) {
                    const phone = (lead.phone || lead.contact_number || '').toString().replace(/\D/g, '');
                    const name  = (lead.name || lead.lead_name || '').toString().trim().toLowerCase().replace(/\s+/g, '_');
                    lead.id = phone ? `lead_${phone}` : `lead_${name}_${Date.now()}`;
                }
                const docRef = db.collection('leads').doc(lead.id.toString());
                batch.set(docRef, lead, { merge: true });
            });
            batches.push(batch.commit());
        }
        await Promise.all(batches);
        console.log(`✅ Saved ${leads.length} leads to Firestore`);
    } catch (error) {
        console.error('Batch save failed:', error);
        showToast('⚠️ Cloud sync failed - saved locally only', 'warning');
    } finally {
        hideLoading();
    }
}

 let _firestoresyncing = false;

function listenToLeads() {
    if (!db) return;
    db.collection('leads').onSnapshot(
        (snapshot) => {
            _firestoresyncing = true; // block saveLeads during sync
            state.leads = [];
            snapshot.forEach((doc) => {
                state.leads.push({ id: doc.id, ...doc.data() });
            });
            renderAll();
            console.log('🔄 Leads synced from Firestore:', state.leads.length);
            _firestoresyncing = false;
        },
        (error) => {
            console.error('Error listening to leads:', error);
            _firestoresyncing = false;
        }
    );
}

async function updateLeadInFirestore(lead) {
    try {
        if (db && lead.id) {
            await db.collection('leads').doc(lead.id.toString()).update(lead);
        }
    } catch (e) {
        console.error('Error updating lead:', e);
    }
}
    // ==================== SAMPLE DATA ====================
    function initSampleData() {
        state.leads = [
            {
                id: 1,
                leadDate: new Date().toISOString().split('T')[0],
                name: 'Robert Brown',
                phone: '0412 345 678',
                houseNum: '42',
                street: 'King Street',
                suburb: 'Melbourne',
                postcode: '3000',
                address: '42 King Street, Melbourne 3000',
                ownership: 'Owner',
                super: '$0-75k',
                status: 'dq',
                dqRep: 2,
                callingRep: null,
                lastCall: new Date().toISOString(),
                result: 'no-answer',
                timely: false,
                timelyAdded: false,
                notes: 'Interested in solar',
                lat: -37.8136,
                lng: 144.9631,
                dealValue: null,
                bookingDate: null,
                bookingTime: null,
                commissionBreakdown: null,
                callHistory: [{ time: new Date().toISOString(), rep: 'Blake', result: 'no-answer', notes: 'No answer, left voicemail' }]
            },
            {
                id: 2,
                leadDate: new Date().toISOString().split('T')[0],
                name: 'Mary Johnson',
                phone: '0423 456 789',
                houseNum: '15',
                street: 'Queen Street',
                suburb: 'Richmond',
                postcode: '3121',
                address: '15 Queen Street, Richmond 3121',
                ownership: 'Renter',
                super: '$75k-150k',
                status: 'booked',
                dqRep: 3,
                callingRep: 2,
                lastCall: new Date().toISOString(),
                result: 'booked',
                timely: true,
                timelyAdded: true,
                bookingDate: new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0],
                bookingTime: '10:00',
                notes: 'Booked for Saturday',
                lat: -37.8183,
                lng: 144.9987,
                dealValue: 1000,
                commissionBreakdown: { dqAmount: 50, callingAmount: 100, bonusAmount: 25 },
                callHistory: [{ time: new Date().toISOString(), rep: 'Blake', result: 'booked', notes: 'Booked for 10am Saturday' }]
            }
        ];
    }

    // ==================== INITIALIZATION ====================
    document.addEventListener('DOMContentLoaded', () => {
        console.log('🚀 ASG Live Leads initializing...');

        if (typeof firebase !== 'undefined') {
            try {
                db = firebase.firestore();
                window._db = db;
                console.log('✅ Firebase Firestore initialized');
                listenToLeads(); // ← only call it here
            } catch (e) {
                console.error('Firebase initialization error:', e);
                db = null;
            }
        } else {
            console.error('❌ Firebase SDK not loaded!');
            initSampleData();
            renderAll();
        }

        // Load settings
        loadSettings();

                // Initialize Firebase
        if (typeof firebase !== 'undefined') {
            try {
                db = firebase.firestore();
                window._db = db;
                console.log('✅ Firebase Firestore initialized');
                listenToLeads(); // ← ADD THIS
            } catch (e) {
                console.error('Firebase initialization error:', e);
                db = null;
            }
        } else {
            console.error('❌ Firebase SDK not loaded!');
        }
function listenToLeads() {
    if (!db) return;
    db.collection('leads').onSnapshot(
        (snapshot) => {
            _firestoresyncing = true;
            state.leads = [];
            snapshot.forEach((doc) => {
                const raw = doc.data();
                const cleaned = {};
                Object.keys(raw).forEach(k => { cleaned[k.trim()] = raw[k]; });

                // Normalise status to app format
                if (cleaned.status) {
                    const s = cleaned.status.toLowerCase().trim();
                    const statusMap = {
                        'dq':              'dq',
                        'revisit':         'revisit',
                        'booked':          'booked',
                        'live':            'booked',
                        'no answer':       'dq',
                        'not interested':  'not-interested',
                        'wrong number':    'wrong-number',
                    };
                    cleaned.status = statusMap[s] || s;
                }

                state.leads.push({ id: doc.id, ...cleaned });
            });
            renderAll();
            console.log('🔄 Leads synced from Firestore:', state.leads.length);
            _firestoresyncing = false;
        },
        (error) => {
            console.error('Error listening to leads:', error);
            _firestoresyncing = false;
        }
    );
}

        // Load saved reps
        const savedReps = localStorage.getItem('asgReps');
        if (savedReps) {
            try {
                const parsed = JSON.parse(savedReps);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    state.reps = parsed;
                    console.log('✅ Loaded custom reps from localStorage:', parsed.length);
                }
            } catch (e) {
                console.error('Error parsing saved reps:', e);
            }
        }

        // Populate UI selects
        try {
            populateRepSelects();
            populateCallResults();
            console.log('✅ UI selects populated');
        } catch (e) {
            console.error('Error populating selects:', e);
        }

        // Set default dates
        const dateInput = document.getElementById('addLeadDate');
        if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
        updateDashboardDate();
        setDefaultDrapsDate();

        // Load dark mode preference
        if (localStorage.getItem('darkMode') === 'true') {
            state.darkMode = true;
            document.body.classList.add('dark-mode');
        }

        // Initialize geocoder if Maps is loaded
        if (window.google && window.google.maps) {
            geocoder = new google.maps.Geocoder();
            console.log('✅ Google Maps geocoder initialized');
        }

        // Escape key closes modals
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document.querySelectorAll('.modal-overlay.visible').forEach((m) => m.classList.remove('visible'));
                document.getElementById('leadSidebar')?.classList.remove('visible');
            }
        });

        // Close modal on overlay click
        document.querySelectorAll('.modal-overlay').forEach((overlay) => {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) overlay.classList.remove('visible');
            });
        });

        // Load nav collapsed state
        if (localStorage.getItem('navCollapsed') === 'true') {
            document.getElementById('appScreen').classList.add('nav-collapsed');
        }

        console.log('✅ App initialization complete');
    });

    // ==================== SETTINGS ====================
    function loadSettings() {
        const saved = localStorage.getItem('asgSettings');
        if (saved) {
            const parsed = JSON.parse(saved);
            state.settings = { ...state.settings, ...parsed };
            if (parsed.commission) {
                state.settings.commission = { ...state.settings.commission, ...parsed.commission };
            }
        }

        const el = (id) => document.getElementById(id);
        if (el('mapsApiKey')) el('mapsApiKey').value = state.settings.mapsApiKey || '';
        if (el('sheetsUrl')) el('sheetsUrl').value = state.settings.sheetsUrl || '';
        if (el('sheetsTabName')) el('sheetsTabName').value = state.settings.sheetsTabName || 'LEADS';
        if (el('globalDailyDQ')) el('globalDailyDQ').value = state.settings.globalTargets?.dailyDQ || 100;
        if (el('globalWeeklyBookings')) el('globalWeeklyBookings').value = state.settings.globalTargets?.weeklyBookings || 50;
        if (el('commType')) el('commType').value = state.settings.commission?.type || 'fixed';
        if (el('commDefaultDeal')) el('commDefaultDeal').value = state.settings.commission?.defaultDealValue || 1000;
        if (el('commDQRate')) el('commDQRate').value = state.settings.commission?.dqRate || 50;
        if (el('commCallRate')) el('commCallRate').value = state.settings.commission?.callRate || 100;
        if (el('commBonus')) el('commBonus').value = state.settings.commission?.bonus || 25;
        if (el('commPeriodConfig')) el('commPeriodConfig').value = state.settings.commission?.period || 'weekly';
    }

    function saveSettings() {
        localStorage.setItem('asgSettings', JSON.stringify(state.settings));
    }

    // ==================== AUTHENTICATION ====================
    function toggleAdminLogin() {
        document.getElementById('adminPasswordSection').classList.toggle('visible');
    }

    function enterApp() {
        const selectElement = document.getElementById('repSelect');
        if (!selectElement) {
            showToast('Login UI not ready', 'error');
            return;
        }
        const repId = selectElement.value;
        if (!repId) {
            showToast('Please select your name', 'error');
            return;
        }
        const foundRep = state.reps.find((r) => r.id == repId);
        if (!foundRep) {
            showToast('User not found', 'error');
            return;
        }
        if (foundRep.active === false) {
            showToast('User is inactive', 'error');
            return;
        }
        state.currentUser = foundRep;
        state.isAdmin = state.currentUser.role === 'admin';
        launchApp();
    }

    function enterAdmin() {
        const password = document.getElementById('adminPasswordInput').value;
        if (password === state.settings.adminPassword) {
            state.currentUser = { id: 0, name: 'Admin', role: 'admin', email: 'admin@asg.com' };
            state.isAdmin = true;
            launchApp();
        } else {
            showToast('Incorrect password', 'error');
        }
    }

    function launchApp() {
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('appScreen').classList.add('active');
        document.getElementById('navUserName').textContent = state.currentUser.name;
        document.getElementById('navUserRole').textContent = state.isAdmin ? 'Administrator' : 'Sales Rep';
        document.getElementById('navAvatar').textContent = state.currentUser.name.substring(0, 2).toUpperCase();
        
        if (state.isAdmin) {
            document.getElementById('adminNavLink').style.display = 'flex';
            document.getElementById('commRepFilterWrapper').style.display = 'flex';
        }
        
        addAuditLog(state.currentUser.name, 'login', 'User logged in');
        showToast(`Welcome back, ${state.currentUser.name}!`, 'success');
        renderAll();
        updateTicker();
    }

    function logout() {
        addAuditLog(state.currentUser?.name || 'Unknown', 'logout', 'User logged out');
        state.currentUser = null;
        state.isAdmin = false;
        state.currentPage = 'dashboard';
        state.currentTab = 'leads';
        document.getElementById('appScreen').classList.remove('active');
        document.getElementById('loginScreen').style.display = 'flex';
        document.getElementById('adminNavLink').style.display = 'none';
        document.getElementById('adminPasswordSection').classList.remove('visible');
        document.getElementById('adminPasswordInput').value = '';
        document.getElementById('repSelect').value = '';
        document.getElementById('commRepFilterWrapper').style.display = 'none';
    }

    // ==================== NAVIGATION ====================
    function showPage(page) {
        state.currentPage = page;
        document.querySelectorAll('.nav-link').forEach((l) => l.classList.toggle('active', l.dataset.page === page));
        document.querySelectorAll('.page-view').forEach((v) => v.classList.remove('active'));
        const el = document.getElementById(`page-${page}`);
        if (el) el.classList.add('active');
        
        // Update topbar title
        const titles = {
            dashboard: 'Dashboard',
            leads: 'Leads',
            import: 'Import Data',
            draps: 'DRAPS',
            map: 'Lead Map',
            commissions: 'Commissions',
            admin: 'Admin Portal'
        };
        document.getElementById('topbarTitle').textContent = titles[page] || page;
        
        if (page === 'dashboard') updateDashboard();
        if (page === 'draps') updateDrapsHistory();
        if (page === 'admin') renderAdminPage();
        if (page === 'map') initMapView();
        if (page === 'commissions') renderCommissions();
        updateTicker();
    }

    function switchTab(tab) {
        state.currentTab = tab;
        document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
        renderLeadsTable();
    }

    function showAdminSection(section, btn) {
        document.querySelectorAll('.admin-nav-btn').forEach((b) => b.classList.remove('active'));
        if (btn) btn.classList.add('active');
        document.querySelectorAll('.admin-section').forEach((s) => s.classList.remove('active'));
        document.getElementById(`admin-${section}`)?.classList.add('active');
        
        if (section === 'reps') renderAdminPage();
        if (section === 'callResults') renderCallResults();
        if (section === 'targets') renderTargets();
        if (section === 'audit') renderAuditLog();
        if (section === 'commissionConfig') {
            const t = document.getElementById('commType');
            if (t) document.getElementById('tieredConfig').style.display = t.value === 'tiered' ? 'block' : 'none';
        }
    }

    function toggleDarkMode() {
        state.darkMode = !state.darkMode;
        document.body.classList.toggle('dark-mode', state.darkMode);
        localStorage.setItem('darkMode', state.darkMode);
    }

    function toggleNav() {
        const app = document.getElementById('appScreen');
        app.classList.toggle('nav-collapsed');
        localStorage.setItem('navCollapsed', app.classList.contains('nav-collapsed'));
    }

    // ==================== HELPERS ====================
    function updateTicker() {
        const inner = document.getElementById('tickerInner');
        if (!inner) return;
        const items = state.activities.slice(0, 8);
        if (!items.length) {
            inner.innerHTML = '<span class="ticker-item">No recent activity</span>';
            return;
        }
        const html = [...items, ...items].map((a) => 
            `<span class="ticker-item"><span class="ticker-dot"></span><strong>${a.rep || '—'}</strong> ${a.action} ${a.target ? '· ' + a.target : ''}</span>`
        ).join('');
        inner.innerHTML = html;
    }

    function buildAddress(lead) {
        return `${lead.houseNum || ''} ${lead.street || ''}, ${lead.suburb || ''} ${lead.postcode || ''}`.trim().replace(/\s+/g, ' ');
    }

    function getRep(id) {
        return state.reps.find((r) => r.id == id);
    }

    function getRepName(id) {
        return getRep(id)?.name || '—';
    }

    function formatTime(ts) {
        if (!ts) return '—';
        const d = new Date(ts);
        return d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short' }) + ' ' +
               d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
    }

    function formatDate(ts) {
        if (!ts) return '—';
        return new Date(ts).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    function getLeadAge(lead) {
        if (!lead.lastCall) return { label: 'Never called', cls: 'fresh' };
        const hrs = (Date.now() - new Date(lead.lastCall)) / 3600000;
        if (hrs < 24) return { label: 'Today', cls: 'fresh' };
        if (hrs < 72) return { label: `${Math.floor(hrs / 24)}d ago`, cls: 'aging' };
        return { label: `${Math.floor(hrs / 24)}d ago`, cls: 'stale' };
    }

    function nextId(arr) {
        return arr.length ? Math.max(...arr.map((x) => x.id)) + 1 : 1;
    }

    function sanitizeInput(str) {
        if (!str) return str;
        return str.replace(/<[^>]*>/g, '').trim();
    }

    function sanitizePhone(phone) {
        if (!phone) return '';
        return phone.replace(/[^\d\s+\()-]/g, '').trim();
    }

    function sanitizeEmail(email) {
        if (!email) return '';
        return email.trim().toLowerCase();
    }

    function closeModal(id) {
        document.getElementById(id)?.classList.remove('visible');
    }

    function openModal(id) {
        document.getElementById(id)?.classList.add('visible');
    }

    function showToast(msg, type = 'info') {
        const c = document.getElementById('toastContainer');
        const t = document.createElement('div');
        t.className = `toast toast-${type}`;
        t.textContent = msg;
        c.appendChild(t);
        setTimeout(() => t.remove(), 3500);
    }

    function addActivity(type, rep, action, target) {
        state.activities.unshift({
            id: nextId(state.activities),
            type,
            rep,
            action,
            target,
            time: new Date().toISOString()
        });
        if (state.activities.length > 200) state.activities.pop();
    }

    function addAuditLog(user, action, details) {
        state.auditLog.unshift({
            id: nextId(state.auditLog),
            user,
            action,
            details,
            timestamp: new Date().toISOString()
        });
        if (state.auditLog.length > 500) state.auditLog.pop();
    }

    function populateRepSelects() {
        const selects = ['repSelect', 'addLeadRep', 'drapsRep', 'filterRep', 'drapsHistoryRep', 
                        'auditFilterUser', 'mapFilterRep', 'commRepFilter', 'promptCallingRep'];
        selects.forEach((selectId) => {
            const select = document.getElementById(selectId);
            if (!select) return;
            const defaultText = selectId === 'repSelect' ? 'Choose your name...' :
                               selectId === 'promptCallingRep' ? 'Same as DQ Rep' : 'All Reps';
            select.innerHTML = `<option value="">${defaultText}</option>`;
            const activeReps = state.reps.filter((r) => r.active !== false);
            activeReps.forEach((rep) => {
                const opt = document.createElement('option');
                opt.value = rep.id;
                opt.textContent = rep.name;
                select.appendChild(opt);
            });
        });

        const suburbSelects = ['filterSuburb', 'mapFilterSuburb'];
        suburbSelects.forEach((selectId) => {
            const select = document.getElementById(selectId);
            if (!select) return;
            const suburbs = [...new Set(state.leads.map((l) => l.suburb).filter(Boolean))].sort();
            select.innerHTML = '<option value="">All Suburbs</option>';
            suburbs.forEach((s) => {
                const opt = document.createElement('option');
                opt.value = s;
                opt.textContent = s;
                select.appendChild(opt);
            });
        });
    }

    function populateCallResults() {
        const select = document.getElementById('promptCallResult');
        if (!select) return;
        select.innerHTML = '<option value="">Select result...</option>';
        state.callResults.forEach((result) => {
            const opt = document.createElement('option');
            opt.value = result.id;
            opt.textContent = `${result.icon} ${result.label}`;
            select.appendChild(opt);
        });
    }

    function setDefaultDrapsDate() {
        const d = document.getElementById('drapsDate');
        if (d) d.value = new Date().toISOString().split('T')[0];
    }

    function updateDashboardDate() {
        const el = document.getElementById('dashboardDate');
        if (el) el.textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    }

    // ==================== CALL MODAL ====================
    function openCallModal(leadId) {
        const lead = state.leads.find((l) => l.id === leadId);
        if (!lead) {
            showToast('Lead not found', 'error');
            return;
        }
        window._currentCallLeadId = leadId;
        const modal = document.getElementById('callResultModal');
        if (!modal) {
            console.error('Call result modal not found');
            return;
        }
        document.getElementById('promptCallResult').value = '';
        document.getElementById('promptNotes').value = '';
        document.getElementById('promptCallbackDate').style.display = 'none';
        document.getElementById('promptCallbackTime').style.display = 'none';
        document.getElementById('bookedFields').style.display = 'none';
        document.getElementById('timelyCheckboxDiv').style.display = 'none';
        
        const timelyCheckbox = document.getElementById('promptTimely');
        const timelyCheckboxGeneral = document.getElementById('promptTimelyGeneral');
        if (timelyCheckbox) timelyCheckbox.checked = false;
        if (timelyCheckboxGeneral) timelyCheckboxGeneral.checked = false;
        
        const dealValueEl = document.getElementById('promptDealValue');
        if (dealValueEl) dealValueEl.value = '';
        
        modal.classList.add('visible');
    }

    function handleCallResultChange() {
        const result = document.getElementById('promptCallResult').value;
        document.getElementById('callbackDateTime').style.display = 'none';
        document.getElementById('bookedFields').style.display = 'none';
        document.getElementById('timelyCheckboxDiv').style.display = 'none';
        
        if (result === 'callback' || result === 'callback-today') {
            document.getElementById('callbackDateTime').style.display = 'block';
        } else if (result === 'booked') {
            document.getElementById('bookedFields').style.display = 'block';
            document.getElementById('timelyCheckboxDiv').style.display = 'block';
        } else if (result === 'no-answer' || result === 'wrong-number') {
            document.getElementById('timelyCheckboxDiv').style.display = 'block';
        }
    }

    function confirmCallResult() {
        const leadId = window._currentCallLeadId;
        if (!leadId) {
            showToast('No lead selected', 'error');
            return;
        }
        const lead = state.leads.find((l) => l.id === leadId);
        if (!lead) {
            showToast('Lead not found', 'error');
            return;
        }
        const result = document.getElementById('promptCallResult').value;
        if (!result) {
            showToast('Please select a call result', 'error');
            return;
        }
        const resultObj = state.callResults.find((r) => r.id === result);
        if (resultObj) lead.status = resultObj.status;
        
        if (result === 'booked') {
            const bookDate = document.getElementById('promptBookedDate').value;
            const bookTime = document.getElementById('promptBookedTime').value;
            if (!bookDate || !bookTime) {
                showToast('Please enter appointment date and time', 'error');
                return;
            }
            lead.status = 'booked';
            lead.appointmentDate = bookDate;
            lead.appointmentTime = bookTime;
            lead.dealValue = parseFloat(document.getElementById('promptDealValue').value) || 0;
            const timelyEl = document.getElementById('promptTimely');
            lead.timelyAdded = timelyEl ? timelyEl.checked : false;
            const callingRepEl = document.getElementById('promptCallingRep');
            if (callingRepEl && callingRepEl.value) lead.callingRep = callingRepEl.value;
        } else if (result === 'callback' || result === 'callback-today') {
            lead.result = result;
            const callbackDate = document.getElementById('promptCallbackDate').value;
            const callbackTime = document.getElementById('promptCallbackTime').value;
            if (callbackDate) {
                const dateTime = new Date(`${callbackDate}T${callbackTime || '09:00'}`);
                lead.callbackDate = dateTime.toISOString();
            }
        } else {
            lead.result = result;
            const timelyEl = document.getElementById('promptTimelyGeneral');
            lead.timelyAdded = timelyEl ? timelyEl.checked : false;
        }
        
        const notes = document.getElementById('promptNotes').value.trim();
        if (notes) lead.notes = (lead.notes || '') + '\n' + notes;
        lead.lastCall = new Date().toISOString();
        lead.result = result;
        if (!lead.callHistory) lead.callHistory = [];
        lead.callHistory.push({ date: new Date().toISOString(), result, notes });
        
        saveLeads();
        updateLeadInFirestore(lead);
        closeModal('callResultModal');
        renderAll();
        showToast(`✅ Call result saved: ${result}`, 'success');
    }

    // ==================== LEADS TABLE ====================
    function getFilteredLeads() {
        const search = (document.getElementById('searchInput')?.value || '').toLowerCase();
        const repFilter = document.getElementById('filterRep')?.value || '';
        const suburbFilter = document.getElementById('filterSuburb')?.value || '';
        const ownerFilter = document.getElementById('filterOwner')?.value || '';
        const timelyFilter = document.getElementById('filterTimely')?.value || '';
        
        return state.leads.filter((lead) => {
            if (state.currentTab === 'leads' && !['dq', 'revisit'].includes(lead.status)) return false;
            if (state.currentTab === 'booked' && lead.status !== 'booked') return false;
            if (state.currentTab === 'revisit' && lead.status !== 'revisit') return false;
            if (state.currentTab === 'not-interested' && lead.status !== 'not-interested') return false;
            if (state.currentTab === 'wrong-number' && lead.status !== 'wrong-number') return false;
            
            if (search && !lead.name.toLowerCase().includes(search) && 
                !lead.phone.includes(search) && 
                !(lead.address || '').toLowerCase().includes(search) && 
                !(lead.suburb || '').toLowerCase().includes(search)) return false;
            
            if (repFilter && lead.dqRep != repFilter) return false;
            if (suburbFilter && lead.suburb !== suburbFilter) return false;
            if (ownerFilter && lead.ownership !== ownerFilter) return false;
            
            if (timelyFilter === 'pending' && !(lead.status === 'booked' && !lead.timelyAdded)) return false;
            if (timelyFilter === 'done' && !(lead.status === 'booked' && lead.timelyAdded)) return false;
            
            return true;
        });
    }

    let searchDebounceTimer;
    function filterLeads() {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => renderLeadsTable(), 300);
    }

    function getResultBadge(result) {
        const cr = state.callResults.find((r) => r.id === result);
        if (!cr) return result ? `<span class="result-tag">${result}</span>` : '—';
        return `<span class="result-tag">${cr.icon} ${cr.label}</span>`;
    }

    function getStatusBadge(status) {
        const labels = { dq: 'DQ', booked: 'Booked', revisit: 'Revisit', 'not-interested': 'Not Interested', 'wrong-number': 'Wrong #' };
        const cls = { dq: 'status-dq', booked: 'status-booked', revisit: 'status-revisit', 'not-interested': 'status-not-interested', 'wrong-number': 'status-wrong-number' };
        return `<span class="status-badge ${cls[status] || ''}">${labels[status] || status}</span>`;
    }

    function renderLeadsTable() {
        const filtered = getFilteredLeads();
        const tbody = document.getElementById('leadsTableBody');
        const empty = document.getElementById('emptyStateLeads');
        
        // Update tab counts
        ['leads', 'booked', 'revisit', 'not-interested', 'wrong-number'].forEach((tab) => {
            const el = document.getElementById(`count-${tab}`);
            if (el) {
                if (tab === 'leads') {
                    el.textContent = state.leads.filter((l) => ['dq', 'revisit'].includes(l.status)).length;
                } else {
                    el.textContent = state.leads.filter((l) => l.status === tab).length;
                }
            }
        });
        
        if (!filtered.length) {
            tbody.innerHTML = '';
            empty.style.display = 'block';
            return;
        }
        
        empty.style.display = 'none';
        tbody.innerHTML = filtered.map((lead) => `
            <tr data-id="${lead.id}" class="lead-row">
                <td class="lead-name-cell">
                    <div class="lead-name-primary">${lead.name}</div>
                    <div class="lead-address-preview">${lead.suburb || '—'}</div>
                </td>
                <td>
                    <a href="tel:${lead.phone}" class="lead-phone-link">${lead.phone}</a>
                </td>
                <td><span class="rep-tag"><span class="rep-dot"></span>${getRepName(lead.dqRep)}</span></td>
                <td>${getStatusBadge(lead.status)}</td>
                <td>${lead.lastCall ? formatTime(lead.lastCall) : '<span style="color:var(--text-muted);">Never</span>'}</td>
                <td>${getResultBadge(lead.result)}</td>
                <td class="actions-cell" onclick="event.stopPropagation()">
                    <div class="row-actions">
                        <button class="btn-action-icon" onclick="event.stopPropagation(); quickEditLead(${lead.id})" title="Quick Edit">✏️</button>
                        <button class="btn-action-icon" onclick="event.stopPropagation(); openCallModal(${lead.id})" title="Log Call">📞</button>
                        <button class="btn-action-icon" onclick="event.stopPropagation(); showLeadSidebar(${lead.id})" title="View Details">👁️</button>
                    </div>
                </td>
            </tr>
        `).join('');

        // Row click handlers - click anywhere on row to open sidebar
        document.querySelectorAll('.lead-row').forEach((row) => {
            row.addEventListener('click', (e) => {
                if (!e.target.closest('button') && !e.target.closest('a')) {
                    showLeadSidebar(parseInt(row.dataset.id));
                }
            });
        });
    }

    // ==================== SIDEBAR ====================
    // ==================== LEAD PROFILE PANEL ====================

    let _currentProfileId = null;
    let _currentProfileTab = 'details';

    function showLeadSidebar(id) { showLeadProfile(id); }

    function showLeadProfile(id) {
        const lead = state.leads.find(l => l.id === id);
        if (!lead) return;
        _currentProfileId = id;
        _currentProfileTab = 'details';
        const backdrop = document.getElementById('leadSidebarBackdrop');
        if (backdrop) backdrop.classList.add('visible');
        renderProfileHeader(lead);
        const tabs = document.getElementById('profileTabs');
        const footer = document.getElementById('profileFooter');
        if (tabs) tabs.style.display = 'flex';
        if (footer) footer.style.display = 'flex';
        document.querySelectorAll('.profile-tab').forEach((t, i) => t.classList.toggle('active', i === 0));
        renderProfileDetails(lead);
        document.getElementById('leadSidebar').classList.add('visible');
    }

    function renderProfileHeader(lead) {
        const el = document.getElementById('profileHeader');
        if (!el) return;
        const initials = (lead.name || '?').split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
        el.innerHTML = `
            <div class="profile-header">
                <div class="profile-header-top">
                    <div class="profile-avatar">${initials}</div>
                    <div class="profile-name-block">
                        <div class="profile-name">${lead.name || 'Unknown'}</div>
                        <div class="profile-phone"><a href="tel:${lead.phone}">${lead.phone || 'No phone'}</a></div>
                    </div>
                    <button class="profile-close" onclick="closeSidebar()">✕</button>
                </div>
                <div class="profile-meta">
                    ${getStatusBadge(lead.status)}
                    ${lead.suburb ? `<span class="profile-meta-chip">📍 ${lead.suburb}</span>` : ''}
                    ${lead.dqRep ? `<span class="profile-meta-chip">👤 ${getRepName(lead.dqRep)}</span>` : ''}
                    ${lead.lastCall ? `<span class="profile-meta-chip">📞 ${formatTime(lead.lastCall)}</span>` : ''}
                </div>
            </div>`;
    }

    function renderProfileDetails(lead) {
        const body = document.getElementById('profileBody');
        if (!body) return;
        const repOptions = (state.reps || []).map(r =>
            `<option value="${r.id}" ${lead.dqRep == r.id ? 'selected' : ''}>${r.name}</option>`
        ).join('');
        body.innerHTML = `
            <div class="profile-section">
                <div class="profile-section-title">📇 Contact Info</div>
                <div class="profile-fields">
                    <div class="profile-field">
                        <label>Full Name</label>
                        <input id="pf_name" value="${lead.name || ''}" placeholder="Full name" onclick="this.classList.add('editing')" onblur="this.classList.remove('editing')">
                        <div class="inline-edit-hint">Click to edit</div>
                    </div>
                    <div class="profile-field">
                        <label>Phone</label>
                        <input id="pf_phone" value="${lead.phone || ''}" placeholder="Phone number" onclick="this.classList.add('editing')" onblur="this.classList.remove('editing')">
                    </div>
                    <div class="profile-field full-width">
                        <label>Address</label>
                        <input id="pf_address" value="${lead.address || buildAddress(lead)}" placeholder="Full address" onclick="this.classList.add('editing')" onblur="this.classList.remove('editing')">
                    </div>
                    <div class="profile-field">
                        <label>Suburb</label>
                        <input id="pf_suburb" value="${lead.suburb || ''}" placeholder="Suburb" onclick="this.classList.add('editing')" onblur="this.classList.remove('editing')">
                    </div>
                    <div class="profile-field">
                        <label>State</label>
                        <input id="pf_state" value="${lead.state || ''}" placeholder="State" onclick="this.classList.add('editing')" onblur="this.classList.remove('editing')">
                    </div>
                    <div class="profile-field">
                        <label>Postcode</label>
                        <input id="pf_postcode" value="${lead.postcode || ''}" placeholder="Postcode" onclick="this.classList.add('editing')" onblur="this.classList.remove('editing')">
                    </div>
                    <div class="profile-field">
                        <label>Lead Date</label>
                        <input id="pf_leadDate" type="date" value="${lead.leadDate || ''}" onclick="this.classList.add('editing')" onblur="this.classList.remove('editing')">
                    </div>
                </div>
            </div>
            <div class="profile-section">
                <div class="profile-section-title">📊 Lead Info</div>
                <div class="profile-fields">
                    <div class="profile-field">
                        <label>Status</label>
                        <select id="pf_status" onclick="this.classList.add('editing')" onblur="this.classList.remove('editing')">
                            <option value="dq" ${lead.status==='dq'?'selected':''}>🔵 DQ</option>
                            <option value="booked" ${lead.status==='booked'?'selected':''}>✅ Booked</option>
                            <option value="revisit" ${lead.status==='revisit'?'selected':''}>📅 Revisit</option>
                            <option value="not-interested" ${lead.status==='not-interested'?'selected':''}>❌ Not Interested</option>
                            <option value="wrong-number" ${lead.status==='wrong-number'?'selected':''}>😶 Wrong #</option>
                        </select>
                    </div>
                    <div class="profile-field">
                        <label>Ownership</label>
                        <select id="pf_ownership" onclick="this.classList.add('editing')" onblur="this.classList.remove('editing')">
                            <option value="" ${!lead.ownership?'selected':''}>Unknown</option>
                            <option value="owner" ${lead.ownership==='owner'?'selected':''}>🏠 Owner</option>
                            <option value="renter" ${lead.ownership==='renter'?'selected':''}>🏡 Renter</option>
                        </select>
                    </div>
                    <div class="profile-field">
                        <label>Superannuation</label>
                        <input id="pf_super" value="${lead.super || ''}" placeholder="Super fund / amount" onclick="this.classList.add('editing')" onblur="this.classList.remove('editing')">
                    </div>
                    <div class="profile-field">
                        <label>DQ Rep</label>
                        <select id="pf_dqRep" onclick="this.classList.add('editing')" onblur="this.classList.remove('editing')">${repOptions}</select>
                    </div>
                    <div class="profile-field full-width">
                        <label>Notes</label>
                        <textarea id="pf_notes" placeholder="Notes about this lead..." onclick="this.classList.add('editing')" onblur="this.classList.remove('editing')">${lead.notes || ''}</textarea>
                    </div>
                </div>
            </div>`;
    }

    function renderProfileLog(lead) {
        const body = document.getElementById('profileBody');
        if (!body) return;
        const resultOptions = (state.callResults || []).map(r =>
            `<option value="${r.id}">${r.icon} ${r.label}</option>`
        ).join('');
        const now = new Date().toISOString().slice(0,16);
        body.innerHTML = `
            <div class="call-log-form">
                <div class="profile-section-title" style="margin-bottom:14px;">Log a Call</div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Call Result</label>
                        <select id="logResult" onchange="handleProfileCallChange()">
                            <option value="">— Select result —</option>
                            ${resultOptions}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Date / Time</label>
                        <input type="datetime-local" id="logDateTime" value="${now}">
                    </div>
                </div>
                <div id="logCallbackRow" style="display:none;" class="form-row">
                    <div class="form-group">
                        <label>Callback Date</label>
                        <input type="date" id="logCallbackDate">
                    </div>
                    <div class="form-group">
                        <label>Callback Time</label>
                        <input type="time" id="logCallbackTime">
                    </div>
                </div>
                <div id="logBookedRow" style="display:none;" class="form-row">
                    <div class="form-group">
                        <label>Booking Date</label>
                        <input type="date" id="logBookingDate">
                    </div>
                    <div class="form-group">
                        <label>Deal Value ($)</label>
                        <input type="number" id="logDealValue" placeholder="0">
                    </div>
                </div>
                <div class="form-group" style="margin-bottom:14px;">
                    <label>Call Notes</label>
                    <textarea id="logNotes" placeholder="What happened on this call?"></textarea>
                </div>
                <button class="btn btn-primary" style="width:100%;" onclick="submitProfileCallLog(${lead.id})">📞 Save Call Log</button>
            </div>`;
    }

    function renderProfileHistory(lead) {
        const body = document.getElementById('profileBody');
        if (!body) return;
        const history = (lead.callHistory || []).slice().reverse();
        if (!history.length) {
            body.innerHTML = `<div style="text-align:center;padding:48px 20px;color:var(--text-muted);">
                <div style="font-size:36px;margin-bottom:12px;">📞</div>
                <div style="font-size:14px;font-weight:600;">No call history yet</div>
                <div style="font-size:12px;margin-top:6px;">Use the Log Call tab to record a call</div>
            </div>`;
            return;
        }
        const emojiMap = { booked:'✅', 'no-answer':'📵', callback:'🔄', 'callback-today':'⏰', 'not-interested':'🚫', 'wrong-number':'❌', 'back-dq':'↩️' };
        const dotClass = { booked:'booked', 'no-answer':'no-answer', callback:'callback', 'not-interested':'not-interested' };
        body.innerHTML = `
            <div class="profile-section">
                <div class="profile-section-title">${history.length} Call${history.length !== 1 ? 's' : ''} Logged</div>
                <div class="call-timeline">
                    ${history.map(h => {
                        const cr = (state.callResults || []).find(r => r.id === h.result);
                        const label = cr ? `${cr.icon} ${cr.label}` : (h.result || 'Call logged');
                        const dc = dotClass[h.result] || 'default';
                        const emoji = emojiMap[h.result] || '📞';
                        return `<div class="call-timeline-item">
                            <div class="call-timeline-dot ${dc}">${emoji}</div>
                            <div class="call-timeline-content">
                                <div class="call-timeline-top">
                                    <span class="call-timeline-result">${label}</span>
                                    <span class="call-timeline-time">${h.date ? formatTime(h.date) : ''}</span>
                                </div>
                                ${h.notes ? `<div class="call-timeline-note">${h.notes}</div>` : ''}
                                ${h.rep ? `<div style="font-size:11px;color:var(--text-muted);margin-top:4px;">by ${h.rep}</div>` : ''}
                            </div>
                        </div>`;
                    }).join('')}
                </div>
            </div>`;
    }

    function switchProfileTab(tab, btn) {
        _currentProfileTab = tab;
        document.querySelectorAll('.profile-tab').forEach(t => t.classList.remove('active'));
        if (btn) btn.classList.add('active');
        const lead = state.leads.find(l => l.id === _currentProfileId);
        if (!lead) return;
        const footer = document.getElementById('profileFooter');
        if (footer) footer.style.display = tab === 'details' ? 'flex' : 'none';
        if (tab === 'details') renderProfileDetails(lead);
        else if (tab === 'log') renderProfileLog(lead);
        else if (tab === 'history') renderProfileHistory(lead);
    }

    function handleProfileCallChange() {
        const result = document.getElementById('logResult')?.value;
        const cbRow = document.getElementById('logCallbackRow');
        const bkRow = document.getElementById('logBookedRow');
        if (cbRow) cbRow.style.display = (result === 'callback' || result === 'callback-today') ? 'grid' : 'none';
        if (bkRow) bkRow.style.display = result === 'booked' ? 'grid' : 'none';
    }

    function submitProfileCallLog(leadId) {
        const lead = state.leads.find(l => l.id === leadId);
        if (!lead) return;
        const result = document.getElementById('logResult')?.value;
        if (!result) { showToast('Please select a call result', 'error'); return; }
        const notes = document.getElementById('logNotes')?.value?.trim() || '';
        const dateTime = document.getElementById('logDateTime')?.value || new Date().toISOString();
        if (!lead.callHistory) lead.callHistory = [];
        lead.callHistory.push({ result, notes, date: dateTime, rep: state.currentUser?.name || '' });
        lead.lastCall = dateTime;
        lead.result = result;
        if (result === 'callback' || result === 'callback-today') {
            const cbDate = document.getElementById('logCallbackDate')?.value;
            const cbTime = document.getElementById('logCallbackTime')?.value;
            if (cbDate) lead.callbackDate = cbDate;
            if (cbTime) lead.callbackTime = cbTime;
            lead.status = 'revisit';
        } else if (result === 'booked') {
            lead.status = 'booked';
            const bkDate = document.getElementById('logBookingDate')?.value;
            const dealVal = document.getElementById('logDealValue')?.value;
            if (bkDate) lead.bookingDate = bkDate;
            if (dealVal) lead.dealValue = dealVal;
        } else if (result === 'not-interested') {
            lead.status = 'not-interested';
        } else if (result === 'wrong-number') {
            lead.status = 'wrong-number';
        }
        updateLeadInFirestore(lead);
        saveLeads();
        renderAll();
        showToast('✅ Call logged', 'success');
        renderProfileHeader(lead);
        const historyTab = document.querySelectorAll('.profile-tab')[2];
        switchProfileTab('history', historyTab);
    }

    function saveProfileChanges() {
        const lead = state.leads.find(l => l.id === _currentProfileId);
        if (!lead) return;
        ['name','phone','address','suburb','state','postcode','leadDate','status','ownership','super','dqRep','notes'].forEach(f => {
            const el = document.getElementById('pf_' + f);
            if (el) lead[f] = el.value.trim();
        });
        lead.address = buildAddress(lead);
        updateLeadInFirestore(lead);
        saveLeads();
        renderAll();
        renderProfileHeader(lead);
        showToast('✅ Lead saved', 'success');
    }

    function saveSidebarChanges(id) { saveProfileChanges(); }

    function closeSidebar() {
        document.getElementById('leadSidebar').classList.remove('visible');
        const backdrop = document.getElementById('leadSidebarBackdrop');
        if (backdrop) backdrop.classList.remove('visible');
        _currentProfileId = null;
    }

        // ==================== DASHBOARD ====================
    function updateDashboard() {
        const today = new Date().toISOString().split('T')[0];
        
        const todayDQ = state.leads.filter((l) => 
            l.leadDate === today && !['not-interested', 'wrong-number'].includes(l.status)
        ).length;
        
        const todayBookings = state.leads.filter((l) => 
            l.bookingDate === today || (l.lastCall && l.lastCall.startsWith(today) && l.status === 'booked')
        ).length;
        
        const totalLeads = state.leads.filter((l) => ['dq', 'revisit'].includes(l.status)).length;
        const totalBooked = state.leads.filter((l) => l.status === 'booked').length;
        
        const set = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };
        
        set('statTodayDQ', todayDQ);
        set('statTodayBookings', todayBookings);
        set('statTotalLeads', totalLeads);
        set('statTotalBooked', totalBooked);
        
        const conv = totalLeads + totalBooked > 0 
            ? ((totalBooked / (totalLeads + totalBooked)) * 100).toFixed(1) 
            : '0.0';
        set('statConversion', conv + '%');
        
        // Leaderboard
        const leaderboardEl = document.getElementById('repLeaderboard');
        if (leaderboardEl) {
            const repStats = state.reps
                .filter((r) => r.active !== false)
                .map((rep) => {
                    const repLeads = state.leads.filter((l) => l.dqRep === rep.id);
                    const dq = repLeads.filter((l) => l.leadDate === today).length;
                    const booked = repLeads.filter((l) => l.status === 'booked').length;
                    return { name: rep.name, dq, booked };
                })
                .sort((a, b) => b.booked - a.booked || b.dq - a.dq);
            
            leaderboardEl.innerHTML = repStats.map((r) => `
                <div class="callback-item">
                    <span class="rep-tag"><span class="rep-dot"></span>${r.name}</span>
                    <span>${r.dq} DQ</span>
                    <span style="color:var(--accent-gold)">${r.booked} booked</span>
                </div>
            `).join('') || '<div class="empty-state">No data yet</div>';
        }
        
        // Callbacks today
        const callbacksEl = document.getElementById('callbacksToday');
        if (callbacksEl) {
            const callbacks = state.leads.filter((l) => 
                l.status === 'revisit' && l.callbackDate && l.callbackDate.startsWith(today)
            );
            
            callbacksEl.innerHTML = callbacks.length ? callbacks.map((l) => `
                <div class="callback-item" onclick="showLeadSidebar(${l.id})">
                    <strong>${l.name}</strong>
                    <span>${l.phone}</span>
                    <span style="color:var(--text-muted)">${formatTime(l.callbackDate)}</span>
                </div>
            `).join('') : `
                <div id="emptyCallbacks" class="empty-state">
                    <div class="empty-state-icon">📅</div>
                    <h3>No callbacks scheduled</h3>
                    <p>Check back later for upcoming calls</p>
                </div>
            `;
        }
        
        // Activity feed
        const activityFeed = document.getElementById('activityFeed');
        if (activityFeed) {
            const activities = state.activities.slice(0, 10);
            activityFeed.innerHTML = activities.length ? activities.map((a) => `
                <div class="activity-item">
                    <div class="activity-avatar">${(a.rep || '?').substring(0, 2).toUpperCase()}</div>
                    <div class="activity-content">
                        <div class="activity-text"><strong>${a.rep || '—'}</strong> ${a.action} ${a.target ? '· ' + a.target : ''}</div>
                        <div class="activity-time">${formatTime(a.time)}</div>
                    </div>
                </div>
            `).join('') : `
                <div class="empty-state">
                    <div class="empty-state-icon">📭</div>
                    <h3>No recent activity</h3>
                    <p>Activity will appear here as your team works</p>
                </div>
            `;
        }
    }

    function updateEmptyStates() {
        const leadsTableBody = document.getElementById('leadsTableBody');
        const emptyStateLeads = document.getElementById('emptyStateLeads');
        if (!leadsTableBody || !emptyStateLeads) return;
        emptyStateLeads.style.display = leadsTableBody.children.length > 0 ? 'none' : 'block';
        
        const emptyCallbacks = document.getElementById('emptyCallbacks');
        const callbacksToday = document.getElementById('callbacksToday');
        if (emptyCallbacks && callbacksToday) {
            emptyCallbacks.style.display = callbacksToday.children.length > 0 ? 'none' : 'block';
        }
    }

    function renderAll() {
        renderLeadsTable();
        updateDashboard();
        updateEmptyStates();
    }

    // ==================== ADD LEAD ====================
    function addNewLead() {
        const leadDate = document.getElementById('addLeadDate').value;
        const name = sanitizeInput(document.getElementById('addLeadName').value.trim());
        const phone = sanitizePhone(document.getElementById('addLeadPhone').value.trim());
        const houseNum = sanitizeInput(document.getElementById('addLeadHouseNum').value.trim());
        const street = sanitizeInput(document.getElementById('addLeadStreet').value.trim());
        const suburb = sanitizeInput(document.getElementById('addLeadSuburb').value.trim());
        const postcode = sanitizeInput(document.getElementById('addLeadPostcode').value.trim());
        const repId = document.getElementById('addLeadRep').value;
        
        if (!leadDate || !name || !phone || !houseNum || !street || !suburb || !postcode || !repId) {
            showToast('Please fill all required fields (*)', 'error');
            return;
        }
        
        const address = `${houseNum} ${street}, ${suburb} ${postcode}`;
        const lead = {
            id: nextId(state.leads),
            leadDate,
            name,
            phone,
            houseNum,
            street,
            suburb,
            postcode,
            address,
            ownership: document.getElementById('addLeadOwnership').value,
            super: document.getElementById('addLeadSuper').value,
            dqRep: parseInt(repId),
            callingRep: null,
            status: 'dq',
            result: null,
            timely: false,
            timelyAdded: false,
            lastCall: null,
            callbackDate: null,
            notes: document.getElementById('addLeadNotes').value.trim(),
            lat: null,
            lng: null,
            dealValue: null,
            bookingDate: null,
            bookingTime: null,
            commissionBreakdown: null,
            callHistory: [],
            createdAt: firebase?.firestore?.FieldValue?.serverTimestamp?.() || new Date().toISOString()
        };
        
        saveLeadToFirestore(lead);
        addActivity('lead', state.currentUser.name, 'added new lead:', name);
        addAuditLog(state.currentUser.name, 'lead', `Added lead: ${name}`);
        geocodeLeadAddress(lead);
        clearAddForm();
        showToast(`Lead added: ${name}`, 'success');
    }

    function clearAddForm() {
        ['addLeadDate', 'addLeadName', 'addLeadPhone', 'addLeadHouseNum', 'addLeadStreet', 
         'addLeadSuburb', 'addLeadPostcode', 'addLeadNotes'].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        ['addLeadOwnership', 'addLeadSuper', 'addLeadRep'].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        document.getElementById('addLeadDate').value = new Date().toISOString().split('T')[0];
    }

    function geocodeLeadAddress(lead) {
        if (!geocoder || !lead.address) return;
        geocoder.geocode({ address: lead.address + ', Australia' }, (results, status) => {
            if (status === 'OK' && results[0]) {
                lead.lat = results[0].geometry.location.lat();
                lead.lng = results[0].geometry.location.lng();
                updateLeadInFirestore(lead);
            }
        });
    }

    // ==================== GOOGLE SHEETS TWO-WAY SYNC ====================
    // Uses Google Identity Services (OAuth 2.0) — read + write
    // Requires Sheets API enabled in Google Cloud Console

    function isSheetsAuthed() {
        return _sheetsAccessToken && Date.now() < _sheetsTokenExpiry;
    }

    function initSheetsOAuth() {
        if (!window.google?.accounts?.oauth2) return;
        _sheetsTokenClient = google.accounts.oauth2.initTokenClient({
            client_id: SHEETS_OAUTH_CLIENT_ID,
            scope: SHEETS_SCOPES,
            callback: (tokenResponse) => {
                if (tokenResponse.error) {
                    showToast('❌ Google auth failed: ' + tokenResponse.error, 'error');
                    return;
                }
                _sheetsAccessToken = tokenResponse.access_token;
                _sheetsTokenExpiry = Date.now() + (tokenResponse.expires_in * 1000);
                showToast('✅ Connected to Google Sheets', 'success');
                buildSheetMapperUI();
            }
        });
    }

    function sheetsSignIn() {
        if (!_sheetsTokenClient) {
            if (!window.google?.accounts) {
                const script = document.createElement('script');
                script.id = 'gis-script';
                script.src = 'https://accounts.google.com/gsi/client';
                script.onload = () => { initSheetsOAuth(); setTimeout(() => _sheetsTokenClient?.requestAccessToken(), 200); };
                if (!document.getElementById('gis-script')) document.head.appendChild(script);
            } else {
                initSheetsOAuth();
                setTimeout(() => _sheetsTokenClient?.requestAccessToken(), 200);
            }
        } else {
            _sheetsTokenClient.requestAccessToken();
        }
    }

    function sheetsSignOut() {
        if (_sheetsAccessToken && window.google?.accounts?.oauth2) {
            google.accounts.oauth2.revoke(_sheetsAccessToken, () => {});
        }
        _sheetsAccessToken = null;
        _sheetsTokenExpiry = 0;
        showToast('Signed out of Google Sheets', 'info');
        buildSheetMapperUI();
    }

    function openSheetSync() {
        const modal = document.getElementById('sheetSyncModal');
        if (!modal) { console.error('Sheet sync modal not found'); return; }
        modal.classList.add('visible');
        if (!window.google?.accounts && !document.getElementById('gis-script')) {
            const script = document.createElement('script');
            script.id = 'gis-script';
            script.src = 'https://accounts.google.com/gsi/client';
            script.onload = () => { initSheetsOAuth(); buildSheetMapperUI(); };
            document.head.appendChild(script);
        } else {
            if (window.google?.accounts?.oauth2 && !_sheetsTokenClient) initSheetsOAuth();
            buildSheetMapperUI();
        }
    }

    function buildSheetMapperUI() {
        const container = document.getElementById('sheetMapperContainer');
        if (!container) return;
        const sheetUrl = state.settings?.sheetsUrl || '';
        const sheetTab = state.settings?.sheetsTabName || 'LEADS';
        const authed = isSheetsAuthed();
        container.innerHTML = `
            <div style="display:flex;flex-direction:column;gap:16px;">
                <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:${authed ? 'rgba(46,125,50,0.1)' : 'var(--bg-card)'};border-radius:10px;border:1px solid ${authed ? '#4caf50' : 'var(--border-color)'};">
                    <span style="font-size:14px;">${authed ? '🟢 Connected — two-way sync enabled' : '🔴 Not connected — sign in to enable sync'}</span>
                    ${authed
                        ? `<button class="btn btn-secondary btn-sm" onclick="sheetsSignOut()">Sign Out</button>`
                        : `<button class="btn btn-primary btn-sm" onclick="sheetsSignIn()">🔑 Sign in with Google</button>`
                    }
                </div>
                <div style="display:grid;gap:12px;">
                    <div>
                        <label class="form-label">Google Sheets URL</label>
                        <input type="text" id="sheetUrl" class="form-input" value="${sheetUrl}" placeholder="https://docs.google.com/spreadsheets/d/...">
                    </div>
                    <div>
                        <label class="form-label">Worksheet Name (Tab)</label>
                        <input type="text" id="sheetTabName" class="form-input" value="${sheetTab}" placeholder="LEADS">
                    </div>
                </div>
                <div style="display:flex;gap:10px;justify-content:flex-end;">
                    <button class="btn btn-secondary" onclick="closeModal('sheetSyncModal')">Cancel</button>
                    ${authed ? `<button class="btn btn-secondary" onclick="loadSheetHeaders()">🔍 Load Sheet Headers</button>` : ''}
                </div>
                <div id="sheetColumnMapperArea" style="display:none;background:var(--bg-card);border-radius:10px;padding:16px;border:1px solid var(--border-color);">
                    <p style="font-size:12px;color:var(--text-muted);margin:0 0 12px 0;">Map your sheet columns to app fields. Set to <strong>— Ignore —</strong> to skip a column.</p>
                    <div id="sheetColumnMapper"></div>
                    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px;flex-wrap:wrap;">
                        <button class="btn btn-secondary" onclick="pullFromSheet()">📥 Pull from Sheet</button>
                        <button class="btn btn-primary" onclick="pushToSheet()">📤 Push to Sheet</button>
                        <button class="btn btn-primary" style="background:linear-gradient(135deg,#7c3aed,#9f67fa);" onclick="fullTwoWaySync()">🔄 Two-Way Sync</button>
                    </div>
                </div>
            </div>
        `;
    }

    async function loadSheetHeaders() {
        const config = getSheetIdAndTab();
        if (!config) return;
        showToast('🔍 Loading sheet headers...', 'info');
        try {
            // Fetch only first row for headers
            const url = `https://sheets.googleapis.com/v4/spreadsheets/${config.sheetId}/values/${encodeURIComponent(config.tab + '!1:1')}`;
            const res = await fetch(url, { headers: { Authorization: `Bearer ${_sheetsAccessToken}` } });
            if (!res.ok) throw new Error(`API error ${res.status}`);
            const data = await res.json();
            const headers = (data.values?.[0] || []).map(h => h.trim()).filter(Boolean);
            if (!headers.length) { showToast('No headers found in row 1', 'error'); return; }
            window._sheetLoadedHeaders = headers;
            renderColumnMapper(headers);
            document.getElementById('sheetColumnMapperArea').style.display = 'block';
            showToast(`✅ Found ${headers.length} columns`, 'success');
        } catch (err) {
            showToast('❌ Could not load headers: ' + err.message, 'error');
        }
    }

    function renderColumnMapper(sheetHeaders) {
        const appFields = [
            { value: '', label: '— Ignore —' },
            { value: 'leadDate', label: 'Lead Date' },
            { value: 'name', label: 'Lead Name' },
            { value: 'phone', label: 'Phone' },
            { value: 'address', label: 'Address' },
            { value: 'suburb', label: 'Suburb' },
            { value: 'state', label: 'State' },
            { value: 'postcode', label: 'Postcode' },
            { value: 'status', label: 'Status' },
            { value: 'result', label: 'Result' },
            { value: 'notes', label: 'Notes' },
            { value: 'ownership', label: 'Owner/Renter' },
            { value: 'super', label: 'Superannuation' },
            { value: 'dqRep', label: 'DQ Rep' },
        ];
        const saved = state.settings?.sheetColumnMap || {};
        // Auto-match: if sheet header closely matches an app field label, pre-select it
        const autoMatch = (header) => {
            const h = header.toLowerCase().replace(/[^a-z]/g, '');
            const matches = {
                'name': 'name', 'leadname': 'name', 'fullname': 'name',
                'phone': 'phone', 'mobile': 'phone', 'contact': 'phone',
                'address': 'address', 'fulladdress': 'address',
                'suburb': 'suburb', 'city': 'suburb', 'town': 'suburb',
                'state': 'state',
                'postcode': 'postcode', 'zip': 'postcode', 'postalcode': 'postcode',
                'notes': 'notes', 'note': 'notes', 'comments': 'notes',
                'status': 'status',
                'result': 'result', 'callresult': 'result',
                'ownership': 'ownership', 'owner': 'ownership', 'renter': 'ownership',
                'super': 'super', 'superannuation': 'super',
                'dqrep': 'dqRep', 'rep': 'dqRep', 'agent': 'dqRep', 'assignedto': 'dqRep',
                'leaddate': 'leadDate', 'date': 'leadDate',
            };
            return saved[header] || matches[h] || '';
        };
        const container = document.getElementById('sheetColumnMapper');
        if (!container) return;
        container.innerHTML = `
            <table style="width:100%;border-collapse:collapse;">
                <thead>
                    <tr>
                        <th style="text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted);padding:6px 8px;">Sheet Column</th>
                        <th style="text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted);padding:6px 8px;">Maps To</th>
                        <th style="text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted);padding:6px 8px;">Sample</th>
                    </tr>
                </thead>
                <tbody>
                    ${sheetHeaders.map((h, i) => {
                        const matched = autoMatch(h);
                        const opts = appFields.map(f =>
                            `<option value="${f.value}" ${matched === f.value ? 'selected' : ''}>${f.label}</option>`
                        ).join('');
                        return `<tr style="border-bottom:1px solid var(--border-color);">
                            <td style="padding:8px;font-size:13px;font-weight:600;">${h}</td>
                            <td style="padding:8px;">
                                <select id="scm_col_${i}" class="form-input" style="padding:6px 10px;font-size:12px;">${opts}</select>
                            </td>
                            <td style="padding:8px;font-size:11px;color:var(--text-muted);" id="scm_sample_${i}">—</td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>`;
        // Load sample data row for preview
        loadSheetSampleRow(config => {}, sheetHeaders);
    }

    async function loadSheetSampleRow(cb, headers) {
        const config = getSheetIdAndTab();
        if (!config) return;
        try {
            const url = `https://sheets.googleapis.com/v4/spreadsheets/${config.sheetId}/values/${encodeURIComponent(config.tab + '!2:2')}`;
            const res = await fetch(url, { headers: { Authorization: `Bearer ${_sheetsAccessToken}` } });
            if (!res.ok) return;
            const data = await res.json();
            const row = data.values?.[0] || [];
            (headers || window._sheetLoadedHeaders || []).forEach((h, i) => {
                const el = document.getElementById('scm_sample_' + i);
                if (el) el.textContent = row[i] ? String(row[i]).slice(0, 30) : '—';
            });
        } catch(e) {}
    }

    function getColumnMap() {
        const headers = window._sheetLoadedHeaders || [];
        const map = {}; // field -> colIndex
        headers.forEach((h, i) => {
            const sel = document.getElementById('scm_col_' + i);
            if (sel && sel.value) map[sel.value] = i;
        });
        if (!state.settings) state.settings = {};
        // Also save header->field for push
        const headerMap = {};
        headers.forEach((h, i) => {
            const sel = document.getElementById('scm_col_' + i);
            if (sel && sel.value) headerMap[sel.value] = h;
        });
        state.settings.sheetColumnMap = headerMap;
        saveSettings();
        return map; // returns { fieldName: columnIndex }
    }


    function getSheetIdAndTab() {
        const url = (document.getElementById('sheetUrl')?.value || state.settings?.sheetsUrl || '').trim();
        const tab = (document.getElementById('sheetTabName')?.value || state.settings?.sheetsTabName || 'LEADS').trim();
        const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
        if (!match) { showToast('❌ Invalid Google Sheets URL', 'error'); return null; }
        if (!state.settings) state.settings = {};
        state.settings.sheetsUrl = url;
        state.settings.sheetsTabName = tab;
        saveSettings();
        return { sheetId: match[1], tab };
    }

    async function fetchSheetData(sheetId, tab) {
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(tab)}`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${_sheetsAccessToken}` } });
        if (!res.ok) throw new Error(`Sheets API error ${res.status}: ${await res.text()}`);
        return await res.json();
    }

    async function writeSheetData(sheetId, tab, values) {
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(tab)}?valueInputOption=USER_ENTERED`;
        const res = await fetch(url, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${_sheetsAccessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ values })
        });
        if (!res.ok) throw new Error(`Sheets write error ${res.status}: ${await res.text()}`);
        return await res.json();
    }

    async function pullFromSheet() {
        if (!isSheetsAuthed()) { sheetsSignIn(); return; }
        const config = getSheetIdAndTab();
        if (!config) return;
        if (!window._sheetLoadedHeaders?.length) {
            showToast('⚠️ Click "Load Sheet Headers" first to map your columns', 'error');
            return;
        }
        const fieldToColIdx = getColumnMap(); // { fieldName: colIndex }
        showToast('📥 Pulling from Google Sheets...', 'info');
        try {
            const data = await fetchSheetData(config.sheetId, config.tab);
            const rows = (data.values || []).slice(1); // skip header row
            let imported = 0, skipped = 0;
            rows.forEach(row => {
                if (!row.some(c => c && c.trim())) return;
                const lead = { id: nextId(state.leads), status: 'dq', callHistory: [], createdAt: new Date().toISOString() };
                Object.entries(fieldToColIdx).forEach(([field, idx]) => {
                    lead[field] = row[idx] || '';
                });
                if (!lead.name) lead.name = '(No Name)';
                if (!lead.phone) { skipped++; return; }
                if (state.leads.some(l => l.phone === lead.phone)) { skipped++; return; }
                if (!lead.dqRep) lead.dqRep = state.currentUser?.id || 1;
                state.leads.push(lead);
                if (db) saveLeadToFirestore(lead);
                imported++;
            });
            saveLeads();
            closeModal('sheetSyncModal');
            renderAll();
            showToast(`✅ Pulled ${imported} new leads (${skipped} skipped)`, 'success');
            addAuditLog(state.currentUser?.name || 'System', 'import', `Sheet pull: ${imported} leads imported`);
        } catch (err) {
            console.error(err);
            showToast('❌ Pull failed: ' + err.message, 'error');
        }
    }

    async function pushToSheet() {
        if (!isSheetsAuthed()) { sheetsSignIn(); return; }
        const config = getSheetIdAndTab();
        if (!config) return;
        const columnMap = getColumnMap();
        showToast('📤 Pushing to Google Sheets...', 'info');
        try {
            const fields = Object.keys(columnMap);
            const headers = fields.map(f => columnMap[f]);
            const rows = [headers];
            state.leads.forEach(lead => {
                rows.push(fields.map(f => {
                    if (f === 'dqRep') {
                        const rep = state.reps?.find(r => r.id == lead[f]);
                        return rep ? rep.name : (lead[f] || '');
                    }
                    const v = lead[f];
                    return v !== undefined && v !== null ? String(v) : '';
                }));
            });
            await writeSheetData(config.sheetId, config.tab, rows);
            showToast(`✅ Pushed ${state.leads.length} leads to Google Sheets`, 'success');
            addAuditLog(state.currentUser?.name || 'System', 'export', `Sheet push: ${state.leads.length} leads`);
        } catch (err) {
            console.error(err);
            showToast('❌ Push failed: ' + err.message, 'error');
        }
    }

    async function fullTwoWaySync() {
        if (!isSheetsAuthed()) { sheetsSignIn(); return; }
        const config = getSheetIdAndTab();
        if (!config) return;
        if (!window._sheetLoadedHeaders?.length) {
            showToast('⚠️ Click "Load Sheet Headers" first to map your columns', 'error');
            return;
        }
        const fieldToColIdx = getColumnMap();
        showToast('🔄 Running two-way sync...', 'info');
        try {
            // 1. Pull new leads
            const data = await fetchSheetData(config.sheetId, config.tab);
            const rows = (data.values || []).slice(1);
            let imported = 0;
            rows.forEach(row => {
                if (!row.some(c => c && c.trim())) return;
                const lead = { id: nextId(state.leads), status: 'dq', callHistory: [], createdAt: new Date().toISOString() };
                Object.entries(fieldToColIdx).forEach(([field, idx]) => { lead[field] = row[idx] || ''; });
                if (!lead.name) lead.name = '(No Name)';
                if (!lead.phone) return;
                if (state.leads.some(l => l.phone === lead.phone)) return;
                if (!lead.dqRep) lead.dqRep = state.currentUser?.id || 1;
                state.leads.push(lead);
                if (db) saveLeadToFirestore(lead);
                imported++;
            });
            if (imported > 0) saveLeads();
            // 2. Push all leads back
            const savedMap = state.settings?.sheetColumnMap || {}; // field -> colHeader
            const fields = Object.keys(savedMap);
            const outRows = [fields.map(f => savedMap[f])];
            state.leads.forEach(lead => {
                outRows.push(fields.map(f => {
                    if (f === 'dqRep') {
                        const rep = state.reps?.find(r => r.id == lead[f]);
                        return rep ? rep.name : (lead[f] || '');
                    }
                    const v = lead[f];
                    return v !== undefined && v !== null ? String(v) : '';
                }));
            });
            await writeSheetData(config.sheetId, config.tab, outRows);
            closeModal('sheetSyncModal');
            renderAll();
            showToast(`✅ Sync complete — ${imported} pulled, ${state.leads.length} pushed`, 'success');
            addAuditLog(state.currentUser?.name || 'System', 'sync', `Two-way sync: +${imported} pulled, ${state.leads.length} pushed`);
        } catch (err) {
            console.error(err);
            showToast('❌ Sync failed: ' + err.message, 'error');
        }
    }

    function extractSheetId(url) {
        const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
        return match ? match[1] : null;
    }

    function openSheetSyncSettings() { openSheetSync(); }

        // ==================== CSV IMPORT ====================
    function openCSVImport() {
        document.getElementById('csvImportModal').classList.add('visible');
        document.getElementById('csvMappingArea').style.display = 'none';
        document.getElementById('csvFileInput').value = '';
    }

    function handleCSVFile(input) {
        const file = input.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target.result;
            const lines = text.split('\n').filter((l) => l.trim());
            
            if (lines.length < 2) {
                showToast('CSV must have at least a header row and one data row', 'error');
                return;
            }
            
            const headers = parseCSVLine(lines[0]);
            const dataRows = lines.slice(1).map((l) => parseCSVLine(l));
            
            window._csvHeaders = headers;
            window._csvData = dataRows;
            showCSVMappingDialog(headers, dataRows);
        };
        reader.readAsText(file);
    }

    function csvRowsToObjects(headers, rows) {
        return rows.map(row => {
            const obj = {};
            headers.forEach((h, i) => { obj[h] = row[i] || ''; });
            return obj;
        });
    }

    function parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                if (inQuotes && line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        result.push(current.trim());
        
        return result.map((field) => {
            if (field.startsWith('"') && field.endsWith('"')) {
                return field.slice(1, -1).replace(/""/g, '"');
            }
            return field;
        });
    }

    function showCSVMappingDialog(headers, dataRows) {
        const area = document.getElementById('csvMappingArea');
        area.style.display = 'block';
        
        const fieldOptions = `
            <option value="">— Ignore —</option>
            <option value="leadDate">Lead Date</option>
            <option value="name">Lead Name</option>
            <option value="phone">Phone</option>
            <option value="houseNum">House Number</option>
            <option value="street">Street</option>
            <option value="address">Full Address</option>
            <option value="suburb">Suburb</option>
            <option value="postcode">Postcode</option>
            <option value="ownership">Owner/Renter</option>
            <option value="super">Superannuation</option>
            <option value="notes">Notes</option>
            <option value="dqRep">DQ Rep</option>
            <option value="status">Status</option>
            <option value="result">Result</option>
        `;
        
        const autoMap = {
            'date': 'leadDate', 'lead date': 'leadDate',
            'name': 'name', 'full name': 'name',
            'phone': 'phone', 'mobile': 'phone', 'contact': 'phone', 'number': 'phone',
            'house': 'houseNum', 'street': 'street',
            'address': 'address',
            'suburb': 'suburb',
            'postcode': 'postcode', 'post code': 'postcode',
            'owner': 'ownership', 'ownership': 'ownership', 'renter': 'ownership',
            'super': 'super', 'superannuation': 'super',
            'notes': 'notes',
            'rep': 'dqRep', 'dq rep': 'dqRep',
            'status': 'status',
            'result': 'result'
        };
        
        let html = `
            <h4 style="font-size:14px;margin:0 0 12px 0;">🔄 Map CSV Columns</h4>
            <p style="color:var(--text-muted);font-size:12px;margin-bottom:16px;">
                ${dataRows.length} rows detected. Map each column to a lead field.
            </p>
            <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:16px;">
                <thead>
                    <tr style="background:var(--bg-main);">
                        <th style="padding:8px;text-align:left;">CSV Column</th>
                        <th style="padding:8px;text-align:left;">Map To</th>
                        <th style="padding:8px;text-align:left;">Sample</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        headers.forEach((h, i) => {
            const sample = dataRows[0]?.[i] || '—';
            const matched = autoMap[h.toLowerCase().trim()] || '';
            html += `
                <tr style="border-bottom:1px solid var(--border-color);">
                    <td style="padding:8px;font-weight:600;">${h}</td>
                    <td style="padding:8px;">
                        <select id="csvMap_${i}" class="form-select" style="width:100%;padding:6px;">
                            ${fieldOptions}
                        </select>
                    </td>
                    <td style="padding:8px;color:var(--text-muted);">${sample}</td>
                </tr>
            `;
        });
        
        html += `
                </tbody>
            </table>
            <div style="display:flex;gap:10px;justify-content:flex-end;">
                <button class="btn btn-secondary" onclick="closeModal('csvImportModal')">Cancel</button>
                <button class="btn btn-primary" onclick="confirmCSVImportSimple()">✅ Import Leads</button>
            </div>
        `;
        
        area.innerHTML = html;
        
        // Auto-select matched fields
        headers.forEach((h, i) => {
            const sel = document.getElementById(`csvMap_${i}`);
            const matched = autoMap[h.toLowerCase().trim()];
            if (sel && matched) sel.value = matched;
        });
    }

    function confirmCSVImportSimple() {
        const headers = window._csvHeaders;
        const dataRows = window._csvData;
        
        if (!headers || !dataRows) {
            showToast('No CSV data loaded', 'error');
            return;
        }
        
        const mappings = {};
        headers.forEach((h, i) => {
            const sel = document.getElementById(`csvMap_${i}`);
            if (sel && sel.value) mappings[i] = sel.value;
        });
        
        if (!Object.keys(mappings).length) {
            showToast('Please map at least one column', 'error');
            return;
        }
        
        let imported = 0;
        const defaultRepId = state.currentUser?.id || 1;
        
        dataRows.forEach((row) => {
            if (!row.some((cell) => cell.trim())) return;
            
            const lead = {
                id: nextId(state.leads),
                leadDate: new Date().toISOString().split('T')[0],
                status: 'dq',
                dqRep: defaultRepId,
                callingRep: null,
                result: null,
                timely: false,
                timelyAdded: false,
                lastCall: null,
                callbackDate: null,
                lat: null,
                lng: null,
                dealValue: null,
                bookingDate: null,
                bookingTime: null,
                commissionBreakdown: null,
                callHistory: [],
                addedAt: new Date().toISOString()
            };
            
            Object.entries(mappings).forEach(([idx, field]) => {
                let val = row[parseInt(idx)] || '';
                if (field === 'leadDate') val = standardizeDate(val);
                if (field === 'dqRep') {
                    const rep = state.reps.find((r) => r.name.toLowerCase() === val.toLowerCase());
                    val = rep ? rep.id : defaultRepId;
                }
                if (field === 'phone') val = sanitizePhone(val);
                lead[field] = val;
            });
            
            if (!lead.name || lead.name.trim() === '') lead.name = '(No Name)';
            if (!lead.phone || lead.phone.trim() === '') lead.phone = '(No Phone)';
            if (!lead.address && lead.houseNum && lead.street) {
                lead.address = buildAddress(lead);
            }
            
            state.leads.push(lead);
            if (db) saveLeadToFirestore(lead);
            imported++;
        });
        
        saveLeads();
        closeModal('csvImportModal');
        populateRepSelects();
        renderAll();
        showToast(`✅ Imported ${imported} leads`, 'success');
        addAuditLog(state.currentUser?.name || 'System', 'import', `CSV import: ${imported} leads added`);
    }

    function standardizeDate(dateStr) {
        if (!dateStr) return '';
        const parts = dateStr.split(/[\/\-.]/);
        if (parts.length === 3) {
            if (parts[2].length === 4) return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
            if (parts[0].length === 4) return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
        }
        return dateStr;
    }

    // ==================== EXPORT ====================
    function downloadCSV(rows, filename) {
        const csv = rows.map((r) => r.map((cell) => `"${String(cell || '').replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
    }

    function exportLeadsCSV() {
        const rows = [['ID', 'Date', 'Name', 'Phone', 'Address', 'Suburb', 'Postcode', 'Ownership', 'Super', 'DQ Rep', 'Status', 'Last Call', 'Result', 'Notes']];
        state.leads.forEach((l) => {
            rows.push([l.id, l.leadDate, l.name, l.phone, l.address || buildAddress(l), l.suburb, l.postcode, l.ownership, l.super, getRepName(l.dqRep), l.status, l.lastCall || '', l.result || '', l.notes || '']);
        });
        downloadCSV(rows, 'ASG_Leads_Export.csv');
    }

    function exportCallHistoryCSV() {
        const rows = [['Lead Name', 'Phone', 'Address', 'Call Time', 'Rep', 'Result', 'Notes']];
        state.leads.forEach((l) => {
            (l.callHistory || []).forEach((h) => {
                rows.push([l.name, l.phone, l.address || buildAddress(l), h.time || h.date || '', h.rep || '', h.result || '', h.notes || '']);
            });
        });
        downloadCSV(rows, 'ASG_CallHistory.csv');
    }

    function exportAllData() {
        const data = {
            leads: state.leads,
            reps: state.reps,
            draps: state.drapsEntries,
            activities: state.activities,
            auditLog: state.auditLog,
            exportedAt: new Date().toISOString()
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'ASG_Full_Export.json';
        a.click();
    }

    function importData() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const data = JSON.parse(ev.target.result);
                    if (data.leads) state.leads = data.leads;
                    if (data.reps) state.reps = data.reps;
                    if (data.draps) state.drapsEntries = data.draps;
                    if (data.activities) state.activities = data.activities;
                    saveLeads();
                    localStorage.setItem('asgReps', JSON.stringify(state.reps));
                    populateRepSelects();
                    renderAll();
                    showToast('Data imported successfully', 'success');
                } catch (e) {
                    showToast('Invalid JSON file', 'error');
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }

    function clearAllData() {
        if (!confirm('⚠️ This will delete ALL leads and data. Are you sure?')) return;
        if (!confirm('This cannot be undone. Confirm delete everything?')) return;
        state.leads = [];
        state.drapsEntries = [];
        state.activities = [];
        state.auditLog = [];
        saveLeads();
        renderAll();
        showToast('All data cleared', 'info');
    }

    // ==================== DRAPS ====================
    function saveDrapsEntry() {
        const date = document.getElementById('drapsDate').value;
        const repId = document.getElementById('drapsRep').value;
        
        if (!date || !repId) {
            showToast('Date and Rep are required', 'error');
            return;
        }
        
        const entry = {
            id: nextId(state.drapsEntries),
            date,
            repId: parseInt(repId),
            dq: parseInt(document.getElementById('drapsDQ').value) || 0,
            referrals: parseInt(document.getElementById('drapsRefs').value) || 0,
            appointments: parseInt(document.getElementById('drapsAppts').value) || 0,
            presentations: parseInt(document.getElementById('drapsPres').value) || 0,
            sold: parseInt(document.getElementById('drapsSold').value) || 0,
            fcAppts: parseInt(document.getElementById('drapsFCAppts').value) || 0,
            fcPresented: parseInt(document.getElementById('drapsFCPres').value) || 0,
            fcBooked: parseInt(document.getElementById('drapsFCBooked').value) || 0,
            frAppts: parseInt(document.getElementById('drapsFRAppts').value) || 0,
            frPresented: parseInt(document.getElementById('drapsFRPres').value) || 0,
            frBooked: parseInt(document.getElementById('drapsFRBooked').value) || 0
        };
        
        state.drapsEntries.push(entry);
        addActivity('draps', state.currentUser.name, 'logged DRAPS entry', '');
        addAuditLog(state.currentUser.name, 'draps', `DRAPS entry logged for ${date}`);
        clearDrapsForm();
        updateDrapsHistory();
        showToast('DRAPS entry saved', 'success');
    }

    function clearDrapsForm() {
        ['drapsDQ', 'drapsRefs', 'drapsAppts', 'drapsPres', 'drapsSold', 'drapsFCAppts', 
         'drapsFCPres', 'drapsFCBooked', 'drapsFRAppts', 'drapsFRPres', 'drapsFRBooked'].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.value = '0';
        });
        document.getElementById('drapsRep').value = '';
        setDefaultDrapsDate();
    }

    function updateDrapsHistory() {
        const repFilter = document.getElementById('drapsHistoryRep')?.value || '';
        const range = document.getElementById('drapsHistoryRange')?.value || 'week';
        const now = new Date();
        let startDate;
        
        if (range === 'week') {
            startDate = new Date(now);
            startDate.setDate(now.getDate() - 7);
        } else if (range === 'month') {
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        } else if (range === 'quarter') {
            startDate = new Date(now);
            startDate.setDate(now.getDate() - 90);
        } else {
            startDate = new Date(0);
        }
        
        const filtered = state.drapsEntries
            .filter((e) => {
                if (repFilter && e.repId != repFilter) return false;
                return new Date(e.date) >= startDate;
            })
            .sort((a, b) => new Date(b.date) - new Date(a.date));
        
        const totals = filtered.reduce((acc, e) => {
            acc.dq += e.dq || 0;
            acc.referrals += e.referrals || 0;
            acc.appointments += e.appointments || 0;
            acc.presentations += e.presentations || 0;
            acc.sold += e.sold || 0;
            return acc;
        }, { dq: 0, referrals: 0, appointments: 0, presentations: 0, sold: 0 });
        
        document.getElementById('totalDQ').textContent = totals.dq;
        document.getElementById('totalRefs').textContent = totals.referrals;
        document.getElementById('totalAppts').textContent = totals.appointments;
        document.getElementById('totalPres').textContent = totals.presentations;
        document.getElementById('totalSold').textContent = totals.sold;
        
        document.getElementById('drapsHistoryBody').innerHTML = filtered.length ? filtered.map((e) => `
            <tr>
                <td>${e.date}</td>
                <td>${getRepName(e.repId)}</td>
                <td>${e.dq || 0}</td>
                <td>${e.referrals || 0}</td>
                <td>${e.appointments || 0}</td>
                <td>${e.presentations || 0}</td>
                <td>${e.sold || 0}</td>
                <td>${e.fcAppts || 0}/${e.fcPresented || 0}/${e.fcBooked || 0}</td>
                <td>${e.frAppts || 0}/${e.frPresented || 0}/${e.frBooked || 0}</td>
                <td><button class="btn btn-xs btn-danger" onclick="deleteDrapsEntry(${e.id})">Delete</button></td>
            </tr>
        `).join('') : '<tr><td colspan="10" style="text-align:center;padding:20px;color:var(--text-muted);">No entries found</td></tr>';
    }

    function deleteDrapsEntry(id) {
        if (!confirm('Delete this DRAPS entry?')) return;
        state.drapsEntries = state.drapsEntries.filter((e) => e.id !== id);
        updateDrapsHistory();
        showToast('Entry deleted', 'info');
    }

    function downloadDrapsCSV() {
        const rows = [['Date', 'Rep', 'DQ', 'Referrals', 'Appointments', 'Presentations', 'Sold', 'FC Appts', 'FC Presented', 'FC Booked', 'FR Appts', 'FR Presented', 'FR Booked']];
        state.drapsEntries.forEach((e) => {
            rows.push([e.date, getRepName(e.repId), e.dq || 0, e.referrals || 0, e.appointments || 0, e.presentations || 0, e.sold || 0, e.fcAppts || 0, e.fcPresented || 0, e.fcBooked || 0, e.frAppts || 0, e.frPresented || 0, e.frBooked || 0]);
        });
        downloadCSV(rows, 'ASG_DRAPS_Export.csv');
    }

    // ==================== MAP ====================
    function initMapView() {
        if (!window.google?.maps) {
            showToast('Google Maps not loaded', 'error');
            return;
        }
        
        if (!googleMap) {
            googleMap = new google.maps.Map(document.getElementById('googleMap'), {
                center: { lat: -37.8136, lng: 144.9631 },
                zoom: 12,
                mapTypeControl: false,
                streetViewControl: false,
                fullscreenControl: true,
                styles: document.body.classList.contains('dark-mode') ? getDarkMapStyle() : []
            });
            geocoder = new google.maps.Geocoder();
        }
        
        filterMapLeads();
    }

    function getDarkMapStyle() {
        return [
            { elementType: 'geometry', stylers: [{ color: '#212121' }] },
            { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
            { elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
            { elementType: 'labels.text.stroke', stylers: [{ color: '#212121' }] },
            { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#484848' }] },
            { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#000000' }] }
        ];
    }

    function getMarkerColor(status) {
        const colors = {
            dq: '#1a1c2e',
            booked: '#2e7d32',
            revisit: '#d4a017',
            'not-interested': '#c0392b',
            'wrong-number': '#6b7280'
        };
        return colors[status] || '#1a1c2e';
    }

    function createMarkerIcon(status) {
        const color = getMarkerColor(status);
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="36" viewBox="0 0 24 36">
            <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z" fill="${color}" stroke="white" stroke-width="1.5"/>
            <circle cx="12" cy="12" r="5" fill="white" opacity="0.9"/>
        </svg>`;
        return {
            url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
            scaledSize: new google.maps.Size(24, 36),
            anchor: new google.maps.Point(12, 36)
        };
    }

    function filterMapLeads() {
        if (!googleMap) return;
        
        const search = (document.getElementById('mapSearchInput')?.value || '').toLowerCase();
        const repFilter = document.getElementById('mapFilterRep')?.value || '';
        const suburbFilter = document.getElementById('mapFilterSuburb')?.value || '';
        
        const filtered = state.leads.filter((lead) => {
            if (!state.mapStatusFilters.includes(lead.status)) return false;
            if (search && !lead.name.toLowerCase().includes(search) && 
                !(lead.address || '').toLowerCase().includes(search) && 
                !(lead.suburb || '').toLowerCase().includes(search)) return false;
            if (repFilter && lead.dqRep != repFilter) return false;
            if (suburbFilter && lead.suburb !== suburbFilter) return false;
            return lead.lat && lead.lng;
        });
        
        mapMarkers.forEach((m) => m.setMap(null));
        mapMarkers = [];
        
        if (myMarkerClusterer) {
            myMarkerClusterer.clearMarkers();
            myMarkerClusterer = null;
        }
        
        filtered.forEach((lead) => {
            const marker = new google.maps.Marker({
                position: { lat: lead.lat, lng: lead.lng },
                map: googleMap,
                title: lead.name,
                icon: createMarkerIcon(lead.status)
            });
            marker.addListener('click', () => showMapLeadInfo(lead));
            mapMarkers.push(marker);
        });
        
        if (window.markerClusterer && mapMarkers.length > 0) {
            myMarkerClusterer = new window.markerClusterer.MarkerClusterer({
                map: googleMap,
                markers: mapMarkers
            });
        }
        
        updateSuburbStats(suburbFilter, filtered);
    }

    function showMapLeadInfo(lead) {
        document.getElementById('mapLeadContent').innerHTML = `
            <div class="lead-detail-grid" style="grid-template-columns:1fr 1fr;">
                <div class="detail-item"><div class="detail-label">Name</div><div class="detail-value" style="font-weight:700;">${lead.name}</div></div>
                <div class="detail-item"><div class="detail-label">Phone</div><div class="detail-value phone"><a href="tel:${lead.phone}">${lead.phone}</a></div></div>
                <div class="detail-item"><div class="detail-label">Address</div><div class="detail-value">${lead.address || buildAddress(lead)}</div></div>
                <div class="detail-item"><div class="detail-label">DQ Rep</div><div class="detail-value">${getRepName(lead.dqRep)}</div></div>
                <div class="detail-item"><div class="detail-label">Status</div>${getStatusBadge(lead.status)}</div>
                <div class="detail-item"><div class="detail-label">Last Call</div><div class="detail-value">${formatTime(lead.lastCall)}</div></div>
                <div class="detail-item"><div class="detail-label">Last Result</div>${getResultBadge(lead.result)}</div>
            </div>
        `;
        
        document.getElementById('mapViewLeadBtn').onclick = () => {
            closeModal('mapLeadModal');
            showPage('leads');
            setTimeout(() => showLeadSidebar(lead.id), 100);
        };
        
        document.getElementById('mapLeadModal').classList.add('visible');
    }

    function updateSuburbStats(suburbFilter, filteredLeads) {
        const panel = document.getElementById('suburbStatsPanel');
        if (!suburbFilter) {
            panel.style.display = 'none';
            return;
        }
        
        const allSuburbLeads = state.leads.filter((l) => l.suburb === suburbFilter);
        const total = allSuburbLeads.length;
        const dq = allSuburbLeads.filter((l) => l.status === 'dq').length;
        const booked = allSuburbLeads.filter((l) => l.status === 'booked').length;
        const ni = allSuburbLeads.filter((l) => l.status === 'not-interested').length;
        const revisit = allSuburbLeads.filter((l) => l.status === 'revisit').length;
        const conv = total > 0 ? ((booked / total) * 100).toFixed(1) : '0';
        
        document.getElementById('suburbStatsTitle').textContent = `📊 ${suburbFilter} Performance`;
        document.getElementById('suburbStatsGrid').innerHTML = `
            <div class="suburb-stat"><div class="val" style="color:var(--accent-navy);">${total}</div><div class="lbl">Total Leads</div></div>
            <div class="suburb-stat"><div class="val" style="color:var(--status-dq);">${dq}</div><div class="lbl">DQ</div></div>
            <div class="suburb-stat"><div class="val" style="color:var(--status-revisit);">${revisit}</div><div class="lbl">Revisit</div></div>
            <div class="suburb-stat"><div class="val" style="color:var(--result-booked);">${booked}</div><div class="lbl">Booked</div></div>
            <div class="suburb-stat"><div class="val" style="color:var(--result-not-interested);">${ni}</div><div class="lbl">Not Int</div></div>
            <div class="suburb-stat"><div class="val" style="color:var(--accent-gold);">${conv}%</div><div class="lbl">Conversion</div></div>
        `;
        panel.style.display = 'block';
    }

    function toggleMapFilter(chip) {
        const status = chip.dataset.status;
        chip.classList.toggle('active');
        if (chip.classList.contains('active')) {
            if (!state.mapStatusFilters.includes(status)) state.mapStatusFilters.push(status);
        } else {
            state.mapStatusFilters = state.mapStatusFilters.filter((s) => s !== status);
        }
        filterMapLeads();
    }

    function toggleKnockMode() {
        knockModeActive = !knockModeActive;
        const btn = document.getElementById('knockModeBtn');
        btn.textContent = knockModeActive ? '🛑 Exit Knock Mode' : '🚪 Knock Mode';
        btn.classList.toggle('active-knock', knockModeActive);
        
        if (knockModeActive) {
            showToast('Knock Mode ON — tap map to log a door knock', 'info');
            if (googleMap) {
                knockModeListener = googleMap.addListener('click', (e) => {
                    state.pendingKnockLatLng = e.latLng;
                    openKnockModal(e.latLng);
                });
            }
        } else {
            if (knockModeListener) {
                google.maps.event.removeListener(knockModeListener);
                knockModeListener = null;
            }
            showToast('Knock Mode OFF', 'info');
        }
    }

    function openKnockModal(latLng) {
        ['knockName', 'knockPhone', 'knockHouseNum', 'knockStreet', 'knockSuburb', 'knockPostcode', 'knockNotes'].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        
        document.getElementById('knockResult').value = 'no-answer';
        
        const infoEl = document.getElementById('knockLocationInfo');
        infoEl.textContent = `📍 Location: ${latLng.lat().toFixed(5)}, ${latLng.lng().toFixed(5)} — Reverse geocoding...`;
        
        if (geocoder) {
            geocoder.geocode({ location: latLng }, (results, status) => {
                if (status === 'OK' && results[0]) {
                    const comps = results[0].address_components;
                    const getComp = (type) => comps.find((c) => c.types.includes(type))?.short_name || '';
                    const streetNum = getComp('street_number');
                    const streetName = getComp('route');
                    const suburb = getComp('locality') || getComp('sublocality');
                    const postcode = getComp('postal_code');
                    
                    if (streetNum) document.getElementById('knockHouseNum').value = streetNum;
                    if (streetName) document.getElementById('knockStreet').value = streetName;
                    if (suburb) document.getElementById('knockSuburb').value = suburb;
                    if (postcode) document.getElementById('knockPostcode').value = postcode;
                    
                    infoEl.textContent = `📍 ${results[0].formatted_address}`;
                } else {
                    infoEl.textContent = `📍 Lat: ${latLng.lat().toFixed(5)}, Lng: ${latLng.lng().toFixed(5)}`;
                }
            });
        }
        
        document.getElementById('knockModal').classList.add('visible');
    }

    function saveKnockResult() {
        const houseNum = document.getElementById('knockHouseNum').value.trim();
        const street = document.getElementById('knockStreet').value.trim();
        const suburb = document.getElementById('knockSuburb').value.trim();
        const postcode = document.getElementById('knockPostcode').value.trim();
        
        if (!houseNum || !street || !suburb || !postcode) {
            showToast('House #, Street, Suburb & Postcode are required', 'error');
            return;
        }
        
        const name = document.getElementById('knockName').value.trim() || 'Unknown Resident';
        const phone = document.getElementById('knockPhone').value.trim() || '';
        const result = document.getElementById('knockResult').value;
        const notes = document.getElementById('knockNotes').value.trim();
        const address = `${houseNum} ${street}, ${suburb} ${postcode}`;
        
        const statusMap = {
            'no-answer': 'dq', 'dq': 'dq', 'revisit': 'revisit',
            'call back': 'revisit', 'call later': 'revisit',
            'booked': 'booked', 'not-interested': 'not-interested', 'wrong-number': 'wrong-number'
        };
        
        const existing = state.leads.find((l) => 
            l.houseNum === houseNum && 
            l.street.toLowerCase() === street.toLowerCase() && 
            l.suburb.toLowerCase() === suburb.toLowerCase()
        );
        
        if (existing) {
            existing.result = result;
            existing.lastCall = new Date().toISOString();
            existing.status = statusMap[result] || existing.status;
            if (notes) existing.notes = (existing.notes ? existing.notes + '\n' : '') + notes;
            if (!existing.callHistory) existing.callHistory = [];
            existing.callHistory.unshift({
                time: new Date().toISOString(),
                rep: state.currentUser.name,
                result,
                notes: '[Door Knock] ' + notes
            });
            updateLeadInFirestore(existing);
            showToast(`Updated existing lead: ${existing.name}`, 'success');
        } else {
            const lead = {
                id: nextId(state.leads),
                leadDate: new Date().toISOString().split('T')[0],
                name,
                phone,
                houseNum,
                street,
                suburb,
                postcode,
                address,
                ownership: '',
                super: '',
                dqRep: state.currentUser?.id || 1,
                callingRep: null,
                status: statusMap[result] || 'dq',
                result,
                timely: false,
                timelyAdded: false,
                lastCall: new Date().toISOString(),
                callbackDate: null,
                notes,
                lat: state.pendingKnockLatLng?.lat() || null,
                lng: state.pendingKnockLatLng?.lng() || null,
                dealValue: null,
                bookingDate: null,
                bookingTime: null,
                commissionBreakdown: null,
                callHistory: [{
                    time: new Date().toISOString(),
                    rep: state.currentUser.name,
                    result,
                    notes: '[Door Knock] ' + notes
                }],
                createdAt: firebase?.firestore?.FieldValue?.serverTimestamp?.() || new Date().toISOString()
            };
            saveLeadToFirestore(lead);
            showToast(`Door knock saved: ${name}`, 'success');
        }
        
        if (googleMap && state.pendingKnockLatLng) {
            const marker = new google.maps.Marker({
                position: state.pendingKnockLatLng,
                map: googleMap,
                title: name,
                icon: createMarkerIcon(statusMap[result] || 'dq')
            });
            mapMarkers.push(marker);
        }
        
        state.doorKnocks.push({
            id: nextId(state.doorKnocks),
            lat: state.pendingKnockLatLng?.lat(),
            lng: state.pendingKnockLatLng?.lng(),
            address,
            result,
            rep: state.currentUser.name,
            time: new Date().toISOString()
        });
        
        addActivity('knock', state.currentUser.name, 'door knocked at', address);
        addAuditLog(state.currentUser.name, 'lead', `Door knock: ${result} at ${address}`);
        renderAll();
        closeModal('knockModal');
    }

    // ==================== STATUS ====================
    function openStatusModal() {
        if (state.currentUser) {
            document.getElementById('statusSelect').value = state.currentUser.status || 'available';
            document.getElementById('statusMessage').value = state.currentUser.statusMessage || '';
        }
        document.getElementById('statusModal').classList.add('visible');
    }

    function saveStatus() {
        if (!state.currentUser) return;
        const status = document.getElementById('statusSelect').value;
        const msg = document.getElementById('statusMessage').value;
        state.currentUser.status = status;
        state.currentUser.statusMessage = msg;
        
        const rep = state.reps.find((r) => r.id === state.currentUser.id);
        if (rep) {
            rep.status = status;
            rep.statusMessage = msg;
        }
        
        addActivity('status', state.currentUser.name, 'updated status to', status);
        addAuditLog(state.currentUser.name, 'status', `Status updated to: ${status}`);
        updateDashboard();
        closeModal('statusModal');
        showToast('Status updated', 'success');
    }

    // ==================== ADMIN ====================
    function renderAdminPage() {
        const list = document.getElementById('repManagementList');
        if (!list) return;
        
        list.innerHTML = state.reps.map((rep) => {
            const initials = rep.name.substring(0, 2).toUpperCase();
            const statusDot = rep.active ? '<span style="color:var(--success);">●</span>' : '<span style="color:var(--text-muted);">●</span>';
            
            return `
                <div class="rep-list-item" style="flex-direction:column;align-items:stretch;gap:0;padding:0;overflow:hidden;">
                    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;padding:14px 16px;background:var(--bg-card);">
                        <div style="display:flex;align-items:center;gap:12px;">
                            <div class="rep-list-avatar" style="width:42px;height:42px;font-size:15px;flex-shrink:0;">${initials}</div>
                            <div>
                                <div style="font-weight:800;font-size:14px;">${rep.name} <span style="font-size:10px;font-weight:600;color:var(--accent-gold);text-transform:uppercase;margin-left:6px;">${rep.role}</span></div>
                                <div style="font-size:11px;color:var(--text-muted);margin-top:1px;">${statusDot}${rep.active ? 'Active' : 'Inactive'} · ID ${rep.id}</div>
                            </div>
                        </div>
                        <div style="display:flex;gap:6px;flex-wrap:wrap;">
                            <button class="btn btn-xs ${rep.active ? 'btn-warning' : 'btn-success'}" onclick="toggleRepActive(${rep.id})">${rep.active ? 'Deactivate' : 'Activate'}</button>
                            <button class="btn btn-xs btn-danger" onclick="removeRep(${rep.id})">Remove</button>
                        </div>
                    </div>
                    <div style="padding:14px 16px;background:var(--bg-main);border-top:1px solid var(--border-color);">
                        <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:10px;letter-spacing:.05em;">📋 Contact Details</div>
                        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin-bottom:14px;">
                            <div><label style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;">Full Name</label><input type="text" class="form-input" style="margin-top:3px;font-size:12px;padding:6px 8px;" value="${rep.name || ''}" placeholder="Full name" onchange="updateRepField(${rep.id},'name',this.value)"></div>
                            <div><label style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;">Email</label><input type="email" class="form-input" style="margin-top:3px;font-size:12px;padding:6px 8px;" value="${rep.email || ''}" placeholder="rep@email.com" onchange="updateRepField(${rep.id},'email',this.value)"></div>
                            <div><label style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;">Phone</label><input type="tel" class="form-input" style="margin-top:3px;font-size:12px;padding:6px 8px;" value="${rep.phone || ''}" placeholder="04XX XXX XXX" onchange="updateRepField(${rep.id},'phone',this.value)"></div>
                            <div style="grid-column:span 2;"><label style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;">Address</label><input type="text" class="form-input" style="margin-top:3px;font-size:12px;padding:6px 8px;" value="${rep.address || ''}" placeholder="Street, Suburb, State, Postcode" onchange="updateRepField(${rep.id},'address',this.value)"></div>
                        </div>
                        <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:10px;letter-spacing:.05em;">💳 Financial Details</div>
                        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;">
                            <div><label style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;">ABN</label><input type="text" class="form-input" style="margin-top:3px;font-size:12px;padding:6px 8px;" value="${rep.abn || ''}" placeholder="12 345 678 901" onchange="updateRepField(${rep.id},'abn',this.value)"></div>
                            <div><label style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;">BSB</label><input type="text" class="form-input" style="margin-top:3px;font-size:12px;padding:6px 8px;" value="${rep.bsb || ''}" placeholder="063-000" onchange="updateRepField(${rep.id},'bsb',this.value)"></div>
                            <div><label style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;">Account #</label><input type="text" class="form-input" style="margin-top:3px;font-size:12px;padding:6px 8px;" value="${rep.accountNumber || ''}" placeholder="12345678" onchange="updateRepField(${rep.id},'accountNumber',this.value)"></div>
                            <div><label style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;">Role</label><select class="form-select" style="margin-top:3px;font-size:12px;padding:6px 8px;" onchange="updateRepField(${rep.id},'role',this.value)"><option value="rep" ${rep.role === 'rep' ? 'selected' : ''}>Sales Rep</option><option value="admin" ${rep.role === 'admin' ? 'selected' : ''}>Admin</option></select></div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    function addNewRep() {
        const name = document.getElementById('newRepName').value.trim();
        const email = document.getElementById('newRepEmail').value.trim();
        const role = document.getElementById('newRepRole').value;
        
        if (!name) {
            showToast('Name is required', 'error');
            return;
        }
        
        const phone = (document.getElementById('newRepPhone')?.value || '').trim();
        const address = (document.getElementById('newRepAddress')?.value || '').trim();
        const abn = (document.getElementById('newRepABN')?.value || '').trim();
        const bsb = (document.getElementById('newRepBSB')?.value || '').trim();
        const accountNum = (document.getElementById('newRepAccount')?.value || '').trim();
        
        const rep = {
            id: nextId(state.reps),
            name, email, phone, address, role,
            status: 'available', statusMessage: '', active: true,
            abn, bsb, accountNumber: accountNum,
            targets: { dailyDQ: 10, weeklyBookings: 3 }
        };
        
        state.reps.push(rep);
        localStorage.setItem('asgReps', JSON.stringify(state.reps));
        addAuditLog(state.currentUser.name, 'admin', `Added rep: ${name}`);
        populateRepSelects();
        renderAdminPage();
        
        ['newRepName', 'newRepEmail', 'newRepPhone', 'newRepAddress', 'newRepABN', 'newRepBSB', 'newRepAccount'].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        
        showToast(`Rep added: ${name}`, 'success');
    }

    function toggleRepActive(id) {
        const rep = state.reps.find((r) => r.id === id);
        if (rep) {
            rep.active = !rep.active;
            localStorage.setItem('asgReps', JSON.stringify(state.reps));
            populateRepSelects();
            renderAdminPage();
        }
    }

    function removeRep(id) {
        if (!confirm('Remove this rep? Their leads will remain.')) return;
        state.reps = state.reps.filter((r) => r.id !== id);
        localStorage.setItem('asgReps', JSON.stringify(state.reps));
        populateRepSelects();
        renderAdminPage();
        showToast('Rep removed', 'info');
    }

    function updateRepField(id, field, value) {
        const rep = state.reps.find((r) => r.id === id);
        if (rep) {
            rep[field] = value;
            localStorage.setItem('asgReps', JSON.stringify(state.reps));
            if (field === 'name') populateRepSelects();
        }
    }

    function renderCallResults() {
        const list = document.getElementById('callResultsList');
        if (!list) return;
        list.innerHTML = state.callResults.map((cr) => `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border-color);">
                <span>${cr.icon} ${cr.label} <span style="font-size:11px;color:var(--text-muted);">(→ ${cr.status})</span></span>
                <button class="btn btn-xs btn-danger" onclick="removeCallResult('${cr.id}')">Remove</button>
            </div>
        `).join('');
    }

    function addCallResult() {
        const id = document.getElementById('newCRId').value.trim();
        const label = document.getElementById('newCRLabel').value.trim();
        const icon = document.getElementById('newCRIcon').value.trim();
        const color = document.getElementById('newCRColor').value.trim();
        
        if (!id || !label) {
            showToast('ID and Label are required', 'error');
            return;
        }
        if (state.callResults.find((cr) => cr.id === id)) {
            showToast('ID already exists', 'error');
            return;
        }
        
        state.callResults.push({ id, label, icon, color, status: 'dq' });
        populateCallResults();
        renderCallResults();
        ['newCRId', 'newCRLabel', 'newCRIcon', 'newCRColor'].forEach((i) => {
            const el = document.getElementById(i);
            if (el) el.value = '';
        });
        showToast('Call result added', 'success');
    }

    function removeCallResult(id) {
        state.callResults = state.callResults.filter((cr) => cr.id !== id);
        populateCallResults();
        renderCallResults();
    }

    function renderTargets() {
        const list = document.getElementById('targetsList');
        if (!list) return;
        list.innerHTML = state.reps.filter((r) => r.active).map((rep) => `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border-color);">
                <div style="font-weight:600;font-size:13px;">${rep.name}</div>
                <div style="display:flex;gap:12px;align-items:center;">
                    <div><label style="font-size:10px;color:var(--text-muted);">Daily DQ</label><br><input type="number" class="form-input" style="width:70px;padding:6px;" value="${rep.targets?.dailyDQ || 10}" onchange="updateRepTarget(${rep.id},'dailyDQ',this.value)"></div>
                    <div><label style="font-size:10px;color:var(--text-muted);">Weekly Bookings</label><br><input type="number" class="form-input" style="width:70px;padding:6px;" value="${rep.targets?.weeklyBookings || 3}" onchange="updateRepTarget(${rep.id},'weeklyBookings',this.value)"></div>
                </div>
            </div>
        `).join('');
    }

    function updateRepTarget(repId, field, value) {
        const rep = state.reps.find((r) => r.id == repId);
        if (rep) {
            if (!rep.targets) rep.targets = {};
            rep.targets[field] = parseInt(value) || 0;
        }
    }

    function saveGlobalTargets() {
        state.settings.globalTargets.dailyDQ = parseInt(document.getElementById('globalDailyDQ').value) || 100;
        state.settings.globalTargets.weeklyBookings = parseInt(document.getElementById('globalWeeklyBookings').value) || 50;
        saveSettings();
        showToast('Global targets saved', 'success');
    }

    function saveCommissionConfig() {
        state.settings.commission.type = document.getElementById('commType')?.value || 'fixed';
        state.settings.commission.defaultDealValue = parseFloat(document.getElementById('commDefaultDeal')?.value) || 1000;
        state.settings.commission.dqRate = parseFloat(document.getElementById('commDQRate')?.value) || 50;
        state.settings.commission.callRate = parseFloat(document.getElementById('commCallRate')?.value) || 100;
        state.settings.commission.bonus = parseFloat(document.getElementById('commBonus')?.value) || 25;
        state.settings.commission.period = document.getElementById('commPeriodConfig')?.value || 'weekly';
        
        if (document.getElementById('tier1Rate')) {
            state.settings.commission.tiers = [
                { min: 1, max: 5, rate: parseFloat(document.getElementById('tier1Rate').value) || 100 },
                { min: 6, max: 10, rate: parseFloat(document.getElementById('tier2Rate').value) || 150 },
                { min: 11, max: 999, rate: parseFloat(document.getElementById('tier3Rate').value) || 200 }
            ];
        }
        
        saveSettings();
    }

    function renderAuditLog() {
        const userFilter = document.getElementById('auditFilterUser')?.value || '';
        const actionFilter = document.getElementById('auditFilterAction')?.value || '';
        const userSelect = document.getElementById('auditFilterUser');
        
        if (userSelect) {
            const current = userSelect.value;
            const users = [...new Set(state.auditLog.map((l) => l.user))];
            userSelect.innerHTML = '<option value="">All Users</option>';
            users.forEach((u) => {
                const opt = document.createElement('option');
                opt.value = u;
                opt.textContent = u;
                userSelect.appendChild(opt);
            });
            userSelect.value = current;
        }
        
        const filtered = state.auditLog.filter((l) => {
            if (userFilter && l.user !== userFilter) return false;
            if (actionFilter && !l.action.includes(actionFilter)) return false;
            return true;
        });
        
        document.getElementById('auditLogContainer').innerHTML = filtered.length ? filtered.map((l) => `
            <div class="audit-log-item">
                <span class="audit-time">${formatTime(l.timestamp)}</span>
                <span class="audit-user">${l.user}</span>
                <span style="padding:2px 6px;background:var(--bg-card);border-radius:4px;font-size:10px;">${l.action}</span>
                <span style="color:var(--text-muted);">${l.details}</span>
            </div>
        `).join('') : '<div class="empty-state">No audit entries</div>';
    }

    function exportAuditLog() {
        const rows = [['Timestamp', 'User', 'Action', 'Details']];
        state.auditLog.forEach((l) => rows.push([l.timestamp, l.user, l.action, l.details]));
        downloadCSV(rows, 'ASG_AuditLog.csv');
    }

    function saveMapsApiKey() {
        state.settings.mapsApiKey = document.getElementById('mapsApiKey').value;
        saveSettings();
        showToast('Maps API key saved', 'success');
    }

    function testMapsIntegration() {
        const result = document.getElementById('mapsTestResult');
        if (window.google?.maps) {
            result.innerHTML = '<span style="color:var(--success);">✅ Google Maps is loaded and working</span>';
        } else {
            result.innerHTML = '<span style="color:var(--danger);">❌ Google Maps not loaded</span>';
        }
    }

    function saveSheetsConfig() {
        state.settings.sheetsUrl = document.getElementById('sheetsUrl').value;
        state.settings.sheetsTabName = document.getElementById('sheetsTabName').value;
        saveSettings();
        showToast('Sheets config saved', 'success');
    }

    function changeAdminPassword() {
        const current = document.getElementById('currentPassword')?.value;
        const newPass = document.getElementById('newPassword')?.value;
        const confirm = document.getElementById('confirmPassword')?.value;
        
        if (current !== state.settings.adminPassword) {
            showToast('Current password incorrect', 'error');
            return;
        }
        if (!newPass || newPass.length < 4) {
            showToast('New password must be at least 4 characters', 'error');
            return;
        }
        if (newPass !== confirm) {
            showToast('Passwords do not match', 'error');
            return;
        }
        
        state.settings.adminPassword = newPass;
        saveSettings();
        showToast('Password changed successfully', 'success');
    }

    // ==================== COMMISSIONS ====================
    const ENTITIES = {
        ASG: { name: 'ASG Solar & Electrical', abn: '12 345 678 901', address: '123 Business St, Melbourne VIC 3000' },
        SOLAR: { name: 'Solar Solutions Pty Ltd', abn: '98 765 432 109', address: '456 Industry Ave, Sydney NSW 2000' }
    };

    let _ncRepRowCount = 0;

    function openNewCommsModal() {
        _ncRepRowCount = 0;
        document.getElementById('nc_repsContainer').innerHTML = '';
        document.getElementById('nc_clientName').value = '';
        document.getElementById('nc_address').value = '';
        document.getElementById('nc_settlementDate').value = '';
        document.getElementById('nc_totalComm').value = '';
        document.getElementById('nc_notes').value = '';
        ncAddRepRow();
        document.getElementById('newCommsModal').classList.add('visible');
    }

    function ncGoStep2() {
        const client = document.getElementById('nc_clientName').value.trim();
        const address = document.getElementById('nc_address').value.trim();
        const settlement = document.getElementById('nc_settlementDate').value;
        const total = document.getElementById('nc_totalComm').value;
        
        if (!client || !address || !settlement || !total) {
            showToast('Please fill all required fields', 'error');
            return;
        }
        
        document.getElementById('nc_step1').style.display = 'none';
        document.getElementById('nc_step2').style.display = 'block';
        document.getElementById('ncBackBtn').style.display = 'inline-flex';
        document.getElementById('ncNextBtn').style.display = 'none';
        document.getElementById('ncSaveBtn').style.display = 'inline-flex';
        ncUpdateRemaining();
    }

    function ncBack() {
        document.getElementById('nc_step2').style.display = 'none';
        document.getElementById('nc_step1').style.display = 'block';
        document.getElementById('ncBackBtn').style.display = 'none';
        document.getElementById('ncNextBtn').style.display = 'inline-flex';
        document.getElementById('ncSaveBtn').style.display = 'none';
    }

    function ncAddRepRow() {
        _ncRepRowCount++;
        const rowId = _ncRepRowCount;
        const repOptions = state.reps.filter((r) => r.active !== false).map((r) => `<option value="${r.name}">${r.name}</option>`).join('');
        
        const row = document.createElement('div');
        row.id = `nc_repRow_${rowId}`;
        row.style.cssText = 'display:flex;gap:8px;align-items:flex-end;margin-bottom:12px;flex-wrap:wrap;';
        row.innerHTML = `
            <div style="flex:1;min-width:120px;">
                <label style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;">Rep Name</label>
                <select id="nc_repName_${rowId}" class="form-select" style="margin-top:3px;" onchange="ncCheckRepABN('${rowId}')">
                    <option value="">Select rep...</option>
                    ${repOptions}
                    <option value="__custom__">Custom Name...</option>
                </select>
                <input type="text" id="nc_repNameCustom_${rowId}" class="form-input" style="display:none;margin-top:4px;" placeholder="Enter name...">
            </div>
            <div style="flex:0 0 100px;">
                <label style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;">Amount ($)</label>
                <input type="number" id="nc_repAmount_${rowId}" class="form-input" style="margin-top:3px;" placeholder="0.00" oninput="ncUpdateRemaining()">
            </div>
            <div style="flex:1;min-width:120px;">
                <label style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;">ABN</label>
                <input type="text" id="nc_repABN_${rowId}" class="form-input" style="margin-top:3px;" placeholder="XX XXX XXX XXX">
                <div id="nc_repABNWarn_${rowId}" style="font-size:10px;color:var(--danger);display:none;margin-top:3px;">⚠ ABN not set for this rep</div>
            </div>
            <button class="btn btn-danger btn-xs" style="margin-bottom:2px;" onclick="ncRemoveRow(${rowId})">✕</button>
        `;
        document.getElementById('nc_repsContainer').appendChild(row);
    }

    function getRepABN(name) {
        const rep = state.reps.find((r) => r.name === name);
        return rep?.abn || '';
    }

    function getRepBanking(name) {
        const rep = state.reps.find((r) => r.name === name);
        return rep ? { bsb: rep.bsb || '', accountNumber: rep.accountNumber || '' } : {};
    }

    function getNextInvoiceNumber() {
        const count = JSON.parse(localStorage.getItem('settlementCommissions') || '[]').length;
        return `INV-${String(count + 1).padStart(4, '0')}`;
    }

    function markRepPaid(entryId, repName) {
        const entries = JSON.parse(localStorage.getItem('settlementCommissions') || '[]');
        const entry = entries.find((e) => e.id === entryId);
        if (!entry) return;
        
        const rep = entry.repAllocations.find((r) => r.rep === repName);
        if (rep) {
            rep.status = 'paid';
            rep.paidDate = new Date().toISOString().split('T')[0];
        }
        
        localStorage.setItem('settlementCommissions', JSON.stringify(entries));
        if (window.db) window.db.collection('settlementCommissions').doc(entryId).update(entry).catch(() => {});
        renderCommissions();
        showToast(`${repName} marked as paid ✅`, 'success');
    }

    function deleteCommEntry(entryId) {
        if (!confirm('Delete this commission entry?')) return;
        const entries = JSON.parse(localStorage.getItem('settlementCommissions') || '[]').filter((e) => e.id !== entryId);
        localStorage.setItem('settlementCommissions', JSON.stringify(entries));
        if (window.db) window.db.collection('settlementCommissions').doc(entryId).delete().catch(() => {});
        renderCommissions();
        showToast('Entry deleted', 'info');
    }

    function previewRepInvoice(entryId, repName) {
        const entries = JSON.parse(localStorage.getItem('settlementCommissions') || '[]');
        const entry = entries.find((e) => e.id === entryId);
        if (!entry) {
            showToast('Entry not found', 'error');
            return;
        }
        
        const rep = entry.repAllocations.find((r) => r.rep === repName);
        if (!rep) {
            showToast('Rep not found in entry', 'error');
            return;
        }
        
        const entity = ENTITIES[entry.entity] || ENTITIES.ASG;
        const invoiceHTML = buildInvoiceHTML(entry, rep, entity);
        const previewEl = document.getElementById('invoicePreview');
        previewEl.innerHTML = invoiceHTML;
        document.getElementById('invoicePreviewModal').classList.add('visible');
    }

    function buildInvoiceHTML(entry, rep, entity) {
        const today = new Date().toLocaleDateString('en-AU');
        return `
            <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;padding:40px;background:#fff;color:#333;">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:40px;padding-bottom:20px;border-bottom:2px solid #c9a84c;">
                    <div>
                        <h1 style="font-size:28px;font-weight:900;color:#1a1c2e;margin:0 0 4px;">TAX INVOICE</h1>
                        <div style="font-size:13px;color:#666;">${rep.invoiceNumber || 'INV-0001'}</div>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-weight:700;font-size:14px;">${entity.name}</div>
                        <div style="font-size:12px;color:#666;">ABN: ${entity.abn}</div>
                        <div style="font-size:12px;color:#666;">${entity.address}</div>
                    </div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-bottom:30px;">
                    <div>
                        <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#999;margin-bottom:8px;">BILL TO</div>
                        <div style="font-weight:700;">${rep.rep}</div>
                        <div style="font-size:12px;color:#666;">ABN: ${rep.abn || '⚠ Not set'}</div>
                        ${rep.banking?.bsb ? `<div style="font-size:12px;color:#666;">BSB: ${rep.banking.bsb} | Acct: ${rep.banking.accountNumber}</div>` : ''}
                    </div>
                    <div style="text-align:right;">
                        <div style="font-size:12px;color:#666;">Date: ${today}</div>
                        <div style="font-size:12px;color:#666;">Settlement: ${entry.settlementDate || '—'}</div>
                        <div style="font-size:12px;color:#666;">Status: <strong style="color:${rep.status === 'paid' ? 'green' : 'orange'}">${rep.status?.toUpperCase()}</strong></div>
                    </div>
                </div>
                <table style="width:100%;border-collapse:collapse;margin-bottom:30px;">
                    <thead>
                        <tr style="background:#1a1c2e;color:#fff;">
                            <th style="padding:12px;text-align:left;font-size:12px;">Description</th>
                            <th style="padding:12px;text-align:right;font-size:12px;">Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr style="border-bottom:1px solid #eee;">
                            <td style="padding:12px;font-size:13px;">Commission — ${entry.clientName}<br><span style="font-size:11px;color:#666;">${entry.address}</span></td>
                            <td style="padding:12px;text-align:right;font-weight:700;">$${rep.amount.toLocaleString('en-AU', { minimumFractionDigits: 2 })}</td>
                        </tr>
                    </tbody>
                    <tfoot>
                        <tr style="background:#f9f9f9;">
                            <td style="padding:12px;font-weight:700;">TOTAL (inc. GST)</td>
                            <td style="padding:12px;text-align:right;font-weight:900;font-size:16px;color:#c9a84c;">$${rep.amount.toLocaleString('en-AU', { minimumFractionDigits: 2 })}</td>
                        </tr>
                    </tfoot>
                </table>
                ${entry.notes ? `<div style="margin-bottom:20px;"><strong>Notes:</strong><br>${entry.notes}</div>` : ''}
                <div style="text-align:center;font-size:11px;color:#999;padding-top:20px;border-top:1px solid #eee;">Thank you for your contribution to ${entity.name}</div>
            </div>
        `;
    }

    function downloadInvoicePDF() {
        window.print();
    }

    function getCommissionPeriodDates(period) {
        const now = new Date();
        let start, end;
        
        if (period === 'weekly') {
            const day = now.getDay();
            start = new Date(now);
            start.setDate(now.getDate() - day);
            start.setHours(0, 0, 0, 0);
            end = new Date(start);
            end.setDate(start.getDate() + 6);
            end.setHours(23, 59, 59, 999);
        } else if (period === 'fortnightly') {
            start = new Date(now);
            start.setDate(now.getDate() - 13);
            start.setHours(0, 0, 0, 0);
            end = new Date();
            end.setHours(23, 59, 59, 999);
        } else {
            start = new Date(now.getFullYear(), now.getMonth(), 1);
            end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        }
        
        return { start, end };
    }

    function renderCommissions() {
        const period = document.getElementById('commPeriod')?.value || 'weekly';
        const isAdmin = state.isAdmin;
        const curUser = state.currentUser ? state.currentUser.name : '';
        const repFilter = isAdmin ? document.getElementById('commRepFilter')?.value || '' : curUser;
        const dates = getCommissionPeriodDates(period);
        
        const bookedLeads = state.leads.filter((l) => {
            if (l.status !== 'booked' || !l.lastCall) return false;
            const d = new Date(l.lastCall);
            if (d < dates.start || d > dates.end) return false;
            if (repFilter) {
                const repObj = state.reps.find((r) => r.name === repFilter);
                if (repObj && l.dqRep != repObj.id && l.callingRep != repObj.id) return false;
            }
            return true;
        });
        
        let totalDQ = 0, totalCall = 0, totalBonus = 0;
        bookedLeads.forEach((l) => {
            if (l.commissionBreakdown) {
                totalDQ += l.commissionBreakdown.dqAmount || 0;
                totalCall += l.commissionBreakdown.callingAmount || 0;
                totalBonus += l.commissionBreakdown.bonusAmount || 0;
            }
        });
        
        const allEntries = JSON.parse(localStorage.getItem('settlementCommissions') || '[]');
        const filtered = allEntries.filter((e) => {
            if (repFilter && !e.repAllocations.some((r) => r.rep === repFilter)) return false;
            return true;
        });
        
        let settTotal = 0;
        filtered.forEach((e) => {
            settTotal += repFilter 
                ? e.repAllocations.filter((r) => r.rep === repFilter).reduce((s, r) => s + r.amount, 0)
                : e.totalCommission;
        });
        
        const grandTotal = totalDQ + totalCall + totalBonus + settTotal;
        const periodLabels = { weekly: 'This Week', fortnightly: 'This Fortnight', monthly: 'This Month' };
        
        document.getElementById('commTotalAmount').textContent = '$' + grandTotal.toFixed(2);
        document.getElementById('commBookedCount').textContent = `${bookedLeads.length + allEntries.length} Entries`;
        document.getElementById('commPeriodLabel').textContent = periodLabels[period] || period;
        
        document.getElementById('commBreakdown').innerHTML = `
            <div class="commission-item"><div class="amount">$${totalDQ.toFixed(2)}</div><div class="label">DQ Commission</div></div>
            <div class="commission-item"><div class="amount">$${totalCall.toFixed(2)}</div><div class="label">Call Commission</div></div>
            <div class="commission-item"><div class="amount">$${totalBonus.toFixed(2)}</div><div class="label">Bonuses</div></div>
            <div class="commission-item"><div class="amount">$${settTotal.toFixed(2)}</div><div class="label">Settlements</div></div>
        `;
        
        const statusColors = { pending: 'var(--result-callback)', paid: 'var(--success)', cancelled: 'var(--danger)' };
        
        document.getElementById('commTableBody').innerHTML = filtered.length ? filtered.map((e) => {
            const entity = ENTITIES[e.entity] || ENTITIES.ASG;
            const allPaid = e.repAllocations.every((r) => r.status === 'paid');
            const anyPending = e.repAllocations.some((r) => r.status === 'pending');
            const entryStatus = allPaid ? 'paid' : anyPending ? 'pending' : 'partial';
            const statusLabel = allPaid ? '✅ All Paid' : anyPending ? '⏳ Pending' : '🔶 Partial';
            
            const repRows = e.repAllocations.map((r) => `
                <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:4px 0;border-bottom:1px solid var(--border-color);">
                    <div>
                        <div style="font-size:12px;font-weight:700;">${r.rep} <span style="font-size:10px;color:var(--text-muted);">${r.invoiceNumber || ''}</span></div>
                        <div style="font-size:10px;color:var(--text-muted);">ABN: ${r.abn || '⚠ Not set'}</div>
                        ${r.status === 'paid' && r.paidDate ? `<div style="font-size:10px;color:var(--success);">Paid ${r.paidDate}</div>` : ''}
                    </div>
                    <div style="text-align:right;">
                        <div style="font-weight:800;color:var(--accent-gold);">$${r.amount.toLocaleString('en-AU', { minimumFractionDigits: 2 })}</div>
                        <div style="display:flex;gap:4px;margin-top:4px;justify-content:flex-end;">
                            <button class="btn btn-secondary btn-sm" style="font-size:10px;padding:2px 8px;" onclick="previewRepInvoice('${e.id}','${r.rep}')">🧾</button>
                            ${r.status !== 'paid' ? `<button class="btn btn-success btn-sm" style="font-size:10px;padding:2px 8px;" onclick="markRepPaid('${e.id}','${r.rep}')">✓ Paid</button>` : '<span style="color:var(--success);">✅</span>'}
                        </div>
                    </div>
                </div>
            `).join('');
            
            return `
                <tr>
                    <td><div style="font-weight:700;">${e.clientName}</div><div style="font-size:10px;color:var(--text-muted);">Via ${entity.name} · ${e.createdBy || ''}</div></td>
                    <td style="font-size:12px;">${e.address}</td>
                    <td>${e.settlementDate || '—'}</td>
                    <td style="font-weight:800;color:var(--accent-gold);">$${e.totalCommission.toLocaleString('en-AU', { minimumFractionDigits: 2 })}</td>
                    <td style="min-width:200px;">${repRows}</td>
                    <td><span style="font-size:12px;font-weight:700;color:${statusColors[entryStatus] || 'inherit'}">${statusLabel}</span></td>
                    <td><button class="btn btn-danger btn-sm" onclick="deleteCommEntry('${e.id}')">🗑️</button></td>
                </tr>
            `;
        }).join('') : '<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--text-muted);">No commission entries yet</td></tr>';
    }

    function ncCheckRepABN(rowId) {
        const nameEl = document.getElementById(`nc_repName_${rowId}`);
        const warnEl = document.getElementById(`nc_repABNWarn_${rowId}`);
        const abnEl = document.getElementById(`nc_repABN_${rowId}`);
        
        if (!nameEl || !warnEl) return;
        
        const abn = getRepABN(nameEl.value);
        if (abnEl && abn) abnEl.value = abn;
        warnEl.style.display = nameEl.value && !abn ? 'block' : 'none';
    }

    function ncRemoveRow(rowId) {
        document.getElementById(`nc_repRow_${rowId}`)?.remove();
        ncUpdateRemaining();
    }

    function ncUpdateRemaining() {
        const total = parseFloat(document.getElementById('nc_totalComm')?.value) || 0;
        let allocated = 0;
        
        for (let i = 1; i <= _ncRepRowCount; i++) {
            const amtEl = document.getElementById(`nc_repAmount_${i}`);
            if (amtEl) allocated += parseFloat(amtEl.value) || 0;
        }
        
        const remaining = total - allocated;
        const allocEl = document.getElementById('nc_allocated');
        const remEl = document.getElementById('nc_remaining');
        
        if (allocEl) allocEl.textContent = '$' + allocated.toLocaleString('en-AU', { minimumFractionDigits: 2 });
        
        if (remEl) {
            if (remaining < -0.01) {
                remEl.style.color = 'var(--danger)';
                remEl.textContent = '-$' + Math.abs(remaining).toLocaleString('en-AU', { minimumFractionDigits: 2 }) + ' OVER';
            } else if (Math.abs(remaining) < 0.01) {
                remEl.style.color = 'var(--success)';
                remEl.textContent = '✅ Fully Allocated';
            } else {
                remEl.style.color = 'var(--result-callback)';
                remEl.textContent = '$' + remaining.toLocaleString('en-AU', { minimumFractionDigits: 2 });
            }
        }
    }

    function saveNewCommission() {
        const clientName = document.getElementById('nc_clientName').value.trim();
        const address = document.getElementById('nc_address').value.trim();
        const settlement = document.getElementById('nc_settlementDate').value;
        const totalComm = parseFloat(document.getElementById('nc_totalComm').value) || 0;
        const notes = document.getElementById('nc_notes').value.trim();
        const entityKey = document.getElementById('nc_entity').value || 'ASG';
        
        const repAllocations = [];
        for (let i = 1; i <= _ncRepRowCount; i++) {
            const nameEl = document.getElementById(`nc_repName_${i}`);
            const amtEl = document.getElementById(`nc_repAmount_${i}`);
            if (!nameEl || !amtEl) continue;
            
            const name = nameEl.value.trim();
            const amount = parseFloat(amtEl.value) || 0;
            
            if (name && amount > 0) {
                repAllocations.push({
                    rep: name,
                    amount,
                    abn: getRepABN(name),
                    banking: getRepBanking(name),
                    invoiceNumber: getNextInvoiceNumber(),
                    paidDate: null,
                    status: 'pending'
                });
            }
        }
        
        if (!repAllocations.length) {
            showToast('Add at least one rep with an amount', 'error');
            return;
        }
        
        const allocated = repAllocations.reduce((s, r) => s + r.amount, 0);
        if (allocated > totalComm + 0.01) {
            showToast('Allocated amount exceeds total commission', 'error');
            return;
        }
        
        const entry = {
            id: 'comm' + Date.now(),
            clientName,
            address,
            settlementDate: settlement,
            totalCommission: totalComm,
            entity: entityKey,
            repAllocations,
            notes,
            status: 'pending',
            createdBy: state.currentUser ? state.currentUser.name : 'Admin',
            createdAt: new Date().toISOString()
        };
        
        const entries = JSON.parse(localStorage.getItem('settlementCommissions') || '[]');
        entries.unshift(entry);
        localStorage.setItem('settlementCommissions', JSON.stringify(entries));
        
        if (window.db) window.db.collection('settlementCommissions').add(entry).catch(() => {});
        
        closeModal('newCommsModal');
        showToast(`Commission saved — ${repAllocations.length} invoice${repAllocations.length > 1 ? 's' : ''} generated 💰`, 'success');
        renderCommissions();
    }

// ==================== WINDOW FUNCTION EXPOSURE ====================
// Exposing functions globally for HTML onclick handlers and Maps callback
window.addActivity = addActivity;
window.addAuditLog = addAuditLog;
window.addCallResult = addCallResult;
window.addNewLead = addNewLead;
window.addNewRep = addNewRep;
window.buildAddress = buildAddress;
window.buildCSVMapperUI = buildSheetMapperUI; // Alias
window.buildInvoiceHTML = buildInvoiceHTML;
window.buildSheetMapperUI = buildSheetMapperUI;
window.changeAdminPassword = changeAdminPassword;
window.clearAddForm = clearAddForm;
window.clearAllData = clearAllData;
window.clearDrapsForm = clearDrapsForm;
window.closeModal = closeModal; // Missing in previous cut-off
window.closeSidebar = closeSidebar;
window.confirmCSVImportSimple = confirmCSVImportSimple;
window.confirmCallResult = confirmCallResult;
window.createMarkerIcon = createMarkerIcon;
window.deleteCommEntry = deleteCommEntry;
window.deleteDrapsEntry = deleteDrapsEntry;
window.deleteLead = function(id) { // Missing in previous cut-off
    if (!confirm('Delete this lead?')) return;
    state.leads = state.leads.filter(l => l.id !== id);
    saveLeads();
    if (db) db.collection('leads').doc(id.toString()).delete().catch(console.error);
    renderAll();
    showToast('Lead deleted', 'info');
};
window.downloadCSV = downloadCSV;
window.downloadDrapsCSV = downloadDrapsCSV;
window.downloadInvoicePDF = downloadInvoicePDF;
window.enterApp = enterApp;
window.enterAdmin = enterAdmin;
window.exportAllData = exportAllData;
window.exportAuditLog = exportAuditLog;
window.exportCallHistoryCSV = exportCallHistoryCSV;
window.exportLeadsCSV = exportLeadsCSV;
window.extractSheetId = extractSheetId;
window.filterLeads = filterLeads;
window.filterMapLeads = filterMapLeads;
window.formatDate = formatDate;
window.formatTime = formatTime;
window.geocodeLeadAddress = geocodeLeadAddress;
window.getDarkMapStyle = getDarkMapStyle;
window.getFilteredLeads = getFilteredLeads;
window.getLeadAge = getLeadAge;
window.getMarkerColor = getMarkerColor;
window.getNextInvoiceNumber = getNextInvoiceNumber;
window.getRep = getRep;
window.getRepABN = getRepABN;
window.getRepBanking = getRepBanking;
window.getRepName = getRepName;
window.getResultBadge = getResultBadge;
window.getStatusBadge = getStatusBadge;
window.handleCallResultChange = handleCallResultChange;
window.handleCSVFile = handleCSVFile;
window.hideLoading = hideLoading;
window.importData = importData;
// window.initMapView = initMapView;
window.initSampleData = initSampleData;
window.launchApp = launchApp;
window.listenToLeads = listenToLeads;
window.loadSettings = loadSettings;
window.logout = logout;
window.markRepPaid = markRepPaid;
window.ncAddRepRow = ncAddRepRow;
window.ncBack = ncBack;
window.ncCheckRepABN = ncCheckRepABN;
window.ncGoStep2 = ncGoStep2;
window.ncRemoveRow = ncRemoveRow;
window.ncUpdateRemaining = ncUpdateRemaining;
window.nextId = nextId;
window.__onMapsLoadedCallback = function() {
    if (window.google?.maps) {
        if (typeof geocoder === 'undefined') {
            geocoder = new google.maps.Geocoder();
        }
        console.log('✅ Google Maps loaded');
        if (window.state?.currentPage === 'map' && typeof initMapView === 'function') {
            initMapView();
        }
    }
};
// onMapsLoaded defined at top of file
window.openCallModal = openCallModal;
window.openCSVImport = openCSVImport;
window.openKnockModal = openKnockModal;
window.openNewCommsModal = openNewCommsModal;
window.openSheetSync = openSheetSync;
window.openSheetSyncSettings = openSheetSyncSettings; // From sheets-sync logic
window.openStatusModal = openStatusModal;
window.parseCSVLine = parseCSVLine;
window.populateCallResults = populateCallResults;
window.populateRepSelects = populateRepSelects;
window.previewRepInvoice = previewRepInvoice;
// window.removeCallResult = removeCallResult;
window.removeRep = removeRep;
window.renderAdminPage = renderAdminPage;
window.renderAll = renderAll;
window.renderAuditLog = renderAuditLog;
window.renderCallResults = renderCallResults;
window.renderCommissions = renderCommissions;
window.renderLeadsTable = renderLeadsTable;
window.renderTargets = renderTargets;
// window.sanitizeEmail = sanitizeEmail;
window.sanitizeInput = sanitizeInput;
window.sanitizePhone = sanitizePhone;
window.saveCommissionConfig = saveCommissionConfig;
window.saveDrapsEntry = saveDrapsEntry;
window.saveGlobalTargets = saveGlobalTargets;
window.saveKnockResult = saveKnockResult;
window.saveLeadToFirestore = saveLeadToFirestore;
window.saveLeads = saveLeads;
window.saveLeadsBatch = saveLeadsBatch;
window.saveMapsApiKey = saveMapsApiKey;
window.saveNewCommission = saveNewCommission;
window.saveSettings = saveSettings;
window.saveSheetsConfig = saveSheetsConfig;
window.saveSidebarChanges = saveSidebarChanges;
window.saveStatus = saveStatus;
window.setDefaultDrapsDate = setDefaultDrapsDate;
window.showAdminSection = showAdminSection;
window.showCSVMappingDialog = showCSVMappingDialog;
window.showLeadSidebar = showLeadSidebar;
window.showLeadProfile = showLeadProfile;
window.switchProfileTab = switchProfileTab;
window.submitProfileCallLog = submitProfileCallLog;
window.saveProfileChanges = saveProfileChanges;
window.handleProfileCallChange = handleProfileCallChange;
window.sheetsSignIn = sheetsSignIn;
window.sheetsSignOut = sheetsSignOut;
window.pullFromSheet = pullFromSheet;
window.loadSheetHeaders = loadSheetHeaders;
window.csvRowsToObjects = csvRowsToObjects;
window.renderColumnMapper = renderColumnMapper;
window.pushToSheet = pushToSheet;
window.fullTwoWaySync = fullTwoWaySync;
window.buildSheetMapperUI = buildSheetMapperUI;
window.getColumnMap = getColumnMap;
window.showLoading = showLoading;
window.showMapLeadInfo = showMapLeadInfo;
window.showPage = showPage;
// window.showToast = showToast;
window.standardizeDate = standardizeDate;
window.switchTab = switchTab;
window.testMapsIntegration = testMapsIntegration;
window.toggleDarkMode = toggleDarkMode;
window.toggleKnockMode = toggleKnockMode;
window.toggleMapFilter = toggleMapFilter;
window.toggleNav = toggleNav;
window.toggleRepActive = toggleRepActive;
window.updateDashboard = updateDashboard;
window.updateDashboardDate = updateDashboardDate;
window.updateDrapsHistory = updateDrapsHistory;
window.updateEmptyStates = updateEmptyStates;
window.updateLeadInFirestore = updateLeadInFirestore;
window.updateRepField = updateRepField;
window.updateRepTarget = updateRepTarget;
window.updateSuburbStats = updateSuburbStats;
window.updateTicker = updateTicker;
window.importFromSheets = openSheetSync;
window.syncToSheets = openSheetSync;
window.enterApp = enterApp;
window.enterAdmin = enterAdmin;
window.logout = logout;
window.openModal = openModal;
window.closeModal = closeModal;
window.deleteLead = deleteLead;
window.showPage = showPage;
window.switchTab = switchTab;
window.toggleDarkMode = toggleDarkMode;
window.toggleNav = toggleNav;
window.toggleAdminLogin = toggleAdminLogin;
console.log('✅ All functions exposed to window');
}