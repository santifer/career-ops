package main

import (
	"embed"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	cockpitapi "github.com/santifer/career-ops/dashboard/internal/cockpit"
)

//go:embed static/index.html static/styles.css static/app.js
var staticFiles embed.FS

func NewServer(rootPath string) http.Handler {
	mux := http.NewServeMux()
	cleanRoot := filepath.Clean(rootPath)
	service, serviceErr := cockpitapi.NewService(cleanRoot)
	runStore, runStoreErr := cockpitapi.NewRunStore(cleanRoot)
	actionRunner, actionRunnerErr := cockpitapi.NewActionRunner(cleanRoot, runStore)
	autoModeService, autoModeErr := cockpitapi.NewAutoModeService(runStore)
	if serviceErr == nil && runStoreErr != nil {
		serviceErr = runStoreErr
	}
	if serviceErr == nil && actionRunnerErr != nil {
		serviceErr = actionRunnerErr
	}
	if serviceErr == nil && autoModeErr != nil {
		serviceErr = autoModeErr
	}

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}
		serveEmbeddedFile(w, r, "static/index.html", "text/html; charset=utf-8")
	})

	mux.HandleFunc("/static/styles.css", func(w http.ResponseWriter, r *http.Request) {
		serveEmbeddedFile(w, r, "static/styles.css", "text/css; charset=utf-8")
	})

	mux.HandleFunc("/static/app.js", func(w http.ResponseWriter, r *http.Request) {
		serveEmbeddedFile(w, r, "static/app.js", "text/javascript; charset=utf-8")
	})

	mux.HandleFunc("/reports/", func(w http.ResponseWriter, r *http.Request) {
		serveRootFile(w, r, cleanRoot, "reports")
	})

	mux.HandleFunc("/output/", func(w http.ResponseWriter, r *http.Request) {
		serveRootFile(w, r, cleanRoot, "output")
	})

	mux.HandleFunc("/api/health", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			writeJSONError(w, http.StatusMethodNotAllowed, "method_not_allowed", "Method not allowed.")
			return
		}
		if serviceErr != nil {
			writeJSONError(w, http.StatusInternalServerError, "service_unavailable", serviceErr.Error())
			return
		}
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_ = json.NewEncoder(w).Encode(service.Health())
	})

	registerAPIHandlers(mux, service, serviceErr, runStore, actionRunner, autoModeService)

	return mux
}

func serveEmbeddedFile(w http.ResponseWriter, r *http.Request, name string, contentType string) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	data, err := staticFiles.ReadFile(name)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Cache-Control", "no-store")
	_, _ = w.Write(data)
}

func serveRootFile(w http.ResponseWriter, r *http.Request, root string, dir string) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	prefix := "/" + strings.Trim(dir, "/") + "/"
	relative := strings.TrimPrefix(r.URL.Path, prefix)
	cleanRelative := filepath.Clean(relative)
	if cleanRelative == "." || cleanRelative == ".." || filepath.IsAbs(cleanRelative) || strings.HasPrefix(cleanRelative, ".."+string(filepath.Separator)) {
		http.NotFound(w, r)
		return
	}

	base := filepath.Join(root, dir)
	fullPath := filepath.Join(base, cleanRelative)
	info, err := os.Stat(fullPath)
	if err != nil || info.IsDir() {
		http.NotFound(w, r)
		return
	}

	if strings.EqualFold(filepath.Ext(fullPath), ".md") {
		data, err := os.ReadFile(fullPath)
		if err != nil {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "text/markdown; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		_, _ = w.Write(data)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	http.ServeFile(w, r, fullPath)
}
