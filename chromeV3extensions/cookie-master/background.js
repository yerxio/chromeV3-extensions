/**
 * 根据 cookie 对象构建 URL，这是调用 chrome.cookies.remove/set 所必需的。
 * @param {chrome.cookies.Cookie} cookie
 * @returns {string}
 */
function getUrlFromCookie(cookie) {
  const protocol = cookie.secure ? 'https' : 'http';
  let domain = cookie.domain;
  // 移除开头的 "." (例如 .google.com -> google.com)
  if (domain.startsWith('.')) {
    domain = domain.substring(1);
  }
  return `${protocol}://${domain}${cookie.path}`;
}

/**
 * 处理 Cookie 变化的监听器
 * @param {chrome.cookies.CookieChangeInfo} changeInfo
 */
async function handleCookieChange(changeInfo) {
  // 从存储中获取我们的规则
  const { lockedCookies = {}, blacklistedCookies = [] } = await chrome.storage.local.get([
    'lockedCookies',
    'blacklistedCookies',
  ]);

  const cookie = changeInfo.cookie;
  const cookieName = cookie.name;

  // 1. 检查黑名单 (Blacklist) - 优先级最高
  if (blacklistedCookies.includes(cookieName)) {
    // 如果 Cookie 不是被删除的 (即它是被添加或修改的)，
    // 我们就立即将其删除。
    if (!changeInfo.removed) {
      chrome.cookies.remove({
        url: getUrlFromCookie(cookie),
        name: cookieName,
        storeId: cookie.storeId,
      });
      console.log(`[Cookie Master] 已拉黑并删除: ${cookieName}`);
    }
    return; // 已经被拉黑，无需执行锁定逻辑
  }

  // 2. 检查锁死 (Locking)
  if (lockedCookies.hasOwnProperty(cookieName)) {
    const lockedValue = lockedCookies[cookieName];

    // 如果 Cookie 值与锁定的值不同，或者它被删除了
    // 我们就立即将其设置回锁定的值
    if (cookie.value !== lockedValue || changeInfo.removed) {
      // 构造一个新的 cookie 对象来设置
      const newCookie = {
        url: getUrlFromCookie(cookie),
        name: cookieName,
        value: lockedValue,
        domain: cookie.domain,
        path: cookie.path,
        secure: cookie.secure,
        httpOnly: cookie.httpOnly,
        storeId: cookie.storeId,
        // expirationDate: (new Date().getTime() / 1000) + 365 * 24 * 60 * 60 // 可选：设置一个很长的过期时间
      };
      
      // 如果原始 cookie 有过期时间，我们也保留
      if (cookie.expirationDate) {
           newCookie.expirationDate = cookie.expirationDate;
      }

      chrome.cookies.set(newCookie, (setCookie) => {
        if (!setCookie) {
          console.error(`[Cookie Master] 锁定失败: ${cookieName}`, chrome.runtime.lastError);
        } else {
          console.log(`[Cookie Master] 已锁定并恢复: ${cookieName} -> ${lockedValue}`);
        }
      });
    }
  }
}

// 【新的逻辑：处理扩展图标点击事件】
chrome.action.onClicked.addListener(async (tab) => {
    // 侧边栏 API 没有直接的 toggle 方法，需要通过查询当前状态来模拟开关
    const currentTabId = tab.id;

    // 尝试打开侧边栏。如果侧边栏已经打开，此操作通常会使其保持打开状态。
    // Side Panel 在 Chrome 116+ 支持 setPanelBehavior 来实现 "保持打开"
    try {
        await chrome.sidePanel.open({ tabId: currentTabId });
        console.log(`[Cookie Master] 侧边栏已打开。`);

        // 注意：目前 Chrome 扩展平台没有官方 API 来判断侧边栏是否“对这个标签页”是打开的。
        // 
        // 替代方案 (更简单且符合用户操作习惯):
        // 扩展图标点击后，侧边栏会固定在右侧。用户可以通过点击侧边栏的 X 或再次点击侧边栏图标
        // 来关闭它。对于 Side Panel 来说，默认的点击行为就是打开。

    } catch (error) {
        // 如果出现错误，可能当前标签页不支持 Side Panel（例如内部页面或 about:blank）
        console.error("[Cookie Master] 无法打开侧边栏:", error);
    }
});


// 注册监听器
chrome.cookies.onChanged.addListener(handleCookieChange);
// 【可选】设置默认的侧边栏可见性 (仅在 Chrome 116+ 有效)
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error("设置 Panel Behavior 失败:", error));
