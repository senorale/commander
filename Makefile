PROJECT_DIR := $(HOME)/projects/commander
BIN_DIR     := $(HOME)/.local/bin
BIN         := $(BIN_DIR)/commander

.PHONY: help install build shim uninstall smoke check-iterm

help:
	@echo "make install    — build TS + install shim to ~/.local/bin/commander"
	@echo "make build      — npm install + tsc build"
	@echo "make shim       — (re)write the ~/.local/bin/commander shim"
	@echo "make smoke      — run a non-destructive smoke test"
	@echo "make uninstall  — remove ~/.local/bin/commander"

install: check-iterm build shim
	@echo ""
	@echo "commander installed. Try:"
	@echo "  commander status"
	@echo "  commander view"

check-iterm:
	@if [ "$$TERM_PROGRAM" != "iTerm.app" ]; then \
		printf '\033[33mwarning:\033[0m iTerm2 not detected (TERM_PROGRAM=%s). commander uses AppleScript against iTerm2 for tab focus + buffer capture; features will degrade elsewhere. Install: brew install --cask iterm2\n' "$${TERM_PROGRAM:-unset}"; \
	fi

build:
	@npm install --silent
	@npm run build --silent

shim:
	@mkdir -p $(BIN_DIR)
	@printf '%s\n' \
		'#!/usr/bin/env bash' \
		'# commander shim — runs `node dist/cli.js` from ~/projects/commander' \
		'exec node "$$HOME/projects/commander/dist/cli.js" "$$@"' \
		> $(BIN)
	@chmod +x $(BIN)
	@echo "installed shim: $(BIN)"

smoke:
	@$(BIN) --version
	@$(BIN) status

uninstall:
	rm -f $(BIN)
