package storage

// Windows does not support fsync on directory handles through os.File.
func syncDirectory(path string) error { return nil }
