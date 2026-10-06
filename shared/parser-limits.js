// A batch can queue many files, but must not keep many Go heaps and cache
// serialization workers alive at once. 输入数量不限制，桌面最多两份同时运行。
export const MAX_DESKTOP_PARSERS = 2;
