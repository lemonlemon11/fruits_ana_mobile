const API_ROOT = '/api'

export class ApiError extends Error {
  constructor(message, status = 0, detail = '') {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

function buildQuery(params = {}) {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    if (Array.isArray(value)) {
      value.forEach((item) => search.append(key, item))
    } else {
      search.set(key, String(value))
    }
  })
  const query = search.toString()
  return query ? `?${query}` : ''
}

export async function request(path, options = {}) {
  const { query, body, method = 'GET', signal } = options
  const response = await fetch(`${API_ROOT}${path}${buildQuery(query)}`, {
    method,
    credentials: 'include',
    signal,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  if (response.status === 204) return null

  let payload = null
  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    payload = await response.json()
  } else {
    payload = await response.text()
  }

  if (!response.ok) {
    const detail =
      typeof payload === 'object' && payload !== null && payload.detail
        ? payload.detail
        : typeof payload === 'string'
          ? payload
          : '请求失败'
    if (response.status === 401 && !path.startsWith('/auth/')) {
      window.dispatchEvent(new Event('api:unauthorized'))
    }
    throw new ApiError(detail, response.status, detail)
  }

  return payload
}

export const api = {
  login: (payload) =>
    request('/auth/login', {
      method: 'POST',
      body: {
        display_name: payload.displayName,
        password: payload.password,
        remember_me: Boolean(payload.rememberMe),
      },
    }),
  me: () => request('/auth/me'),
  logout: () => request('/auth/logout', { method: 'POST' }),
  forgotPasswordSendCode: (email) =>
    request('/auth/forgot-password/send-code', {
      method: 'POST',
      body: { email },
    }),
  forgotPasswordVerifyCode: (payload = {}) =>
    request('/auth/forgot-password/verify-code', {
      method: 'POST',
      body: {
        email: payload.email,
        verification_code: payload.code,
      },
    }),
  forgotPasswordReset: (payload = {}) =>
    request('/auth/forgot-password/reset', {
      method: 'POST',
      body: {
        email: payload.email,
        reset_token: payload.resetToken,
        password: payload.password,
      },
    }),
  notifications: (filters = {}) =>
    request('/notifications', {
      query: {
        unread_only: filters.unreadOnly,
        limit: filters.limit,
      },
    }),
  notificationUnreadCount: () => request('/notifications/unread-count'),
  readNotification: (id) => request(`/notifications/${id}/read`, { method: 'POST' }),
  readAllNotifications: () => request('/notifications/read-all', { method: 'POST' }),
  overview: (filters = {}) =>
    request('/analytics/overview', {
      query: {
        start_date: filters.startDate,
        end_date: filters.endDate,
        merchant_no: filters.merchantNo,
        brand: filters.brand,
        country: filters.country,
        market: filters.market,
      },
    }),
  trend: (filters = {}) =>
    request('/analytics/trend', {
      query: {
        start_date: filters.startDate,
        end_date: filters.endDate,
        merchant_no: filters.merchantNo,
        brand: filters.brand,
        country: filters.country,
        market: filters.market,
      },
    }),
  filterOptions: (filters = {}) =>
    request('/analytics/filter-options', {
      query: {
        start_date: filters.startDate,
        end_date: filters.endDate,
        merchant_no: filters.merchantNo,
      },
    }),
  gradeBreakdown: (filters = {}) =>
    request('/analytics/grade-breakdown', {
      query: {
        start_date: filters.startDate,
        end_date: filters.endDate,
        merchant_no: filters.merchantNo,
        brand: filters.brand,
        country: filters.country,
        market: filters.market,
        // 首页只用等级汇总与市场柜数，省略逐条明细（响应 150KB+ → ~2KB）。
        include_records: filters.includeRecords === false ? false : undefined,
      },
    }),
  gradeSpecBreakdown: (filters = {}) =>
    request('/analytics/grade-spec-breakdown', {
      query: {
        start_date: filters.startDate,
        end_date: filters.endDate,
        merchant_no: filters.merchantNo,
        brand: filters.brand,
        country: filters.country,
        market: filters.market,
      },
    }),
  settlementComparison: (filters = {}) =>
    request('/analytics/settlement-comparison', {
      query: {
        start_date: filters.startDate,
        end_date: filters.endDate,
        merchant_no: filters.merchantNo,
        include_all_settlements: filters.includeAllSettlements,
      },
    }),
  settlementDetail: (merchantNo, filters = {}) =>
    request(`/analytics/settlements/${encodeURIComponent(merchantNo)}`, {
      query: {
        start_date: filters.startDate,
        end_date: filters.endDate,
      },
    }),
  settlementAnalysis: (merchantNo, filters = {}) =>
    request(`/analytics/settlements/${encodeURIComponent(merchantNo)}/analysis`, {
      method: 'POST',
      body: {
        start_date: filters.startDate ?? null,
        end_date: filters.endDate ?? null,
        refresh: false,
      },
    }),
  settlements: (filters = {}) =>
    request('/settlements', {
      query: {
        start_date: filters.startDate,
        end_date: filters.endDate,
        merchant_no: filters.merchantNo,
        brand: filters.brand,
        keyword: filters.keyword,
        page: filters.page,
        page_size: filters.pageSize,
        sort_by: filters.sortBy,
        sort_order: filters.sortOrder,
      },
    }),
  settlementReview: (merchantNo) =>
    request(`/settlements/${encodeURIComponent(merchantNo)}/review`),
  seriesComparison: (merchantNos, filters = {}) =>
    request('/analytics/series-comparison', {
      query: {
        merchant_no: merchantNos,
        start_date: filters.startDate,
        end_date: filters.endDate,
      },
    }),
  seriesAnalysis: (merchantNos, filters = {}) =>
    request('/analytics/series-comparison/analysis', {
      method: 'POST',
      body: {
        merchant_no: merchantNos,
        start_date: filters.startDate,
        end_date: filters.endDate,
        refresh: false,
      },
    }),
  gradeDetailAnalysis: (merchantNos, filters = {}) =>
    request('/analytics/grade-detail/analysis', {
      method: 'POST',
      body: {
        merchant_no: merchantNos,
        start_date: filters.startDate,
        end_date: filters.endDate,
        refresh: false,
      },
    }),
}
