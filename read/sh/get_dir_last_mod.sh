#!/bin/bash

# BOMB SCRIPT FOR UNDEFINED VAR OR ERR DURING EXECUTION
set -ue
cd "$1"
echo | ls -l | grep -w "$2"