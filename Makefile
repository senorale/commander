PROJECT_DIR := $(HOME)/projects/commander
VENV        := $(PROJECT_DIR)/.venv
PY          := $(VENV)/bin/python
PIP         := $(VENV)/bin/pip
BIN_DIR     := $(HOME)/.local/bin
BIN         := $(BIN_DIR)/commander
NEXT_BIN    := $(BIN_DIR)/commander-next

.PHONY: help install venv deps shim uninstall clean test smoke check-iterm \
        dev-install dev-build dev-shim dev-uninstall

help:
	@echo "make install    — create venv, install deps, install shim to ~/.local/bin/commander"
	@echo "make venv       — create the venv only"
	@echo "make deps       — (re)install python deps into venv"
	@echo "make shim       — (re)write the ~/.local/bin/commander shim"
	@echo "make smoke      — run a non-destructive smoke test"
	@echo "make uninstall  — remove ~/.local/bin/commander (leaves venv + registry)"
	@echo "make clean      — remove venv"

install: check-iterm venv deps shim

check-iterm:
	@if [ "$$TERM_PROGRAM" != "iTerm.app" ]; then \
		printf '\033[33mwarning:\033[0m iTerm2 not detected (TERM_PROGRAM=%s). commander uses AppleScript against iTerm2 for tab focus + buffer capture; features will degrade elsewhere. Install: brew install --cask iterm2\n' "$${TERM_PROGRAM:-unset}"; \
	fi
	@echo ""
	@echo "commander installed. Try:"
	@echo "  commander status"
	@echo "  commander view"

venv: $(VENV)/bin/python
$(VENV)/bin/python:
	python3 -m venv $(VENV)

deps: venv
	$(PIP) install --quiet --upgrade pip
	$(PIP) install --quiet textual

shim:
	@mkdir -p $(BIN_DIR)
	@printf '%s\n' \
		'#!/usr/bin/env bash' \
		'# Commander shim — invokes the Python package at ~/projects/commander' \
		'export PYTHONPATH="$$HOME/projects/commander:$${PYTHONPATH:-}"' \
		'PY="$$HOME/projects/commander/.venv/bin/python"' \
		'[ -x "$$PY" ] || PY="python3"' \
		'exec "$$PY" -m commander.cli "$$@"' \
		> $(BIN)
	@chmod +x $(BIN)
	@echo "installed shim: $(BIN)"

smoke:
	@$(BIN) --version
	@$(BIN) status

uninstall:
	rm -f $(BIN)

clean:
	rm -rf $(VENV)

# ------------------------------------------------------------------
# Ink/TS rewrite (branch `ink-rewrite`) — parallel `commander-next`
# ------------------------------------------------------------------

dev-install: dev-build dev-shim
	@echo ""
	@echo "commander-next installed. Try:"
	@echo "  commander-next status"
	@echo "  commander-next view"

dev-build:
	@npm install --silent
	@npm run build --silent

dev-shim:
	@mkdir -p $(BIN_DIR)
	@printf '%s\n' \
		'#!/usr/bin/env bash' \
		'# commander-next — Ink/TS rewrite (runs alongside python `commander`)' \
		'exec node "$$HOME/projects/commander/dist/cli.js" "$$@"' \
		> $(NEXT_BIN)
	@chmod +x $(NEXT_BIN)
	@echo "installed shim: $(NEXT_BIN)"

dev-uninstall:
	rm -f $(NEXT_BIN)
