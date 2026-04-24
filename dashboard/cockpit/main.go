package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
)

func main() {
	rootPath := flag.String("path", "..", "Career Ops repository root path")
	host := flag.String("host", defaultHost(), "HTTP server host")
	port := flag.Int("port", defaultPort(), "HTTP server port")
	flag.Parse()

	addr := fmt.Sprintf("%s:%d", *host, *port)
	log.Printf("career-ops cockpit listening on http://%s", addr)
	if err := http.ListenAndServe(addr, NewServer(*rootPath)); err != nil {
		log.Fatal(err)
	}
}

func defaultHost() string {
	if os.Getenv("PORT") != "" || os.Getenv("K_SERVICE") != "" {
		return "0.0.0.0"
	}
	return "127.0.0.1"
}

func defaultPort() int {
	port := os.Getenv("PORT")
	if port == "" {
		return 8080
	}
	parsed, err := strconv.Atoi(port)
	if err != nil || parsed <= 0 || parsed > 65535 {
		return 8080
	}
	return parsed
}
