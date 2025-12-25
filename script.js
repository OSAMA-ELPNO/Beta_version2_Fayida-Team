/**
 * Fayida Platform - Final Firebase Implementation
 * Features: Real-time Sync, Cloud Storage, Nested Subcollections
 */

// --- Firebase Configuration (Real Credentials) ---
const firebaseConfig = {
    apiKey: "AIzaSyB2K4yvuyEyskTHAItjFt947EmE90Qz06Q",
    authDomain: "fayidaplatform.firebaseapp.com",
    projectId: "fayidaplatform",
    storageBucket: "fayidaplatform.firebasestorage.app",
    messagingSenderId: "1026490234120",
    appId: "1:1026490234120:web:ca37c88bc5da414cac68bd",
    measurementId: "G-CBXH1ZHSMD"
};

// Initialize Firebase (Compat)
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();
const storage = firebase.storage();
const analytics = firebase.analytics();

// --- Data Stores ---
let localMajors = [];
let localSubjects = [];

// --- Global State ---
let appState = {
    currentMajor: null,
    currentCourse: null,
    currentWeek: 1,
    lang: localStorage.getItem('fayida_lang') || 'en',
    theme: localStorage.getItem('fayida_theme') || 'light'
};

/**
 * --- DATABASE SYNC LAYER ---
 */
function syncMajors() {
    db.collection('specializations').onSnapshot(snapshot => {
        if (snapshot.empty) {
            const defaults = [
                { id: 'cs', name: 'Computer Science', nameAr: 'علوم الحاسب', icon: '💻', color: '#00d2ff' },
                { id: 'business', name: 'Business Administration', nameAr: 'إدارة الأعمال', icon: '📊', color: '#ffb900' },
                { id: 'health', name: 'Health Sciences', nameAr: 'العلوم الصحية', icon: '🏥', color: '#ff4d4d' },
                { id: 'english', name: 'English Literature', nameAr: 'الأدب الإنجليزي', icon: '📚', color: '#2ecc71' }
            ];
            defaults.forEach(m => db.collection('specializations').doc(m.id).set(m));
        } else {
            localMajors = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderStudentMajors();
        }
    });
}

function syncSubjects() {
    db.collectionGroup('subjects').onSnapshot(snapshot => {
        localSubjects = snapshot.docs.map(doc => ({
            id: doc.id,
            parentId: doc.ref.parent.parent ? doc.ref.parent.parent.id : null,
            ...doc.data()
        }));

        if (appState.currentMajor) renderStudentCourses();
        if (location.pathname.includes('admin.html')) renderAdminHub();

        if (appState.currentCourse) {
            const updated = localSubjects.find(s => s.id === appState.currentCourse.id);
            if (updated) {
                appState.currentCourse = updated;
                fetchWeeksForSubject(updated);
            }
        }
    });
}

async function fetchWeeksForSubject(subject) {
    if (!subject.id || !subject.parentId) return;
    const weekSnap = await db.collection('specializations').doc(subject.parentId)
        .collection('subjects').doc(subject.id)
        .collection('weeks').orderBy('number').get();

    subject.weeks = weekSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderStudentTimeline(subject);
    selectWeek(appState.currentWeek);
}

/**
 * --- STUDENT PORTAL RENDERERS ---
 */
function renderStudentMajors() {
    const grid = document.getElementById('majors-grid');
    if (!grid) return;
    grid.innerHTML = localMajors.map(m => `
        <div class="card" onclick="navigateToCourses('${m.id}')">
            <span class="icon">${m.icon}</span>
            <h3 class="fredoka">${appState.lang === 'en' ? m.name : m.nameAr}</h3>
            <p>${appState.lang === 'en' ? 'Explore subjects' : 'استكشف التخصصات'}</p>
        </div>
    `).join('');
}

