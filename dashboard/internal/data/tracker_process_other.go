//go:build !aix && !darwin && !dragonfly && !freebsd && !linux && !netbsd && !openbsd && !solaris && !windows

package data

// Unknown platforms conservatively keep PID-owned locks until manual cleanup.
func processAlive(pid int) bool {
	return pid > 0
}
