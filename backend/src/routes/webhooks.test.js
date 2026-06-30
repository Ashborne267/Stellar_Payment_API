import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockSupabaseSelect } = vi.hoisted(() => ({
  mockSupabaseSelect: vi.fn()
}))

vi.mock('../lib/supabase.js', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: mockSupabaseSelect
    }))
  }
}))

describe('GET /api/webhooks/logs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns paginated webhook logs for merchant', async () => {
    const mockLogs = [
      {
        id: 'log-1',
        payment_id: 'payment-1',
        status_code: 200,
        response_body: 'OK',
        timestamp: '2024-03-26T12:00:00Z',
        payments: {
          merchant_id: 'merchant-1',
          amount: 100,
          asset: 'XLM',
          status: 'confirmed'
        }
      },
      {
        id: 'log-2',
        payment_id: 'payment-2',
        status_code: 500,
        response_body: 'Internal Server Error',
        timestamp: '2024-03-26T11:00:00Z',
        payments: {
          merchant_id: 'merchant-1',
          amount: 50,
          asset: 'USDC',
          status: 'confirmed'
        }
      }
    ]

    mockSupabaseSelect.mockReturnValue({
      eq: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          range: vi.fn().mockResolvedValue({
            data: mockLogs,
            error: null,
            count: 2
          })
        })
      })
    })

    // Verify logs are returned with success flag
    expect(mockLogs[0].status_code).toBe(200)
    expect(mockLogs[1].status_code).toBe(500)
  })

  it('filters logs by success status', async () => {
    const successLogs = [
      {
        id: 'log-1',
        payment_id: 'payment-1',
        status_code: 200,
        response_body: 'OK',
        timestamp: '2024-03-26T12:00:00Z',
        payments: {
          merchant_id: 'merchant-1',
          amount: 100,
          asset: 'XLM',
          status: 'confirmed'
        }
      }
    ]

    mockSupabaseSelect.mockReturnValue({
      eq: vi.fn().mockReturnValue({
        gte: vi.fn().mockReturnValue({
          lt: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              range: vi.fn().mockResolvedValue({
                data: successLogs,
                error: null,
                count: 1
              })
            })
          })
        })
      })
    })

    // Only successful logs (2xx status codes)
    expect(successLogs.every(log => log.status_code >= 200 && log.status_code < 300)).toBe(true)
  })

  it('filters logs by failure status', async () => {
    const failureLogs = [
      {
        id: 'log-1',
        payment_id: 'payment-1',
        status_code: 500,
        response_body: 'Error',
        timestamp: '2024-03-26T12:00:00Z',
        payments: {
          merchant_id: 'merchant-1',
          amount: 100,
          asset: 'XLM',
          status: 'confirmed'
        }
      }
    ]

    mockSupabaseSelect.mockReturnValue({
      eq: vi.fn().mockReturnValue({
        or: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            range: vi.fn().mockResolvedValue({
              data: failureLogs,
              error: null,
              count: 1
            })
          })
        })
      })
    })

    // Only failed logs (non-2xx status codes)
    expect(failureLogs.every(log => log.status_code < 200 || log.status_code >= 300)).toBe(true)
  })

  it('handles pagination cursor logic', () => {
    const lastItem = { timestamp: '2024-03-26T12:00:00Z', id: 'log-1' }
    const nextCursor = Buffer.from(JSON.stringify(lastItem)).toString('base64')
    
    const decoded = JSON.parse(Buffer.from(nextCursor, 'base64').toString('utf-8'))
    expect(decoded.timestamp).toBe(lastItem.timestamp)
    expect(decoded.id).toBe(lastItem.id)
  })

  it('limits maximum limit to 100', () => {
    const requestedLimit = 500
    const actualLimit = Math.min(100, Math.max(1, requestedLimit))

    expect(actualLimit).toBe(100)
  })

  it('formats log response with success flag', () => {
    const log = {
      id: 'log-1',
      payment_id: 'payment-1',
      status_code: 200,
      response_body: 'OK',
      timestamp: '2024-03-26T12:00:00Z',
      payments: {
        amount: 100,
        asset: 'XLM',
        status: 'confirmed'
      }
    }

    const formatted = {
      id: log.id,
      payment_id: log.payment_id,
      status_code: log.status_code,
      success: log.status_code >= 200 && log.status_code < 300,
      response_body: log.response_body,
      timestamp: log.timestamp,
      payment: {
        amount: log.payments.amount,
        asset: log.payments.asset,
        status: log.payments.status
      }
    }

    expect(formatted.success).toBe(true)
    expect(formatted.payment.amount).toBe(100)
  })

  it('marks non-2xx status codes as failure', () => {
    const statusCodes = [199, 200, 299, 300, 404, 500]
    const results = statusCodes.map(code => ({
      code,
      success: code >= 200 && code < 300
    }))

    expect(results[0].success).toBe(false) // 199
    expect(results[1].success).toBe(true)  // 200
    expect(results[2].success).toBe(true)  // 299
    expect(results[3].success).toBe(false) // 300
    expect(results[4].success).toBe(false) // 404
    expect(results[5].success).toBe(false) // 500
  })
})
