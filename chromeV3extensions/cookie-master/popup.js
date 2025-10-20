document.addEventListener('DOMContentLoaded', () => {
  const cookieListBody = document.getElementById('cookie-list');
  const filterInput = document.getElementById('filter-input');
  const refreshBtn = document.getElementById('refresh-btn');
  const addNewCookieBtn = document.getElementById('add-new-cookie-btn');

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
    const filterLower = filter.toLowerCase();
    
    const filteredCookies = allCookies.filter(cookie => 
      cookie.name.toLowerCase().includes(filterLower) || 
      cookie.domain.toLowerCase().includes(filterLower)
    );

    if (allCookies.length === 0) {
      // "没有 Cookie" 的情况已在 loadCookies 中处理
      if (filter && allCookies.length > 0) {
         cookieListBody.innerHTML = '<tr><td colspan="4">没有匹配过滤器的 Cookie。</td></tr>';
      }
      return;
    }

    filteredCookies.forEach(cookie => {
      const tr = document.createElement('tr');
      
      // 存储原始数据以便编辑和删除
      tr.dataset.name = cookie.name;
      tr.dataset.domain = cookie.domain;
      tr.dataset.path = cookie.path;
      tr.dataset.storeId = cookie.storeId;
      tr.dataset.url = getUrlFromCookie(cookie);

      // 检查状态
      const isLocked = settings.lockedCookies.hasOwnProperty(cookie.name);
      const isBlacklisted = settings.blacklistedCookies.includes(cookie.name);

      tr.innerHTML = `
        <td class="cookie-name">${cookie.name} ${isLocked ? '&#128274;' : ''} ${isBlacklisted ? '&#128683;' : ''}</td>
        <td class="cookie-value">${cookie.value}</td>
        <td class="cookie-domain">${cookie.domain}</td>
        <td class="cookie-actions">
          <button class="btn-edit" title="编辑">编辑</button>
          <button class="btn-delete" title="删除">删除</button>
          <button class="btn-lock" title="锁死该值">${isLocked ? '解锁' : '锁死'}</button>
          <button class="btn-blacklist" title="拉黑该键">${isBlacklisted ? '取消拉黑' : '拉黑'}</button>
        </td>
      `;
      cookieListBody.appendChild(tr);
    });
  }

  /**
   * 加载当前标签页的 Cookie
   */
  async function loadCookies() {
    cookieListBody.innerHTML = '<tr><td colspan="4">加载中...</td></tr>';
    
    try {
      // 1. 获取当前激活的标签页
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs || tabs.length === 0 || !tabs[0].url) {
        cookieListBody.innerHTML = '<tr><td colspan="4">无法获取当前标签页信息。请确保插件已重新加载。</td></tr>';
        currentTab = null; // 清空
        return;
      }

      currentTab = tabs[0]; // 存储
      const currentUrl = currentTab.url;
      // [关键] 获取当前标签页的 Cookie 存储 ID (区分常规和隐身)
      const storeId = currentTab.cookieStoreId; 

      // 2. 检查 URL 方案
      if (!currentUrl.startsWith('http://') && !currentUrl.startsWith('https://')) {
        cookieListBody.innerHTML = `<tr><td colspan="4">当前页面 (${currentUrl.split(':')[0]}://) 不支持 Cookie 操作。</td></tr>`;
        allCookies = []; // 清空
        renderCookieList(filterInput.value); // 渲染空列表
        currentTab = null; // 清空
        return;
      }

      // 3. [关键] 使用当前 URL 和 storeId 获取 Cookie
      allCookies = await chrome.cookies.getAll({ 
        url: currentUrl, // <-- 只获取此 URL 相关的
        storeId: storeId // <-- 只获取此存储区的
      }); 
      
      if (allCookies.length === 0) {
        cookieListBody.innerHTML = '<tr><td colspan="4">当前页面没有 Cookie。</td></tr>';
      } else {
        allCookies.sort((a, b) => a.domain.localeCompare(b.domain) || a.name.localeCompare(b.name));
        renderCookieList(filterInput.value);
      }

    } catch (e) {
      cookieListBody.innerHTML = `<tr><td colspan="4">加载 Cookie 失败: ${e.message}。(您是否在更新 manifest 后重新加载了插件?)</td></tr>`;
      currentTab = null; // 清空
    }
  }

  /**
   * 加载设置 (锁和黑名单)
   */
  async function loadSettings() {
    settings = await chrome.storage.local.get({
      lockedCookies: {},
      blacklistedCookies: []
    });
    renderSettings();
  }

  /**
   * 渲染设置 UI
   */
  function renderSettings() {
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
   * 主列表事件委托
   */
  cookieListBody.addEventListener('click', async (e) => {
    const target = e.target;
    const tr = target.closest('tr');
    if (!tr) return;

    // 检查是否是 "添加新" 行
    const isAddNewRow = tr.querySelector('.btn-save[data-action="create"]');
    if (isAddNewRow) return; // "添加新" 行有自己的独立监听器

    const { name, domain, path, storeId, url } = tr.dataset;
    const nameCell = tr.querySelector('.cookie-name');
    const valueCell = tr.querySelector('.cookie-value');
    const domainCell = tr.querySelector('.cookie-domain');

    // --- 编辑功能 ---
    if (target.classList.contains('btn-edit')) {
      target.textContent = '保存';
      target.classList.remove('btn-edit');
      target.classList.add('btn-save');
      valueCell.innerHTML = `<input type="text" class="edit-value" value="${valueCell.textContent}">`;
    
    // --- 保存功能 ---
    } else if (target.classList.contains('btn-save')) {
      const newValue = tr.querySelector('.edit-value').value;
      try {
        await chrome.cookies.set({
          url: url, // 使用原始 URL
          name: name,
          value: newValue,
          domain: domain,
          path: path,
          storeId: storeId // 传递原始的 storeId
        });
        
        target.textContent = '编辑';
        target.classList.remove('btn-save');
        target.classList.add('btn-edit');
        valueCell.textContent = newValue;
      } catch (e) {
        alert(`保存失败: ${e.message}`);
        loadCookies();
      }

    // --- 删除功能 ---
    } else if (target.classList.contains('btn-delete')) {
      if (confirm(`确定要删除 ${name} 吗?`)) {
        try {
          await chrome.cookies.remove({ url: url, name: name, storeId: storeId });
          tr.remove(); // 从 DOM 中移除
        } catch (e) {
          alert(`删除失败: ${e.message}`);
        }
      }

    // --- 锁死功能 ---
    } else if (target.classList.contains('btn-lock')) {
      const value = tr.querySelector('.cookie-value').textContent;
      if (target.textContent === '锁死') {
        settings.lockedCookies[name] = value;
      } else {
        delete settings.lockedCookies[name];
      }
      await chrome.storage.local.set({ lockedCookies: settings.lockedCookies });
      loadSettings(); 
      loadCookies(); 
    
    // --- 拉黑功能 ---
    } else if (target.classList.contains('btn-blacklist')) {
      if (target.textContent === '拉黑') {
        if (!settings.blacklistedCookies.includes(name)) {
          settings.blacklistedCookies.push(name);
        }
      } else {
        settings.blacklistedCookies = settings.blacklistedCookies.filter(n => n !== name);
      }
      await chrome.storage.local.set({ blacklistedCookies: settings.blacklistedCookies });
      loadSettings(); 
      loadCookies(); 
    }
  });

  // --- 添加新 Cookie ---
  addNewCookieBtn.addEventListener('click', () => {
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
     tr.innerHTML = `
        <td class="cookie-name"><input type="text" class="edit-name" placeholder="new_cookie_name"></td>
        <td class="cookie-value"><input type="text" class="edit-value" placeholder="new_value"></td>
        <td class="cookie-domain"><input type="text" class="edit-domain" value="${defaultDomain}"></td>
        <td class="cookie-actions">
          <button class="btn-save" title="保存">保存</button>
        </td>
      `;
      tr.querySelector('.btn-save').dataset.action = "create";
      cookieListBody.prepend(tr);
      
      // 特殊处理创建逻辑
      tr.querySelector('.btn-save').addEventListener('click', async (e) => {
          e.stopPropagation(); // 阻止事件冒泡到 body 监听器

          const newName = tr.querySelector('.edit-name').value;
          const newValue = tr.querySelector('.edit-value').value;
          const newDomain = tr.querySelector('.edit-domain').value;
          
          if (!newName || !newDomain) {
              alert("键 (Name) 和 网址 (Domain) 不能为空!");
              return;
          }
          
          // [关键] 必须使用当前标签页的 storeId
          const storeId = currentTab.cookieStoreId;
          let baseUrl;

          try {
              // 我们必须构造一个与 newDomain 匹配的 URL
              const protocol = new URL(currentTab.url).protocol; 
              baseUrl = `${protocol}//${newDomain.replace(/^\./, '')}/`; 
          } catch(e) {
              alert(`域名 "${newDomain}" 格式无效。`);
              return;
          }

          try {
              await chrome.cookies.set({
                  url: baseUrl, // 使用构造的 URL
                  name: newName,
                  value: newValue,
                  domain: newDomain, 
                  path: "/", 
                  storeId: storeId // [关键] 传递 storeId
              });
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
      loadCookies();
      loadSettings();
  });

  // --- 设置区域事件处理 ---
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
  loadSettings();
  loadCookies();
});