function renderStudentCourses() {
    const grid = document.getElementById('courses-grid');
    if (!grid) return;
    const majorSubjects = localSubjects.filter(s => s.parentId === appState.currentMajor);

    if (majorSubjects.length === 0) {
        grid.innerHTML = `<p style="grid-column: 1/-1; opacity:0.6;">${appState.lang === 'en' ? 'No subjects published yet.' : 'لا توجد مواد منشورة بعد.'}</p>`;
        return;
    }

    grid.innerHTML = majorSubjects.map(s => {
        return `
        <div class="card" onclick="navigateToContent('${s.id}')">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <span class="badge">Active Modules</span>
                <span style="font-size:0.8rem; opacity:0.7;">Fayida Hub</span>
            </div>
            <h3 class="fredoka" style="margin-top:10px;">${s.name}</h3>
            <button class="icon-btn" style="margin-top:15px; width:100%; border-radius:12px;">View Modules</button>
        </div>
        `;
    }).join('');
}

function renderStudentTimeline(subject) {
    const list = document.getElementById('weeks-list');
    if (!list) return;
    list.innerHTML = (subject.weeks || []).map((w, i) => {
        const status = getWeekStatus(w);
        let icon = '📖';
        if (status === 'scheduled') icon = '⏳';
        if (status === 'closed') icon = '📁';
        return `
            <li class="${appState.currentWeek === (i + 1) ? 'active' : ''} status-${status}" onclick="selectWeek(${i + 1})">
                <div style="display:flex; align-items:center; gap:10px;">
                    <span class="week-icon">${icon}</span>
                    <span class="fredoka">${appState.lang === 'en' ? 'Week' : 'أسبوع'} ${w.number}</span>
                </div>
            </li>
        `;
    }).join('');
}

function selectWeek(weekNum) {
    if (!appState.currentCourse || !appState.currentCourse.weeks) return;
    const week = appState.currentCourse.weeks.find(w => w.number === weekNum);
    if (!week) return;
    appState.currentWeek = weekNum;

    document.querySelectorAll('#weeks-list li').forEach((li, i) => {
        li.classList.toggle('active', (i + 1) === weekNum);
    });

    const display = document.getElementById('week-details');
    if (!display) return;

    const status = getWeekStatus(week);

    // Safety Field Initialization
    const vids = week.videos || [];
    const pdfs = week.pdfs || [];
    const notes = week.notes || "";
    const title = week.title || `Week ${weekNum}`;

    if (status === 'scheduled') {
        const openDate = week.openDateTime ? (week.openDateTime.toDate ? week.openDateTime.toDate() : new Date(week.openDateTime)) : new Date();
        display.innerHTML = `<div class="locked-state fadeIn">
            <h2 style="font-size:4rem; margin-bottom:20px;">⏳</h2>
            <h3 class="fredoka">${appState.lang === 'en' ? 'Upcoming Content' : 'محتوى قادم'}</h3>
            <p>${appState.lang === 'en' ? 'Unlocks on:' : 'سيفتح في:'}</p>
            <div class="badge">${openDate.toLocaleString()}</div>
        </div>`;
        return;
    }

    if (status === 'closed') {
        display.innerHTML = `<div class="locked-state fadeIn">
            <h2 style="font-size:4rem; margin-bottom:20px;">📁</h2>
            <h3 class="fredoka">${appState.lang === 'en' ? 'Module Closed' : 'المديول مغلق'}</h3>
        </div>`;
        return;
    }

    display.innerHTML = `
        <div class="content-view fadeIn">
            <div class="content-meta">
                <span class="badge">Week ${weekNum}</span>
                <h2 class="fredoka">${title}</h2>
            </div>
            <div class="media-stack">
                ${renderMediaSection('📽️ Videos', vids)}
                ${renderMediaSection('📄 PDF Resources', pdfs)}
                ${notes ? `<div class="media-item"><h4>📝 Notes</h4><div class="notes-box">${notes}</div></div>` : ''}
            </div>
        </div>
    `;
}

