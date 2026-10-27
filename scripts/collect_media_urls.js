// 收集当前空间所有图片 URL，用于排查黑图。
//
// 用法：
//   1. 浏览器打开 http://localhost:5180/ 并用**线上账号**登录（配了 DEV_API_TARGET 时即线上数据）
//   2. 打开开发者工具 Console，整体粘贴本文件内容，回车
//   3. 结果会打印成一行一个 URL，并自动复制到剪贴板
//   4. 把内容存成 urls.txt，然后：
//        backend/.venv/bin/python scripts/check_image.py --file urls.txt
//
// 说明：同源请求（走 Vite 代理），不需要处理 CORS。
// 只做 GET，不会修改任何数据。
(async () => {
  const token = localStorage.getItem('claner.access')
  if (!token) {
    console.error('没有找到登录 token，请先登录。')
    return
  }
  const auth = { Authorization: `Bearer ${token}` }
  const get = async (path) => {
    const res = await fetch(path, { headers: auth })
    if (!res.ok) throw new Error(`${res.status} ${path}`)
    return res.json()
  }

  const workspaces = await get('/api/workspaces/')
  const rows = []

  for (const ws of workspaces) {
    let page = 1
    while (page <= 200) {
      const data = await get(
        `/api/workspaces/${ws.id}/media/?media_type=image&page=${page}&page_size=100`,
      )
      const items = data.results ?? []
      for (const m of items) {
        // 优先原图：黑图是原图本身就黑，必须查原图而不是缩略图
        const url = m.file_url || m.thumbnail_url
        if (!url) continue
        rows.push({
          workspace: ws.id,
          workspace_name: ws.name,
          record_id: m.record_id,
          media_id: m.id,
          width: m.width,
          height: m.height,
          object_key: m.object_key,
          url,
          thumbnail_url: m.thumbnail_url,
        })
      }
      if (!data.next || items.length === 0) break
      page += 1
    }
  }

  const urls = [...new Set(rows.map((r) => r.url))]
  console.log(`\n共 ${rows.length} 张图片（去重 ${urls.length} 个 URL）\n`)
  console.log(urls.join('\n'))

  const details = JSON.stringify(rows, null, 1)
  try {
    await navigator.clipboard.writeText(urls.join('\n'))
    console.log('\n✓ URL 列表已复制到剪贴板（一行一个）')
    console.log('  明细（含尺寸/record_id）见 window.__clanerMedia')
  } catch {
    console.warn('剪贴板不可用，请手动复制上面的列表')
  }
  window.__clanerMedia = JSON.parse(details)
  if (typeof copy === 'function') copy(details) // Chrome 控制台便捷函数
})()
