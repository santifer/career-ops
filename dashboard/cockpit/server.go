package main

import (
	"context"
	"embed"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	cockpitapi "github.com/santifer/career-ops/dashboard/internal/cockpit"
)

//go:embed static/index.html static/styles.css static/app.js static/favicon.svg
var staticFiles embed.FS

type ServerOptions struct {
	AuthVerifier cockpitapi.AuthVerifier
	RuntimeStore cockpitapi.AutoModeRuntimeStore
	Pairing      *cockpitapi.PairingService
}

func NewServer(rootPath string) http.Handler {
	return NewServerWithOptions(rootPath, ServerOptions{
		AuthVerifier: cockpitapi.NewAuthVerifierFromEnv(context.Background()),
	})
}

func NewServerWithOptions(rootPath string, options ServerOptions) http.Handler {
	mux := http.NewServeMux()
	cleanRoot := filepath.Clean(rootPath)
	service, serviceErr := cockpitapi.NewService(cleanRoot)
	runStore, runStoreErr := cockpitapi.NewRunStore(cleanRoot)
	actionRunner, actionRunnerErr := cockpitapi.NewActionRunner(cleanRoot, runStore)
	autoModeService, autoModeErr := cockpitapi.NewAutoModeService(runStore)
	runtimeStore := options.RuntimeStore
	var runtimeStoreErr error
	if runtimeStore == nil {
		runtimeStore, runtimeStoreErr = cockpitapi.NewRuntimeStoreFromEnv(context.Background())
		if runtimeStore == nil && runtimeStoreErr != nil {
			runtimeStore = cockpitapi.NewFailingRuntimeStore(runtimeStoreErr)
		}
	}
	pairing := options.Pairing
	var pairingErr error
	if pairing == nil {
		pairingStore, err := cockpitapi.NewPairingStoreFromEnv(context.Background())
		if err != nil {
			pairingErr = err
			pairingStore = cockpitapi.NewFailingPairingStore(err)
		}
		pairing = cockpitapi.NewPairingService(pairingStore, cockpitapi.PairingConfig{})
	}
	if serviceErr == nil && runStoreErr != nil {
		serviceErr = runStoreErr
	}
	if serviceErr == nil && actionRunnerErr != nil {
		serviceErr = actionRunnerErr
	}
	if serviceErr == nil && autoModeErr != nil {
		serviceErr = autoModeErr
	}
	if serviceErr == nil && runtimeStoreErr != nil {
		serviceErr = runtimeStoreErr
	}
	if serviceErr == nil && pairingErr != nil {
		serviceErr = pairingErr
	}

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}
		serveEmbeddedFile(w, r, "static/index.html", "text/html; charset=utf-8")
	})

	mux.HandleFunc("/favicon.ico", func(w http.ResponseWriter, r *http.Request) {
		serveEmbeddedFile(w, r, "static/favicon.svg", "image/svg+xml; charset=utf-8")
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

	registerAPIHandlers(mux, service, serviceErr, runStore, actionRunner, autoModeService, options.AuthVerifier, runtimeStore, pairing)

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
