export class DemoFormatError extends Error {
  constructor(code, message, details = {}) {
    super(message); this.name = 'DemoFormatError'; this.code = code; this.details = details;
  }
}
export const requireFormat = (condition, code, message, details) => {
  if (!condition) throw new DemoFormatError(code, message, details);
};