function renderMediaSection(title, items) {
    if (!items || items.length === 0) return '';
    return `
        <div class="media-item">
            <h4>${title}</h4>
            <div class="media-grid">
                ${items.map((item, idx) => `
                    <div class="media-card">
                        ${item.url.includes('youtube.com') || item.url.includes('youtu.be')
            ? `<iframe src="${item.url.replace('watch?v=', 'embed/')}" frameborder="0" allowfullscreen></iframe>`
            : item.url.toLowerCase().endsWith('.pdf') || title.includes('PDF')
                ? `<a href="${item.url}" target="_blank" class="download-link"><i class="fas fa-file-pdf"></i> View Resource ${idx + 1}</a>`
                : `<video controls><source src="${item.url}"></video>`
        }
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

/**
 * --- ADMIN HUB LOGIC ---
 */
let activeEditorSubjectId = null;
let activeEditorWeekNum = 1;

function renderAdminHub() {
    const container = document.getElementById('admin-subjects-grid');
    if (!container) return;
    container.innerHTML = localSubjects.map(s => `
        <div class="admin-card">
            <div style="display:flex; justify-content:space-between;">
                <h3 class="fredoka">${s.name}</h3>
                <span class="badge">${(s.parentId || '').toUpperCase()}</span>
            </div>
            <div class="actions-row">
                <button class="icon-btn" onclick="openWeekEditor('${s.id}')">Edit Content</button>
                <button class="danger-btn" onclick="deleteSubject('${s.id}')">Delete</button>
            </div>
        </div>
    `).join('');
}

async function addSubject() {
    const name = document.getElementById('new-subject-name').value;
    const majorId = document.getElementById('new-subject-major').value;
    const weekCount = parseInt(document.getElementById('new-subject-weeks').value);
    if (!name) return alert('Name required');

    showSiteLoader(true);
    try {
        const now = firebase.firestore.Timestamp.now();
        const duration = 7 * 24 * 60 * 60 * 1000; // 7 days
        const expiry = firebase.firestore.Timestamp.fromMillis(now.toMillis() + duration);

        const subjectRef = await db.collection('specializations').doc(majorId).collection('subjects').add({
            name,
            majorId,
            weekCount,
            createdAt: now
        });

        const batch = db.batch();
        for (let i = 1; i <= weekCount; i++) {
            batch.set(subjectRef.collection('weeks').doc('week-' + i), {
                number: i,
                title: 'Week ' + i,
                openDateTime: now,
                closeDateTime: expiry,
                videos: [],
                pdfs: [],
                notes: '',
                discussion: ''
            });
        }
        await batch.commit();
        closeOverlay('add-subject-overlay');
    } catch (err) {
        console.error(err);
        alert("Failed to create structured subject.");
    } finally {
        showSiteLoader(false);
    }
}

async function deleteSubject(id) {
    const s = localSubjects.find(x => x.id === id);
    if (!confirm(`Delete ${s.name}?`)) return;
    showSiteLoader(true);
    await db.collection('specializations').doc(s.parentId).collection('subjects').doc(id).delete();
    showSiteLoader(false);
}

async function openWeekEditor(id) {
    activeEditorSubjectId = id;
    activeEditorWeekNum = 1;
    const subject = localSubjects.find(s => s.id === id);
    document.getElementById('editor-subject-name').innerText = subject.name;
    showSiteLoader(true);
    const snap = await db.collection('specializations').doc(subject.parentId).collection('subjects').doc(id).collection('weeks').orderBy('number').get();
    subject.weeks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    showSiteLoader(false);
    renderWeekTabs(subject.weeks.length);
    loadWeekToForm();
    openOverlay('week-editor-overlay');
}

function renderWeekTabs(count) {
    const row = document.getElementById('week-tabs-row');
    row.innerHTML = Array.from({ length: count }, (_, i) => i + 1).map(w => `
        <div class="week-tab ${activeEditorWeekNum === w ? 'active' : ''}" onclick="switchEditorWeek(${w})">Week ${w}</div>
    `).join('');
}

async function switchEditorWeek(num) {
    await saveWeekFromForm();
    activeEditorWeekNum = num;
    loadWeekToForm();
    renderWeekTabs(localSubjects.find(s => s.id === activeEditorSubjectId).weeks.length);
}

function loadWeekToForm() {
    const s = localSubjects.find(x => x.id === activeEditorSubjectId);
    if (!s || !s.weeks) return;
    const w = s.weeks[activeEditorWeekNum - 1];
    if (!w) return;

    document.getElementById('edit-week-title').value = w.title || '';

    // Format dates for datetime-local input (YYYY-MM-DDTHH:MM)
    const formatDate = (ts) => {
        if (!ts) return "";
        const d = ts.toDate ? ts.toDate() : new Date(ts);
        if (isNaN(d.getTime())) return "";
        const pad = (n) => n.toString().padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    document.getElementById('edit-week-date').value = formatDate(w.openDateTime);
    document.getElementById('edit-week-expiry').value = formatDate(w.closeDateTime);
    document.getElementById('edit-week-notes').value = w.notes || '';

    renderDynamicMediaInputs('videos', w.videos || []);
    renderDynamicMediaInputs('pdfs', w.pdfs || []);
}

function renderDynamicMediaInputs(type, items) {
    const container = document.getElementById(type === 'videos' ? 'video-inputs-container' : 'pdf-inputs-list');
    if (!container) return;
    container.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <label>${type.toUpperCase()}</label>
            <button class="icon-btn" onclick="addMediaField('${type}')">+ Add</button>
        </div>
        <div class="${type}-fields-list">
            ${items.map((item, i) => generateMediaFieldHTML(type, i, item)).join('')}
        </div>
    `;
}

function generateMediaFieldHTML(type, i, item = { url: '', isFile: false }) {
    return `
        <div class="media-input-group" style="padding:10px; border:1px solid rgba(255,255,255,0.1); border-radius:10px; margin-bottom:10px;">
            <div style="display:flex; gap:10px;">
                <input type="text" class="m-url" value="${item.url}" placeholder="URL" style="flex:1;">
                <input type="file" class="m-file" style="display:none;">
                <button class="icon-btn" onclick="this.previousElementSibling.click()"><i class="fas fa-upload"></i></button>
                <button class="danger-btn" onclick="this.parentElement.parentElement.remove()">×</button>
            </div>
            ${item.isFile ? '<span style="font-size:0.7rem; color:var(--primary-teal);">Hosted File</span>' : ''}
        </div>
    `;
}

function addMediaField(type) {
    const list = document.querySelector(`.${type}-fields-list`);
    const div = document.createElement('div');
    div.innerHTML = generateMediaFieldHTML(type, 0);
    list.appendChild(div.firstElementChild);
}

async function saveWeekFromForm() {
    if (!activeEditorSubjectId) return;
    const s = localSubjects.find(x => x.id === activeEditorSubjectId);
    showSiteLoader(true);
    try {
        const vids = await collectMedia('videos');
        const pdfs = await collectMedia('pdfs');

        // Convert input values to Firestore Timestamps
        const rawOpen = document.getElementById('edit-week-date').value;
        const rawClose = document.getElementById('edit-week-expiry').value;
        const openDateTime = rawOpen ? firebase.firestore.Timestamp.fromDate(new Date(rawOpen)) : firebase.firestore.Timestamp.now();
        const closeDateTime = rawClose ? firebase.firestore.Timestamp.fromDate(new Date(rawClose)) : firebase.firestore.Timestamp.now();

        const data = {
            number: activeEditorWeekNum,
            title: document.getElementById('edit-week-title').value || `Week ${activeEditorWeekNum}`,
            openDateTime: openDateTime,
            closeDateTime: closeDateTime,
            videos: vids,
            pdfs: pdfs,
            notes: document.getElementById('edit-week-notes').value || ""
        };

        await db.collection('specializations').doc(s.parentId)
            .collection('subjects').doc(s.id)
            .collection('weeks').doc('week-' + activeEditorWeekNum)
            .set(data, { merge: true });

        // Update local memory
        const weekIndex = activeEditorWeekNum - 1;
        if (s.weeks && s.weeks[weekIndex]) {
            s.weeks[weekIndex] = { ...s.weeks[weekIndex], ...data };
        }
    } catch (err) {
        console.error(err);
        alert("Integrity Save Error: " + err.message);
    } finally {
        showSiteLoader(false);
    }
}

async function collectMedia(type) {
    const items = [];
    const groups = document.querySelectorAll(`.${type}-fields-list .media-input-group`);
    for (let g of groups) {
        let url = g.querySelector('.m-url').value;
        const file = g.querySelector('.m-file').files[0];
        let isFile = false;
        if (file) {
            url = await uploadFile(file, type);
            isFile = true;
        }
        if (url) items.push({ url, isFile });
    }
    return items;
}

async function uploadFile(file, folder) {
    const ref = storage.ref().child(`${folder}/${Date.now()}_${file.name}`);
    const snap = await ref.put(file);
    return await snap.ref.getDownloadURL();
}

/**
 * --- UTILS ---
 */
function getWeekStatus(w) {
    if (!w) return 'open';
    const now = new Date();

    // Support both Firebase Timestamps and ISO Strings
    const open = w.openDateTime ? (w.openDateTime.toDate ? w.openDateTime.toDate() : new Date(w.openDateTime)) : null;
    const close = w.closeDateTime ? (w.closeDateTime.toDate ? w.closeDateTime.toDate() : new Date(w.closeDateTime)) : null;

    if (!open) return 'open';
    if (now < open) return 'scheduled';
    if (close && now > close) return 'closed';
    return 'open';
}

function navigateHome() {
    appState.currentMajor = null; appState.currentCourse = null;
    hideAllViews();
    if (document.getElementById('view-majors')) {
        document.getElementById('view-majors').classList.add('active');
        renderStudentMajors(); renderLearningPath();
        document.documentElement.style.setProperty('--accent-color', 'var(--primary-teal)');
    }
}

function navigateToCourses(id) {
    if (id) appState.currentMajor = id;
    appState.currentCourse = null;
    const m = localMajors.find(x => x.id === appState.currentMajor);
    hideAllViews();
    document.getElementById('view-courses').classList.add('active');
    document.getElementById('current-major-title').innerText = appState.lang === 'en' ? m.name : m.nameAr;
    document.documentElement.style.setProperty('--accent-color', m.color);
    renderStudentCourses(); renderLearningPath();
}

function navigateToContent(id) {
    appState.currentCourse = localSubjects.find(x => x.id === id);
    appState.currentMajor = appState.currentCourse.parentId;
    hideAllViews();
    document.getElementById('view-content').classList.add('active');
    document.getElementById('current-course-title').innerText = appState.currentCourse.name;
    const m = localMajors.find(x => x.id === appState.currentMajor);
    document.documentElement.style.setProperty('--accent-color', m.color);
    fetchWeeksForSubject(appState.currentCourse);
    renderLearningPath();
}

function renderLearningPath() {
    const nav = document.getElementById('learning-path');
    if (!nav) return;
    let h = `<span onclick="navigateHome()">🏠 ${appState.lang === 'en' ? 'Home' : 'الرئيسية'}</span>`;
    if (appState.currentMajor) {
        const m = localMajors.find(x => x.id === appState.currentMajor);
        h += ` / <span onclick="navigateToCourses('${m.id}')">${appState.lang === 'en' ? m.name : m.nameAr}</span>`;
    }
    if (appState.currentCourse) h += ` / <span class="active fredoka">${appState.currentCourse.name}</span>`;
    nav.innerHTML = h;
}

function showSiteLoader(s) {
    const l = document.getElementById('site-loader');
    if (l) s ? l.classList.remove('hidden') : l.classList.add('hidden');
}

function openOverlay(id) { document.getElementById(id).classList.add('active'); }
function closeOverlay(id) { document.getElementById(id).classList.remove('active'); }
function hideAllViews() { document.querySelectorAll('.view-container').forEach(v => v.classList.remove('active')); }

function initApp() {
    syncMajors();
    syncSubjects();
    const l = document.getElementById('lang-toggle');
    if (l) l.onclick = () => {
        appState.lang = appState.lang === 'en' ? 'ar' : 'en';
        localStorage.setItem('fayida_lang', appState.lang);
        location.reload();
    };
    const t = document.getElementById('theme-toggle');
    if (t) t.onclick = () => {
        appState.theme = appState.theme === 'light' ? 'dark' : 'light';
        document.body.classList.toggle('dark-mode');
        localStorage.setItem('fayida_theme', appState.theme);
    };
    if (appState.theme === 'dark') document.body.classList.add('dark-mode');
    document.documentElement.setAttribute('lang', appState.lang);
    document.documentElement.setAttribute('dir', appState.lang === 'ar' ? 'rtl' : 'ltr');

    if (!location.pathname.includes('admin.html')) navigateHome();
    setTimeout(() => showSiteLoader(false), 1500);
}

document.addEventListener('DOMContentLoaded', initApp);
