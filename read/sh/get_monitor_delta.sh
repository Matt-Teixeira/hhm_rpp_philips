#!/bin/bash

# BOMB SCRIPT FOR UNDEFINED VAR OR ERR DURING EXECUTION
set -ue

 # VARIABLE $1 IS DATE TIME (EX: 2023-01-03 15:44:51), FROM REDIS AS LAST LINE PARSED
 # VARIABLE $2 IS FILE PATH
echo | awk '/'"$1"'/{y=1;next}y' ''"$2"''

echo | awk '/'"2023-04-29\t02:10:48"'/{y=1;next}y' ''"$2"''