@echo off
title Pip chess coach
cd /d "%~dp0"
if not exist node_modules call npm install --no-audit --no-fund
if not exist client\public\puzzles call npm run data
call npm run build
call npx vite preview --port 3517 --open
