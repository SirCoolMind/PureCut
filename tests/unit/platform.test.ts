import { describe, it, expect } from 'vitest'
import { isAppleWebKit } from '../../src/core/platform'

const nav = (userAgent: string, vendor: string, platform = '', maxTouchPoints = 0) =>
  ({ userAgent, vendor, platform, maxTouchPoints }) as Navigator

describe('isAppleWebKit', () => {
  it('flags iPhone Safari', () => {
    expect(isAppleWebKit(nav('Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1', 'Apple Computer, Inc.', 'iPhone', 5))).toBe(true)
  })
  it('flags Chrome on iOS (still WebKit)', () => {
    expect(isAppleWebKit(nav('Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/140.0 Mobile/15E148 Safari/604.1', 'Apple Computer, Inc.', 'iPhone', 5))).toBe(true)
  })
  it('flags iPadOS desktop-mode Safari', () => {
    expect(isAppleWebKit(nav('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/26.0 Safari/605.1.15', 'Apple Computer, Inc.', 'MacIntel', 5))).toBe(true)
  })
  it('leaves desktop Chrome and Android alone', () => {
    expect(isAppleWebKit(nav('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36', 'Google Inc.', 'Win32'))).toBe(false)
    expect(isAppleWebKit(nav('Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36', 'Google Inc.', 'Linux armv8l', 5))).toBe(false)
  })
})
