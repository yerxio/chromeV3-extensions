document.addEventListener('DOMContentLoaded', () => {
    const cookieListBody = document.getElementById('cookie-list');
    const filterInput = document.getElementById('filter-input');
    const refreshBtn = document.getElementById('refresh-btn');
    const addNewCookieBtn = document.getElementById('add-new-cookie-btn');
    

    // --- 新增：模态框相关变量 ---
    const cancelModal = document.getElementById('cancel-modal');
    const confirmCancelBtn = document.getElementById('confirm-cancel-btn');
    const closeModalBtn = document.getElementById('close-modal-btn');


    // --- 新增：统一操作按钮引用 ---
    const unifiedActions = document.getElementById('unified-actions');
    const unifiedEditBtn = document.getElementById('unified-edit-btn');
    const unifiedSaveBtn = document.getElementById('unified-save-btn');
    const unifiedLockBtn = document.getElementById('unified-lock-btn');
    const unifiedDeleteBtn = document.getElementById('unified-delete-btn');
    
    let selectedCookieRow = null; // 存储当前选中行的 DOM 元素
    let selectedCookieData = null; // 存储当前选中行的 Cookie 原始数据
    // ---------------------------------

    const lockNameInput = document.getElementById('lock-name-input');
    const lockValueInput = document.getElementById('lock-value-input');
    const addLockBtn = document.getElementById('add-lock-btn');
    const lockedList = document.getElementById('locked-list');

    const blacklistNameInput = document.getElementById('blacklist-name-input');
    const addBlacklistBtn = document.getElementById('add-blacklist-btn');
    const blacklistedList = document.getElementById('blacklisted-list');

    let allCookies = [];
    let settings = {
        lockedCookies: {},
        blacklistedCookies: []
    };
    let currentTab = null; // 存储当前标签页信息

    // --- 新增：复制成功提示 DOM 创建和函数 ---
    const copyNotification = document.createElement('div');
    copyNotification.id = 'copy-notification';
    document.body.appendChild(copyNotification);
    
    function showCopyNotification(message) {
        copyNotification.textContent = message;
        copyNotification.classList.add('show');
        
        setTimeout(() => {
            copyNotification.classList.remove('show');
        }, 1500);
    }
    // ------------------------------------------

    /**
     * 根据 cookie 对象构建 URL
     */
    function getUrlFromCookie(cookie) {
        const protocol = cookie.secure ? 'https' : 'http';
        let domain = cookie.domain;
        if (domain.startsWith('.')) {
            domain = domain.substring(1);
        }
        return `${protocol}://${domain}${cookie.path}`;
    }

    /**
     * 渲染 Cookie 列表
     */
    function renderCookieList(filter = '') {
        cookieListBody.innerHTML = ''; // 清空列表
        // 确保在重新渲染时重置选中状态
        clearSelectionState(); 
        
        const filterLower = filter.toLowerCase();
        
        const filteredCookies = allCookies.filter(cookie => 
            cookie.name.toLowerCase().includes(filterLower) || 
            cookie.domain.toLowerCase().includes(filterLower)
        );

        if (allCookies.length === 0) {
            if (filter && allCookies.length > 0) {
                 cookieListBody.innerHTML = '<tr><td colspan="3">没有匹配过滤器的 Cookie。</td></tr>';
            }
            return;
        }

        filteredCookies.forEach(cookie => {
            const tr = document.createElement('tr');
            
            // 存储原始数据以便操作
            tr.dataset.name = cookie.name;
            tr.dataset.domain = cookie.domain;
            tr.dataset.path = cookie.path;
            tr.dataset.storeId = cookie.storeId;
            tr.dataset.url = getUrlFromCookie(cookie);
            tr.dataset.value = cookie.value; // 新增：将值也存入 dataset

            // 检查状态
            const isLocked = settings.lockedCookies.hasOwnProperty(cookie.name);
            const isBlacklisted = settings.blacklistedCookies.includes(cookie.name);

            // *** 移除操作列，只保留数据列 ***
            tr.innerHTML = `
                <td class="cookie-name" data-copy-key="键">${cookie.name} ${isLocked ? '🔒' : ''} ${isBlacklisted ? '🚫' : ''}</td>
                <td class="cookie-value" data-copy-key="值">${cookie.value}</td>
                <td class="cookie-domain" data-copy-key="域">${cookie.domain}${cookie.path !== '/' ? ` (${cookie.path})` : ''}</td>
            `;
            // ----------------------------------
            cookieListBody.appendChild(tr);
        });
    }

    /**
     * 清除选中状态和禁用统一操作按钮
     */
    function clearSelectionState() {
        if (selectedCookieRow) {
            selectedCookieRow.classList.remove('selected');
        }
        selectedCookieRow = null;
        selectedCookieData = null;
        if (unifiedActions) {
            unifiedActions.classList.add('disabled');
        }
        // 确保统一按钮显示状态恢复到 Edit/隐藏 Save
        if (unifiedEditBtn) unifiedEditBtn.style.display = 'inline-flex';
        if (unifiedSaveBtn) unifiedSaveBtn.style.display = 'none';
    }

    /**
     * 加载当前标签页的 Cookie (更新后的逻辑保持不变)
     */
    async function loadCookies() {
        // ... (省略 loadCookies 内部的 chrome.tabs.query 和 chrome.cookies.getAll 逻辑) ...
        cookieListBody.innerHTML = '<tr><td colspan="3">加载中...</td></tr>';
        
        try {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tabs || tabs.length === 0 || !tabs[0].url) {
                cookieListBody.innerHTML = '<tr><td colspan="3">无法获取当前标签页信息。</td></tr>';
                currentTab = null;
                return;
            }

            currentTab = tabs[0];
            const currentUrl = currentTab.url;
            const storeId = currentTab.cookieStoreId; 

            if (!currentUrl.startsWith('http://') && !currentUrl.startsWith('https://')) {
                cookieListBody.innerHTML = `<tr><td colspan="3">当前页面 (${currentUrl.split(':')[0]}://) 不支持 Cookie 操作。</td></tr>`;
                allCookies = [];
                renderCookieList(filterInput.value);
                currentTab = null;
                return;
            }

            allCookies = await chrome.cookies.getAll({ 
                url: currentUrl,
                storeId: storeId
            }); 
            
            if (allCookies.length === 0) {
                cookieListBody.innerHTML = '<tr><td colspan="3">当前页面没有 Cookie。</td></tr>';
            } else {
                allCookies.sort((a, b) => a.domain.localeCompare(b.domain) || a.name.localeCompare(b.name));
                renderCookieList(filterInput.value);
            }

        } catch (e) {
            cookieListBody.innerHTML = `<tr><td colspan="3">加载 Cookie 失败: ${e.message}。</td></tr>`;
            currentTab = null;
        }
    }


    /**
     * 加载设置 (锁和黑名单) - 保持不变
     */
    async function loadSettings() {
        settings = await chrome.storage.local.get({
            lockedCookies: {},
            blacklistedCookies: []
        });
        renderSettings();
    }

    /**
     * 渲染设置 UI - 保持不变
     */
    function renderSettings() {
        // ... (renderSettings 内部逻辑保持不变) ...
        // 渲染锁死列表
        lockedList.innerHTML = '';
        for (const name in settings.lockedCookies) {
            const value = settings.lockedCookies[name];
            const li = document.createElement('li');
            li.innerHTML = `
                <span><strong>${name}</strong> = "${value}"</span>
                <span class="remove-setting" data-type="lock" data-name="${name}" title="移除">&times;</span>
            `;
            lockedList.appendChild(li);
        }

        // 渲染黑名单列表
        blacklistedList.innerHTML = '';
        settings.blacklistedCookies.forEach(name => {
            const li = document.createElement('li');
            li.innerHTML = `
                <span><strong>${name}</strong></span>
                <span class="remove-setting" data-type="blacklist" data-name="${name}" title="移除">&times;</span>
            `;
            blacklistedList.appendChild(li);
        });
    }


    /**
     * 主列表事件委托：处理行选择和单元格复制
     */
    cookieListBody.addEventListener('click', async (e) => {
        const target = e.target;
        const tr = target.closest('tr');
        if (!tr) return;

        // 检查是否是 "添加新" 行
        const isAddNewRow = tr.querySelector('.btn-save[data-action="create"]');
        if (isAddNewRow) return;

        // --- A. 行选择逻辑 ---
        
        // 只有当点击目标不是已选中的行时，才更新选中状态
        if (selectedCookieRow !== tr) {
            clearSelectionState(); // 清除之前的选中状态
            
            // 设置新的选中状态
            selectedCookieRow = tr;
            tr.classList.add('selected');
            
            // 存储当前选中的 Cookie 数据
            selectedCookieData = allCookies.find(c => 
                c.name === tr.dataset.name && 
                c.domain === tr.dataset.domain &&
                c.path === tr.dataset.path
            );
            
            // 激活统一操作按钮
            if (unifiedActions) {
                unifiedActions.classList.remove('disabled');
            }
        }
        
        // --- B. 复制逻辑 ---
        const targetCell = target.closest('td');

        // 确保点击的是 TD 元素
        if (targetCell) {
            let valueToCopy = '';
            // 尝试获取 data-copy-key 属性，如果不存在则使用类名
            const keyText = targetCell.dataset.copyKey || targetCell.className.split('-').pop(); 
            
            // 如果是编辑状态，获取输入框的值
            const inputElement = targetCell.querySelector('input');
            if (inputElement) {
                valueToCopy = inputElement.value;
            } else {
                // 否则获取单元格的纯文本内容
                // 使用 cloneNode(true) 移除图标文本
                const tempEl = targetCell.cloneNode(true);
                // 移除所有非文本内容，如图标
                tempEl.querySelectorAll('span, button').forEach(el => el.remove()); 
                valueToCopy = tempEl.textContent.trim();
            }

            if (valueToCopy) {
                try {
                    await navigator.clipboard.writeText(valueToCopy);
                    showCopyNotification(`[${keyText}] 复制成功!`);
                } catch (err) {
                    console.error('复制失败:', err);
                    showCopyNotification('复制失败，请检查浏览器权限。');
                }
            }
        }
    });

    /**
     * 统一操作按钮处理函数
     */
    async function handleUnifiedAction(action) {
        if (!selectedCookieData || !selectedCookieRow) {
            return;
        }
        
        const { name, domain, path, storeId, url } = selectedCookieRow.dataset;
        const tr = selectedCookieRow;
        const valueCell = tr.querySelector('.cookie-value');
        
        // 检查是否正在编辑
        const isEditing = tr.querySelector('.edit-value');

        switch (action) {
            case 'edit':
                if (!isEditing) {
                    // 切换到编辑状态
                    const currentValue = selectedCookieData.value;
                    valueCell.innerHTML = `<input type="text" class="edit-value" value="${currentValue}">`;
                    unifiedEditBtn.style.display = 'none';
                    unifiedSaveBtn.style.display = 'inline-flex';
                }
                break;

            case 'save':
                if (!isEditing) return;
                const newValue = tr.querySelector('.edit-value').value;
                try {
                    await chrome.cookies.set({
                        url: url,
                        name: name,
                        value: newValue,
                        domain: domain,
                        path: path,
                        storeId: storeId
                    });
                    
                    // 恢复显示状态
                    valueCell.textContent = newValue;
                    unifiedEditBtn.style.display = 'inline-flex';
                    unifiedSaveBtn.style.display = 'none';
                    
                    // 更新 allCookies 数组和 selectedCookieData
                    const index = allCookies.findIndex(c => c.name === name && c.domain === domain && c.path === path);
                    if (index !== -1) {
                        allCookies[index].value = newValue;
                        selectedCookieData.value = newValue; 
                    }
                    showCopyNotification(`[${name}] 保存成功!`);

                } catch (e) {
                    alert(`保存失败: ${e.message}`);
                    loadCookies(); // 失败时重新加载以恢复状态
                }
                break;

            case 'lock':
                // 锁死逻辑
                const currentValueToLock = selectedCookieData.value;
                const isLocked = settings.lockedCookies.hasOwnProperty(name);

                if (!isLocked) {
                    settings.lockedCookies[name] = currentValueToLock;
                    showCopyNotification(`[${name}] 已锁死!`);
                } else {
                    delete settings.lockedCookies[name];
                    showCopyNotification(`[${name}] 已解锁!`);
                }
                await chrome.storage.local.set({ lockedCookies: settings.lockedCookies });
                loadSettings(); 
                loadCookies();  
                clearSelectionState();
                break;

            case 'delete':
                if (confirm(`确定要删除 ${name} 吗?`)) {
                    try {
                        await chrome.cookies.remove({ url: url, name: name, storeId: storeId });
                        
                        // 从 allCookies 数组中移除
                        allCookies = allCookies.filter(c => !(c.name === name && c.domain === domain && c.path === path));
                        
                        tr.remove(); 
                        showCopyNotification(`[${name}] 删除成功!`);
                    } catch (e) {
                        alert(`删除失败: ${e.message}`);
                    }
                    clearSelectionState();
                }
                break;
        }
    }
    
    // --- 统一操作按钮事件绑定 ---
    if (unifiedEditBtn) unifiedEditBtn.addEventListener('click', () => handleUnifiedAction('edit'));
    if (unifiedSaveBtn) unifiedSaveBtn.addEventListener('click', () => handleUnifiedAction('save'));
    if (unifiedLockBtn) unifiedLockBtn.addEventListener('click', () => handleUnifiedAction('lock'));
    if (unifiedDeleteBtn) unifiedDeleteBtn.addEventListener('click', () => handleUnifiedAction('delete'));


    // --- 添加新 Cookie (逻辑保持不变，但移除了 tr.querySelector('.btn-save').dataset.action = "create";) ---
    addNewCookieBtn.addEventListener('click', () => {
        if (document.querySelector('tr[data-new-cookie]')) {
                    alert("请先完成或取消当前的新建操作。");
                    return;
        }

        if (!currentTab) { 
             alert("没有可用的当前标签页来添加 Cookie。\n请尝试刷新页面后重试。");
             return;
        }

        let defaultDomain = 'example.com';
        try {
            const urlObj = new URL(currentTab.url);
            defaultDomain = urlObj.hostname;
        } catch (e) {}

        const tr = document.createElement('tr');
        tr.dataset.newCookie = 'true'; // 标记为新建行
        
        // 注意：HTML 结构已在您之前的请求中移除操作列，这里添加一个保存按钮
        tr.innerHTML = `
             <td class="cookie-name" data-copy-key="键"><input type="text" class="edit-name" placeholder="new_cookie_name"></td>
             <td class="cookie-value" data-copy-key="值"><input type="text" class="edit-value" placeholder="new_value"></td>
             <td class="cookie-domain" data-copy-key="域"><input type="text" class="edit-domain" value="${defaultDomain}">
                <button class="btn-save" data-action="create" title="保存">保存</button>
             </td>
        `;
        
        cookieListBody.prepend(tr);
        
        // 特殊处理创建逻辑
        tr.querySelector('button.btn-save[data-action="create"]').addEventListener('click', async (e) => {
            e.stopPropagation(); // 阻止事件冒泡

            const newName = tr.querySelector('.edit-name').value;
            const newValue = tr.querySelector('.edit-value').value;
            const newDomain = tr.querySelector('.edit-domain').value;
            
            if (!newName || !newDomain) {
                alert("键 (Name) 和 网址 (Domain) 不能为空!");
                return;
            }
            
            const storeId = currentTab.cookieStoreId;
            let baseUrl;

            try {
                const protocol = new URL(currentTab.url).protocol; 
                baseUrl = `${protocol}//${newDomain.replace(/^\./, '')}/`; 
            } catch(e) {
                alert(`域名 "${newDomain}" 格式无效。`);
                return;
            }

            try {
                await chrome.cookies.set({
                    url: baseUrl,
                    name: newName,
                    value: newValue,
                    domain: newDomain, 
                    path: "/", 
                    storeId: storeId
                });
                showCopyNotification(`[${newName}] 创建成功!`);
                loadCookies(); // 成功后重新加载
            } catch(err) {
                alert(`创建 Cookie 失败: ${err.message}\n请确保 Domain (如 .example.com) 与 URL (如 ${baseUrl}) 匹配。`);
            }
        });
    });


    // --- 过滤器 ---
    filterInput.addEventListener('keyup', () => {
        renderCookieList(filterInput.value);
    });

    // --- 刷新按钮 ---
    refreshBtn.addEventListener('click', () => {
        clearSelectionState();
        loadCookies();
        loadSettings();
    });

    // --- 设置区域事件处理 (保持不变) ---
    addLockBtn.addEventListener('click', async () => {
        const name = lockNameInput.value.trim();
        const value = lockValueInput.value;
        if (name) {
            settings.lockedCookies[name] = value;
            await chrome.storage.local.set({ lockedCookies: settings.lockedCookies });
            loadSettings();
            loadCookies();
            lockNameInput.value = '';
            lockValueInput.value = '';
        }
    });

    addBlacklistBtn.addEventListener('click', async () => {
        const name = blacklistNameInput.value.trim();
        if (name && !settings.blacklistedCookies.includes(name)) {
            settings.blacklistedCookies.push(name);
            await chrome.storage.local.set({ blacklistedCookies: settings.blacklistedCookies });
            loadSettings();
            loadCookies();
            blacklistNameInput.value = '';
        }
    });

    document.addEventListener('click', (e) => {
        const newCookieRow = document.querySelector('tr[data-new-cookie]');

        // 1. 如果没有新建行，或者点击目标在新建行内，则不处理
        if (!newCookieRow || newCookieRow.contains(e.target)) {
            return;
        }

        // 2. 如果点击目标是模态框本身，也不处理 (模态框外部点击处理由模态框逻辑接管)
        if (cancelModal.contains(e.target) || e.target.classList.contains('modal')) {
             return;
        }

        // 3. 如果点击目标是 '创建新 Cookie' 按钮，也不处理
        if (e.target === addNewCookieBtn || addNewCookieBtn.contains(e.target)) {
            return;
        }
        
        // 4. 点击到其他空白处或功能区，弹出模态框
        cancelModal.style.display = 'block';
    });

    // 模态框关闭/取消逻辑
    closeModalBtn.addEventListener('click', () => {
        cancelModal.style.display = 'none'; // 继续编辑
    });
    
    // 模态框确认取消逻辑
    confirmCancelBtn.addEventListener('click', () => {
        const newCookieRow = document.querySelector('tr[data-new-cookie]');
        if (newCookieRow) {
            newCookieRow.remove(); // 移除新建行
        }
        cancelModal.style.display = 'none'; // 关闭模态框
        showCopyNotification('已取消新建 Cookie。');
    });

    // 点击模态框背景关闭 (可选)
    window.addEventListener('click', (event) => {
        if (event.target === cancelModal) {
            // 如果点击模态框背景，则视为“继续编辑”
            cancelModal.style.display = 'none';
        }
    });
    
    document.addEventListener('click', async (e) => {
        if (e.target.classList.contains('remove-setting')) {
            const { type, name } = e.target.dataset;
            
            // 确保点击不是来自列表区 (因为列表区没有 .remove-setting)
            if (e.target.closest('.settings-list')) {
                if (type === 'lock') {
                    delete settings.lockedCookies[name];
                    await chrome.storage.local.set({ lockedCookies: settings.lockedCookies });
                } else if (type === 'blacklist') {
                    // 修复 Blacklist 删除逻辑：使用 filter 移除元素
                    settings.blacklistedCookies = settings.blacklistedCookies.filter(n => n !== name);
                    await chrome.storage.local.set({ blacklistedCookies: settings.blacklistedCookies });
                }
                loadSettings();
                loadCookies();
            }
        }
    });


    document.querySelector('.settings-container').addEventListener('click', async (e) => {
        if (e.target.classList.contains('remove-setting')) {
            const { type, name } = e.target.dataset;
            if (type === 'lock') {
                delete settings.lockedCookies[name];
                await chrome.storage.local.set({ lockedCookies: settings.lockedCookies });
            } else if (type === 'blacklist') {
                settings.blacklistedCookies = settings.blacklistedCookies.filter(n => n !== name);
                await chrome.storage.local.set({ blacklistedCookies: settings.blacklistedCookies });
            }
            loadSettings();
            loadCookies();
        }
    });

    // --- 初始加载 ---
    // 默认隐藏 Save 按钮，显示 Edit 按钮
    if (unifiedSaveBtn) unifiedSaveBtn.style.display = 'none';
    if (unifiedEditBtn) unifiedEditBtn.style.display = 'inline-flex';
    clearSelectionState(); // 确保一开始禁用操作按钮
    loadSettings();
    loadCookies();
});
