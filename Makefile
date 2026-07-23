PROJECT_DIR := $(HOME)/projects/commander
VENV        := $(PROJECT_DIR)/.venv
PY          := $(VENV)/bin/python
PIP         := $(VENV)/bin/pip
BIN         := $(HOME)/bin/commander

.PHONY: help install venv deps shim uninstall clean test smoke

help:
	@echo "make install    — create venv, install deps, install shim to ~/bin/commander"
	@echo "make venv       — create the venv only"
	@echo "make deps       — (re)install python deps into venv"
	@echo "make shim       — (re)write the ~/bin/commander shim"
	@echo "make smoke      — run a non-destructive smoke test"
	@echo "make uninstall  — remove ~/bin/commander (leaves venv + registry)"
	@echo "make clean      — remove venv"

install: venv deps shim
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
	@mkdir -p $(HOME)/bin
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
