document.addEventListener('DOMContentLoaded', () => {
    // --- AUTH CHECK ---
    const token = localStorage.getItem('auth_token');
    const userRole = localStorage.getItem('user_role');

    if (!token) {
        window.location.href = 'login.html';
        return;
    }

    const authHeaders = {
        'Authorization': `Bearer ${token}`
    };

    // Admin Check
    if (userRole === 'admin') {
        const adminLink = document.getElementById('admin-link');
        if (adminLink) adminLink.classList.remove('hidden');
    }

    // --- SELECTORS ---
    const photoInput = document.getElementById('photo-input');
    const recordsList = document.getElementById('records-list');
    const todayCountEl = document.getElementById('today-count');
    const totalCountEl = document.getElementById('total-count');

    // Overlays
    const analysisOverlay = document.getElementById('analysis-overlay');
    const analysisText = document.getElementById('analysis-text');
    const closeBtn = document.querySelector('.close-btn');
    const dashboardOverlay = document.getElementById('data-dashboard-overlay');
    const saveDetailsBtn = document.getElementById('save-details-btn');
    const wizardOverlay = document.getElementById('persona-wizard-overlay');

    // Persona UI
    const personaSwitcher = document.getElementById('persona-switcher');
    const personaDropdown = document.getElementById('persona-dropdown');
    const currentPersonaName = document.getElementById('current-persona-name');
    const btnAddPersona = document.getElementById('btn-add-persona');
    const btnLogout = document.getElementById('btn-logout');
    const personaListEl = document.getElementById('persona-list');

    // Wizard UI
    const btnWizardNext = document.getElementById('btn-wizard-next');
    const btnCreateBaby = document.getElementById('btn-create-baby');
    const btnCreateAdult = document.getElementById('btn-create-adult');

    // --- STATE ---
    let currentRecordId = null;
    let currentRecordPath = null;
    let currentPersona = null;
    let personas = [];
    let pendingAnalysisPromise = null; // Track background AI task
    let uploadTask = null; // Track active upload

    let dashboardData = {
        effort: null,
        sensation: 'complete',
        symptoms: [],
        triggers: [],
        location_context: null
    };

    let wizardData = {
        nickname: '',
        dob: '',
        gender: 'male'
    };

    let recordToDeleteOnClose = null; // Track rejected record for auto-deletion

    // --- I18N SYSTEM ---
    let appLang = localStorage.getItem('app_lang') || 'zh';
    const translations = {
        en: {
            // Dashboard
            app_title: 'Laleme',
            stat_today: 'Today',
            stat_trends: 'Trends (7d)',
            action_log: 'Log It Now',
            action_log_desc: 'Track your health daily',
            recent_history: 'Recent History',
            btn_save_analysis: 'Save & View Analysis',
            menu_settings: 'Settings',
            // Settings
            back_dashboard: 'Back to Dashboard',
            settings_title: 'App Settings',
            settings_subtitle: 'Manage preferences and family members.',
            section_general: 'General',
            section_profiles: 'Family Profiles',
            section_account: 'Account',
            language_label: 'Language',
            btn_add_profile: 'Add New Profile',
            btn_sign_out: 'Sign Out',
            delete_profile_confirm: 'Are you sure? This will delete the profile AND ALL associated records. This cannot be undone.',
            val_male: 'Male',
            val_female: 'Female',
            val_unknown: 'Unknown',
            // Persona Selector
            who_is_this_for: 'Who is this for?',
            select_profile_hint: 'Select the profile for this log',
            cancel: 'Cancel',
            // Log Details Modal
            log_details_title: 'Log Details',
            log_analyzing_subtitle: 'While we analyze...',
            lbl_straining: 'STRAINING / EFFORT',
            lbl_sensation: 'EVACUATION SENSATION',
            lbl_symptoms: 'SYMPTOMS',
            lbl_triggers: 'TRIGGERS',
            lbl_context: 'CONTEXT',
            val_easy: 'Easy',
            val_normal: 'Normal',
            val_hard: 'Hard',
            val_blocked: 'Blocked',
            val_complete: 'Complete',
            val_incomplete: 'Incomplete',
            btn_save_view: 'Save & View Analysis',
            loading_title: 'Analyzing your log...',
            loading_subtitle: 'Dr. AI is reviewing the sample',
            // AI Analysis Report
            ai_insights_title: 'AI Insights',
            btn_done: 'Done',
            user_record_title: 'USER RECORD',
            bristol_scale_title: 'BRISTOL SCALE',
            color_analysis_title: 'COLOR ANALYSIS',
            micro_features_title: 'MICRO-FEATURES',
            analysis_pending_title: 'Analysis Pending',
            analysis_pending_msg: 'Waiting for Dr. AI...<br>This creates a complex medical analysis.',
            btn_check_again: 'Check Again',
            btn_checking: 'Checking...',
            btn_delete_record: 'Delete this record',
            delete_confirm: 'Are you sure you want to delete this record?',
            delete_warning: 'This action cannot be undone.',
            analysis_rejected: 'Analysis Rejected',
            privacy_issue: 'Privacy Issue Detected',
            not_valid_sample: 'Not a valid sample',
            tap_reveal: 'Tap to Reveal',
            // Report Labels
            lbl_health: 'Health',
            lbl_grade: 'Grade',
            lbl_effort: 'Effort',
            lbl_context: 'Context',
            lbl_symptoms: 'Symptoms',
            lbl_triggers: 'Potential Triggers',
            lbl_constipated: 'Constipated',
            lbl_ideal: 'Ideal',
            lbl_diarrhea: 'Diarrhea',
            val_unknown: 'Unknown',
            val_no_tags: 'No tags',
            // Edit Profile Modal
            edit_profile_title: 'Edit Profile',
            update_details_for: 'Update details for',
            change_photo: 'Change Photo',
            crop_title: 'Adjust Photo',
            confirm: 'Confirm',
            cancel: 'Cancel',
            lbl_nickname: 'Nickname',
            lbl_dob: 'Date of Birth',
            lbl_gender: 'Gender',
            lbl_baby_specs: 'Baby Specifics',
            lbl_feeding: 'Feeding Method',
            lbl_stage: 'Current Stage',
            lbl_health_factors: 'Health Factors',
            lbl_conditions: 'Conditions',
            lbl_meds: 'Medications',
            btn_save_changes: 'Save Changes',
            val_male: 'Male',
            val_female: 'Female',
            val_breast: 'Breast',
            val_bottle: 'Formula',
            val_mixed: 'Mixed',
            val_newborn: 'Newborn',
            val_solids: 'Solids',
            val_weaning: 'Weaning',
            val_ibs: 'IBS',
            val_lactose: 'Lactose Intolerance',
            val_celiac: 'Celiac',
            val_none: 'None',
            val_probiotics: 'Probiotics',
            val_antibiotics: 'Antibiotics',
            val_laxatives: 'Laxatives',
            val_fiber: 'Fiber Supp.',
            // Common Tags (Mapping)
            tag_pain: 'Pain',
            tag_bloating: 'Bloating',
            tag_burning: 'Burning',
            tag_nausea: 'Nausea',
            tag_bleeding: 'Bleeding',
            tag_coffee: 'Coffee',
            tag_spicy: 'Spicy',
            tag_dairy: 'Dairy',
            tag_alcohol: 'Alcohol',
            tag_meds: 'Meds',
            tag_work: 'Work',
            tag_home: 'Home',
            tag_public: 'Public',
            tag_travel: 'Travel'
        },
        zh: {
            // Dashboard
            app_title: '拉了么',
            stat_today: '今日记录',
            stat_trends: '趋势 (7天)',
            action_log: '拉了！',
            action_log_desc: '',
            recent_history: '最近记录',
            btn_save_analysis: '保存并查看分析',
            menu_settings: '设置',
            // Settings
            back_dashboard: '返回主页',
            settings_title: '设置',
            settings_subtitle: '管理偏好设置和家庭成员',
            section_general: '通用',
            section_profiles: '家庭成员',
            section_account: '账户',
            language_label: '语言',
            btn_add_profile: '添加新成员',
            btn_sign_out: '退出登录',
            delete_profile_confirm: '确定要删除吗？这将删除该成员及其所有记录，且无法恢复。',
            val_male: '男',
            val_female: '女',
            val_unknown: '未知',
            // Persona Selector
            who_is_this_for: '这是谁拉的？',
            select_profile_hint: '请选择对应的家庭成员',
            cancel: '取消',
            // Log Details Modal
            log_details_title: '详细记录',
            log_analyzing_subtitle: 'AI 正在分析中...',
            lbl_straining: '排便费力程度',
            lbl_sensation: '排空感',
            lbl_symptoms: '身体感受/症状',
            lbl_triggers: '饮食与诱因',
            lbl_context: '在哪拉的',
            val_easy: '丝滑',
            val_normal: '正常',
            val_hard: '吃力',
            val_blocked: '极其困难',
            val_complete: '已排空',
            val_incomplete: '没拉干净',
            btn_save_view: '保存并查看分析',
            loading_title: '正在分析您的记录...',
            loading_subtitle: 'AI 医生正在审核样本',
            // AI Analysis Report
            ai_insights_title: '这一坨拉得如何？',
            btn_done: '完成',
            user_record_title: '用户记录',
            bristol_scale_title: '布里斯托分类',
            color_analysis_title: '颜色分析',
            micro_features_title: '微观特征',
            analysis_pending_title: '分析进行中',
            analysis_pending_msg: '正在等待 AI 医生...<br>这可能需要一点时间。',
            btn_check_again: '再次检查',
            btn_checking: '检查中...',
            btn_delete_record: '删除此记录',
            delete_confirm: '确定要删除这条记录吗？',
            delete_warning: '此操作无法撤销。',
            analysis_rejected: '分析被拒绝',
            privacy_issue: '检测到隐私问题',
            not_valid_sample: '无效的样本',
            tap_reveal: '点击查看原图',
            // Report Labels
            lbl_health: '健康度',
            lbl_grade: '评级',
            lbl_effort: '费力程度',
            lbl_context: '场景',
            lbl_symptoms: '症状',
            lbl_triggers: '潜在诱因',
            lbl_constipated: '便秘',
            lbl_ideal: '理想',
            lbl_diarrhea: '腹泻',
            val_unknown: '未知',
            val_no_tags: '无标签',
            // Edit Profile Modal
            edit_profile_title: '编辑资料',
            update_details_for: '更新资料：',
            change_photo: '更换照片',
            crop_title: '调整照片',
            confirm: '确认',
            cancel: '取消',
            lbl_nickname: '昵称',
            lbl_dob: '出生日期',
            lbl_gender: '性别',
            lbl_baby_specs: '宝宝专属',
            lbl_feeding: '喂养方式',
            lbl_stage: '当前阶段',
            lbl_health_factors: '健康因素',
            lbl_conditions: '健康状况',
            lbl_meds: '药物/补剂',
            btn_save_changes: '保存更改',
            val_male: '男',
            val_female: '女',
            val_breast: '母乳',
            val_bottle: '配方奶',
            val_mixed: '混合喂养',
            val_newborn: '新生儿',
            val_solids: '辅食期',
            val_weaning: '断奶期',
            val_ibs: 'IBS (肠易激)',
            val_lactose: '乳糖不耐受',
            val_celiac: '乳糜泻',
            val_none: '无',
            val_probiotics: '益生菌',
            val_antibiotics: '抗生素',
            val_laxatives: '泻药',
            val_fiber: '纤维补充剂',
            // Common Tags (Mapping - Simplified for Zh)
            tag_pain: '疼痛',
            tag_bloating: '胀气',
            tag_burning: '灼烧感',
            tag_nausea: '恶心',
            tag_bleeding: '便血',
            tag_coffee: '咖啡',
            tag_spicy: '辛辣',
            tag_dairy: '乳制品',
            tag_alcohol: '酒精',
            tag_meds: '药物',
            tag_work: '公司',
            tag_home: '家里',
            tag_public: '公厕',
            tag_travel: '旅行中',
            tag_hotel: '酒店'
        }
    };

    window.setLanguage = (lang) => {
        appLang = lang;
        localStorage.setItem('app_lang', lang);
        applyLanguage();
        // Update UI toggle state if exists
        document.querySelectorAll('.segment-option').forEach(el => {
            if (el.id === `lang-${lang}`) el.classList.add('selected');
            else if (el.id.startsWith('lang-')) el.classList.remove('selected');
        });
    };

    function applyLanguage() {
        const t = translations[appLang];

        // 1. Static Elements
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.dataset.i18n;
            if (t[key] !== undefined) el.textContent = t[key];
        });

        // 2. Initial Toggle State
        const langToggle = document.getElementById(`lang-${appLang}`);
        if (langToggle) {
            document.querySelectorAll('[id^="lang-"]').forEach(e => e.classList.remove('selected'));
            langToggle.classList.add('selected');
        }

        // 3. Dynamic Calls (force refresh if modals are open? No, rely on re-rendering)
    }

    // Helper to get translation or fallback
    function tr(key) {
        return translations[appLang][key] || key;
    }

    // Init Language
    // Inject Loading Overlay (Before applyLanguage so it gets translated)
    const loadingOverlay = document.createElement('div');
    loadingOverlay.className = 'loading-overlay';
    loadingOverlay.innerHTML = `
        <div class="spinner"></div>
        <div class="loading-text" data-i18n="loading_title">Analyzing your log...</div>
        <div class="loading-subtext" data-i18n="loading_subtitle">Dr. AI is reviewing the sample</div>
    `;
    document.body.appendChild(loadingOverlay);

    // Init Language
    applyLanguage();


    // --- FUNCTION DEFINITIONS (Hoisted or Order matters, putting helpers first) ---

    function logout() {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user_role');
        window.location.href = 'login.html';
    }
    window.logout = logout; // Expose for inline onclick

    async function loadPersonas() {
        try {
            const res = await fetch('/api/personas', { headers: authHeaders });
            if (res.status === 401) return logout();

            const json = await res.json();
            personas = json.data;

            if (personas.length === 0) {
                openWizard();
                if (currentPersonaName) currentPersonaName.textContent = "Guest";
            } else {
                // Load last used or first
                const savedId = localStorage.getItem('current_persona_id');
                const target = personas.find(p => p.id == savedId) || personas[0];
                switchPersona(target);
            }
        } catch (err) {
            console.error("Failed to load personas", err);
        }
    }

    function switchPersona(persona) {
        currentPersona = { ...persona };

        // Calculate age for context flag
        const birthDate = new Date(persona.dob);
        const ageInMonths = (new Date() - birthDate) / (1000 * 60 * 60 * 24 * 30.44);
        currentPersona.is_baby = ageInMonths < 12;
        currentPersona.age_desc = currentPersona.is_baby ? `${Math.floor(ageInMonths)} months` : `${Math.floor(ageInMonths / 12)} years`;

        // Update UI
        if (currentPersonaName) currentPersonaName.textContent = persona.nickname;
        localStorage.setItem('current_persona_id', persona.id);

        // Render Dropdown List
        renderPersonaList();

        // Reload Data
        fetchRecords();
    }

    function renderPersonaList() {
        if (!personaListEl) return;
        personaListEl.innerHTML = '';
        personas.forEach(p => {
            const div = document.createElement('div');
            div.className = 'persona-option';
            if (currentPersona && p.id === currentPersona.id) div.style.color = 'var(--text-main)';
            div.innerHTML = `<i class="ph-bold ph-user"></i> ${p.nickname}`;
            div.onclick = () => {
                switchPersona(p);
                if (personaDropdown) personaDropdown.classList.add('hidden');
            };
            personaListEl.appendChild(div);
        });
    }

    function openWizard() {
        if (wizardOverlay) wizardOverlay.classList.remove('hidden');
        document.getElementById('wizard-step-1').classList.remove('hidden');
        document.getElementById('wizard-step-baby').classList.add('hidden');
        document.getElementById('wizard-step-adult').classList.add('hidden');
        // Reset inputs
        const nickInput = document.getElementById('persona-nickname');
        if (nickInput) nickInput.value = '';
        const dobInput = document.getElementById('persona-dob');
        if (dobInput) dobInput.value = '';
    }

    async function createPersona(payload) {
        try {
            const res = await fetch('/api/personas', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...authHeaders
                },
                body: JSON.stringify(payload)
            });

            if (res.status === 401) return logout();

            const json = await res.json();
            if (res.ok) {
                const newPersona = json.data;
                personas.push(newPersona);
                if (wizardOverlay) wizardOverlay.classList.add('hidden'); // Close wizard
                switchPersona(newPersona); // Switch to new
            } else {
                alert("Error: " + json.error);
            }
        } catch (err) {
            console.error(err);
            alert("Creation failed");
        }
    }

    function resetDashboard() {
        dashboardData = { effort: null, sensation: 'complete', symptoms: [], triggers: [], location_context: null };
        document.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
        const sensationToggle = document.getElementById('sensation-toggle');
        if (sensationToggle) sensationToggle.checked = false;
    }

    async function triggerAnalysisInBackground(imagePath) {
        // Prepare Context based on current Persona
        const context = {
            age_desc: currentPersona.age_desc,
            is_baby: currentPersona.is_baby,
            baby_feeding: currentPersona.baby_feeding,
            baby_stage: currentPersona.baby_stage,
            adult_health: currentPersona.adult_health,
            adult_meds: currentPersona.adult_meds
        };

        try {
            const res = await fetch('/api/analyze', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...authHeaders
                },
                body: JSON.stringify({ image_path: imagePath, context: context, lang: appLang })
            });
            return await res.json(); // Return promise
        } catch (err) {
            console.error("Background analysis failed", err);
            throw err;
        }
    }

    async function checkAndShowAnalysis(imagePath) {
        try {
            const res = await fetch('/api/records?persona_id=' + (currentPersona ? currentPersona.id : ''), { headers: authHeaders });
            const json = await res.json();
            const record = json.data.find(r => r.image_path === imagePath);
            if (record && record.ai_analysis) showAnalysis(record); // Pass full record
            else showAnalysis({ ...record, ai_analysis: null }); // Pass pseudo record so pending works
        } catch (err) { console.error(err); }
    }

    async function fetchRecords() {
        if (!currentPersona) return;
        try {
            const res = await fetch(`/api/records?persona_id=${currentPersona.id}`, { headers: authHeaders });
            if (res.status === 401) return logout();

            const json = await res.json();
            const records = json.data;
            updateStats(records);
            renderList(records);
        } catch (err) { console.error("Failed to fetch records", err); }
    }

    function updateStats(records) {
        const todayFn = new Date();
        const pastDate = new Date();
        pastDate.setDate(todayFn.getDate() - 7);

        const last7Count = records.filter(r => new Date(r.created_at) >= pastDate).length;
        if (totalCountEl) totalCountEl.textContent = last7Count;

        const todayStr = todayFn.toISOString().split('T')[0];
        const todayCount = records.filter(r => r.created_at.startsWith(todayStr)).length;
        if (todayCountEl) todayCountEl.textContent = todayCount;
    }

    function renderList(records) {
        if (!recordsList) return;
        recordsList.innerHTML = '';

        if (records.length === 0) {
            recordsList.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted);">No records for this profile yet.</div>';
            return;
        }

        records.forEach(record => {
            const date = new Date(record.created_at);
            const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            // --- PARSE AI DATA ---
            let ai = {};
            try { ai = typeof record.ai_analysis === 'string' ? JSON.parse(record.ai_analysis) : (record.ai_analysis || {}); } catch (e) { }

            // 1. Grade (Fallback Logic)
            let grade = ai.health_score || '?';
            let gradeColorClass = 'grade-b'; // Default yellow
            if (grade === '?') {
                const b = record.stool_type;
                if (b === 4) grade = 'A+';
                else if (b === 3) grade = 'A';
                else if (b === 2) grade = 'B';
                else if (b === 5) grade = 'B-';
                else if (b === 1) grade = 'C';
                else if (b === 6) grade = 'C-';
                else if (b >= 7) grade = 'D';
            }

            // Map Grade String to Color Class
            if (grade.startsWith('A')) gradeColorClass = 'grade-a';
            else if (grade.startsWith('B')) gradeColorClass = 'grade-b';
            else if (grade.startsWith('C')) gradeColorClass = 'grade-c';
            else if (grade.startsWith('D')) gradeColorClass = 'grade-d'; // Red
            else gradeColorClass = 'grade-d'; // Default fail for anything else

            // 2. Summary
            const summary = ai.short_summary || ai.summary || "Analysis pending...";

            // 3. Tags (Icons)
            let tagsHtml = '';
            if (record.effort >= 3) tagsHtml += `<div class="mini-tag"><i class="ph-fill ph-smiley-sad"></i> ${tr('val_effort_hard')}</div>`;
            if (record.location_context) {
                const ctxKey = `tag_${record.location_context.toLowerCase()}`;
                tagsHtml += `<div class="mini-tag"><i class="ph-fill ph-map-pin"></i> ${tr(ctxKey) || record.location_context}</div>`;
            }
            if (ai.texture?.has_blood) tagsHtml += `<div class="mini-tag" style="color:#ef4444;"><i class="ph-fill ph-warning"></i> ${tr('tag_bleeding')}</div>`;
            if (ai.texture?.has_mucus) tagsHtml += `<div class="mini-tag"><i class="ph-fill ph-drop"></i> Mucus</div>`; // 'Mucus' not in dictionary yet? Added? No, missed it. Adding mapping logic.

            // 4. Color Dot
            const hex = ai.color_hex || '#8B4513';
            const colorName = ai.color?.primary || 'Unknown';

            // --- BUILD CARD ---
            const card = document.createElement('div');
            card.className = 'data-card';
            card.innerHTML = `
                <!-- LEFT: Grade -->
                <div class="grade-section">
                    <div class="grade-badge ${gradeColorClass}">${grade}</div>
                    <div class="grade-label">${tr('lbl_health')}</div>
                </div>

                <!-- MIDDLE: Info -->
                <div class="info-section">
                    <div class="short-summary">${summary}</div>
                    <div class="tag-row">
                        ${tagsHtml || `<div class="mini-tag">${tr('val_no_tags')}</div>`}
                    </div>
                </div>

                <!-- RIGHT: Meta -->
                <div class="meta-section">
                    <div class="time-badge">${timeStr}</div>
                    <div class="color-indicator">
                        <div class="color-dot" style="background-color: ${hex};"></div>
                        <span class="color-text">${colorName}</span>
                    </div>
                </div>
            `;

            // Interaction
            card.addEventListener('click', () => {
                showAnalysis(record);
            });

            recordsList.appendChild(card);
        });
    }

    function showAnalysis(record) {
        recordToDeleteOnClose = null; // Reset
        let data = null;
        let isPending = false;

        const analysisStr = record.ai_analysis;
        if (!analysisStr || analysisStr === 'null' || analysisStr === 'undefined') {
            isPending = true;
        } else {
            try {
                data = typeof analysisStr === 'string' ? JSON.parse(analysisStr) : (analysisStr || {});
            } catch (e) {
                console.error(e);
                isPending = true;
            }
        }

        if (!isPending && data.validity && (!data.validity.is_stool || data.validity.privacy_issue)) {
            recordToDeleteOnClose = record.id; // Mark for deletion on close
            renderRejection(data.validity, record);
            if (analysisOverlay) {
                analysisOverlay.classList.remove('hidden');
                // Force scroll reset after visible
                const card = analysisOverlay.querySelector('.modal-card');
                const body = analysisOverlay.querySelector('.modal-body');
                if (card) card.scrollTop = 0;
                if (body) body.scrollTop = 0;
            }
            return;
        }

        renderMedicalReport(data, record, isPending);
        if (analysisOverlay) {
            analysisOverlay.classList.remove('hidden');
            // Force scroll reset after visible
            const card = analysisOverlay.querySelector('.modal-card');
            const body = analysisOverlay.querySelector('.modal-body');
            if (card) card.scrollTop = 0;
            if (body) body.scrollTop = 0;
        }
    }

    function renderRejection(validity, record) {
        const reason = validity.privacy_issue ? tr('privacy_issue') : (validity.rejection_reason || tr('not_valid_sample'));

        let html = `
            <div class="report-container" style="text-align:center; padding-top:20px;">
                 <div class="rejection-icon-wrapper" style="margin-bottom:20px;">
                    <i class="ph-fill ph-warning-octagon" style="font-size:3.5rem; color:#ef4444; filter: drop-shadow(0 4px 12px rgba(239,68,68,0.3));"></i>
                 </div>
                 

                     
                 <h3 style="font-size:1.4rem; margin-bottom:12px;">${tr('analysis_rejected')}</h3>
                 
                 <div style="background:rgba(255,255,255,0.05); padding:16px; border-radius:12px; margin-bottom:30px; border:1px solid rgba(255,255,255,0.1);">
                    <p style="color:var(--text-muted); line-height:1.5;">${reason}</p>
                 </div>
            </div>
        `;

        if (analysisText) analysisText.innerHTML = html;
        // No delete button binding needed
    }

    function renderMedicalReport(data, record, isPending) {
        let html = '';

        if (isPending) {
            html = `
                <div class="report-container" style="text-align:center; padding-top:40px;">
                     <!-- Blurred Image (Still show if exists) -->
                    ${record.image_path ? `
                    <div class="modal-image-container" style="margin-bottom:30px;">
                        <img src="${record.image_path}" class="detail-img blurred" id="detail-img-preview">
                    </div>
                    ` : ''}
                    
                    <div class="spinner" style="margin:0 auto 20px auto;"></div>
                    <h3 style="color:white; margin-bottom:10px;">${tr('analysis_pending_title')}</h3>
                    <p style="color:var(--text-muted); font-size:0.9rem; margin-bottom:30px;">
                        ${tr('analysis_pending_msg')}
                    </p>

                    <button id="btn-retry-analysis" class="primary-btn" style="width:auto; padding:0 30px; margin-bottom:20px;">
                        <i class="ph-bold ph-arrows-clockwise"></i> ${tr('btn_check_again')}
                    </button>
                    
                    <div style="margin-top:20px;">
                        <button id="btn-delete-record" style="background:transparent; border:none; color:#ef4444; opacity:0.6; cursor:pointer; text-decoration:underline;">
                            ${tr('btn_delete_record')}
                        </button>
                    </div>
                </div>
            `;
        } else {
            const bristolScale = data.bristol?.scale || 0;
            const scaleDesc = data.bristol?.description || 'Unknown';
            const warningLevel = data.color?.warning_level || 'none';
            const warningColor = warningLevel === 'danger' ? '#ef4444' : (warningLevel === 'warning' ? '#f59e0b' : '#ccf381');

            const effortMap = {
                1: `😌 ${tr('val_easy')}`,
                2: `😐 ${tr('val_normal')}`,
                3: `😣 ${tr('val_hard')}`,
                4: `🥵 ${tr('val_blocked')}`
            };
            const symptoms = record.symptoms ? (typeof record.symptoms === 'string' ? JSON.parse(record.symptoms) : record.symptoms) : [];
            const triggers = record.triggers ? (typeof record.triggers === 'string' ? JSON.parse(record.triggers) : record.triggers) : [];

            html = `
                <div class="report-container">
                    <!-- BLURRED IMAGE SECTION -->
                    ${record.image_path ? `
                    <div class="modal-image-container">
                        <img src="${record.image_path}" class="detail-img blurred" id="detail-img-preview">
                        <div class="reveal-btn" onclick="document.getElementById('detail-img-preview').classList.toggle('blurred')">
                            <i class="ph-fill ph-eye"></i> ${tr('tap_reveal')}
                        </div>
                    </div>
                    ` : ''}

                    <!-- HEADER -->
                    <div class="hero-score-container">
                        <span class="hero-date">${new Date(record.created_at).toLocaleString(appLang === 'zh' ? 'zh-CN' : 'en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                        <div class="hero-grade ${data.health_score?.startsWith('A') ? 'grade-a' : (data.health_score?.startsWith('B') ? 'grade-b' : (data.health_score?.startsWith('C') ? 'grade-c' : 'grade-d'))}">
                            ${data.health_score || 'B'}
                        </div>
                        <div class="hero-comment">"${data.short_summary || data.summary?.split('.')[0] || 'Analysis complete'}"</div>
                    </div>

                    <!-- USER LOGS -->
                    <div class="report-section">
                        <div class="section-title"><i class="ph-fill ph-notebook"></i> ${tr('user_record_title')}</div>
                        
                        <div class="user-stats-grid">
                            <div class="stat-box">
                                <span class="stat-label">${tr('lbl_effort')}</span>
                                <div class="stat-value">${effortMap[record.effort] || '-'}</div>
                            </div>
                            <div class="stat-box">
                                <span class="stat-label">${tr('lbl_context')}</span>
                                <div class="stat-value">
                                    <i class="ph-fill ph-map-pin" style="color:var(--accent-purple);"></i>
                                    <span style="text-transform:capitalize;">${tr(`tag_${record.location_context?.toLowerCase()}`) || record.location_context || '-'}</span>
                                </div>
                            </div>
                        </div>

                        ${symptoms.length > 0 ? `
                            <span class="subsection-label">${tr('lbl_symptoms')}</span>
                            <div class="tags-container">
                                ${symptoms.map(s => `<span class="feature-tag warning">${tr('tag_' + s.toLowerCase()) || s}</span>`).join('')}
                            </div>
                        ` : ''}

                        ${triggers.length > 0 ? `
                            <span class="subsection-label">${tr('lbl_triggers')}</span>
                            <div class="tags-container">
                                ${triggers.map(t => `<span class="feature-tag" style="background:rgba(255,255,255,0.1);"><i class="ph-bold ph-lightning" style="color:#fbbf24;"></i> ${tr('tag_' + t.toLowerCase()) || t}</span>`).join('')}
                            </div>
                        ` : ''}
                    </div>

                    <!-- AI ANALYSIS -->
                    <div class="report-section">
                        <div class="section-title"><i class="ph-fill ph-chart-bar-horizontal"></i> ${tr('bristol_scale_title')} (Type ${bristolScale})</div>
                        <div class="bristol-gauge">
                            <div class="gauge-track">
                                <div class="gauge-fill" style="width: ${(bristolScale / 7) * 100}%; background-color: ${getBristolColor(bristolScale)}"></div>
                            </div>
                            <div class="gauge-labels">
                                <span>${tr('lbl_constipated')}</span>
                                <span>${tr('lbl_ideal')}</span>
                                <span>${tr('lbl_diarrhea')}</span>
                            </div>
                        </div>
                        <p class="section-desc">${scaleDesc}</p>
                    </div>

                    <div class="report-section">
                        <div class="section-title"><i class="ph-fill ph-palette"></i> ${tr('color_analysis_title')}</div>
                        <div class="color-badge" style="color: ${warningColor};">
                            <!-- Header: Color Name + Icon -->
                            <div class="color-name" style="color:#fff;">
                                ${data.color?.primary || 'Unknown'}
                                ${warningLevel === 'none' || warningLevel === 'good'
                    ? `<i class="ph-fill ph-check-circle" style="color:var(--accent-lime);"></i>`
                    : `<i class="ph-fill ph-warning" style="color:${warningColor};"></i>`
                }
                            </div>
                            
                            <!-- Description / Disclaimer -->
                            <div class="color-desc">
                                ${data.color?.medical_disclaimer || 'No specific medical notes for this color.'}
                            </div>
                        </div>
                    </div>

                    <div class="report-section">
                        <div class="section-title"><i class="ph-fill ph-microscope"></i> ${tr('micro_features_title')}</div>
                        <div class="tags-container">
                            ${(data.texture?.undigested_food || []).map(f => `<span class="feature-tag">${f}</span>`).join('')}
                            ${data.texture?.has_mucus ? '<span class="feature-tag warning">Mucus</span>' : ''}
                            ${data.texture?.has_blood ? '<span class="feature-tag danger">Blood</span>' : ''}
                            ${data.texture?.is_greasy ? '<span class="feature-tag warning">Greasy</span>' : ''}
                            ${(!data.texture?.has_mucus && !data.texture?.has_blood && !data.texture?.is_greasy && (!data.texture?.undigested_food || data.texture.undigested_food.length === 0)) ? '<span class="feature-tag good">Clear</span>' : ''}
                        </div>
                    </div>

                    <div class="report-summary">
                        <i class="ph-fill ph-quotes"></i>
                        <p>${data.summary}</p>
                    </div>

                    <!-- DELETE ACTION -->
                    <div style="margin-top:40px; text-align:center;">
                        <button id="btn-delete-record" style="background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.2); color:#ef4444; padding:8px 16px; border-radius:100px; font-size:0.85rem; cursor:pointer; display:inline-flex; align-items:center; gap:6px;">
                            <i class="ph-fill ph-trash"></i> ${tr('btn_delete_record')}
                        </button>
                        <div style="margin-top:8px; font-size:0.7rem; color:var(--text-muted); opacity:0.6;">${tr('delete_warning')}</div>
                    </div>
                </div>
            `;
        }

        if (analysisText) analysisText.innerHTML = html;

        setTimeout(() => {
            const retryBtn = document.getElementById('btn-retry-analysis');
            if (retryBtn) retryBtn.onclick = async () => {
                retryBtn.textContent = 'Checking...';
                await fetchRecords();
                const res = await fetch(`/api/records?persona_id=${currentPersona.id}`, { headers: authHeaders });
                const json = await res.json();
                const freshRecord = json.data.find(r => r.id === record.id);
                showAnalysis(freshRecord);
            };

            const delBtn = document.getElementById('btn-delete-record');
            if (delBtn) delBtn.onclick = () => deleteRecord(record.id);
        }, 100);
    }

    async function deleteRecord(id, silent = false) {
        if (!silent && !confirm(tr('delete_confirm'))) return;
        try {
            const res = await fetch(`/api/records/${id}`, { method: 'DELETE', headers: authHeaders });
            if (res.ok) {
                analysisOverlay.classList.add('hidden');
                fetchRecords();
            } else {
                alert("Delete failed");
            }
        } catch (e) { console.error(e); }
    }

    function getBristolColor(scale) {
        if (scale <= 2) return '#f59e0b';
        if (scale >= 3 && scale <= 4) return '#ccf381';
        if (scale >= 5) return '#ef4444';
        return '#888';
    }


    // --- EVENT LISTENERS ---

    // 1. File Upload
    let pendingUploadFile = null; // Store for overlay

    if (photoInput) photoInput.addEventListener('change', async (e) => {
        if (e.target.files.length === 0) return;

        // Multi-Persona Check
        if (personas.length > 1) {
            e.preventDefault();
            pendingUploadFile = e.target.files[0];
            showPersonaSelector(pendingUploadFile);
            return;
        }

        if (!currentPersona) {
            alert("Please create a profile first.");
            return;
        }

        performUpload(e.target.files[0], currentPersona.id);
    });

    // --- Helper: Show Persona Selector ---
    function showPersonaSelector(file) {
        const overlay = document.getElementById('persona-selector-overlay');
        const previewImg = document.getElementById('persona-selector-preview'); // Changed from bg
        const grid = document.getElementById('persona-selector-grid');

        // Set Preview Image
        const reader = new FileReader();
        reader.onload = (e) => {
            previewImg.src = e.target.result;
        };
        reader.readAsDataURL(file);

        // Render Grid
        grid.innerHTML = personas.map(p => `
            <div class="persona-avatar-btn" onclick="handlePersonaSelection('${p.id}')">
                <div class="avatar-circle-large" style="${p.specifics?.gender === 'female' ? 'border-color:#f472b6' : ''}">
                    ${p.nickname[0].toUpperCase()}
                </div>
                <div class="name">${p.nickname}</div>
            </div>
        `).join('');

        // Translate Header
        overlay.querySelector('h3').textContent = tr('who_is_this_for');
        const hintEl = overlay.querySelector('.sub-text') || overlay.querySelector('p');
        if (hintEl) hintEl.textContent = tr('select_profile_hint');
        document.getElementById('btn-cancel-upload').innerHTML = `<i class="ph-bold ph-x"></i> ${tr('cancel')}`;

        overlay.classList.remove('hidden');

        // Bind Cancel
        document.getElementById('btn-cancel-upload').onclick = () => {
            overlay.classList.add('hidden');
            photoInput.value = ''; // Reset input
            pendingUploadFile = null;
        };
    }

    // --- Helper: Handle Selection ---
    window.handlePersonaSelection = (personaId) => {
        const selected = personas.find(p => p.id == personaId);
        if (selected) {
            switchPersona(selected); // Switch context
            document.getElementById('persona-selector-overlay').classList.add('hidden');
            performUpload(pendingUploadFile, personaId);
        }
    };

    // --- Helper: Perform Actual Upload ---
    // --- Helper: Perform Actual Upload ---
    async function performUpload(file, personaId) {
        // 1. Show UI Immediately
        resetDashboard();
        dashboardOverlay.classList.remove('hidden');
        // Reset Scroll
        const card = dashboardOverlay.querySelector('.modal-card');
        const body = dashboardOverlay.querySelector('.dashboard-body');
        if (card) card.scrollTop = 0;
        if (body) body.scrollTop = 0;

        // Check scroll hint
        if (window.triggerScrollCheck) setTimeout(window.triggerScrollCheck, 100);


        const formData = new FormData();
        formData.append('photo', file);
        formData.append('stool_type', 4);
        formData.append('color', 'unknown');
        formData.append('note', 'Auto-captured');
        formData.append('persona_id', personaId);
        formData.append('lang', appLang);

        // 2. Start Upload (Async)
        uploadTask = (async () => {
            try {
                const res = await fetch('/api/records', {
                    method: 'POST',
                    headers: { ...authHeaders },
                    body: formData
                });

                if (res.status === 401 || res.status === 403) {
                    logout();
                    throw new Error("Auth failed");
                }

                if (res.ok) {
                    const result = await res.json();
                    currentRecordId = result.data.id;
                    currentRecordPath = result.data.image_path;

                    // Trigger AI
                    pendingAnalysisPromise = triggerAnalysisInBackground(currentRecordPath);

                    // Refresh list
                    fetchRecords();

                    return result.data;
                } else {
                    throw new Error("Upload failed");
                }
            } catch (err) {
                console.error(err);
                alert("Error uploading file. Please try again.");
                dashboardOverlay.classList.add('hidden');
                throw err;
            } finally {
                uploadTask = null; // Reset
            }
        })();

        photoInput.value = ''; // Reset
    }

    if (personaSwitcher) {
        personaSwitcher.addEventListener('click', (e) => {
            e.stopPropagation();
            personaDropdown.classList.toggle('hidden');
        });
    }

    if (btnAddPersona) btnAddPersona.addEventListener('click', () => openWizard());
    if (btnLogout) btnLogout.addEventListener('click', logout);

    // 3. Wizard & Dashboard Controls
    if (btnWizardNext) {
        btnWizardNext.addEventListener('click', () => {
            const nickInput = document.getElementById('persona-nickname');
            const dobInput = document.getElementById('persona-dob');
            const genderEl = document.querySelector('#gender-control .selected');

            if (!nickInput || !dobInput) return; // Should not happen if btnWizardNext exists

            const nick = nickInput.value;
            const dob = dobInput.value;

            if (!nick || !dob) return alert("Nickname and DOB are required!");

            wizardData.nickname = nick;
            wizardData.dob = dob;
            wizardData.gender = genderEl ? genderEl.dataset.value : 'male';

            const birthDate = new Date(dob);
            const ageInMonths = (new Date() - birthDate) / (1000 * 60 * 60 * 24 * 30.44);

            document.getElementById('wizard-step-1').classList.add('hidden');

            if (ageInMonths < 12) {
                document.getElementById('wizard-step-baby').classList.remove('hidden');
                wizardData.is_baby = true;
            } else {
                document.getElementById('wizard-step-adult').classList.remove('hidden');
                wizardData.is_baby = false;
            }
        });
    }

    // Gender Selection
    document.querySelectorAll('#gender-control .segment-option').forEach(el => {
        el.addEventListener('click', () => {
            document.querySelectorAll('#gender-control .segment-option').forEach(s => s.classList.remove('selected'));
            el.classList.add('selected');
        });
    });

    if (btnCreateBaby) {
        btnCreateBaby.addEventListener('click', () => {
            const feedingEl = document.querySelector('#baby-feeding-options .grid-option.selected');
            const stageEl = document.querySelector('#baby-stage-options .grid-option.selected');
            if (!feedingEl) return alert("Please select a feeding method!");

            const payload = {
                ...wizardData,
                baby_feeding: feedingEl.dataset.value,
                baby_stage: stageEl ? stageEl.dataset.value : 'New'
            };
            createPersona(payload);
        });
    }

    if (btnCreateAdult) {
        btnCreateAdult.addEventListener('click', () => {
            const health = Array.from(document.querySelectorAll('#adult-health-tags .tag.selected')).map(el => el.dataset.value);
            const meds = Array.from(document.querySelectorAll('#adult-meds-tags .tag.selected')).map(el => el.dataset.value);

            const payload = {
                ...wizardData,
                adult_health: health,
                adult_meds: meds
            };
            createPersona(payload);
        });
    }

    function setupSelection(selector, type = 'single') {
        document.querySelectorAll(selector).forEach(el => {
            el.addEventListener('click', () => {
                if (type === 'single') {
                    el.parentElement.querySelectorAll(el.className.split(' ')[0]).forEach(s => s.classList.remove('selected'));
                    el.classList.add('selected');
                } else {
                    el.classList.toggle('selected');
                }
            });
        });
    };
    setupSelection('#baby-feeding-options .grid-option');
    setupSelection('#baby-stage-options .grid-option');
    setupSelection('#adult-health-tags .tag', 'multi');
    setupSelection('#adult-meds-tags .tag', 'multi');

    // Dashboard Inputs
    document.querySelectorAll('.effort-option').forEach(el => {
        el.addEventListener('click', () => {
            document.querySelectorAll('.effort-option').forEach(e => e.classList.remove('selected'));
            el.classList.add('selected');
            dashboardData.effort = parseInt(el.dataset.value);
        });
    });

    const sensationToggle = document.getElementById('sensation-toggle');
    if (sensationToggle) sensationToggle.addEventListener('change', (e) => dashboardData.sensation = e.target.checked ? 'incomplete' : 'complete');

    document.querySelectorAll('#symptoms-tags .tag').forEach(el => {
        el.addEventListener('click', () => {
            el.classList.toggle('selected');
            const val = el.dataset.value;
            if (el.classList.contains('selected')) dashboardData.symptoms.push(val);
            else dashboardData.symptoms = dashboardData.symptoms.filter(i => i !== val);
        });
    });

    document.querySelectorAll('#triggers-grid .icon-item').forEach(el => {
        el.addEventListener('click', () => {
            el.classList.toggle('selected');
            const val = el.dataset.value;
            if (el.classList.contains('selected')) dashboardData.triggers.push(val);
            else dashboardData.triggers = dashboardData.triggers.filter(i => i !== val);
        });
    });

    document.querySelectorAll('.context-btn').forEach(el => {
        el.addEventListener('click', () => {
            document.querySelectorAll('.context-btn').forEach(e => e.classList.remove('selected'));
            el.classList.add('selected');
            dashboardData.location_context = el.dataset.value;
        });
    });

    if (saveDetailsBtn) saveDetailsBtn.addEventListener('click', async () => {
        // Show Spinner
        loadingOverlay.classList.add('visible');

        try {
            // 0. Ensure Upload is Complete
            if (!currentRecordId && uploadTask) {
                await uploadTask;
            }
            if (!currentRecordId) throw new Error("No record ID available (Upload failed?)");

            const res = await fetch(`/api/records/${currentRecordId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    ...authHeaders
                },
                body: JSON.stringify(dashboardData)
            });
            if (res.status === 401) return logout();

            // WAIT for Analysis to finish (if pending)
            if (pendingAnalysisPromise) {
                try {
                    await pendingAnalysisPromise;
                    pendingAnalysisPromise = null;
                } catch (e) {
                    console.error("Analysis failed during wait:", e);
                }
            }

            await fetchRecords();
            dashboardOverlay.classList.add('hidden');

            // Hide Spinner
            loadingOverlay.classList.remove('visible');

            checkAndShowAnalysis(currentRecordPath);
        } catch (err) {
            console.error(err);
            loadingOverlay.classList.remove('visible');
            alert("Failed to save details.");
            dashboardOverlay.classList.add('hidden');
        }
        saveDetailsBtn.textContent = 'Save & View Analysis';
    });

    // --- SCROLL HINT OVERLAY ---
    const dashboardBody = document.querySelector('.dashboard-body');
    const modalCard = document.querySelector('#dashboard-overlay .modal-card');

    if (dashboardBody && modalCard) {
        // Create Hint Element
        let scrollHint = document.createElement('div');
        scrollHint.className = 'scroll-more-hint';
        scrollHint.innerHTML = '<i class="ph-bold ph-caret-double-down"></i>';
        modalCard.appendChild(scrollHint);

        function checkScroll() {
            // Buffer of 30px
            const isBottom = dashboardBody.scrollTop + dashboardBody.clientHeight >= dashboardBody.scrollHeight - 30;
            const hasOverflow = dashboardBody.scrollHeight > dashboardBody.clientHeight;

            if (!isBottom && hasOverflow) {
                scrollHint.classList.add('visible');
            } else {
                scrollHint.classList.remove('visible');
            }
        }

        dashboardBody.addEventListener('scroll', checkScroll);
        window.addEventListener('resize', checkScroll);

        // Expose to resetDashboard
        window.triggerScrollCheck = checkScroll;
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            if (analysisOverlay) analysisOverlay.classList.add('hidden');
            if (recordToDeleteOnClose) {
                deleteRecord(recordToDeleteOnClose, true); // Silent delete
                recordToDeleteOnClose = null;
            }
        });
    }

    // --- INITIAL START ---
    if (window.location.pathname.endsWith('settings.html')) {
        loadProfilesForManagement();
        setupEditInteractions();

        // Bind Add New
        const btnAddNew = document.getElementById('btn-add-new');
        if (btnAddNew) btnAddNew.onclick = () => {
            // Minimal Add:
            document.getElementById('edit-id').value = ''; // Empty ID = New
            document.getElementById('edit-name-display').textContent = 'New Profile';
            document.getElementById('edit-nickname').value = '';
            document.getElementById('edit-dob').value = '';

            // Reset Avatar UI
            document.getElementById('edit-avatar-upload').value = '';
            document.getElementById('edit-avatar-img').style.display = 'none';
            document.getElementById('edit-avatar-initial').style.display = 'block';
            document.getElementById('edit-avatar-initial').textContent = '?';

            document.getElementById('edit-overlay').classList.remove('hidden');
        };

        // Bind Save Edit (Handles Create & Update) - FormData Version
        document.getElementById('btn-save-edit').onclick = async () => {
            const id = document.getElementById('edit-id').value;
            const nickname = document.getElementById('edit-nickname').value;
            const dob = document.getElementById('edit-dob').value;

            // Form Data for File Upload
            const formData = new FormData();
            formData.append('nickname', nickname);
            formData.append('dob', dob);

            // Gather Extras
            const genderEl = document.querySelector('#edit-gender-control .selected');
            const feedingEl = document.querySelector('#edit-baby-feeding .selected');
            const stageEl = document.querySelector('#edit-baby-stage .selected');

            formData.append('gender', genderEl ? genderEl.dataset.value : 'unknown');
            if (feedingEl) formData.append('baby_feeding', feedingEl.dataset.value);
            if (stageEl) formData.append('baby_stage', stageEl.dataset.value);

            // Health (JSON stringify required for text fields if backend expects string)
            // But since we use multipart, we can append arrays directly if backend handles it, 
            // OR stringify them. Our backend expects JSON string in 'adult_health' TEXT column.
            const healthTags = Array.from(document.querySelectorAll('#edit-adult-health .selected')).map(el => el.dataset.value);
            const medTags = Array.from(document.querySelectorAll('#edit-adult-meds .selected')).map(el => el.dataset.value);

            formData.append('adult_health', JSON.stringify(healthTags));
            formData.append('adult_meds', JSON.stringify(medTags));

            // File
            // Priority: Cropped Blob > Original Input
            if (currentAvatarBlob) {
                // Filename is arbitrary
                formData.append('avatar', currentAvatarBlob, 'avatar.jpg');
            } else {
                const fileInput = document.getElementById('edit-avatar-upload');
                if (fileInput.files[0]) {
                    formData.append('avatar', fileInput.files[0]);
                }
            }

            const method = id ? 'PUT' : 'POST';
            const url = id ? `/api/personas/${id}` : '/api/personas';

            try {
                // Fetch automatically sets Content-Type to multipart/form-data with boundary when body is FormData
                // We just need Authorization header
                const res = await fetch(url, {
                    method: method,
                    headers: {
                        'Authorization': `Bearer ${token}`
                    },
                    body: formData
                });

                if (res.ok) {
                    document.getElementById('edit-overlay').classList.add('hidden');
                    loadProfilesForManagement();
                } else {
                    alert('Failed to save profile');
                }
            } catch (e) { console.error(e); }
        };

    } else {
        // Only load main personas if NOT on settings page
        if (!window.location.pathname.endsWith('settings.html')) {
            loadPersonas();
        }
    }

    // --- MANAGEMENT HELPERS ---

    // Helper: Calculate Age String
    function getAgeString(dob) {
        if (!dob) return '';
        const diff = new Date() - new Date(dob);
        const ageInMonths = diff / (1000 * 60 * 60 * 24 * 30.44);
        if (ageInMonths < 12) return Math.floor(ageInMonths) + 'm';
        return Math.floor(ageInMonths / 12) + 'y';
    }

    // Helper: Setup Edit Modal Interactions
    function setupEditInteractions() {
        // Gender Toggle
        document.querySelectorAll('#edit-gender-control .segment-option').forEach(el => {
            el.addEventListener('click', () => {
                document.querySelectorAll('#edit-gender-control .segment-option').forEach(s => s.classList.remove('selected'));
                el.classList.add('selected');
            });
        });

        // Grid Options (Feeding, Stage)
        ['edit-baby-feeding', 'edit-baby-stage'].forEach(id => {
            document.querySelectorAll(`#${id} .grid-option`).forEach(el => {
                el.addEventListener('click', () => {
                    el.parentElement.querySelectorAll('.grid-option').forEach(s => s.classList.remove('selected'));
                    el.classList.add('selected');
                });
            });
        });

        // Tags (Health, Meds - Multi Select)
        ['edit-adult-health', 'edit-adult-meds'].forEach(id => {
            document.querySelectorAll(`#${id} .tag`).forEach(el => {
                el.addEventListener('click', () => {
                    const val = el.dataset.value;
                    if (val === 'none') {
                        // Exclusive 'none'
                        el.parentElement.querySelectorAll('.tag').forEach(s => s.classList.remove('selected'));
                        el.classList.add('selected');
                    } else {
                        // Deselect 'none' if others selected
                        const noneTag = el.parentElement.querySelector('.tag[data-value="none"]');
                        if (noneTag) noneTag.classList.remove('selected');
                        el.classList.toggle('selected');
                    }
                });
            });
        });

        // DOB Change Trigger
        document.getElementById('edit-dob').addEventListener('change', (e) => toggleEditSections(e.target.value));

        // File Input -> Crop Modal
        document.getElementById('edit-avatar-upload').addEventListener('change', function (e) {
            if (e.target.files && e.target.files[0]) {
                const reader = new FileReader();
                reader.onload = function (evt) {
                    // Open Crop Modal
                    const cropImg = document.getElementById('crop-image');
                    cropImg.src = evt.target.result;
                    document.getElementById('crop-modal').classList.remove('hidden');

                    // Init Cropper
                    if (window.cropper) window.cropper.destroy();
                    window.cropper = new Cropper(cropImg, {
                        aspectRatio: 1,
                        viewMode: 1,
                        dragMode: 'move', // Default to moving canvas on touch
                        autoCropArea: 0.8,
                        restore: false,
                        guides: false,
                        center: false,
                        highlight: false,
                        cropBoxMovable: true,
                        cropBoxResizable: true,
                        toggleDragModeOnDblclick: false,
                        background: false // Clean look
                    });
                }
                reader.readAsDataURL(e.target.files[0]);
            }
            // Reset value so same file can be selected again if cancelled
            e.target.value = '';
        });

        // Rotation
        document.getElementById('btn-rotate-left').onclick = () => window.cropper && window.cropper.rotate(-90);
        document.getElementById('btn-rotate-right').onclick = () => window.cropper && window.cropper.rotate(90);

        // Confirm Crop
        document.getElementById('btn-confirm-crop').onclick = () => {
            if (window.cropper) {
                window.cropper.getCroppedCanvas({ width: 512, height: 512 }).toBlob((blob) => {
                    // Store blob globally for save
                    window.currentAvatarBlob = blob;

                    // Update Preview
                    const url = URL.createObjectURL(blob);
                    const img = document.getElementById('edit-avatar-img');
                    const initial = document.getElementById('edit-avatar-initial');
                    img.src = url;
                    img.style.display = 'block';
                    initial.style.display = 'none';

                    // Close Modal
                    closeCropModal();
                }, 'image/jpeg', 0.9);
            }
        };

        // Expose close helper
        window.closeCropModal = () => {
            document.getElementById('crop-modal').classList.add('hidden');
            if (window.cropper) {
                window.cropper.destroy();
                window.cropper = null;
            }
        };
    }

    function toggleEditSections(dobVal) {
        if (!dobVal) return;
        const ageInMonths = (new Date() - new Date(dobVal)) / (1000 * 60 * 60 * 24 * 30.44);

        const babySec = document.getElementById('edit-baby-section');
        const adultSec = document.getElementById('edit-adult-section');

        if (ageInMonths < 12) {
            babySec.classList.remove('hidden');
            adultSec.classList.add('hidden');
        } else {
            babySec.classList.add('hidden');
            adultSec.classList.remove('hidden');
        }
    }



    async function loadProfilesForManagement() {
        const listEl = document.getElementById('profiles-list');
        if (!listEl) return;

        listEl.innerHTML = '<div class="spinner"></div>';

        try {
            const res = await fetch('/api/personas', { headers: authHeaders });
            if (res.status === 401) return window.location.href = 'login.html';
            const json = await res.json();
            personas = json.data;

            listEl.innerHTML = personas.map(p => `
                <div class="bento-row-card">
                    <div style="display:flex; align-items:center; gap:20px;">
                         <div class="avatar-circle-large" style="width:56px; height:56px; font-size:1.4rem; ${p.gender === 'female' ? 'border-color:rgba(244,114,182,0.4)' : ''}">
                            ${p.avatar_path
                    ? `<img src="${p.avatar_path}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`
                    : p.nickname[0].toUpperCase()
                }
                        </div>
                        <div>
                            <div style="font-weight:700; font-size:1.2rem; margin-bottom:4px;">${p.nickname}</div>
                            <div style="font-size:0.9rem; color:var(--text-muted); display:flex; align-items:center; gap:8px;">
                                <span style="text-transform:capitalize;">${tr(`val_${p.gender}`) || p.gender || tr('val_unknown')}</span>
                                <span style="width:4px; height:4px; background:var(--text-muted); border-radius:50%; opacity:0.5;"></span>
                                <span>${getAgeString(p.dob)}</span>
                            </div>
                        </div>
                    </div>
                    <div class="action-btn-group">
                        <button class="icon-btn-glass" onclick="openEditProfile('${p.id}')">
                            <i class="ph-fill ph-pencil-simple" style="font-size:1.2rem;"></i>
                        </button>
                        <button class="icon-btn-glass danger" onclick="deleteProfile('${p.id}')">
                            <i class="ph-fill ph-trash" style="font-size:1.2rem;"></i>
                        </button>
                    </div>
                </div>
            `).join('');
        } catch (e) {
            console.error(e);
        }
    }

    window.openEditProfile = (id) => {
        const p = personas.find(x => x.id == id);
        if (!p) return;

        // Basic Info
        document.getElementById('edit-id').value = p.id;
        document.getElementById('edit-name-display').textContent = p.nickname;
        document.getElementById('edit-nickname').value = p.nickname;
        document.getElementById('edit-dob').value = p.dob;

        // Avatar Reset/Load
        const img = document.getElementById('edit-avatar-img');
        const initial = document.getElementById('edit-avatar-initial');
        document.getElementById('edit-avatar-upload').value = ''; // Reset input
        window.currentAvatarBlob = null; // Clear any pending crop

        if (p.avatar_path) {
            img.src = p.avatar_path;
            img.style.display = 'block';
            initial.style.display = 'none';
        } else {
            img.src = '';
            img.style.display = 'none';
            initial.style.display = 'block';
            initial.textContent = p.nickname[0].toUpperCase();
        }

        // Gender
        document.querySelectorAll('#edit-gender-control .segment-option').forEach(el => {
            el.classList.toggle('selected', el.dataset.value === (p.gender || 'male'));
        });

        // Trigger Section Toggle
        toggleEditSections(p.dob);

        // Baby Specifics
        document.querySelectorAll('#edit-baby-feeding .grid-option').forEach(el => {
            el.classList.toggle('selected', el.dataset.value === p.baby_feeding);
        });
        document.querySelectorAll('#edit-baby-stage .grid-option').forEach(el => {
            el.classList.toggle('selected', el.dataset.value === p.baby_stage);
        });

        // Adult Specifics
        let healthArr = [];
        try { healthArr = JSON.parse(p.adult_health || '[]'); } catch (e) { }
        document.querySelectorAll('#edit-adult-health .tag').forEach(el => {
            el.classList.toggle('selected', healthArr.includes(el.dataset.value));
        });

        let medsArr = [];
        try { medsArr = JSON.parse(p.adult_meds || '[]'); } catch (e) { }
        document.querySelectorAll('#edit-adult-meds .tag').forEach(el => {
            el.classList.toggle('selected', medsArr.includes(el.dataset.value));
        });

        document.getElementById('edit-overlay').classList.remove('hidden');
    };

    window.deleteProfile = async (id) => {
        if (!confirm(tr('delete_profile_confirm'))) return;
        try {
            const res = await fetch(`/api/personas/${id}`, { method: 'DELETE', headers: authHeaders });
            if (res.ok) loadProfilesForManagement();
            else alert("Delete failed");
        } catch (e) { console.error(e); }
    };

}); // End DOMContentLoaded
