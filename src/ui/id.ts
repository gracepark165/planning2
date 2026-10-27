/** 새 재료 id. crypto.randomUUID는 http(휴대폰에서 내부망 주소로 열 때)에서 없을 수 있어 대체한다. */
export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' && globalThis.isSecureContext) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
