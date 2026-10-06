// GLB 2.0 stores total length in uint32 and aligns chunks to four bytes.
// GLB 文件总长度为 uint32，且块按四字节对齐；不再额外限制为 1 GiB。
export const MAX_GLB_BYTES = 0xfffffffc;
export const MAX_GLB_JSON_BYTES = 32 * 1024 ** 2;
export const MAX_SVG_BYTES = 2 * 1024 ** 2;
